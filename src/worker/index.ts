import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { renderApp, renderIcon, renderManifest, renderServiceWorker } from './app'
import { photosFor } from './photos'
import {
  addNote,
  approveProject,
  createProject,
  deleteBriefDraft,
  deleteProject,
  readBriefDraft,
  saveBriefDraft,
  getDocVersion,
  getProject,
  listDocVersions,
  log,
  saveDoc,
  listActivity,
  listNotes,
  listProjects,
  saveVersion,
  spendImportBudget,
  spendDailyBudget,
  type Project,
} from './db'
import { bundleFilename, bundleFor } from './export'
import {
  applyPriceDecisions,
  checkImportUrl,
  ImportError,
  importOnce,
  importWebsite,
  sanitizeImported,
  throttleImports,
} from './importer'
import { applyApproval, diffCatalogue } from './reimport'
import { buildSpec, initialsFor, quote, sanitizeHex, sanitizeMenu, type VerticalId } from './pricing'
import { buildDiscovery, discoverPlan } from './discovery'
import { applyCommand, docFromSpec, flagshipDocFromSpec, normalizeDoc } from './doc'
import { FLAGSHIP_TRADES } from './flagship'
import { directionsFor } from './directions'
import { editorPage } from './views/editor'
import { dashboardPage, ownerLoginPage } from './views/dashboard'
import { paymentMissingPage, paymentPage } from './views/payments'
import {
  OWNER_SESSION_DAYS,
  createOwnerSession,
  deleteOwnerSession,
  deleteOwnerSessions,
  hasOwnerSession,
  matchesOwnerKey,
  ownerAccessKey,
  ownerCookieName,
} from './ownerAuth'
import {
  BusinessError,
  createBooking,
  createEnquiry,
  createOrder,
  dashboardData,
  getBooking,
  getOrder,
  updateBookingStatus,
  updateEnquiryStatus,
  updateOrderStatus,
} from './business'
import {
  MediaError,
  deleteMedia,
  listMedia,
  mediaIdsFor,
  pruneMissingMedia,
  mediaSuggestions,
  mediaView,
  replaceMedia,
  serveMedia,
  uploadMedia,
  type MediaBucket,
} from './media'
import type { AppSpec, MenuSection, VideoLink } from './types'
import type { Doc } from './doc'
import { pruneEmptySections, refreshCopiedCopy } from './publish'

/**
 * A business change (settings, catalogue, import) can give a section the data it
 * was missing. Re-check the stored document and persist the result, so an
 * automatically hidden block comes back without the owner reopening the editor.
 * Projects that never saved a document have nothing to reconcile.
 */
async function reconcileDoc(db: D1Database, project: Project, doc: Doc, spec: AppSpec) {
  const result = pruneEmptySections(doc, spec, project.token)
  if (result.hidden.length || result.restored.length) await saveDoc(db, project, result.doc, { log: false })
  return result
}
import {
  MediaCleanupError,
  clampGraceHours,
  executeMediaCleanup,
  listMediaCleanupLog,
  planMediaCleanup,
} from './mediaCleanup'

/**
 * Media references a document or catalogue carries that this project does not
 * own. Every write path checks this: ownership is decided on the server, not by
 * whichever surface sent the id.
 */
function foreignMedia(doc: Doc | null, menu: MenuSection[] | null, owned: Set<string>): string[] {
  const found: string[] = []
  for (const screen of doc?.screens ?? [])
    for (const node of screen.sections) if (node.media && !owned.has(node.media.id)) found.push(node.media.id)
  for (const section of menu ?? [])
    for (const item of section.items) if (item.media && !owned.has(item.media.id)) found.push(item.media.id)
  return [...new Set(found)]
}
import { cleanLayout, conceptsFor, designsFor, readPrompt } from './prompt'
import { sampleSpec } from './proof'
import { briefPage } from './views/brief'
import { legalPage } from './views/legal'
import { marketingPage } from './views/marketing'
import { studioKeyPage, studioPage } from './views/studio'
import {
  isOperator,
  matchesOperatorKey,
  STUDIO_COOKIE,
  STUDIO_SESSION_MAX_AGE,
  studioSession,
} from './studioAuth'
import { workspacePage } from './views/workspace'
import { esc, page } from './views/shell'
import {
  checkoutPresentation,
  disconnectConnection,
  handleWebhook,
  paymentCapability,
  paymentDashboard,
  refundTransaction,
  refreshTransaction,
  saveConnection,
  savePaymentSettings,
  startCheckout,
  testConnection,
  verifyRazorpayCheckout,
} from './payments/service'
import { isProvider, PaymentError, type ProviderId } from './payments/types'

type Bindings = {
  DB: D1Database
  ASSETS: Fetcher
  /** Private R2 bucket for owner-uploaded images. */
  MEDIA?: R2Bucket
  PEXELS_API_KEY?: string
  /** Operator key for /studio. Unset means the board stays closed. */
  STUDIO_KEY?: string
  /** Separate secret for owner dashboard credentials and sessions. */
  OWNER_SECRET?: string
  /** Imports allowed per day across everyone. Unset uses the default; 0 closes the importer. */
  IMPORT_DAILY_CAP?: string
  /** Published on the privacy page for deletion and data requests. */
  CONTACT_EMAIL?: string
  /** Base64 32-byte key for AES-GCM encryption of payment credentials. */
  PAYMENT_ENCRYPTION_KEY?: string
  /** M0 dark-launch switches, e.g. `accounts.enabled=1`. Unset means all off. */
  PLATFORM_FLAGS?: string
}

const app = new Hono<{ Bindings: Bindings }>()

/** Private trees: token pages and the operator board. */
const PRIVATE_PATHS = /^\/(p|studio)(\/|$)/

const SHARE_DESCRIPTION =
  'Apps for any local business, from a conversation — built in a day and reviewed by a human before every launch.'

/**
 * Share tags need absolute URLs, which only the request knows. Rather than
 * thread a URL through every view, read back the page's own title and
 * description and add the tags once, here.
 */
app.use('*', async (c, next) => {
  await next()
  const response = c.res
  if (!response.headers.get('content-type')?.includes('text/html')) return
  const html = await response.text()
  if (html.includes('property="og:title"') || !html.includes('</head>')) {
    c.res = new Response(html, { status: response.status, headers: response.headers })
    return
  }
  const title = /<title>([^<]*)<\/title>/.exec(html)?.[1].trim() || 'Plattr'
  const description =
    /<meta name="description" content="([^"]*)"/.exec(html)?.[1] || SHARE_DESCRIPTION
  const canonical = new URL(c.req.url)
  canonical.search = ''
  const image = new URL('/og.png', canonical).href
  const tags = `
<meta property="og:site_name" content="Plattr" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:url" content="${canonical.href}" />
<meta property="og:image" content="${image}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="Plattr — apps for any local business, from a conversation" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${description}" />
<meta name="twitter:image" content="${image}" />`
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  c.res = new Response(html.replace('</head>', `${tags}\n</head>`), {
    status: response.status,
    headers,
  })
})

/**
 * A manifest, service worker, icon or zip cannot carry a meta tag, and a
 * redirect or JSON error has no head at all, so every private path also says
 * noindex in the header.
 */
app.use('*', async (c, next) => {
  await next()
  // Asset responses from the host are immutable; clone the headers before
  // adding the security policy instead of mutating them in place.
  const headers = new Headers(c.res.headers)
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  // The customer app sets its own policy from the owner's indexing choice.
  if (PRIVATE_PATHS.test(c.req.path) && !/^\/p\/[0-9a-f]{24}\/app$/.test(c.req.path))
    headers.set('X-Robots-Tag', 'noindex, nofollow')
  c.res = new Response(c.res.body, { status: c.res.status, statusText: c.res.statusText, headers })
})

/** Builds one visitor may create per day, and the whole studio may create. */
const PROJECTS_PER_VISITOR = 3
const PROJECTS_PER_DAY = 40

/** The buckets reset on the UTC date, so say when — not a made-up hour. */
function secondsUntilReset(): number {
  const now = Date.now()
  const midnight = new Date(now)
  midnight.setUTCHours(24, 0, 0, 0)
  return Math.max(60, Math.ceil((midnight.getTime() - now) / 1000))
}

/**
 * A short hash of the caller, so the daily counter never stores an address.
 *
 * Only Cloudflare's own header is read: `X-Forwarded-For` is whatever the
 * caller chose to send when the Worker is reachable without Cloudflare in
 * front, so trusting it would hand out a fresh allowance per header value.
 */
export async function visitorBucket(ip: string | undefined): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip ?? 'unattributed'))
  return Array.from(new Uint8Array(digest))
    .slice(0, 8)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

// Uploads stream to their own route with a larger ceiling; every other API
// keeps the tight JSON limit.
app.use('/api/*', async (c, next) => {
  if (/\/media$/.test(c.req.path)) return next()
  return bodyLimit({
    maxSize: 256 * 1024,
    onError: (c) =>
      c.json(
        { error: { code: 'body_too_large', message: 'That payload is too large.' } },
        413,
      ),
  })(c, next)
})

const TOKEN = /^[0-9a-f]{24}$/

/** How many imports one day may spend across every isolate. */
const DEFAULT_IMPORT_DAILY_CAP = 400

function importCap(env: Bindings): number {
  const raw = env.IMPORT_DAILY_CAP?.trim()
  if (!raw) return DEFAULT_IMPORT_DAILY_CAP
  const cap = Number(raw)
  return Number.isFinite(cap) && cap >= 0 ? Math.floor(cap) : DEFAULT_IMPORT_DAILY_CAP
}

/** Imports one visitor may spend in a day, so one browser cannot drain the studio's. */
const IMPORTS_PER_VISITOR = 3

function ownerSecret(env: Bindings): string {
  return (env.OWNER_SECRET ?? env.STUDIO_KEY ?? '').trim()
}

async function ownerSession(
  c: Context<{ Bindings: Bindings }>,
  project: { id: string; token: string },
): Promise<boolean> {
  return hasOwnerSession(c.env.DB, project.id, getCookie(c, ownerCookieName(project.token)))
}

function isHttps(url: string): boolean {
  return url.startsWith('https://')
}

function fail(
  c: {
    json: (
      body: unknown,
      status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 422 | 429 | 500 | 502 | 503,
    ) => Response
  },
  status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 422 | 429 | 500 | 502 | 503,
  code: string,
  message: string,
): Response {
  return c.json({ error: { code, message } }, status)
}

async function readJson(c: {
  req: { json: () => Promise<unknown> }
}): Promise<Record<string, unknown> | null> {
  try {
    const value = await c.req.json()
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    return value as Record<string, unknown>
  } catch {
    return null
  }
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string').slice(0, 24)
    : []
}

function str(value: unknown, max = 200): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

async function loadProject(c: {
  req: { param: (name: string) => string }
  env: Bindings
}) {
  const token = c.req.param('token')
  if (!TOKEN.test(token)) return null
  return getProject(c.env.DB, token)
}

function notFoundPage(): string {
  return page({
    title: 'Not found · Plattr',
    body: `<div class="wrap" style="padding:90px 0;text-align:center">
      <span class="eyebrow">404</span>
      <h1 class="display" style="font-size:44px;margin-top:14px">This build link doesn't exist.</h1>
      <p class="lede" style="margin:14px auto 0">It may have been mistyped, or the build was removed. Ask the studio for a fresh build link.</p>
      <div style="display:flex;gap:10px;justify-content:center;margin-top:22px">
        <a class="btn primary" href="/studio">Open the studio</a>
        <a class="btn ghost" href="/brief">Start a brief</a>
      </div>
    </div>`,
  })
}

/* -------------------------------- pages -------------------------------- */

// Every project-scoped API capability is owner-only. The customer app talks to
// its public `/p/:token/orders`, `/bookings` and `/enquiries` routes instead; it
// never receives an owner session. Keeping this in one middleware means a new
// editor route cannot accidentally ship without authorization.
app.use('/api/projects/:token/*', async (c, next) => {
  const project = await loadProject(c)
  if (!project) return next()
  if (!(await ownerSession(c, project)))
    return fail(c, 401, 'owner_auth_required', 'Sign in with the owner key to edit this build.')
  await next()
})

app.get('/', (c) => c.html(marketingPage()))

/** Liveness plus a real D1 round-trip for deployment checks. */
app.get('/health', async (c) => {
  try {
    await c.env.DB.prepare('SELECT 1 AS ok').first()
    c.header('Cache-Control', 'no-store')
    return c.json({ ok: true, db: 'up', at: new Date().toISOString() })
  } catch {
    c.header('Cache-Control', 'no-store')
    return c.json({ ok: false, db: 'down' }, 503)
  }
})

app.get('/robots.txt', (c) => {
  const url = new URL(c.req.url)
  // A preview copy must never compete with production in search results.
  if (url.hostname.includes('-preview.'))
    return c.body('User-agent: *\nDisallow: /\n', 200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    })
  const origin = url.origin
  return c.body(
    `User-agent: *\nAllow: /\nDisallow: /studio\nDisallow: /p/\nDisallow: /api/\nDisallow: /demo/\nDisallow: /health\n\nSitemap: ${origin}/sitemap.xml\n`,
    200,
    { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  )
})

// Only the three pages anyone may land on; build links stay unlisted, and are
// already disallowed to crawlers.
app.get('/sitemap.xml', (c) => {
  const origin = new URL(c.req.url).origin
  const urls = ['/', '/brief', '/privacy']
    .map((page) => `  <url><loc>${origin}${page}</loc></url>`)
    .join('\n')
  return c.body(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    200,
    { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  )
})

app.get('/privacy', (c) => c.html(legalPage(c.env.CONTACT_EMAIL)))

// The terms live on the same page: one short document, one link to share.
app.get('/terms', (c) => c.redirect('/privacy', 301))

app.get('/brief', (c) => c.html(briefPage()))

app.get('/studio', async (c) => {
  const key = (c.env.STUDIO_KEY ?? '').trim()
  c.header('Cache-Control', 'no-store')
  if (!key) return c.html(studioKeyPage({ configured: false }), 503)
  if (!(await isOperator(getCookie(c, STUDIO_COOKIE), key)))
    return c.html(studioKeyPage({ configured: true }), 401)
  const projects = await listProjects(c.env.DB)
  const ownerKeys: Record<string, string> = {}
  for (const project of projects) ownerKeys[project.id] = await ownerAccessKey(project.token, ownerSecret(c.env))
  c.header('Cache-Control', 'private, no-store')
  return c.html(studioPage(projects, ownerKeys))
})

/**
 * The operator key arrives in a POST body, never the query string, so it stays
 * out of browser history, referrers and access logs. The cookie holds an HMAC
 * of the key rather than the key itself.
 */
app.post('/studio/unlock', async (c) => {
  const key = (c.env.STUDIO_KEY ?? '').trim()
  c.header('Cache-Control', 'no-store')
  if (!key) return c.html(studioKeyPage({ configured: false }), 503)
  const body = await c.req.parseBody()
  const given = typeof body.key === 'string' ? body.key.trim() : ''
  if (!(await matchesOperatorKey(given, key)))
    return c.html(studioKeyPage({ configured: true, wrong: true }), 401)
  setCookie(c, STUDIO_COOKIE, await studioSession(key), {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure: isHttps(c.req.url),
    maxAge: STUDIO_SESSION_MAX_AGE,
  })
  return c.redirect('/studio', 303)
})

app.post('/studio/lock', (c) => {
  deleteCookie(c, STUDIO_COOKIE, { path: '/', secure: isHttps(c.req.url) })
  return c.redirect('/', 303)
})

/**
 * Removes a build and everything attached to it. POST only and operator-gated,
 * so no crawler or stray link can delete a customer's work.
 */
app.post('/studio/projects/:id/delete', async (c) => {
  const key = (c.env.STUDIO_KEY ?? '').trim()
  if (!key || !(await isOperator(getCookie(c, STUDIO_COOKIE), key))) return c.text('Not found', 404)
  const id = c.req.param('id')
  if (/^prj_[0-9a-zA-Z]{6,40}$/.test(id)) await deleteProject(c.env.DB, id)
  return c.redirect('/studio', 303)
})

/**
 * One starting document for every surface. A saved document always wins. A new
 * flagship build is born with its own composition, not a generic section stack;
 * every other trade keeps the existing seeded document.
 */
function starterDoc(project: { doc: unknown; spec: Parameters<typeof normalizeDoc>[1] }) {
  if (project.doc) return normalizeDoc(project.doc, project.spec)
  return FLAGSHIP_TRADES.has(project.spec.vertical)
    ? flagshipDocFromSpec(project.spec)
    : docFromSpec(project.spec)
}

app.get('/p/:token/edit', async (c) => {
  const project = await loadProject(c)
  if (!project) return c.html(notFoundPage(), 404)
  if (!(await ownerSession(c, project))) return c.redirect(`/p/${project.token}/dashboard/login`, 303)
  c.header('Cache-Control', 'no-store')
  return c.html(
    editorPage({
      project,
      // An editor session always opens the v2 screen model, even for a build
      // whose saved document predates screens.
      doc: starterDoc(project),
      origin: new URL(c.req.url).origin,
    }),
  )
})

app.get('/p/:token', async (c) => {
  const project = await loadProject(c)
  if (!project) return c.html(notFoundPage(), 404)
  if (!(await ownerSession(c, project))) return c.redirect(`/p/${project.token}/dashboard/login`, 303)
  const [notes, activity] = await Promise.all([
    listNotes(c.env.DB, project.id),
    listActivity(c.env.DB, project.id),
  ])
  return c.html(
    workspacePage({
      project,
      notes,
      activity,
      origin: new URL(c.req.url).origin,
    }),
  )
})

/* ---------------------------- the built app ---------------------------- */

/**
 * A design concept can be reviewed on the real build without saving it: a
 * `concept` query names one of the trade's directions and the optional axes
 * only count alongside it. Nothing persists, a published link without the
 * parameter is untouched, and an unknown direction is ignored rather than
 * guessed.
 */
function conceptPreview(url: URL, vertical: VerticalId) {
  const concept = url.searchParams.get('concept')?.trim() ?? ''
  if (!concept || !directionsFor(vertical).some((entry) => entry.id === concept)) return undefined
  const axis = (name: string) => url.searchParams.get(name)?.trim() || undefined
  const variant = axis('variant')
  const pick = (name: string, allowed: readonly string[]) => {
    const value = axis(name)
    return value && allowed.includes(value) ? { [name]: value } : {}
  }
  return {
    direction: concept,
    ...(variant && /^[0-3]$/.test(variant) ? { variant: Number(variant) } : {}),
    ...pick('density', ['cozy', 'standard', 'roomy']),
    ...pick('corners', ['sharp', 'soft', 'round']),
    ...pick('hero', ['image', 'split', 'centered', 'none']),
    ...pick('order', ['catalog', 'offers', 'visit', 'rewards']),
    ...pick('heroScale', ['compact', 'regular', 'tall', 'immersive']),
  }
}

app.get('/p/:token/app', async (c) => {
  const project = await loadProject(c)
  if (!project) return c.text('Not found', 404)
  const concept = conceptPreview(new URL(c.req.url), project.spec.vertical)
  c.header('Cache-Control', 'no-store')
  c.header('X-Robots-Tag', project.spec.indexable ? 'index, follow' : 'noindex, nofollow')
  const photos = await photosFor(project.spec.vertical, c.env)
  const capability = await paymentCapability(c.env.DB, project)
  return c.html(
    renderApp(project.spec, {
      token: project.token,
      version: project.version,
      slot: project.variationSlot ?? undefined,
      photos,
      noindex: !project.spec.indexable,
      // Published and preview surfaces render the same saved document. The
      // editor bridge is the only difference. A concept review is the one
      // exception: it shows the seeded composition the three designs come from,
      // with the owner's own catalogue, and saves nothing.
      // A concept review renders the real saved document with that direction
      // applied: the concepts are judged on the app they will become.
      doc: starterDoc(project),
      flagship: FLAGSHIP_TRADES.has(project.spec.vertical),
      payments: capability.enabled
        ? { payOrders: capability.payOrders, payBookings: capability.payBookings, provider: capability.provider ?? '' }
        : undefined,
      editor: c.req.query('editor') === '1',
      // A concept is judged on its home screen; the app itself may open on the
      // catalogue, so the review names the screen explicitly.
      screen: concept
        ? 'home'
        : c.req.query('editor') === '1'
          ? c.req.query('screen')?.slice(0, 40)
          : undefined,
      preview: concept,
    }),
  )
})

app.get('/p/:token/media/:mediaId/:file', async (c) => {
  const project = await loadProject(c)
  if (!project) return c.text('Not found', 404)
  const width = Number((c.req.param('file') ?? '').replace('.webp', ''))
  if (!/^\d{2,4}\.webp$/.test(c.req.param('file') ?? '') || !Number.isFinite(width))
    return c.text('Not found', 404)
  if (!c.env.MEDIA) return c.text('Image storage unavailable', 503)
  try {
    const result = await serveMedia(
      c.env.DB,
      c.env.MEDIA as unknown as MediaBucket,
      project.id,
      c.req.param('mediaId'),
      width,
    )
    if (!result || !result.body) return c.text('Not found', 404)
    c.header('Content-Type', 'image/webp')
    c.header('Content-Length', String(result.variant.bytes))
    c.header('Cache-Control', 'private, max-age=31536000, immutable')
    c.header('X-Content-Type-Options', 'nosniff')
    if (result.etag) c.header('ETag', result.etag)
    return c.body(result.body as ReadableStream)
  } catch {
    return c.text('Image storage unavailable', 503)
  }
})

app.get('/p/:token/manifest.webmanifest', async (c) => {
  const project = await loadProject(c)
  if (!project) return c.text('Not found', 404)
  c.header('Content-Type', 'application/manifest+json')
  return c.body(renderManifest(project.spec))
})

app.get('/p/:token/sw.js', async (c) => {
  const project = await loadProject(c)
  if (!project) return c.text('Not found', 404)
  c.header('Content-Type', 'text/javascript; charset=utf-8')
  c.header('Cache-Control', 'no-cache')
  return c.body(renderServiceWorker(project.version))
})

app.get('/p/:token/icon.svg', async (c) => {
  const project = await loadProject(c)
  if (!project) return c.text('Not found', 404)
  c.header('Content-Type', 'image/svg+xml')
  return c.body(renderIcon(project.spec))
})

const DEMOS: Record<
  string,
  { name: string; vertical: VerticalId; accent: string; logo: string; videos?: VideoLink[] }
> = {
  restaurant: { name: 'Trattoria Vela', vertical: 'restaurant', accent: '#c8452b', logo: 'TV' },
  salon: { name: 'Marlow & Co', vertical: 'salon', accent: '#7a4b8f', logo: 'MC' },
  gym: { name: 'Ironworks', vertical: 'gym', accent: '#1f6b52', logo: 'IW' },
  shop: { name: 'Fern & Flint', vertical: 'shop', accent: '#2a5a8f', logo: 'FF' },
  clinic: { name: 'Wellfield Dental', vertical: 'clinic', accent: '#2a5a8f', logo: 'WD' },
  trades: { name: 'Rook Plumbing', vertical: 'trades', accent: '#a8741a', logo: 'RP' },
  hotel: { name: 'Harbour House', vertical: 'hotel', accent: '#1f6b52', logo: 'HH' },
  property: { name: 'Kestrel & Co', vertical: 'property', accent: '#5b3f8f', logo: 'KC' },
  cafe: { name: 'Ember Coffee', vertical: 'cafe', accent: '#8a5a2b', logo: 'EC' },
  professional: { name: 'Cornfield & Co', vertical: 'professional', accent: '#111a24', logo: 'CC' },
  studio: { name: 'Northlight Studio', vertical: 'studio', accent: '#e2522d', logo: 'NS' },
  auto: { name: 'Dock Road Motors', vertical: 'auto', accent: '#2a5a8f', logo: 'DM' },
  hospital: { name: 'St Alder Hospital', vertical: 'hospital', accent: '#0f6b6b', logo: 'SA' },
  ecommerce: { name: 'Harbour Goods', vertical: 'ecommerce', accent: '#b3391f', logo: 'HG' },
  'plants-indoor': { name: 'Leaf & Loom', vertical: 'plants-indoor', accent: '#2f6b3a', logo: 'LL' },
  'plants-outdoor': { name: 'Ridgeway Garden Centre', vertical: 'plants-outdoor', accent: '#4a6b1f', logo: 'RG' },
  courses: { name: 'Northline Academy', vertical: 'courses', accent: '#3f4bd8', logo: 'NA' },
  tuition: { name: 'Bright Room Tuition', vertical: 'tuition', accent: '#a2521f', logo: 'BR' },
  school: { name: 'Fernhill Primary', vertical: 'school', accent: '#1f4f8f', logo: 'FP' },
  kindergarten: { name: 'Little Acorns', vertical: 'kindergarten', accent: '#c2557a', logo: 'LA' },
  finance: { name: 'Meridian Financial', vertical: 'finance', accent: '#145a4a', logo: 'MF' },
  agency: { name: 'Fieldwork Agency', vertical: 'agency', accent: '#b8400f', logo: 'FA' },
  gallery: { name: 'Kiln Lane Gallery', vertical: 'gallery', accent: '#6a4a30', logo: 'KL' },
  marketplace: { name: 'Riverside Market', vertical: 'marketplace', accent: '#d98324', logo: 'RM' },
  influencer: { name: 'Ada West', vertical: 'influencer', accent: '#c72f6b', logo: 'AW' },
  portfolio: { name: 'Noor Haddad', vertical: 'portfolio', accent: '#2b2b2b', logo: 'NH' },
  film: {
    name: 'The Long Way Home',
    vertical: 'film',
    accent: '#b8862b',
    logo: 'LH',
    // Demo-only: a real film project supplies its own trailer links.
    videos: [
      { label: 'Watch the trailer', url: 'https://www.youtube.com/results?search_query=the+long+way+home+film+trailer' },
      { label: 'Behind the scenes', url: 'https://www.youtube.com/results?search_query=the+long+way+home+behind+the+scenes' },
    ],
  },
}

/** The app built from the captured real import shown on the landing page. */
app.get('/proof/app', async (c) => {
  c.header('Cache-Control', 'public, max-age=300')
  const spec = sampleSpec()
  return c.html(renderApp(spec, { token: 'proof-books', live: false, photos: await photosFor(spec.vertical, c.env) }))
})

/**
 * Brief parameters a design preview may carry. A preview is only useful if it
 * is *their* app: the same three concepts must be judged with the owner's name,
 * colour, category and first catalogue rows, not a demo shop's.
 */
function previewMenu(raw: string | undefined): MenuSection[] {
  if (!raw) return []
  const items = raw
    .split(';')
    .slice(0, 12)
    .map((entry) => {
      const [name, price] = entry.split('~')
      const clean = (name ?? '').trim().slice(0, 60)
      if (!clean) return null
      const value = Number(price)
      return {
        name: clean,
        desc: '',
        price: Number.isFinite(value) && value > 0 ? Math.round(value * 100) : 0,
      }
    })
    .filter((item): item is MenuSection['items'][number] => item !== null)
  return items.length ? [{ name: 'Popular', items }] : []
}

app.get('/demo/app', async (c) => {
  const key = c.req.query('biz') ?? 'restaurant'
  const demo = DEMOS[key] ?? DEMOS.restaurant
  const name = (c.req.query('name') ?? '').trim().slice(0, 60)
  const tagline = (c.req.query('tag') ?? '').trim().slice(0, 90)
  const category = (c.req.query('cat') ?? '').trim().slice(0, 40)
  const logo = (c.req.query('logo') ?? '').trim().slice(0, 4)
  const accent = /^#[0-9a-f]{6}$/i.test(c.req.query('accent') ?? '') ? c.req.query('accent')! : ''
  const features = (c.req.query('feat') ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 20)
  const menu = previewMenu(c.req.query('items'))
  const conceptDirection = (c.req.query('direction') || '').trim()
  const direction = directionsFor(demo.vertical).some((entry) => entry.id === conceptDirection)
    ? conceptDirection
    : undefined
  const spec = buildSpec({
    name: name || demo.name,
    vertical: demo.vertical,
    accent: accent || demo.accent,
    logo: logo || demo.logo,
    features,
    ...(direction ? { direction } : {}),
    ...(tagline ? { tagline } : {}),
    ...(category ? { category } : {}),
    ...(menu.length ? { site: { menu } } : {}),
  })
  const photos = await photosFor(demo.vertical, c.env)
  c.header('Cache-Control', 'public, max-age=60')
  // Demo-only overrides, so one variation axis can be looked at on its own.
  // A blank parameter (`?variant=&density=`) is treated as absent, not as a
  // choice: `Number('')` is 0, which would otherwise reset the variant.
  const axis = (name: string) => {
    const value = c.req.query(name)?.trim()
    return value ? value : undefined
  }
  const rawVariant = axis('variant')
  const variant = rawVariant && /^[0-3]$/.test(rawVariant) ? Number(rawVariant) : undefined
  return c.html(
    renderApp(spec, {
      token: `demo-${demo.vertical}`,
      live: false,
      photos,
      // A concept is reviewed on the real document and composition, never on a
      // stripped renderer: the same data, the same blocks, the same CSS.
      ...(direction
        ? { doc: flagshipDocFromSpec(spec), flagship: FLAGSHIP_TRADES.has(demo.vertical) }
        : {}),
      preview: {
        variant,
        density: axis('density'),
        corners: axis('corners'),
        media: axis('media'),
        hero: axis('hero'),
        order: axis('order'),
        heroScale: axis('heroScale'),
        buttons: axis('buttons'),
        cards: axis('cards'),
        preset: axis('preset'),
        direction: axis('direction'),
      },
    }),
  )
})

/* -------------------------------- exports ------------------------------ */

app.get('/p/:token/export/:kind', async (c) => {
  const project = await loadProject(c)
  if (!project) return c.text('Not found', 404)
  const kind = c.req.param('kind')
  if (project.status !== 'approved')
    return c.text('Approve the build before downloading packages.', 403)
  const bytes = bundleFor(project, kind)
  if (!bytes) return c.text('Unknown package', 404)
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${bundleFilename(project, kind)}"`,
      'Cache-Control': 'private, no-store',
    },
  })
})

/* ---------------------------------- api -------------------------------- */

app.get('/api/health', (c) => c.json({ ok: true, service: 'plattr' }))

/**
 * The first step for a non-technical customer: one sentence in, the trade and
 * the features that fit out, plus three structures to choose between. Pure
 * matching, so it costs nothing and cannot fail on a slow upstream.
 */
app.post('/api/prompt', async (c) => {
  const origin = c.req.header('origin')
  if (origin && origin !== new URL(c.req.url).origin)
    return fail(c, 403, 'cross_origin', 'Use the form on the brief page.')
  const type = (c.req.header('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (type !== 'application/json')
    return fail(c, 415, 'unsupported_media_type', 'Send a JSON body.')

  const body = await readJson(c)
  if (!body) return fail(c, 400, 'invalid_json', 'Send a JSON object.')
  const read = readPrompt(body.prompt)
  if (read.prompt.length < 3)
    return fail(c, 422, 'prompt_required', 'Say what the business needs, even roughly.')

  // A concept is the trade's own direction, previewed on the real application
  // route. `designs` stays for the advanced layout override.
  return c.json({ ...read, concepts: conceptsFor(read.vertical), designs: designsFor(read.vertical) })
})

app.post('/api/quote', async (c) => {
  const body = await readJson(c)
  if (!body) return fail(c, 400, 'invalid_json', 'Send a JSON object.')
  const priced = quote({
    features: strings(body.features),
    platforms: strings(body.platforms),
    plan: body.plan === 'monthly' ? 'monthly' : 'onetime',
    bundle: str(body.bundle, 20),
  })
  return c.json({ quote: priced })
})

const importRoute = (mode: 'import' | 'discover') => async (c: Context) => {
  // An import spends outbound requests, so a page on another site may not
  // trigger one. Browsers send Origin on cross-site POSTs; a form post cannot
  // claim application/json without a preflight this endpoint never answers.
  const origin = c.req.header('origin')
  if (origin && origin !== new URL(c.req.url).origin)
    return fail(c, 403, 'cross_origin', 'Imports run from a Plattr page.')
  const type = (c.req.header('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (type !== 'application/json')
    return fail(c, 415, 'unsupported_media_type', 'Send a JSON body.')

  const body = await readJson(c)
  if (!body) return fail(c, 400, 'invalid_json', 'Send a JSON object.')
  try {
    // The crawler's own pre-flight checks, run before anything is spent: a junk
    // link costs neither a rate-limit token nor a unit of the day's allowance.
    const url = checkImportUrl(str(body.url, 300))
    const visitor = await visitorBucket(c.req.header('cf-connecting-ip'))
    // One visitor's curiosity must not close the importer for everyone else.
    throttleImports(`import:${visitor}`)
    if (!(await spendDailyBudget(c.env.DB, `import:${visitor}`, IMPORTS_PER_VISITOR)))
      throw new ImportError(
        'visitor_budget',
        'This connection has used its site reads for today. Fill the brief in by hand and the studio will read the site when you send it.',
        429,
      )
    if ((await spendImportBudget(c.env.DB)) > importCap(c.env))
      throw new ImportError(
        'daily_budget',
        'The live importer has used its reads for today. Fill the brief in by hand and the studio will read the site when you send it.',
        429,
      )
    const report = await importOnce(url.href, (href) =>
      importWebsite(href, fetch, { withHtml: mode === 'discover' }),
    )
    c.header('Cache-Control', 'no-store')
    // The URL-first entry: the same read, answered with what it established,
    // what it could not, and the three documents it would generate. Nothing is
    // written to the database and no customer is asked for a fact just read.
    if (mode === 'discover') {
      const discovery = buildDiscovery({
        report,
        site: report.site,
        source: report.source,
        html: report.entryHtml,
        pagesRead: report.pagesRead,
        pagesFailed: report.pagesFailed,
        usedSitemap: report.usedSitemap,
        clientRendered: report.notes.some((line) => /client-rendered/i.test(line)),
      })
      const plan = discoverPlan(discovery, report.site)
      return c.json({
        source: report.source,
        host: report.host,
        pages: report.pages,
        discovery,
        blockers: plan.blockers,
        confirmations: plan.confirmations,
        concepts: plan.concepts.map((concept) => ({
          id: concept.id,
          name: concept.name,
          note: concept.note,
          spec: concept.spec,
          doc: concept.doc,
        })),
      })
    }
    return c.json({
      site: report.site,
      source: report.source,
      host: report.host,
      pages: report.pages,
      pagesRead: report.pagesRead,
      pagesFailed: report.pagesFailed,
      usedSitemap: report.usedSitemap,
      found: report.found,
      missing: report.missing,
      notes: report.notes,
      images: report.images,
      quality: report.quality,
    })
  } catch (error) {
    if (error instanceof ImportError) {
      if (error.code === 'rate_limited') c.header('Retry-After', '20')
      else if (error.code === 'visitor_budget' || error.code === 'daily_budget')
        c.header('Retry-After', String(secondsUntilReset()))
      return c.json({ error: { code: error.code, message: error.message } }, error.status)
    }
    console.error('plattr_import_error', error)
    return fail(c, 502, 'import_failed', 'That site could not be read. Try again, or fill the brief in by hand.')
  }
}

app.post('/api/import', importRoute('import'))
// The URL-first entry point. Same guards, same budget, same crawl.
app.post('/api/discover', importRoute('discover'))

/* A draft is the unfinished brief: what was read, what was chosen, where the
   visitor stopped. It is keyed only by the unguessable id in its own httpOnly
   cookie, so one visitor can never address another's draft. */
const DRAFT_COOKIE = 'plattr_draft'
const DRAFT_DAYS = 30
const DRAFT_ID = /^drf_[0-9a-zA-Z]{10,64}$/
const DRAFT_MAX_BYTES = 200_000

function draftCookieOptions(url: string) {
  return { path: '/', httpOnly: true, sameSite: 'Lax' as const, secure: isHttps(url), maxAge: DRAFT_DAYS * 86400 }
}

app.get('/api/brief/draft', async (c) => {
  const id = getCookie(c, DRAFT_COOKIE) ?? ''
  c.header('Cache-Control', 'no-store')
  if (!DRAFT_ID.test(id)) return c.json({ draft: null })
  const row = await readBriefDraft(c.env.DB, id)
  // A cookie whose row is gone (expired and pruned, discarded in another tab)
  // is reported so the page can say so, rather than looking like a fresh start.
  if (!row) return c.json({ draft: null, unavailable: true })
  try {
    return c.json({ draft: { data: JSON.parse(row.data), updatedAt: row.updated_at } })
  } catch {
    return c.json({ draft: null, unavailable: true })
  }
})

app.put('/api/brief/draft', async (c) => {
  const origin = c.req.header('origin')
  if (origin && origin !== new URL(c.req.url).origin)
    return fail(c, 403, 'cross_origin', 'Drafts are saved from a Plattr page.')
  const body = await readJson(c)
  if (!body || !body.data || typeof body.data !== 'object')
    return fail(c, 400, 'invalid_json', 'Send the draft as a JSON object.')
  const serialised = JSON.stringify(body.data)
  if (serialised.length > DRAFT_MAX_BYTES)
    return fail(c, 413, 'draft_too_large', 'This draft is too large to keep.')
  const existing = getCookie(c, DRAFT_COOKIE) ?? ''
  const id = DRAFT_ID.test(existing) ? existing : 'drf_' + crypto.randomUUID().replace(/-/g, '')
  await saveBriefDraft(c.env.DB, id, serialised)
  setCookie(c, DRAFT_COOKIE, id, draftCookieOptions(c.req.url))
  c.header('Cache-Control', 'no-store')
  return c.json({ ok: true, updatedAt: new Date().toISOString() })
})

app.delete('/api/brief/draft', async (c) => {
  const origin = c.req.header('origin')
  if (origin && origin !== new URL(c.req.url).origin)
    return fail(c, 403, 'cross_origin', 'Drafts are discarded from a Plattr page.')
  const id = getCookie(c, DRAFT_COOKIE) ?? ''
  if (DRAFT_ID.test(id)) await deleteBriefDraft(c.env.DB, id)
  deleteCookie(c, DRAFT_COOKIE, { path: '/' })
  c.header('Cache-Control', 'no-store')
  return c.json({ ok: true })
})

app.post('/api/projects', async (c) => {
  const body = await readJson(c)
  if (!body) return fail(c, 400, 'invalid_json', 'Send a JSON object.')
  const name = str(body.name, 60)
  if (name.length < 2)
    return fail(c, 422, 'name_required', 'A business name is required.')

  // Public by design, so builds are metered before any row is written: three a
  // day from one connection, forty a day from everyone.
  const visitor = await visitorBucket(c.req.header('cf-connecting-ip'))
  if (!(await spendDailyBudget(c.env.DB, `visitor:${visitor}`, PROJECTS_PER_VISITOR))) {
    c.header('Retry-After', String(secondsUntilReset()))
    return fail(c, 429, 'rate_limited', 'This connection has made its builds for today. Try again tomorrow.')
  }
  if (!(await spendDailyBudget(c.env.DB, 'all', PROJECTS_PER_DAY))) {
    c.header('Retry-After', String(secondsUntilReset()))
    return fail(c, 429, 'daily_budget', 'The studio has made its builds for today. Try again tomorrow.')
  }

  const project = await createProject(c.env.DB, {
    name,
    contact: str(body.contact, 80),
    email: str(body.email, 120),
    vertical: str(body.vertical, 20),
    tagline: str(body.tagline, 90),
    custom: str(body.custom, 600),
    category: str(body.category, 40),
    accent: str(body.accent, 7),
    logo: str(body.logo, 4),
    features: strings(body.features),
    platforms: strings(body.platforms),
    plan: body.plan === 'monthly' ? 'monthly' : 'onetime',
    layout: cleanLayout(body.layout),
    direction: str(body.direction, 24),
    videos: Array.isArray(body.videos) ? (body.videos as VideoLink[]) : undefined,
    bundle: str(body.bundle, 20),
    site: (() => {
      const site = sanitizeImported(body.site)
      return site ? applyPriceDecisions(site) : undefined
    })(),
  })
  // The person who just created the build holds its first owner session; the
  // customer app link alone can never edit it.
  const session = await createOwnerSession(c.env.DB, project.id)
  setCookie(c, ownerCookieName(project.token), session.id, {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure: isHttps(c.req.url),
    maxAge: OWNER_SESSION_DAYS * 24 * 60 * 60,
  })
  await log(c.env.DB, project.id, 'session', 'Build created', 'First owner session created.')

  // The build now holds the price decisions and their evidence, so the draft
  // that produced it is finished. Deleting it means a later restore attempt
  // cannot quietly rebuild or overwrite a project that already exists.
  const usedDraft = getCookie(c, DRAFT_COOKIE) ?? ''
  if (DRAFT_ID.test(usedDraft)) {
    await deleteBriefDraft(c.env.DB, usedDraft)
    deleteCookie(c, DRAFT_COOKIE, { path: '/' })
  }

  return c.json(
    {
      token: project.token,
      url: `/p/${project.token}`,
      preview: `/p/${project.token}/app`,
      version: project.version,
      quote: project.quote,
    },
    201,
  )
})

app.patch('/api/projects/:token', async (c) => {
  const project = await loadProject(c)
  if (!project) return fail(c, 404, 'not_found', 'No build with that link.')
  if (!(await ownerSession(c, project)))
    return fail(c, 401, 'owner_auth_required', 'Sign in with the owner key to edit this build.')
  const body = await readJson(c)
  if (!body) return fail(c, 400, 'invalid_json', 'Send a JSON object.')

  const specInput =
    body.spec && typeof body.spec === 'object' && !Array.isArray(body.spec)
      ? (body.spec as Record<string, unknown>)
      : {}

  const menu = Array.isArray(specInput.menu) ? sanitizeMenu(specInput.menu) : undefined
  if (menu) {
    const foreign = foreignMedia(null, menu, await mediaIdsFor(c.env.DB, project.id))
    if (foreign.length)
      return fail(
        c,
        422,
        'invalid_media_reference',
        'That image belongs to another build. Choose one from this build library.',
      )
  }

  const updated = await saveVersion(c.env.DB, project, {
    name: str(body.name, 60) || undefined,
    accent: str(body.accent, 7) || undefined,
    logo: str(body.logo, 4) || undefined,
    features: body.features === undefined ? undefined : strings(body.features),
    custom: body.custom === undefined ? undefined : str(body.custom, 600),
    spec: {
      ...(typeof specInput.tagline === 'string'
        ? { tagline: str(specInput.tagline, 90) }
        : {}),
      ...(typeof specInput.category === 'string'
        ? { category: str(specInput.category, 40) }
        : {}),
      ...(typeof specInput.hours === 'string' ? { hours: str(specInput.hours, 90) } : {}),
      ...(typeof specInput.address === 'string'
        ? { address: str(specInput.address, 60) }
        : {}),
      ...(typeof specInput.phone === 'string' ? { phone: str(specInput.phone, 24) } : {}),
      ...(typeof specInput.email === 'string' ? { email: str(specInput.email, 80) } : {}),
      ...(menu && menu.length ? { menu } : {}),
    },
  })

  // A saved heading that still reads exactly what the old specification said
  // follows the new one; anything the owner rewrote is left as it is.
  if (updated.doc) {
    const copied = refreshCopiedCopy(starterDoc(updated), project.spec, updated.spec)
    const pruned = pruneEmptySections(copied.doc, updated.spec, updated.token)
    if (copied.changed || pruned.hidden.length || pruned.restored.length)
      await saveDoc(c.env.DB, updated, pruned.doc, { log: false })
  }

  return c.json({ version: updated.version, quote: updated.quote, status: updated.status })
})

/**
 * The editor's document API. Possession of the private token is the credential,
 * exactly as for the review link; a cross-site page cannot send these JSON
 * mutations, and the server normalises every document it stores.
 */
app.get('/api/projects/:token/doc', async (c) => {
  const project = await loadProject(c)
  if (!project) return fail(c, 404, 'not_found', 'No build with that link.')
  c.header('Cache-Control', 'private, no-store')
  return c.json({
    doc: starterDoc(project),
    saved: Boolean(project.doc),
    version: project.version,
  })
})

app.put('/api/projects/:token/doc', async (c) => {
  const origin = c.req.header('origin')
  if (origin && origin !== new URL(c.req.url).origin)
    return fail(c, 403, 'cross_origin', 'Edits are saved from the editor.')
  const type = (c.req.header('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (type !== 'application/json')
    return fail(c, 415, 'unsupported_media_type', 'Send a JSON body.')
  const project = await loadProject(c)
  if (!project) return fail(c, 404, 'not_found', 'No build with that link.')
  const body = await readJson(c)
  if (!body) return fail(c, 400, 'invalid_json', 'Send a JSON object.')
  const doc = normalizeDoc(body.doc, project.spec)
  const foreign = foreignMedia(doc, null, await mediaIdsFor(c.env.DB, project.id))
  if (foreign.length)
    return fail(
      c,
      422,
      'invalid_media_reference',
      'That image belongs to another build. Choose one from this build library.',
    )
  const pruned = pruneEmptySections(doc, project.spec, project.token)
  await saveDoc(c.env.DB, project, pruned.doc)
  c.header('Cache-Control', 'private, no-store')
  return c.json({
    ok: true,
    doc: pruned.doc,
    hidden: pruned.hidden,
    restored: pruned.restored,
    savedAt: new Date().toISOString(),
  })
})

/**
 * Predicts a change without applying it: the editor shows the proposal and only
 * saves it when the owner accepts, so AI edits are as reversible as manual
 * ones.
 */
/**
 * Re-import, step one: read the site again and describe the difference. This
 * endpoint writes nothing, so an owner can look before anything moves.
 */
app.post('/api/projects/:token/import/check', async (c) => {
  const project = await loadProject(c)
  if (!project) return fail(c, 404, 'not_found', 'No build with that link.')
  if (!(await ownerSession(c, project)))
    return fail(c, 401, 'owner_auth_required', 'Sign in with the owner key to update this build.')
  const body = await readJson(c)
  if (!body) return fail(c, 400, 'invalid_json', 'Send a JSON object.')
  try {
    const url = checkImportUrl(str(body.url, 300))
    throttleImports(`reimport:${await visitorBucket(c.req.header('cf-connecting-ip'))}`)
    const report = await importOnce(url.href)
    c.header('Cache-Control', 'no-store')
    return c.json({
      plan: diffCatalogue(project.spec.menu, report.site.menu, url.href),
      quality: report.quality,
      images: report.images,
    })
  } catch (error) {
    if (error instanceof ImportError) return c.json({ error: { code: error.code, message: error.message } }, error.status)
    return fail(c, 502, 'import_failed', 'That site could not be read. Try again later.')
  }
})

/**
 * Re-import, step two: apply only the categories the owner ticked. An
 * unapproved difference is left exactly as the owner last saved it.
 */
app.post('/api/projects/:token/import/apply', async (c) => {
  const project = await loadProject(c)
  if (!project) return fail(c, 404, 'not_found', 'No build with that link.')
  if (!(await ownerSession(c, project)))
    return fail(c, 401, 'owner_auth_required', 'Sign in with the owner key to update this build.')
  const body = await readJson(c)
  if (!body) return fail(c, 400, 'invalid_json', 'Send a JSON object.')
  try {
    const url = checkImportUrl(str(body.url, 300))
    const approval = (body.approval ?? {}) as {
      added?: boolean
      removed?: string[]
      changed?: string[]
    }
    throttleImports(`reimport:${await visitorBucket(c.req.header('cf-connecting-ip'))}`)
    const report = await importOnce(url.href)
    const menu = applyApproval(project.spec.menu, report.site.menu, {
      added: approval.added === true,
      removed: Array.isArray(approval.removed) ? approval.removed.map(String).slice(0, 200) : [],
      changed: Array.isArray(approval.changed) ? approval.changed.map(String).slice(0, 400) : [],
    })
    const foreign = foreignMedia(null, menu, await mediaIdsFor(c.env.DB, project.id))
    if (foreign.length)
      return fail(
        c,
        422,
        'invalid_media_reference',
        'The source refers to an image this build does not own.',
      )
    const updated = await saveVersion(c.env.DB, project, { spec: { menu } })
    if (updated.doc) {
      const copied = refreshCopiedCopy(starterDoc(updated), project.spec, updated.spec)
      const pruned = pruneEmptySections(copied.doc, updated.spec, updated.token)
      if (copied.changed || pruned.hidden.length || pruned.restored.length)
        await saveDoc(c.env.DB, updated, pruned.doc, { log: false })
    }
    await log(c.env.DB, project.id, 'import', 'Catalogue updated', `Re-import applied from ${url.href}`)
    return c.json({ version: updated.version })
  } catch (error) {
    if (error instanceof ImportError) return c.json({ error: { code: error.code, message: error.message } }, error.status)
    return fail(c, 502, 'import_failed', 'That site could not be read. Try again later.')
  }
})

app.post('/api/projects/:token/doc/ai', async (c) => {
  const origin = c.req.header('origin')
  if (origin && origin !== new URL(c.req.url).origin)
    return fail(c, 403, 'cross_origin', 'Ask for changes from the editor.')
  const type = (c.req.header('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (type !== 'application/json')
    return fail(c, 415, 'unsupported_media_type', 'Send a JSON body.')
  const project = await loadProject(c)
  if (!project) return fail(c, 404, 'not_found', 'No build with that link.')
  const body = await readJson(c)
  if (!body) return fail(c, 400, 'invalid_json', 'Send a JSON object.')
  const command = str(body.command, 120)
  if (command.length < 3)
    return fail(c, 422, 'command_required', 'Say what you would like to change.')
  const current = normalizeDoc(body.doc ?? project.doc, project.spec)
  const result = applyCommand(current, command, project.spec)
  c.header('Cache-Control', 'private, no-store')
  return c.json(result)
})

/** Snapshots of the design, newest first. Bodies stay server-side. */
app.get('/api/projects/:token/doc/versions', async (c) => {
  const project = await loadProject(c)
  if (!project) return fail(c, 404, 'not_found', 'No build with that link.')
  c.header('Cache-Control', 'private, no-store')
  return c.json({ versions: await listDocVersions(c.env.DB, project.id) })
})

app.post('/api/projects/:token/doc/versions/:versionId/restore', async (c) => {
  const origin = c.req.header('origin')
  if (origin && origin !== new URL(c.req.url).origin)
    return fail(c, 403, 'cross_origin', 'Edits are restored from the editor.')
  const project = await loadProject(c)
  if (!project) return fail(c, 404, 'not_found', 'No build with that link.')
  const version = await getDocVersion(c.env.DB, project.id, c.req.param('versionId'))
  if (!version) return fail(c, 404, 'version_not_found', 'That saved design no longer exists.')
  // A version can name a photograph deleted since it was saved. Restoring it
  // shows an empty photo block rather than a broken image.
  const pruned = pruneMissingMedia(normalizeDoc(version, project.spec), await mediaIdsFor(c.env.DB, project.id))
  await saveDoc(c.env.DB, project, pruned.doc)
  c.header('Cache-Control', 'private, no-store')
  return c.json({ ok: true, doc: pruned.doc, mediaRemoved: pruned.removed })
})

function mediaFailure(
  c: Parameters<typeof fail>[0],
  error: unknown,
): Response {
  if (error instanceof MediaError)
    return fail(c, error.status as Parameters<typeof fail>[1], error.code, error.message)
  return fail(c, 502, 'storage_failed', 'Image storage is unavailable. Try again in a moment.')
}

app.get('/api/projects/:token/media', async (c) => {
  const project = await loadProject(c)
  if (!project) return fail(c, 404, 'not_found', 'No build with that link.')
  const media = await listMedia(c.env.DB, project.id)
  c.header('Cache-Control', 'private, no-store')
  return c.json({
    media: media.map(mediaView),
    limits: { files: 24, bytes: 40 * 1024 * 1024, maxBytes: 8 * 1024 * 1024 },
    suggestions: mediaSuggestions(project.spec.vertical, project.name),
  })
})

app.post(
  '/api/projects/:token/media',
  bodyLimit({
    maxSize: 18 * 1024 * 1024,
    onError: (c) => fail(c, 413, 'body_too_large', 'That upload is too large. Use an image under 8 MB.'),
  }),
  async (c) => {
    const origin = c.req.header('origin')
    if (origin && origin !== new URL(c.req.url).origin)
      return fail(c, 403, 'cross_origin', 'Images are uploaded from the editor.')
    const project = await loadProject(c)
    if (!project) return fail(c, 404, 'not_found', 'No build with that link.')
    if (!c.env.MEDIA)
      return fail(c, 503, 'media_unavailable', 'Image storage is not configured for this environment.')
    if (!(await publicWriteBudget(c, project.id, 'media', 40))) return rateLimited(c)

    let form: FormData
    try {
      form = await c.req.formData()
    } catch {
      return fail(c, 400, 'invalid_image', 'That upload could not be read.')
    }
    const original = form.get('file')
    if (!original || typeof original === 'string')
      return fail(c, 400, 'invalid_image', 'Choose a JPEG, PNG or WebP image.')
    const variants = form
      .getAll('variant')
      .filter((entry): entry is File => typeof entry !== 'string')

    try {
      const originalBytes = new Uint8Array(await original.arrayBuffer())
      const variantInputs = await Promise.all(
        variants.map(async (entry) => ({ bytes: new Uint8Array(await entry.arrayBuffer()) })),
      )
      const input = {
        original: { bytes: originalBytes, type: original.type, name: original.name },
        variants: variantInputs,
        alt: typeof form.get('alt') === 'string' ? String(form.get('alt')) : '',
        focalX: Number(form.get('focalX') ?? 50),
        focalY: Number(form.get('focalY') ?? 50),
      }
      const replaceId = typeof form.get('replace') === 'string' ? String(form.get('replace')) : ''
      if (replaceId && /^med_[a-f0-9]{16,40}$/.test(replaceId)) {
        const media = await replaceMedia(
          c.env.DB,
          c.env.MEDIA as unknown as MediaBucket,
          project,
          replaceId,
          input,
        )
        c.header('Cache-Control', 'private, no-store')
        return c.json({ media: mediaView(media), existing: false, replaced: true }, 200)
      }
      const result = await uploadMedia(
        c.env.DB,
        c.env.MEDIA as unknown as MediaBucket,
        project,
        input,
      )
      c.header('Cache-Control', 'private, no-store')
      return c.json({ media: mediaView(result.media), existing: result.existing }, result.existing ? 200 : 201)
    } catch (error) {
      return mediaFailure(c, error)
    }
  },
)

/**
 * Stage A (`dryRun` is the default) reports unused uploads; stage B deletes
 * them once an operator has confirmed and named a verified backup. The route
 * is inside the owner-auth middleware, and the same-origin check keeps a
 * cross-site form from starting a cleanup.
 */
app.post('/api/projects/:token/media/cleanup', async (c) => {
  const origin = c.req.header('origin')
  if (origin && origin !== new URL(c.req.url).origin)
    return fail(c, 403, 'cross_origin', 'Images are cleaned up from the studio.')
  const project = await loadProject(c)
  if (!project) return fail(c, 404, 'not_found', 'No build with that link.')
  const body = (await readJson(c)) ?? {}
  const dryRun = body.dryRun !== false
  const graceHours = clampGraceHours(body.graceHours)
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((id): id is string => typeof id === 'string' && /^med_[a-f0-9]{16,40}$/.test(id))
    : undefined

  try {
    if (dryRun) {
      const report = await planMediaCleanup(c.env.DB, project, { graceHours })
      c.header('Cache-Control', 'private, no-store')
      return c.json({ ok: true, dryRun: true, report })
    }
    if (body.confirm !== true)
      return fail(c, 400, 'confirmation_required', 'Send confirm: true to delete unused images.')
    if (!c.env.MEDIA)
      return fail(c, 503, 'media_unavailable', 'Image storage is not configured for this environment.')
    const outcome = await executeMediaCleanup(
      c.env.DB,
      c.env.MEDIA as unknown as MediaBucket,
      project,
      { backupId: str(body.backupId, 200), ids, graceHours },
    )
    c.header('Cache-Control', 'private, no-store')
    return c.json({ ok: true, ...outcome })
  } catch (error) {
    if (error instanceof MediaCleanupError)
      return fail(c, error.status as Parameters<typeof fail>[1], error.code, error.message)
    return mediaFailure(c, error)
  }
})

app.get('/api/projects/:token/media/cleanup', async (c) => {
  const project = await loadProject(c)
  if (!project) return fail(c, 404, 'not_found', 'No build with that link.')
  const log = await listMediaCleanupLog(c.env.DB, project.id, 50)
  c.header('Cache-Control', 'private, no-store')
  return c.json({ log })
})

app.delete('/api/projects/:token/media/:mediaId', async (c) => {
  const origin = c.req.header('origin')
  if (origin && origin !== new URL(c.req.url).origin)
    return fail(c, 403, 'cross_origin', 'Images are deleted from the editor.')
  const project = await loadProject(c)
  if (!project) return fail(c, 404, 'not_found', 'No build with that link.')
  if (!c.env.MEDIA)
    return fail(c, 503, 'media_unavailable', 'Image storage is not configured for this environment.')
  try {
    await deleteMedia(
      c.env.DB,
      c.env.MEDIA as unknown as MediaBucket,
      project,
      c.req.param('mediaId'),
    )
    return c.json({ ok: true })
  } catch (error) {
    return mediaFailure(c, error)
  }
})

async function publicWriteBudget(c: Context<{ Bindings: Bindings }>, projectId: string, kind: string, limit: number): Promise<boolean> {
  const visitor = await visitorBucket(c.req.header('cf-connecting-ip'))
  return spendDailyBudget(c.env.DB, `${kind}:${projectId}:${visitor}`, limit)
}

function rateLimited(c: Context): Response {
  c.header('Retry-After', '3600')
  return fail(c, 429, 'rate_limited', 'Too many requests from this device. Please try again later.')
}

function businessFailure(c: Context, error: unknown): Response {
  if (error instanceof BusinessError)
    return c.json({ error: { code: error.code, message: error.message } }, error.status)
  console.error('plattr_business_error', error)
  return c.json({ error: { code: 'internal_error', message: 'That could not be saved. Try again.' } }, 500)
}

function paymentFailure(c: Context, error: unknown): Response {
  if (error instanceof PaymentError)
    return c.json({ error: { code: error.code, message: error.message } }, error.status)
  console.error('plattr_payment_error', error instanceof Error ? error.message : 'unknown')
  return c.json({ error: { code: 'payment_error', message: 'The payment request could not be completed.' } }, 500)
}

function providerParam(c: Context): ProviderId | null {
  const value = c.req.param('provider')
  return isProvider(value) ? value : null
}

/** Customer app writes. Branded JSON only, no payment details, no client prices. */
app.post(
  '/p/:token/orders',
  bodyLimit({ maxSize: 64 * 1024, onError: (c) => fail(c, 413, 'body_too_large', 'That order is too large.') }),
  async (c) => {
    const origin = c.req.header('origin')
    if (origin && origin !== new URL(c.req.url).origin)
      return fail(c, 403, 'cross_origin', 'Orders are placed from the customer app.')
    const project = await loadProject(c)
    if (!project) return fail(c, 404, 'not_found', 'No app with that link.')
    if (!(await publicWriteBudget(c, project.id, 'order', 30))) return rateLimited(c)
    const body = await readJson(c)
    if (!body) return fail(c, 400, 'invalid_json', 'Send a JSON object.')
    try {
      const order = await createOrder(c.env.DB, project, body)
      c.header('Cache-Control', 'private, no-store')
      return c.json({ order: { id: order.id, number: order.number, status: order.status, total: order.total, createdAt: order.createdAt } }, 201)
    } catch (error) {
      return businessFailure(c, error)
    }
  },
)

app.get('/p/:token/orders/:orderId', async (c) => {
  const project = await loadProject(c)
  if (!project) return c.json({ error: { code: 'not_found', message: 'No app with that link.' } }, 404)
  const order = await getOrder(c.env.DB, project.id, c.req.param('orderId'))
  if (!order) return c.json({ error: { code: 'not_found', message: 'That order could not be found.' } }, 404)
  c.header('Cache-Control', 'private, no-store')
  return c.json({
    order: {
      id: order.id,
      number: order.number,
      status: order.status,
      fulfilment: order.fulfilment,
      total: order.total,
      items: order.items.map((item) => ({ name: item.name, qty: item.qty })),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    },
  })
})

app.post(
  '/p/:token/bookings',
  bodyLimit({ maxSize: 64 * 1024, onError: (c) => fail(c, 413, 'body_too_large', 'That booking is too large.') }),
  async (c) => {
    const origin = c.req.header('origin')
    if (origin && origin !== new URL(c.req.url).origin)
      return fail(c, 403, 'cross_origin', 'Bookings are requested from the customer app.')
    const project = await loadProject(c)
    if (!project) return fail(c, 404, 'not_found', 'No app with that link.')
    if (!(await publicWriteBudget(c, project.id, 'booking', 15))) return rateLimited(c)
    const body = await readJson(c)
    if (!body) return fail(c, 400, 'invalid_json', 'Send a JSON object.')
    try {
      const booking = await createBooking(c.env.DB, project, body)
      c.header('Cache-Control', 'private, no-store')
      return c.json({ booking: { id: booking.id, number: booking.number, status: booking.status, date: booking.date, slot: booking.slot } }, 201)
    } catch (error) {
      return businessFailure(c, error)
    }
  },
)

app.get('/p/:token/bookings/:bookingId', async (c) => {
  const project = await loadProject(c)
  if (!project) return c.json({ error: { code: 'not_found', message: 'No app with that link.' } }, 404)
  const booking = await getBooking(c.env.DB, project.id, c.req.param('bookingId'))
  if (!booking) return c.json({ error: { code: 'not_found', message: 'That booking could not be found.' } }, 404)
  c.header('Cache-Control', 'private, no-store')
  return c.json({ booking: { id: booking.id, number: booking.number, status: booking.status, date: booking.date, slot: booking.slot, party: booking.party, service: booking.service } })
})

app.post(
  '/p/:token/enquiries',
  bodyLimit({ maxSize: 64 * 1024, onError: (c) => fail(c, 413, 'body_too_large', 'That enquiry is too large.') }),
  async (c) => {
    const origin = c.req.header('origin')
    if (origin && origin !== new URL(c.req.url).origin)
      return fail(c, 403, 'cross_origin', 'Enquiries are sent from the customer app.')
    const project = await loadProject(c)
    if (!project) return fail(c, 404, 'not_found', 'No app with that link.')
    if (!(await publicWriteBudget(c, project.id, 'enquiry', 10))) return rateLimited(c)
    const body = await readJson(c)
    if (!body) return fail(c, 400, 'invalid_json', 'Send a JSON object.')
    try {
      const enquiry = await createEnquiry(c.env.DB, project, body)
      c.header('Cache-Control', 'private, no-store')
      return c.json({ enquiry: { id: enquiry.id, status: enquiry.status } }, 201)
    } catch (error) {
      return businessFailure(c, error)
    }
  },
)

/* ------------------------------ payments ------------------------------ */

// Creates a gateway order/session for an existing order or booking. The body
// names the record; the amount is always read from D1 or the owner catalogue.
app.post(
  '/p/:token/payments/start',
  bodyLimit({ maxSize: 8 * 1024, onError: (c) => fail(c, 413, 'body_too_large', 'That payment request is too large.') }),
  async (c) => {
    const origin = c.req.header('origin')
    if (origin && origin !== new URL(c.req.url).origin)
      return fail(c, 403, 'cross_origin', 'Start payments from the customer app.')
    const project = await loadProject(c)
    if (!project) return fail(c, 404, 'not_found', 'No app with that link.')
    if (!(await publicWriteBudget(c, project.id, 'payment', 20))) return rateLimited(c)
    const body = await readJson(c)
    if (!body) return fail(c, 400, 'invalid_json', 'Send a JSON object.')
    try {
      const payment = await startCheckout(c.env.DB, project, c.env, new URL(c.req.url).origin, body)
      c.header('Cache-Control', 'private, no-store')
      return c.json({ payment })
    } catch (error) {
      return paymentFailure(c, error)
    }
  },
)

// Razorpay's checkout returns a signed payment response. The signature proves
// the response came from the checkout for this order; the service then checks
// the captured status and amount with the Razorpay API before marking it paid.
app.post(
  '/p/:token/payments/razorpay/verify',
  bodyLimit({ maxSize: 16 * 1024, onError: (c) => fail(c, 413, 'body_too_large', 'That verification is too large.') }),
  async (c) => {
    const origin = c.req.header('origin')
    if (origin && origin !== new URL(c.req.url).origin)
      return fail(c, 403, 'cross_origin', 'Verify payments from the payment page.')
    const project = await loadProject(c)
    if (!project) return fail(c, 404, 'not_found', 'No app with that link.')
    const body = await readJson(c)
    if (!body) return fail(c, 400, 'invalid_json', 'Send a JSON object.')
    try {
      const payment = await verifyRazorpayCheckout(c.env.DB, project, c.env, body)
      c.header('Cache-Control', 'private, no-store')
      return c.json({
        payment: {
          id: payment.id,
          status: payment.status,
          amount: payment.amount,
          currency: payment.currency,
          provider: payment.provider,
        },
      })
    } catch (error) {
      return paymentFailure(c, error)
    }
  },
)

app.get('/p/:token/pay/:transactionId', async (c) => {
  const project = await loadProject(c)
  if (!project) return c.text('Not found', 404)
  const presentation = await checkoutPresentation(c.env.DB, project, c.req.param('transactionId'))
  if (!presentation) return c.html(paymentMissingPage(project), 404)
  c.header('Cache-Control', 'private, no-store')
  c.header('X-Robots-Tag', 'noindex, nofollow')
  if (presentation.transaction.provider === 'stripe' && presentation.transaction.status === 'pending') {
    const row = await c.env.DB.prepare(
      'SELECT checkout_url FROM payment_transactions WHERE id = ? AND project_id = ?',
    )
      .bind(presentation.transaction.id, project.id)
      .first<{ checkout_url: string }>()
    if (row?.checkout_url) return c.redirect(row.checkout_url, 303)
  }
  return c.html(
    paymentPage({ project, transaction: presentation.transaction, razorpay: presentation.razorpay }),
  )
})

app.get('/p/:token/payment/:transactionId', async (c) => {
  const project = await loadProject(c)
  if (!project) return c.text('Not found', 404)
  const id = c.req.param('transactionId')
  await refreshTransaction(c.env.DB, project, c.env, id).catch(() => null)
  const presentation = await checkoutPresentation(c.env.DB, project, id)
  if (!presentation) return c.html(paymentMissingPage(project), 404)
  c.header('Cache-Control', 'private, no-store')
  c.header('X-Robots-Tag', 'noindex, nofollow')
  return c.html(paymentPage({ project, transaction: presentation.transaction }))
})

// Provider-to-provider webhook. The signature is verified before the payload
// is trusted; event ids make duplicate delivery harmless.
app.post(
  '/p/:token/payments/webhook/:provider',
  bodyLimit({ maxSize: 128 * 1024, onError: (c) => fail(c, 413, 'body_too_large', 'That webhook is too large.') }),
  async (c) => {
    const project = await loadProject(c)
    if (!project) return fail(c, 404, 'not_found', 'No app with that link.')
    const provider = providerParam(c)
    if (!provider) return fail(c, 404, 'provider_unknown', 'Unknown payment provider.')
    const rawBody = await c.req.text()
    try {
      const result = await handleWebhook(c.env.DB, project, c.env, provider, rawBody, c.req.raw.headers)
      c.header('Cache-Control', 'no-store')
      return c.json({ ok: true, ...result })
    } catch (error) {
      return paymentFailure(c, error)
    }
  },
)

app.get('/p/:token/dashboard', async (c) => {
  const project = await loadProject(c)
  if (!project) return c.html(notFoundPage(), 404)
  if (!(await ownerSession(c, project)))
    return c.redirect(`/p/${project.token}/dashboard/login`, 303)
  const data = await dashboardData(c.env.DB, project)
  const origin = new URL(c.req.url).origin
  const payments = await paymentDashboard(c.env.DB, project, origin)
  c.header('Cache-Control', 'private, no-store')
  return c.html(dashboardPage({ project, data, origin, payments }))
})

app.get('/p/:token/dashboard/login', async (c) => {
  const project = await loadProject(c)
  if (!project) return c.html(notFoundPage(), 404)
  if (await ownerSession(c, project)) return c.redirect(`/p/${project.token}/dashboard`, 303)
  c.header('Cache-Control', 'private, no-store')
  return c.html(ownerLoginPage({ project, configured: Boolean(ownerSecret(c.env)) }))
})

app.post('/p/:token/dashboard/login', async (c) => {
  const project = await loadProject(c)
  if (!project) return c.html(notFoundPage(), 404)
  c.header('Cache-Control', 'no-store')
  const secret = ownerSecret(c.env)
  if (!secret) return c.html(ownerLoginPage({ project, configured: false }), 503)
  const visitor = await visitorBucket(c.req.header('cf-connecting-ip'))
  if (!(await spendDailyBudget(c.env.DB, `owner-login:${project.id}:${visitor}`, 10)))
    return c.html(ownerLoginPage({ project, configured: true, blocked: true }), 429)
  const body = await c.req.parseBody()
  const given = typeof body.key === 'string' ? body.key.trim() : ''
  if (!(await matchesOwnerKey(given, project.token, secret)))
    return c.html(ownerLoginPage({ project, configured: true, wrong: true }), 401)
  const session = await createOwnerSession(c.env.DB, project.id)
  await log(c.env.DB, project.id, 'session', 'Owner signed in', 'Dashboard session created.')
  setCookie(c, ownerCookieName(project.token), session.id, {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure: isHttps(c.req.url),
    maxAge: OWNER_SESSION_DAYS * 24 * 60 * 60,
  })
  return c.redirect(`/p/${project.token}/dashboard`, 303)
})

app.post('/p/:token/dashboard/logout', async (c) => {
  const project = await loadProject(c)
  if (!project) return c.redirect('/', 303)
  const name = ownerCookieName(project.token)
  if (await ownerSession(c, project)) await log(c.env.DB, project.id, 'session', 'Owner signed out', 'This browser session ended.')
  await deleteOwnerSession(c.env.DB, getCookie(c, name))
  deleteCookie(c, name, { path: '/', secure: isHttps(c.req.url) })
  return c.redirect(`/p/${project.token}/dashboard/login`, 303)
})

app.post('/p/:token/dashboard/logout-all', async (c) => {
  const origin = c.req.header('origin')
  if (origin && origin !== new URL(c.req.url).origin) return fail(c, 403, 'cross_origin', 'Sign out from the dashboard.')
  const project = await loadProject(c)
  if (!project) return c.redirect('/', 303)
  const name = ownerCookieName(project.token)
  if (await ownerSession(c, project)) {
    await deleteOwnerSessions(c.env.DB, project.id)
    await log(c.env.DB, project.id, 'session', 'Signed out everywhere', 'Every owner session was revoked.')
  }
  deleteCookie(c, name, { path: '/', secure: isHttps(c.req.url) })
  return c.redirect(`/p/${project.token}/dashboard/login`, 303)
})

app.get('/api/projects/:token/dashboard', async (c) => {
  const project = await loadProject(c)
  if (!project) return fail(c, 404, 'not_found', 'No build with that link.')
  if (!(await ownerSession(c, project)))
    return fail(c, 401, 'owner_auth_required', 'Sign in with the owner key to open this dashboard.')
  c.header('Cache-Control', 'private, no-store')
  return c.json({
    ...(await dashboardData(c.env.DB, project)),
    payments: await paymentDashboard(c.env.DB, project, new URL(c.req.url).origin),
  })
})

app.patch('/api/projects/:token/orders/:orderId', async (c) => {
  const origin = c.req.header('origin')
  if (origin && origin !== new URL(c.req.url).origin) return fail(c, 403, 'cross_origin', 'Update orders from the dashboard.')
  const project = await loadProject(c)
  if (!project) return fail(c, 404, 'not_found', 'No build with that link.')
  if (!(await ownerSession(c, project)))
    return fail(c, 401, 'owner_auth_required', 'Sign in with the owner key to update orders.')
  const body = await readJson(c)
  if (!body) return fail(c, 400, 'invalid_json', 'Send a JSON object.')
  try {
    const order = await updateOrderStatus(c.env.DB, project.id, c.req.param('orderId'), str(body.status, 20))
    await log(c.env.DB, project.id, 'order', `Order ${order.status}`, order.id)
    c.header('Cache-Control', 'private, no-store')
    return c.json({ order: { id: order.id, status: order.status, updatedAt: order.updatedAt } })
  } catch (error) {
    return businessFailure(c, error)
  }
})

app.patch('/api/projects/:token/bookings/:bookingId', async (c) => {
  const origin = c.req.header('origin')
  if (origin && origin !== new URL(c.req.url).origin) return fail(c, 403, 'cross_origin', 'Update bookings from the dashboard.')
  const project = await loadProject(c)
  if (!project) return fail(c, 404, 'not_found', 'No build with that link.')
  if (!(await ownerSession(c, project)))
    return fail(c, 401, 'owner_auth_required', 'Sign in with the owner key to update bookings.')
  const body = await readJson(c)
  if (!body) return fail(c, 400, 'invalid_json', 'Send a JSON object.')
  try {
    const booking = await updateBookingStatus(c.env.DB, project.id, c.req.param('bookingId'), str(body.status, 20))
    await log(c.env.DB, project.id, 'booking', `Booking ${booking.status}`, booking.id)
    c.header('Cache-Control', 'private, no-store')
    return c.json({ booking: { id: booking.id, status: booking.status, updatedAt: booking.updatedAt } })
  } catch (error) {
    return businessFailure(c, error)
  }
})

app.patch('/api/projects/:token/enquiries/:enquiryId', async (c) => {
  const origin = c.req.header('origin')
  if (origin && origin !== new URL(c.req.url).origin) return fail(c, 403, 'cross_origin', 'Update enquiries from the dashboard.')
  const project = await loadProject(c)
  if (!project) return fail(c, 404, 'not_found', 'No build with that link.')
  if (!(await ownerSession(c, project)))
    return fail(c, 401, 'owner_auth_required', 'Sign in with the owner key to update enquiries.')
  const body = await readJson(c)
  if (!body) return fail(c, 400, 'invalid_json', 'Send a JSON object.')
  try {
    const enquiry = await updateEnquiryStatus(c.env.DB, project.id, c.req.param('enquiryId'), str(body.status, 20))
    await log(c.env.DB, project.id, 'enquiry', `Enquiry ${enquiry.status}`, enquiry.id)
    c.header('Cache-Control', 'private, no-store')
    return c.json({ enquiry: { id: enquiry.id, status: enquiry.status } })
  } catch (error) {
    return businessFailure(c, error)
  }
})

/** Owner-facing content settings that do not create a new design version. */
app.put('/api/projects/:token/app-settings', async (c) => {
  const origin = c.req.header('origin')
  if (origin && origin !== new URL(c.req.url).origin) return fail(c, 403, 'cross_origin', 'Settings are saved from the dashboard.')
  const type = (c.req.header('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (type !== 'application/json') return fail(c, 415, 'unsupported_media_type', 'Send a JSON body.')
  const project = await loadProject(c)
  if (!project) return fail(c, 404, 'not_found', 'No build with that link.')
  if (!(await ownerSession(c, project)))
    return fail(c, 401, 'owner_auth_required', 'Sign in with the owner key to change app settings.')
  const body = await readJson(c)
  if (!body) return fail(c, 400, 'invalid_json', 'Send a JSON object.')
  const name = str(body.name, 60) || project.name
  if (name.length < 2) return fail(c, 422, 'name_required', 'Add the business name.')
  const accent = sanitizeHex(body.accent, project.accent)
  const logo = name === project.name ? project.logo : initialsFor(name)
  const phone = str(body.phone, 24) || project.spec.phone
  const email = str(body.email, 80) || project.spec.email
  const address = str(body.address, 60) || project.spec.address
  const hours = str(body.hours, 90) || project.spec.hours
  const tagline = str(body.tagline, 90) || project.spec.tagline
  const story = str(body.story, 600) || project.spec.story
  const team =
    body.team === undefined
      ? project.spec.team ?? []
      : str(body.team, 2400)
          .split('\n')
          .map((line) => line.split('|').map((part) => part.trim().slice(0, 60)))
          .filter((parts) => parts[0])
          .slice(0, 8)
          .map((parts) => ({ name: parts[0], role: parts[1] || '', ...(parts[2] ? { credential: parts[2] } : {}) }))
  const staff =
    body.staff === undefined
      ? team.length
        ? team.map((person) => person.name)
        : project.spec.staff ?? []
      : str(body.staff, 500)
          .split(',')
          .map((person) => person.trim().slice(0, 40))
          .filter(Boolean)
          .slice(0, 12)
  const spec = {
    ...project.spec,
    name,
    tagline,
    story,
    hours,
    address,
    phone,
    email,
    accent,
    logo,
    category: str(body.category, 40) || project.spec.category,
    staff,
    team,
    indexable:
      body.indexable === undefined
        ? project.spec.indexable === true
        : body.indexable === true || body.indexable === 'on',
  }
  const sample = {
    menu: false,
    contact: false,
    story: false,
    offers: false,
    ...(project.spec.sampleContent ?? {}),
  }
  if (phone !== project.spec.phone || email !== project.spec.email || address !== project.spec.address || hours !== project.spec.hours) sample.contact = false
  if (tagline !== project.spec.tagline) sample.tagline = false
  if (story !== project.spec.story) sample.story = false
  if (JSON.stringify(staff) !== JSON.stringify(project.spec.staff ?? [])) sample.team = sample.staff = false
  if (JSON.stringify(team) !== JSON.stringify(project.spec.team ?? [])) sample.team = false
  spec.sampleContent = sample
  await c.env.DB
    .prepare('UPDATE projects SET name = ?, spec = ?, accent = ?, logo = ?, updated_at = ? WHERE id = ?')
    .bind(name, JSON.stringify(spec), accent, logo, new Date().toISOString(), project.id)
    .run()
  await log(c.env.DB, project.id, 'settings', 'Business details updated', name)
  // Adding coaches, hours or a story is exactly what an auto-hidden section was
  // waiting for, so the document is reconciled here rather than at the next
  // editor visit.
  let sections = { hidden: [] as string[], restored: [] as string[] }
  if (project.doc)
    sections = await reconcileDoc(c.env.DB, project, project.doc, spec as AppSpec)
  c.header('Cache-Control', 'private, no-store')
  return c.json({ ok: true, spec, ...sections })
})

/* --------------------------- owner payments --------------------------- */

app.get('/api/projects/:token/payments', async (c) => {
  const project = await loadProject(c)
  if (!project) return fail(c, 404, 'not_found', 'No build with that link.')
  if (!(await ownerSession(c, project)))
    return fail(c, 401, 'owner_auth_required', 'Sign in with the owner key to see payments.')
  c.header('Cache-Control', 'private, no-store')
  return c.json(await paymentDashboard(c.env.DB, project, new URL(c.req.url).origin))
})

app.put('/api/projects/:token/payments/settings', async (c) => {
  const origin = c.req.header('origin')
  if (origin && origin !== new URL(c.req.url).origin)
    return fail(c, 403, 'cross_origin', 'Save payment settings from the dashboard.')
  const project = await loadProject(c)
  if (!project) return fail(c, 404, 'not_found', 'No build with that link.')
  if (!(await ownerSession(c, project)))
    return fail(c, 401, 'owner_auth_required', 'Sign in with the owner key to change payment settings.')
  const body = await readJson(c)
  if (!body) return fail(c, 400, 'invalid_json', 'Send a JSON object.')
  try {
    const settings = await savePaymentSettings(c.env.DB, project, body)
    c.header('Cache-Control', 'private, no-store')
    return c.json({ settings })
  } catch (error) {
    return paymentFailure(c, error)
  }
})

app.put(
  '/api/projects/:token/payments/connections/:provider',
  bodyLimit({ maxSize: 16 * 1024, onError: (c) => fail(c, 413, 'body_too_large', 'That configuration is too large.') }),
  async (c) => {
    const origin = c.req.header('origin')
    if (origin && origin !== new URL(c.req.url).origin)
      return fail(c, 403, 'cross_origin', 'Save gateway settings from the dashboard.')
    const project = await loadProject(c)
    if (!project) return fail(c, 404, 'not_found', 'No build with that link.')
    if (!(await ownerSession(c, project)))
      return fail(c, 401, 'owner_auth_required', 'Sign in with the owner key to connect a gateway.')
    const provider = providerParam(c)
    if (!provider) return fail(c, 404, 'provider_unknown', 'Unknown payment provider.')
    const body = await readJson(c)
    if (!body) return fail(c, 400, 'invalid_json', 'Send a JSON object.')
    try {
      const connection = await saveConnection(c.env.DB, project, c.env, provider, body, new URL(c.req.url).origin)
      c.header('Cache-Control', 'private, no-store')
      return c.json({ connection })
    } catch (error) {
      return paymentFailure(c, error)
    }
  },
)

app.post('/api/projects/:token/payments/connections/:provider/test', async (c) => {
  const origin = c.req.header('origin')
  if (origin && origin !== new URL(c.req.url).origin)
    return fail(c, 403, 'cross_origin', 'Test gateways from the dashboard.')
  const project = await loadProject(c)
  if (!project) return fail(c, 404, 'not_found', 'No build with that link.')
  if (!(await ownerSession(c, project)))
    return fail(c, 401, 'owner_auth_required', 'Sign in with the owner key to test a gateway.')
  const provider = providerParam(c)
  if (!provider) return fail(c, 404, 'provider_unknown', 'Unknown payment provider.')
  if (!(await spendDailyBudget(c.env.DB, `payment-test:${project.id}`, 30)))
    return fail(c, 429, 'rate_limited', 'Too many gateway tests today. Try again tomorrow.')
  try {
    const result = await testConnection(
      c.env.DB,
      project,
      c.env,
      provider,
      fetch,
      new URL(c.req.url).origin,
    )
    c.header('Cache-Control', 'private, no-store')
    return c.json(result)
  } catch (error) {
    return paymentFailure(c, error)
  }
})

app.delete('/api/projects/:token/payments/connections/:provider', async (c) => {
  const origin = c.req.header('origin')
  if (origin && origin !== new URL(c.req.url).origin)
    return fail(c, 403, 'cross_origin', 'Disconnect gateways from the dashboard.')
  const project = await loadProject(c)
  if (!project) return fail(c, 404, 'not_found', 'No build with that link.')
  if (!(await ownerSession(c, project)))
    return fail(c, 401, 'owner_auth_required', 'Sign in with the owner key to disconnect a gateway.')
  const provider = providerParam(c)
  if (!provider) return fail(c, 404, 'provider_unknown', 'Unknown payment provider.')
  try {
    await disconnectConnection(c.env.DB, project, provider)
    c.header('Cache-Control', 'private, no-store')
    return c.json({ ok: true })
  } catch (error) {
    return paymentFailure(c, error)
  }
})

app.post('/api/projects/:token/payments/transactions/:transactionId/refund', async (c) => {
  const origin = c.req.header('origin')
  if (origin && origin !== new URL(c.req.url).origin)
    return fail(c, 403, 'cross_origin', 'Refund from the dashboard.')
  const project = await loadProject(c)
  if (!project) return fail(c, 404, 'not_found', 'No build with that link.')
  if (!(await ownerSession(c, project)))
    return fail(c, 401, 'owner_auth_required', 'Sign in with the owner key to refund a payment.')
  try {
    const payment = await refundTransaction(c.env.DB, project, c.env, c.req.param('transactionId'))
    c.header('Cache-Control', 'private, no-store')
    return c.json({ payment })
  } catch (error) {
    return paymentFailure(c, error)
  }
})

/**
 * Removes only the groups still flagged as Plattr's sample content. Anything
 * the owner has saved as their own (a catalogue save clears its flag, edited
 * settings clear theirs) is left untouched, so this cannot silently replace
 * work the owner has done. The explicit confirmation is checked server-side as
 * well as in the dashboard.
 */
app.post('/api/projects/:token/personalise/clear-samples', async (c) => {
  const origin = c.req.header('origin')
  if (origin && origin !== new URL(c.req.url).origin) return fail(c, 403, 'cross_origin', 'Remove sample content from the dashboard.')
  const type = (c.req.header('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (type !== 'application/json') return fail(c, 415, 'unsupported_media_type', 'Send a JSON body.')
  const project = await loadProject(c)
  if (!project) return fail(c, 404, 'not_found', 'No build with that link.')
  if (!(await ownerSession(c, project)))
    return fail(c, 401, 'owner_auth_required', 'Sign in with the owner key to change the business details.')
  const body = await readJson(c)
  if (!body) return fail(c, 400, 'invalid_json', 'Send a JSON object.')
  if (body.confirm !== 'remove-sample-content')
    return fail(c, 422, 'confirmation_required', 'Confirm that you want to remove the remaining sample content.')
  const before = project.spec.sampleContent ?? { menu: false, contact: false, story: false, offers: false }
  const spec = { ...project.spec }
  if (before.menu) spec.menu = []
  if (before.offers) spec.offers = []
  if (before.story) spec.story = ''
  if (before.tagline) spec.tagline = ''
  if (before.team) spec.staff = []
  if (Array.isArray(spec.team)) spec.team = []
  if (before.contact) {
    spec.phone = ''
    spec.email = ''
    spec.address = ''
    spec.hours = ''
  }
  spec.sampleContent = { menu: false, contact: false, story: false, offers: false, team: false, tagline: false }
  await c.env.DB
    .prepare('UPDATE projects SET spec = ?, updated_at = ? WHERE id = ?')
    .bind(JSON.stringify(spec), new Date().toISOString(), project.id)
    .run()
  await log(c.env.DB, project.id, 'content', 'Sample content removed', 'Only groups still marked as examples were cleared.')
  c.header('Cache-Control', 'private, no-store')
  return c.json({ ok: true, spec })
})

async function saveCatalogHandler(c: Context<{ Bindings: Bindings }, '/api/projects/:token/catalog'>) {
  const origin = c.req.header('origin')
  if (origin && origin !== new URL(c.req.url).origin)
    return fail(c, 403, 'cross_origin', 'Catalogue edits are saved from an owner surface.')
  const type = (c.req.header('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (type !== 'application/json') return fail(c, 415, 'unsupported_media_type', 'Send a JSON body.')
  const project = await loadProject(c)
  if (!project) return fail(c, 404, 'not_found', 'No build with that link.')
  const body = await readJson(c)
  if (!body) return fail(c, 400, 'invalid_json', 'Send a JSON object.')
  const menu = Array.isArray(body.menu) ? sanitizeMenu(body.menu) : project.spec.menu
  const foreign = foreignMedia(null, menu, await mediaIdsFor(c.env.DB, project.id))
  if (foreign.length)
    return fail(
      c,
      422,
      'invalid_media_reference',
      'That image belongs to another build. Choose one from this build library.',
    )
  const offers = Array.isArray(body.offers)
    ? body.offers
        .slice(0, 8)
        .map((entry) => ({
          title: str((entry as Record<string, unknown>)?.title, 60),
          body: str((entry as Record<string, unknown>)?.body, 160),
        }))
        .filter((entry) => entry.title)
    : project.spec.offers
  const sample = {
    menu: false,
    contact: false,
    story: false,
    offers: false,
    ...(project.spec.sampleContent ?? {}),
  }
  const menuChanged = JSON.stringify(menu) !== JSON.stringify(project.spec.menu)
  const offersChanged = JSON.stringify(offers) !== JSON.stringify(project.spec.offers)
  // Saving the catalogue is the owner taking ownership of it. The remaining
  // sample groups stay flagged so the dashboard can still offer to clear them.
  const spec = {
    ...project.spec,
    menu,
    offers,
    sampleContent: {
      ...sample,
      menu: menuChanged ? false : sample.menu,
      offers: offersChanged ? false : sample.offers,
    },
  }
  await c.env.DB
    .prepare('UPDATE projects SET spec = ?, updated_at = ? WHERE id = ?')
    .bind(JSON.stringify(spec), new Date().toISOString(), project.id)
    .run()
  if (menuChanged || offersChanged)
    await log(c.env.DB, project.id, 'catalogue', 'Catalogue updated', 'Saved from an owner surface.')
  // A featured item gaining a photograph or price can bring a block back.
  const sections = project.doc
    ? await reconcileDoc(c.env.DB, project, project.doc, spec as AppSpec)
    : { hidden: [] as string[], restored: [] as string[] }
  c.header('Cache-Control', 'private, no-store')
  return c.json({ ok: true, menu, offers, ...sections })
}

// The visual editor addresses the catalogue through the project's private
// edit token; the dashboard uses the separate owner session.
app.put('/api/projects/:token/catalog', saveCatalogHandler)
app.put('/api/projects/:token/dashboard/catalog', async (c) => {
  const project = await loadProject(c)
  if (!project) return fail(c, 404, 'not_found', 'No build with that link.')
  if (!(await ownerSession(c, project)))
    return fail(c, 401, 'owner_auth_required', 'Sign in with the owner key to change the catalogue.')
  return saveCatalogHandler(c)
})

app.post('/api/projects/:token/notes', async (c) => {
  const project = await loadProject(c)
  if (!project) return fail(c, 404, 'not_found', 'No build with that link.')
  const body = await readJson(c)
  if (!body) return fail(c, 400, 'invalid_json', 'Send a JSON object.')
  const text = str(body.body, 800)
  if (text.length < 4)
    return fail(c, 422, 'note_too_short', 'Add a little more detail to the request.')
  const note = await addNote(c.env.DB, project, text, 'customer')
  return c.json({ note, status: 'changes_requested' }, 201)
})

app.post('/api/projects/:token/approve', async (c) => {
  const project = await loadProject(c)
  if (!project) return fail(c, 404, 'not_found', 'No build with that link.')
  // Approval is the last chance to catch a component that draws nothing: the
  // document is repaired here even if it was stored by an older build.
  const pruned = pruneEmptySections(starterDoc(project), project.spec, project.token)
  if (pruned.hidden.length || pruned.restored.length) await saveDoc(c.env.DB, project, pruned.doc)
  await approveProject(c.env.DB, project)
  return c.json({
    ok: true,
    version: project.version,
    status: 'approved',
    hidden: pruned.hidden,
    restored: pruned.restored,
  })
})

/* ------------------------------- fallbacks ----------------------------- */

app.notFound(async (c) => {
  if (c.req.path.startsWith('/api/'))
    return c.json({ error: { code: 'not_found', message: 'Endpoint not found.' } }, 404)
  // Icons and the share card are real files in ./public; let the asset layer
  // answer for them before falling back to a page.
  const assets = c.env.ASSETS as Fetcher | undefined
  if (typeof assets?.fetch === 'function') {
    const asset = await assets.fetch(c.req.raw)
    if (asset.status !== 404) return asset
  }
  return c.html(notFoundPage(), 404)
})

app.onError((error, c) => {
  console.error('plattr_error', error)
  if (c.req.path.startsWith('/api/'))
    return c.json(
      { error: { code: 'internal_error', message: 'Something went wrong.' } },
      500,
    )
  return c.html(
    page({
      title: 'Error · Plattr',
      body: `<div class="wrap" style="padding:90px 0;text-align:center">
        <h1 class="display" style="font-size:40px">That build hit a snag.</h1>
        <p class="lede" style="margin:12px auto 0">${esc('Reload to try again.')}</p>
        <a class="btn primary" href="/studio" style="margin-top:20px">Back to the studio</a>
      </div>`,
    }),
    500,
  )
})

export default app
