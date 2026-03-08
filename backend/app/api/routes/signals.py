from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
from uuid import UUID

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
    result = (
        sb.table("signals")
        .update(data)
        .eq("id", signal_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Signal not found")
    return result.data[0]


@router.post("/bulk", status_code=201)
async def create_signals_bulk(
    signals_data: list,
    user: dict = Depends(get_current_user),
):
    """Create multiple signals at once."""
    sb = get_supabase()
    for s in signals_data:
        if "ticker" in s:
            s["ticker"] = s["ticker"].upper()
    result = sb.table("signals").insert(signals_data).execute()
    return result.data
