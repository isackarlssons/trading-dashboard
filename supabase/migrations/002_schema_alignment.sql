-- ============================================================================
-- Migration 002: Schema alignment to architecture spec
-- Adds missing columns; preserves all existing data and column names.
-- Run this in Supabase SQL Editor.
-- ============================================================================

-- ─── SIGNALS: market, underlying_ticker, taken_at, skipped_at ───────────────

ALTER TABLE signals ADD COLUMN IF NOT EXISTS market VARCHAR(10);
ALTER TABLE signals ADD COLUMN IF NOT EXISTS underlying_ticker VARCHAR(20);
ALTER TABLE signals ADD COLUMN IF NOT EXISTS taken_at TIMESTAMPTZ;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS skipped_at TIMESTAMPTZ;

-- ─── POSITION STATUS ENUM: add 'reduced' ─────────────────────────────────────

ALTER TYPE position_status ADD VALUE IF NOT EXISTS 'reduced';

-- ─── POSITIONS: new architecture fields ──────────────────────────────────────

ALTER TABLE positions ADD COLUMN IF NOT EXISTS market VARCHAR(10);
ALTER TABLE positions ADD COLUMN IF NOT EXISTS planned_entry_price DOUBLE PRECISION;
ALTER TABLE positions ADD COLUMN IF NOT EXISTS actual_entry_price DOUBLE PRECISION;
ALTER TABLE positions ADD COLUMN IF NOT EXISTS current_stop_loss DOUBLE PRECISION;
ALTER TABLE positions ADD COLUMN IF NOT EXISTS avg_entry_price DOUBLE PRECISION;
ALTER TABLE positions ADD COLUMN IF NOT EXISTS execution_type VARCHAR(20);
ALTER TABLE positions ADD COLUMN IF NOT EXISTS execution_symbol VARCHAR(40);
ALTER TABLE positions ADD COLUMN IF NOT EXISTS execution_isin VARCHAR(20);
ALTER TABLE positions ADD COLUMN IF NOT EXISTS instrument_price DOUBLE PRECISION;

-- Backfill new columns from existing data so old rows stay consistent
UPDATE positions
SET
    actual_entry_price = entry_price,
    planned_entry_price = entry_price,
    current_stop_loss   = stop_loss
WHERE actual_entry_price IS NULL;

-- ─── ACTION EXECUTION STATE ENUM: add 'dismissed' ────────────────────────────

ALTER TYPE action_execution_state ADD VALUE IF NOT EXISTS 'dismissed';

-- ─── POSITION ACTIONS: specific stop/sell instruction fields ─────────────────

ALTER TABLE position_actions ADD COLUMN IF NOT EXISTS old_stop_loss DOUBLE PRECISION;
ALTER TABLE position_actions ADD COLUMN IF NOT EXISTS new_stop_loss DOUBLE PRECISION;
ALTER TABLE position_actions ADD COLUMN IF NOT EXISTS sell_percent DOUBLE PRECISION;
ALTER TABLE position_actions ADD COLUMN IF NOT EXISTS sell_quantity DOUBLE PRECISION;
ALTER TABLE position_actions ADD COLUMN IF NOT EXISTS reason TEXT;

-- ─── PARTIAL EXITS: action link + canonical field names ──────────────────────

ALTER TABLE partial_exits ADD COLUMN IF NOT EXISTS action_id UUID REFERENCES position_actions(id) ON DELETE SET NULL;
ALTER TABLE partial_exits ADD COLUMN IF NOT EXISTS quantity_sold DOUBLE PRECISION;
ALTER TABLE partial_exits ADD COLUMN IF NOT EXISTS percent_sold DOUBLE PRECISION;
ALTER TABLE partial_exits ADD COLUMN IF NOT EXISTS price DOUBLE PRECISION;
ALTER TABLE partial_exits ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ;

-- Backfill new columns from existing data
UPDATE partial_exits
SET
    quantity_sold = quantity,
    price         = exit_price,
    executed_at   = exited_at
WHERE quantity_sold IS NULL;

CREATE INDEX IF NOT EXISTS idx_partial_exits_action ON partial_exits(action_id);

-- ─── RLS policy for position_actions/partial_exits (idempotent) ──────────────
-- Already created in migration 001 but guard with DO block to be safe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'position_actions' AND policyname = 'Allow all for authenticated'
    ) THEN
        CREATE POLICY "Allow all for authenticated" ON position_actions
            FOR ALL USING (auth.role() = 'authenticated');
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'partial_exits' AND policyname = 'Allow all for authenticated'
    ) THEN
        CREATE POLICY "Allow all for authenticated" ON partial_exits
            FOR ALL USING (auth.role() = 'authenticated');
    END IF;
END $$;
