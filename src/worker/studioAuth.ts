/**
 * One operator key, held in the Worker's secret store, opens /studio. The cookie
 * carries an HMAC of that key rather than the key itself, so a lifted cookie is
 * not the deployment secret, and comparison never short-circuits on content.
 */

export const STUDIO_COOKIE = 'plattr_studio'
export const STUDIO_SESSION_MAX_AGE = 60 * 60 * 24 * 7
const SESSION_MESSAGE = 'plattr-studio-session-v1'

const encoder = new TextEncoder()

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Length-independent comparison, so a wrong value cannot be timed byte by byte. */
function same(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false
  let diff = 0
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index)
  return diff === 0
}

export async function studioSession(key: string): Promise<string> {
  if (!key) return ''
  const hmac = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', hmac, encoder.encode(SESSION_MESSAGE))))
}

/**
 * An unset key never authenticates: a deployment that forgot the secret serves
 * the locked page rather than the customer board.
 */
export async function isOperator(
  cookie: string | undefined,
  key: string | undefined,
): Promise<boolean> {
  if (!key || !cookie) return false
  return same(cookie, await studioSession(key))
}

export async function matchesOperatorKey(
  given: string,
  key: string | undefined,
): Promise<boolean> {
  if (!given || !key) return false
  return same(await studioSession(given), await studioSession(key))
}
