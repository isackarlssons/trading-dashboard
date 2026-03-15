"""
fx.py — FX conversion helper for portfolio-level SEK calculations.

Architecture
────────────
The bot fetches live FX rates via yfinance and writes them to market_snapshots
(tickers like "USDSEK=X").  This backend service reads those snapshots — it
never calls yfinance directly so it works safely on Railway without rate-limit
errors.

Priority order for each rate:
  1. Fresh market_snapshots row   (< FX_STALE_HOURS hours old)
  2. Hardcoded conservative fallback with a clear warning
  3. rate_unavailable = True      (caller must handle gracefully)

Adding new currency pairs
─────────────────────────
  • Bot: add the pair ticker (e.g. "GBPSEK=X") to _FX_TICKERS in bot_manager.py
  • Here: add a hardcoded fallback to _FALLBACK_RATES
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime

log = logging.getLogger(__name__)

# Snapshot age limit for FX rates (more lenient than equities — FX moves slower)
_FX_STALE_HOURS = 8

# Conservative hardcoded fallbacks used when no snapshot is available.
# Update these occasionally; they are clearly flagged as fallbacks in the response.
_FALLBACK_RATES: dict[tuple[str, str], float] = {
    ("USD", "SEK"): 10.5,
    ("EUR", "SEK"): 11.4,
    ("NOK", "SEK"): 0.96,
    ("DKK", "SEK"): 1.53,
    ("GBP", "SEK"): 13.3,
}

# yfinance ticker format for each currency pair
_PAIR_TO_TICKER: dict[tuple[str, str], str] = {
    ("USD", "SEK"): "USDSEK=X",
    ("EUR", "SEK"): "EURSEK=X",
    ("NOK", "SEK"): "NOKSEK=X",
    ("DKK", "SEK"): "DKKSEK=X",
    ("GBP", "SEK"): "GBPSEK=X",
}


@dataclass
class FxResult:
    from_currency: str
    to_currency: str
    rate: float | None          # Conversion rate (from → to), or None
    rate_unavailable: bool      # True if no rate could be found at all
    source: str | None          # "identity" | "snapshot" | "fallback" | None
    warning: str | None         # Human-readable warning for callers to surface


def get_fx_rate(from_currency: str, to_currency: str = "SEK") -> FxResult:
    """Return the latest FX rate from from_currency to to_currency.

    Uses market_snapshots DB written by the bot.  Falls back to hardcoded rates
    with a warning.  Never calls yfinance — safe to call on Railway.
    """
    from_c = from_currency.upper()
    to_c   = to_currency.upper()

    if from_c == to_c:
        return FxResult(from_c, to_c, 1.0, False, "identity", None)

    pair = (from_c, to_c)
    ticker = _PAIR_TO_TICKER.get(pair)

    # ── Try market_snapshots ─────────────────────────────────────────────────
    if ticker:
        try:
            from app.core.supabase import get_supabase
            sb  = get_supabase()
            now = datetime.utcnow()

            snap = (
                sb.table("market_snapshots")
                .select("price, snapshot_time")
                .eq("ticker", ticker)
                .order("snapshot_time", desc=True)
                .limit(1)
                .execute()
            ).data

            if snap:
                raw_time = snap[0]["snapshot_time"]
                try:
                    dt = datetime.fromisoformat(raw_time.replace("Z", "+00:00"))
                    age_h = (now - dt.replace(tzinfo=None)).total_seconds() / 3600
                except Exception:
                    age_h = 999

                if age_h <= _FX_STALE_HOURS:
                    rate = float(snap[0]["price"])
                    log.debug("[fx] %s/%s: snapshot rate=%.4f age=%.1fh", from_c, to_c, rate, age_h)
                    return FxResult(from_c, to_c, rate, False, "snapshot", None)
                else:
                    log.info("[fx] %s/%s: snapshot stale (%.1fh) — using fallback", from_c, to_c, age_h)

        except Exception as exc:
            log.warning("[fx] DB lookup failed for %s/%s: %s", from_c, to_c, exc)

    # ── Hardcoded fallback ───────────────────────────────────────────────────
    if pair in _FALLBACK_RATES:
        rate = _FALLBACK_RATES[pair]
        warn = (
            f"Using hardcoded fallback rate {rate} for {from_c}/{to_c}. "
            "Run the bot to refresh FX snapshots."
        )
        log.warning("[fx] %s/%s: %s", from_c, to_c, warn)
        return FxResult(from_c, to_c, rate, False, "fallback", warn)

    # ── Unavailable ──────────────────────────────────────────────────────────
    warn = f"No FX rate available for {from_c}/{to_c}. Add it to _FALLBACK_RATES or run the bot."
    log.warning("[fx] %s", warn)
    return FxResult(from_c, to_c, None, True, None, warn)


def fetch_fx_rates_for_currencies(currencies: set[str], to_currency: str = "SEK") -> dict[str, FxResult]:
    """Batch-fetch FX rates for a set of currencies.

    Returns dict keyed by from_currency (e.g. {"USD": FxResult(...), "EUR": FxResult(...)}).
    SEK→SEK identity is included automatically.
    """
    result: dict[str, FxResult] = {}
    for c in currencies:
        result[c.upper()] = get_fx_rate(c, to_currency)
    return result
