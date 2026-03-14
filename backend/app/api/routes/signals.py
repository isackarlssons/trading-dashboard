from fastapi import APIRouter, Body, Depends, HTTPException, Query
from typing import List, Optional
from datetime import datetime

from app.core.supabase import get_supabase
from app.core.auth import get_current_user

router = APIRouter(prefix="/signals", tags=["signals"])


@router.get("/")
async def list_signals(
    status: Optional[str] = Query(None),
    strategy_id: Optional[str] = Query(None),
    ticker: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: dict = Depends(get_current_user),
):
    """List signals with optional filters."""
    sb = get_supabase()
    query = sb.table("signals").select("*, strategies(*)").order("signal_time", desc=True)

    if status:
        query = query.eq("status", status)
    if strategy_id:
        query = query.eq("strategy_id", strategy_id)
    if ticker:
        query = query.eq("ticker", ticker.upper())

    query = query.range(offset, offset + limit - 1)
    result = query.execute()
    return result.data


@router.get("/pending")
async def list_pending_signals(
    user: dict = Depends(get_current_user),
):
    """Get all pending signals."""
    sb = get_supabase()
    result = (
        sb.table("signals")
        .select("*, strategies(*)")
        .eq("status", "pending")
        .order("signal_time", desc=True)
        .execute()
    )
    return result.data


@router.get("/{signal_id}")
async def get_signal(
    signal_id: str,
    user: dict = Depends(get_current_user),
):
    """Get a specific signal."""
    sb = get_supabase()
    result = (
        sb.table("signals")
        .select("*, strategies(*)")
        .eq("id", signal_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Signal not found")
    return result.data


@router.post("/", status_code=201)
async def create_signal(
    data: dict,
    user: dict = Depends(get_current_user),
):
    """Create a new signal."""
    sb = get_supabase()
    if "ticker" in data:
        data["ticker"] = data["ticker"].upper()
    result = sb.table("signals").insert(data).execute()
    return result.data[0] if result.data else {}


@router.patch("/{signal_id}")
async def update_signal(
    signal_id: str,
    data: dict,
    user: dict = Depends(get_current_user),
):
    """Update a signal (e.g., mark as taken/skipped)."""
    sb = get_supabase()

    # Auto-stamp taken_at / skipped_at when status changes
    now = datetime.utcnow().isoformat()
    if data.get("status") == "taken" and "taken_at" not in data:
        data["taken_at"] = now
    if data.get("status") == "skipped" and "skipped_at" not in data:
        data["skipped_at"] = now

    result = (
        sb.table("signals")
        .update(data)
        .eq("id", signal_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Signal not found")
    return result.data[0]


@router.post("/{signal_id}/take", status_code=201)
async def take_signal(
    signal_id: str,
    data: dict,
    user: dict = Depends(get_current_user),
):
    """Take a signal: mark it as taken and create a position.

    Payload (all optional except none required — signal provides defaults):
        actual_entry_price: float   (defaults to signal.entry_price)
        quantity: float
        stop_loss: float            (overrides signal.stop_loss)
        take_profit: float          (overrides signal.take_profit)
        instrument_price: float     (for leverage products)
        notes: str
    """
    sb = get_supabase()

    # Fetch signal
    signal_result = (
        sb.table("signals")
        .select("*")
        .eq("id", signal_id)
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
    actual_entry = data.get("actual_entry_price") or data.get("entry_price") or signal.get("entry_price")
    current_sl = data.get("stop_loss") or signal.get("stop_loss")

    # Create position with both legacy and new field names for full compatibility
    position_data = {
        "signal_id": signal["id"],
        "ticker": signal["ticker"],
        "direction": signal["direction"],
        "market": signal.get("market"),
        # Legacy field (kept for backward compat)
        "entry_price": actual_entry,
        "stop_loss": current_sl,
        # New canonical fields
        "planned_entry_price": signal.get("entry_price"),
        "actual_entry_price": actual_entry,
        "current_stop_loss": current_sl,
        "take_profit": data.get("take_profit") or signal.get("take_profit"),
        "original_quantity": qty,
        "remaining_quantity": qty,
        "quantity": qty,
        "execution_type": signal.get("execution_type"),
        "execution_symbol": signal.get("execution_symbol"),
        "execution_isin": signal.get("execution_isin"),
        "instrument_price": data.get("instrument_price") or signal.get("instrument_price"),
        "opened_at": now,
        "status": "open",
        "notes": data.get("notes"),
    }
    pos_result = sb.table("positions").insert(position_data).execute()

    # Mark signal as taken
    sb.table("signals").update({
        "status": "taken",
        "taken_at": now,
    }).eq("id", signal["id"]).execute()

    return pos_result.data[0] if pos_result.data else {}


@router.post("/bulk", status_code=201)
async def create_signals_bulk(
    signals_data: List[dict] = Body(...),
    user: dict = Depends(get_current_user),
):
    """Create multiple signals at once."""
    sb = get_supabase()
    for s in signals_data:
        if "ticker" in s:
            s["ticker"] = s["ticker"].upper()
    result = sb.table("signals").insert(signals_data).execute()
    return result.data
