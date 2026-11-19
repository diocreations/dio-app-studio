import {
  attachImages,
  checkImageCandidate,
  embeddedJsonImages,
  ogProductImage,
  publicProductImages,
  toEvidence,
  type ImageReport,
} from './importImages'

/** Turns a customer's existing website into a draft app brief.
 *
 *  The job is breadth: one pasted link, then the shop, collection, menu and
 *  product pages behind it, until the catalogue is actually the catalogue.
 *  Everything runs on the Worker — no headless browser, no third-party API.
 *
 *  Three rules shape the output:
 *  1. Never invent a detail. What the site doesn't say goes in `missing`.
 *  2. Never let a pasted URL become a back door into the network. Every host
 *     is checked before every request and on every redirect hop.
 *  3. Stay bounded. A crawl is a fixed number of pages inside a wall-clock
 *     budget, and it says so when it stops early.
 *  4. Read the site's robots.txt. A page it excludes is not fetched at all,
 *     and the brief says why a shop came back thinner than it looks.
 */

import {
  cleanDesign,
  cleanPwa,
  cleanStructure,
  manifestHref,
  parseManifest,
  readDesign,
  readStructure,
  registersServiceWorker,
  type DesignKit,
  type PwaInfo,
  type SiteStructure,
} from './design'
import { cleanLogoImage, sanitizeMenu } from './pricing'
import { themeFor } from './themes'
import type { FeatureId, MenuSection, SocialLink, VerticalId } from './types'
import { VERTICALS } from './verticals'

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export class ImportError extends Error {
  code: string
  status: 400 | 422 | 429 | 502

  constructor(code: string, message: string, status: 400 | 422 | 429 | 502 = 422) {
    super(message)
    this.name = 'ImportError'
    this.code = code
    this.status = status
  }
}

export type ImportedSite = {
  name: string
  tagline: string
  story: string
  vertical: VerticalId
  verticalConfidence: 'detected' | 'guessed'
  /** What the site calls itself: "Bookshop", "Hair salon", "Mobile dog grooming". */
  category: string
  /** Why that category was chosen, in one plain sentence. */
  categoryBasis: string
  accent: string
  logo: string
  /** The business's own logo, when the site declared one. Never a hero image. */
  logoImage?: { url: string; alt?: string }
  phone: string
  email: string
  address: string
  hours: string
  website: string
  currency: string
  socials: SocialLink[]
  menu: MenuSection[]
  features: FeatureId[]
  /** The look read from their site, applied over the trade's own theme. */
  design?: DesignKit
  /** Their nav and hero composition, applied to the app's chrome and home. */
  structure?: SiteStructure
  /** Their installable-web-app metadata, when they have one. */
  pwa?: PwaInfo
}

export type ImportQuality = {
  /** Items the extraction produced before cleaning. */
  discovered: number
  /** Items left in the catalogue after cleaning. */
  kept: number
  /** Items that were read but are not sellable entries, with the reason. */
  dropped: { name: string; section: string; reason: string }[]
  /** Prices that look like a parse accident rather than a price. */
  suspectPrices: { name: string; section: string; value: number }[]
  duplicates: number
  categories: string[]
}

export type ImportReport = {
  /** The cleaned-up link that was actually read. */
  source: string
  /** What happened to product photographs. */
  images: ImageReport
  /** Catalogue cleaning: what was kept, what was not, and why. */
  quality: ImportQuality
  host: string
  /** How many pages the crawl opened, including the one that was pasted. */
  pages: number
  site: ImportedSite
  /** Human lines for "what we read". */
  found: string[]
  /** Human lines for "what we could not find". */
  missing: string[]
  /** Caveats worth saying out loud. */
  notes: string[]
  /** Paths the crawl actually read, so the owner can see the coverage. */
  pagesRead: string[]
  /** Pages that were attempted and could not be read, with the reason. */
  pagesFailed: { url: string; reason: string }[]
  /** Whether a sitemap supplied the pages the home page did not link to. */
  usedSitemap: boolean
}

/* ------------------------------------------------------------------ */
/* Budgets                                                             */
/* ------------------------------------------------------------------ */

const MAX_BYTES = 900_000
const PAGE_TIMEOUT_MS = 6500
/**
 * Pages opened per import, including the pasted one. Six was too few for a real
 * catalogue: a shop with three aisles and four products each ran out before it
 * reached a product. Ten keeps the brief inside its time budget while letting a
 * sitemap-driven crawl read product pages that the home page never links to.
 */
export const MAX_PAGES = 10
/** Wall clock for the whole crawl, so the brief never hangs. */
const CRAWL_BUDGET_MS = 20_000
/** Sitemaps are cheap metadata, but still bounded and same-origin. */
const SITEMAP_TIMEOUT_MS = 4500
const MAX_SITEMAP_BYTES = 400_000
const MAX_SITEMAP_URLS = 300
const MAX_SITEMAP_CHILDREN = 3

/* ------------------------------------------------------------------ */
/* URLs and the network guard                                          */
/* ------------------------------------------------------------------ */

const BLOCKED_HOSTS = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata',
  'metadata.google.internal',
  'instance-data',
  'kubernetes.default',
])

const BLOCKED_SUFFIXES = [
  '.localhost',
  '.local',
  '.localdomain',
  '.internal',
  '.intranet',
  '.corp',
  '.home.arpa',
  '.lan',
  '.test',
]

export function normaliseUrl(input: string): URL {
  const raw = (input ?? '').trim()
  if (!raw) throw new ImportError('url_required', 'Paste the website address first.', 400)
  if (raw.length > 300) throw new ImportError('invalid_url', 'That link is too long.', 400)

  let candidate = raw.replace(/\s+/g, '')
  if (!/^[a-z][a-z0-9+.-]*:/i.test(candidate)) candidate = `https://${candidate}`

  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    throw new ImportError(
      'invalid_url',
      'That does not look like a web address. Try something like example.com.',
      400,
    )
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new ImportError('invalid_url', 'Only http and https links can be read.', 400)
  if (url.username || url.password)
    throw new ImportError('invalid_url', 'Links with a username and password are not read.', 400)
  url.hash = ''
  return url
}

function ipv4Parts(host: string): number[] | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (!match) return null
  const parts = match.slice(1).map(Number)
  return parts.every((part) => part >= 0 && part <= 255) ? parts : null
}

function isPrivateV4([a, b]: number[]): boolean {
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && (b === 168 || b === 0)) return true
  if (a === 198 && (b === 18 || b === 19)) return true
  return a >= 224
}

/** Rejects anything that could reach this machine, a private network or a
 *  cloud metadata endpoint. Redirects are checked with the same function. */
export function assertPublicHost(url: URL): void {
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!host) throw new ImportError('blocked_host', 'That link has no host.', 400)

  const blocked = () =>
    new ImportError(
      'blocked_host',
      'That address points inside a private network, so it cannot be read.',
      400,
    )

  if (BLOCKED_HOSTS.has(host) || BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix)))
    throw blocked()

  const v4 = ipv4Parts(host)
  if (v4) {
    if (isPrivateV4(v4)) throw blocked()
    return
  }

  // Numeric-only hosts (2130706433) and hex forms (0x7f000001) are just IPs.
  if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host))
    throw new ImportError('blocked_host', 'Numeric addresses are not read.', 400)

  if (host.includes(':')) {
    const trimmed = host.replace(/^::ffff:/, '')
    const mapped = ipv4Parts(trimmed)
    if (mapped && isPrivateV4(mapped)) throw blocked()
    if (trimmed === '::1' || trimmed === '::' || /^f[cd][0-9a-f]{2}:/.test(trimmed)) throw blocked()
    if (/^fe[89ab][0-9a-f]:/.test(trimmed)) throw blocked()
    return
  }

  // A bare word like "intranet" is a local name, not a public domain.
  if (!host.includes('.'))
    throw new ImportError('blocked_host', 'Use the full public address, like example.com.', 400)
}

async function readLimited(response: Response): Promise<string> {
  const type = (response.headers.get('content-type') ?? '').toLowerCase()
  if (type && !type.includes('text/html') && !type.includes('application/xhtml'))
    throw new ImportError(
      'not_html',
      `That link is ${type.split(';')[0] || 'not a web page'}, not an HTML site.`,
      422,
    )

  const charset = /charset=([\w-]+)/i.exec(type)?.[1] ?? 'utf-8'
  const body = response.body
  if (!body) return (await response.text()).slice(0, MAX_BYTES)

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    chunks.push(value)
    total += value.byteLength
  }
  try {
    await reader.cancel()
  } catch {
    // Stream already closed.
  }

  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return new TextDecoder(charset).decode(merged.subarray(0, MAX_BYTES))
  } catch {
    return new TextDecoder('utf-8').decode(merged.subarray(0, MAX_BYTES))
  }
}

const REDIRECTS = [301, 302, 303, 307, 308]

/** The one refusal the user is meant to read: it names the file, the agent and
 *  the way forward. */
function robotsRefusal(url: URL): ImportError {
  return new ImportError(
    'robots_disallowed',
    `${url.host} asks crawlers not to read ${url.pathname} in its robots.txt, so nothing was fetched. Paste the details in by hand, or ask the owner to allow ${IMPORTER_AGENT}.`,
  )
}

/** Follows redirects by hand so each hop can be checked, then returns the HTML. */
async function loadSite(
  input: string | URL,
  fetchImpl: typeof fetch = fetch,
  options: { timeoutMs?: number; robots?: RobotsGroup[] } = {},
): Promise<{ html: string; url: URL }> {
  let current = typeof input === 'string' ? normaliseUrl(input) : new URL(input.toString())

  for (let hop = 0; hop <= 4; hop += 1) {
    assertPublicHost(current)
    if (options.robots && !robotsAllows(options.robots, `${current.pathname}${current.search}`))
      throw robotsRefusal(current)
    let response: Response
    try {
      // Always the live page: a brief built from yesterday's cached HTML is a
      // wrong brief. no-store + no-cache ask every hop, including a CDN in front
      // of the origin, to revalidate, and cf.cacheTtl 0 keeps Cloudflare's own
      // edge cache out of it.
      response = await fetchImpl(current.toString(), {
        redirect: 'manual',
        // Workers' documented bypass: skip Cloudflare's cache entirely rather
        // than trusting the origin's headers to expire it.
        cache: 'no-store',
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'accept-language': 'en-GB,en;q=0.8',
          // Ask every cache in the path — browser, CDN, origin — for the page as
          // it is now, not the copy it served last time.
          'cache-control': 'no-cache, no-store, max-age=0',
          pragma: 'no-cache',
          'user-agent': IMPORTER_UA,
        },
        signal: AbortSignal.timeout(options.timeoutMs ?? PAGE_TIMEOUT_MS),
      })
    } catch (error) {
      if (error instanceof ImportError) throw error
      throw new ImportError(
        'fetch_failed',
        `Could not reach ${current.host}. Check the link opens in a browser.`,
        502,
      )
    }

    if (REDIRECTS.includes(response.status)) {
      const location = response.headers.get('location')
      if (!location) throw new ImportError('fetch_failed', 'That link redirects nowhere.', 502)
      current = normaliseUrl(new URL(location, current).toString())
      continue
    }
    if (!response.ok)
      throw new ImportError(
        'fetch_failed',
        `${current.host} answered ${response.status}. If the site blocks bots, paste the details in by hand.`,
        502,
      )

    return { html: await readLimited(response), url: current }
  }

  throw new ImportError('too_many_redirects', 'That link bounces around too much.', 502)
}

/* ------------------------------------------------------------------ */
/* robots.txt                                                          */
/* ------------------------------------------------------------------ */

/** Our product token, matched against robots.txt `User-agent` lines. */
export const IMPORTER_AGENT = 'PlattrImporter'
const IMPORTER_UA = `${IMPORTER_AGENT}/1.0 (+app briefs; contact the site owner to opt out)`

const ROBOTS_TIMEOUT_MS = 2500
const MAX_ROBOTS_BYTES = 60_000

export type RobotsRule = { allow: boolean; pattern: string }
export type RobotsGroup = { agents: string[]; rules: RobotsRule[] }

/** Groups of agent lines and their rules. A missing robots.txt parses to no
 *  groups, which allows everything. */
export function parseRobots(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = []
  let current: RobotsGroup | null = null
  let afterAgent = false

  // A UTF-8 BOM would otherwise join the first field name, so `User-agent`
  // would never match and the whole first group would be lost.
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim()
    if (!line) continue
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const field = line.slice(0, colon).trim().toLowerCase()
    const value = line.slice(colon + 1).trim()

    if (field === 'user-agent') {
      // Consecutive agent lines share one group of rules.
      if (!current || !afterAgent) {
        current = { agents: [], rules: [] }
        groups.push(current)
        afterAgent = true
      }
      const agent = value.toLowerCase()
      if (agent) current.agents.push(agent)
      continue
    }

    afterAgent = false
    if (!current) continue
    if (field === 'disallow' || field === 'allow') {
      // An empty rule excludes nothing.
      if (!value) continue
      current.rules.push({ allow: field === 'allow', pattern: value })
    }
  }

  // A group that names us but states no rules means "no restrictions", and
  // must not fall through to the wildcard group.
  return groups.filter((group) => group.agents.length > 0)
}

function robotsPattern(pattern: string): RegExp {
  const anchored = pattern.endsWith('$')
  const body = anchored ? pattern.slice(0, -1) : pattern
  const escaped = body.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${escaped}${anchored ? '$' : ''}`)
}

/** True when our agent may read `path`. Our own group wins over `*`; within the
 *  chosen groups the longest matching rule decides, and an allow wins a tie. */
export function robotsAllows(groups: RobotsGroup[], path: string, userAgent = IMPORTER_UA): boolean {
  const agent = userAgent.toLowerCase()
  // Some files write a version after the product token (`PlattrImporter/1.0`),
  // so compare the token only.
  const matches = (name: string): boolean => {
    const token = name.split(/[/\s]/)[0]
    return Boolean(token) && token !== '*' && agent.startsWith(token)
  }
  const ours = groups.filter((group) => group.agents.some(matches))
  const chosen = ours.length ? ours : groups.filter((group) => group.agents.includes('*'))

  let best: { allow: boolean; length: number } | null = null
  for (const rule of chosen.flatMap((group) => group.rules)) {
    if (!robotsPattern(rule.pattern).test(path)) continue
    const length = rule.pattern.length
    if (!best || length > best.length || (length === best.length && rule.allow))
      best = { allow: rule.allow, length }
  }
  return best ? best.allow : true
}

/** robots.txt is text, not a page, so it gets its own bounded fetch. Redirects
 *  are followed by hand to keep the private-network guard on every hop. A
 *  missing or unreadable file allows the crawl: absence is not a refusal. */
export async function fetchRobots(origin: string, fetchImpl: typeof fetch): Promise<RobotsGroup[]> {
  let current: URL
  try {
    current = new URL('/robots.txt', origin)
  } catch {
    return []
  }

  for (let hop = 0; hop < 3; hop += 1) {
    try {
      assertPublicHost(current)
      const response = await fetchImpl(current.toString(), {
        redirect: 'manual',
        cache: 'no-store',
        signal: AbortSignal.timeout(ROBOTS_TIMEOUT_MS),
        headers: { 'user-agent': IMPORTER_UA, accept: 'text/plain,*/*' },
      })

      if (REDIRECTS.includes(response.status)) {
        const location = response.headers.get('location')
        if (!location) return []
        current = new URL(location, current)
        continue
      }
      if (!response.ok) return []

      const type = (response.headers.get('content-type') ?? '').toLowerCase()
      // A soft 404 served as HTML is not a policy.
      if (type && !type.includes('text/plain')) return []
      return parseRobots((await response.text()).slice(0, MAX_ROBOTS_BYTES))
    } catch {
      return []
    }
  }
  return []
}

/* ------------------------------------------------------------------ */
/* sitemap.xml                                                         */
/* ------------------------------------------------------------------ */

/**
 * A sitemap is the one place a shop states its product URLs even when the home
 * page draws its navigation in JavaScript. ButterTales is the case that made
 * this necessary: a readable home page, no `<a href>` at all, and a sitemap
 * listing `/shop/malayalam-alphabet-book` and friends.
 *
 * Nothing here bypasses a policy: every URL is same-origin and re-checked
 * against robots.txt before it is opened.
 */
const SITEMAP_PATHS = ['/sitemap.xml', '/sitemap_index.xml', '/sitemap-index.xml']

function sitemapLocations(xml: string): string[] {
  const out: string[] = []
  const pattern = /<loc>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/loc>/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(xml)) && out.length < MAX_SITEMAP_URLS * 2) {
    const value = decode(match[1] ?? '').trim()
    if (value) out.push(value)
  }
  return out
}

async function loadSitemapText(
  url: URL,
  fetchImpl: typeof fetch,
  robots: RobotsGroup[],
): Promise<string | null> {
  let current = url
  for (let hop = 0; hop < 3; hop += 1) {
    try {
      assertPublicHost(current)
      if (!robotsAllows(robots, `${current.pathname}${current.search}`)) return null
      const response = await fetchImpl(current.toString(), {
        redirect: 'manual',
        cache: 'no-store',
        signal: AbortSignal.timeout(SITEMAP_TIMEOUT_MS),
        headers: { 'user-agent': IMPORTER_UA, accept: 'application/xml,text/xml,text/plain;q=0.8,*/*;q=0.5' },
      })
      if (REDIRECTS.includes(response.status)) {
        const location = response.headers.get('location')
        if (!location) return null
        current = new URL(location, current)
        continue
      }
      if (!response.ok) return null
      const text = (await response.text()).slice(0, MAX_SITEMAP_BYTES)
      return /<(?:urlset|sitemapindex)\b/i.test(text) ? text : null
    } catch {
      return null
    }
  }
  return null
}

/** Product, service and menu pages a sitemap can point at. */
const SITEMAP_DETAIL_PATH =
  /(?:^|\/)(?:shop|store|products?|collections?|menu|services|treatments|packages|courses|classes|listings|books?|catalogue|catalog)\/[^/?#]{2,}\/?$/i

/**
 * Product-like URLs first, then aisles. Reading one product page is worth more
 * than opening a collection index that the crawler has already seen.
 */
export function rankSitemapUrls(urls: URL[], origin: string): URL[] {
  const seen = new Set<string>()
  const scored: { url: URL; score: number }[] = []
  for (const url of urls) {
    if (url.origin !== origin) continue
    if (OFF_LIMITS.test(url.pathname) || UNSAFE_QUERY.test(url.search)) continue
    const key = url.pathname.replace(/\/$/, '')
    if (!key || key === '' || seen.has(key)) continue
    seen.add(key)
    let score = 1
    if (SITEMAP_DETAIL_PATH.test(url.pathname)) score += 4
    if (PRODUCT_PATH.test(url.pathname)) score += 2
    if (AISLE_PATH.test(url.pathname)) score += 2
    // A dated or paginated URL is usually a blog, not a product.
    if (/\/\d{4}\/\d{2}\//.test(url.pathname) || /\/page\/\d+/.test(url.pathname)) score -= 2
    if (score > 0) scored.push({ url, score })
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, MAX_SITEMAP_URLS).map((entry) => entry.url)
}

async function readSitemap(
  origin: URL,
  fetchImpl: typeof fetch,
  robots: RobotsGroup[],
): Promise<{ urls: URL[]; used: boolean }> {
  for (const path of SITEMAP_PATHS) {
    const xml = await loadSitemapText(new URL(path, origin), fetchImpl, robots)
    if (!xml) continue
    let locations = sitemapLocations(xml)
    // A sitemap index points at other sitemaps; read a few of them, not all.
    if (/<sitemapindex\b/i.test(xml)) {
      const children: URL[] = []
      for (const location of locations) {
        try {
          const child = new URL(location)
          if (child.origin === origin.origin) children.push(child)
        } catch {
          // A malformed loc is skipped, like any other unreadable link.
        }
      }
      locations = []
      for (const child of children.slice(0, MAX_SITEMAP_CHILDREN)) {
        const childXml = await loadSitemapText(child, fetchImpl, robots)
        if (childXml) locations.push(...sitemapLocations(childXml))
      }
    }
    const urls: URL[] = []
    for (const location of locations) {
      try {
        urls.push(new URL(location, origin))
      } catch {
        // Ignore a loc that is not a URL.
      }
    }
    const ranked = rankSitemapUrls(urls, origin.origin)
    if (ranked.length) return { urls: ranked, used: true }
  }
  return { urls: [], used: false }
}

/* ------------------------------------------------------------------ */
/* Text primitives                                                     */
/* ------------------------------------------------------------------ */

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
  euro: '€',
  pound: '£',
  yen: '¥',
  rupee: '₹',
  middot: '·',
  bull: '•',
  times: '×',
  deg: '°',
  copy: '©',
  reg: '®',
  trade: '™',
}

function decode(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, entity: string) => {
    if (entity.startsWith('#')) {
      const code =
        entity[1] === 'x' || entity[1] === 'X'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10)
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return whole
      try {
        return String.fromCodePoint(code)
      } catch {
        return whole
      }
    }
    return ENTITIES[entity.toLowerCase()] ?? whole
  })
}

/** Visible text only: scripts, styles and markup removed, whitespace normalised. */
function visible(html: string): string {
  return decode(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      // A page we cut off at the size cap can leave a script block unclosed; the
      // rest of that bundle is code, not page copy. Drop it rather than read a
      // shop's JavaScript as if it were its words.
      .replace(/<(script|style|noscript|svg|template)\b[\s\S]*$/i, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim()
}

/** One line, cut on a word and given an ellipsis. */
function collapse(value: string, max: number): string {
  const clean = visible(value)
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trim()}…`
}

function firstSentence(value: string, max: number): string {
  const clean = collapse(value, max * 3)
  const stop = /^(.{12,}?[.!?])\s/.exec(clean)?.[1]
  return collapse(stop ?? clean, max)
}

function attributes(tag: string): Record<string, string> {
  const map: Record<string, string> = {}
  const pattern = /([a-zA-Z_:@.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(tag))) {
    map[match[1].toLowerCase()] = decode(match[2] ?? match[3] ?? match[4] ?? '')
  }
  return map
}

function metaTags(html: string): Record<string, string> {
  const map: Record<string, string> = {}
  const pattern = /<meta\b[^>]*>/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(html))) {
    const tag = attributes(match[0])
    const key = (tag.property ?? tag.name ?? tag.itemprop ?? '').toLowerCase()
    if (key && tag.content != null && map[key] == null) map[key] = tag.content
  }
  return map
}

function anchorsOf(html: string): { href: string; text: string }[] {
  // Links only from real markup: a React tree inside a script tag is not a link.
  html = html
    .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(script|style)\b[\s\S]*$/i, ' ')
  const out: { href: string; text: string }[] = []
  const pattern = /<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]{0,160}?)<\/a>/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(html))) {
    out.push({
      href: decode(match[1] ?? match[2] ?? ''),
      text: collapse(decode(match[3] ?? ''), 40),
    })
    if (out.length > 900) break
  }
  return out
}

const JSONLD = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi

function jsonLd(html: string): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = []
  let match: RegExpExecArray | null
  JSONLD.lastIndex = 0
  while ((match = JSONLD.exec(html))) {
    const raw = match[1].trim().replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '')
    try {
      collect(JSON.parse(raw), nodes, 0)
    } catch {
      // One malformed block shouldn't cost us the rest of the page.
    }
  }
  return nodes
}

const CHILD_KEYS = [
  '@graph',
  'itemListElement',
  'hasMenu',
  'hasMenuSection',
  'hasMenuItem',
  'hasOfferCatalog',
  'item',
  'itemOffered',
  'mainEntity',
  'offers',
  'priceSpecification',
  'address',
  'sameAs',
]

function collect(value: unknown, out: Record<string, unknown>[], depth: number): void {
  if (depth > 6 || !value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const entry of value) collect(entry, out, depth + 1)
    return
  }
  const node = value as Record<string, unknown>
  out.push(node)
  for (const key of CHILD_KEYS) if (key in node) collect(node[key], out, depth + 1)
}

function typeOf(node: Record<string, unknown>): string[] {
  const value = node['@type']
  if (typeof value === 'string') return [value]
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function textOf(node: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = node[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number') return String(value)
  }
  return ''
}

/* ------------------------------------------------------------------ */
/* One page, parsed once                                               */
/* ------------------------------------------------------------------ */

type Page = {
  html: string
  url: URL
  meta: Record<string, string>
  nodes: Record<string, unknown>[]
  anchors: { href: string; text: string }[]
  text: string
  title: string
}

function readPage(html: string, url: URL): Page {
  return {
    html,
    url,
    meta: metaTags(html),
    nodes: jsonLd(html),
    anchors: anchorsOf(html),
    text: visible(html),
    title: /<title[^>]*>([\s\S]{1,300}?)<\/title>/i.exec(html)?.[1] ?? '',
  }
}

/* ------------------------------------------------------------------ */
/* Colour                                                              */
/* ------------------------------------------------------------------ */

function hexFromColour(raw: string): string {
  const value = raw.trim().toLowerCase()
  const short = /^#([0-9a-f]{3})$/.exec(value)
  if (short) return `#${short[1].split('').map((part) => part + part).join('')}`
  const long = /^#([0-9a-f]{6})$/.exec(value)
  if (long) return `#${long[1]}`
  const rgb = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/i.exec(value)
  if (rgb)
    return `#${rgb
      .slice(1)
      .map((part) => Math.min(255, Number(part)).toString(16).padStart(2, '0'))
      .join('')}`
  return ''
}

function lightnessOf(hex: string): { saturation: number; lightness: number } {
  const value = hex.replace('#', '')
  const r = parseInt(value.slice(0, 2), 16) / 255
  const g = parseInt(value.slice(2, 4), 16) / 255
  const b = parseInt(value.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const lightness = (max + min) / 2
  const delta = max - min
  return {
    saturation: delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1)),
    lightness,
  }
}

/** A page background is not a brand colour: many sites advertise plain white in
 *  `theme-color`, which would make every button disappear. */
function brandColour(raw: string): string {
  const hex = hexFromColour(raw)
  if (!hex) return ''
  const { saturation, lightness } = lightnessOf(hex)
  return saturation >= 0.14 && lightness >= 0.08 && lightness <= 0.9 ? hex : ''
}

/**
 * The most-used colour in a stylesheet that still looks like a brand colour.
 * A utility stylesheet is not evidence: Tailwind and Chakra ship a whole palette
 * of accent colours, so the most frequent one there is a framework default (a
 * link blue), not the business's brand. Those sites fall back to their own ink.
 */
function dominantBrandHex(css: string): string {
  if (/--tw-|--chakra-/.test(css)) return ''
  const counts = new Map<string, number>()
  const pattern = /#([0-9a-fA-F]{6})\b/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(css))) {
    const hex = `#${match[1].toLowerCase()}`
    counts.set(hex, (counts.get(hex) ?? 0) + 1)
  }
  return (
    [...counts.entries()]
      .map(([hex, count]) => ({ hex, count, ...lightnessOf(hex) }))
      .filter((entry) => entry.saturation >= 0.22 && entry.lightness >= 0.12 && entry.lightness <= 0.86)
      .sort((a, b) => b.count - a.count)[0]?.hex ?? ''
  )
}

/** Up to two of the page's own stylesheets. The design language — custom
 *  properties, the body rule, the typeface, the corner radius — lives there.
 *  Failure is silent: the trade's theme stands in. */
async function stylesheetsOf(html: string, base: URL, fetchImpl: typeof fetch): Promise<string> {
  const hrefs = [...html.matchAll(/<link[^>]+rel=["'][^"']*stylesheet[^"']*["'][^>]*>/gi)]
    .map((match) => match[0].match(/href=["']([^"']+)/i)?.[1] ?? '')
    .filter(Boolean)
    .slice(0, 2)

  let css = ''
  for (const href of hrefs) {
    try {
      const url = new URL(decode(href), base)
      assertPublicHost(url)
      const response = await fetchImpl(url.toString(), {
        cache: 'no-store',
        signal: AbortSignal.timeout(4000),
        headers: { 'user-agent': 'PlattrImporter/1.0', accept: 'text/css,*/*' },
      })
      if (!response.ok) continue
      css += (await response.text()).slice(0, 220_000)
    } catch {
      continue
    }
  }
  return css
}

/** Their manifest, if they ship one — the closest thing to "this site is a PWA". */
async function readPwa(
  html: string,
  base: URL,
  fetchImpl: typeof fetch,
): Promise<PwaInfo | undefined> {
  const href = manifestHref(html)
  if (!href) return undefined
  try {
    const url = new URL(decode(href), base)
    assertPublicHost(url)
    const response = await fetchImpl(url.toString(), {
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
      headers: {
        'user-agent': 'PlattrImporter/1.0',
        accept: 'application/manifest+json,application/json,*/*',
      },
    })
    if (!response.ok) return undefined
    const pwa = parseManifest((await response.text()).slice(0, 80_000), url)
    if (!pwa) return undefined
    return { ...pwa, serviceWorker: registersServiceWorker(html) }
  } catch {
    return undefined
  }
}

/* ------------------------------------------------------------------ */
/* Contact details                                                     */
/* ------------------------------------------------------------------ */

const SOCIALS: { match: RegExp; label: string }[] = [
  { match: /instagram\.com/i, label: 'Instagram' },
  { match: /facebook\.com|fb\.com/i, label: 'Facebook' },
  { match: /tiktok\.com/i, label: 'TikTok' },
  { match: /youtube\.com|youtu\.be/i, label: 'YouTube' },
  { match: /linkedin\.com/i, label: 'LinkedIn' },
  { match: /pinterest\./i, label: 'Pinterest' },
  { match: /x\.com|twitter\.com/i, label: 'X' },
  { match: /wa\.me|whatsapp\.com/i, label: 'WhatsApp' },
  { match: /t\.me/i, label: 'Telegram' },
]

/** Share buttons and embed dialogs link to a social site without being a profile. */
const SOCIAL_NOISE = /(?:share|intent|sharer|\/plugins\/|\/dialog\/)/i

function socialLinks(
  anchors: { href: string }[],
  base: URL,
  declared: string[],
): SocialLink[] {
  const seen = new Set<string>()
  const out: SocialLink[] = []
  for (const raw of [...declared, ...anchors.map((anchor) => anchor.href)]) {
    if (/^mailto:|^tel:|^javascript:/i.test(raw)) continue
    const label = SOCIALS.find((social) => social.match.test(raw))?.label
    if (!label || SOCIAL_NOISE.test(raw)) continue
    let absolute: URL
    try {
      absolute = new URL(raw, base)
    } catch {
      continue
    }
    if (!/^https?:$/.test(absolute.protocol)) continue
    const key = `${label}:${absolute.host}${absolute.pathname.replace(/\/$/, '')}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ label, url: absolute.toString().slice(0, 180) })
    if (out.length >= 5) break
  }
  return out
}

function cleanPhone(raw: string): string {
  const value = decode(raw)
    .replace(/[^\d+().\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s().-]+$/, '')
  const digits = value.replace(/\D/g, '')
  return digits.length >= 7 && digits.length <= 16 ? value.slice(0, 24) : ''
}

/** Contact details a site publishes as a placeholder, or that a template carries
 *  in its code. They must never reach a brief as if they were real. */
const PLACEHOLDER_CONTACT =
  /placeholder|example\.(?:com|org|net)|lorem ipsum|\bdummy\b|\bsample\b|\bxxx|\b000[\s-]?0{3}|123[\s-]?4567|98765\s*43210|\b555-\d{4}/i

/** A regex match, rejected when it sits in placeholder language. */
function contactFrom(text: string, pattern: RegExp): string {
  const match = pattern.exec(text)
  if (!match) return ''
  const around = text.slice(Math.max(0, match.index - 80), match.index + match[0].length + 80)
  return PLACEHOLDER_CONTACT.test(around) || PLACEHOLDER_CONTACT.test(match[0]) ? '' : match[0]
}

const GENERIC_TITLES = new Set([
  'home',
  'homepage',
  'shop',
  'store',
  'welcome',
  'official site',
  'official website',
  'index',
  'all products',
  'products',
  'shop all',
  'catalogue',
  'catalog',
  'collection',
  'collections',
  'new in',
])

export function cleanName(raw: string): string {
  const value = decode(raw).replace(/\s+/g, ' ').trim()
  if (!value) return ''
  const parts = value
    .split(/\s*[|·•]\s*|\s+[—–]\s+|\s+-\s+|\s*::\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !GENERIC_TITLES.has(part.toLowerCase()))
  if (!parts.length) return ''
  return collapse(
    parts[0].replace(/\s*[|·•–—]\s*(?:online store|official site|official website|shop now)$/i, ''),
    60,
  )
}

/** The name a site would have if its title were only “Shop”. */
function nameFromHost(host: string): string {
  const labels = host.replace(/^www\./, '').split('.')
  return titleFromSlug(labels.length > 2 ? labels[labels.length - 2] : labels[0] || host)
}

const DAY_INDEX: Record<string, number> = {
  mo: 0, mon: 0, monday: 0,
  tu: 1, tue: 1, tues: 1, tuesday: 1,
  we: 2, wed: 2, wednesday: 2,
  th: 3, thu: 3, thur: 3, thurs: 3, thursday: 3,
  fr: 4, fri: 4, friday: 4,
  sa: 5, sat: 5, saturday: 5,
  su: 6, sun: 6, sunday: 6,
}

const DAY_LABEL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function hoursFromSpecs(specs: { day: string; opens: string; closes: string }[]): string {
  const times: (string | null)[] = new Array(7).fill(null)
  for (const spec of specs) {
    const name = spec.day.toLowerCase().replace(/^https?:\/\/schema\.org\//, '')
    const index = DAY_INDEX[name] ?? DAY_INDEX[name.slice(0, 3)]
    if (index == null) continue
    times[index] = spec.opens && spec.closes ? `${spec.opens}–${spec.closes}` : 'Closed'
  }

  const out: string[] = []
  let start = 0
  while (start < 7) {
    if (times[start] == null) {
      start += 1
      continue
    }
    let end = start
    while (end + 1 < 7 && times[end + 1] === times[start]) end += 1
    out.push(
      start === end
        ? `${DAY_LABEL[start]} ${times[start]}`
        : `${DAY_LABEL[start]}–${DAY_LABEL[end]} ${times[start]}`,
    )
    start = end + 1
  }
  return out.join(' · ').slice(0, 90)
}

const clock = (value: string) => value.replace(/(\d{2}):(\d{2}):\d{2}/g, '$1:$2')

function hoursOf(business: Record<string, unknown>): string {
  const raw = business.openingHours
  const direct = Array.isArray(raw)
    ? raw.filter((entry): entry is string => typeof entry === 'string').join(' · ')
    : typeof raw === 'string'
      ? raw
      : ''
  if (direct)
    return clock(direct)
      .replace(/\bMo\b/g, 'Mon')
      .replace(/\bTu\b/g, 'Tue')
      .replace(/\bWe\b/g, 'Wed')
      .replace(/\bTh\b/g, 'Thu')
      .replace(/\bFr\b/g, 'Fri')
      .replace(/\bSa\b/g, 'Sat')
      .replace(/\bSu\b/g, 'Sun')
      .replace(/\s*-\s*/g, '–')
      .replace(/\s+/g, ' ')
      .slice(0, 90)

  const specs = business.openingHoursSpecification
  const list = (Array.isArray(specs) ? specs : [specs])
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .flatMap((entry) => {
      const day = entry.dayOfWeek
      const days = Array.isArray(day) ? day.map(String) : [String(day ?? '')]
      return days
        .filter(Boolean)
        .map((one) => ({ day: one, opens: clock(textOf(entry, 'opens')), closes: clock(textOf(entry, 'closes')) }))
    })
  return hoursFromSpecs(list)
}

/* ------------------------------------------------------------------ */
/* Prices                                                              */
/* ------------------------------------------------------------------ */

export function toCents(raw: string): number {
  if (!raw) return 0
  // One field can quote several options for the same line (“89.00 / 237.00”
  // for a glass and a bottle). The leading amount is the line's own price;
  // reading the run as one number produces a fantastic, wrong price.
  const amounts = raw.match(/\d[\d,]*(?:[.,]\d{2})?/g) ?? []
  const quoted = amounts.length > 1 && /[^\d.,]+\s*\d/.test(raw)
  const cleaned = (quoted ? amounts[0]! : raw).replace(/[^\d.,]/g, '')
  if (!cleaned) return 0
  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')
  let normalised = cleaned

  if (lastComma > -1 && lastDot > -1) {
    normalised =
      lastComma > lastDot ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned.replace(/,/g, '')
  } else if (lastComma > -1) {
    normalised = cleaned.length - lastComma - 1 === 2 ? cleaned.replace(',', '.') : cleaned.replace(/,/g, '')
  } else if (lastDot > -1) {
    const parts = cleaned.split('.')
    if (parts.length > 2) normalised = cleaned.replace(/\./g, '')
    else if (parts[1]?.length === 3) normalised = `${parts[0]}${parts[1]}`
  }

  const value = Number.parseFloat(normalised)
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : 0
}

const PRICE_PATTERN = /(?:[$£€₹¥]\s?\d[\d.,]*|\d[\d.,]*\s?(?:€|£|\$))/g

/** Markup with its code stripped: analytics blobs and framework payloads carry
 *  numbers that look like prices and are not. Prices are read from what a
 *  visitor can actually see. */
function visibleMarkup(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
}

const CURRENCIES: Record<string, string> = {
  $: 'USD',
  '£': 'GBP',
  '€': 'EUR',
  '₹': 'INR',
  '¥': 'JPY',
}

function centsOf(node: Record<string, unknown>): number {
  const offers = node.offers ?? node.priceSpecification
  for (const entry of Array.isArray(offers) ? offers : [offers]) {
    if (!entry || typeof entry !== 'object') continue
    const cents = toCents(textOf(entry as Record<string, unknown>, 'price', 'lowPrice', 'priceValue'))
    if (cents > 0) return cents
  }
  return toCents(textOf(node, 'price'))
}

/* ------------------------------------------------------------------ */
/* Catalogue                                                           */
/* ------------------------------------------------------------------ */

type Item = MenuSection['items'][number]

const PRODUCT_TYPES = new Set([
  'Product',
  'IndividualProduct',
  'ProductModel',
  'MenuItem',
  'Service',
  'Room',
  'Apartment',
  'House',
  'Vehicle',
  'Course',
])

/** No lowercase letters at all: how printed menus set a section label. */
const SECTION_HEADING = /^[A-Z0-9][A-Z0-9 '’&/+.,-]{2,}$/
/** Instructions to the shopper, not things to buy. */
const OPTION_LABEL = /^(?:choose|select|customi[sz]e|pick)\b/i
/** A four-figure minor-unit price is worth a second look before publishing. */
const SUSPECT_PRICE = 100_000

/**
 * Turns what a crawl read into what a menu may show. A section label, an option
 * button or a retail card with no price is not a dish: it is dropped and
 * reported, never guessed at. A price that looks like a parse accident is
 * cleared and reported, because a wrong price is worse than a missing one.
 */
export function cleanMenu(
  sections: MenuSection[],
  vertical: VerticalId,
): { sections: MenuSection[]; quality: ImportQuality } {
  const discovered = sections.reduce((total, section) => total + section.items.length, 0)
  const dropped: ImportQuality['dropped'] = []
  const suspectPrices: ImportQuality['suspectPrices'] = []
  const prices = sections
    .flatMap((section) => section.items.map((item) => item.price))
    .filter((price) => price > 0)
    .sort((a, b) => a - b)
  const median = prices.length ? prices[Math.floor(prices.length / 2)]! : 0
  // A menu that prices anything at all is a menu of things for sale, so an
  // all-caps entry with no price and no description is a label even when its
  // own section holds nothing else.
  const pricedAnywhere = prices.length > 0

  const cleaned = sections
    .map((section) => {
      const hasPriced = section.items.some((item) => item.price > 0)
      const items = section.items.flatMap((item) => {
        // A printed section label is not a dish. Its name is shouted, it carries
        // no price, and the menu around it proves prices exist — the card parser
        // can even have mistaken the next dish for its description.
        if (
          item.price === 0 &&
          item.name.length <= 32 &&
          SECTION_HEADING.test(item.name) &&
          (hasPriced || pricedAnywhere)
        ) {
          dropped.push({ name: item.name, section: section.name, reason: 'section-heading' })
          return []
        }
        if (!item.desc && OPTION_LABEL.test(item.name)) {
          dropped.push({ name: item.name, section: section.name, reason: 'option-label' })
          return []
        }
        if (vertical === 'restaurant' && item.price === 0 && !item.desc) {
          dropped.push({ name: item.name, section: section.name, reason: 'no-price-or-description' })
          return []
        }
        let price = item.price
        if (price >= SUSPECT_PRICE && median > 0 && price > median * 20) {
          suspectPrices.push({ name: item.name, section: section.name, value: price })
          price = 0
        }
        return [{ ...item, price }]
      })
      return { ...section, items }
    })
    .filter((section) => section.items.length > 0)

  const names = cleaned.flatMap((section) => section.items.map((item) => item.name.toLowerCase()))
  return {
    sections: cleaned,
    quality: {
      discovered,
      kept: names.length,
      dropped,
      suspectPrices,
      duplicates: names.length - new Set(names).size,
      categories: cleaned.map((section) => section.name),
    },
  }
}

/** The image a page declares for one specific product, and nothing else. */
function imageFrom(value: unknown): string {
  const entry = Array.isArray(value) ? value[0] : value
  const record = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : null
  const raw = typeof entry === 'string' ? entry : record ? record.url ?? record.contentUrl : ''
  const url = typeof raw === 'string' ? raw.trim() : ''
  return /^https:\/\/[^\s"'<>]{8,600}$/i.test(url) ? url : ''
}

function attribute(tag: string, name: string): string {
  return new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag)?.[1]?.trim() ?? ''
}

/** An absolute https image URL, or nothing: a page cannot make us load http. */
function absoluteImage(raw: string, base: URL): string {
  if (!raw) return ''
  try {
    const url = new URL(raw, base)
    if (url.protocol !== 'https:') return ''
    if (!/\.(?:png|jpe?g|webp|avif|svg)$/i.test(url.pathname)) return ''
    return /^https:\/\/[^\s"'<>]{4,600}$/i.test(url.href) ? url.href : ''
  } catch {
    return ''
  }
}

const GENERIC_FAVICON = /\/favicon(?:\.ico|[-_][\w-]*\.(?:png|svg))$/i
const NOT_A_LOGO = /hero|banner|cover|slider|carousel|lifestyle|gallery|product|collection|artwork/i
const IS_A_LOGO = /logo|wordmark|brand-?mark/i

/**
 * The business's logo, in the order the site itself ranks it: structured data
 * first, then the install icon, then a header image that calls itself a logo.
 * A hero photograph is never accepted, and a monogram remains the fallback when
 * the site declares nothing we can trust.
 */
function logoFrom(page: Page, business: Record<string, unknown>, name: string): { url: string; alt?: string } | undefined {
  const brand = collapse(textOf(business, 'name') || name, 60)
  const alt = brand ? `${brand} logo` : 'Business logo'
  const structured = absoluteImage(imageFrom(business.logo), page.url)
  if (structured) return { url: structured, alt }

  // The touch icon is the site's production mark at a usable size, unlike a
  // 16px favicon.
  const links = page.html.match(/<link\b[^>]*>/gi) ?? []
  const touch = links.find((tag) => /rel\s*=\s*["'][^"']*apple-touch-icon/i.test(tag))
  const touchUrl = touch ? absoluteImage(attribute(touch, 'href'), page.url) : ''
  if (touchUrl) return { url: touchUrl, alt }

  const header = /<header\b[^>]*>([\s\S]{0,8000}?)<\/header>/i.exec(page.html)?.[1] ?? ''
  for (const tag of (header || page.html.slice(0, 30_000)).match(/<img\b[^>]*>/gi) ?? []) {
    const src = attribute(tag, 'src') || attribute(tag, 'data-src')
    const signature = `${attribute(tag, 'alt')} ${attribute(tag, 'class')} ${attribute(tag, 'id')} ${src}`
    if (NOT_A_LOGO.test(signature) || !IS_A_LOGO.test(signature)) continue
    const url = absoluteImage(src, page.url)
    if (!url || GENERIC_FAVICON.test(url)) continue
    return { url, alt: collapse(attribute(tag, 'alt'), 80) || alt }
  }
  return undefined
}

/** A candidate photograph still has to pass the evidence gate: a stock URL, a
 *  logo or a banner declared as a product image is not one. */
function acceptedImage(...candidates: string[]): string {
  for (const candidate of candidates) {
    const checked = checkImageCandidate(candidate)
    if (checked.ok) return checked.url
  }
  return ''
}

function itemFromNode(node: Record<string, unknown>): Item | null {
  if (!typeOf(node).some((type) => PRODUCT_TYPES.has(type))) return null
  const name = textOf(node, 'name', 'headline')
  if (!name) return null
  const image = acceptedImage(imageFrom(node.image), imageFrom(node.thumbnailUrl))
  return {
    name: collapse(name, 60),
    desc: collapse(textOf(node, 'description'), 90),
    price: centsOf(node),
    ...(image ? { image: toEvidence(image, 'structured-data', collapse(name, 60)) } : {}),
  }
}

function dedupe(items: Item[], into: Set<string>): Item[] {
  const out: Item[] = []
  for (const item of items) {
    const key = item.name.toLowerCase()
    if (!item.name || into.has(key)) continue
    into.add(key)
    out.push(item)
  }
  return out
}

/** Products grouped by the menu, catalogue or list they hang off. */
function sectionsFromNodes(nodes: Record<string, unknown>[]): MenuSection[] {
  const groups = new Map<string, Item[]>()
  const loose: Item[] = []
  const seen = new WeakSet<object>()

  const visit = (node: Record<string, unknown>, section: string): void => {
    if (seen.has(node)) return
    seen.add(node)

    const types = typeOf(node)
    const isGroup = types.some(
      (type) => type === 'MenuSection' || type === 'OfferCatalog' || type === 'ItemList',
    )
    const here = isGroup ? collapse(textOf(node, 'name'), 40) || section : section

    if (isGroup) {
      const children = node.itemListElement ?? node.hasMenuItem
      if (Array.isArray(children))
        for (const child of children)
          if (child && typeof child === 'object') visit(child as Record<string, unknown>, here)
    }
    // A ListItem wraps the real product one level down.
    if (node.item && typeof node.item === 'object' && !Array.isArray(node.item))
      visit(node.item as Record<string, unknown>, here)

    const item = itemFromNode(node)
    if (!item) return
    if (!here) {
      loose.push(item)
      return
    }
    groups.set(here, [...(groups.get(here) ?? []), item])
  }

  for (const node of nodes) visit(node, '')

  const out: MenuSection[] = []
  const used = new Set<string>()
  for (const [name, items] of groups) {
    const unique = dedupe(items, used)
    if (unique.length) out.push({ name, items: unique })
  }
  if (loose.length) {
    const unique = dedupe(loose, used)
    if (!unique.length) return out
    const last = out[out.length - 1]
    if (last) last.items.push(...unique)
    else out.push({ name: 'Featured', items: unique })
  }
  return out
}

const CARD_OPENER = /<(article|li|div|section|figure)\b[^>]*class=["']([^"']*)["'][^>]*>/gi
/** Class names that hold one piece of a card, or wrap many cards. Neither is
 *  the card itself, and treating them as one eats the price out of the block. */
const CARD_PART =
  /price|rating|title|name|desc|image|thumb|badge|count|meta|sort|filter|pagination|wrapper|container|grid|list|toolbar|nav/i
const CARD_SHAPE = /product[-_ ]?(card|pod|item|tile|box)/i

/** Products from plain markup: cards whose class says “product”, with the name
 *  and price read out of the card itself. */
export function cardProducts(html: string): Item[] {
  const starts: number[] = []
  CARD_OPENER.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = CARD_OPENER.exec(html))) {
    const className = match[2] ?? ''
    if (!/product/i.test(className)) continue
    if (CARD_PART.test(className) && !CARD_SHAPE.test(className)) continue
    if (match.index != null) starts.push(match.index)
  }

  const out: Item[] = []
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index]
    const chunk = html.slice(start, Math.min(starts[index + 1] ?? html.length, start + 4200))
    const price = visibleMarkup(chunk).match(PRICE_PATTERN)?.[0]
    if (!price) continue
    const titleAttr = /<a\b[^>]*title=["']([^"']{2,90})["']/i.exec(chunk)?.[1]
    const heading = /<h[1-4][^>]*>([\s\S]{1,220}?)<\/h[1-4]>/i.exec(chunk)?.[1]
    const link = /<a\b[^>]*>([\s\S]{2,120}?)<\/a>/i.exec(chunk)?.[1]
    const name = collapse(titleAttr || heading || link || '', 60)
    if (name.length < 2) continue
    if (out.some((item) => item.name.toLowerCase() === name.toLowerCase())) continue
    out.push({ name, desc: '', price: toCents(price) })
    if (out.length >= 20) break
  }
  return out
}

/** Products from product links alone. Themes that compile their styles into
 *  hashed class names (`_card_hvnxy_10`) leave no `product` class for
 *  `cardProducts`, but the link still names the product and often sits beside
 *  its price. */
/** A slug or label that is only digits, or that reads as a stock code, is not
 *  a product name a shop would recognise. */
function usableProductName(name: string): boolean {
  if (name.length < 2 || !/[a-z]/i.test(name)) return false
  return !/^(?:[A-Z]{1,6}[-_ ]?)?\d{3,}[A-Z0-9]*$/i.test(name)
}

export function linkedProducts(html: string, base: URL): Item[] {
  const out: Item[] = []
  const seen = new Set<string>()
  // Match the anchor tag only. Real cards hold a screenful of image and
  // skeleton markup before `</a>`, so capturing the inner content skips them.
  const pattern = /<a\b[^>]*href\s*=\s*["']([^"']*\/products?\/[^"'?#]+)["'][^>]*>/gi
  const anchors = [...html.matchAll(pattern)]

  for (let index = 0; index < anchors.length; index += 1) {
    const match = anchors[index]
    const start = match.index ?? 0
    let url: URL
    try {
      url = new URL(decode(match[1] ?? ''), base)
    } catch {
      continue
    }
    // A shop's own footer link to somebody else's product is not its catalogue.
    if (url.origin !== base.origin) continue

    const slug = url.pathname.split('/').filter(Boolean).pop() ?? ''
    if (!slug || /^products?$/i.test(slug)) continue

    const tag = match[0]
    // A card runs from its own link to the next card's link, so a card that
    // shows no price cannot borrow the price of the card after it.
    const end = Math.min(anchors[index + 1]?.index ?? start + 2000, start + 2000)
    const card = html.slice(start + tag.length, end)

    const named =
      /\btitle\s*=\s*["']([^"']{2,90})["']/i.exec(tag)?.[1] ??
      /\baria-label\s*=\s*["']([^"']{2,90})["']/i.exec(tag)?.[1] ??
      ''
    // A short label inside the link beats a slug; a long skeleton does not.
    const close = card.indexOf('</a>')
    const inner = close >= 0 ? collapse(card.slice(0, close), 60) : ''
    const name = collapse(named || inner || titleFromSlug(slug), 60)
    if (!usableProductName(name)) continue

    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    // The price may sit inside the link or beside it, inside this card only.
    const priced = card.match(PRICE_PATTERN)
    out.push({ name, desc: '', price: toCents(priced?.[0] ?? '') })
    if (out.length >= 20) break
  }
  return out
}

/** What a page's catalogue looks like. `synthetic` means the section is
 *  unnamed because the items came from plain markup, so the caller decides what
 *  to call it: the trade's word, or the listing page's own heading. */
type Catalogue = { sections: MenuSection[]; synthetic: boolean }

function catalogueOf(page: Page): Catalogue {
  const fromData = sectionsFromNodes(page.nodes)
  if (fromData.length) return { sections: fromData, synthetic: false }

  const cards = cardProducts(page.html)
  if (cards.length >= 3) return { sections: [{ name: '', items: cards }], synthetic: true }

  const linked = linkedProducts(page.html, page.url)
  if (linked.length >= 3) return { sections: [{ name: '', items: linked }], synthetic: true }
  return { sections: [], synthetic: false }
}

/** A section title for a listing page whose products had no name of their own. */
function titleFromSlug(slug: string): string {
  return collapse(
    decode(slug.replace(/\.\w+$/, ''))
      .replace(/[-_]+/g, ' ')
      .replace(/\b[a-z]/g, (letter) => letter.toUpperCase()),
    40,
  )
}

/** A section title for a listing page whose products had no name of their own. */
function listingName(page: Page): string {
  const heading = /<h1[^>]*>([\s\S]{1,200}?)<\/h1>/i.exec(page.html)?.[1]
  const named = collapse(heading ?? '', 40)
  return named.length > 1
    ? named
    : titleFromSlug(page.url.pathname.split('/').filter(Boolean).pop() ?? '')
}

function mergeSections(base: MenuSection[], extra: MenuSection[]): MenuSection[] {
  const out = base.map((section) => ({ name: section.name, items: [...section.items] }))
  const seen = new Set(out.flatMap((section) => section.items.map((item) => item.name.toLowerCase())))

  for (const section of extra) {
    const items = dedupe(section.items, seen)
    if (!items.length) continue
    const existing = out.find((one) => one.name.toLowerCase() === section.name.toLowerCase())
    if (existing) existing.items.push(...items)
    else out.push({ name: section.name, items })
  }
  return out.slice(0, 12).map((section) => ({ ...section, items: section.items.slice(0, 30) }))
}

/* ------------------------------------------------------------------ */
/* Trade detection                                                     */
/* ------------------------------------------------------------------ */

const TRADE_WORDS: Record<VerticalId, string[]> = {
  restaurant: ['restaurant', 'menu', 'dinner', 'lunch', 'reservations', 'reserve a table', 'trattoria', 'bistro', 'brasserie', 'dine in', 'takeaway', 'chef', 'starters'],
  cafe: ['coffee', 'espresso', 'latte', 'flat white', 'bakery', 'pastries', 'croissant', 'brunch', 'café', 'cafe', 'roastery', 'beans'],
  shop: ['add to cart', 'add to bag', 'shop all', 'collection', 'free shipping', 'checkout', 'basket', 'our products', 'new arrivals', 'sale', 'jewellery', 'clothing', 'skincare', 'homeware', 'sneakers'],
  salon: ['salon', 'hair', 'haircut', 'colour', 'balayage', 'nails', 'manicure', 'beauty', 'blow dry', 'barber', 'spa', 'massage', 'facial', 'treatment room'],
  gym: ['gym', 'fitness', 'membership', 'personal training', 'classes', 'timetable', 'yoga', 'pilates', 'crossfit', 'strength', 'conditioning', 'coach'],
  clinic: ['dental', 'dentist', 'clinic', 'patients', 'medical', 'physio', 'chiropractor', 'doctor', 'therapy', 'hygienist', 'health'],
  trades: ['plumbing', 'plumber', 'electrician', 'boiler', 'heating', 'roofing', 'builder', 'handyman', 'installation', 'call-out', 'callout', 'gas safe'],
  professional: ['accounting', 'accountant', 'solicitor', 'law firm', 'consulting', 'advisory', 'tax', 'bookkeeping', 'payroll', 'agency', 'chartered'],
  property: ['estate agent', 'estate agency', 'property', 'for sale', 'to rent', 'viewings', 'apartments', 'real estate', 'lettings', 'valuation'],
  hotel: ['hotel', 'guesthouse', 'guest house', 'rooms', 'check-in', 'stays', 'b&b', 'bed and breakfast', 'hostel', 'suites'],
  studio: ['photography', 'photographer', 'portfolio', 'weddings', 'shoot', 'studio', 'film', 'creative', 'design studio', 'branding'],
  auto: ['garage', 'mot', 'servicing', 'tyres', 'vehicle', 'mechanic', 'car repair', 'dealership', 'diagnostics', 'brakes', 'clutch'],
  hospital: ['hospital', 'a&e', 'urgent care', 'ward', 'outpatients', 'nhs', 'clinics', 'patients'],
  ecommerce: ['add to cart', 'free shipping', 'shopify', 'online store', 'checkout', 'our range', 'sold out', 'restock', 'dispatch'],
  'plants-indoor': ['houseplants', 'houseplant', 'house plants', 'indoor plants', 'plant shop', 'repotting', 'low light'],
  'plants-outdoor': ['garden centre', 'plant nursery', 'shrubs', 'bare root', 'compost', 'polytunnel', 'hardy', 'nursery'],
  courses: ['online course', 'modules', 'enrol', 'certificate', 'curriculum', 'elearning', 'self-paced', 'course'],
  tuition: ['tuition', 'tutor', 'tutoring', 'gcse', 'a-level', 'revision', 'small groups', 'exam prep'],
  school: ['primary school', 'term dates', 'admissions', 'parents evening', 'pupils', 'headteacher', 'school', 'clubs'],
  kindergarten: ['kindergarten', 'preschool', 'childcare', 'montessori', 'early years', 'settling in', 'toddlers', 'nursery'],
  finance: ['financial adviser', 'mortgage', 'pension', 'investments', 'life cover', 'independent advice', 'protection', 'regulated by the fca'],
  agency: ['marketing agency', 'advertising agency', 'branding', 'campaigns', 'case studies', 'creative agency', 'proposal'],
  influencer: ['influencer', 'content creator', 'brand partnership', 'ugc', 'sponsored', 'media kit', 'followers', 'reels', 'collab'],
  portfolio: ['portfolio', 'case study', 'selected work', 'art director', 'personal site', 'side projects'],
  film: ['feature film', 'short film', 'documentary', 'screening', 'trailer', 'cast', 'crew', 'cinematographer', 'festival', 'film'],
  gallery: ['art gallery', 'gallery', 'exhibitions', 'exhibition', 'art dealer', 'fine art', 'sculpture', 'works on paper'],
  marketplace: ['marketplace', 'multi-vendor', 'vendors', 'delivery partners', 'stores', 'hyperlocal', 'quick commerce', 'commission'],
}

/** Words that turn up in ordinary copy — "intellectual property", "creative
 *  play", "health and wellbeing" — so they can hint, not decide. */
const WEAK_TRADE_WORDS = new Set([
  'property',
  'properties',
  'rooms',
  'studio',
  'film',
  'creative',
  'classes',
  'coach',
  'health',
  'agency',
  'sale',
  'collection',
  'for sale',
  'vehicle',
  'treatment room',
])

const CART_SIGNAL = /add to (?:cart|bag|basket)|checkout|shop all|free shipping|in stock|out of stock/i

export type TradeGuess = {
  id: VerticalId
  confidence: 'detected' | 'guessed'
  /** The words that decided it, so the brief can show its working. */
  evidence: string[]
}

export function detectVertical(signals: {
  strong: string
  body: string
  products: number
}): TradeGuess {
  const strong = signals.strong.toLowerCase()
  const body = signals.body.toLowerCase().slice(0, 12_000)
  const scores = new Map<VerticalId, number>()
  const evidence = new Map<VerticalId, string[]>()

  for (const [id, words] of Object.entries(TRADE_WORDS) as [VerticalId, string[]][]) {
    let score = 0
    const hits: string[] = []
    for (const word of words) {
      if (WEAK_TRADE_WORDS.has(word)) {
        if (strong.includes(word) || body.includes(word)) score += 1
      } else if (strong.includes(word)) {
        score += 3
        hits.push(word)
      } else if (body.includes(word)) score += 1
    }
    scores.set(id, score)
    evidence.set(id, hits)
  }
  if (signals.products > 0 || CART_SIGNAL.test(signals.body))
    scores.set('shop', (scores.get('shop') ?? 0) + 2)

  const [best, score] = [...scores.entries()].sort((a, b) => b[1] - a[1])[0]
  const confidence: TradeGuess['confidence'] = score >= 3 ? 'detected' : 'guessed'
  const id = score >= 3 ? best : signals.products > 0 ? 'shop' : 'professional'
  return { id, confidence, evidence: (evidence.get(id) ?? []).slice(0, 4) }
}

/** schema.org types that name a category a customer would recognise. */
const SCHEMA_CATEGORY: Record<string, string> = {
  BookStore: 'Bookshop',
  StationeryStore: 'Stationery shop',
  Florist: 'Florist',
  Bakery: 'Bakery',
  GroceryStore: 'Grocery shop',
  ConvenienceStore: 'Convenience store',
  ClothingStore: 'Clothing shop',
  ShoeStore: 'Shoe shop',
  JewelryStore: 'Jewellery shop',
  HomeGoodsStore: 'Homeware shop',
  FurnitureStore: 'Furniture shop',
  HardwareStore: 'Hardware shop',
  ElectronicsStore: 'Electronics shop',
  PetStore: 'Pet shop',
  LiquorStore: 'Bottle shop',
  Optician: 'Optician',
  Pharmacy: 'Pharmacy',
  HairSalon: 'Hair salon',
  BeautySalon: 'Beauty salon',
  NailSalon: 'Nail salon',
  DaySpa: 'Spa',
  Dentist: 'Dental clinic',
  MedicalClinic: 'Clinic',
  Physiotherapy: 'Physiotherapy clinic',
  HealthClub: 'Gym',
  ExerciseGym: 'Gym',
  YogaStudio: 'Yoga studio',
  AutoRepair: 'Garage',
  AutoDealer: 'Car dealer',
  RealEstateAgent: 'Estate agency',
  LodgingBusiness: 'Guesthouse',
  Hotel: 'Hotel',
  BedAndBreakfast: 'Guesthouse',
  Restaurant: 'Restaurant',
  CafeOrCoffeeShop: 'Café',
  BarOrPub: 'Bar',
  FastFoodRestaurant: 'Takeaway',
  PhotographyBusiness: 'Photography studio',
  AccountingService: 'Accountancy',
  LegalService: 'Law firm',
  ProfessionalService: 'Professional services',
  HomeAndConstructionBusiness: 'Home services',
  Plumber: 'Plumber',
  Electrician: 'Electrician',
  RoofingContractor: 'Roofer',
  MovingCompany: 'Removals',
  TravelAgency: 'Travel agency',
  Store: 'Shop',
}

/** Retail sub-categories the page copy usually names outright. Only consulted
 *  for shops: a restaurant that mentions coffee is still a restaurant. */
const CATEGORY_NOUNS: [RegExp, string][] = [
  // Before the generic book rule: a shop selling learning kits and alphabet
  // books is not a bookshop, and "Bookshop" would misdescribe it.
  [/\b(?:learning (?:products?|games?|kits?)|educational (?:toys?|books?|games?|kits?)|children'?s? (?:books?|learning)|alphabet book|screen-free|montessori (?:toys?|materials?))\b/i, "Children's learning"],
  [/\b(?:bookshop|bookstore|books?)\b/i, 'Bookshop'],
  [/\b(?:stationery|notebooks?|greeting cards?)\b/i, 'Stationery shop'],
  [/\b(?:florist|flowers?|bouquets?)\b/i, 'Florist'],
  [/\b(?:bakery|baker|sourdough|pastries)\b/i, 'Bakery'],
  [/\b(?:roastery|coffee beans|espresso)\b/i, 'Coffee roaster'],
  [/\b(?:wine|cellar|vineyard)\b/i, 'Wine shop'],
  [/\b(?:bikes?|cycling|bicycle)\b/i, 'Bike shop'],
  [/\b(?:plants?|houseplants?|garden centre)\b/i, 'Plant shop'],
  [/\b(?:furniture|sofas?|mattress)\b/i, 'Furniture shop'],
  [/\b(?:toys?|board games?|puzzles?)\b/i, 'Toy shop'],
  [/\b(?:jewellery|jewelry|necklaces?|earrings?)\b/i, 'Jewellery shop'],
  [/\b(?:clothing|apparel|dresses|coats|knitwear)\b/i, 'Clothing shop'],
  [/\b(?:shoes|sneakers|boots|footwear)\b/i, 'Shoe shop'],
  [/\b(?:skincare|cosmetics|make ?up|fragrance)\b/i, 'Beauty shop'],
  [/\b(?:vinyl|records?|turntables?)\b/i, 'Record shop'],
  [/\b(?:art prints?|prints|posters)\b/i, 'Print shop'],
  [/\b(?:gift shop|gifts|hamper)\b/i, 'Gift shop'],
  [/\b(?:pet shop|pet food|aquarium)\b/i, 'Pet shop'],
  [/\b(?:hardware|tools|diy)\b/i, 'Hardware shop'],
]

/** The business's own category, read from what the page declares first and its
 *  words second. Always falls back to something usable. */
function categoryOf(
  page: Page,
  vertical: VerticalId,
  evidence: string[],
  confidence: 'detected' | 'guessed',
): { category: string; basis: string } {
  for (const node of page.nodes)
    for (const type of typeOf(node)) {
      const mapped = SCHEMA_CATEGORY[type]
      if (mapped) return { category: mapped, basis: `the schema.org type “${type}”` }
    }

  if (vertical === 'shop') {
    const haystack = `${page.meta['og:title'] ?? ''} ${page.meta['og:description'] ?? ''} ${page.meta.description ?? ''} ${page.title} ${collapse(page.text, 6000)}`
    for (const [pattern, label] of CATEGORY_NOUNS)
      if (pattern.test(haystack)) return { category: label, basis: 'the words on the page' }
  }

  // A guess is not a name. Better an empty field, and the honest note, than an
  // app that calls a toy maker a "Creative studio".
  if (confidence === 'guessed')
    return { category: '', basis: 'nothing on the page named their trade — set it below' }

  return {
    category: VERTICALS[vertical].label,
    basis: evidence.length ? `the nearest trade, from “${evidence[0]}”` : 'the nearest trade',
  }
}

const CARTS_BY_TRADE = new Set<VerticalId>(['shop', 'restaurant', 'cafe'])

function inferFeatures(
  page: Page,
  vertical: VerticalId,
  productCount: number,
  /** A cart seen on a crawled page, not just the entry page. */
  cartSignal = false,
): FeatureId[] {
  const text = page.text.toLowerCase()
  const has = (pattern: RegExp) => pattern.test(text)
  const features = new Set<FeatureId>(['catalog'])

  // A cart is only assumed where the trade sells things by the item, or where
  // the site shows one. Everything else is booked, quoted or called.
  if (productCount > 0 && (cartSignal || CART_SIGNAL.test(page.html) || CARTS_BY_TRADE.has(vertical)))
    features.add('ordering')
  if (has(/\bdelivery\b|\bshipping\b|same[- ]day/)) features.add('delivery')
  if (has(/\bbook(?:ing)?\b|\bappointment|\breserve\b|\bschedule\b|\bavailability\b/))
    features.add('booking')
  if (has(/\btimetable\b|\bclasses\b|\bclass schedule\b|\bsessions?\b/)) features.add('classes')
  if (has(/\bquote\b|\bestimate\b|\benquiry\b|\binquiry\b|\bconsultation\b/)) features.add('quote')
  if (has(/\bloyalty\b|\brewards?\b|\bpoints\b|\bmembership\b/)) features.add('loyalty')
  if (has(/\boffers?\b|\bsale\b|\bdiscount\b|\b\d+% off\b|\bpromo/)) features.add('offers')
  if (has(/\bgallery\b|\bportfolio\b|\bour work\b|\bcase studies\b|\blookbook\b/))
    features.add('gallery')
  if (has(/\breviews?\b|\btestimonials?\b|\brated\b|\btripadvisor\b|\btrustpilot\b/))
    features.add('reviews')
  if (has(/\bevents?\b|\bwhat'?s on\b|\bcalendar\b/)) features.add('events')
  if (vertical === 'shop' && productCount > 0) features.add('ordering')
  return [...features]
}

/* ------------------------------------------------------------------ */
/* Extraction (identity, contact, first-page catalogue)                */
/* ------------------------------------------------------------------ */

const BUSINESS_TYPE =
  /Business|Organization|Store|Restaurant|Cafe|Bakery|Gym|Hotel|Lodging|Dentist|Clinic|Salon|Spa|Agency|Service|Contractor|Plumber|Electrician|Garage|AutoRepair|Photography|Studio|BedAndBreakfast/

export function extractSite(html: string, base: URL): ImportedSite {
  const page = readPage(html, base)
  return extractFromPage(page)
}

function extractFromPage(page: Page): ImportedSite {
  const { meta, nodes, anchors, text } = page
  const business = nodes.find((node) => typeOf(node).some((type) => BUSINESS_TYPE.test(type))) ?? {}

  const catalogue = catalogueOf(page)
  const productCount = catalogue.sections.reduce((total, section) => total + section.items.length, 0)

  const name =
    [
      cleanName(textOf(business, 'name')),
      cleanName(meta['og:site_name'] ?? ''),
      cleanName(meta['og:title'] ?? ''),
      cleanName(meta['twitter:title'] ?? ''),
      cleanName(page.title),
    ].find((candidate) => candidate.length >= 2) ?? nameFromHost(page.url.hostname)

  const description =
    textOf(business, 'description') ||
    meta.description ||
    meta['og:description'] ||
    meta['twitter:description'] ||
    ''

  // Only the parts that speak for the business set the trade outright; the long
  // body of copy can hint at it (one point a word) but never settle it alone.
  const guess = detectVertical({
    strong: `${name} ${meta['og:title'] ?? ''} ${page.title} ${typeOf(business).join(' ')} ${textOf(business, 'description', 'slogan', 'servesCuisine', 'priceRange')}`,
    body: text,
    products: productCount,
  })
  const vertical = guess.id
  const { category, basis: categoryBasis } = categoryOf(
    page,
    vertical,
    guess.evidence,
    guess.confidence,
  )

  const sections = catalogue.synthetic
    ? [{ ...catalogue.sections[0], name: VERTICALS[vertical].vocab.catalog }]
    : catalogue.sections

  const declaredAccent = brandColour(
    meta['theme-color'] || meta['msapplication-tilecolor'] || textOf(business, 'color'),
  )

  const addressNode = (business.address ?? {}) as Record<string, unknown>
  const address =
    collapse(
      [
        textOf(addressNode, 'streetAddress'),
        textOf(addressNode, 'addressLocality'),
        textOf(addressNode, 'addressRegion'),
        textOf(addressNode, 'postalCode'),
      ]
        .filter(Boolean)
        .join(', '),
      60,
    ) ||
    collapse(
      /<address[^>]*>([\s\S]{3,200}?)<\/address>/i.exec(page.html)?.[1] ?? '',
      60,
    )

  const sameAs = business.sameAs
  const declaredSocials = (Array.isArray(sameAs) ? sameAs : [sameAs]).filter(
    (entry): entry is string => typeof entry === 'string',
  )

  const telHref = anchors.find((anchor) => anchor.href.toLowerCase().startsWith('tel:'))?.href.slice(4)
  const mailHref = anchors
    .find((anchor) => anchor.href.toLowerCase().startsWith('mailto:'))
    ?.href.replace(/^mailto:/i, '')
    .split('?')[0]
  const phone =
    cleanPhone(textOf(business, 'telephone')) ||
    cleanPhone(telHref ?? '') ||
    cleanPhone(contactFrom(text, /\+\d[\d\s().-]{8,15}/))
  const email = collapse((mailHref ?? '') || contactFrom(text, /[\w.+-]+@[\w-]+\.[\w.]{2,}/), 80)

  return {
    name,
    tagline: collapse(textOf(business, 'slogan') || firstSentence(description, 90), 90),
    story: collapse(description, 240),
    vertical,
    verticalConfidence: guess.confidence,
    category,
    categoryBasis,
    accent: declaredAccent,
    logo: '',
    ...(() => {
      const logoImage = logoFrom(page, business, name)
      return logoImage ? { logoImage } : {}
    })(),
    // Whatever the source, a placeholder is not a contact detail.
    phone: PLACEHOLDER_CONTACT.test(phone) ? '' : phone,
    email: PLACEHOLDER_CONTACT.test(email) ? '' : email,
    address,
    hours: hoursOf(business),
    website: page.url.origin,
    currency: currencyOf(page),
    socials: socialLinks(anchors, page.url, declaredSocials),
    menu: sections,
    features: inferFeatures(page, vertical, productCount),
  }
}

function currencyOf(page: Page): string {
  for (const node of page.nodes) {
    const code =
      textOf((node.offers ?? {}) as Record<string, unknown>, 'priceCurrency') ||
      textOf(node, 'priceCurrency')
    if (/^[A-Z]{3}$/.test(code)) return code
  }
  const symbol = visibleMarkup(page.html).match(PRICE_PATTERN)?.[0]?.trim().charAt(0) ?? ''
  return CURRENCIES[symbol] ?? ''
}

/* ------------------------------------------------------------------ */
/* Crawling: the shop, collection and product pages behind the entry    */
/* ------------------------------------------------------------------ */

const OFF_LIMITS =
  /(?:\/cart|\/basket|\/checkout|\/account|\/login|\/signin|\/signup|\/register|\/search|\/blog|\/news|\/journal|\/privacy|\/terms|\/policies|\/policy|\/legal|\/cookies?|\/contact|\/about|\/faq|\/shipping|\/returns|\/careers|\/wp-admin|\/feed)(?:[/?#]|$)/i

const UNSAFE_QUERY = /[?&](?:sort|filter|q|search|add|variant|color|colour|size|page=0|utm_|currency=)/i

const AISLE = /^(?:shop|shop all|store|collections?|catalogue|catalog|products|all products|menu|our menu|food|drinks|services|treatments|packages|rooms|listings|properties|work|portfolio|classes|timetable|memberships)$/i

const AISLE_PATH =
  /(?:^|\/)(?:shop|store|collections?|categories|category|catalogue|catalog|products|menu|services|treatments|packages|rooms|listings|properties|work|portfolio|classes|timetable|memberships)\/?$/i

const PRODUCT_PATH = /(?:^|\/)(?:products?|p|item|items|listing|listings)\/[^/?#]{3,}\/?$/i

type Link = { url: URL; text: string }

/** Same-origin links worth following, with the words the page used for them. */
function linksOf(page: Page): Link[] {
  const origin = page.url.origin
  const seen = new Set<string>()
  const out: Link[] = []
  for (const anchor of page.anchors) {
    if (!anchor.href || /^(?:mailto:|tel:|javascript:|#)/i.test(anchor.href)) continue
    let url: URL
    try {
      url = new URL(anchor.href, page.url)
    } catch {
      continue
    }
    if (url.origin !== origin || !/^https?:$/.test(url.protocol)) continue
    url.hash = ''
    if (OFF_LIMITS.test(url.pathname) || UNSAFE_QUERY.test(url.search)) continue
    const key = `${url.pathname}${url.search}`
    if (seen.has(key) || key === '/') continue
    seen.add(key)
    out.push({ url, text: anchor.text })
  }
  return out
}

/** Links that look like an aisle — a category, collection, menu or service list. */
function aisleLinks(page: Page, limit: number): Link[] {
  const scored: { link: Link; score: number }[] = []
  for (const link of linksOf(page)) {
    if (PRODUCT_PATH.test(link.url.pathname)) continue
    const depth = link.url.pathname.split('/').filter(Boolean).length
    let score = 0
    if (AISLE_PATH.test(link.url.pathname)) score += 3
    if (AISLE.test(link.text)) score += 3
    if (/\/(?:collections?|category|categories|shop|products)\//i.test(link.url.pathname)) score += 2
    if (depth > 1) score += 1
    if (score > 0) scored.push({ link, score })
  }
  return scored
    .sort((a, b) => b.score - a.score || a.link.url.pathname.length - b.link.url.pathname.length)
    .slice(0, limit)
    .map((entry) => entry.link)
}

function productLinks(page: Page, limit: number): URL[] {
  return linksOf(page)
    .filter((link) => PRODUCT_PATH.test(link.url.pathname))
    .slice(0, limit)
    .map((link) => link.url)
}

/** A page that lists other pages is navigation, not a product: “Shop all
 *  products” names what the page does, and a price read off it belongs to one
 *  of the products it links to. */
const LISTING_TITLE =
  /^(?:shop|browse|view|see|explore)\s+(?:all|the|our|every)\b|^(?:all|every)\s+(?:products?|items?|collections?|services?|treatments?|courses?|classes|menu)\b|^(?:products|services|menu|collections?|categories)$/i

function productFromPage(page: Page): Item | null {
  for (const node of page.nodes) {
    const item = itemFromNode(node)
    if (item) return item
  }
  const name = cleanName(page.meta['og:title'] ?? '') || cleanName(page.title)
  if (!name || LISTING_TITLE.test(name)) return null
  const price =
    page.meta['product:price:amount'] ||
    page.meta['og:price:amount'] ||
    /itemprop=["']price["'][^>]*content=["']([\d.,]+)/i.exec(page.html)?.[1] ||
    visibleMarkup(page.html).match(PRICE_PATTERN)?.[0] ||
    ''
  const image = ogProductImage(page.html, page.meta, page.url.toString())
  return {
    name: collapse(name, 60),
    desc: collapse(page.meta.description ?? page.meta['og:description'] ?? '', 90),
    price: toCents(price),
    ...(image ? { image } : {}),
  }
}

/* ------------------------------------------------------------------ */
/* Did the shop draw its own catalogue?                                */
/* ------------------------------------------------------------------ */

/** A page that is mostly a mount point, or that asks the visitor to turn
 *  JavaScript on, is a shell on its own. */
const SHELL_ON_ITS_OWN = [
  /<div[^>]+id=["'](?:root|app|__next)["'][^>]*>\s*<\/(?:div|main)>/i,
  /<noscript[^>]*>[\s\S]{0,160}(?:enable|turn on)\s+javascript/i,
]

/** A state blob is normal on a server-rendered page too, so it only counts
 *  alongside the catalogue actually being absent from the markup. */
const STATE_BLOB = /__NEXT_DATA__|__NUXT__|__SAPPER__|__INITIAL_STATE__|__APOLLO_STATE__|ng-version=/i

/** Any product in the markup at all: structured data, an itemprop price, a
 *  product card class (BEM suffixes included) or a link to a product page.
 *  A `product-grid` container is not a product, and an image preload pointing
 *  at a `/products/` file on a CDN is not a product link, so neither counts. */
const PRODUCT_MARKUP =
  /"@type"\s*:\s*"Product"|itemprop=["']price|class=["'][^"']*product[-_ ]?(?:card|pod|item|tile|box)|<a\b[^>]*href=["'][^"']*\/products?\/[^"'?#]+/i

export function hasProductMarkup(html: string): boolean {
  return PRODUCT_MARKUP.test(html)
}

/** Whether the page looks like it fills its catalogue in after load. Used only
 *  to explain a thin read; the importer never guesses at the missing items. */
export function looksClientRendered(html: string, text = visible(html)): boolean {
  if (SHELL_ON_ITS_OWN.some((marker) => marker.test(html))) return true

  let signals = 0
  if (STATE_BLOB.test(html)) signals += 1
  if (!hasProductMarkup(html)) signals += 1
  if (html.length > 15_000 && text.length < 400) signals += 1
  return signals >= 2
}

type Crawl = {
  sections: MenuSection[]
  pages: number
  /** Every page that was actually opened, including ones with no catalogue. */
  opened: number
  skipped: boolean
  blocked: number
  clientRendered: boolean
  read: string[]
  failed: { url: string; reason: string }[]
  usedSitemap: boolean
  /** A currency declared by any page that was read. */
  currency: string
  /** Whether any page showed a cart or checkout control. */
  cartSignal: boolean
}

/** A product page turned into a catalogue section, named the way the shop
 *  names that aisle (breadcrumb), else as the business's own category. */
function sectionFromProductPage(page: Page, site: ImportedSite): MenuSection | null {
  const read = catalogueOf(page)
  const items = read.sections.flatMap((section) => section.items)
  if (!items.length) {
    const single = productFromPage(page)
    if (!single) return null
    items.push(single)
  }
  // A page that sells one thing can attribute its own lead image to that
  // product. A listing page selling several cannot: no image is better than
  // the wrong product's photograph.
  if (items.length === 1 && !items[0]!.image) {
    const image = ogProductImage(page.html, page.meta, page.url.toString())
    if (image) items[0] = { ...items[0]!, image }
  }

  let name = ''
  const crumbs = page.nodes.find((node) => typeOf(node).includes('BreadcrumbList'))
  if (crumbs) {
    const list = Array.isArray(crumbs.itemListElement) ? crumbs.itemListElement : []
    const names = list
      .map((entry) => {
        const node = (entry ?? {}) as Record<string, unknown>
        const item = (node.item ?? node) as Record<string, unknown>
        return collapse(textOf(node, 'name') || textOf(item, 'name'), 40)
      })
      .filter(Boolean)
    // Second to last is the aisle; the last is this product's own name.
    name = names.length > 1 ? names[names.length - 2]! : ''
  }
  if (!name || /^(?:home|shop|store|products?)$/i.test(name))
    name = site.category || VERTICALS[site.vertical].vocab.catalog

  return { name: collapse(name, 40) || 'Catalogue', items: items.slice(0, 30) }
}

async function expandCatalogue(options: {
  entry: Page
  site: ImportedSite
  fetchImpl: typeof fetch
  deadline: number
  robots: RobotsGroup[]
  /** Same-origin pages a sitemap declared, ranked product-first. */
  sitemap?: URL[]
}): Promise<Crawl> {
  const { entry, site, fetchImpl, deadline, robots } = options
  const sitemap = options.sitemap ?? []
  const visited = new Set([`${entry.url.origin}${entry.url.pathname}`])
  let sections: MenuSection[] = []
  let pages = 0
  let opened = 0
  let skipped = false
  let blocked = 0
  let usedSitemap = false
  let currency = ''
  let cartSignal = false
  let clientRendered = looksClientRendered(entry.html, entry.text)
  const read: string[] = [entry.url.pathname]
  const failed: { url: string; reason: string }[] = []

  const remainingPages = () => MAX_PAGES - 1 - pages
  const budgetLeft = () => deadline - Date.now() - 900

  const open = async (url: URL): Promise<Page | null> => {
    const key = `${url.origin}${url.pathname}`
    if (visited.has(key)) return null
    visited.add(key)
    try {
      const loaded = await loadSite(url, fetchImpl, {
        timeoutMs: Math.min(PAGE_TIMEOUT_MS, budgetLeft()),
        robots,
      })
      const page = readPage(loaded.html, loaded.url)
      opened += 1
      if (looksClientRendered(page.html, page.text)) clientRendered = true
      if (!currency) currency = currencyOf(page)
      if (CART_SIGNAL.test(page.html)) cartSignal = true
      read.push(url.pathname)
      return page
    } catch (error) {
      // loadSite is the single gate; a refusal here is the site's policy, not a
      // dead link, so it is counted rather than swallowed.
      if (error instanceof ImportError && error.code === 'robots_disallowed') {
        blocked += 1
        failed.push({ url: url.pathname, reason: 'robots.txt excludes this page' })
      } else {
        failed.push({
          url: url.pathname,
          reason: error instanceof Error ? error.message.slice(0, 120) : 'could not be read',
        })
      }
      // One dead aisle shouldn't cost the rest of the shop.
      return null
    }
  }

  const aisles = aisleLinks(entry, 40)
  const queue = aisles.slice(0, Math.max(remainingPages(), 0)).map((aisle) => aisle.url)
  // A shop with more aisles than the budget allows is worth saying out loud.
  if (aisles.length > queue.length) skipped = true

  while (queue.length && remainingPages() > 0) {
    if (budgetLeft() < 1200) {
      skipped = true
      break
    }
    const url = queue.shift()!
    const page = await open(url)
    if (!page) continue

    const read = catalogueOf(page)
    if (read.sections.length) {
      const named = read.synthetic
        ? [{ name: listingName(page), items: read.sections[0].items }]
        : read.sections
      sections = mergeSections(sections, named)
      pages += 1
    }

    // A listing page may itself be one page of a longer aisle.
    const room = remainingPages() - queue.length
    if (room > 0)
      for (const next of aisleLinks(page, room)) queue.push(next.url)
  }

  // Nothing on the entry page and nothing in the aisles: read a few products
  // directly, which is how single-page shops and marketplaces publish.
  const found = sections.reduce((total, section) => total + section.items.length, 0)
  if (site.menu.length === 0 && found < 3) {
    for (const url of productLinks(entry, 3)) {
      if (remainingPages() <= 0 || budgetLeft() < 1200) {
        skipped = true
        break
      }
      const page = await open(url)
      if (!page) continue
      const item = productFromPage(page)
      pages += 1
      if (!item) continue
      sections = mergeSections(sections, [{ name: VERTICALS[site.vertical].vocab.catalog, items: [item] }])
    }
  }

  // The home page drew no links, or too thin a catalogue: use the pages the
  // sitemap declared. Product pages carry their own structured data, so each
  // one read is a real item with a real price.
  const stillThin =
    site.menu.length === 0 &&
    sections.reduce((total, section) => total + section.items.length, 0) < 3
  if (stillThin && sitemap.length) {
    for (const url of sitemap) {
      if (remainingPages() <= 0 || budgetLeft() < 1200) {
        skipped = true
        break
      }
      if (visited.has(`${url.origin}${url.pathname}`)) continue
      const page = await open(url)
      if (!page) continue
      const section = sectionFromProductPage(page, site)
      if (!section) continue
      sections = mergeSections(sections, [section])
      pages += 1
      usedSitemap = true
    }
  }

  if (queue.length) skipped = true
  return {
    sections,
    pages,
    opened,
    skipped,
    blocked,
    clientRendered,
    read,
    failed,
    usedSitemap,
    currency,
    cartSignal,
  }
}

/* ------------------------------------------------------------------ */
/* The whole job                                                       */
/* ------------------------------------------------------------------ */

const DESIGN_NOTE =
  'Their look is measured, not copied: the palette, typeface and corner radius are read from their stylesheet and applied to an app we build. Their markup, scripts and images stay on their server — a packaged copy would be their copyright, and it would break the first time it went offline or they redeployed.'

const PHOTO_NOTE =
  'Photos are not copied from the site: they usually belong to the owner or their supplier, and hotlinking them breaks the offline app. The build uses its own generated artwork until real images are uploaded.'

export async function importWebsite(
  input: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ImportReport> {
  const deadline = Date.now() + CRAWL_BUDGET_MS
  const entryUrl = normaliseUrl(input)
  // Read the policy before the first page: a site that excludes us is never
  // fetched, not fetched and then discarded.
  const robots = await fetchRobots(entryUrl.origin, fetchImpl)
  const entry = await loadSite(entryUrl, fetchImpl, { robots })
  const page = readPage(entry.html, entry.url)
  const site = extractFromPage(page)

  const [css, pwa] = await Promise.all([
    stylesheetsOf(page.html, entry.url, fetchImpl),
    readPwa(page.html, entry.url, fetchImpl),
  ])
  if (pwa) site.pwa = pwa
  if (!site.accent) site.accent = brandColour(pwa?.themeColor ?? '') || dominantBrandHex(css)

  if (css || pwa?.backgroundColor) {
    const tradeTheme = themeFor(site.vertical)
    const design = readDesign(
      page.html,
      css,
      { bg: tradeTheme.bg, ink: tradeTheme.ink, muted: tradeTheme.muted },
      pwa?.backgroundColor ?? '',
    )
    if (design) site.design = design
    // With no trustworthy brand colour, their own ink is truer than a framework
    // palette: a site set in black stays black rather than turning cobalt.
    if (!site.accent && design?.palette) site.accent = design.ink
  }
  const structure = readStructure(page.html, css, site.name)
  if (structure) site.structure = structure

  // A readable home page with no product markup and no usable links is the
  // case a sitemap exists for. Reading it costs one request and is only done
  // when the entry page was thin.
  const entryItems = site.menu.reduce((total, section) => total + section.items.length, 0)
  const sitemap = entryItems < 3 ? await readSitemap(entry.url, fetchImpl, robots) : { urls: [], used: false }

  const crawl = await expandCatalogue({
    entry: page,
    site,
    fetchImpl,
    deadline,
    robots,
    sitemap: sitemap.urls,
  })
  site.menu = mergeSections(site.menu, crawl.sections)
  const pages = crawl.opened + 1
  // Section labels, option buttons and unpriced retail cards leave the menu
  // before anything else looks at it.
  const { sections: menu, quality } = cleanMenu(site.menu, site.vertical)
  site.menu = menu
  // Photographs last, so only surviving items are looked up, and only against
  // evidence the site itself published for that item.
  const embedded = embeddedJsonImages(entry.html)
  const publicData = await publicProductImages(entry.html, fetchImpl)
  const images = attachImages(site.menu, new Map([...publicData.images, ...embedded]), publicData.rejected)
  const items = quality.kept

  // Trade detection on the entry page alone cannot see a catalogue the sitemap
  // supplied: ButterTales read as "professional services" with seven priced
  // products in hand. A guessed trade plus a priced catalogue is retail.
  const entryVertical = site.vertical
  // Two priced products plus a cart is already a shop; three products is a
  // catalogue on its own.
  const looksRetail = items >= 3 || (items >= 2 && crawl.cartSignal)
  if (looksRetail && site.verticalConfidence === 'guessed' && site.vertical !== 'shop') {
    site.vertical = 'shop'
    site.verticalConfidence = 'detected'
    const guessed = categoryOf(page, 'shop', ['priced catalogue'], 'detected')
    if (guessed.category) {
      site.category = guessed.category
      site.categoryBasis = guessed.category.startsWith('Shop')
        ? 'a priced catalogue of products on the site'
        : guessed.basis
    }
    site.features = inferFeatures(page, 'shop', items, crawl.cartSignal)
  } else if (items > 0) {
    site.features = inferFeatures(page, site.vertical, items, crawl.cartSignal)
  }

  if (!site.currency && crawl.currency) site.currency = crawl.currency

  // A section named after the old trade ("Services") is renamed to the
  // business's own category once it is known.
  const oldVocab = VERTICALS[entryVertical].vocab.catalog
  const sectionName = site.category || VERTICALS[site.vertical].vocab.catalog
  if (sectionName !== oldVocab)
    site.menu = site.menu.map((section) =>
      section.name === oldVocab ? { ...section, name: sectionName } : section,
    )
  // Only a thin read needs explaining; a full catalogue speaks for itself.
  const clientRendered = items < 3 && crawl.clientRendered

  const found: string[] = []
  const missing: string[] = []
  const notes: string[] = []

  if (items) {
    found.push(
      `${items} catalogue ${items === 1 ? 'entry' : 'entries'} in ${site.menu.length} ${site.menu.length === 1 ? 'section' : 'sections'}${pages > 1 ? `, read from ${pages} pages` : ''}`,
    )
    if (crawl.usedSitemap)
      found.push('their sitemap listed the product pages the home page did not link to')
  } else {
    missing.push(
      clientRendered
        ? 'catalogue — the shop draws its product grid in the browser'
        : 'catalogue — add items in the app editor, or ask the owner for a product list',
    )
  }
  if (!site.category)
    missing.push('a category — the page never named their trade, so add it in the brief')

  if (site.name) found.push(`name: ${site.name}`)
  if (site.logoImage) found.push('their logo — taken from the image the site itself declares as its mark')
  else missing.push('logo — using initials until you upload one')
  if (site.category) found.push(`category: ${site.category} — from ${site.categoryBasis}`)
  if (site.tagline) found.push('a one-line description')
  if (site.accent) found.push(`brand colour ${site.accent}`)
  if (site.design) found.push(`their look: ${site.design.basis}`)
  if (site.structure) found.push(`their layout: ${site.structure.basis}`)
  if (pwa)
    found.push(
      `PWA manifest — ${pwa.display || 'browser'} display, theme ${pwa.themeColor || 'unset'}, splash ${pwa.backgroundColor || 'unset'}${pwa.serviceWorker ? ', service worker in place' : ''}`,
    )
  else if (registersServiceWorker(page.html))
    found.push('the site already registers a service worker — it is installable as it stands')
  if (site.phone) found.push(`phone ${site.phone}`)
  if (site.email) found.push(`email ${site.email}`)
  if (site.address) found.push('address')
  if (site.hours) found.push('opening hours')
  if (site.socials.length)
    found.push(`${site.socials.length} social ${site.socials.length === 1 ? 'link' : 'links'}`)

  if (!site.phone) missing.push('phone number')
  if (!site.email) missing.push('email')
  if (!site.address) missing.push('address')
  if (!site.hours) missing.push('opening hours')
  if (!site.accent) {
    site.accent = VERTICALS[site.vertical].accent
    missing.push('brand colour — using the trade default for now')
  }

  if (site.verticalConfidence === 'guessed')
    notes.push(
      `No trade was obvious from the copy, so this started as ${VERTICALS[site.vertical].label.toLowerCase()} services. Change the business type and every word in the app follows.`,
    )
  if (crawl.skipped)
    notes.push(
      `The crawl is capped at ${MAX_PAGES} pages to keep the brief quick, so a large shop may still have aisles left — add anything missing in the app editor.`,
    )
  if (crawl.blocked)
    notes.push(
      `robots.txt excludes ${IMPORTER_AGENT} from ${crawl.blocked} ${crawl.blocked === 1 ? 'page' : 'pages'} behind this link, so the catalogue may be shorter than the shop.`,
    )
  if (clientRendered)
    notes.push(
      'Their catalogue looks client-rendered: the page we can read is the shell of the shop, and the products are fetched in the browser afterwards. Nothing was invented to fill the gap — add the items in the app editor, or ask the owner for a product export.',
    )
  if (items && site.menu.every((section) => section.items.every((item) => item.price === 0)))
    notes.push('The site lists items without prices, so they appear as “Ask on request” until you set one.')
  notes.push(DESIGN_NOTE)
  notes.push(PHOTO_NOTE)

  if (images.products) {
    if (images.withImage)
      found.push(
        `${images.withImage} of ${images.products} items with a photograph the site published for that item (${Object.entries(images.methods)
          .map(([method, count]) => `${method}: ${count}`)
          .join(', ')})`,
      )
    if (images.withoutImage)
      missing.push(
        `${images.withoutImage} product ${images.withoutImage === 1 ? 'photograph' : 'photographs'} — the site publishes none for ${images.withoutImage === 1 ? 'that item' : 'those items'}`,
      )
  }
  if (images.rejected.length)
    notes.push(
      `Refused ${images.rejected.length} image${images.rejected.length === 1 ? '' : 's'} the page offered that do not belong to the item: ${images.rejected
        .slice(0, 3)
        .map((entry) => entry.reason)
        .join('; ')}.`,
    )
  if (quality.dropped.length)
    notes.push(
      `Left out ${quality.dropped.length} catalogue ${quality.dropped.length === 1 ? 'entry' : 'entries'} that are not things to buy: ${quality.dropped
        .slice(0, 4)
        .map((entry) => `${entry.name} (${entry.reason})`)
        .join(', ')}.`,
    )
  if (quality.suspectPrices.length)
    notes.push(
      `Cleared ${quality.suspectPrices.length} price${quality.suspectPrices.length === 1 ? '' : 's'} that looked like a reading error, so the item shows no price until you set one: ${quality.suspectPrices
        .map((entry) => `${entry.name} at ${entry.value / 100}`)
        .join(', ')}.`,
    )

  return {
    source: entry.url.toString(),
    host: entry.url.hostname.replace(/^www\./, ''),
    images,
    quality,
    pages,
    site,
    found,
    missing,
    notes,
    pagesRead: [...new Set(crawl.read)].slice(0, 20),
    pagesFailed: crawl.failed.slice(0, 10),
    usedSitemap: crawl.usedSitemap,
  }
}

/* ------------------------------------------------------------------ */
/* Round-tripping through the browser                                  */
/* ------------------------------------------------------------------ */

const HTTP_LINK = /^https?:\/\//i

/** The brief sends the draft back when the build is created. Nothing from the
 *  browser is trusted: every field is re-checked and re-clamped here. */
export function sanitizeImported(input: unknown): Partial<ImportedSite> | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined
  const source = input as Record<string, unknown>
  const str = (value: unknown, max: number): string =>
    typeof value === 'string' ? collapse(value, max) : ''
  const design = cleanDesign(source.design)
  const pwa = cleanPwa(source.pwa)
  const structure = cleanStructure(source.structure)

  return {
    name: str(source.name, 60),
    category: str(source.category, 40),
    ...(design ? { design } : {}),
    ...(pwa ? { pwa } : {}),
    ...(structure ? { structure } : {}),
    tagline: str(source.tagline, 90),
    story: str(source.story, 240),
    phone: str(source.phone, 24),
    email: str(source.email, 80),
    address: str(source.address, 60),
    hours: str(source.hours, 90),
    website:
      typeof source.website === 'string' && HTTP_LINK.test(source.website)
        ? source.website.slice(0, 120)
        : '',
    currency: /^[A-Z]{3}$/.test(String(source.currency ?? '')) ? String(source.currency) : '',
    ...(cleanLogoImage(source.logoImage) ? { logoImage: cleanLogoImage(source.logoImage) } : {}),
    socials: Array.isArray(source.socials)
      ? source.socials
          .slice(0, 5)
          .map((entry) => {
            const record = (entry ?? {}) as Record<string, unknown>
            const url = typeof record.url === 'string' ? record.url.trim() : ''
            return { label: str(record.label, 20) || 'Link', url: HTTP_LINK.test(url) ? url.slice(0, 180) : '' }
          })
          .filter((entry) => entry.url)
      : [],
    menu: sanitizeMenu(source.menu),
    features: Array.isArray(source.features)
      ? source.features.filter((entry): entry is FeatureId => typeof entry === 'string').slice(0, 20)
      : [],
  }
}

/* ------------------------------------------------------------------ */
/* A tiny throttle                                                     */
/* ------------------------------------------------------------------ */

/**
 * A bucket holds a burst of three imports and refills one every 20 seconds.
 * Each import opens at most six pages, so one isolate is held below roughly 18
 * page fetches a minute. Isolates are short-lived: this is a speed bump, not a
 * quota — the daily ceiling lives in D1.
 */
const budgets = new Map<string, { tokens: number; at: number }>()
export function throttleImports(bucket: string, now = Date.now()): void {
  const burst = 3
  const refillMs = 20_000
  const state = budgets.get(bucket) ?? { tokens: burst, at: now }
  state.tokens = Math.min(burst, state.tokens + (now - state.at) / refillMs)
  state.at = now
  if (state.tokens < 1) {
    budgets.set(bucket, state)
    throw new ImportError(
      'rate_limited',
      'That is a lot of sites at once. Wait a moment and try this one again.',
      429,
    )
  }
  state.tokens -= 1
  budgets.set(bucket, state)
}

const inFlight = new Map<string, Promise<ImportReport>>()

/**
 * The checks the crawler applies before its first request, in one call. The
 * route uses it to refuse a junk link before spending a rate-limit token or a
 * unit of the day's allowance; nothing here touches the network.
 */
export function checkImportUrl(input: string): URL {
  const url = normaliseUrl(input)
  assertPublicHost(url)
  return url
}

/** What two requests must agree on to share one crawl. */
function crawlKey(input: string): string {
  try {
    return checkImportUrl(input).href
  } catch {
    return input.trim().toLowerCase()
  }
}

/**
 * Two visitors asking for the same URL at once share one crawl, so a hammered
 * link cannot multiply outbound requests. A failed crawl is not cached.
 */
export function importOnce(
  input: string,
  run: (url: string) => Promise<ImportReport> = importWebsite,
): Promise<ImportReport> {
  const key = crawlKey(input)
  const existing = inFlight.get(key)
  if (existing) return existing
  const work = run(input)
  inFlight.set(key, work)
  const release = () => {
    if (inFlight.get(key) === work) inFlight.delete(key)
  }
  work.then(release, release)
  return work
}
