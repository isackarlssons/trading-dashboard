"""
bot_manager.py — Position management bot (Smart Exit v1).

Fetches open positions from the trading dashboard API, determines the optimal
management action for each position using R-multiples and ATR-based trailing
stops, and submits actions via API only. Never writes directly to Supabase.

Usage:
    python bot_manager.py

Environment variables (required):
    DASHBOARD_API_URL   Base URL, e.g. https://your-api.example.com/api/v1
    DASHBOARD_API_TOKEN Supabase JWT from a service account or long-lived token

Optional environment variables:
    ATR_PERIOD          Bars used to compute live ATR fallback (default 14)
    BREAKEVEN_R         R-multiple at which to propose breakeven (default 1.0)
"""

import os
import sys
import logging
import requests

# Allow importing the shared backend service from the sibling directory
_BACKEND_DIR = os.path.join(os.path.dirname(__file__), "..", "backend")
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from app.services.market_data import get_price, compute_live_atr, compute_live_regime  # noqa: E402

logging.basicConfig(level=logging.DEBUG, format="%(asctime)s  %(levelname)s  %(message)s")
log = logging.getLogger("bot")

# ─── Config ──────────────────────────────────────────────────────────────────

try:
    API_BASE = os.environ["DASHBOARD_API_URL"].rstrip("/")
    TOKEN    = os.environ["DASHBOARD_API_TOKEN"]
except KeyError as e:
    sys.exit(f"Missing required environment variable: {e}")

ATR_PERIOD  = int(os.environ.get("ATR_PERIOD", "14"))
BREAKEVEN_R = float(os.environ.get("BREAKEVEN_R", "1.0"))

HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
}

# ── Regime-aware exit thresholds ──────────────────────────────────────────────
# ATR multiplier for trailing stop: higher = wider stop = more room to breathe
ATR_MULT_BY_REGIME = {
    "TRENDING":  3.0,
    "VOLATILE":  2.5,
    "CHOPPY":    1.8,
}
# R-multiple at which to take 50% partial profit
PARTIAL_R_BY_REGIME = {
    "TRENDING":  2.0,
    "VOLATILE":  1.5,
    "CHOPPY":    1.5,
}


# ─── API helpers ─────────────────────────────────────────────────────────────

def api_get(path: str) -> list | dict:
    r = requests.get(f"{API_BASE}{path}", headers=HEADERS, timeout=15)
    r.raise_for_status()
    return r.json()


def api_post(path: str, body: dict) -> dict:
    r = requests.post(f"{API_BASE}{path}", json=body, headers=HEADERS, timeout=15)
    r.raise_for_status()
    return r.json()


def api_patch(path: str, body: dict) -> dict:
    r = requests.patch(f"{API_BASE}{path}", json=body, headers=HEADERS, timeout=15)
    r.raise_for_status()
    return r.json()


# ─── Market data ─────────────────────────────────────────────────────────────

def get_current_price(
    ticker: str,
    market: str | None = None,
    symbol_override: str | None = None,
) -> float | None:
    """Fetch the latest price via the shared market_data helper."""
    result = get_price(ticker, market=market, symbol_override=symbol_override)
    if result.price_unavailable:
        log.warning(f"  [{ticker}] No price available — {result.error}")
    return result.current_price


# ─── Smart exit helpers ───────────────────────────────────────────────────────

def get_initial_risk(position: dict) -> tuple[float | None, float | None]:
    """Return (initial_stop_loss, initial_risk_per_share) with fallback chain.

    Priority:
      1. Stored columns: initial_stop_loss / initial_risk_per_share
      2. entry_context JSONB
      3. Derive from stop_loss column (approximation for old positions — logged)

    Returns (None, None) if unavailable.
    """
    ticker = position["ticker"]

    isl  = position.get("initial_stop_loss")
    irps = position.get("initial_risk_per_share")

    # 2. entry_context JSONB
    ctx = position.get("entry_context") or {}
    if isl is None:
        isl = ctx.get("initial_stop_loss")
    if irps is None:
        irps = ctx.get("initial_risk_per_share")

    # 3. Fall back to stop_loss column (may be the moved stop — imprecise for old positions)
    if isl is None:
        isl = position.get("stop_loss")
        if isl is not None:
            log.warning(
                f"  [{ticker}] initial_stop_loss not set — using stop_loss={isl} as approximation "
                f"(R-multiple imprecise if stop was already moved)"
            )

    # Derive irps from isl if still missing
    if irps is None and isl is not None:
        entry = position.get("actual_entry_price") or position.get("entry_price")
        direction = position["direction"]
        if entry:
            raw = (entry - isl) if direction == "long" else (isl - entry)
            if raw > 0:
                irps = round(raw, 6)
                log.debug(f"  [{ticker}] Derived irps={irps:.6f} from entry={entry} isl={isl}")

    return isl, irps


def get_atr_and_regime(position: dict) -> tuple[float | None, str, str, str]:
    """Return (atr, atr_source, regime, regime_source) with fallback chain.

    Priority for both:
      1. Stored columns (atr_at_entry / regime_at_entry)
      2. entry_context JSONB
      3. Live calculation via yfinance (logged as fallback)
    """
    ticker = position["ticker"]
    ctx = position.get("entry_context") or {}

    # ATR
    atr = position.get("atr_at_entry") or ctx.get("atr_at_entry")
    if atr:
        atr_source = "stored"
    else:
        atr = compute_live_atr(ticker, period=ATR_PERIOD)
        atr_source = "live" if atr else "unavailable"
        if atr:
            log.warning(f"  [{ticker}] Using LIVE ATR fallback: {atr:.4f} (atr_at_entry not set)")
        else:
            log.warning(f"  [{ticker}] ATR unavailable — ATR trailing stop will be skipped")

    # Regime
    regime = position.get("regime_at_entry") or ctx.get("regime_at_entry")
    if regime and regime in ATR_MULT_BY_REGIME:
        regime_source = "stored"
    else:
        regime = compute_live_regime(ticker)
        regime_source = "live"
        log.warning(f"  [{ticker}] Using LIVE regime fallback: {regime}")

    return atr, atr_source, regime, regime_source


def update_price_context(pos: dict, price: float) -> dict:
    """Track highest/lowest price seen for the ATR trailing stop anchor.

    Calls PATCH /positions/{id} to persist and returns a locally updated copy
    so evaluate_position sees the refreshed extreme in the same run.
    """
    ticker = pos["ticker"]
    direction = pos["direction"]
    update: dict = {}

    if direction == "long":
        current_high = pos.get("highest_price_seen")
        if current_high is None or price > current_high:
            update["highest_price_seen"] = price
    else:
        current_low = pos.get("lowest_price_seen")
        if current_low is None or price < current_low:
            update["lowest_price_seen"] = price

    if update:
        try:
            api_patch(f"/positions/{pos['id']}", update)
            log.debug(f"  [{ticker}] Price context updated: {update}")
        except Exception as e:
            log.warning(f"  [{ticker}] Failed to persist price context: {e}")
        # Update local copy regardless — so current run uses the new extreme
        pos = {**pos, **update}

    return pos


# ─── Action state helpers ─────────────────────────────────────────────────────

def existing_pending_types(position: dict) -> set[str]:
    """Return the set of action_types that already have a pending action."""
    return {
        a["action_type"]
        for a in (position.get("position_actions") or [])
        if a["execution_state"] == "pending"
    }


# ─── Smart exit evaluation ────────────────────────────────────────────────────

def evaluate_position(position: dict, price: float) -> list[dict]:
    """Return a list of actions to create for this position (may be empty).

    Uses:
      - R-multiple for breakeven and partial-take thresholds
      - ATR-based trailing stop with regime-aware multiplier
      - Best-stop selection: only ONE stop action proposed per run
    """
    actions: list[dict] = []
    pending = existing_pending_types(position)
    ticker = position["ticker"]
    direction = position["direction"]

    entry = position.get("actual_entry_price") or position.get("entry_price")
    current_sl = position.get("current_stop_loss") or position.get("stop_loss")
    remaining = position.get("remaining_quantity") or position.get("quantity")

    if not entry:
        log.warning(f"  [{ticker}] No entry price — skipping")
        return actions

    # ── Initial risk ──────────────────────────────────────────────────────────
    isl, irps = get_initial_risk(position)
    r_available = irps is not None and irps > 0

    # ── R-multiple (only when initial risk is known) ──────────────────────────
    r_multiple: float | None = None
    is_profitable = False

    if r_available:
        if direction == "long":
            r_multiple = (price - entry) / irps
            is_profitable = price > entry
        else:
            r_multiple = (entry - price) / irps
            is_profitable = price < entry
    else:
        is_profitable = (direction == "long" and price > entry) or (direction == "short" and price < entry)
        log.warning(
            f"  [{ticker}] R-based smart exit disabled — initial risk unavailable "
            f"(irps={irps}); trailing-only mode enabled"
        )

    # ── Regime and ATR ────────────────────────────────────────────────────────
    atr, atr_source, regime, regime_source = get_atr_and_regime(position)

    # ── Extreme price anchor for ATR trailing stop ────────────────────────────
    if direction == "long":
        extreme = position.get("highest_price_seen") or entry
        extreme = max(extreme, price)
    else:
        extreme = position.get("lowest_price_seen") or entry
        extreme = min(extreme, price)

    log.info(
        f"  [{ticker}] {direction.upper()} | entry={entry} price={price:.4f} "
        f"r={'N/A' if r_multiple is None else f'{r_multiple:.2f}R'} "
        f"isl={isl} irps={irps} "
        f"regime={regime}({regime_source}) atr={atr}({atr_source}) "
        f"extreme={extreme:.4f}"
    )

    # ── Stop candidates — best one only ───────────────────────────────────────
    stop_candidates: list[dict] = []

    # Candidate A: move to breakeven (requires valid R)
    if r_available and r_multiple is not None and r_multiple >= BREAKEVEN_R and is_profitable and current_sl is not None:
        needs_improvement = (
            (direction == "long"  and current_sl < entry) or
            (direction == "short" and current_sl > entry)
        )
        if needs_improvement:
            stop_candidates.append({
                "stop_price":  entry,
                "action_type": "move_stop_to_breakeven",
                "reason": f"R={r_multiple:.2f} ≥ {BREAKEVEN_R}R — move to breakeven {entry:.4f}",
            })

    # Candidate B: ATR-based trailing stop
    if atr and is_profitable and current_sl is not None:
        atr_mult = ATR_MULT_BY_REGIME.get(regime, 2.5)
        if direction == "long":
            trailing_sl = round(extreme - atr_mult * atr, 4)
            if trailing_sl > current_sl + 0.001 and trailing_sl < price:
                stop_candidates.append({
                    "stop_price":  trailing_sl,
                    "action_type": "raise_stop",
                    "reason": (
                        f"ATR trail ({regime} {atr_mult}x): "
                        f"extreme={extreme:.4f} - {atr_mult}×{atr:.4f} = {trailing_sl:.4f} "
                        f"[{atr_source}]"
                    ),
                })
        else:
            trailing_sl = round(extreme + atr_mult * atr, 4)
            if trailing_sl < current_sl - 0.001 and trailing_sl > price:
                stop_candidates.append({
                    "stop_price":  trailing_sl,
                    "action_type": "raise_stop",
                    "reason": (
                        f"ATR trail short ({regime} {atr_mult}x): "
                        f"extreme={extreme:.4f} + {atr_mult}×{atr:.4f} = {trailing_sl:.4f} "
                        f"[{atr_source}]"
                    ),
                })

    # Pick the single most protective stop
    if stop_candidates:
        best = (max if direction == "long" else min)(
            stop_candidates, key=lambda c: c["stop_price"]
        )
        actions.append({
            "position_id":   position["id"],
            "action_type":   best["action_type"],
            "old_stop_loss": current_sl,
            "new_stop_loss": best["stop_price"],
            "reason":        best["reason"],
        })

    # ── Partial take (requires valid R — skipped in trailing-only mode) ─────────
    partial_r = PARTIAL_R_BY_REGIME.get(regime, 1.5)
    if (
        r_available
        and r_multiple is not None
        and r_multiple >= partial_r
        and "take_partial" not in pending
        and remaining
    ):
        sell_qty = remaining * 0.5
        actions.append({
            "position_id":  position["id"],
            "action_type":  "take_partial",
            "sell_percent": 50.0,
            "sell_quantity": sell_qty,
            "reason":       f"R={r_multiple:.2f} ≥ {partial_r}R ({regime}) — take 50% partial",
        })

    # ── Close full (stop hit) ─────────────────────────────────────────────────
    if current_sl is not None and "close_full" not in pending:
        stop_hit = (
            (direction == "long"  and price <= current_sl) or
            (direction == "short" and price >= current_sl)
        )
        if stop_hit:
            actions.append({
                "position_id": position["id"],
                "action_type": "close_full",
                "reason": (
                    f"Stop loss hit: price {price:.4f} "
                    f"{'≤' if direction == 'long' else '≥'} SL {current_sl}"
                ),
            })

    return actions


# ─── Main ─────────────────────────────────────────────────────────────────────

def run() -> None:
    log.info("Fetching open positions…")
    positions = api_get("/positions/open")
    log.info(f"Found {len(positions)} open/reduced position(s)")

    for pos in positions:
        ticker = pos["ticker"]
        market = pos.get("market")

        price = get_current_price(ticker, market=market)
        if price is None:
            log.warning(f"  [{ticker}] No price available, skipping")
            continue

        # Write market snapshot so risk-summary avoids Yahoo rate limits
        try:
            api_post("/market-snapshots/", {"ticker": ticker, "price": price})
            log.debug(f"  [{ticker}] Wrote market snapshot: price={price}")
        except requests.HTTPError as e:
            log.warning(f"  [{ticker}] Failed to write market snapshot: {e.response.text}")
        except Exception as e:
            log.warning(f"  [{ticker}] Failed to write market snapshot: {e}")

        # Update running price extremes (ATR trailing stop anchor)
        pos = update_price_context(pos, price)

        # Evaluate and submit actions
        actions_to_create = evaluate_position(pos, price)

        for action_data in actions_to_create:
            try:
                result = api_post("/position-actions/", action_data)
                is_new = result.get("created_at") and result.get("execution_state") == "pending"
                log.info(
                    f"  [{ticker}] {'Created' if is_new else 'Already pending'}: "
                    f"{action_data['action_type']} — {action_data.get('reason', '')}"
                )
            except requests.HTTPError as e:
                log.error(f"  [{ticker}] Failed to create action: {e.response.text}")


if __name__ == "__main__":
    run()
