"""
market_data.py — Shared market data helpers.

Single source of truth for:
  - get_price()          current price via yfinance fast_info
  - compute_live_atr()   14-day ATR from history (bot live fallback)
  - compute_live_regime() market regime detection (bot live fallback)

Used by both the backend (risk-summary) and the bot.
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


def compute_live_atr(ticker: str, period: int = 14) -> float | None:
    """Compute the current ATR for a ticker using yfinance history.

    Uses standard True Range definition:
        TR = max(High-Low, |High-PrevClose|, |Low-PrevClose|)
        ATR = rolling mean of TR over `period` bars

    Returns float ATR or None on failure.
    """
    try:
        import yfinance as yf
        import pandas as pd

        hist = yf.Ticker(ticker).history(period=f"{period * 3}d")
        if hist.empty or len(hist) < period:
            log.warning("[market_data] ATR: insufficient history for %r (%d bars)", ticker, len(hist))
            return None

        high = hist["High"]
        low = hist["Low"]
        close = hist["Close"]
        prev_close = close.shift(1)

        tr = pd.concat([
            high - low,
            (high - prev_close).abs(),
            (low - prev_close).abs(),
        ], axis=1).max(axis=1)

        atr = float(tr.rolling(period).mean().iloc[-1])
        if pd.isna(atr):
            return None

        log.debug("[market_data] ATR for %r: %.4f (period=%d)", ticker, atr, period)
        return atr

    except Exception as exc:
        log.warning("[market_data] ATR failed for %r: %s", ticker, exc)
        return None


def compute_live_regime(ticker: str) -> str:
    """Detect current market regime for a ticker.

    Returns one of: 'TRENDING', 'VOLATILE', 'CHOPPY'

    Logic:
      - ATR/price > 3%  → VOLATILE   (high absolute volatility)
      - price > MA50 and MA20 > MA50 → TRENDING  (uptrend structure)
      - otherwise       → CHOPPY

    Falls back to 'CHOPPY' on any error (most conservative exit thresholds).
    """
    try:
        import yfinance as yf
        import pandas as pd

        hist = yf.Ticker(ticker).history(period="65d")
        if hist.empty or len(hist) < 20:
            log.warning("[market_data] Regime: insufficient history for %r", ticker)
            return "CHOPPY"

        close = hist["Close"]
        high = hist["High"]
        low = hist["Low"]
        current = float(close.iloc[-1])

        # Compute ATR for volatility check
        prev_close = close.shift(1)
        tr = pd.concat([
            high - low,
            (high - prev_close).abs(),
            (low - prev_close).abs(),
        ], axis=1).max(axis=1)
        atr14 = float(tr.rolling(14).mean().iloc[-1])
        atr_pct = atr14 / current if current > 0 else 0

        ma20 = float(close.rolling(20).mean().iloc[-1])
        n_ma50 = min(50, len(close))
        ma50 = float(close.rolling(n_ma50).mean().iloc[-1])

        if atr_pct > 0.03:
            regime = "VOLATILE"
        elif current > ma50 and ma20 > ma50:
            regime = "TRENDING"
        else:
            regime = "CHOPPY"

        log.debug(
            "[market_data] Regime for %r: %s  (price=%.2f ma20=%.2f ma50=%.2f atr_pct=%.2f%%)",
            ticker, regime, current, ma20, ma50, atr_pct * 100,
        )
        return regime

    except Exception as exc:
        log.warning("[market_data] Regime failed for %r: %s — defaulting to CHOPPY", ticker, exc)
        return "CHOPPY"
