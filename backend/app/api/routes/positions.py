from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from datetime import datetime

import logging

from app.core.supabase import get_supabase
from app.core.auth import get_current_user
from app.services.market_data import get_price

log = logging.getLogger(__name__)

router = APIRouter(prefix="/positions", tags=["positions"])


@router.get("/")
async def list_positions(
    status: Optional[str] = Query(None),
    ticker: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: dict = Depends(get_current_user),
):
    """List positions with optional filters."""
    sb = get_supabase()
    query = sb.table("positions").select("*").order("opened_at", desc=True)

    if status:
        query = query.eq("status", status)
    if ticker:
        query = query.eq("ticker", ticker.upper())

    query = query.range(offset, offset + limit - 1)
    result = query.execute()
    return result.data


@router.get("/open")
async def list_open_positions(
    user: dict = Depends(get_current_user),
):
    """Get all currently open or reduced positions with pending actions."""
    sb = get_supabase()
    result = (
        sb.table("positions")
        .select("*, position_actions(*), partial_exits(*)")
        .in_("status", ["open", "reduced"])
        .order("opened_at", desc=True)
        .execute()
    )
    return result.data


@router.get("/risk-summary")
async def risk_summary(
    user: dict = Depends(get_current_user),
):
    """Portfolio risk summary for all open/reduced positions.

    Returns per-position risk-to-stop (always available from stored data) and
    unrealized PnL (requires live price via yfinance; null if unavailable).
    """
    sb = get_supabase()

    positions = (
        sb.table("positions")
        .select("*")
        .in_("status", ["open", "reduced"])
        .order("opened_at", desc=True)
        .execute()
    ).data or []

    # Live price fetch via shared helper — graceful fallback to null
    prices: dict = {}
    unique_tickers = list({p["ticker"] for p in positions})
    for ticker in unique_tickers:
        result = get_price(ticker)
        prices[ticker] = result.current_price
        log.info(
            "[risk-summary] %s: price=%r  fallback=%s  unavailable=%s  error=%s",
            ticker, result.current_price, result.fallback_used,
            result.price_unavailable, result.error,
        )

    per_position = []
    total_risk = 0.0
    total_unrealized_pnl = 0.0
    open_count = 0
    reduced_count = 0

    for pos in positions:
        if pos["status"] == "open":
            open_count += 1
        else:
            reduced_count += 1

        entry = pos.get("actual_entry_price") or pos.get("entry_price")
        sl = pos.get("current_stop_loss") or pos.get("stop_loss")
        qty = float(pos.get("remaining_quantity") or pos.get("quantity") or 0)
        direction = pos["direction"]
        current_price = prices.get(pos["ticker"])

        # Risk to stop — always computable from stored data
        risk_to_stop = None
        if entry and sl and qty:
            raw = (entry - sl) * qty if direction == "long" else (sl - entry) * qty
            risk_to_stop = round(max(0.0, raw), 2)
            total_risk += risk_to_stop

        # Unrealized PnL — needs live price
        unrealized_pnl = None
        if current_price and entry and qty:
            raw_pnl = (current_price - entry) * qty if direction == "long" else (entry - current_price) * qty
            unrealized_pnl = round(raw_pnl, 2)
            total_unrealized_pnl += unrealized_pnl

        per_position.append({
            "position_id": pos["id"],
            "ticker": pos["ticker"],
            "direction": direction,
            "status": pos["status"],
            "current_price": current_price,
            "current_stop_loss": sl,
            "actual_entry_price": entry,
            "remaining_quantity": qty,
            "unrealized_pnl": unrealized_pnl,
            "risk_to_stop": risk_to_stop,
            "price_unavailable": current_price is None,
        })

    return {
        "total_open_risk": round(total_risk, 2),
        "total_unrealized_pnl": round(total_unrealized_pnl, 2),
        "max_downside_to_stops": round(total_risk, 2),
        "open_positions_count": open_count,
        "reduced_positions_count": reduced_count,
        "per_position": per_position,
    }


@router.get("/{position_id}")
async def get_position(
    position_id: str,
    user: dict = Depends(get_current_user),
):
    """Get a specific position with actions and partial exits."""
    sb = get_supabase()
    result = (
        sb.table("positions")
        .select("*, position_actions(*), partial_exits(*)")
        .eq("id", position_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Position not found")
    return result.data


@router.post("/", status_code=201)
async def create_position(
    data: dict,
    user: dict = Depends(get_current_user),
):
    """Create a new position manually."""
    sb = get_supabase()
    if "ticker" in data:
        data["ticker"] = data["ticker"].upper()
    if data.get("quantity"):
        data.setdefault("original_quantity", data["quantity"])
        data.setdefault("remaining_quantity", data["quantity"])
    result = sb.table("positions").insert(data).execute()
    return result.data[0] if result.data else {}


@router.post("/from-signal", status_code=201)
async def create_position_from_signal(
    data: dict,
    user: dict = Depends(get_current_user),
):
    """Take a signal: create a position and mark signal as taken.

    Kept for backward compatibility. Prefer POST /signals/{id}/take.
    """
    sb = get_supabase()

    signal_result = (
        sb.table("signals")
        .select("*")
        .eq("id", data["signal_id"])
        .single()
        .execute()
    )
    signal = signal_result.data
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
    if signal["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Signal is already {signal['status']}")

    now = datetime.utcnow().isoformat()
    qty = data.get("quantity")
    actual_entry = data.get("entry_price")
    current_sl = data.get("stop_loss") or signal.get("stop_loss")

    position_data = {
        "signal_id": signal["id"],
        "ticker": signal["ticker"],
        "direction": signal["direction"],
        "market": signal.get("market"),
        # Legacy fields
        "entry_price": actual_entry,
        "stop_loss": current_sl,
        # New canonical fields
        "planned_entry_price": signal.get("entry_price"),
        "actual_entry_price": actual_entry,
        "current_stop_loss": current_sl,
        "take_profit": data.get("take_profit") or signal.get("take_profit"),
        "quantity": qty,
        "original_quantity": qty,
        "remaining_quantity": qty,
        "execution_type": signal.get("execution_type"),
        "execution_symbol": signal.get("execution_symbol"),
        "execution_isin": signal.get("execution_isin"),
        "instrument_price": signal.get("instrument_price"),
        "notes": data.get("notes"),
        "opened_at": now,
        "status": "open",
    }
    pos_result = sb.table("positions").insert(position_data).execute()

    sb.table("signals").update({
        "status": "taken",
        "taken_at": now,
    }).eq("id", signal["id"]).execute()

    return pos_result.data[0] if pos_result.data else {}


@router.patch("/{position_id}")
async def update_position(
    position_id: str,
    data: dict,
    user: dict = Depends(get_current_user),
):
    """Update a position (stop_loss, take_profit, notes, remaining_quantity)."""
    sb = get_supabase()

    allowed_fields = {
        "stop_loss", "current_stop_loss", "take_profit",
        "notes", "remaining_quantity", "quantity", "avg_entry_price",
    }
    update_data = {k: v for k, v in data.items() if k in allowed_fields}

    # Keep stop_loss and current_stop_loss in sync
    if "current_stop_loss" in update_data and "stop_loss" not in update_data:
        update_data["stop_loss"] = update_data["current_stop_loss"]
    elif "stop_loss" in update_data and "current_stop_loss" not in update_data:
        update_data["current_stop_loss"] = update_data["stop_loss"]

    if not update_data:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    result = (
        sb.table("positions")
        .update(update_data)
        .eq("id", position_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Position not found")
    return result.data[0]


@router.post("/{position_id}/partial-close")
async def partial_close_position(
    position_id: str,
    data: dict,
    user: dict = Depends(get_current_user),
):
    """Partially close a position: sell some quantity, keep the rest open.

    Payload:
        exit_price: float        (price at which you sold)
        quantity: float          (how many units sold)
        fees: float              (optional, default 0)
        notes: str               (optional)
        action_id: str           (optional UUID — the position_action that triggered this)
    """
    sb = get_supabase()

    pos_result = (
        sb.table("positions")
        .select("*")
        .eq("id", position_id)
        .single()
        .execute()
    )
    position = pos_result.data
    if not position:
        raise HTTPException(status_code=404, detail="Position not found")
    if position["status"] not in ("open", "reduced"):
        raise HTTPException(status_code=400, detail="Position is not open or reduced")

    exit_price = data["exit_price"]
    exit_quantity = data["quantity"]
    fees = data.get("fees", 0)
    action_id = data.get("action_id")
    entry_price = position.get("actual_entry_price") or position.get("entry_price")
    now = datetime.utcnow().isoformat()

    remaining = position.get("remaining_quantity") or position.get("quantity")
    if remaining is None:
        raise HTTPException(status_code=400, detail="Position has no quantity set")
    if exit_quantity > remaining:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot sell {exit_quantity}, only {remaining} remaining",
        )

    # P&L for this partial exit
    if position["direction"] == "long":
        pnl_percent = ((exit_price - entry_price) / entry_price) * 100
        pnl = (exit_price - entry_price) * exit_quantity - fees
    else:
        pnl_percent = ((entry_price - exit_price) / entry_price) * 100
        pnl = (entry_price - exit_price) * exit_quantity - fees

    percent_sold = (exit_quantity / remaining) * 100 if remaining else None

    # Create partial exit record (populate both legacy and new field names)
    partial_data = {
        "position_id": position_id,
        # Legacy fields
        "exit_price": exit_price,
        "quantity": exit_quantity,
        "exited_at": now,
        # New canonical fields
        "price": exit_price,
        "quantity_sold": exit_quantity,
        "percent_sold": round(percent_sold, 2) if percent_sold else None,
        "executed_at": now,
        "pnl": round(pnl, 2),
        "pnl_percent": round(pnl_percent, 2),
        "fees": fees,
        "notes": data.get("notes"),
        "action_id": action_id,
    }
    sb.table("partial_exits").insert(partial_data).execute()

    new_remaining = remaining - exit_quantity
    update_data: dict = {"remaining_quantity": new_remaining}

    if new_remaining <= 0:
        # Fully closed via partials — create a trade record
        update_data["status"] = "closed"
        update_data["closed_at"] = now

        all_partials = (
            sb.table("partial_exits")
            .select("*")
            .eq("position_id", position_id)
            .execute()
        ).data or []

        total_pnl = sum(p.get("pnl", 0) or 0 for p in all_partials)
        total_fees = sum(p.get("fees", 0) or 0 for p in all_partials)
        original_qty = position.get("original_quantity") or position.get("quantity")

        total_exit_value = sum((p.get("exit_price") or p.get("price") or 0) * (p.get("quantity") or p.get("quantity_sold") or 0) for p in all_partials)
        total_exit_qty = sum(p.get("quantity") or p.get("quantity_sold") or 0 for p in all_partials)
        avg_exit_price = total_exit_value / total_exit_qty if total_exit_qty > 0 else exit_price

        if position["direction"] == "long":
            overall_pnl_pct = ((avg_exit_price - entry_price) / entry_price) * 100
        else:
            overall_pnl_pct = ((entry_price - avg_exit_price) / entry_price) * 100

        result_type = "breakeven" if abs(overall_pnl_pct) < 0.1 else ("win" if overall_pnl_pct > 0 else "loss")

        trade_data = {
            "position_id": position_id,
            "ticker": position["ticker"],
            "direction": position["direction"],
            "entry_price": entry_price,
            "exit_price": round(avg_exit_price, 2),
            "quantity": original_qty,
            "pnl": round(total_pnl, 2),
            "pnl_percent": round(overall_pnl_pct, 2),
            "result": result_type,
            "fees": total_fees,
            "notes": data.get("notes") or position.get("notes"),
            "opened_at": position["opened_at"],
            "closed_at": now,
        }
        sb.table("trades").insert(trade_data).execute()
    else:
        # Still has remaining quantity — mark as reduced
        update_data["status"] = "reduced"

    sb.table("positions").update(update_data).eq("id", position_id).execute()

    # Mark the triggering action as executed
    if action_id:
        sb.table("position_actions").update({
            "execution_state": "executed",
            "executed_at": now,
        }).eq("id", action_id).execute()

    return {
        "partial_exit": partial_data,
        "remaining_quantity": new_remaining,
        "position_closed": new_remaining <= 0,
    }


@router.post("/{position_id}/close")
async def close_position(
    position_id: str,
    data: dict,
    user: dict = Depends(get_current_user),
):
    """Close a position and create a trade record."""
    sb = get_supabase()

    pos_result = (
        sb.table("positions")
        .select("*")
        .eq("id", position_id)
        .single()
        .execute()
    )
    position = pos_result.data
    if not position:
        raise HTTPException(status_code=404, detail="Position not found")
    if position["status"] not in ("open", "reduced"):
        raise HTTPException(status_code=400, detail="Position is already closed")

    exit_price = data["exit_price"]
    fees = data.get("fees", 0)
    entry_price = position.get("actual_entry_price") or position.get("entry_price")
    now = datetime.utcnow().isoformat()

    prior_partials = (
        sb.table("partial_exits")
        .select("*")
        .eq("position_id", position_id)
        .execute()
    ).data or []

    remaining_qty = position.get("remaining_quantity") or position.get("quantity") or 0
    original_qty = position.get("original_quantity") or position.get("quantity")

    # Weighted average exit price across all exits (partials + final close)
    partial_weighted_sum = sum(
        (p.get("exit_price") or p.get("price") or 0) * (p.get("quantity") or p.get("quantity_sold") or 0)
        for p in prior_partials
    )
    partial_qty = sum(p.get("quantity") or p.get("quantity_sold") or 0 for p in prior_partials)
    weighted_sum = partial_weighted_sum + exit_price * remaining_qty
    total_qty = partial_qty + remaining_qty
    avg_exit = weighted_sum / total_qty if total_qty > 0 else exit_price

    # Total fees (final close + all prior partial exits)
    partial_fees = sum(p.get("fees", 0) or 0 for p in prior_partials)
    total_fees = fees + partial_fees

    # PnL = exit proceeds − entry cost − fees
    if position["direction"] == "long":
        pnl = weighted_sum - entry_price * total_qty - total_fees
        pnl_pct = ((avg_exit - entry_price) / entry_price) * 100 if entry_price else 0
    else:
        pnl = entry_price * total_qty - weighted_sum - total_fees
        pnl_pct = ((entry_price - avg_exit) / entry_price) * 100 if entry_price else 0

    if abs(pnl_pct) < 0.1:
        result = "breakeven"
    elif pnl_pct > 0:
        result = "win"
    else:
        result = "loss"

    sb.table("positions").update({
        "status": "closed",
        "closed_at": now,
        "remaining_quantity": 0,
    }).eq("id", position_id).execute()

    trade_data = {
        "position_id": position["id"],
        "ticker": position["ticker"],
        "direction": position["direction"],
        "entry_price": entry_price,
        "exit_price": round(avg_exit, 2),
        "quantity": original_qty,
        "pnl": round(pnl, 2) if pnl is not None else None,
        "pnl_percent": round(pnl_pct, 2),
        "result": result,
        "fees": total_fees,
        "notes": data.get("notes") or position.get("notes"),
        "opened_at": position["opened_at"],
        "closed_at": now,
    }
    trade_result = sb.table("trades").insert(trade_data).execute()

    # Mark a close_full action as executed if one triggered this close
    action_id = data.get("action_id")
    if action_id:
        sb.table("position_actions").update({
            "execution_state": "executed",
            "executed_at": now,
        }).eq("id", action_id).execute()

    return trade_result.data[0] if trade_result.data else {}


@router.delete("/{position_id}")
async def delete_position(
    position_id: str,
    user: dict = Depends(get_current_user),
):
    """Delete a position (error correction). Cascades to trades/actions/partials."""
    sb = get_supabase()

    pos_result = (
        sb.table("positions")
        .select("id, status")
        .eq("id", position_id)
        .single()
        .execute()
    )
    if not pos_result.data:
        raise HTTPException(status_code=404, detail="Position not found")

    sb.table("positions").delete().eq("id", position_id).execute()
    return {"deleted": True}
