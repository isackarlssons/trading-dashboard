-- ============================================================================
-- Migration 005: Portfolio foundations
--
-- 1. instrument_currency on positions — enables per-position currency detection
-- 2. strategy_family on strategies     — enables strategy roll-up in analytics
--
-- Safe to re-run: all changes use IF NOT EXISTS.
-- ============================================================================

-- ─── positions: instrument currency ──────────────────────────────────────────

-- Three-letter ISO currency code for the instrument (USD, SEK, EUR, …)
ALTER TABLE positions
    ADD COLUMN IF NOT EXISTS instrument_currency VARCHAR(3);

-- Backfill from market field (best-effort; stays NULL if market is missing/unknown)
UPDATE positions
SET instrument_currency = CASE UPPER(COALESCE(market, ''))
    WHEN 'US' THEN 'USD'
    WHEN 'SE' THEN 'SEK'
    WHEN 'NO' THEN 'NOK'
    WHEN 'DK' THEN 'DKK'
    WHEN 'FI' THEN 'EUR'
    WHEN 'EU' THEN 'EUR'
    ELSE NULL
END
WHERE instrument_currency IS NULL
  AND market IS NOT NULL;

-- ─── strategies: strategy family ─────────────────────────────────────────────

-- Normalised family name for strategy roll-up (e.g. 'very_strong' for both
-- zone_very_strong_us and zone_very_strong_se).  Editable by hand if the
-- auto-backfill produces wrong results.
ALTER TABLE strategies
    ADD COLUMN IF NOT EXISTS strategy_family VARCHAR(100);

-- Backfill: strip known geographic suffixes and the 'zone_' prefix.
-- Pattern:  zone_very_strong_se  →  very_strong
--           mean_reversion_us    →  mean_reversion
UPDATE strategies
SET strategy_family =
    -- 2. Strip leading zone_ prefix
    regexp_replace(
        -- 1. Strip trailing market suffix (_us | _se | _eu | _gb | _no | _dk | _fi | _global)
        regexp_replace(lower(name), '_(us|se|eu|gb|no|dk|fi|global)$', '', 'i'),
        '^zone_', '', 'i'
    )
WHERE strategy_family IS NULL;
