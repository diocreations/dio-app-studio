-- The approved paid trial's single spend pool.
--
-- One row for the whole trial (`openrouter-comparison-2026-11-23`). Every
-- generation reserves its $0.40 hard ceiling here before the first provider
-- call, and settles to the gateway-reported cost afterwards. The `WHERE` clause
-- in the claim statement carries the $30 total, so two Workers isolates cannot
-- both take the last dollars.
--
-- Micro-dollars are integers so the arithmetic never drifts.
--
-- Apply locally with:
--   wrangler d1 execute plattr-studio --local --file migrations/0002_ai_trial_spend.sql
-- The running application also creates this table through `ensureSchema`, and
-- no deployment or production database is touched by this trial.

CREATE TABLE IF NOT EXISTS ai_trial_spend (
  trial_id TEXT PRIMARY KEY,
  reserved_micros INTEGER NOT NULL DEFAULT 0,
  spent_micros INTEGER NOT NULL DEFAULT 0,
  generations INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
