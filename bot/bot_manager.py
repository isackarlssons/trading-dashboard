"""
bot_manager.py — Position management bot.

Fetches open positions from the trading dashboard API and creates management
actions (raise stop, move to breakeven, take partial, close full) via API only.
Never writes directly to Supabase.

Usage:
    python bot_manager.py

Environment variables (required):
    DASHBOARD_API_URL   Base URL, e.g. https://your-api.example.com/api/v1
    DASHBOARD_API_TOKEN Supabase JWT from a service account or long-lived token

Optional environment variables:
    TRAILING_STOP_PCT   Trailing stop distance as fraction of entry (default 0.05 = 5%)
    PARTIAL_TAKE_PCT    Profit % at which to take 50% off the table (default 5.0)
    BREAKEVEN_AT_PCT    Profit % at which to move stop to breakeven (default 3.0)
"""

import os
import sys
import logging
import requests

logging.basicConfig(level=logging.DEBUG, format="%(asctime)s  %(levelname)s  %(message)s")
log = logging.getLogger("bot")

# ─── Config ──────────────────────────────────────────────────────────────────

try:
    API_BASE = os.environ["DASHBOARD_API_URL"].rstrip("/")
    TOKEN = os.environ["DASHBOARD_API_TOKEN"]
except KeyError as e:
    sys.exit(f"Missing required environment variable: {e}")

TRAILING_STOP_PCT = float(os.environ.get("TRAILING_STOP_PCT", "0.05"))
PARTIAL_TAKE_PCT  = float(os.environ.get("PARTIAL_TAKE_PCT", "5.0"))
BREAKEVEN_AT_PCT  = float(os.environ.get("BREAKEVEN_AT_PCT", "3.0"))

HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
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


# ─── Market data ─────────────────────────────────────────────────────────────

def get_current_price(ticker: str, market: str | None = None, symbol_override: str | None = None) -> float | None:
    """Fetch the latest price for a ticker.

    Args:
        ticker:          Position ticker from DB (e.g. "SLB")
        market:          Market field from position (e.g. "US", "SE") — informational
        symbol_override: Use this symbol instead of ticker (e.g. execution_symbol)

    Returns float price or None if unavailable.
    """
    lookup_symbol = symbol_override or ticker
    source = "yfinance/fast_info"

    log.debug(
        f"  [price] ticker={ticker!r}  market={market!r}  "
        f"symbol={lookup_symbol!r}  source={source}"
    )

    try:
        import yfinance as yf
        info = yf.Ticker(lookup_symbol).fast_info

        # ── Debug: show all available keys and their values ──────────────────
        try:
            available = {k: info[k] for k in info.keys()}
            log.debug(f"  [price] fast_info keys for {lookup_symbol!r}: {available}")
        except Exception:
            log.debug(f"  [price] fast_info not iterable for {lookup_symbol!r} — type: {type(info)}")

        # NOTE: fast_info uses camelCase keys, NOT snake_case.
        # Wrong:  "last_price", "regularMarketPrice"
        # Correct: "lastPrice"
        price = info.get("lastPrice") or info.get("regularMarketPreviousClose")

        log.debug(f"  [price] raw lastPrice={info.get('lastPrice')!r}  regularMarketPreviousClose={info.get('regularMarketPreviousClose')!r}  → selected={price!r}")

        if price:
            return float(price)

        log.warning(f"  [price] {lookup_symbol!r}: all price keys returned None/0 — position will be skipped")
        return None

    except Exception as e:
        log.warning(f"  [price] {lookup_symbol!r}: exception from yfinance: {type(e).__name__}: {e}")
        return None


# ─── Management logic ─────────────────────────────────────────────────────────

def existing_pending_types(position: dict) -> set[str]:
    """Return the set of action_types that already have a pending action."""
    return {
        a["action_type"]
        for a in (position.get("position_actions") or [])
        if a["execution_state"] == "pending"
    }


def evaluate_position(position: dict, price: float) -> list[dict]:
    """Return a list of actions to create for this position (may be empty)."""
    actions = []
    pending = existing_pending_types(position)

    entry = position.get("actual_entry_price") or position.get("entry_price")
    current_sl = position.get("current_stop_loss") or position.get("stop_loss")
    remaining = position.get("remaining_quantity") or position.get("quantity")

    if not entry:
        log.warning(f"  [{position['ticker']}] No entry price, skipping")
        return actions

    direction = position["direction"]

    if direction == "long":
        gain_pct = (price - entry) / entry * 100
        is_profitable = price > entry
    else:
        gain_pct = (entry - price) / entry * 100
        is_profitable = price < entry

    log.info(f"  [{position['ticker']}] {direction.upper()} | entry={entry} | price={price:.4f} | gain={gain_pct:.2f}%")

    # ── A. Move stop to breakeven ────────────────────────────────────────────
    if (
        gain_pct >= BREAKEVEN_AT_PCT
        and is_profitable
        and current_sl is not None
        and "move_stop_to_breakeven" not in pending
    ):
        # Only suggest if current SL is still below breakeven (long) or above (short)
        needs_be = (direction == "long" and current_sl < entry) or \
                   (direction == "short" and current_sl > entry)
        if needs_be:
            actions.append({
                "position_id": position["id"],
                "action_type": "move_stop_to_breakeven",
                "new_stop_loss": entry,
                "reason": f"Gain {gain_pct:.1f}% ≥ {BREAKEVEN_AT_PCT}% — move stop to breakeven {entry}",
            })

    # ── B. Raise stop (trailing) ─────────────────────────────────────────────
    if "raise_stop" not in pending and current_sl is not None and is_profitable:
        if direction == "long":
            trailing_sl = round(price * (1 - TRAILING_STOP_PCT), 4)
            if trailing_sl > current_sl + 0.001:
                actions.append({
                    "position_id": position["id"],
                    "action_type": "raise_stop",
                    "old_stop_loss": current_sl,
                    "new_stop_loss": trailing_sl,
                    "reason": f"Trailing stop: price {price:.4f} → SL {trailing_sl:.4f} ({TRAILING_STOP_PCT*100:.0f}% trail)",
                })
        else:  # short
            trailing_sl = round(price * (1 + TRAILING_STOP_PCT), 4)
            if trailing_sl < current_sl - 0.001:
                actions.append({
                    "position_id": position["id"],
                    "action_type": "raise_stop",
                    "old_stop_loss": current_sl,
                    "new_stop_loss": trailing_sl,
                    "reason": f"Trailing stop (short): price {price:.4f} → SL {trailing_sl:.4f}",
                })

    # ── C. Take partial profit ───────────────────────────────────────────────
    if (
        gain_pct >= PARTIAL_TAKE_PCT
        and "take_partial" not in pending
        and remaining
    ):
        sell_qty = remaining * 0.5  # take 50% off
        actions.append({
            "position_id": position["id"],
            "action_type": "take_partial",
            "sell_percent": 50.0,
            "sell_quantity": sell_qty,
            "reason": f"Gain {gain_pct:.1f}% ≥ {PARTIAL_TAKE_PCT}% — take 50% partial",
        })

    # ── D. Close full (stop hit) ─────────────────────────────────────────────
    if current_sl is not None and "close_full" not in pending:
        stop_hit = (direction == "long" and price <= current_sl) or \
                   (direction == "short" and price >= current_sl)
        if stop_hit:
            actions.append({
                "position_id": position["id"],
                "action_type": "close_full",
                "reason": f"Stop loss hit: price {price:.4f} {'≤' if direction == 'long' else '≥'} SL {current_sl}",
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

        actions_to_create = evaluate_position(pos, price)

        for action_data in actions_to_create:
            try:
                result = api_post("/position-actions/", action_data)
                # If the action already existed (dedup), the API returns the existing one
                is_new = result.get("created_at") and result.get("execution_state") == "pending"
                log.info(
                    f"  [{ticker}] {'Created' if is_new else 'Already pending'}: "
                    f"{action_data['action_type']} — {action_data.get('reason', '')}"
                )
            except requests.HTTPError as e:
                log.error(f"  [{ticker}] Failed to create action: {e.response.text}")


if __name__ == "__main__":
    run()
