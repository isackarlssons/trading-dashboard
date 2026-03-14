"""
bot_manager.py — Position management bot example.

Fetches open positions via the dashboard API and posts management actions
(raise stop, take partial, etc.) back through the API. Never touches the DB.

Usage:
    python bot_manager.py

Environment variables:
    DASHBOARD_API_URL   e.g. https://your-api.example.com/api/v1
    DASHBOARD_API_TOKEN Bearer token (Supabase JWT from a service account)
"""

import os
import requests

API_BASE = os.environ["DASHBOARD_API_URL"].rstrip("/")
TOKEN = os.environ["DASHBOARD_API_TOKEN"]

HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
}


def api_get(path: str) -> list | dict:
    r = requests.get(f"{API_BASE}{path}", headers=HEADERS, timeout=15)
    r.raise_for_status()
    return r.json()


def api_post(path: str, body: dict) -> dict:
    r = requests.post(f"{API_BASE}{path}", json=body, headers=HEADERS, timeout=15)
    r.raise_for_status()
    return r.json()


# ─── Analysis helpers ────────────────────────────────────────────────────────

def should_raise_stop(position: dict, current_price: float) -> float | None:
    """Return a new stop-loss level if the trailing stop should be raised."""
    entry = position.get("actual_entry_price") or position.get("entry_price")
    current_sl = position.get("current_stop_loss") or position.get("stop_loss")
    if not entry or not current_sl:
        return None

    if position["direction"] == "long":
        gain_pct = (current_price - entry) / entry * 100
        # Example: raise stop to break-even once 3 % in profit
        if gain_pct >= 3.0 and current_sl < entry:
            return entry  # move to break-even
        # Example: trailing stop at 50 % of current gain
        trailing = current_price - (current_price - entry) * 0.5
        if trailing > current_sl + 0.01:
            return round(trailing, 2)
    else:
        gain_pct = (entry - current_price) / entry * 100
        if gain_pct >= 3.0 and current_sl > entry:
            return entry
        trailing = current_price + (entry - current_price) * 0.5
        if trailing < current_sl - 0.01:
            return round(trailing, 2)

    return None


def should_take_partial(position: dict, current_price: float) -> float | None:
    """Return sell_percent if a partial exit should be taken."""
    entry = position.get("actual_entry_price") or position.get("entry_price")
    if not entry:
        return None

    if position["direction"] == "long":
        gain_pct = (current_price - entry) / entry * 100
    else:
        gain_pct = (entry - current_price) / entry * 100

    # Example: take 50 % off the table at 5 % gain
    if gain_pct >= 5.0:
        return 50.0

    return None


def get_current_price(ticker: str) -> float | None:
    """Placeholder: fetch real-time price from your data source."""
    # Replace with your actual market data call (e.g. yfinance, broker API).
    return None


# ─── Main loop ───────────────────────────────────────────────────────────────

def run() -> None:
    positions = api_get("/positions/open")
    print(f"[bot] {len(positions)} open/reduced position(s)")

    for pos in positions:
        ticker = pos["ticker"]
        pos_id = pos["id"]

        current_price = get_current_price(ticker)
        if current_price is None:
            print(f"  [{ticker}] price unavailable, skipping")
            continue

        existing_action_types = {
            a["action_type"]
            for a in (pos.get("position_actions") or [])
            if a["execution_state"] == "pending"
        }

        # ── Raise stop ────────────────────────────────────────────────────
        new_sl = should_raise_stop(pos, current_price)
        if new_sl and "raise_stop" not in existing_action_types:
            old_sl = pos.get("current_stop_loss") or pos.get("stop_loss")
            action = api_post("/position-actions/", {
                "position_id": pos_id,
                "action_type": "raise_stop",
                "old_stop_loss": old_sl,
                "new_stop_loss": new_sl,
                "reason": f"Trailing stop: price {current_price} → new SL {new_sl}",
            })
            print(f"  [{ticker}] raise_stop action created (id={action['id']})")

        # ── Take partial ──────────────────────────────────────────────────
        sell_pct = should_take_partial(pos, current_price)
        if sell_pct and "take_partial" not in existing_action_types:
            remaining = pos.get("remaining_quantity") or pos.get("quantity")
            sell_qty = round((remaining or 0) * sell_pct / 100, 4) if remaining else None
            action = api_post("/position-actions/", {
                "position_id": pos_id,
                "action_type": "take_partial",
                "sell_percent": sell_pct,
                "sell_quantity": sell_qty,
                "reason": f"Partial exit at {sell_pct:.0f}% gain (price={current_price})",
            })
            print(f"  [{ticker}] take_partial action created (id={action['id']})")


if __name__ == "__main__":
    run()
