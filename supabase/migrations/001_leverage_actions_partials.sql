-- ============================================================================
-- Migration 001: Leverage support, Position actions, Partial exits
-- Run this in Supabase SQL Editor
-- ============================================================================

-- ─── LEVERAGE FIELDS ON SIGNALS ─────────────────────────────────────────────
-- These allow the bot to specify execution details for leveraged products

ALTER TABLE signals ADD COLUMN IF NOT EXISTS execution_type VARCHAR(20) DEFAULT 'stock';
ALTER TABLE signals ADD COLUMN IF NOT EXISTS execution_symbol VARCHAR(40);
ALTER TABLE signals ADD COLUMN IF NOT EXISTS execution_isin VARCHAR(20);
ALTER TABLE signals ADD COLUMN IF NOT EXISTS issuer VARCHAR(60);
ALTER TABLE signals ADD COLUMN IF NOT EXISTS target_leverage DOUBLE PRECISION;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS knockout_level DOUBLE PRECISION;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS instrument_currency VARCHAR(10);
ALTER TABLE signals ADD COLUMN IF NOT EXISTS instrument_price DOUBLE PRECISION;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS execution_note TEXT;

-- ─── PARTIAL EXIT SUPPORT ON POSITIONS ──────────────────────────────────────

ALTER TABLE positions ADD COLUMN IF NOT EXISTS original_quantity DOUBLE PRECISION;
ALTER TABLE positions ADD COLUMN IF NOT EXISTS remaining_quantity DOUBLE PRECISION;

-- ─── POSITION ACTIONS (management instructions) ────────────────────────────

CREATE TYPE position_action_type AS ENUM (
    'raise_stop',
    'move_stop_to_breakeven',
    'take_partial',
    'reduce_position',
    'close_full',
    'hold'
);

CREATE TYPE action_execution_state AS ENUM (
    'pending',
    'acknowledged',
    'executed'
);

CREATE TABLE position_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    position_id UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
    action_type position_action_type NOT NULL,
    target_value DOUBLE PRECISION,
    description TEXT,
    execution_state action_execution_state DEFAULT 'pending',
    created_by VARCHAR(20) DEFAULT 'bot',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    executed_at TIMESTAMPTZ
);

CREATE INDEX idx_position_actions_position ON position_actions(position_id);
CREATE INDEX idx_position_actions_state ON position_actions(execution_state);

-- RLS
ALTER TABLE position_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON position_actions FOR ALL USING (auth.role() = 'authenticated');

-- ─── PARTIAL EXITS ──────────────────────────────────────────────────────────

CREATE TABLE partial_exits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    position_id UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
    exit_price DOUBLE PRECISION NOT NULL,
    quantity DOUBLE PRECISION NOT NULL,
    pnl DOUBLE PRECISION,
    pnl_percent DOUBLE PRECISION,
    fees DOUBLE PRECISION DEFAULT 0,
    notes TEXT,
    exited_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_partial_exits_position ON partial_exits(position_id);

-- RLS
ALTER TABLE partial_exits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON partial_exits FOR ALL USING (auth.role() = 'authenticated');

-- ─── SERVICE ROLE BYPASS (needed since backend uses service_role_key) ───────
-- The service role key already bypasses RLS, so no extra grants needed.
-- These policies are for direct Supabase client access from frontend if needed.
