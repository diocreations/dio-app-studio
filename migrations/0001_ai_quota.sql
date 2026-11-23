-- The shared free-tier quota ledger.
--
-- One row per window key: `<provider>:<model>:day:<YYYY-MM-DD>`,
-- `<provider>:<model>:minute:<YYYY-MM-DDTHH:MM>`, and one
-- `<provider>:neurons:day:<YYYY-MM-DD>` pool per provider organisation.
--
-- Every reservation is a single `INSERT … ON CONFLICT … WHERE` statement, so
-- the database, not an application counter, decides whether the ceiling has
-- been reached. `blocked_until` records a provider's 429 for every caller.
--
-- Apply locally with:
--   wrangler d1 execute plattr-studio --local --file migrations/0001_ai_quota.sql
-- The running application also creates this table through `ensureSchema`, so a
-- deployment does not depend on running the migration by hand.

CREATE TABLE IF NOT EXISTS ai_quota (
  key TEXT PRIMARY KEY,
  requests INTEGER NOT NULL DEFAULT 0,
  tokens INTEGER NOT NULL DEFAULT 0,
  neurons INTEGER NOT NULL DEFAULT 0,
  rate_limits INTEGER NOT NULL DEFAULT 0,
  blocked_until TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_quota_by_updated ON ai_quota (updated_at);
