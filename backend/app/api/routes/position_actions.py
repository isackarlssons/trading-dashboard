from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from datetime import datetime

from app.core.supabase import get_supabase
from app.core.auth import get_current_user

router = APIRouter(prefix="/position-actions", tags=["position-actions"])

# States that must never trigger trading side-effects
_NO_SIDE_EFFECT_STATES = {"acknowledged", "dismissed", "expired"}

# States that trigger stop-loss updates on the position
_STOP_TYPES = {"raise_stop", "move_stop_to_breakeven"}


@router.get("/by-position/{position_id}")
async def list_actions_for_position(
    position_id: str,
    state: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    """List management actions for a specific position."""
    sb = get_supabase()
    query = (
        sb.table("position_actions")
        .select("*")
        .eq("position_id", position_id)
        .order("created_at", desc=True)
    )
    if state:
        query = query.eq("execution_state", state)
    result = query.execute()
    return result.data


@router.get("/pending")
async def list_pending_actions(
    user: dict = Depends(get_current_user),
):
    """List all pending management actions across all positions."""
    sb = get_supabase()
    result = (
        sb.table("position_actions")
        .select("*, positions(ticker, direction, status)")
        .eq("execution_state", "pending")
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


@router.post("/", status_code=201)
async def create_action(
    data: dict,
    user: dict = Depends(get_current_user),
):
    """Create a new position management action (typically sent by the bot).

    Duplicate prevention:
    - Stop actions (raise_stop / move_stop_to_breakeven): if a pending stop
      already exists, compare targets. Keep the more protective one; dismiss
      the weaker one.
    - All other action types: if a pending action of the same type exists,
      return it unchanged.

    Payload:
        position_id: str        (UUID)
        action_type: str        (raise_stop | move_stop_to_breakeven | take_partial
                                 | reduce_position | close_full | hold)
        old_stop_loss: float    (optional)
        new_stop_loss: float    (optional)
        sell_percent: float     (optional, 0–100)
        sell_quantity: float    (optional)
        reason: str             (optional)
        expires_at: str         (optional ISO timestamp)
    """
    sb = get_supabase()

    position_id = data.get("position_id")
    action_type = data.get("action_type")

    if not position_id or not action_type:
        raise HTTPException(status_code=400, detail="position_id and action_type are required")

    # Verify position exists and is open/reduced; fetch direction for stop comparisons
    pos_result = (
        sb.table("positions")
        .select("id, status, direction")
        .eq("id", position_id)
        .single()
        .execute()
    )
    if not pos_result.data:
        raise HTTPException(status_code=404, detail="Position not found")
    if pos_result.data["status"] not in ("open", "reduced"):
        raise HTTPException(status_code=400, detail="Position is not open or reduced")

    direction = pos_result.data["direction"]
    now = datetime.utcnow().isoformat()

    if action_type in _STOP_TYPES:
        new_stop = data.get("new_stop_loss")

        existing_stops = (
            sb.table("position_actions")
            .select("*")
            .eq("position_id", position_id)
            .in_("action_type", list(_STOP_TYPES))
            .eq("execution_state", "pending")
            .execute()
        ).data or []

        for existing in existing_stops:
            old_stop = existing.get("new_stop_loss")

            if old_stop is None or new_stop is None:
                return existing

            if direction == "long":
                if abs(new_stop - old_stop) < 0.001:
                    return existing          # same target — true duplicate
                elif new_stop > old_stop:
                    # New is more protective — dismiss the weaker pending stop
                    sb.table("position_actions").update({
                        "execution_state": "dismissed",
                        "dismissed_at": now,
                        "dismissed_note": "Superseded by a more protective stop action",
                    }).eq("id", existing["id"]).execute()
                else:
                    return existing          # existing is already better
            else:  # short
                if abs(new_stop - old_stop) < 0.001:
                    return existing
                elif new_stop < old_stop:
                    sb.table("position_actions").update({
                        "execution_state": "dismissed",
                        "dismissed_at": now,
                        "dismissed_note": "Superseded by a more protective stop action",
                    }).eq("id", existing["id"]).execute()
                else:
                    return existing
    else:
        # Non-stop actions: simple same-type dedup
        existing = (
            sb.table("position_actions")
            .select("*")
            .eq("position_id", position_id)
            .eq("action_type", action_type)
            .eq("execution_state", "pending")
            .execute()
        )
        if existing.data:
            return existing.data[0]

    result = sb.table("position_actions").insert(data).execute()
    return result.data[0] if result.data else {}


@router.patch("/{action_id}")
async def update_action(
    action_id: str,
    data: dict,
    user: dict = Depends(get_current_user),
):
    """Update action execution state and optional metadata.

    Lifecycle transitions
    ─────────────────────
    pending      → acknowledged  Trader has seen / accepted the suggestion.
    acknowledged → executed      Trader confirms it was done at the broker.
                                 • Triggers stop-loss side-effects for stop actions.
                                 • Accepts: executed_price, execution_note
    pending /
    acknowledged → dismissed     Trader intentionally ignored / rejected it.
                                 • NO trading side-effects.
                                 • Accepts: dismissed_note
    any active   → expired       System or user marks the action no longer relevant.
                                 • NO trading side-effects.

    Only 'executed' triggers position updates.  All other transitions are
    purely administrative and safe.
    """
    sb = get_supabase()

    action_result = (
        sb.table("position_actions")
        .select("*")
        .eq("id", action_id)
        .single()
        .execute()
    )
    if not action_result.data:
        raise HTTPException(status_code=404, detail="Action not found")
    action = action_result.data

    new_state = data.get("execution_state")
    if not new_state:
        raise HTTPException(status_code=400, detail="execution_state is required")

    now = datetime.utcnow().isoformat()
    update_data: dict = {"execution_state": new_state}

    # ── acknowledged: purely administrative ──────────────────────────────────
    if new_state == "acknowledged":
        pass  # only state change; no side-effects, no timestamp column yet

    # ── executed: record metadata + trigger side-effects ─────────────────────
    elif new_state == "executed":
        update_data["executed_at"] = now

        if data.get("executed_price") is not None:
            update_data["executed_price"] = data["executed_price"]
        if data.get("execution_note"):
            update_data["execution_note"] = data["execution_note"]

        # Stop actions: auto-update position's current_stop_loss
        if action["action_type"] == "raise_stop" and action.get("new_stop_loss"):
            sb.table("positions").update({
                "current_stop_loss": action["new_stop_loss"],
                "stop_loss":         action["new_stop_loss"],
            }).eq("id", action["position_id"]).execute()

        elif action["action_type"] == "move_stop_to_breakeven":
            breakeven = action.get("new_stop_loss")
            if breakeven is None:
                pos_result = (
                    sb.table("positions")
                    .select("actual_entry_price, entry_price")
                    .eq("id", action["position_id"])
                    .single()
                    .execute()
                )
                if pos_result.data:
                    breakeven = (
                        pos_result.data.get("actual_entry_price")
                        or pos_result.data.get("entry_price")
                    )
            if breakeven:
                sb.table("positions").update({
                    "current_stop_loss": breakeven,
                    "stop_loss":         breakeven,
                }).eq("id", action["position_id"]).execute()

    # ── dismissed: record metadata, NO side-effects ───────────────────────────
    elif new_state == "dismissed":
        update_data["dismissed_at"] = now
        if data.get("dismissed_note"):
            update_data["dismissed_note"] = data["dismissed_note"]

    # ── expired: record timestamp, NO side-effects ────────────────────────────
    elif new_state == "expired":
        update_data["expired_at"] = now

    else:
        raise HTTPException(status_code=400, detail=f"Unknown execution_state: {new_state}")

    result = (
        sb.table("position_actions")
        .update(update_data)
        .eq("id", action_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Action not found")
    return result.data[0]


@router.delete("/{action_id}")
async def delete_action(
    action_id: str,
    user: dict = Depends(get_current_user),
):
    """Delete a position action."""
    sb = get_supabase()
    sb.table("position_actions").delete().eq("id", action_id).execute()
    return {"deleted": True}
