"""
portfolio.py — Portfolio-level helpers.

Provides:
  get_instrument_currency(item)         Detect the ISO currency of a position/signal/trade.
  normalize_strategy_family(name)       Map a strategy name to its family (strip market suffix).
  convert_to_base(value, currency, fx)  Convert a value to the portfolio base currency (SEK).

These helpers are intentionally pure Python (no DB calls) so they can be
used in any context — API routes, analytics endpoints, the bot, etc.
"""

from __future__ import annotations

import re

# ─── Base currency ────────────────────────────────────────────────────────────

BASE_CURRENCY = "SEK"

# ─── Instrument currency detection ───────────────────────────────────────────

# Maps the `market` field stored on positions/signals to ISO currency codes.
_MARKET_TO_CURRENCY: dict[str, str] = {
    "US":     "USD",
    "SE":     "SEK",
    "NO":     "NOK",
    "DK":     "DKK",
    "FI":     "EUR",
    "EU":     "EUR",
    "DE":     "EUR",
    "FR":     "EUR",
    "GB":     "GBP",
}

# Ticker exchange suffixes that identify the currency unambiguously.
_TICKER_SUFFIX_CURRENCY: dict[str, str] = {
    ".ST":  "SEK",   # Nasdaq Stockholm
    ".HE":  "EUR",   # Nasdaq Helsinki
    ".CO":  "DKK",   # Nasdaq Copenhagen
    ".OL":  "NOK",   # Oslo Børs
    ".L":   "GBP",   # London Stock Exchange
    ".PA":  "EUR",   # Euronext Paris
    ".AS":  "EUR",   # Euronext Amsterdam
    ".DE":  "EUR",   # XETRA Frankfurt
}


def get_instrument_currency(item: dict) -> str:
    """Determine the ISO currency code for a position, signal, or trade dict.

    Priority:
      1. Explicit instrument_currency field (already stored)
      2. market field  →  _MARKET_TO_CURRENCY lookup
      3. Ticker suffix →  _TICKER_SUFFIX_CURRENCY lookup
      4. Default: USD  (most instruments in the system are US equities)
    """
    explicit = (item.get("instrument_currency") or "").strip().upper()
    if explicit and len(explicit) == 3:
        return explicit

    market = (item.get("market") or "").strip().upper()
    if market in _MARKET_TO_CURRENCY:
        return _MARKET_TO_CURRENCY[market]

    ticker = (item.get("ticker") or "").strip().upper()
    for suffix, currency in _TICKER_SUFFIX_CURRENCY.items():
        if ticker.endswith(suffix.upper()):
            return currency

    return "USD"


# ─── Strategy family normalization ───────────────────────────────────────────

# Known geographic market suffixes to strip from the end of a strategy name.
_MARKET_SUFFIXES = re.compile(
    r"_(us|se|eu|gb|no|dk|fi|global|nordic|europe|americas)$",
    re.IGNORECASE,
)

# Known structural prefixes to strip from the beginning.
_STRUCTURAL_PREFIXES = re.compile(r"^(zone_|strat_|sys_)", re.IGNORECASE)

# Optional explicit overrides for edge cases that the regex can't handle.
_EXPLICIT_FAMILY_MAP: dict[str, str] = {
    # Add overrides here if needed, e.g.:
    # "my_special_strategy_v2": "my_special_strategy",
}


def normalize_strategy_family(name: str) -> str:
    """Return the strategy family for a strategy name.

    Examples:
        zone_very_strong_us  →  very_strong
        zone_very_strong_se  →  very_strong
        mean_reversion_us    →  mean_reversion
        mean_reversion_se    →  mean_reversion
        momentum_eu          →  momentum

    Falls back to the original name (lowercased) if no pattern matches.
    Also checks the optional explicit override map first.
    """
    key = name.strip().lower()
    if key in _EXPLICIT_FAMILY_MAP:
        return _EXPLICIT_FAMILY_MAP[key]

    # Strip geographic suffix (may be repeated, e.g. zone_foo_se → zone_foo)
    family = _MARKET_SUFFIXES.sub("", key)
    # Strip structural prefix
    family = _STRUCTURAL_PREFIXES.sub("", family)
    return family or key


# ─── Currency conversion ──────────────────────────────────────────────────────


def convert_to_base(
    value: float,
    instrument_currency: str,
    fx_rates: dict[str, float],  # {currency: rate_to_SEK}
) -> tuple[float | None, bool]:
    """Convert a value in instrument_currency to the portfolio base currency (SEK).

    Args:
        value:               The value to convert.
        instrument_currency: Three-letter ISO code (e.g. "USD").
        fx_rates:            Pre-fetched dict mapping currency → rate (e.g. {"USD": 10.5}).
                             "SEK" should map to 1.0 (or be absent — handled automatically).

    Returns:
        (converted_value, fx_was_unavailable)
        If the rate is missing: (None, True)
        If currency is SEK:     (value, False)
    """
    currency = instrument_currency.upper()

    if currency == BASE_CURRENCY:
        return value, False

    rate = fx_rates.get(currency)
    if rate is None or rate <= 0:
        return None, True

    return round(value * rate, 2), False
