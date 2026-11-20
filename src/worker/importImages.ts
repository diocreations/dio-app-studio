/**
 * Catalogue image evidence.
 *
 * An imported product gets a photograph only when the source ties the two
 * together: structured data on that product page, the product record in a
 * public data endpoint the site's own browser code reads, an item-shaped entry
 * in the page's embedded JSON, or an Open Graph image on a page that declares
 * itself a single product. Everything else is left empty — a product with no
 * photograph is honest, a product wearing another product's photograph is not.
 *
 * Stock libraries, logos, banners, hero art and placeholder services are never
 * accepted, so a failed extraction can never be hidden behind a pretty picture.
 */

import type { MenuSection } from './types'

export type ImageMethod = 'structured-data' | 'embedded-json' | 'og-image' | 'public-data'

export type ItemImageEvidence = {
  /** The rendition the app loads: a WebP card-sized copy where the source CDN offers one. */
  url: string
  /** The URL exactly as the site published it, kept for provenance. */
  sourceUrl?: string
  alt?: string
  source: 'website'
  method: ImageMethod
}

/** One constructor, so provenance and the served rendition never drift apart. */
export function toEvidence(url: string, method: ImageMethod, alt?: string): ItemImageEvidence {
  const optimised = optimisedImageUrl(url)
  return {
    url: optimised,
    ...(optimised !== url ? { sourceUrl: url } : {}),
    ...(alt ? { alt } : {}),
    source: 'website',
    method,
  }
}

export type ImageReport = {
  /** Catalogue items that were looked at. */
  products: number
  withImage: number
  withoutImage: number
  methods: Record<string, number>
  /** Images the source offered that were refused, with the reason. */
  rejected: { name: string; url: string; reason: string }[]
  /** Items where only another item's photograph was available. */
  ambiguous: string[]
}

/** Never a product photograph: stock libraries and placeholder services. */
const STOCK_OR_PLACEHOLDER =
  /(?:unsplash\.com|pexels\.com|pixabay\.com|istockphoto\.com|shutterstock\.com|gettyimages\.|depositphotos\.|placehold\.|placeholder\.com|dummyimage\.|loremflickr|lorempixel|via\.placeholder)/i

/** Paths that name page furniture rather than one product. */
const DECORATIVE_PATH =
  /(?:^|[/_.-])(logo|wordmark|favicon|sprite|icons?|avatar|badge|banner|hero|cover|placeholder|og[-_]?default|share[-_]?image|background|bg)(?:[/_.-]|$)/i

const IMAGE_EXTENSION = /\.(?:png|jpe?g|webp|avif|gif|svg)$/i

export type ImageRefusal = { ok: false; reason: string }
export type ImageAcceptance = { ok: true; url: string }

/**
 * The one gate every candidate image passes through. Returns an absolute https
 * URL or a reason it cannot be used, so the report can explain the gap.
 */
export function checkImageCandidate(
  raw: unknown,
  base?: string,
  options: {
    /** A product feed states which product this file belongs to, so a name like
     *  "cover.jpg" is that product's photograph, not page furniture. */
    allowDecorative?: boolean
  } = {},
): ImageAcceptance | ImageRefusal {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value) return { ok: false, reason: 'no image declared' }
  let url: URL
  try {
    url = new URL(value, base)
  } catch {
    return { ok: false, reason: 'not a usable URL' }
  }
  if (url.protocol !== 'https:') return { ok: false, reason: 'not https' }
  if (STOCK_OR_PLACEHOLDER.test(url.href)) return { ok: false, reason: 'stock or placeholder library' }
  if (!options.allowDecorative && DECORATIVE_PATH.test(url.pathname))
    return { ok: false, reason: 'names page furniture, not a product' }
  const looksLikeImage =
    IMAGE_EXTENSION.test(url.pathname) || /\/storage\/|\/images\/|\/media\//.test(url.pathname)
  if (!looksLikeImage) return { ok: false, reason: 'not an image file' }
  return { ok: true, url: url.href }
}

/**
 * A card-sized WebP rendition, asked of the source's own image CDN where it
 * documents one. The aspect ratio is preserved: width only, no crop. When the
 * host is unknown the original URL is kept as published.
 */
export function optimisedImageUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return raw
  }
  // Supabase storage: render endpoint serves WebP and resizes on the way out.
  const supabase = /^\/storage\/v1\/object\/public\/(.+)$/.exec(url.pathname)
  if (supabase?.[1]) {
    url.pathname = `/storage/v1/render/image/public/${supabase[1]}`
    url.search = '?width=720&quality=78'
    return url.href
  }
  // Sanity image pipeline: fm=webp at a fixed width, fit=max keeps the ratio.
  if (/cdn\.sanity\.io$/.test(url.hostname) && /\/images\//.test(url.pathname)) {
    url.searchParams.set('w', '720')
    url.searchParams.set('fm', 'webp')
    url.searchParams.set('fit', 'max')
    return url.href
  }
  return raw
}

const normalise = (value: string) =>
  value
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\u0900-\u0DFF]+/gi, ' ')
    .trim()

/** An Open Graph image, but only on a page that declares one product. */
export function ogProductImage(
  html: string,
  meta: Record<string, string>,
  pageUrl: string,
): ItemImageEvidence | undefined {
  const singleProduct =
    /"@type"\s*:\s*"Product"/i.test(html) ||
    /itemprop\s*=\s*["'](?:price|productID)["']/i.test(html) ||
    /property\s*=\s*["']og:type["'][^>]*content\s*=\s*["']product["']/i.test(html)
  if (!singleProduct) return undefined
  const candidate = checkImageCandidate(meta['og:image'] || meta['twitter:image'] || '', pageUrl)
  if (!candidate.ok) return undefined
  return toEvidence(candidate.url, 'og-image')
}

/**
 * Item-shaped records in the page's embedded JSON (Next.js flight payloads,
 * Sanity documents, framework state blobs). Both field orders are read because
 * publishers do not agree on which comes first, and a null image is a fact the
 * source stated, not a gap to fill.
 */
export function embeddedJsonImages(html: string): Map<string, ItemImageEvidence> {
  const flat = html.replace(/\\"/g, '"').replace(/\\u002F/gi, '/')
  const out = new Map<string, ItemImageEvidence>()
  const images = [
    /"name"\s*:\s*"([^"]{2,80})"[\s\S]{0,400}?"image"\s*:\s*(?:"([^"]+)"|\{[^}]{0,300}?"url"\s*:\s*"([^"]+)")/g,
    /"image"\s*:\s*(?:"([^"]+)"|\{[^}]{0,300}?"url"\s*:\s*"([^"]+)")[\s\S]{0,400}?"name"\s*:\s*"([^"]{2,80})"/g,
  ]
  for (const [index, pattern] of images.entries()) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(flat))) {
      const name = index === 0 ? match[1] : match[3]
      const raw = index === 0 ? match[2] || match[3] : match[1] || match[2]
      if (!name || !raw) continue
      const candidate = checkImageCandidate(raw)
      if (!candidate.ok) continue
      const key = normalise(name)
      if (!key || out.has(key)) continue
      out.set(key, toEvidence(candidate.url, 'embedded-json', name))
    }
  }
  return out
}

/** The Supabase project a site embeds, with the public key its browser uses. */
function supabaseConfig(html: string): { base: string; key: string } | undefined {
  const base = /https:\/\/([a-z0-9]{15,})\.supabase\.co/i.exec(html)?.[0]
  const key = /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9[A-Za-z0-9._-]{20,}/.exec(html)?.[0]
  return base && key ? { base, key } : undefined
}

const PRODUCT_TABLES = ['products', 'menu_items', 'items', 'catalogue']

type Recordish = Record<string, unknown>

function text(record: Recordish, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function imageFromRecord(record: Recordish): string {
  const direct = text(record, 'hero_image', 'image_url', 'image', 'photo', 'thumbnail', 'featured_image')
  if (direct) return direct
  const gallery = record.gallery_images
  if (Array.isArray(gallery)) {
    for (const entry of gallery) {
      if (typeof entry === 'string' && entry.trim()) return entry.trim()
    }
  }
  return ''
}

/**
 * The site's own public product data. A Supabase-backed storefront ships its
 * project URL and publishable key in the page, and its browser code queries the
 * same tables; reading them is the same public read, not a bypass. Read-only,
 * same project as the page, bounded and time-limited.
 */
export async function publicProductImages(
  html: string,
  fetchImpl: typeof fetch,
): Promise<{ images: Map<string, ItemImageEvidence>; rejected: { name: string; url: string; reason: string }[] }> {
  const config = supabaseConfig(html)
  const images = new Map<string, ItemImageEvidence>()
  const rejected: { name: string; url: string; reason: string }[] = []
  if (!config) return { images, rejected }

  const headers = { apikey: config.key, authorization: `Bearer ${config.key}`, accept: 'application/json' }
  for (const table of PRODUCT_TABLES) {
    let rows: unknown
    try {
      const response = await fetchImpl(`${config.base}/rest/v1/${table}?select=*&limit=200`, {
        headers,
        signal: AbortSignal.timeout(8000),
      })
      if (!response.ok) continue
      rows = await response.json()
    } catch {
      continue
    }
    if (!Array.isArray(rows) || !rows.length) continue
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue
      const record = row as Recordish
      const name = text(record, 'name', 'title', 'label')
      const raw = imageFromRecord(record)
      if (!name || !raw) continue
      const candidate = checkImageCandidate(raw)
      if (!candidate.ok) {
        rejected.push({ name, url: raw.slice(0, 300), reason: candidate.reason })
        continue
      }
      const keys = [normalise(name)]
      const slug = text(record, 'slug', 'id', 'handle')
      if (slug) keys.push(normalise(slug.replace(/-/g, ' ')))
      for (const key of keys) {
        if (key && !images.has(key)) images.set(key, toEvidence(candidate.url, 'public-data', name))
      }
    }
    if (images.size) break
  }
  return { images, rejected }
}

/**
 * Attach evidence-backed photographs to catalogue items that do not already
 * carry one, and describe exactly what happened for the import report.
 */
export function attachImages(
  sections: MenuSection[],
  evidence: Map<string, ItemImageEvidence>,
  rejected: { name: string; url: string; reason: string }[] = [],
): ImageReport {
  const report: ImageReport = {
    products: 0,
    withImage: 0,
    withoutImage: 0,
    methods: {},
    rejected: [...rejected],
    ambiguous: [],
  }
  for (const section of sections) {
    for (const item of section.items) {
      report.products += 1
      if (item.image) {
        report.withImage += 1
        const method = item.image.method ?? 'structured-data'
        report.methods[method] = (report.methods[method] ?? 0) + 1
        continue
      }
      const match = evidence.get(normalise(item.name))
      if (match) {
        item.image = match
        report.withImage += 1
        report.methods[match.method] = (report.methods[match.method] ?? 0) + 1
        continue
      }
      report.withoutImage += 1
    }
  }
  return report
}
