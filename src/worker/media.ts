import type { Doc } from './doc'
import type { Project } from './db'
import type { VerticalId } from './types'

/**
 * Project media. Images are decoded and re-encoded in the browser (a Worker has
 * no image codec), then every variant is validated again here: magic bytes,
 * dimensions, byte size and count. Only WebP variants are stored; originals are
 * never written to R2. Keys are content-addressed by the original's SHA-256, so
 * re-uploading the same photograph reuses the same objects.
 */

export type MediaVariant = { width: number; height: number; bytes: number; key: string }
export type MediaRecord = {
  id: string
  projectId: string
  hash: string
  width: number
  height: number
  bytes: number
  alt: string
  focalX: number
  focalY: number
  createdAt: string
  variants: MediaVariant[]
}

export type MediaBucket = {
  put(key: string, value: ArrayBuffer, options?: unknown): Promise<unknown>
  get(key: string): Promise<{ body: ReadableStream | ArrayBuffer | null; httpEtag?: string } | null>
  delete(key: string | string[]): Promise<unknown>
}

export const MEDIA_LIMITS = {
  /** The best variant may not exceed this; the browser also enforces it. */
  maxBytes: 8 * 1024 * 1024,
  maxPixels: 24_000_000,
  maxFiles: 24,
  maxTotalBytes: 40 * 1024 * 1024,
  widths: [320, 640, 1280],
} as const

export type MediaErrorCode =
  | 'unsupported_type'
  | 'too_large'
  | 'too_many_pixels'
  | 'invalid_image'
  | 'bad_variants'
  | 'quota_files'
  | 'quota_bytes'
  | 'storage_failed'
  | 'in_use'
  | 'not_found'

export class MediaError extends Error {
  constructor(
    readonly code: MediaErrorCode,
    message: string,
    readonly status = 400,
  ) {
    super(message)
  }
}

type Info = { format: 'jpeg' | 'png' | 'webp'; width: number; height: number }

function u16be(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1]
}

function u32be(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) >>> 0) +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  )
}

function u16le(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function u24le(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16)
}

function u32le(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] +
    (bytes[offset + 1] << 8) +
    (bytes[offset + 2] << 16) +
    (bytes[offset + 3] << 24)
  )
}

/**
 * Reads enough of a JPEG/PNG/WebP header to reject forged extensions and
 * oversized decodes before anything is stored. SVG is deliberately unsupported.
 */
export function imageInfo(bytes: Uint8Array): Info | null {
  if (bytes.length < 12) return null

  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    const width = u32be(bytes, 16)
    const height = u32be(bytes, 20)
    return width > 0 && height > 0 ? { format: 'png', width, height } : null
  }

  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1
        continue
      }
      const marker = bytes[offset + 1]
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2
        continue
      }
      if (marker === 0xda || marker === 0xd9) break
      const length = u16be(bytes, offset + 2)
      if (length < 2) break
      const isSof =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      if (isSof) {
        const height = u16be(bytes, offset + 5)
        const width = u16be(bytes, offset + 7)
        return width > 0 && height > 0 ? { format: 'jpeg', width, height } : null
      }
      offset += 2 + length
    }
    return null
  }

  const riff =
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
  const webp =
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  if (!riff || !webp) return null

  const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15])
  if (chunk === 'VP8X' && bytes.length >= 30) {
    return { format: 'webp', width: u24le(bytes, 24) + 1, height: u24le(bytes, 27) + 1 }
  }
  if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
    const b1 = bytes[21]
    const b2 = bytes[22]
    const b3 = bytes[23]
    const b4 = bytes[24]
    return {
      format: 'webp',
      width: 1 + (b1 | ((b2 & 0x3f) << 8)),
      height: 1 + (((b2 & 0xc0) >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10)),
    }
  }
  if (chunk === 'VP8 ' && bytes.length >= 30) {
    if (!(bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a)) return null
    return {
      format: 'webp',
      width: u16le(bytes, 26) & 0x3fff,
      height: u16le(bytes, 28) & 0x3fff,
    }
  }
  return null
}

function validInfo(info: Info | null): Info {
  if (!info) throw new MediaError('invalid_image', 'That file is not a readable JPEG, PNG or WebP image.')
  if (info.width * info.height > MEDIA_LIMITS.maxPixels)
    throw new MediaError('too_many_pixels', 'That image is too large to use in a mobile app.')
  return info
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer as ArrayBuffer)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function variantKey(projectId: string, hash: string, width: number): string {
  return `projects/${projectId}/media/${hash}/${width}.webp`
}

/**
 * A media id is content-addressed but never global: two projects may hold the
 * same photograph, and `media.id` is the primary key, so the id carries a short
 * hash of the project too. Re-uploading the same file to one project still
 * finds its existing row by content.
 */
export function mediaIdFor(hash: string, projectId = ''): string {
  if (!projectId) return `med_${hash.slice(0, 24)}`
  let fnv = 2166136261
  for (const character of projectId) {
    fnv ^= character.charCodeAt(0)
    fnv = Math.imul(fnv, 16777619)
  }
  return `med_${hash.slice(0, 16)}${(fnv >>> 0).toString(16).padStart(8, '0')}`
}

type MediaRow = {
  id: string
  project_id: string
  hash: string
  width: number
  height: number
  bytes: number
  alt: string
  focal_x: number
  focal_y: number
  created_at: string
  variants: string
}

function toRecord(row: MediaRow): MediaRecord {
  let variants: MediaVariant[] = []
  try {
    const parsed = JSON.parse(row.variants) as unknown
    if (Array.isArray(parsed))
      variants = parsed
        .filter(
          (entry): entry is MediaVariant =>
            Boolean(entry) &&
            typeof entry === 'object' &&
            Number.isFinite((entry as MediaVariant).width) &&
            Number.isFinite((entry as MediaVariant).height) &&
            Number.isFinite((entry as MediaVariant).bytes),
        )
        .map((entry) => ({ width: entry.width, height: entry.height, bytes: entry.bytes, key: variantKey(row.project_id, row.hash, entry.width) }))
  } catch {
    variants = []
  }
  return {
    id: row.id,
    projectId: row.project_id,
    hash: row.hash,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    alt: row.alt,
    focalX: row.focal_x,
    focalY: row.focal_y,
    createdAt: row.created_at,
    variants,
  }
}

export function mediaView(record: MediaRecord) {
  return {
    id: record.id,
    width: record.width,
    height: record.height,
    bytes: record.bytes,
    format: 'webp' as const,
    alt: record.alt,
    focalX: record.focalX,
    focalY: record.focalY,
    createdAt: record.createdAt,
    variants: record.variants.map((entry) => ({
      width: entry.width,
      height: entry.height,
      bytes: entry.bytes,
    })),
  }
}

async function quota(db: D1Database, projectId: string): Promise<{ files: number; bytes: number }> {
  const row = await db
    .prepare('SELECT COUNT(*) AS files, COALESCE(SUM(bytes), 0) AS bytes FROM media WHERE project_id = ?')
    .bind(projectId)
    .first<{ files: number; bytes: number }>()
  return { files: Number(row?.files ?? 0), bytes: Number(row?.bytes ?? 0) }
}

export async function listMedia(db: D1Database, projectId: string): Promise<MediaRecord[]> {
  const { results } = await db
    .prepare('SELECT * FROM media WHERE project_id = ? ORDER BY created_at DESC')
    .bind(projectId)
    .all<MediaRow>()
  return (results ?? []).map(toRecord)
}

export async function getMedia(
  db: D1Database,
  projectId: string,
  id: string,
): Promise<MediaRecord | null> {
  if (!/^med_[a-f0-9]{16,40}$/.test(id)) return null
  const row = await db
    .prepare('SELECT * FROM media WHERE id = ? AND project_id = ?')
    .bind(id, projectId)
    .first<MediaRow>()
  return row ? toRecord(row) : null
}

/**
 * Stores validated WebP variants. `file` is used only for magic-byte validation
 * and hashing; it is never written to R2.
 */
export async function uploadMedia(
  db: D1Database,
  bucket: MediaBucket,
  project: Project,
  input: {
    original: { bytes: Uint8Array; type: string; name: string }
    variants: { bytes: Uint8Array; width?: number }[]
    alt?: string
    focalX?: number
    focalY?: number
  },
): Promise<{ media: MediaRecord; existing: boolean }> {
  const original = validInfo(imageInfo(input.original.bytes))
  const type = input.original.type.toLowerCase()
  const expectedType = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[original.format]
  if (!expectedType || type !== expectedType)
    throw new MediaError('unsupported_type', 'Upload a JPEG, PNG or WebP image whose contents match its type.')
  if (input.original.bytes.byteLength > MEDIA_LIMITS.maxBytes)
    throw new MediaError('too_large', 'That image is larger than 8 MB.')

  if (!input.variants.length)
    throw new MediaError('bad_variants', 'No usable image sizes were produced.')
  if (input.variants.length > 4)
    throw new MediaError('bad_variants', 'Too many image sizes were uploaded.')

  const variants: MediaVariant[] = []
  const contents = new Map<number, Uint8Array>()
  for (const entry of input.variants) {
    const info = validInfo(imageInfo(entry.bytes))
    if (info.format !== 'webp')
      throw new MediaError('bad_variants', 'Every stored image size must be WebP.')
    if (info.width > original.width * 1.02 || info.height > original.height * 1.02)
      throw new MediaError('bad_variants', 'An image size is larger than the original.')
    if (entry.bytes.byteLength > 2 * 1024 * 1024)
      throw new MediaError('too_large', 'One image size is larger than 2 MB.')
    if (variants.some((variant) => variant.width === info.width))
      throw new MediaError('bad_variants', 'Two image sizes have the same width.')
    variants.push({ width: info.width, height: info.height, bytes: entry.bytes.byteLength, key: '' })
    contents.set(info.width, entry.bytes)
  }
  variants.sort((a, b) => a.width - b.width)
  const largest = variants[variants.length - 1]

  const hash = await sha256(input.original.bytes)
  const id = mediaIdFor(hash, project.id)
  const existing = await db
    .prepare('SELECT * FROM media WHERE project_id = ? AND hash = ?')
    .bind(project.id, hash)
    .first<MediaRow>()
  if (existing) return { media: toRecord(existing), existing: true }

  const usage = await quota(db, project.id)
  if (usage.files >= MEDIA_LIMITS.maxFiles)
    throw new MediaError('quota_files', 'This app has reached its image limit. Delete an unused image first.', 409)
  const total = variants.reduce((sum, entry) => sum + entry.bytes, 0)
  if (usage.bytes + total > MEDIA_LIMITS.maxTotalBytes)
    throw new MediaError('quota_bytes', 'This app has reached its image storage limit.', 409)

  const stored: string[] = []
  try {
    for (const variant of variants) {
      variant.key = variantKey(project.id, hash, variant.width)
      const content = contents.get(variant.width)
      if (!content) throw new MediaError('bad_variants', 'An image size was missing.')
      await bucket.put(variant.key, content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer, {
        httpMetadata: {
          contentType: 'image/webp',
          cacheControl: 'private, max-age=31536000, immutable',
        },
        customMetadata: { project: project.id, hash },
      })
      stored.push(variant.key)
    }
    const createdAt = new Date().toISOString()
    await db
      .prepare(
        `INSERT INTO media (id, project_id, hash, width, height, bytes, alt, focal_x, focal_y, created_at, variants)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        project.id,
        hash,
        original.width,
        original.height,
        total,
        (input.alt ?? '').trim().slice(0, 120),
        Math.max(0, Math.min(100, Math.round(input.focalX ?? 50))),
        Math.max(0, Math.min(100, Math.round(input.focalY ?? 50))),
        createdAt,
        JSON.stringify(variants.map(({ width, height, bytes }) => ({ width, height, bytes }))),
      )
      .run()
    return {
      media: {
        id,
        projectId: project.id,
        hash,
        width: original.width,
        height: original.height,
        bytes: total,
        alt: (input.alt ?? '').trim().slice(0, 120),
        focalX: Math.max(0, Math.min(100, Math.round(input.focalX ?? 50))),
        focalY: Math.max(0, Math.min(100, Math.round(input.focalY ?? 50))),
        createdAt,
        variants: variants.map((entry) => ({
          ...entry,
          key: variantKey(project.id, hash, entry.width),
        })),
      },
      existing: false,
    }
  } catch (error) {
    await Promise.all(stored.map((key) => bucket.delete(key).catch(() => undefined))).catch(() => undefined)
    if (error instanceof MediaError) throw error
    throw new MediaError('storage_failed', 'Image storage is unavailable. Try again in a moment.', 502)
  }
}

/** Replace the bytes behind an existing media id. References keep pointing at
 *  the same id while every rendered image picks up the new variants. */
export async function replaceMedia(
  db: D1Database,
  bucket: MediaBucket,
  project: Project,
  id: string,
  input: {
    original: { bytes: Uint8Array; type: string; name: string }
    variants: { bytes: Uint8Array }[]
    alt?: string
    focalX?: number
    focalY?: number
  },
): Promise<MediaRecord> {
  const existing = await getMedia(db, project.id, id)
  if (!existing) throw new MediaError('not_found', 'That image no longer exists.', 404)
  const original = validInfo(imageInfo(input.original.bytes))
  const type = input.original.type.toLowerCase()
  const expectedType = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[original.format]
  if (!expectedType || type !== expectedType)
    throw new MediaError('unsupported_type', 'Upload a JPEG, PNG or WebP image whose contents match its type.')
  if (input.original.bytes.byteLength > MEDIA_LIMITS.maxBytes)
    throw new MediaError('too_large', 'That image is larger than 8 MB.')
  if (!input.variants.length)
    throw new MediaError('bad_variants', 'No usable image sizes were produced.')
  if (input.variants.length > 4)
    throw new MediaError('bad_variants', 'Too many image sizes were uploaded.')

  const variants: MediaVariant[] = []
  const contents = new Map<number, Uint8Array>()
  for (const entry of input.variants) {
    const info = validInfo(imageInfo(entry.bytes))
    if (info.format !== 'webp')
      throw new MediaError('bad_variants', 'Every stored image size must be WebP.')
    if (info.width > original.width * 1.02 || info.height > original.height * 1.02)
      throw new MediaError('bad_variants', 'An image size is larger than the original.')
    if (entry.bytes.byteLength > 2 * 1024 * 1024)
      throw new MediaError('too_large', 'One image size is larger than 2 MB.')
    if (variants.some((variant) => variant.width === info.width))
      throw new MediaError('bad_variants', 'Two image sizes have the same width.')
    variants.push({ width: info.width, height: info.height, bytes: entry.bytes.byteLength, key: '' })
    contents.set(info.width, entry.bytes)
  }
  variants.sort((a, b) => a.width - b.width)
  const total = variants.reduce((sum, entry) => sum + entry.bytes, 0)
  const usage = await quota(db, project.id)
  if (usage.bytes - existing.bytes + total > MEDIA_LIMITS.maxTotalBytes)
    throw new MediaError('quota_bytes', 'This app has reached its image storage limit.', 409)

  const hash = await sha256(input.original.bytes)
  const stored: string[] = []
  try {
    for (const variant of variants) {
      variant.key = variantKey(project.id, hash, variant.width)
      const content = contents.get(variant.width)
      if (!content) throw new MediaError('bad_variants', 'An image size was missing.')
      await bucket.put(
        variant.key,
        content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer,
        {
          httpMetadata: { contentType: 'image/webp', cacheControl: 'private, max-age=31536000, immutable' },
          customMetadata: { project: project.id, hash },
        },
      )
      stored.push(variant.key)
    }
    const alt = input.alt === undefined ? existing.alt : input.alt.trim().slice(0, 120)
    const focalX = Math.max(0, Math.min(100, Math.round(input.focalX ?? existing.focalX)))
    const focalY = Math.max(0, Math.min(100, Math.round(input.focalY ?? existing.focalY)))
    await db
      .prepare(
        `UPDATE media SET hash = ?, width = ?, height = ?, bytes = ?, alt = ?, focal_x = ?, focal_y = ?, variants = ?
         WHERE id = ? AND project_id = ?`,
      )
      .bind(
        hash,
        original.width,
        original.height,
        total,
        alt,
        focalX,
        focalY,
        JSON.stringify(variants.map(({ width, height, bytes }) => ({ width, height, bytes }))),
        id,
        project.id,
      )
      .run()
    const oldKeys = existing.variants.map((variant) => variant.key)
    const newKeys = variants.map((variant) => variant.key)
    const oldHash = existing.hash
    const shared = await db
      .prepare('SELECT COUNT(*) AS count FROM media WHERE project_id = ? AND hash = ? AND id != ?')
      .bind(project.id, oldHash, id)
      .first<{ count: number }>()
    if (!Number(shared?.count ?? 0)) {
      const stale = oldKeys.filter((key) => !newKeys.includes(key))
      if (stale.length) await bucket.delete(stale).catch(() => undefined)
    }
    return {
      ...existing,
      hash,
      width: original.width,
      height: original.height,
      bytes: total,
      alt,
      focalX,
      focalY,
      variants: variants.map((entry) => ({ ...entry, key: variantKey(project.id, hash, entry.width) })),
    }
  } catch (error) {
    await Promise.all(stored.map((key) => bucket.delete(key).catch(() => undefined))).catch(() => undefined)
    if (error instanceof MediaError) throw error
    throw new MediaError('storage_failed', 'Image storage is unavailable. Try again in a moment.', 502)
  }
}

/** The current document is the reference that protects an image from deletion. */
export function mediaInDoc(doc: Doc | null, id: string): boolean {
  if (!doc) return false
  return doc.screens.some((screen) => screen.sections.some((node) => node.media?.id === id))
}

/** A catalogue item's photograph is a first-class reference too. */
export function mediaInCatalog(project: Project, id: string): boolean {
  return project.spec.menu.some((section) => section.items.some((item) => item.media?.id === id))
}

/** Remove references to a deleted image from retained versions, so restoring one
 * shows an empty photo block instead of a broken image. The current document is
 * never scrubbed: deletion is refused while that document uses the image. */
async function scrubVersions(db: D1Database, projectId: string, id: string): Promise<void> {
  const rows = await db
    .prepare('SELECT id, doc FROM doc_versions WHERE project_id = ? AND doc LIKE ?')
    .bind(projectId, `%${id}%`)
    .all<{ id: string; doc: string }>()
  for (const row of rows.results ?? []) {
    let changed = false
    const scrub = (value: unknown): void => {
      if (!value || typeof value !== 'object') return
      if (Array.isArray(value)) { for (const entry of value) scrub(entry); return }
      const record = value as Record<string, unknown>
      const media = record.media as { id?: string } | undefined
      if (media && media.id === id) { delete record.media; changed = true }
      for (const entry of Object.values(record)) scrub(entry)
    }
    try {
      const doc = JSON.parse(row.doc)
      scrub(doc)
      if (changed)
        await db.prepare('UPDATE doc_versions SET doc = ? WHERE id = ?').bind(JSON.stringify(doc), row.id).run()
    } catch {
      // A version that can no longer be parsed is left untouched; the current
      // document was already checked and the image can still be removed.
    }
  }
}

export async function deleteMedia(
  db: D1Database,
  bucket: MediaBucket,
  project: Project,
  id: string,
): Promise<void> {
  const record = await getMedia(db, project.id, id)
  if (!record) throw new MediaError('not_found', 'That image no longer exists.', 404)
  if (mediaInDoc(project.doc, id) || mediaInCatalog(project, id))
    throw new MediaError('in_use', 'This image is used in the app. Replace or remove it there first.', 409)
  await scrubVersions(db, project.id, id)
  try {
    await bucket.delete(record.variants.map((variant) => variant.key))
  } catch {
    throw new MediaError('storage_failed', 'Image storage is unavailable. Try again.', 502)
  }
  await db.prepare('DELETE FROM media WHERE id = ? AND project_id = ?').bind(id, project.id).run()
}

/** A token-scoped, private delivery URL for one variant. */
export function mediaUrl(token: string, id: string, width: number): string {
  return `/p/${token}/media/${id}/${width}.webp`
}

/** The largest variant not bigger than the requested CSS width. */
export function pickVariant(record: MediaRecord, width: number): MediaVariant {
  const sorted = [...record.variants].sort((a, b) => a.width - b.width)
  return [...sorted].reverse().find((variant) => variant.width <= width) ?? sorted[0]
}

export async function serveMedia(
  db: D1Database,
  bucket: MediaBucket,
  projectId: string,
  id: string,
  width: number,
): Promise<{ body: ReadableStream | ArrayBuffer | null; etag?: string; variant: MediaVariant } | null> {
  const record = await getMedia(db, projectId, id)
  if (!record) return null
  const variant = pickVariant(record, width)
  const object = await bucket.get(variant.key)
  if (!object) return null
  return { body: object.body, etag: object.httpEtag, variant }
}

/**
 * Honest media coaching: subject prompts, not invented photos. The owner sees
 * where the generated app is visually thin and what kind of photograph would
 * make that slot real. Nothing here claims to be their premises or products.
 */
export function mediaSuggestions(vertical: VerticalId, name: string): { slot: string; subject: string; reason: string }[] {
  const subjects: Record<string, [string, string, string]> = {
    restaurant: ['A signature dish, plated', 'The room at service', 'The team or kitchen at work'],
    cafe: ['A drink and pastry on the counter', 'The morning bar', 'A detail of the bake'],
    shop: ['A product on a plain surface', 'A detail of the material', 'The shop or workshop'],
    salon: ['A finished treatment', 'The chair and interior', 'Tools and products, neatly arranged'],
    gym: ['A coaching moment', 'The training floor', 'A class in progress'],
    clinic: ['The treatment room', 'The reception', 'A calm detail of the space'],
    trades: ['A finished job', 'Work in progress, safely staged', 'The van or tools'],
    professional: ['A working portrait', 'The meeting room', 'A detail of the desk or work'],
    property: ['The exterior in good light', 'The main living space', 'A detail that sells the home'],
    hotel: ['The room, made up', 'The view or exterior', 'Breakfast or a guest moment'],
    studio: ['A selected frame from recent work', 'Behind the scenes', 'The studio or set'],
    auto: ['The workshop', 'A finished vehicle detail', 'The team at work'],
    hospital: ['A welcoming entrance', 'A quiet waiting area', 'A care detail, no patients identifiable'],
    ecommerce: ['Product on a plain background', 'A lifestyle shot in use', 'Packaging or a detail'],
    'plants-indoor': ['A plant in a real room', 'A leaf or pot detail', 'The shop bench'],
    'plants-outdoor': ['Plants ready outside', 'The nursery rows', 'A planting detail'],
    courses: ['The instructor working', 'A learning moment', 'Course materials'],
    tuition: ['A small-group table', 'A tutor and student, consented', 'The centre entrance'],
    school: ['The front of the school', 'A learning space', 'An event, with consent'],
    kindergarten: ['A calm play space', 'A garden or outdoor detail', 'Materials ready for the day'],
    finance: ['A working portrait', 'The meeting room', 'A plain detail of the office'],
    agency: ['A project image', 'The team in the studio', 'A process artefact'],
    influencer: ['A recent frame', 'The set behind the scenes', 'A format still'],
    portfolio: ['A selected project', 'A process detail', 'The studio or desk'],
    film: ['A still from the film', 'Behind the scenes', 'The poster or title card'],
    gallery: ['An installed exhibition', 'A work detail', 'The gallery entrance'],
    marketplace: ['A seller or maker at work', 'A product close-up', 'The market itself'],
  }
  const set = subjects[vertical] ?? ['A real photograph of the work', 'The space', 'A detail customers should see']
  return [
    { slot: 'Home hero', subject: set[0], reason: `The first screen for ${name} carries the strongest visual.` },
    { slot: 'About', subject: set[1], reason: 'Gives the business a human, recognisable setting.' },
    { slot: 'Gallery', subject: set[2], reason: 'Shows proof rather than repeating the catalogue.' },
  ]
}
