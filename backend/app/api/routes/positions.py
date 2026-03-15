from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from datetime import datetime

import logging

from app.core.supabase import get_supabase
from app.core.auth import get_current_user
from app.services.fx import fetch_fx_rates_for_currencies
from app.services.portfolio import BASE_CURRENCY, get_instrument_currency, convert_to_base

log = logging.getLogger(__name__)

# Snapshots older than this are treated as price_unavailable
_SNAPSHOT_STALE_HOURS = 4

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

    # Read latest price from market_snapshots (written by bot) — no Yahoo calls here
    prices: dict = {}
    unique_tickers = list({p["ticker"] for p in positions})
    now_utc = datetime.utcnow()

    for ticker in unique_tickers:
        snap_result = (
            sb.table("market_snapshots")
            .select("price, snapshot_time")
            .eq("ticker", ticker)
            .order("snapshot_time", desc=True)
            .limit(1)
            .execute()
        )
        if snap_result.data:
            snap = snap_result.data[0]
            raw_time = snap["snapshot_time"]
            # Parse ISO timestamp (strip timezone offset for naive comparison)
            try:
                snap_dt = datetime.fromisoformat(raw_time.replace("Z", "+00:00"))
                snap_dt_naive = snap_dt.replace(tzinfo=None)
                age_hours = (now_utc - snap_dt_naive).total_seconds() / 3600
            except Exception:
                age_hours = 999  # unparseable → treat as stale

            if age_hours <= _SNAPSHOT_STALE_HOURS:
                prices[ticker] = float(snap["price"])
                log.info("[risk-summary] %s: snapshot price=%r  age=%.2fh", ticker, prices[ticker], age_hours)
            else:
                prices[ticker] = None
                log.info("[risk-summary] %s: snapshot stale (%.2fh old) — unavailable", ticker, age_hours)
        else:
            prices[ticker] = None
            log.info("[risk-summary] %s: no snapshot in market_snapshots — unavailable", ticker)

    # ── FX rates for SEK conversion (pre-fetch once for all positions) ──────
    unique_currencies = {get_instrument_currency(p) for p in positions}
    fx_results = fetch_fx_rates_for_currencies(unique_currencies, to_currency=BASE_CURRENCY)
    # Build a simple currency → rate dict for convert_to_base()
    fx_rates = {c: r.rate for c, r in fx_results.items() if r.rate is not None}
    fx_warnings = [r.warning for r in fx_results.values() if r.warning]
    if fx_warnings:
        for w in fx_warnings:
            log.warning("[risk-summary] FX: %s", w)

    per_position = []
    total_risk_sek = 0.0
    total_unrealized_pnl_sek = 0.0
    total_risk_native = 0.0
    total_unrealized_pnl_native = 0.0
    fx_incomplete = False
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

        # Instrument currency for this position
        instr_currency = get_instrument_currency(pos)
        fx_result = fx_results.get(instr_currency)
        fx_rate = fx_result.rate if fx_result else None

        # Risk to stop — always computable from stored data (in instrument currency)
        risk_to_stop = None
        risk_to_stop_sek = None
        if entry and sl and qty:
            raw = (entry - sl) * qty if direction == "long" else (sl - entry) * qty
            risk_to_stop = round(max(0.0, raw), 2)
            total_risk_native += risk_to_stop
            converted, unavail = convert_to_base(risk_to_stop, instr_currency, fx_rates)
            if not unavail and converted is not None:
                risk_to_stop_sek = converted
                total_risk_sek += converted
            else:
                fx_incomplete = True

        # Unrealized PnL — needs live price (in instrument currency)
        unrealized_pnl = None
        unrealized_pnl_sek = None
        if current_price and entry and qty:
            raw_pnl = (current_price - entry) * qty if direction == "long" else (entry - current_price) * qty
            unrealized_pnl = round(raw_pnl, 2)
            total_unrealized_pnl_native += unrealized_pnl
            converted, unavail = convert_to_base(unrealized_pnl, instr_currency, fx_rates)
            if not unavail and converted is not None:
                unrealized_pnl_sek = converted
                total_unrealized_pnl_sek += converted
            else:
                fx_incomplete = True

        log.info(
            "[risk-summary] %s: currency=%s fx=%.4f risk=%s risk_sek=%s upnl=%s upnl_sek=%s",
            pos["ticker"], instr_currency, fx_rate or 0,
            risk_to_stop, risk_to_stop_sek,
            unrealized_pnl, unrealized_pnl_sek,
        )

        per_position.append({
            "position_id":       pos["id"],
            "ticker":            pos["ticker"],
            "direction":         direction,
            "status":            pos["status"],
            "instrument_currency": instr_currency,
            "fx_rate_used":      fx_rate,
            "current_price":     current_price,
            "current_stop_loss": sl,
            "actual_entry_price": entry,
            "remaining_quantity": qty,
            "unrealized_pnl":    unrealized_pnl,
            "unrealized_pnl_sek": unrealized_pnl_sek,
            "risk_to_stop":      risk_to_stop,
            "risk_to_stop_sek":  risk_to_stop_sek,
            "price_unavailable": current_price is None,
        })

    return {
        "base_currency":             BASE_CURRENCY,
        # Native (instrument-currency) totals — kept for backward compat
        "total_open_risk":           round(total_risk_native, 2),
        "total_unrealized_pnl":      round(total_unrealized_pnl_native, 2),
        "max_downside_to_stops":     round(total_risk_native, 2),
        # SEK totals — primary portfolio-level figures
        "total_open_risk_sek":       round(total_risk_sek, 2),
        "total_unrealized_pnl_sek":  round(total_unrealized_pnl_sek, 2),
        "fx_incomplete":             fx_incomplete,
        "open_positions_count":      open_count,
        "reduced_positions_count":   reduced_count,
        "per_position":              per_position,
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
    direction = signal["direction"]

    # ── Compute initial risk at entry ─────────────────────────────────────────
    irps = None
    if actual_entry and current_sl:
        raw_risk = (actual_entry - current_sl) if direction == "long" else (current_sl - actual_entry)
        irps = round(raw_risk, 6) if raw_risk > 0 else None

    sig_meta = signal.get("metadata") or {}

    # Instrument currency: explicit on signal/data, else derive from market
    instr_currency = (
        data.get("instrument_currency")
        or signal.get("instrument_currency")
        or get_instrument_currency(signal)
    )

    position_data = {
        "signal_id": signal["id"],
        "ticker": signal["ticker"],
        "direction": direction,
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
        "instrument_currency": instr_currency,
        "notes": data.get("notes"),
        "opened_at": now,
        "status": "open",
        # ── Smart exit context ─────────────────────────────────────────────────
        "initial_stop_loss": current_sl,
        "initial_risk_per_share": irps,
        "atr_at_entry": sig_meta.get("atr"),
        "regime_at_entry": sig_meta.get("regime"),
        "entry_context": {
            "signal_id": signal["id"],
            "strategy_id": signal.get("strategy_id"),
            "confidence": signal.get("confidence"),
            "signal_metadata": sig_meta,
        },
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
        "instrument_currency",
        # Smart exit context — written by bot on each run
        "highest_price_seen", "lowest_price_seen",
        "initial_stop_loss", "initial_risk_per_share",
        "atr_at_entry", "regime_at_entry", "entry_context",
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
