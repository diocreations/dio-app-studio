/**
 * Gateway credentials are encrypted before they reach D1. AES-GCM with a
 * deployment-managed key (PAYMENT_ENCRYPTION_KEY, base64, 32 bytes) means a
 * database dump alone does not expose a business's payment secrets. The AAD
 * binds every ciphertext to its project and provider, so a copied blob cannot
 * be replayed under another business.
 */

const encoder = new TextEncoder()

export type EncryptedValue = string

export class SecretVaultError extends Error {
  constructor(message = 'Payment credential storage is not configured.') {
    super(message)
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

/** Null means the deployment has no valid key; callers must refuse to store. */
export function paymentVaultKey(env: { PAYMENT_ENCRYPTION_KEY?: string }): Uint8Array | null {
  const raw = (env.PAYMENT_ENCRYPTION_KEY ?? '').trim()
  if (!raw) return null
  try {
    const bytes = fromBase64(raw)
    return bytes.length === 32 ? bytes : null
  } catch {
    return null
  }
}

async function importAesKey(keyBytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ])
}

function aadFor(projectId: string, provider: string): Uint8Array {
  return encoder.encode(`plattr-payment-v1:${projectId}:${provider}`)
}

export async function encryptJson(
  key: Uint8Array,
  projectId: string,
  provider: string,
  value: unknown,
): Promise<EncryptedValue> {
  if (key.length !== 32) throw new SecretVaultError()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aadFor(projectId, provider) },
    await importAesKey(key),
    encoder.encode(JSON.stringify(value)),
  )
  return `v1.${toBase64(iv)}.${toBase64(new Uint8Array(cipher))}`
}

export async function decryptJson<T>(
  key: Uint8Array,
  projectId: string,
  provider: string,
  stored: string,
): Promise<T | null> {
  const [version, ivPart, cipherPart] = (stored ?? '').split('.')
  if (version !== 'v1' || !ivPart || !cipherPart) return null
  try {
    const plain = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: fromBase64(ivPart),
        additionalData: aadFor(projectId, provider),
      },
      await importAesKey(key),
      fromBase64(cipherPart),
    )
    return JSON.parse(new TextDecoder().decode(plain)) as T
  } catch {
    return null
  }
}

export async function hmacHex(secret: string, message: string | Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const bytes = typeof message === 'string' ? encoder.encode(message) : message
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, bytes))
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Constant-time comparison for hex signatures. */
export function sameHex(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false
  let diff = 0
  for (let index = 0; index < a.length; index += 1)
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index)
  return diff === 0
}
