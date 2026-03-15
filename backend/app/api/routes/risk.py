"""
risk.py — Portfolio risk validation endpoint.

POST /api/v1/risk/validate-entry
    Checks whether a proposed new trade is safe to enter given current
    portfolio state.  Called by the frontend "Ta trade" flow before
    a position is created.
"""

from fastapi import APIRouter, Depends

from app.core.supabase import get_supabase
from app.core.auth import get_current_user
from app.services.fx import fetch_fx_rates_for_currencies
from app.services.portfolio import BASE_CURRENCY, get_instrument_currency, normalize_strategy_family
from app.services.risk_engine import validate_new_position

router = APIRouter(prefix="/risk", tags=["risk"])


@router.post("/validate-entry")
async def validate_entry(
    data: dict,
    user: dict = Depends(get_current_user),
):
    """Validate whether a new trade is safe to enter.

    Request body:
        ticker           str     Required
        direction        str     Required  ("long" | "short")
        entry_price      float   Required
        stop_loss        float   Optional  — skips risk-size checks when absent
        quantity         float   Optional  — skips risk-size checks when absent
        strategy_id      str     Optional  — resolved to strategy_family from DB
        strategy_family  str     Optional  — explicit override; takes precedence
        sector           str     Optional  — explicit override for sector check
        instrument_currency str  Optional  — ISO code; derived from ticker/market if absent
        market           str     Optional  — used for instrument_currency derivation

    Response: full RiskValidation object (see RiskValidation type in frontend).
    """
    sb = get_supabase()

    ticker      = (data.get("ticker") or "").upper()
    direction   = data.get("direction", "long")
    entry_price = float(data.get("entry_price", 0))
    stop_loss   = float(data["stop_loss"])   if data.get("stop_loss")   is not None else None
    quantity    = float(data["quantity"])    if data.get("quantity")    is not None else None
    sector      = data.get("sector") or None

    # ── Strategy family resolution ────────────────────────────────────────────
    # Priority: explicit strategy_family in payload → lookup by strategy_id → None

    # Build a full strategy_id → family map from DB (also needed for existing
    # position lookups in validate_new_position).
    strategies_raw = (
        sb.table("strategies").select("id, name, strategy_family").execute().data or []
    )
    strategy_map: dict[str, str] = {}
    for s in strategies_raw:
        fam = s.get("strategy_family") or normalize_strategy_family(s["name"])
        strategy_map[s["id"]] = fam

    strategy_family: str | None = data.get("strategy_family") or None
    if not strategy_family and data.get("strategy_id"):
        strategy_family = strategy_map.get(data["strategy_id"])

    # ── Instrument currency ───────────────────────────────────────────────────
    new_trade_currency = (
        data.get("instrument_currency")
        or get_instrument_currency({
            "ticker":              ticker,
            "market":              data.get("market"),
            "instrument_currency": data.get("instrument_currency"),
        })
    )

    # ── Fetch current open/reduced positions ──────────────────────────────────
    positions = (
        sb.table("positions")
        .select(
            "id, ticker, direction, status, actual_entry_price, entry_price, "
            "current_stop_loss, stop_loss, remaining_quantity, quantity, "
            "instrument_currency, market, entry_context"
        )
        .in_("status", ["open", "reduced"])
        .execute()
    ).data or []

    # ── FX rates ──────────────────────────────────────────────────────────────
    currencies = {get_instrument_currency(p) for p in positions} | {new_trade_currency}
    fx_results = fetch_fx_rates_for_currencies(currencies, to_currency=BASE_CURRENCY)
    fx_rates   = {c: r.rate for c, r in fx_results.items() if r.rate is not None}

    # ── Run validation ────────────────────────────────────────────────────────
    return validate_new_position(
        ticker=ticker,
        direction=direction,
        entry_price=entry_price,
        stop_loss=stop_loss,
        quantity=quantity,
        strategy_family=strategy_family,
        sector=sector,
        instrument_currency=new_trade_currency,
        positions=positions,
        strategy_map=strategy_map,
        fx_rates=fx_rates,
    )
