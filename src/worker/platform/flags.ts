/**
 * M0 — dark launch switches for the platform work.
 *
 * Every flag is off unless an operator turns it on, so an untouched deployment
 * behaves exactly like the pre-platform Worker. Flags live in the environment
 * (`PLATFORM_FLAGS`) rather than a table on purpose: changing them is a config
 * change, never a migration, and a flag can never be flipped by a database
 * write from an application route.
 *
 * Format: a comma separated list of `name=value` pairs. `1/true/on/yes` turn a
 * flag on, `0/false/off/no` turn it off. Unknown names are ignored so a typo
 * cannot enable something. An unset binding means "all off".
 */

export type PlatformFlag = 'accounts.enabled' | 'billing.enabled' | 'admin.enabled'

export const PLATFORM_FLAG_NAMES: readonly PlatformFlag[] = [
  'accounts.enabled',
  'billing.enabled',
  'admin.enabled',
]

export type PlatformFlags = Record<PlatformFlag, boolean>

const ALL_OFF: PlatformFlags = {
  'accounts.enabled': false,
  'billing.enabled': false,
  'admin.enabled': false,
}

const FALSEY = /^(0|false|off|no)$/i

export function parsePlatformFlags(raw: string | undefined | null): PlatformFlags {
  const flags: PlatformFlags = { ...ALL_OFF }
  if (!raw) return flags
  for (const entry of raw.split(',')) {
    const [rawName, rawValue = '1'] = entry.split('=')
    const name = rawName.trim() as PlatformFlag
    if (!PLATFORM_FLAG_NAMES.includes(name)) continue
    flags[name] = !FALSEY.test(rawValue.trim())
  }
  return flags
}

export type FlagEnv = { PLATFORM_FLAGS?: string } | undefined | null

export function platformFlags(env: FlagEnv): PlatformFlags {
  return parsePlatformFlags(env?.PLATFORM_FLAGS)
}

export function flagEnabled(env: FlagEnv, flag: PlatformFlag): boolean {
  return platformFlags(env)[flag]
}

/**
 * Billing is the only flag that gates money, so it gets a named check that
 * cannot be mistaken for a display toggle.
 */
export function billingEnabled(env: FlagEnv): boolean {
  return flagEnabled(env, 'billing.enabled')
}
