/**
 * Subscription contracts and their history.
 *
 * This is the data layer only: no routes, no provider SDK and no network calls.
 * It exists in M1 so the shape can be tested before M5 activates billing, and
 * it is written so reconciliation is idempotent — the same webhook delivered
 * twice, or two events out of order, converge on the same rows.
 *
 * Two ways to move a plan, both preserving history:
 *   - `changePlanInPlace` — same provider subscription, new plan version.
 *   - `renewContract`      — a new contract; the old row becomes `replaced`.
 * Exactly one row per organisation may be in a live state, enforced by the
 * partial unique index `subscriptions_one_live_per_org`.
 */

import { changes, newPlatformId, recordAudit } from './audit'
import { ensurePlatformSchema } from './schema'

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'grace'
  | 'cancelled'
  | 'expired'
  | 'replaced'

export const LIVE_STATUSES: readonly SubscriptionStatus[] = ['trialing', 'active', 'past_due', 'grace']

export type PlanVersion = { planKey: string; planVersion: number }
export type PlanMoveType = 'upgrade' | 'downgrade' | 'resubscribe' | 'reactivate' | 'trial_start'
export type Actor = { type: 'user' | 'operator' | 'system'; id: string }

export type SubscriptionRow = {
  id: string
  org_id: string
  plan_key: string
  plan_version: number
  provider: string
  provider_customer_id: string
  provider_subscription_id: string
  status: SubscriptionStatus
  previous_subscription_id: string
  superseded_by: string
  trial_ends_at: string
  current_period_start: string
  current_period_end: string
  cancel_at_period_end: number
  grace_until: string
  created_at: string
  updated_at: string
}

export type CreateSubscriptionInput = {
  orgId: string
  plan: PlanVersion
  status?: SubscriptionStatus
  provider?: string
  providerCustomerId?: string
  providerSubscriptionId?: string
  previousSubscriptionId?: string
  trialEndsAt?: string
  periodStart?: string
  periodEnd?: string
  at?: string
}

/**
 * Inserts a contract. A provider subscription id is an identity: presenting the
 * same id again returns the existing row instead of forking history.
 */
export async function createSubscription(
  db: D1Database,
  input: CreateSubscriptionInput,
): Promise<{ id: string; created: boolean }> {
  await ensurePlatformSchema(db)
  const providerSubscriptionId = input.providerSubscriptionId ?? ''
  if (providerSubscriptionId) {
    const existing = await db
      .prepare('SELECT id FROM subscriptions WHERE provider = ? AND provider_subscription_id = ?')
      .bind(input.provider ?? '', providerSubscriptionId)
      .first<{ id: string }>()
    if (existing) return { id: existing.id, created: false }
  }
  const now = input.at ?? new Date().toISOString()
  const id = newPlatformId('sub')
  await db
    .prepare(
      `INSERT INTO subscriptions
        (id, org_id, plan_key, plan_version, provider, provider_customer_id,
         provider_subscription_id, status, previous_subscription_id, superseded_by,
         trial_ends_at, current_period_start, current_period_end, cancel_at_period_end,
         grace_until, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, 0, '', ?, ?)`,
    )
    .bind(
      id,
      input.orgId,
      input.plan.planKey,
      input.plan.planVersion,
      input.provider ?? '',
      input.providerCustomerId ?? '',
      providerSubscriptionId,
      input.status ?? 'trialing',
      input.previousSubscriptionId ?? '',
      input.trialEndsAt ?? '',
      input.periodStart ?? '',
      input.periodEnd ?? '',
      now,
      now,
    )
    .run()
  return { id, created: true }
}

export type ChangeInput = {
  orgId: string
  subscriptionId: string
  nextSubscriptionId?: string
  from: PlanVersion | null
  to: PlanVersion
  changeType: PlanMoveType
  actor?: Actor
  providerEventId?: string
  effectiveAt?: string
  at?: string
}

/**
 * Appends one plan-move record. The unique partial index on
 * `provider_event_id` is the idempotency guarantee: a replayed webhook that
 * carries the same event id cannot duplicate the move.
 */
export async function recordChange(
  db: D1Database,
  input: ChangeInput,
): Promise<{ id: string; applied: boolean }> {
  await ensurePlatformSchema(db)
  const eventId = input.providerEventId ?? ''
  if (eventId) {
    const seen = await db
      .prepare('SELECT id FROM subscription_changes WHERE provider_event_id = ?')
      .bind(eventId)
      .first<{ id: string }>()
    if (seen) return { id: seen.id, applied: false }
  }
  const id = newPlatformId('sch')
  try {
    await db
      .prepare(
        `INSERT INTO subscription_changes
          (id, org_id, subscription_id, next_subscription_id, from_plan_key,
           from_plan_version, to_plan_key, to_plan_version, change_type,
           effective_at, actor_type, actor_id, provider_event_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.orgId,
        input.subscriptionId,
        input.nextSubscriptionId ?? '',
        input.from?.planKey ?? '',
        input.from?.planVersion ?? 0,
        input.to.planKey,
        input.to.planVersion,
        input.changeType,
        input.effectiveAt ?? input.at ?? new Date().toISOString(),
        input.actor?.type ?? 'system',
        input.actor?.id ?? '',
        eventId,
        input.at ?? new Date().toISOString(),
      )
      .run()
  } catch (error) {
    if (eventId) {
      const seen = await db
        .prepare('SELECT id FROM subscription_changes WHERE provider_event_id = ?')
        .bind(eventId)
        .first<{ id: string }>()
      if (seen) return { id: seen.id, applied: false }
    }
    throw error
  }
  return { id, applied: true }
}

/**
 * Upgrade or downgrade inside one contract. The row update and the history
 * record are one batch, so a crash cannot leave a plan change without its
 * evidence (or the reverse).
 */
export async function changePlanInPlace(
  db: D1Database,
  input: {
    orgId: string
    subscriptionId: string
    to: PlanVersion
    changeType: 'upgrade' | 'downgrade' | 'reactivate'
    actor?: Actor
    providerEventId?: string
    effectiveAt?: string
    at?: string
  },
): Promise<{ applied: boolean; changeId: string | null }> {
  await ensurePlatformSchema(db)
  const row = await db
    .prepare('SELECT * FROM subscriptions WHERE id = ?')
    .bind(input.subscriptionId)
    .first<SubscriptionRow>()
  if (!row) throw new Error('subscription not found')
  if (row.org_id !== input.orgId) throw new Error('subscription belongs to another organisation')
  if (row.status === 'replaced') throw new Error('subscription has been replaced')

  const eventId = input.providerEventId ?? ''
  if (eventId) {
    const seen = await db
      .prepare('SELECT id FROM subscription_changes WHERE provider_event_id = ?')
      .bind(eventId)
      .first<{ id: string }>()
    if (seen) return { applied: false, changeId: seen.id }
  }

  const now = input.at ?? new Date().toISOString()
  const changeId = newPlatformId('sch')
  try {
    await db.batch([
      db
        .prepare('UPDATE subscriptions SET plan_key = ?, plan_version = ?, updated_at = ? WHERE id = ?')
        .bind(input.to.planKey, input.to.planVersion, now, input.subscriptionId),
      db
        .prepare(
          `INSERT INTO subscription_changes
            (id, org_id, subscription_id, next_subscription_id, from_plan_key,
             from_plan_version, to_plan_key, to_plan_version, change_type,
             effective_at, actor_type, actor_id, provider_event_id, created_at)
           VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          changeId,
          input.orgId,
          input.subscriptionId,
          row.plan_key,
          row.plan_version,
          input.to.planKey,
          input.to.planVersion,
          input.changeType,
          input.effectiveAt ?? now,
          input.actor?.type ?? 'system',
          input.actor?.id ?? '',
          eventId,
          now,
        ),
    ])
  } catch (error) {
    if (eventId) {
      const seen = await db
        .prepare('SELECT id FROM subscription_changes WHERE provider_event_id = ?')
        .bind(eventId)
        .first<{ id: string }>()
      if (seen) return { applied: false, changeId: seen.id }
    }
    throw error
  }
  await recordAudit(db, {
    actorType: input.actor?.type ?? 'system',
    actorId: input.actor?.id ?? '',
    orgId: input.orgId,
    action: 'subscription.plan_changed',
    target: input.subscriptionId,
    detail: `${row.plan_key} v${row.plan_version} → ${input.to.planKey} v${input.to.planVersion} (${input.changeType})`,
    at: now,
  })
  return { applied: true, changeId }
}

/**
 * A new commercial contract, e.g. re-subscribing after cancellation or a
 * provider that issues a fresh subscription id. The previous row is closed as
 * `replaced` and keeps its own period; the new row points back at it.
 */
export async function renewContract(
  db: D1Database,
  input: {
    orgId: string
    previousSubscriptionId: string
    plan: PlanVersion
    status?: SubscriptionStatus
    provider?: string
    providerCustomerId?: string
    providerSubscriptionId?: string
    changeType?: 'resubscribe' | 'upgrade'
    actor?: Actor
    providerEventId?: string
    trialEndsAt?: string
    periodStart?: string
    periodEnd?: string
    at?: string
  },
): Promise<{ id: string; created: boolean }> {
  await ensurePlatformSchema(db)
  const previous = await db
    .prepare('SELECT * FROM subscriptions WHERE id = ?')
    .bind(input.previousSubscriptionId)
    .first<SubscriptionRow>()
  if (!previous) throw new Error('previous subscription not found')
  if (previous.org_id !== input.orgId) throw new Error('subscription belongs to another organisation')
  if (previous.superseded_by) return { id: previous.superseded_by, created: false }
  if (previous.status === 'replaced') throw new Error('subscription was replaced without a successor')

  const created = await createSubscription(db, {
    orgId: input.orgId,
    plan: input.plan,
    status: input.status ?? 'active',
    provider: input.provider,
    providerCustomerId: input.providerCustomerId,
    providerSubscriptionId: input.providerSubscriptionId,
    previousSubscriptionId: previous.id,
    trialEndsAt: input.trialEndsAt,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    at: input.at,
  })
  // A repeated webhook finds the contract already created by provider id.
  if (!created.created) return created

  const now = input.at ?? new Date().toISOString()
  await db.batch([
    db
      .prepare(`UPDATE subscriptions SET status = 'replaced', superseded_by = ?, updated_at = ? WHERE id = ? AND superseded_by = ''`)
      .bind(created.id, now, previous.id),
    db
      .prepare(
        `UPDATE subscriptions SET previous_subscription_id = ? WHERE id = ? AND previous_subscription_id = ''`,
      )
      .bind(previous.id, created.id),
    db
      .prepare(
        `INSERT INTO subscription_changes
          (id, org_id, subscription_id, next_subscription_id, from_plan_key,
           from_plan_version, to_plan_key, to_plan_version, change_type,
           effective_at, actor_type, actor_id, provider_event_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        newPlatformId('sch'),
        input.orgId,
        previous.id,
        created.id,
        previous.plan_key,
        previous.plan_version,
        input.plan.planKey,
        input.plan.planVersion,
        input.changeType ?? 'resubscribe',
        now,
        input.actor?.type ?? 'system',
        input.actor?.id ?? '',
        input.providerEventId ?? '',
        now,
      ),
  ])
  return created
}

/** Provider state move (payment failed, grace started, cancelled…). */
export async function setSubscriptionStatus(
  db: D1Database,
  input: {
    subscriptionId: string
    status: SubscriptionStatus
    graceUntil?: string
    cancelAtPeriodEnd?: boolean
    actor?: Actor
    at?: string
  },
): Promise<{ applied: boolean }> {
  await ensurePlatformSchema(db)
  const row = await db
    .prepare('SELECT * FROM subscriptions WHERE id = ?')
    .bind(input.subscriptionId)
    .first<SubscriptionRow>()
  if (!row) throw new Error('subscription not found')
  const now = input.at ?? new Date().toISOString()
  const graceUntil = input.graceUntil ?? row.grace_until
  const cancelAtPeriodEnd = input.cancelAtPeriodEnd ?? row.cancel_at_period_end === 1
  if (
    row.status === input.status &&
    row.grace_until === graceUntil &&
    (row.cancel_at_period_end === 1) === cancelAtPeriodEnd
  )
    return { applied: false }

  await db
    .prepare(
      `UPDATE subscriptions SET status = ?, grace_until = ?, cancel_at_period_end = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(input.status, graceUntil, cancelAtPeriodEnd ? 1 : 0, now, input.subscriptionId)
    .run()
  await recordAudit(db, {
    actorType: input.actor?.type ?? 'system',
    actorId: input.actor?.id ?? '',
    orgId: row.org_id,
    action: 'subscription.status_changed',
    target: input.subscriptionId,
    detail: `${row.status} → ${input.status}`,
    at: now,
  })
  return { applied: true }
}

/**
 * Invoice mirror. `(provider, provider_invoice_id)` is unique, so replaying an
 * invoice webhook updates nothing and reports `applied: false`.
 */
export async function recordInvoice(
  db: D1Database,
  input: {
    orgId: string
    subscriptionId: string
    provider: string
    providerInvoiceId?: string
    amountMinor: number
    currency?: string
    status?: string
    issuedAt?: string
    paidAt?: string
    pdfUrl?: string
  },
): Promise<{ id: string; applied: boolean }> {
  await ensurePlatformSchema(db)
  const id = newPlatformId('inv')
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO platform_invoices
        (id, org_id, subscription_id, provider, provider_invoice_id, amount_minor,
         currency, status, issued_at, paid_at, pdf_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.orgId,
      input.subscriptionId,
      input.provider,
      input.providerInvoiceId ?? '',
      input.amountMinor,
      input.currency ?? 'USD',
      input.status ?? 'open',
      input.issuedAt ?? new Date().toISOString(),
      input.paidAt ?? '',
      input.pdfUrl ?? '',
    )
    .run()
  const applied = changes(result) > 0
  if (!applied && input.providerInvoiceId) {
    const existing = await db
      .prepare('SELECT id FROM platform_invoices WHERE provider = ? AND provider_invoice_id = ?')
      .bind(input.provider, input.providerInvoiceId)
      .first<{ id: string }>()
    return { id: existing?.id ?? '', applied: false }
  }
  return { id, applied }
}

/**
 * Webhook envelope. The ledger row is inserted first and is unique per
 * `(provider, event_id)`, so a duplicate delivery returns `applied: false`
 * without touching subscription state. A handler failure is recorded and
 * rethrown, leaving the event replayable after inspection rather than silently
 * swallowed.
 */
export async function applyBillingEvent(
  db: D1Database,
  input: {
    provider: string
    eventId: string
    eventType?: string
    detail?: string
    apply?: () => Promise<void>
    at?: string
  },
): Promise<{ applied: boolean; reason: 'ok' | 'duplicate' }> {
  await ensurePlatformSchema(db)
  const at = input.at ?? new Date().toISOString()
  const id = newPlatformId('bev')
  const inserted = await db
    .prepare(
      `INSERT OR IGNORE INTO platform_billing_events
        (id, provider, event_id, event_type, status, detail, created_at)
       VALUES (?, ?, ?, ?, 'processing', ?, ?)`,
    )
    .bind(id, input.provider, input.eventId, input.eventType ?? '', input.detail ?? '', at)
    .run()

  let ledgerId = id
  if (changes(inserted) === 0) {
    const existing = await db
      .prepare('SELECT id, status FROM platform_billing_events WHERE provider = ? AND event_id = ?')
      .bind(input.provider, input.eventId)
      .first<{ id: string; status: string }>()
    // A processed event is a duplicate. An event that failed mid-handler is
    // replayable, because the first attempt recorded no state change.
    if (existing?.status !== 'failed') return { applied: false, reason: 'duplicate' }
    ledgerId = existing.id
    await db
      .prepare(`UPDATE platform_billing_events SET status = 'processing' WHERE id = ?`)
      .bind(ledgerId)
      .run()
  }

  try {
    await input.apply?.()
  } catch (error) {
    await db
      .prepare(`UPDATE platform_billing_events SET status = 'failed' WHERE id = ?`)
      .bind(ledgerId)
      .run()
    throw error
  }
  await db
    .prepare(`UPDATE platform_billing_events SET status = 'processed' WHERE id = ?`)
    .bind(ledgerId)
    .run()
  return { applied: true, reason: 'ok' }
}

export async function liveSubscription(
  db: D1Database,
  orgId: string,
): Promise<SubscriptionRow | null> {
  await ensurePlatformSchema(db)
  return db
    .prepare(
      `SELECT * FROM subscriptions
        WHERE org_id = ? AND status IN ('trialing', 'active', 'past_due', 'grace')
        ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(orgId)
    .first<SubscriptionRow>()
}

export async function subscriptionHistory(
  db: D1Database,
  orgId: string,
): Promise<SubscriptionRow[]> {
  await ensurePlatformSchema(db)
  const { results } = await db
    .prepare('SELECT * FROM subscriptions WHERE org_id = ? ORDER BY created_at DESC, rowid DESC')
    .bind(orgId)
    .all<SubscriptionRow>()
  return results ?? []
}

export type PlanChangeRecord = {
  id: string
  subscription_id: string
  next_subscription_id: string
  from_plan_key: string
  from_plan_version: number
  to_plan_key: string
  to_plan_version: number
  change_type: PlanMoveType
  provider_event_id: string
  effective_at: string
}

export async function changeHistory(db: D1Database, orgId: string): Promise<PlanChangeRecord[]> {
  await ensurePlatformSchema(db)
  const { results } = await db
    .prepare(
      `SELECT id, subscription_id, next_subscription_id, from_plan_key, from_plan_version,
              to_plan_key, to_plan_version, change_type, provider_event_id, effective_at
         FROM subscription_changes WHERE org_id = ? ORDER BY created_at, rowid`,
    )
    .bind(orgId)
    .all<PlanChangeRecord>()
  return results ?? []
}

/** Limits live in the database, so changing one is a data edit, not a deploy. */
export async function planLimits(
  db: D1Database,
  plan: PlanVersion,
): Promise<Record<string, number>> {
  await ensurePlatformSchema(db)
  const { results } = await db
    .prepare('SELECT limit_key, value FROM plan_limits WHERE plan_key = ? AND version = ?')
    .bind(plan.planKey, plan.planVersion)
    .all<{ limit_key: string; value: number }>()
  const limits: Record<string, number> = {}
  for (const row of results ?? []) limits[row.limit_key] = row.value
  return limits
}
