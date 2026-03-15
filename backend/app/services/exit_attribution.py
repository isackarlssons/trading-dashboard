"""
exit_attribution.py — Deterministic exit-reason inference.

Given a closed position and its associated data, returns one of the canonical
exit-reason labels so trades can be grouped and analysed by how they ended.

Canonical values
----------------
target_hit                      Price reached / exceeded take-profit level.
stop_hit                        Price fell to the stop-loss level (long) or rose (short).
breakeven                       Stop was moved to breakeven and then got hit.
trailing_stop                   A raise_stop action was executed before the stop was hit.
manual_close                    Trader closed manually with no significant proximity to TP/SL.
partial_then_stop               Partial exit(s) taken, remainder stopped out.
partial_then_target             Partial exit(s) taken, remainder hit take-profit.
manual_partial_then_manual_close Partial exit(s) taken, remainder closed manually.
unknown                         Insufficient data to determine exit reason.
"""

from __future__ import annotations
from typing import Any


# ── Tolerance constants ────────────────────────────────────────────────────────
_SL_TOLERANCE  = 0.003   # ±0.3 % — price within this band of SL → "stop hit"
_TP_TOLERANCE  = 0.003   # ±0.3 % — price within this band of TP → "target hit"
_BE_TOLERANCE  = 0.003   # ±0.3 % — SL within this band of entry → "breakeven"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _is_target_hit(exit_price: float, take_profit: float, direction: str) -> bool:
    if direction == "long":
        return exit_price >= take_profit * (1 - _TP_TOLERANCE)
    else:
        return exit_price <= take_profit * (1 + _TP_TOLERANCE)


def _is_stop_hit(exit_price: float, stop_loss: float, direction: str) -> bool:
    if direction == "long":
        return exit_price <= stop_loss * (1 + _SL_TOLERANCE)
    else:
        return exit_price >= stop_loss * (1 - _SL_TOLERANCE)


def _is_breakeven_stop(
    stop_loss: float,
    entry_price: float,
    direction: str,
    position_actions: list[dict],
) -> bool:
    """True when the stop that was hit was at (or very near) the entry price,
    OR when an explicit move_stop_to_breakeven action was executed."""
    # Check for explicit breakeven action
    for action in position_actions:
        if (
            action.get("action_type") == "move_stop_to_breakeven"
            and action.get("execution_state") == "executed"
        ):
            return True

    # Geometric proximity check
    if entry_price and entry_price != 0:
        ratio = abs(stop_loss - entry_price) / entry_price
        return ratio <= _BE_TOLERANCE
    return False


def _has_trailing_stop(position_actions: list[dict]) -> bool:
    """True if at least one raise_stop action was executed before close."""
    return any(
        a.get("action_type") == "raise_stop"
        and a.get("execution_state") == "executed"
        for a in position_actions
    )


# ── Public API ────────────────────────────────────────────────────────────────

def infer_exit_reason(
    position: dict[str, Any],
    exit_price: float,
    partial_exits: list[dict],
    position_actions: list[dict],
) -> str:
    """Return a canonical exit-reason label for a just-closed position.

    Parameters
    ----------
    position:
        The position dict as returned from the DB (must include direction,
        actual_entry_price / entry_price, current_stop_loss / stop_loss,
        take_profit).
    exit_price:
        The final exit price (full close).
    partial_exits:
        List of partial-exit dicts already recorded for this position.
    position_actions:
        All PositionAction rows for this position (any execution_state).
    """
    direction    = position.get("direction", "long")
    entry_price  = position.get("actual_entry_price") or position.get("entry_price") or 0.0
    stop_loss    = position.get("current_stop_loss") or position.get("stop_loss")
    take_profit  = position.get("take_profit")
    has_partials = bool(partial_exits)

    # ── Branch: position had partial exits before final close ─────────────────
    if has_partials:
        if take_profit and _is_target_hit(exit_price, take_profit, direction):
            return "partial_then_target"

        if stop_loss and _is_stop_hit(exit_price, stop_loss, direction):
            if _is_breakeven_stop(stop_loss, entry_price, direction, position_actions):
                return "breakeven"
            return "partial_then_stop"

        return "manual_partial_then_manual_close"

    # ── Branch: straight close (no partials) ──────────────────────────────────
    if take_profit and _is_target_hit(exit_price, take_profit, direction):
        return "target_hit"

    if stop_loss and _is_stop_hit(exit_price, stop_loss, direction):
        if _is_breakeven_stop(stop_loss, entry_price, direction, position_actions):
            return "breakeven"
        if _has_trailing_stop(position_actions):
            return "trailing_stop"
        return "stop_hit"

    return "manual_close"
