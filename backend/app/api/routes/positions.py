from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from datetime import datetime

from app.core.supabase import get_supabase
from app.core.auth import get_current_user

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
    """Get all currently open positions."""
    sb = get_supabase()
    result = (
        sb.table("positions")
        .select("*")
        .eq("status", "open")
        .order("opened_at", desc=True)
        .execute()
    )
    return result.data


@router.get("/{position_id}")
async def get_position(
    position_id: str,
    user: dict = Depends(get_current_user),
):
    """Get a specific position."""
    sb = get_supabase()
    result = (
        sb.table("positions")
        .select("*")
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
    result = sb.table("positions").insert(data).execute()
    return result.data[0] if result.data else {}


@router.post("/from-signal", status_code=201)
async def create_position_from_signal(
    data: dict,
    user: dict = Depends(get_current_user),
):
    """Take a signal: create a position and mark signal as taken."""
    sb = get_supabase()

    # Get the signal
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

    # Create position
    position_data = {
        "signal_id": signal["id"],
        "ticker": signal["ticker"],
        "direction": signal["direction"],
        "entry_price": data["entry_price"],
        "stop_loss": data.get("stop_loss") or signal.get("stop_loss"),
        "take_profit": data.get("take_profit") or signal.get("take_profit"),
        "quantity": data.get("quantity"),
        "notes": data.get("notes"),
        "status": "open",
    }
    pos_result = sb.table("positions").insert(position_data).execute()

    # Mark signal as taken
    sb.table("signals").update({
        "status": "taken",
        "entry_price": data["entry_price"],
    }).eq("id", signal["id"]).execute()

    return pos_result.data[0] if pos_result.data else {}


@router.post("/{position_id}/close")
async def close_position(
    position_id: str,
    data: dict,
    user: dict = Depends(get_current_user),
):
    """Close a position and create a trade record."""
    sb = get_supabase()

    # Get position
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
    if position["status"] != "open":
        raise HTTPException(status_code=400, detail="Position is already closed")

    exit_price = data["exit_price"]
    fees = data.get("fees", 0)
    entry_price = position["entry_price"]
    now = datetime.utcnow().isoformat()

    # Calculate P&L
    if position["direction"] == "long":
        pnl_percent = ((exit_price - entry_price) / entry_price) * 100
    else:
        pnl_percent = ((entry_price - exit_price) / entry_price) * 100

    pnl = None
    if position.get("quantity"):
        if position["direction"] == "long":
            pnl = (exit_price - entry_price) * position["quantity"] - fees
        else:
            pnl = (entry_price - exit_price) * position["quantity"] - fees

    # Determine result
    if abs(pnl_percent) < 0.1:
        result = "breakeven"
    elif pnl_percent > 0:
        result = "win"
    else:
        result = "loss"

    # Close position
    sb.table("positions").update({
        "status": "closed",
        "closed_at": now,
    }).eq("id", position_id).execute()

    # Create trade record
    trade_data = {
        "position_id": position["id"],
        "ticker": position["ticker"],
        "direction": position["direction"],
        "entry_price": entry_price,
        "exit_price": exit_price,
        "quantity": position.get("quantity"),
        "pnl": round(pnl, 2) if pnl is not None else None,
        "pnl_percent": round(pnl_percent, 2),
        "result": result,
        "fees": fees,
        "notes": data.get("notes") or position.get("notes"),
        "opened_at": position["opened_at"],
        "closed_at": now,
    }
    trade_result = sb.table("trades").insert(trade_data).execute()

    return trade_result.data[0] if trade_result.data else {}
