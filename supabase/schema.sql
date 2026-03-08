-- ============================================================================
-- Trading Dashboard - Database Schema
-- Run this in Supabase SQL Editor or via migration
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── ENUMS ──────────────────────────────────────────────────────────────────

CREATE TYPE signal_direction AS ENUM ('long', 'short');
CREATE TYPE signal_status AS ENUM ('pending', 'taken', 'skipped', 'expired');
CREATE TYPE position_status AS ENUM ('open', 'closed');
CREATE TYPE trade_result AS ENUM ('win', 'loss', 'breakeven');
CREATE TYPE bot_run_status AS ENUM ('running', 'completed', 'failed');

-- ─── STRATEGIES ─────────────────────────────────────────────────────────────

CREATE TABLE strategies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    version VARCHAR(20) DEFAULT '1.0',
    config JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── SIGNALS ────────────────────────────────────────────────────────────────

CREATE TABLE signals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
    ticker VARCHAR(20) NOT NULL,
    direction signal_direction NOT NULL,
    entry_price DOUBLE PRECISION,
    stop_loss DOUBLE PRECISION,
    take_profit DOUBLE PRECISION,
    confidence DOUBLE PRECISION,
    status signal_status DEFAULT 'pending',
    metadata JSONB,
    signal_time TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_signals_status ON signals(status);
CREATE INDEX idx_signals_ticker ON signals(ticker);
CREATE INDEX idx_signals_strategy ON signals(strategy_id);
CREATE INDEX idx_signals_signal_time ON signals(signal_time DESC);

-- ─── POSITIONS ────────────────────────────────────────────��─────────────────

CREATE TABLE positions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    signal_id UUID REFERENCES signals(id) ON DELETE SET NULL,
    ticker VARCHAR(20) NOT NULL,
    direction signal_direction NOT NULL,
    entry_price DOUBLE PRECISION NOT NULL,
    stop_loss DOUBLE PRECISION,
    take_profit DOUBLE PRECISION,
    quantity DOUBLE PRECISION,
    status position_status DEFAULT 'open',
    notes TEXT,
    opened_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_positions_status ON positions(status);
CREATE INDEX idx_positions_ticker ON positions(ticker);

-- ─── TRADES ─────────────────────────────────────────────────────────────────

CREATE TABLE trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    position_id UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
    ticker VARCHAR(20) NOT NULL,
    direction signal_direction NOT NULL,
    entry_price DOUBLE PRECISION NOT NULL,
    exit_price DOUBLE PRECISION NOT NULL,
    quantity DOUBLE PRECISION,
    pnl DOUBLE PRECISION,
    pnl_percent DOUBLE PRECISION,
    result trade_result NOT NULL,
    fees DOUBLE PRECISION DEFAULT 0,
    notes TEXT,
    opened_at TIMESTAMPTZ NOT NULL,
    closed_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trades_ticker ON trades(ticker);
CREATE INDEX idx_trades_result ON trades(result);
CREATE INDEX idx_trades_closed_at ON trades(closed_at DESC);

-- ─── MARKET SNAPSHOTS ───────────────────────────────────────────────────────

CREATE TABLE market_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticker VARCHAR(20) NOT NULL,
    price DOUBLE PRECISION NOT NULL,
    volume DOUBLE PRECISION,
    rsi DOUBLE PRECISION,
    atr DOUBLE PRECISION,
    metadata JSONB,
    snapshot_time TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_snapshots_ticker ON market_snapshots(ticker);
CREATE INDEX idx_snapshots_time ON market_snapshots(snapshot_time DESC);

-- ─── BOT RUNS ───────────────────────────────────────────────────────────────

CREATE TABLE bot_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
    status bot_run_status DEFAULT 'running',
    signals_generated INTEGER DEFAULT 0,
    tickers_scanned INTEGER DEFAULT 0,
    error_message TEXT,
    metadata JSONB,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bot_runs_strategy ON bot_runs(strategy_id);
CREATE INDEX idx_bot_runs_status ON bot_runs(status);

-- ─── UPDATED_AT TRIGGER ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_strategies_updated_at
    BEFORE UPDATE ON strategies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_positions_updated_at
    BEFORE UPDATE ON positions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── ROW LEVEL SECURITY (RLS) ──────────────────────────────────────────────
-- Since this is a single-user app, we enable RLS but allow all for authenticated users

ALTER TABLE strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_runs ENABLE ROW LEVEL SECURITY;

-- Policies: allow all operations for authenticated users
CREATE POLICY "Allow all for authenticated" ON strategies FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON signals FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON positions FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON trades FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON market_snapshots FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON bot_runs FOR ALL USING (auth.role() = 'authenticated');

-- ─── SEED DATA: Default strategies ─────────────────────────────────────────

INSERT INTO strategies (name, description, version, config) VALUES
    ('zone_wide_us', 'Zone Wide strategy for US stocks', '1.2', '{"market": "US", "type": "zone_wide"}'),
    ('zone_wide_se', 'Zone Wide strategy for Swedish stocks', '1.2', '{"market": "SE", "type": "zone_wide"}'),
    ('zone_verystrong_us', 'Zone Very Strong strategy for US stocks', '1.1', '{"market": "US", "type": "zone_verystrong"}'),
    ('zone_verystrong_se', 'Zone Very Strong strategy for Swedish stocks', '1.1', '{"market": "SE", "type": "zone_verystrong"}');
