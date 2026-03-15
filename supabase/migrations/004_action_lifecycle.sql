-- ============================================================================
-- Migration 004: Full action execution lifecycle
--
-- Adds 'expired' state and execution/dismissal metadata columns to
-- position_actions.
--
-- Safe to re-run: all changes use IF NOT EXISTS / IF VALUE NOT EXISTS.
-- ============================================================================

-- ─── Extend enum ─────────────────────────────────────────────────────────────

-- action_execution_state: add 'expired' (pending|acknowledged|executed|dismissed already exist)
ALTER TYPE action_execution_state ADD VALUE IF NOT EXISTS 'expired';

-- ─── Execution metadata ───────────────────────────────────────────────────────

-- Price at which the trader actually executed the action at the broker
ALTER TABLE position_actions
    ADD COLUMN IF NOT EXISTS executed_price  DOUBLE PRECISION;

-- Free-text note the trader can attach when confirming execution
ALTER TABLE position_actions
    ADD COLUMN IF NOT EXISTS execution_note  TEXT;

-- ─── Dismissal metadata ──────────────────────────────────────────────────────

-- When the action was dismissed (set by backend on state → dismissed)
ALTER TABLE position_actions
    ADD COLUMN IF NOT EXISTS dismissed_at    TIMESTAMPTZ;

-- Reason the trader (or bot) dismissed the action
ALTER TABLE position_actions
    ADD COLUMN IF NOT EXISTS dismissed_note  TEXT;

-- ─── Expiry metadata ─────────────────────────────────────────────────────────

-- Optional: bot or system can pre-set a point after which the action expires
ALTER TABLE position_actions
    ADD COLUMN IF NOT EXISTS expires_at      TIMESTAMPTZ;

-- When the action was marked expired (set by backend on state → expired)
ALTER TABLE position_actions
    ADD COLUMN IF NOT EXISTS expired_at      TIMESTAMPTZ;
