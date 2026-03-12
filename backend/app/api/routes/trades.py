from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional

from app.core.supabase import get_supabase
from app.core.auth import get_current_user

router = APIRouter(prefix="/trades", tags=["trades"])


@router.get("/")
async def list_trades(
    ticker: Optional[str] = Query(None),
    result: Optional[str] = Query(None),
    direction: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user: dict = Depends(get_current_user),
):
    """List completed trades."""
    sb = get_supabase()
    query = sb.table("trades").select("*").order("closed_at", desc=True)

    if ticker:
        query = query.eq("ticker", ticker.upper())
    if result:
        query = query.eq("result", result)
    if direction:
        query = query.eq("direction", direction)

    query = query.range(offset, offset + limit - 1)
    res = query.execute()
    return res.data


@router.get("/stats")
async def get_trade_stats(
    ticker: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    """Get trading statistics."""
    sb = get_supabase()
    query = sb.table("trades").select("*")
    if ticker:
        query = query.eq("ticker", ticker.upper())
    res = query.execute()
    trades = res.data

    if not trades:
        return {
            "total_trades": 0, "wins": 0, "losses": 0, "breakeven": 0,
            "win_rate": 0, "total_pnl": 0, "avg_pnl": 0, "avg_pnl_percent": 0,
            "best_trade": None, "worst_trade": None, "avg_win": None,
            "avg_loss": None, "profit_factor": None,
        }

    total = len(trades)
    wins = [t for t in trades if t["result"] == "win"]
    losses = [t for t in trades if t["result"] == "loss"]
    breakevens = [t for t in trades if t["result"] == "breakeven"]

    pnl_percents = [t["pnl_percent"] for t in trades if t.get("pnl_percent") is not None]
    pnls = [t["pnl"] for t in trades if t.get("pnl") is not None]

    win_pnls = [t["pnl_percent"] for t in wins if t.get("pnl_percent") is not None]
    loss_pnls = [t["pnl_percent"] for t in losses if t.get("pnl_percent") is not None]

    gross_profit = sum(p for p in pnl_percents if p > 0) if pnl_percents else 0
    gross_loss = abs(sum(p for p in pnl_percents if p < 0)) if pnl_percents else 0
    profit_factor = round(gross_profit / gross_loss, 2) if gross_loss > 0 else None

    return {
        "total_trades": total,
        "wins": len(wins),
        "losses": len(losses),
        "breakeven": len(breakevens),
        "win_rate": round(len(wins) / total * 100, 1) if total > 0 else 0,
        "total_pnl": round(sum(pnls), 2) if pnls else 0,
        "avg_pnl": round(sum(pnls) / len(pnls), 2) if pnls else 0,
        "avg_pnl_percent": round(sum(pnl_percents) / len(pnl_percents), 2) if pnl_percents else 0,
        "best_trade": round(max(pnl_percents), 2) if pnl_percents else None,
        "worst_trade": round(min(pnl_percents), 2) if pnl_percents else None,
        "avg_win": round(sum(win_pnls) / len(win_pnls), 2) if win_pnls else None,
        "avg_loss": round(sum(loss_pnls) / len(loss_pnls), 2) if loss_pnls else None,
        "profit_factor": profit_factor,
    }


@router.get("/{trade_id}")
async def get_trade(
    trade_id: str,
    user: dict = Depends(get_current_user),
):
    """Get a specific trade."""
    sb = get_supabase()
    res = (
        sb.table("trades")
        .select("*")
        .eq("id", trade_id)
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Trade not found")
    return res.data


@router.delete("/{trade_id}")
async def delete_trade(
    trade_id: str,
    user: dict = Depends(get_current_user),
):
    """Delete a trade record (for error correction)."""
    sb = get_supabase()
    res = (
        sb.table("trades")
        .select("id")
        .eq("id", trade_id)
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Trade not found")

    sb.table("trades").delete().eq("id", trade_id).execute()
    return {"deleted": True}
