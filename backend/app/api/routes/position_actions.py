from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from datetime import datetime

from app.core.supabase import get_supabase
from app.core.auth import get_current_user

router = APIRouter(prefix="/position-actions", tags=["position-actions"])


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

    Duplicate prevention: if there is already a pending action of the same
    action_type for this position, the existing action is returned instead of
    creating a new one.

    Payload:
        position_id: str        (UUID)
        action_type: str        (raise_stop | move_stop_to_breakeven | take_partial
                                 | reduce_position | close_full | hold)
        old_stop_loss: float    (optional)
        new_stop_loss: float    (optional)
        sell_percent: float     (optional, 0-100)
        sell_quantity: float    (optional)
        reason: str             (optional)
        target_value: float     (optional, legacy)
        description: str        (optional, legacy)
    """
    sb = get_supabase()

    position_id = data.get("position_id")
    action_type = data.get("action_type")

    if not position_id or not action_type:
        raise HTTPException(status_code=400, detail="position_id and action_type are required")

    # Verify position exists and is open/reduced
    pos_result = (
        sb.table("positions")
        .select("id, status")
        .eq("id", position_id)
        .single()
        .execute()
    )
    if not pos_result.data:
        raise HTTPException(status_code=404, detail="Position not found")
    if pos_result.data["status"] not in ("open", "reduced"):
        raise HTTPException(status_code=400, detail="Position is not open or reduced")

    # Duplicate check: return existing pending action of same type
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
    """Update action execution state (acknowledged / executed / dismissed)."""
    sb = get_supabase()

    update_data = {}
    if "execution_state" in data:
        update_data["execution_state"] = data["execution_state"]
        if data["execution_state"] == "executed":
            update_data["executed_at"] = datetime.utcnow().isoformat()

    if not update_data:
        raise HTTPException(status_code=400, detail="No valid fields to update")

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
