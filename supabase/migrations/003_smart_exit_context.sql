-- ============================================================================
-- Migration 003: Smart exit context — position entry metadata
--
-- Adds fields that let the bot perform R-multiple and ATR-based exits without
-- relying on signal lookups or live data at decision time.
--
-- Safe to re-run: all ALTER TABLE use IF NOT EXISTS.
-- ============================================================================

-- ─── POSITIONS: smart exit context ──────────────────────────────────────────

-- Risk reference (must-have for R-multiple calculations)
ALTER TABLE positions ADD COLUMN IF NOT EXISTS initial_stop_loss       DOUBLE PRECISION;
ALTER TABLE positions ADD COLUMN IF NOT EXISTS initial_risk_per_share  DOUBLE PRECISION;

-- Market context at entry (used for regime-aware thresholds)
ALTER TABLE positions ADD COLUMN IF NOT EXISTS atr_at_entry    DOUBLE PRECISION;
ALTER TABLE positions ADD COLUMN IF NOT EXISTS regime_at_entry VARCHAR(20);   -- 'TRENDING' | 'VOLATILE' | 'CHOPPY'

-- Running price extremes (updated by bot each run, used for ATR trailing stop)
ALTER TABLE positions ADD COLUMN IF NOT EXISTS highest_price_seen DOUBLE PRECISION;
ALTER TABLE positions ADD COLUMN IF NOT EXISTS lowest_price_seen  DOUBLE PRECISION;

-- Extra signal/strategy context (JSONB so we don't need columns for everything)
ALTER TABLE positions ADD COLUMN IF NOT EXISTS entry_context JSONB;

-- ─── BACKFILL: initial risk for existing positions ───────────────────────────

-- Copy current_stop_loss (or stop_loss) as initial_stop_loss for existing rows.
-- This is the best available approximation — the stop may have already moved
-- for some positions, so the R-multiple calculation for those will be imprecise.
-- The bot will log when it falls back to this value.
UPDATE positions
SET initial_stop_loss = COALESCE(current_stop_loss, stop_loss)
WHERE initial_stop_loss IS NULL
  AND COALESCE(current_stop_loss, stop_loss) IS NOT NULL;

-- Derive initial_risk_per_share from the backfilled initial_stop_loss.
UPDATE positions
SET initial_risk_per_share = CASE
    WHEN direction = 'long'  THEN GREATEST(0, COALESCE(actual_entry_price, entry_price) - initial_stop_loss)
    WHEN direction = 'short' THEN GREATEST(0, initial_stop_loss - COALESCE(actual_entry_price, entry_price))
    ELSE NULL
END
WHERE initial_risk_per_share IS NULL
  AND initial_stop_loss IS NOT NULL
  AND COALESCE(actual_entry_price, entry_price) IS NOT NULL;

-- ─── INDEX ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_positions_regime ON positions(regime_at_entry)
    WHERE regime_at_entry IS NOT NULL;
