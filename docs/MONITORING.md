# Production monitoring

Date: 20 November 2026

Nothing is deployed, so nothing is being monitored yet. This is the recommended
setup, sized for launch: it watches the failures that actually cost money or
data, and it costs nothing beyond what Cloudflare already bills.

A service search for Workers error monitoring and alerting returned no suitable
provider in the catalogue — the entries were notification orchestrators, proxies
or databases, none of which capture Worker exceptions or cron failures. Rather
than add a vendor that needs another provider to work, the recommendation below
uses Cloudflare's own signals plus one free external uptime monitor. If Plattr
later wants stack traces grouped by release, Sentry's Workers SDK on the free
tier is the obvious addition; it is not needed to detect an outage.

## What must be watched

| Signal | Why it matters | Where it comes from | Alert |
| --- | --- | --- | --- |
| App unreachable (`/` not 200) | Total outage; customers cannot order | External uptime monitor | Email/Slack after 2 consecutive failures |
| Worker exceptions | Broken deploy, bad route, D1/R2 binding error | Workers Logs (`observability` is already enabled in `wrangler.jsonc`) | Cloudflare Notification: Workers → errors |
| D1 errors and quota | Writes failing, or the daily read limit reached | Cloudflare Notifications: D1 | Email at 80% of the plan limit |
| R2 errors and storage | Media 404s, upload failures, runaway storage | Cloudflare Notifications: R2 | Email at 80% of storage |
| Payment webhook failures | Money received but the order stays unpaid | `payment_events.status = 'failed'` | Daily check, below |
| Backup did not run | Silent RPO loss, the worst failure | `BACKUP_HEARTBEAT_URL` ping after each verified run | Healthchecks/Better Stack alerts on silence |
| Backup failed | Snapshot missing for a day | `BACKUP_ALERT_WEBHOOK` | Slack/Discord webhook |
| Owner login lockout | A business cannot get in | `activity` / 429s in Workers Logs | Manual; low urgency |
| Media 404 rate | A restore or cleanup removed a live image | Workers Logs filter `404` on `/media/` | Manual during the monthly rehearsal |

## Recommended setup, in order

1. **Uptime monitor (free).** Better Stack or UptimeRobot free tier: one HTTP
   check on `https://<origin>/` every 5 minutes, alert after two failures, to the
   owner's email and a Slack webhook. This is the only piece that notices a
   Cloudflare-side outage or a bad deploy that returns 5xx everywhere.
2. **Cloudflare Notifications (free).** In the dashboard, enable:
   - Workers → **Errors** for the `plattr-studio` Worker, to email.
   - D1 → usage at 80% and any error-rate notification offered.
   - R2 → storage at 80%.
   These are configured in the dashboard, not in this repository.
3. **Workers Logs.** Already on: `wrangler.jsonc` has
   `"observability": { "enabled": true }`. After the first deploy, confirm logs
   appear under Workers → `plattr-studio` → Logs, and keep the retention the plan
   allows (usually 3 days on the free tier, longer on paid). Long-term retention
   is not needed; the backup index is the durable record.
4. **Backup heartbeat (free).** Create a Healthchecks.io (or Better Stack
   heartbeat) check with a 26-hour period, and set `BACKUP_HEARTBEAT_URL` in the
   backup job's environment. The job pings it only after a verified run, so the
   alert fires when the job stops running — the failure no dashboard catches.
5. **Backup failure webhook (free).** A Slack or Discord incoming webhook in
   `BACKUP_ALERT_WEBHOOK`. The job posts `{text, stage, runId, mode}` on failure,
   including which stage failed.
6. **Optional: Sentry for Workers.** Only if grouped stack traces become worth
   the setup. Free tier is 5k errors/month. It would add a dependency and a
   build-time wrapper; it does not replace 1–5.

## Daily and weekly checks that are still manual

Until a scheduler exists, these are the checks a person runs:

```bash
# Failed or unprocessed payment events in the last day (should be empty or explained)
bunx wrangler d1 execute plattr-studio --remote --command \
  "select status, count(*) from payment_events where created_at > datetime('now','-1 day') group by status"

# Newest backup run and its status
bun scripts/offsite-fetch.mjs --remote --run <id from plattr/index.json> --out /tmp/backup-check \
  --backup-bucket plattr-backups
```

Weekly, by eye: the newest run in `plattr/index.json` is `verified`, its age is
under 36 hours, and its file count has not changed unexpectedly.

## What this deliberately does not include

- **No APM or tracing.** At launch, request latency is dominated by D1 and R2;
  Workers Logs show slow requests, and there is no service graph worth paying for.
- **No log aggregation vendor.** Workers Logs plus the backup index cover the two
  questions that matter: "is it up" and "can we recover".
- **No synthetic checkout.** A scripted purchase would create real orders and
  real customers. The regression suite covers checkout against a test database
  instead, and the monthly recovery rehearsal covers end-to-end serving.
- **No alert on 429 rate limits.** They are expected under abuse; the counters are
  visible in Workers Logs when someone looks.

## Cost

| Item | Cost |
| --- | --- |
| Cloudflare Workers Logs / observability | Included in the Workers plan |
| Cloudflare Notifications | Free |
| Uptime monitor (free tier) | Free for one check |
| Healthchecks heartbeat | Free for the basic period |
| Sentry (optional) | Free up to 5k errors/month |

Total added spend: **$0** at launch, with the option to pay for longer log
retention if an incident needs it.

## Open items

1. Nothing is configured: no origin, no Slack webhook, no heartbeat URL yet.
2. The heartbeat and failure webhook are implemented in
   `scripts/offsite-backup.mjs` but have only been exercised locally (the failure
   path printed its message; no real webhook was called).
3. Cloudflare Notifications must be enabled in the dashboard by whoever owns the
   account; it cannot be set from this repository.
