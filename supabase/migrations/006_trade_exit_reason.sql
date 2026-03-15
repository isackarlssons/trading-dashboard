-- Migration 006: Add exit_reason column to trades table
-- Stores the canonical exit attribution label computed at close time.

ALTER TABLE trades ADD COLUMN IF NOT EXISTS exit_reason VARCHAR(50);

-- Index for analytics grouping queries
CREATE INDEX IF NOT EXISTS idx_trades_exit_reason ON trades (exit_reason);
