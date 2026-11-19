/**
 * Ownership claims and transfers.
 *
 * M2 creates organisations but never an owner: a synthetic organisation is
 * `unclaimed` and nothing in the schema links a user to it. Ownership only
 * moves through this module, and it requires an *approved* claim whose email
 * proof has been recorded. That is what stops an unverified address from
 * taking a business over, and it is why the transfer, its evidence and its
 * audit row are written together.
 */

import { newPlatformId, recordAudit } from './audit'
import { ensurePlatformSchema } from './schema'

export type ClaimStatus =
  | 'pending_email'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'cancelled'
  | 'disputed'

export type ClaimRow = {
  id: string
  project_id: string
  user_id: string
  email_normalized: string
  email_source: string
  verify_token_hash: string
  status: ClaimStatus
  attempts: number
  expires_at: string
  created_at: string
  email_verified_at: string
  decided_at: string
  decided_by: string
  decision_note: string
}

export class ClaimError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'ClaimError'
  }
}

/**
 * Starts a claim in `pending_email`. The caller has already checked the legacy
 * owner key and hashed the single-use token for `projects.email`; nothing here
 * grants anything, and the partial unique index allows only one open claim per
 * project.
 */
export async function openClaim(
  db: D1Database,
  input: {
    projectId: string
    userId: string
    emailNormalized: string
    verifyTokenHash: string
    expiresAt: string
    emailSource?: 'project' | 'operator_override'
    at?: string
  },
): Promise<{ id: string }> {
  await ensurePlatformSchema(db)
  const project = await db
    .prepare(
      `SELECT p.email, p.org_id, o.claim_status
         FROM projects p LEFT JOIN organizations o ON o.id = p.org_id
        WHERE p.id = ?`,
    )
    .bind(input.projectId)
    .first<{ email: string; org_id: string; claim_status: string | null }>()
  if (!project) throw new ClaimError('project_not_found', 'Project not found.')
  if (project.claim_status === 'claimed')
    throw new ClaimError('project_already_claimed', 'This project already has an owner.')

  // The second proof has to reach the address already on the project. A claim
  // for any other address is only possible through the operator override path,
  // which is audited and requires out-of-band evidence.
  const registered = (project.email ?? '').trim().toLowerCase()
  const claimedEmail = input.emailNormalized.trim().toLowerCase()
  if ((input.emailSource ?? 'project') === 'project') {
    if (!registered)
      throw new ClaimError(
        'no_registered_email',
        'This project has no registered email; an operator must verify ownership.',
      )
    if (registered !== claimedEmail)
      throw new ClaimError('email_mismatch', 'The claim must use the project\'s registered email.')
  }

  const id = newPlatformId('clm')
  try {
    await db
      .prepare(
        `INSERT INTO project_claims
          (id, project_id, user_id, email_normalized, email_source, verify_token_hash,
           status, attempts, expires_at, created_at, email_verified_at, decided_at, decided_by, decision_note)
         VALUES (?, ?, ?, ?, ?, ?, 'pending_email', 0, ?, ?, '', '', '', '')`,
      )
      .bind(
        id,
        input.projectId,
        input.userId,
        input.emailNormalized.trim().toLowerCase(),
        input.emailSource ?? 'project',
        input.verifyTokenHash,
        input.expiresAt,
        input.at ?? new Date().toISOString(),
      )
      .run()
  } catch (error) {
    if (/UNIQUE/i.test(String(error)))
      throw new ClaimError('claim_already_open', 'This project already has an open claim.')
    throw error
  }
  await recordAudit(db, {
    actorType: 'user',
    actorId: input.userId,
    projectId: input.projectId,
    action: 'claim.started',
    target: id,
    detail: 'Claim pending email verification',
    at: input.at,
  })
  return { id }
}

export async function getClaim(db: D1Database, claimId: string): Promise<ClaimRow | null> {
  await ensurePlatformSchema(db)
  return db.prepare('SELECT * FROM project_claims WHERE id = ?').bind(claimId).first<ClaimRow>()
}

/** The email proof. Without this the claim can never be approved. */
export async function markClaimEmailVerified(
  db: D1Database,
  input: { claimId: string; at?: string },
): Promise<{ applied: boolean }> {
  await ensurePlatformSchema(db)
  const claim = await getClaim(db, input.claimId)
  if (!claim) throw new ClaimError('claim_not_found', 'Claim not found.')
  if (claim.status === 'disputed') throw new ClaimError('claim_disputed', 'This claim is disputed.')
  if (claim.status !== 'pending_email')
    throw new ClaimError('claim_not_pending', 'This claim is not waiting for email verification.')
  const result = await db
    .prepare(
      `UPDATE project_claims
          SET email_verified_at = ?, status = 'pending_review'
        WHERE id = ? AND status = 'pending_email'`,
    )
    .bind(input.at ?? new Date().toISOString(), input.claimId)
    .run()
  return { applied: Number((result as { meta?: { changes?: number } }).meta?.changes ?? 0) === 1 }
}

/**
 * Approval is an operator decision *after* the email proof, or the automatic
 * path for a clean case. It is refused when no email proof exists, so an
 * operator cannot shortcut the second factor.
 */
export async function approveClaim(
  db: D1Database,
  input: { claimId: string; decidedBy: string; note?: string; at?: string },
): Promise<{ applied: boolean }> {
  await ensurePlatformSchema(db)
  const claim = await getClaim(db, input.claimId)
  if (!claim) throw new ClaimError('claim_not_found', 'Claim not found.')
  if (!claim.email_verified_at)
    throw new ClaimError('email_not_verified', 'The registered email has not been verified.')
  if (claim.status === 'approved') return { applied: false }
  if (claim.status === 'disputed')
    throw new ClaimError('claim_disputed', 'Resolve the dispute before approving.')
  if (claim.status !== 'pending_review')
    throw new ClaimError('claim_not_reviewable', 'Only a verified claim can be approved.')
  const at = input.at ?? new Date().toISOString()
  const result = await db
    .prepare(
      `UPDATE project_claims
          SET status = 'approved', decided_at = ?, decided_by = ?, decision_note = ?
        WHERE id = ? AND status = 'pending_review'`,
    )
    .bind(at, input.decidedBy, (input.note ?? '').slice(0, 400), input.claimId)
    .run()
  const applied = Number((result as { meta?: { changes?: number } }).meta?.changes ?? 0) === 1
  if (applied) {
    await recordAudit(db, {
      actorType: 'operator',
      actorId: input.decidedBy,
      projectId: claim.project_id,
      action: 'claim.approved',
      target: claim.id,
      detail: input.note ?? 'Verified owner email',
      at,
    })
  }
  return { applied }
}

export async function disputeClaim(
  db: D1Database,
  input: { claimId: string; actorId: string; note: string; at?: string },
): Promise<{ applied: boolean }> {
  await ensurePlatformSchema(db)
  const claim = await getClaim(db, input.claimId)
  if (!claim) throw new ClaimError('claim_not_found', 'Claim not found.')
  const at = input.at ?? new Date().toISOString()
  const result = await db
    .prepare(
      `UPDATE project_claims SET status = 'disputed', decided_at = ?, decision_note = ?
        WHERE id = ? AND status IN ('pending_email', 'pending_review', 'approved')`,
    )
    .bind(at, input.note.slice(0, 400), input.claimId)
    .run()
  const applied = Number((result as { meta?: { changes?: number } }).meta?.changes ?? 0) === 1
  if (applied) {
    await recordAudit(db, {
      actorType: 'operator',
      actorId: input.actorId,
      projectId: claim.project_id,
      action: 'claim.disputed',
      target: claim.id,
      detail: input.note.slice(0, 400),
      at,
    })
  }
  return { applied }
}

export type TransferInput = {
  claimId: string
  toOrgId: string
  actorType: 'user' | 'operator'
  actorId: string
  /** Redacted description of what proved ownership (never a key or token). */
  evidence?: string
  at?: string
}

/**
 * Moves one project into an organisation. Refused unless the claim is approved
 * with a proven email and no dispute is open. Idempotent for the same target.
 */
export async function transferProjectOwnership(
  db: D1Database,
  input: TransferInput,
): Promise<{ transferred: boolean; transferId: string | null; reason?: string }> {
  await ensurePlatformSchema(db)
  const claim = await getClaim(db, input.claimId)
  if (!claim) throw new ClaimError('claim_not_found', 'Claim not found.')
  if (claim.status === 'disputed')
    throw new ClaimError('claim_disputed', 'Ownership transfers are frozen while a dispute is open.')
  if (claim.status !== 'approved')
    throw new ClaimError('claim_not_approved', 'Ownership can only transfer on an approved claim.')
  if (!claim.email_verified_at)
    throw new ClaimError('email_not_verified', 'The registered email has not been verified.')

  const project = await db
    .prepare('SELECT id, org_id, token FROM projects WHERE id = ?')
    .bind(claim.project_id)
    .first<{ id: string; org_id: string; token: string }>()
  if (!project) throw new ClaimError('project_not_found', 'Project not found.')
  const org = await db
    .prepare('SELECT id, claim_status FROM organizations WHERE id = ?')
    .bind(input.toOrgId)
    .first<{ id: string; claim_status: string }>()
  if (!org) throw new ClaimError('org_not_found', 'Organisation not found.')

  const existing = await db
    .prepare(
      `SELECT id FROM ownership_transfers
        WHERE claim_id = ? AND project_id = ? AND reversed_at = '' LIMIT 1`,
    )
    .bind(claim.id, claim.project_id)
    .first<{ id: string }>()
  if (existing && project.org_id === input.toOrgId)
    return { transferred: false, transferId: existing.id, reason: 'already_transferred' }

  const at = input.at ?? new Date().toISOString()
  const transferId = newPlatformId('xfr')
  await db.batch([
    db.prepare('UPDATE projects SET org_id = ? WHERE id = ?').bind(input.toOrgId, project.id),
    db
      .prepare(
        `INSERT INTO ownership_transfers
          (id, project_id, claim_id, from_org_id, to_org_id, actor_type, actor_id,
           evidence, created_at, reversed_at, reversal_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', '')`,
      )
      .bind(
        transferId,
        project.id,
        claim.id,
        project.org_id,
        input.toOrgId,
        input.actorType,
        input.actorId,
        (input.evidence ?? '').slice(0, 400),
        at,
      ),
    db
      .prepare(
        `UPDATE organizations SET claim_status = 'claimed', claimed_at = ?, updated_at = ?
          WHERE id = ? AND claim_status = 'unclaimed'`,
      )
      .bind(at, at, input.toOrgId),
  ])
  await recordAudit(db, {
    actorType: input.actorType,
    actorId: input.actorId,
    orgId: input.toOrgId,
    projectId: project.id,
    action: 'ownership.transferred',
    target: transferId,
    detail: `Claim ${claim.id} → org ${input.toOrgId}`,
    at,
  })
  return { transferred: true, transferId }
}

/**
 * Manual recovery. An operator reverses a transfer after a dispute, which puts
 * the project back with its previous holder (or back to legacy-resolve when
 * there was none). The transfer row itself is never deleted.
 */
export async function reverseTransfer(
  db: D1Database,
  input: { transferId: string; reason: string; actorId: string; at?: string },
): Promise<{ applied: boolean }> {
  await ensurePlatformSchema(db)
  const transfer = await db
    .prepare('SELECT * FROM ownership_transfers WHERE id = ?')
    .bind(input.transferId)
    .first<{
      id: string
      project_id: string
      from_org_id: string
      to_org_id: string
      reversed_at: string
    }>()
  if (!transfer) throw new ClaimError('transfer_not_found', 'Transfer not found.')
  if (transfer.reversed_at) return { applied: false }
  const at = input.at ?? new Date().toISOString()
  await db.batch([
    db
      .prepare('UPDATE ownership_transfers SET reversed_at = ?, reversal_reason = ? WHERE id = ?')
      .bind(at, input.reason.slice(0, 400), input.transferId),
    db
      .prepare('UPDATE projects SET org_id = ? WHERE id = ?')
      .bind(transfer.from_org_id, transfer.project_id),
  ])
  await recordAudit(db, {
    actorType: 'operator',
    actorId: input.actorId,
    orgId: transfer.from_org_id,
    projectId: transfer.project_id,
    action: 'ownership.transfer_reversed',
    target: input.transferId,
    detail: input.reason.slice(0, 400),
    at,
  })
  return { applied: true }
}

export async function claimForProject(
  db: D1Database,
  projectId: string,
): Promise<ClaimRow | null> {
  await ensurePlatformSchema(db)
  return db
    .prepare(
      `SELECT * FROM project_claims
        WHERE project_id = ? AND status IN ('pending_email', 'pending_review', 'disputed')
        ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(projectId)
    .first<ClaimRow>()
}
