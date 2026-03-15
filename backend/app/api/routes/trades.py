from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from datetime import datetime

from app.core.supabase import get_supabase
from app.core.auth import get_current_user

router = APIRouter(prefix="/trades", tags=["trades"])


# ─── Analytics helpers ────────────────────────────────────────────────────────

def _empty_analytics() -> dict:
    return {
        "total_trades": 0, "win_rate": 0, "expectancy_r": None,
        "avg_r": None, "avg_win_r": None, "avg_loss_r": None,
        "profit_factor": None, "max_drawdown_pct": None,
        "avg_holding_days": None,
        "by_strategy": {}, "by_regime": {}, "by_exit_reason": {},
        "per_trade": [],
    }


def _group_by(trades: list, key: str) -> dict:
    """Group per-trade dicts by a field and compute summary stats per group."""
    acc: dict = {}
    for t in trades:
        k = t.get(key) or "Unknown"
        if k not in acc:
            acc[k] = {"trades": 0, "wins": 0, "losses": 0,
                      "win_rate": 0.0, "avg_r": None, "_rs": []}
        g = acc[k]
        g["trades"] += 1
        if t["result"] == "win":
            g["wins"] += 1
        elif t["result"] == "loss":
            g["losses"] += 1
        if t["r_multiple"] is not None:
            g["_rs"].append(t["r_multiple"])

    result = {}
    for k, g in acc.items():
        rs = g.pop("_rs")
        g["win_rate"] = round(g["wins"] / g["trades"] * 100, 1)
        g["avg_r"] = round(sum(rs) / len(rs), 3) if rs else None
        result[k] = g
    return result


def _compute_max_drawdown(pnl_percents: list) -> float | None:
    """Approximate max drawdown from an ordered list of trade P&L percentages."""
    if not pnl_percents:
        return None
    peak = cumul = 0.0
    max_dd = 0.0
    for p in pnl_percents:
        cumul += p
        if cumul > peak:
            peak = cumul
        dd = peak - cumul
        if dd > max_dd:
            max_dd = dd
    return round(max_dd, 2) if max_dd > 0 else None


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


@router.get("/analytics")
async def get_trade_analytics(
    ticker: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    """Rich analytics: R-multiples, expectancy, strategy/regime breakdown.

    R-multiple source priority:
        1. position.initial_risk_per_share  (set at entry via smart-exit context)
        2. position.initial_stop_loss       (fallback: derive risk from entry − isl)
        3. position.stop_loss               (last resort for old positions)
        4. null when none available
    """
    sb = get_supabase()

    q = sb.table("trades").select("*").order("closed_at", desc=True)
    if ticker:
        q = q.eq("ticker", ticker.upper())
    trades_raw = q.execute().data or []

    if not trades_raw:
        return _empty_analytics()

    # ── Fetch position context for all trades ─────────────────────────────────
    position_ids = list({t["position_id"] for t in trades_raw if t.get("position_id")})
    pos_map: dict = {}
    if position_ids:
        chunk_size = 100
        for i in range(0, len(position_ids), chunk_size):
            chunk = position_ids[i : i + chunk_size]
            rows = (
                sb.table("positions")
                .select("id, initial_risk_per_share, initial_stop_loss, stop_loss, "
                        "actual_entry_price, entry_price, regime_at_entry, entry_context")
                .in_("id", chunk)
                .execute()
            ).data or []
            for r in rows:
                pos_map[r["id"]] = r

    # ── Fetch strategy names ───────────────────────────────────────────────────
    strats: dict = {
        s["id"]: s["name"]
        for s in (sb.table("strategies").select("id, name").execute().data or [])
    }

    # ── Partial exit flags per position ───────────────────────────────────────
    partial_positions: set = set()
    if position_ids:
        chunk_size = 100
        for i in range(0, len(position_ids), chunk_size):
            chunk = position_ids[i : i + chunk_size]
            rows = (
                sb.table("partial_exits")
                .select("position_id")
                .in_("position_id", chunk)
                .execute()
            ).data or []
            for r in rows:
                partial_positions.add(r["position_id"])

    # ── Build per-trade analytics ─────────────────────────────────────────────
    per_trade = []
    for t in trades_raw:
        pos = pos_map.get(t.get("position_id") or "") or {}
        entry_ctx = pos.get("entry_context") or {}

        entry = t["entry_price"]
        exit_p = t["exit_price"]
        direction = t["direction"]

        # R-multiple: use stored initial_risk_per_share first
        irps = pos.get("initial_risk_per_share")
        if not irps or irps <= 0:
            # Derive from initial_stop_loss
            isl = pos.get("initial_stop_loss") or pos.get("stop_loss")
            actual_entry = pos.get("actual_entry_price") or pos.get("entry_price") or entry
            if isl and actual_entry:
                raw = (actual_entry - isl) if direction == "long" else (isl - actual_entry)
                irps = raw if raw > 0 else None

        r_multiple = None
        if irps and irps > 0:
            raw_r = (exit_p - entry) / irps if direction == "long" else (entry - exit_p) / irps
            r_multiple = round(raw_r, 3)

        # Strategy name from entry_context → strategy_id
        strategy_id = entry_ctx.get("strategy_id")
        strategy_name = strats.get(strategy_id) if strategy_id else None

        # Regime
        regime = pos.get("regime_at_entry")

        # Holding time in days
        holding_days = None
        try:
            opened = datetime.fromisoformat(t["opened_at"].replace("Z", "+00:00"))
            closed = datetime.fromisoformat(t["closed_at"].replace("Z", "+00:00"))
            holding_days = round((closed - opened).total_seconds() / 86400, 1)
        except Exception:
            pass

        # Exit reason — use trade notes as proxy (dedicated field not yet in schema)
        exit_reason = t.get("notes") or None

        per_trade.append({
            "trade_id": t["id"],
            "ticker": t["ticker"],
            "direction": direction,
            "strategy_name": strategy_name,
            "regime_at_entry": regime,
            "pnl": t.get("pnl"),
            "pnl_percent": t.get("pnl_percent"),
            "r_multiple": r_multiple,
            "exit_reason": exit_reason,
            "holding_days": holding_days,
            "partial_exit_used": t["position_id"] in partial_positions,
            "result": t["result"],
        })

    # ── Aggregate stats ───────────────────────────────────────────────────────
    total = len(per_trade)
    wins   = [t for t in per_trade if t["result"] == "win"]
    losses = [t for t in per_trade if t["result"] == "loss"]

    rs      = [t["r_multiple"] for t in per_trade if t["r_multiple"] is not None]
    win_rs  = [t["r_multiple"] for t in wins      if t["r_multiple"] is not None]
    loss_rs = [t["r_multiple"] for t in losses     if t["r_multiple"] is not None]

    avg_r      = round(sum(rs)      / len(rs),      3) if rs      else None
    avg_win_r  = round(sum(win_rs)  / len(win_rs),  3) if win_rs  else None
    avg_loss_r = round(sum(loss_rs) / len(loss_rs), 3) if loss_rs else None
    win_rate   = len(wins) / total if total > 0 else 0

    expectancy_r = None
    if avg_win_r is not None and avg_loss_r is not None:
        expectancy_r = round(avg_win_r * win_rate + avg_loss_r * (1 - win_rate), 3)

    pnl_pcts    = [t["pnl_percent"] for t in per_trade if t["pnl_percent"] is not None]
    gross_profit = sum(p for p in pnl_pcts if p > 0)
    gross_loss   = abs(sum(p for p in pnl_pcts if p < 0))
    profit_factor = round(gross_profit / gross_loss, 2) if gross_loss > 0 else None

    hds = [t["holding_days"] for t in per_trade if t["holding_days"] is not None]
    avg_holding_days = round(sum(hds) / len(hds), 1) if hds else None

    return {
        "total_trades":     total,
        "win_rate":         round(win_rate * 100, 1),
        "expectancy_r":     expectancy_r,
        "avg_r":            avg_r,
        "avg_win_r":        avg_win_r,
        "avg_loss_r":       avg_loss_r,
        "profit_factor":    profit_factor,
        "max_drawdown_pct": _compute_max_drawdown(pnl_pcts),
        "avg_holding_days": avg_holding_days,
        "by_strategy":      _group_by(per_trade, "strategy_name"),
        "by_regime":        _group_by(per_trade, "regime_at_entry"),
        "by_exit_reason":   _group_by(per_trade, "exit_reason"),
        "per_trade":        per_trade,
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
