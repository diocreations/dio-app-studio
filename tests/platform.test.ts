import { describe, expect, test } from 'bun:test'
import { createProject, deleteProject, getProject, addNote, ensureSchema } from '../src/worker/db'
import { MemoryD1 } from './memoryD1'
import { parsePlatformFlags, platformFlags, flagEnabled, billingEnabled } from '../src/worker/platform/flags'
import {
  PLATFORM_TABLES,
  ensurePlatformSchema,
  platformSchemaState,
  rollbackPlatformSchema,
} from '../src/worker/platform/schema'
import {
  backfillProjectOrganizations,
  organizationIdForProject,
  organizationSlugForProject,
  reconcileBackfill,
} from '../src/worker/platform/backfill'
import {
  applyBillingEvent,
  changeHistory,
  changePlanInPlace,
  createSubscription,
  liveSubscription,
  recordChange,
  recordInvoice,
  renewContract,
  setSubscriptionStatus,
  subscriptionHistory,
} from '../src/worker/platform/subscriptions'
import {
  ClaimError,
  approveClaim,
  disputeClaim,
  markClaimEmailVerified,
  openClaim,
  reverseTransfer,
  transferProjectOwnership,
} from '../src/worker/platform/claims'
import { verifyPlatformIntegrity } from '../src/worker/platform/integrity'
import { canChangePlan, canInviteMembers, canStartBilling } from '../src/worker/platform/policy'
import { countOrgProjects, getOrgProject, listOrgProjects } from '../src/worker/platform/tenancy'
import { legacySnapshot, diffSnapshots } from '../src/worker/platform/snapshot'

function memory(): D1Database {
  return new MemoryD1() as unknown as D1Database
}

async function platformDb(): Promise<D1Database> {
  const db = memory()
  // Base schema first, exactly as the Worker does, then the additive platform
  // schema (which references projects).
  await ensureSchema(db)
  await ensurePlatformSchema(db)
  return db
}

async function seedOrg(db: D1Database, id: string, claimStatus = 'claimed'): Promise<void> {
  const now = '2026-11-19T00:00:00.000Z'
  await db
    .prepare(
      `INSERT INTO organizations (id, name, slug, country, currency, status, claim_status, claimed_at, first_trial_at, created_at, updated_at)
       VALUES (?, ?, ?, '', 'USD', 'active', ?, ?, '', ?, ?)`,
    )
    .bind(id, `Org ${id}`, `slug-${id}`, claimStatus, claimStatus === 'claimed' ? now : '', now, now)
    .run()
}

async function seedUser(db: D1Database, id: string, email: string, verified = true): Promise<void> {
  await db
    .prepare(
      `INSERT INTO users (id, email, email_normalized, email_verified_at, password_hash, status, display_name, locale, created_at, last_login_at)
       VALUES (?, ?, ?, ?, 'x', 'active', '', 'en', ?, '')`,
    )
    .bind(id, email, email.toLowerCase(), verified ? '2026-11-19T00:00:00.000Z' : '', '2026-11-19T00:00:00.000Z')
    .run()
}

async function makeProject(db: D1Database, name: string, email = 'owner@example.test') {
  return createProject(db, {
    name,
    contact: '',
    email,
    vertical: 'shop',
    accent: '#1f6feb',
    logo: 'TS',
    features: ['catalog'],
    platforms: ['pwa'],
    plan: 'onetime',
  })
}

describe('M0 feature flags', () => {
  test('every flag is off when the binding is unset', () => {
    expect(platformFlags(undefined)).toEqual({
      'accounts.enabled': false,
      'billing.enabled': false,
      'admin.enabled': false,
    })
    expect(billingEnabled({ PLATFORM_FLAGS: '' })).toBe(false)
  })

  test('only explicit truthy values turn a flag on', () => {
    const flags = parsePlatformFlags('accounts.enabled=1, billing.enabled=true,admin.enabled=off')
    expect(flags['accounts.enabled']).toBe(true)
    expect(flags['billing.enabled']).toBe(true)
    expect(flags['admin.enabled']).toBe(false)
    expect(flagEnabled({ PLATFORM_FLAGS: 'accounts.enabled' }, 'accounts.enabled')).toBe(true)
  })

  test('unknown names and typos cannot enable anything', () => {
    const flags = platformFlags({ PLATFORM_FLAGS: 'accounts.enable=1,billing=1,admin.enabled=yes' })
    expect(flags['accounts.enabled']).toBe(false)
    expect(flags['billing.enabled']).toBe(false)
    expect(flags['admin.enabled']).toBe(true)
  })
})

describe('M1 additive schema', () => {
  test('creates every platform table plus the project columns, idempotently', async () => {
    const db = await platformDb()
    const state = await platformSchemaState(db)
    expect(state.complete).toBe(true)
    expect(state.missing).toEqual([])
    expect(state.present.length).toBe(PLATFORM_TABLES.length)

    // A second run on the same database must not fail or duplicate anything.
    await ensurePlatformSchema(db)
    expect((await platformSchemaState(db)).complete).toBe(true)
  })

  test('existing project reads and writes are unchanged with the schema present', async () => {
    const db = await platformDb()
    const project = await makeProject(db, 'Corner Bakery')
    expect(project.token).toHaveLength(24)
    expect((await getProject(db, project.token))?.name).toBe('Corner Bakery')
    expect((await getProject(db, project.token))?.id).toBe(project.id)
    // org_id stays empty until M3 attaches new builds to an organisation.
    const row = await db
      .prepare('SELECT org_id, created_by FROM projects WHERE id = ?')
      .bind(project.id)
      .first<{ org_id: string; created_by: string }>()
    expect(row?.org_id).toBe('')
    expect(row?.created_by).toBe('')
  })
})

describe('subscription contracts and history', () => {
  test('only one contract per organisation may be live, but closed contracts accumulate', async () => {
    const db = await platformDb()
    await seedOrg(db, 'org_live')
    const first = await createSubscription(db, {
      orgId: 'org_live',
      plan: { planKey: 'starter', planVersion: 1 },
      status: 'active',
      provider: 'stripe',
      providerSubscriptionId: 'sub_one',
    })
    expect(first.created).toBe(true)

    await expect(
      createSubscription(db, {
        orgId: 'org_live',
        plan: { planKey: 'growth', planVersion: 1 },
        status: 'active',
        provider: 'stripe',
        providerSubscriptionId: 'sub_two',
      }),
    ).rejects.toThrow(/UNIQUE/)

    const closed = await createSubscription(db, {
      orgId: 'org_live',
      plan: { planKey: 'starter', planVersion: 1 },
      status: 'cancelled',
      provider: 'stripe',
      providerSubscriptionId: 'sub_closed',
    })
    expect(closed.created).toBe(true)
    const history = await subscriptionHistory(db, 'org_live')
    expect(history).toHaveLength(2)
    expect(history.filter((row) => row.status === 'active')).toHaveLength(1)
    // A different organisation is independent.
    await seedOrg(db, 'org_other')
    expect(
      (await createSubscription(db, { orgId: 'org_other', plan: { planKey: 'starter', planVersion: 1 }, status: 'active' }))
        .created,
    ).toBe(true)
  })

  test('the same provider subscription id never forks a contract', async () => {
    const db = await platformDb()
    await seedOrg(db, 'org_idem')
    const a = await createSubscription(db, {
      orgId: 'org_idem',
      plan: { planKey: 'starter', planVersion: 1 },
      status: 'active',
      provider: 'razorpay',
      providerSubscriptionId: 'rzp_1',
    })
    const b = await createSubscription(db, {
      orgId: 'org_idem',
      plan: { planKey: 'starter', planVersion: 1 },
      status: 'active',
      provider: 'razorpay',
      providerSubscriptionId: 'rzp_1',
    })
    expect(b.created).toBe(false)
    expect(b.id).toBe(a.id)
    expect(await subscriptionHistory(db, 'org_idem')).toHaveLength(1)
  })

  test('an in-place upgrade keeps the contract and appends immutable history', async () => {
    const db = await platformDb()
    await seedOrg(db, 'org_up')
    const sub = await createSubscription(db, {
      orgId: 'org_up',
      plan: { planKey: 'starter', planVersion: 1 },
      status: 'active',
      provider: 'stripe',
      providerSubscriptionId: 'sub_up',
    })
    const moved = await changePlanInPlace(db, {
      orgId: 'org_up',
      subscriptionId: sub.id,
      to: { planKey: 'growth', planVersion: 1 },
      changeType: 'upgrade',
      providerEventId: 'evt_upgrade_1',
      actor: { type: 'user', id: 'usr_1' },
    })
    expect(moved.applied).toBe(true)
    const live = await liveSubscription(db, 'org_up')
    expect(live?.id).toBe(sub.id)
    expect(live?.plan_key).toBe('growth')

    // A replayed event cannot move the plan twice or duplicate the record.
    const replay = await changePlanInPlace(db, {
      orgId: 'org_up',
      subscriptionId: sub.id,
      to: { planKey: 'growth', planVersion: 1 },
      changeType: 'upgrade',
      providerEventId: 'evt_upgrade_1',
    })
    expect(replay.applied).toBe(false)
    const changes = await changeHistory(db, 'org_up')
    expect(changes).toHaveLength(1)
    expect(changes[0]?.change_type).toBe('upgrade')
    expect(changes[0]?.from_plan_key).toBe('starter')
    expect(changes[0]?.to_plan_key).toBe('growth')
    expect(await subscriptionHistory(db, 'org_up')).toHaveLength(1)
  })

  test('re-subscribing after cancellation leaves the old contract readable', async () => {
    const db = await platformDb()
    await seedOrg(db, 'org_resub')
    const old = await createSubscription(db, {
      orgId: 'org_resub',
      plan: { planKey: 'growth', planVersion: 1 },
      status: 'active',
      provider: 'stripe',
      providerSubscriptionId: 'sub_old',
      periodStart: '2026-10-01T00:00:00.000Z',
      periodEnd: '2026-11-01T00:00:00.000Z',
    })
    await setSubscriptionStatus(db, { subscriptionId: old.id, status: 'cancelled' })
    await recordInvoice(db, {
      orgId: 'org_resub',
      subscriptionId: old.id,
      provider: 'stripe',
      providerInvoiceId: 'in_old',
      amountMinor: 4900,
      status: 'paid',
      paidAt: '2026-10-01T00:00:00.000Z',
    })

    const renewed = await renewContract(db, {
      orgId: 'org_resub',
      previousSubscriptionId: old.id,
      plan: { planKey: 'starter', planVersion: 1 },
      status: 'active',
      provider: 'stripe',
      providerSubscriptionId: 'sub_new',
      providerEventId: 'evt_resub_1',
    })
    expect(renewed.created).toBe(true)

    const history = await subscriptionHistory(db, 'org_resub')
    expect(history).toHaveLength(2)
    const previous = history.find((row) => row.id === old.id)
    const current = history.find((row) => row.id === renewed.id)
    expect(previous?.status).toBe('replaced')
    expect(previous?.superseded_by).toBe(renewed.id)
    expect(previous?.current_period_end).toBe('2026-11-01T00:00:00.000Z')
    expect(current?.previous_subscription_id).toBe(old.id)
    expect((await liveSubscription(db, 'org_resub'))?.id).toBe(renewed.id)
    // Only one live row remains, and the paid invoice still points at the old contract.
    const invoice = await db
      .prepare('SELECT subscription_id, amount_minor, status FROM platform_invoices WHERE provider_invoice_id = ?')
      .bind('in_old')
      .first<{ subscription_id: string; amount_minor: number; status: string }>()
    expect(invoice?.subscription_id).toBe(old.id)
    expect(invoice?.status).toBe('paid')

    // Replaying the same re-subscribe webhook converges on the same contract.
    const again = await renewContract(db, {
      orgId: 'org_resub',
      previousSubscriptionId: old.id,
      plan: { planKey: 'starter', planVersion: 1 },
      provider: 'stripe',
      providerSubscriptionId: 'sub_new',
      providerEventId: 'evt_resub_1',
    })
    expect(again.created).toBe(false)
    expect(again.id).toBe(renewed.id)
    expect(await subscriptionHistory(db, 'org_resub')).toHaveLength(2)
    expect(await changeHistory(db, 'org_resub')).toHaveLength(1)
  })

  test('a cancelled contract can be followed by a new one without a second trial', async () => {
    const db = await platformDb()
    await seedOrg(db, 'org_trial')
    const trial = await createSubscription(db, {
      orgId: 'org_trial',
      plan: { planKey: 'free', planVersion: 1 },
      status: 'trialing',
      trialEndsAt: '2026-11-26T00:00:00.000Z',
    })
    await db
      .prepare('UPDATE organizations SET first_trial_at = ? WHERE id = ?')
      .bind('2026-11-19T00:00:00.000Z', 'org_trial')
      .run()
    await setSubscriptionStatus(db, { subscriptionId: trial.id, status: 'expired' })
    await renewContract(db, {
      orgId: 'org_trial',
      previousSubscriptionId: trial.id,
      plan: { planKey: 'starter', planVersion: 1 },
      status: 'active',
      changeType: 'upgrade',
    })
    const org = await db
      .prepare('SELECT first_trial_at FROM organizations WHERE id = ?')
      .bind('org_trial')
      .first<{ first_trial_at: string }>()
    expect(org?.first_trial_at).toBe('2026-11-19T00:00:00.000Z')
    expect((await liveSubscription(db, 'org_trial'))?.status).toBe('active')
  })

  test('billing reconciliation is idempotent and replayable after a failure', async () => {
    const db = await platformDb()
    await seedOrg(db, 'org_hook')
    let runs = 0
    const first = await applyBillingEvent(db, {
      provider: 'stripe',
      eventId: 'evt_1',
      eventType: 'invoice.paid',
      apply: async () => {
        runs += 1
      },
    })
    const duplicate = await applyBillingEvent(db, {
      provider: 'stripe',
      eventId: 'evt_1',
      eventType: 'invoice.paid',
      apply: async () => {
        runs += 1
      },
    })
    expect(first.applied).toBe(true)
    expect(duplicate.applied).toBe(false)
    expect(duplicate.reason).toBe('duplicate')
    expect(runs).toBe(1)

    let attempts = 0
    await expect(
      applyBillingEvent(db, {
        provider: 'stripe',
        eventId: 'evt_fail',
        apply: async () => {
          attempts += 1
          throw new Error('provider timeout')
        },
      }),
    ).rejects.toThrow('provider timeout')
    const retry = await applyBillingEvent(db, {
      provider: 'stripe',
      eventId: 'evt_fail',
      apply: async () => {
        attempts += 1
      },
    })
    expect(retry.applied).toBe(true)
    expect(attempts).toBe(2)
    const ledger = await db
      .prepare('SELECT status FROM platform_billing_events WHERE provider = ? AND event_id = ?')
      .bind('stripe', 'evt_fail')
      .first<{ status: string }>()
    expect(ledger?.status).toBe('processed')
  })

  test('invoices are mirrored once per provider invoice id', async () => {
    const db = await platformDb()
    await seedOrg(db, 'org_inv')
    const sub = await createSubscription(db, {
      orgId: 'org_inv',
      plan: { planKey: 'growth', planVersion: 1 },
      status: 'active',
      provider: 'stripe',
      providerSubscriptionId: 'sub_inv',
    })
    const a = await recordInvoice(db, {
      orgId: 'org_inv',
      subscriptionId: sub.id,
      provider: 'stripe',
      providerInvoiceId: 'in_1',
      amountMinor: 9900,
    })
    const b = await recordInvoice(db, {
      orgId: 'org_inv',
      subscriptionId: sub.id,
      provider: 'stripe',
      providerInvoiceId: 'in_1',
      amountMinor: 9900,
    })
    expect(a.applied).toBe(true)
    expect(b.applied).toBe(false)
    const count = await db
      .prepare('SELECT COUNT(*) AS n FROM platform_invoices WHERE org_id = ?')
      .bind('org_inv')
      .first<{ n: number }>()
    expect(Number(count?.n)).toBe(1)
  })

  test('a plan-move record cannot be duplicated by a replayed event id', async () => {
    const db = await platformDb()
    await seedOrg(db, 'org_change')
    const sub = await createSubscription(db, {
      orgId: 'org_change',
      plan: { planKey: 'free', planVersion: 1 },
      status: 'active',
    })
    const input = {
      orgId: 'org_change',
      subscriptionId: sub.id,
      from: { planKey: 'free', planVersion: 1 },
      to: { planKey: 'starter', planVersion: 1 },
      changeType: 'upgrade' as const,
      providerEventId: 'evt_dup',
    }
    expect((await recordChange(db, input)).applied).toBe(true)
    expect((await recordChange(db, input)).applied).toBe(false)
    expect(await changeHistory(db, 'org_change')).toHaveLength(1)
  })
})

describe('ownership claims and transfers', () => {
  test('the claim must use the email registered on the project', async () => {
    const db = await platformDb()
    await seedUser(db, 'usr_claim', 'owner@shop.test')
    const project = await makeProject(db, 'Claimed Shop', 'owner@shop.test')

    await expect(
      openClaim(db, {
        projectId: project.id,
        userId: 'usr_claim',
        emailNormalized: 'attacker@evil.test',
        verifyTokenHash: 'hash_a',
        expiresAt: '2026-11-19T01:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ClaimError)
  })

  test('a project without a registered email cannot be self-served', async () => {
    const db = await platformDb()
    await seedUser(db, 'usr_noemail', 'someone@shop.test')
    const project = await makeProject(db, 'No Email Shop', '')
    await expect(
      openClaim(db, {
        projectId: project.id,
        userId: 'usr_noemail',
        emailNormalized: 'someone@shop.test',
        verifyTokenHash: 'hash_b',
        expiresAt: '2026-11-19T01:00:00.000Z',
      }),
    ).rejects.toThrow(/no registered email/i)
  })

  test('one open claim per project, and no ownership transfer without proof', async () => {
    const db = await platformDb()
    await seedUser(db, 'usr_owner', 'owner@shop.test')
    const project = await makeProject(db, 'Two Claims Shop', 'owner@shop.test')
    const claim = await openClaim(db, {
      projectId: project.id,
      userId: 'usr_owner',
      emailNormalized: 'Owner@Shop.test',
      verifyTokenHash: 'hash_c',
      expiresAt: '2026-11-19T01:00:00.000Z',
    })
    await expect(
      openClaim(db, {
        projectId: project.id,
        userId: 'usr_owner',
        emailNormalized: 'owner@shop.test',
        verifyTokenHash: 'hash_d',
        expiresAt: '2026-11-19T01:00:00.000Z',
      }),
    ).rejects.toThrow(/already has an open claim/i)

    await seedOrg(db, 'org_claim')
    await expect(
      transferProjectOwnership(db, {
        claimId: claim.id,
        toOrgId: 'org_claim',
        actorType: 'user',
        actorId: 'usr_owner',
      }),
    ).rejects.toThrow(/approved claim/i)

    // Approval is refused until the emailed token has been verified.
    await expect(
      approveClaim(db, { claimId: claim.id, decidedBy: 'op_1' }),
    ).rejects.toThrow(/not been verified/i)
    await markClaimEmailVerified(db, { claimId: claim.id })
    expect((await approveClaim(db, { claimId: claim.id, decidedBy: 'op_1', note: 'registered email proven' })).applied).toBe(true)

    const transfer = await transferProjectOwnership(db, {
      claimId: claim.id,
      toOrgId: 'org_claim',
      actorType: 'operator',
      actorId: 'op_1',
      evidence: 'owner key + token to registered email',
    })
    expect(transfer.transferred).toBe(true)
    const row = await db
      .prepare('SELECT org_id FROM projects WHERE id = ?')
      .bind(project.id)
      .first<{ org_id: string }>()
    expect(row?.org_id).toBe('org_claim')
    const org = await db
      .prepare('SELECT claim_status, claimed_at FROM organizations WHERE id = ?')
      .bind('org_claim')
      .first<{ claim_status: string; claimed_at: string }>()
    expect(org?.claim_status).toBe('claimed')
    expect(org?.claimed_at).not.toBe('')
    const evidence = await db
      .prepare('SELECT evidence, reversed_at FROM ownership_transfers WHERE claim_id = ?')
      .bind(claim.id)
      .first<{ evidence: string; reversed_at: string }>()
    expect(evidence?.evidence).toContain('registered email')
    expect(evidence?.reversed_at).toBe('')

    // The same transfer is idempotent, and a claimed project cannot be re-claimed.
    expect(
      (
        await transferProjectOwnership(db, {
          claimId: claim.id,
          toOrgId: 'org_claim',
          actorType: 'operator',
          actorId: 'op_1',
        })
      ).transferred,
    ).toBe(false)
    await seedUser(db, 'usr_other', 'other@shop.test')
    await expect(
      openClaim(db, {
        projectId: project.id,
        userId: 'usr_other',
        emailNormalized: 'owner@shop.test',
        verifyTokenHash: 'hash_e',
        expiresAt: '2026-11-19T01:00:00.000Z',
      }),
    ).rejects.toThrow(/already has an owner/i)

    const audit = await db
      .prepare(`SELECT COUNT(*) AS n FROM audit_events WHERE project_id = ? AND action = 'ownership.transferred'`)
      .bind(project.id)
      .first<{ n: number }>()
    expect(Number(audit?.n)).toBe(1)
  })

  test('a dispute freezes transfers and the operator can reverse one', async () => {
    const db = await platformDb()
    await seedUser(db, 'usr_disp', 'dispute@shop.test')
    await seedOrg(db, 'org_from', 'unclaimed')
    await seedOrg(db, 'org_to')
    const project = await makeProject(db, 'Disputed Shop', 'dispute@shop.test')
    await db.prepare('UPDATE projects SET org_id = ? WHERE id = ?').bind('org_from', project.id).run()
    const claim = await openClaim(db, {
      projectId: project.id,
      userId: 'usr_disp',
      emailNormalized: 'dispute@shop.test',
      verifyTokenHash: 'hash_f',
      expiresAt: '2026-11-19T01:00:00.000Z',
    })
    await markClaimEmailVerified(db, { claimId: claim.id })
    await approveClaim(db, { claimId: claim.id, decidedBy: 'op_1' })
    const transfer = await transferProjectOwnership(db, {
      claimId: claim.id,
      toOrgId: 'org_to',
      actorType: 'user',
      actorId: 'usr_disp',
      evidence: 'verified email',
    })
    expect(transfer.transferred).toBe(true)

    await disputeClaim(db, { claimId: claim.id, actorId: 'op_2', note: 'former partner disputes ownership' })
    await expect(
      transferProjectOwnership(db, {
        claimId: claim.id,
        toOrgId: 'org_to',
        actorType: 'operator',
        actorId: 'op_2',
      }),
    ).rejects.toThrow(/frozen/i)

    const reversal = await reverseTransfer(db, {
      transferId: transfer.transferId!,
      reason: 'dispute upheld: prior agreement shows shared ownership',
      actorId: 'op_2',
    })
    expect(reversal.applied).toBe(true)
    const project2 = await db
      .prepare('SELECT org_id FROM projects WHERE id = ?')
      .bind(project.id)
      .first<{ org_id: string }>()
    expect(project2?.org_id).toBe('org_from')
    const reversed = await db
      .prepare('SELECT reversed_at, reversal_reason FROM ownership_transfers WHERE id = ?')
      .bind(transfer.transferId!)
      .first<{ reversed_at: string; reversal_reason: string }>()
    expect(reversed?.reversed_at).not.toBe('')
    expect(reversed?.reversal_reason).toContain('dispute upheld')
    expect((await reverseTransfer(db, { transferId: transfer.transferId!, reason: 'again', actorId: 'op_2' })).applied).toBe(false)
  })

  test('an unverified account cannot invite, change plans or start billing', () => {
    const unverified = { emailVerifiedAt: '', status: 'active' }
    const verified = { emailVerifiedAt: '2026-11-19T00:00:00.000Z', status: 'active' }
    const env = { PLATFORM_FLAGS: 'billing.enabled=1' }

    expect(canInviteMembers(unverified)).toEqual({ allowed: false, reason: 'email_unverified' })
    expect(canChangePlan(unverified, env, 'active')).toEqual({ allowed: false, reason: 'email_unverified' })
    expect(canStartBilling(unverified, env)).toEqual({ allowed: false, reason: 'email_unverified' })

    expect(canInviteMembers(verified)).toEqual({ allowed: true })
    expect(canChangePlan(verified, env, 'active')).toEqual({ allowed: true })
    expect(canStartBilling(verified, env)).toEqual({ allowed: true })
    // Billing stays dark until the flag is on, even for a verified owner.
    expect(canStartBilling(verified, {})).toEqual({ allowed: false, reason: 'billing_disabled' })
    // Suspended accounts lose every privileged action.
    expect(canChangePlan({ ...verified, status: 'suspended' }, env)).toEqual({
      allowed: false,
      reason: 'account_suspended',
    })
  })
})

describe('M2 backfill', () => {
  test('creates one unclaimed organisation per project without any owner', async () => {
    const db = await platformDb()
    const projects = [
      await makeProject(db, 'Alpha Cafe', 'alpha@shop.test'),
      await makeProject(db, "Ben's \"Buns\"", ''),
      await makeProject(db, 'Gamma Goods'),
    ]
    const before = await legacySnapshot(db, '2026-11-19T00:00:00.000Z')

    const report = await backfillProjectOrganizations(db, { at: '2026-11-19T00:00:00.000Z' })
    expect(report.projects).toBe(3)
    expect(report.createdOrganizations).toBe(3)
    expect(report.linkedNow).toBe(3)
    expect(report.linkedProjects).toBe(3)

    const after = await legacySnapshot(db, '2026-11-19T00:00:01.000Z')
    const diff = diffSnapshots(before, after)
    expect(diff.countChanges).toEqual([])
    expect(diff.preserved).toBe(true)

    const orgs = await db
      .prepare('SELECT id, name, slug, claim_status, claimed_at FROM organizations ORDER BY slug')
      .all<{ id: string; name: string; slug: string; claim_status: string; claimed_at: string }>()
    expect(orgs.results).toHaveLength(3)
    for (const org of orgs.results ?? []) {
      expect(org.claim_status).toBe('unclaimed')
      expect(org.claimed_at).toBe('')
    }
    for (const project of projects) {
      const row = await db
        .prepare('SELECT org_id, token FROM projects WHERE id = ?')
        .bind(project.id)
        .first<{ org_id: string; token: string }>()
      expect(row?.token).toBe(project.token)
      expect(row?.org_id).toBe(organizationIdForProject(project.token))
    }
    const created = await db
      .prepare(`SELECT slug FROM organizations WHERE id = ?`)
      .bind(organizationIdForProject(projects[0]!.token))
      .first<{ slug: string }>()
    expect(created?.slug).toBe(organizationSlugForProject(projects[0]!.token))

    const reconciliation = await reconcileBackfill(db)
    expect(reconciliation.ok).toBe(true)
    expect(reconciliation.users).toBe(0)
    expect(reconciliation.memberships).toBe(0)
    expect(reconciliation.claims).toBe(0)
    expect(reconciliation.transfers).toBe(0)
    expect(reconciliation.subscriptions).toBe(0)
    expect(reconciliation.syntheticUnclaimed).toBe(3)
  })

  test('is idempotent and can pick up projects created after the first run', async () => {
    const db = await platformDb()
    await makeProject(db, 'First Shop')
    await backfillProjectOrganizations(db)
    const second = await backfillProjectOrganizations(db)
    expect(second.createdOrganizations).toBe(0)
    expect(second.linkedNow).toBe(0)
    expect(second.alreadyLinked).toBe(1)

    const later = await makeProject(db, 'Later Shop')
    const third = await backfillProjectOrganizations(db)
    expect(third.createdOrganizations).toBe(1)
    expect(third.linkedNow).toBe(1)
    const row = await db
      .prepare('SELECT org_id FROM projects WHERE id = ?')
      .bind(later.id)
      .first<{ org_id: string }>()
    expect(row?.org_id).toBe(organizationIdForProject(later.token))
    const count = await db.prepare('SELECT COUNT(*) AS n FROM organizations').first<{ n: number }>()
    expect(Number(count?.n)).toBe(2)
  })

  test('preserves documents, media, orders, bookings, customers and payment rows', async () => {
    const db = await platformDb()
    const project = await makeProject(db, 'Data Shop')
    await addNote(db, project, 'Please change the hero image', 'customer')
    const now = '2026-11-19T00:00:00.000Z'
    await db
      .prepare('INSERT INTO doc_versions (id, project_id, doc, created_at) VALUES (?, ?, ?, ?)')
      .bind('dvr_1', project.id, JSON.stringify({ screens: [{ id: 'home' }] }), now)
      .run()
    await db
      .prepare(
        `INSERT INTO media (id, project_id, hash, width, height, bytes, alt, focal_x, focal_y, created_at, variants)
         VALUES (?, ?, ?, 800, 600, 1234, 'hero', 50, 50, ?, '[]')`,
      )
      .bind('med_1', project.id, 'hash_1', now)
      .run()
    await db
      .prepare(
        `INSERT INTO customers (id, project_id, contact_key, name, email, phone, created_at, updated_at)
         VALUES (?, ?, ?, 'Ada', 'ada@shop.test', '', ?, ?)`,
      )
      .bind('cus_1', project.id, 'ada@shop.test', now, now)
      .run()
    await db
      .prepare(
        `INSERT INTO orders (id, project_id, customer_id, number, status, fulfilment, note, subtotal, delivery_fee, total, payment_status, created_at, updated_at)
         VALUES (?, ?, ?, 'ORD-1', 'paid', 'pickup', '', 1200, 0, 1200, 'paid', ?, ?)`,
      )
      .bind('ord_1', project.id, 'cus_1', now, now)
      .run()
    await db
      .prepare('INSERT INTO order_items (id, order_id, menu_key, name, price, qty) VALUES (?, ?, ?, ?, 600, 2)')
      .bind('oit_1', 'ord_1', 'sku_1', 'Bun')
      .run()
    await db
      .prepare(
        `INSERT INTO bookings (id, project_id, customer_id, number, status, date, slot, party, service, staff, note, created_at, updated_at, payment_status, paid_amount)
         VALUES (?, ?, ?, 'BK-1', 'confirmed', '2026-11-20', '18:00', 2, 'Cut', 'Sam', '', ?, ?, 'paid', 500)`,
      )
      .bind('bok_1', project.id, 'cus_1', now, now)
      .run()
    await db
      .prepare(
        `INSERT INTO enquiries (id, project_id, customer_id, name, contact, message, status, created_at, updated_at)
         VALUES (?, ?, ?, 'Ada', 'ada@shop.test', 'Do you deliver?', 'new', ?, ?)`,
      )
      .bind('enq_1', project.id, 'cus_1', now, now)
      .run()
    await db
      .prepare(
        `INSERT INTO payment_connections (id, project_id, provider, mode, key_id, secrets, status, last_verification, last_verified_at, last_error, created_at, updated_at)
         VALUES (?, ?, 'razorpay', 'test', 'rzp_test', 'cipher', 'connected', 'ok', ?, '', ?, ?)`,
      )
      .bind('con_1', project.id, now, now, now)
      .run()
    await db
      .prepare(
        `INSERT INTO payment_transactions
          (id, project_id, connection_id, provider, mode, kind, ref_id, ref_number, customer_id, customer_name,
           customer_email, customer_phone, provider_order_id, provider_payment_id, provider_refund_id, amount,
           currency, status, refund_status, amount_refunded, checkout_url, failure_reason, created_at, updated_at, paid_at)
         VALUES (?, ?, 'con_1', 'razorpay', 'test', 'order', 'ord_1', 'ORD-1', 'cus_1', 'Ada',
                 'ada@shop.test', '', 'order_x', 'pay_x', '', 1200, 'INR', 'paid', 'none', 0, '', '', ?, ?, ?)`,
      )
      .bind('pay_1', project.id, now, now, now)
      .run()
    await db
      .prepare(
        `INSERT INTO payment_events (id, project_id, provider, event_id, event_type, status, detail, created_at)
         VALUES (?, ?, 'razorpay', 'evt_biz_1', 'payment.captured', 'processed', '', ?)`,
      )
      .bind('pev_1', project.id, now)
      .run()

    const before = await legacySnapshot(db, now)
    await backfillProjectOrganizations(db, { at: now })
    const after = await legacySnapshot(db, now)
    const diff = diffSnapshots(before, after)
    expect(diff.digestChanges).toEqual([])
    expect(diff.preserved).toBe(true)
    expect(after.counts.orders).toBe(1)
    expect(after.counts.bookings).toBe(1)
    expect(after.counts.customers).toBe(1)
    expect(after.counts.media).toBe(1)
    expect(after.counts.payment_transactions).toBe(1)
    // Counts of the new platform tables are additive only.
    expect(after.counts.projects).toBe(before.counts.projects)
  })

  test('deleting an app removes its synthetic organisation instead of orphaning it', async () => {
    const db = await platformDb()
    const project = await makeProject(db, 'Deleted Shop')
    await backfillProjectOrganizations(db)
    expect(await reconcileBackfill(db)).toMatchObject({ ok: true, syntheticOrganizations: 1 })
    await deleteProject(db, project.id)
    const orgs = await db.prepare('SELECT COUNT(*) AS n FROM organizations').first<{ n: number }>()
    expect(Number(orgs?.n)).toBe(0)
  })
})

describe('tenant isolation and integrity', () => {
  test('organisation reads never cross tenants', async () => {
    const db = await platformDb()
    const a = await makeProject(db, 'Shop A')
    const b = await makeProject(db, 'Shop B')
    await backfillProjectOrganizations(db)
    const orgA = organizationIdForProject(a.token)
    const orgB = organizationIdForProject(b.token)

    expect((await listOrgProjects(db, orgA)).map((row) => row.id)).toEqual([a.id])
    expect((await listOrgProjects(db, orgB)).map((row) => row.id)).toEqual([b.id])
    expect(await getOrgProject(db, orgA, b.id)).toBeNull()
    expect((await getOrgProject(db, orgA, a.id))?.token).toBe(a.token)
    expect(await countOrgProjects(db, orgA)).toBe(1)
    expect(await listOrgProjects(db, '')).toEqual([])
  })

  test('foreign keys reject rows that point at another tenant’s absence', async () => {
    const db = await platformDb()
    await seedUser(db, 'usr_fk', 'fk@shop.test')
    await expect(
      db
        .prepare('INSERT INTO memberships (org_id, user_id, role, created_at) VALUES (?, ?, ?, ?)')
        .bind('org_missing', 'usr_fk', 'owner', '2026-11-19T00:00:00.000Z')
        .run(),
    ).rejects.toThrow(/FOREIGN KEY/i)
    await expect(
      db
        .prepare('INSERT INTO user_sessions (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
        .bind('ses_1', 'usr_missing', 'hash', '2026-11-19T00:00:00.000Z', '2026-12-19T00:00:00.000Z')
        .run(),
    ).rejects.toThrow(/FOREIGN KEY/i)
    await expect(
      db
        .prepare('INSERT INTO subscriptions (id, org_id, plan_key, plan_version, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind('sub_fk', 'org_missing', 'free', 1, 'active', '2026-11-19T00:00:00.000Z', '2026-11-19T00:00:00.000Z')
        .run(),
    ).rejects.toThrow(/FOREIGN KEY/i)
  })

  test('integrity checks pass on a migrated, backfilled database', async () => {
    const db = await platformDb()
    await makeProject(db, 'Integrity Shop')
    await backfillProjectOrganizations(db)
    const report = await verifyPlatformIntegrity(db)
    expect(report.checks.find((check) => check.name === 'm2.reconciliation')?.ok).toBe(true)
    expect(report.checks.find((check) => check.name === 'schema.unique_indexes')?.ok).toBe(true)
    expect(report.ok).toBe(true)
  })
})

describe('rollback', () => {
  test('drops only the additive schema and leaves every app row working', async () => {
    const db = await platformDb()
    const project = await makeProject(db, 'Rollback Shop')
    await addNote(db, project, 'keep this note', 'customer')
    const before = await legacySnapshot(db, '2026-11-19T00:00:00.000Z')
    await backfillProjectOrganizations(db)
    expect((await legacySnapshot(db, '2026-11-19T00:00:01.000Z')).counts.notes).toBe(
      before.counts.notes,
    )

    const result = await rollbackPlatformSchema(db)
    expect(result.droppedTables).toContain('subscriptions')
    expect(result.droppedTables).toContain('organizations')
    const state = await platformSchemaState(db)
    expect(state.present).toEqual([])
    expect(state.missing.length).toBe(PLATFORM_TABLES.length)
    expect(state.projectColumns.org_id).toBe(false)

    // Snapshot before any read: getProject normalises sample content on first
    // read, which legitimately writes `spec`.
    const after = await legacySnapshot(db, '2026-11-19T00:00:02.000Z')
    expect(diffSnapshots(before, after).preserved).toBe(true)

    // Existing app behaviour survives the rollback untouched.
    const reloaded = await getProject(db, project.token)
    expect(reloaded?.id).toBe(project.id)
    expect(reloaded?.name).toBe('Rollback Shop')
    const created = await makeProject(db, 'Post Rollback Shop')
    expect(created.token).toHaveLength(24)
  })
})
