"""
risk_engine.py — Portfolio Risk Engine v1+

Validates whether a new trade is safe to enter, given current portfolio state.
All monetary thresholds are in SEK (base currency).

v1 limits are hardcoded constants in this file for clarity and easy editing.
To move them to a settings table later: load from DB at startup and pass them
in, or replace the module-level constants with a settings loader.
"""

from __future__ import annotations

import logging

log = logging.getLogger(__name__)

# ─── Risk limits (v1 hardcoded) ───────────────────────────────────────────────
# Edit these values to adjust portfolio-level constraints.

MAX_TOTAL_PORTFOLIO_RISK_SEK: float = 3_000.0   # Total open risk across all positions
MAX_OPEN_POSITIONS:            int   = 5          # Max simultaneous open + reduced positions
MAX_RISK_PER_TRADE_SEK:        float = 1_000.0   # Risk cap for any single new trade
MAX_RISK_PER_STRATEGY_SEK:     float = 1_800.0   # Combined risk cap per strategy family
MAX_POSITIONS_PER_SECTOR:      int   = 2          # Max open positions in the same sector


# ─── Sector lookup (v1 internal map) ─────────────────────────────────────────
# Maps UPPERCASE ticker (with or without exchange suffix) → sector label.
# If a ticker is missing from this map, the sector check is skipped with a
# warning.  Add tickers here as the portfolio grows.

_TICKER_SECTORS: dict[str, str] = {
    # Technology
    "AAPL":         "Technology",
    "MSFT":         "Technology",
    "NVDA":         "Technology",
    "GOOGL":        "Technology",
    "GOOG":         "Technology",
    "META":         "Technology",
    "NFLX":         "Technology",
    "AMD":          "Technology",
    "INTC":         "Technology",
    "QCOM":         "Technology",
    "ORCL":         "Technology",
    "CRM":          "Technology",
    "ADBE":         "Technology",
    "ASML":         "Technology",
    "ERIC-B.ST":    "Technology",
    "KIND-SDB.ST":  "Technology",
    # Consumer Cyclical / Discretionary
    "TSLA":         "Consumer Cyclical",
    "AMZN":         "Consumer Cyclical",
    "NKE":          "Consumer Cyclical",
    "SBUX":         "Consumer Cyclical",
    "EVO.ST":       "Consumer Cyclical",
    "BETS-B.ST":    "Consumer Cyclical",
    # Financials
    "JPM":          "Financials",
    "GS":           "Financials",
    "BAC":          "Financials",
    "MS":           "Financials",
    "WFC":          "Financials",
    "C":            "Financials",
    "SHB-A.ST":     "Financials",
    "SEB-A.ST":     "Financials",
    "SWED-A.ST":    "Financials",
    # Healthcare
    "JNJ":          "Healthcare",
    "PFE":          "Healthcare",
    "ABBV":         "Healthcare",
    "MRK":          "Healthcare",
    "LLY":          "Healthcare",
    "BMY":          "Healthcare",
    "UNH":          "Healthcare",
    "AZN.ST":       "Healthcare",
    "SOBI.ST":      "Healthcare",
    # Energy
    "XOM":          "Energy",
    "CVX":          "Energy",
    "COP":          "Energy",
    # Consumer Staples
    "PG":           "Consumer Staples",
    "KO":           "Consumer Staples",
    "PEP":          "Consumer Staples",
    "WMT":          "Consumer Staples",
    "COST":         "Consumer Staples",
    # Industrials
    "ABB.ST":       "Industrials",
    "VOLV-B.ST":    "Industrials",
    "SAND.ST":      "Industrials",
    "ASSA-B.ST":    "Industrials",
    "ALFA.ST":      "Industrials",
    "SKF-B.ST":     "Industrials",
    "ATCO-A.ST":    "Industrials",
    "CAT":          "Industrials",
    "DE":           "Industrials",
    "HON":          "Industrials",
}


def _lookup_sector(ticker: str) -> str | None:
    """Return sector for ticker, checking both raw and exchange-suffix-stripped forms.

    E.g. "VOLV-B.ST" → matches "VOLV-B.ST" directly.
         "AAPL.US"   → strips suffix → "AAPL" → matches.
    """
    t = ticker.upper()
    if t in _TICKER_SECTORS:
        return _TICKER_SECTORS[t]
    # Try bare ticker (strip exchange suffix after last ".")
    if "." in t:
        bare = t.rsplit(".", 1)[0]
        if bare in _TICKER_SECTORS:
            return _TICKER_SECTORS[bare]
    return None


def _position_risk_sek(pos: dict, fx_rates: dict[str, float]) -> float:
    """Compute a single open/reduced position's risk to stop in SEK.

    Formula (consistent with Risk Monitor and positions.py risk-summary):
        Long:  max(0, (actual_entry_price - current_stop_loss) * remaining_quantity)
        Short: max(0, (current_stop_loss - actual_entry_price) * remaining_quantity)

    Returns 0.0 when data is missing or FX rate is unavailable (conservative —
    avoids blocking trades due to missing data on existing positions).
    """
    from app.services.portfolio import get_instrument_currency, convert_to_base

    entry = pos.get("actual_entry_price") or pos.get("entry_price")
    sl    = pos.get("current_stop_loss")  or pos.get("stop_loss")
    qty   = float(pos.get("remaining_quantity") or pos.get("quantity") or 0)

    if not entry or not sl or qty <= 0:
        return 0.0

    direction   = pos.get("direction", "long")
    raw         = (entry - sl) * qty if direction == "long" else (sl - entry) * qty
    risk_native = max(0.0, raw)

    currency          = get_instrument_currency(pos)
    converted, unavail = convert_to_base(risk_native, currency, fx_rates)
    return converted if (not unavail and converted is not None) else 0.0


def _position_strategy_family(pos: dict, strategy_map: dict[str, str]) -> str | None:
    """Resolve a position's strategy family from its stored entry_context."""
    ec = pos.get("entry_context")
    if not isinstance(ec, dict):
        return None
    sid = ec.get("strategy_id")
    return strategy_map.get(sid) if sid else None


def validate_new_position(
    *,
    ticker: str,
    direction: str,
    entry_price: float,
    stop_loss: float | None,
    quantity: float | None,
    strategy_family: str | None,
    sector: str | None,
    instrument_currency: str,
    positions: list[dict],          # open/reduced positions fetched from DB
    strategy_map: dict[str, str],   # {strategy_id → strategy_family}
    fx_rates: dict[str, float],     # {currency → rate_to_SEK}
) -> dict:
    """Run all 5 portfolio risk checks for a proposed new trade.

    Returns a dict with:
        allowed                       bool
        blocking_reasons              list[str]
        warnings                      list[str]
        trade_risk_sek                float
        current_portfolio_risk_sek    float
        portfolio_risk_after_entry_sek float
        current_open_positions        int
        max_open_positions            int
        max_total_portfolio_risk_sek  float
        max_risk_per_trade_sek        float
        current_strategy_risk_sek     float | None
        strategy_risk_after_entry_sek float | None
        max_risk_per_strategy_sek     float
        current_sector_positions      int | None
        sector_positions_after_entry  int | None
        max_positions_per_sector      int
    """
    from app.services.portfolio import convert_to_base

    blocking: list[str] = []
    warnings: list[str] = []

    # ── Sector resolution ─────────────────────────────────────────────────────
    resolved_sector = sector or _lookup_sector(ticker)
    sector_known    = resolved_sector is not None
    if not sector_known:
        warnings.append(
            f"Sector unknown for {ticker} — sector concentration check skipped"
        )
        log.info("[risk-engine] sector unknown for %s — sector block skipped", ticker)

    # ── Strategy family ───────────────────────────────────────────────────────
    family_known = strategy_family is not None
    if not family_known:
        warnings.append(
            "Strategy family unknown — strategy concentration check skipped"
        )
        log.info("[risk-engine] strategy_family unknown — strategy block skipped")

    # ── New trade risk in SEK ─────────────────────────────────────────────────
    trade_risk_sek = 0.0
    if stop_loss is not None and quantity is not None and quantity > 0:
        raw = (
            (entry_price - stop_loss) * quantity if direction == "long"
            else (stop_loss - entry_price) * quantity
        )
        trade_risk_native  = max(0.0, raw)
        converted, unavail = convert_to_base(trade_risk_native, instrument_currency, fx_rates)
        if unavail or converted is None:
            warnings.append(
                f"FX rate unavailable for {instrument_currency} — "
                "trade risk could not be converted to SEK; risk checks may be skipped"
            )
            log.warning(
                "[risk-engine] FX unavailable for %s — trade risk treated as 0", instrument_currency
            )
        else:
            trade_risk_sek = converted
    else:
        if stop_loss is None:
            warnings.append("No stop_loss on signal — per-trade and portfolio risk checks skipped")
        elif quantity is None or quantity <= 0:
            warnings.append("No quantity provided — per-trade and portfolio risk checks skipped")

    # ── Current portfolio state ───────────────────────────────────────────────
    active             = [p for p in positions if p.get("status") in ("open", "reduced")]
    current_open_count = len(active)

    current_portfolio_risk_sek     = sum(_position_risk_sek(p, fx_rates) for p in active)
    portfolio_risk_after_entry_sek = current_portfolio_risk_sek + trade_risk_sek

    # ── Strategy family exposure ──────────────────────────────────────────────
    current_strategy_risk_sek     = None
    strategy_risk_after_entry_sek = None
    if family_known:
        fam_positions = [
            p for p in active
            if _position_strategy_family(p, strategy_map) == strategy_family
        ]
        current_strategy_risk_sek     = sum(_position_risk_sek(p, fx_rates) for p in fam_positions)
        strategy_risk_after_entry_sek = current_strategy_risk_sek + trade_risk_sek

    # ── Sector concentration ──────────────────────────────────────────────────
    current_sector_positions     = None
    sector_positions_after_entry = None
    if sector_known:
        sector_active = [
            p for p in active
            if _lookup_sector(p.get("ticker", "")) == resolved_sector
        ]
        current_sector_positions     = len(sector_active)
        sector_positions_after_entry = current_sector_positions + 1

    # ── Rule 1: Total portfolio risk ──────────────────────────────────────────
    if trade_risk_sek > 0 and portfolio_risk_after_entry_sek > MAX_TOTAL_PORTFOLIO_RISK_SEK:
        blocking.append(
            f"Total portfolio risk would reach {portfolio_risk_after_entry_sek:.0f} SEK "
            f"(limit {MAX_TOTAL_PORTFOLIO_RISK_SEK:.0f} SEK, "
            f"current {current_portfolio_risk_sek:.0f} SEK)"
        )

    # ── Rule 2: Open position count ───────────────────────────────────────────
    if current_open_count >= MAX_OPEN_POSITIONS:
        blocking.append(
            f"Already at maximum open positions ({current_open_count}/{MAX_OPEN_POSITIONS})"
        )

    # ── Rule 3: Per-trade risk ────────────────────────────────────────────────
    if trade_risk_sek > MAX_RISK_PER_TRADE_SEK:
        blocking.append(
            f"Trade risk {trade_risk_sek:.0f} SEK exceeds per-trade limit "
            f"of {MAX_RISK_PER_TRADE_SEK:.0f} SEK"
        )

    # ── Rule 4: Strategy family concentration ─────────────────────────────────
    if (
        family_known
        and strategy_risk_after_entry_sek is not None
        and trade_risk_sek > 0
        and strategy_risk_after_entry_sek > MAX_RISK_PER_STRATEGY_SEK
    ):
        blocking.append(
            f"Strategy family '{strategy_family}' risk would reach "
            f"{strategy_risk_after_entry_sek:.0f} SEK "
            f"(limit {MAX_RISK_PER_STRATEGY_SEK:.0f} SEK, "
            f"current {current_strategy_risk_sek:.0f} SEK)"
        )

    # ── Rule 5: Sector concentration ──────────────────────────────────────────
    if (
        sector_known
        and sector_positions_after_entry is not None
        and sector_positions_after_entry > MAX_POSITIONS_PER_SECTOR
    ):
        blocking.append(
            f"Sector '{resolved_sector}' would have {sector_positions_after_entry} positions "
            f"(limit {MAX_POSITIONS_PER_SECTOR})"
        )

    log.info(
        "[risk-engine] %s %s: trade_risk=%.0f SEK  portfolio=%.0f→%.0f SEK  "
        "positions=%d/%d  family=%s  sector=%s  allowed=%s  blocking=%d",
        direction, ticker, trade_risk_sek,
        current_portfolio_risk_sek, portfolio_risk_after_entry_sek,
        current_open_count, MAX_OPEN_POSITIONS,
        strategy_family or "?", resolved_sector or "?",
        len(blocking) == 0, len(blocking),
    )

    return {
        "allowed":                        len(blocking) == 0,
        "blocking_reasons":               blocking,
        "warnings":                       warnings,
        "trade_risk_sek":                 round(trade_risk_sek, 2),
        "current_portfolio_risk_sek":     round(current_portfolio_risk_sek, 2),
        "portfolio_risk_after_entry_sek": round(portfolio_risk_after_entry_sek, 2),
        "current_open_positions":         current_open_count,
        "max_open_positions":             MAX_OPEN_POSITIONS,
        "max_total_portfolio_risk_sek":   MAX_TOTAL_PORTFOLIO_RISK_SEK,
        "max_risk_per_trade_sek":         MAX_RISK_PER_TRADE_SEK,
        "current_strategy_risk_sek":      round(current_strategy_risk_sek, 2) if current_strategy_risk_sek is not None else None,
        "strategy_risk_after_entry_sek":  round(strategy_risk_after_entry_sek, 2) if strategy_risk_after_entry_sek is not None else None,
        "max_risk_per_strategy_sek":      MAX_RISK_PER_STRATEGY_SEK,
        "current_sector_positions":       current_sector_positions,
        "sector_positions_after_entry":   sector_positions_after_entry,
        "max_positions_per_sector":       MAX_POSITIONS_PER_SECTOR,
    }
