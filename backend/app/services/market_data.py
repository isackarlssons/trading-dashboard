"""
market_data.py — Shared live price helper.

Single source of truth for fetching current market prices via yfinance.
Used by both the backend (risk-summary endpoint) and the bot.
"""

import logging
from dataclasses import dataclass

log = logging.getLogger(__name__)


@dataclass
class PriceResult:
    ticker: str
    symbol: str                  # Symbol actually used for lookup
    current_price: float | None
    price_unavailable: bool
    fallback_used: bool          # True if regularMarketPreviousClose was used
    error: str | None            # Exception message if lookup failed


def get_price(ticker: str, market: str | None = None, symbol_override: str | None = None) -> PriceResult:
    """Fetch the latest price for a ticker via yfinance fast_info.

    Args:
        ticker:          Position ticker as stored in DB (e.g. "SLB").
        market:          Market field from position (e.g. "US", "SE") — informational only.
        symbol_override: If set, use this symbol instead of ticker for lookup.

    Returns:
        PriceResult dataclass with current_price, price_unavailable, fallback_used, error.
    """
    symbol = symbol_override or ticker

    log.debug(
        "[market_data] get_price: ticker=%r  market=%r  symbol=%r",
        ticker, market, symbol,
    )

    try:
        import yfinance as yf
        info = yf.Ticker(symbol).fast_info

        # Debug: log all available keys and values
        try:
            available = {k: info[k] for k in info.keys()}
            log.debug("[market_data] fast_info for %r: %s", symbol, available)
        except Exception:
            log.debug("[market_data] fast_info for %r is not iterable — type: %s", symbol, type(info))

        # NOTE: fast_info uses camelCase keys.
        # "lastPrice" is the primary key; fallback to previous close when market is closed.
        last_price = info.get("lastPrice")
        prev_close = info.get("regularMarketPreviousClose")

        log.debug(
            "[market_data] %r: lastPrice=%r  regularMarketPreviousClose=%r",
            symbol, last_price, prev_close,
        )

        if last_price:
            log.debug("[market_data] %r: selected lastPrice=%r", symbol, last_price)
            return PriceResult(
                ticker=ticker,
                symbol=symbol,
                current_price=float(last_price),
                price_unavailable=False,
                fallback_used=False,
                error=None,
            )

        if prev_close:
            log.debug("[market_data] %r: lastPrice unavailable — using prev_close=%r", symbol, prev_close)
            return PriceResult(
                ticker=ticker,
                symbol=symbol,
                current_price=float(prev_close),
                price_unavailable=False,
                fallback_used=True,
                error=None,
            )

        msg = f"both lastPrice and regularMarketPreviousClose returned None/0"
        log.warning("[market_data] %r: %s", symbol, msg)
        return PriceResult(
            ticker=ticker,
            symbol=symbol,
            current_price=None,
            price_unavailable=True,
            fallback_used=False,
            error=msg,
        )

    except ImportError:
        msg = "yfinance not installed"
        log.warning("[market_data] %s", msg)
        return PriceResult(
            ticker=ticker,
            symbol=symbol,
            current_price=None,
            price_unavailable=True,
            fallback_used=False,
            error=msg,
        )

    except Exception as exc:
        msg = f"{type(exc).__name__}: {exc}"
        log.warning("[market_data] %r: exception — %s", symbol, msg)
        return PriceResult(
            ticker=ticker,
            symbol=symbol,
            current_price=None,
            price_unavailable=True,
            fallback_used=False,
            error=msg,
        )
