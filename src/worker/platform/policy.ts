/**
 * Privileged-action policy for organisation accounts.
 *
 * The rule that matters for migration safety: proving control of a legacy
 * owner key can make someone an app owner, but an *unverified* account must
 * never be able to spend money, change a plan or add people. Billing is also
 * gated on the `billing.enabled` flag so nothing new can be charged while the
 * platform work is dark-launched.
 */

import type { FlagEnv } from './flags'
import { platformFlags } from './flags'

export type PolicyReason =
  | 'account_suspended'
  | 'email_unverified'
  | 'billing_disabled'
  | 'subscription_inactive'

export type PolicyResult = { allowed: true } | { allowed: false; reason: PolicyReason }

export type AccountState = {
  /** Empty string or null means the address has never been verified. */
  emailVerifiedAt?: string | null
  status?: string | null
}

const OK: PolicyResult = { allowed: true }

function verified(account: AccountState): boolean {
  return Boolean((account.emailVerifiedAt ?? '').trim())
}

function suspended(account: AccountState): boolean {
  const status = account.status ?? 'active'
  return status === 'suspended' || status === 'closed'
}

/** Invitations: verified and active. Flags do not apply to a member of an org. */
export function canInviteMembers(account: AccountState): PolicyResult {
  if (suspended(account)) return { allowed: false, reason: 'account_suspended' }
  if (!verified(account)) return { allowed: false, reason: 'email_unverified' }
  return OK
}

/** Plan changes require a verified account and billing enabled. */
export function canChangePlan(
  account: AccountState,
  env: FlagEnv,
  subscriptionStatus?: string,
): PolicyResult {
  if (suspended(account)) return { allowed: false, reason: 'account_suspended' }
  if (!verified(account)) return { allowed: false, reason: 'email_unverified' }
  if (!platformFlags(env)['billing.enabled']) return { allowed: false, reason: 'billing_disabled' }
  if (subscriptionStatus === 'expired' || subscriptionStatus === 'cancelled')
    return { allowed: false, reason: 'subscription_inactive' }
  return OK
}

/** Starting a checkout or trial: verified account, billing enabled. */
export function canStartBilling(account: AccountState, env: FlagEnv): PolicyResult {
  if (suspended(account)) return { allowed: false, reason: 'account_suspended' }
  if (!verified(account)) return { allowed: false, reason: 'email_unverified' }
  if (!platformFlags(env)['billing.enabled']) return { allowed: false, reason: 'billing_disabled' }
  return OK
}

export function reasonMessage(reason: PolicyReason): string {
  switch (reason) {
    case 'account_suspended':
      return 'This account is suspended. Contact support.'
    case 'email_unverified':
      return 'Verify your email address before changing billing or inviting members.'
    case 'billing_disabled':
      return 'Billing is not enabled yet.'
    case 'subscription_inactive':
      return 'This subscription has ended. Start a new one to change plans.'
  }
}
