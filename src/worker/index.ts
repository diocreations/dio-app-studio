import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { renderApp, renderIcon, renderManifest, renderServiceWorker } from './app'
import { photosFor } from './photos'
import {
  addNote,
  approveProject,
  createProject,
  deleteProject,
  getDocVersion,
  getProject,
  listDocVersions,
  saveDoc,
  listActivity,
  listNotes,
  listProjects,
  saveVersion,
  spendImportBudget,
  spendDailyBudget,
} from './db'
import { bundleFilename, bundleFor } from './export'
import {
  checkImportUrl,
  ImportError,
  importOnce,
  sanitizeImported,
  throttleImports,
} from './importer'
import { buildSpec, quote, sanitizeMenu, type VerticalId } from './pricing'
import { applyCommand, docFromSpec, normalizeDoc } from './doc'
import { editorPage } from './views/editor'
import type { VideoLink } from './types'
import { cleanLayout, designsFor, readPrompt } from './prompt'
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

type Bindings = {
  DB: D1Database
  ASSETS: Fetcher
  PEXELS_API_KEY?: string
  /** Operator key for /studio. Unset means the board stays closed. */
  STUDIO_KEY?: string
  /** Imports allowed per day across everyone. Unset uses the default; 0 closes the importer. */
  IMPORT_DAILY_CAP?: string
  /** Published on the privacy page for deletion and data requests. */
  CONTACT_EMAIL?: string
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
  if (PRIVATE_PATHS.test(c.req.path)) c.res.headers.set('X-Robots-Tag', 'noindex, nofollow')
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

app.use(
  '/api/*',
  bodyLimit({
    maxSize: 256 * 1024,
    onError: (c) =>
      c.json(
        { error: { code: 'body_too_large', message: 'That payload is too large.' } },
        413,
      ),
  }),
)

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

function isHttps(url: string): boolean {
  return url.startsWith('https://')
}

function fail(
  c: { json: (body: unknown, status: 400 | 401 | 403 | 404 | 415 | 422 | 429 | 500 | 502) => Response },
  status: 400 | 401 | 403 | 404 | 415 | 422 | 429 | 500 | 502,
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

app.get('/', (c) => c.html(marketingPage()))

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
    `User-agent: *\nAllow: /\nDisallow: /studio\nDisallow: /p/\nDisallow: /api/\nDisallow: /demo/\n\nSitemap: ${origin}/sitemap.xml\n`,
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
  c.header('Cache-Control', 'private, no-store')
  return c.html(studioPage(projects))
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

app.get('/p/:token/edit', async (c) => {
  const project = await loadProject(c)
  if (!project) return c.html(notFoundPage(), 404)
  c.header('Cache-Control', 'no-store')
  return c.html(
    editorPage({
      project,
      // An editor session always opens the v2 screen model, even for a build
      // whose saved document predates screens.
      doc: normalizeDoc(project.doc ?? docFromSpec(project.spec), project.spec),
      origin: new URL(c.req.url).origin,
    }),
  )
})

app.get('/p/:token', async (c) => {
  const project = await loadProject(c)
  if (!project) return c.html(notFoundPage(), 404)
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

app.get('/p/:token/app', async (c) => {
  const project = await loadProject(c)
  if (!project) return c.text('Not found', 404)
  c.header('Cache-Control', 'no-store')
  const photos = await photosFor(project.spec.vertical, c.env)
  return c.html(
    renderApp(project.spec, {
      token: project.token,
      version: project.version,
      slot: project.variationSlot ?? undefined,
      photos,
      noindex: true,
      doc: project.doc ?? undefined,
      // The editor's canvas opts in; a published app never carries the bridge.
      editor: c.req.query('editor') === '1',
      screen: c.req.query('editor') === '1' ? c.req.query('screen')?.slice(0, 40) : undefined,
    }),
  )
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

app.get('/demo/app', async (c) => {
  const key = c.req.query('biz') ?? 'restaurant'
  const demo = DEMOS[key] ?? DEMOS.restaurant
  const spec = buildSpec({ ...demo, features: [] })
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

  return c.json({ ...read, designs: designsFor(read.vertical) })
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

app.post('/api/import', async (c) => {
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
    const report = await importOnce(url.href)
    c.header('Cache-Control', 'no-store')
    return c.json({
      site: report.site,
      source: report.source,
      host: report.host,
      pages: report.pages,
      found: report.found,
      missing: report.missing,
      notes: report.notes,
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
    videos: Array.isArray(body.videos) ? (body.videos as VideoLink[]) : undefined,
    bundle: str(body.bundle, 20),
    site: sanitizeImported(body.site),
  })

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
  const body = await readJson(c)
  if (!body) return fail(c, 400, 'invalid_json', 'Send a JSON object.')

  const specInput =
    body.spec && typeof body.spec === 'object' && !Array.isArray(body.spec)
      ? (body.spec as Record<string, unknown>)
      : {}

  const menu = Array.isArray(specInput.menu) ? sanitizeMenu(specInput.menu) : undefined

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
    doc: normalizeDoc(project.doc ?? docFromSpec(project.spec), project.spec),
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
  await saveDoc(c.env.DB, project, doc)
  c.header('Cache-Control', 'private, no-store')
  return c.json({ ok: true, doc, savedAt: new Date().toISOString() })
})

/**
 * Predicts a change without applying it: the editor shows the proposal and only
 * saves it when the owner accepts, so AI edits are as reversible as manual
 * ones.
 */
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
  const doc = normalizeDoc(version, project.spec)
  await saveDoc(c.env.DB, project, doc)
  c.header('Cache-Control', 'private, no-store')
  return c.json({ ok: true, doc })
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
  await approveProject(c.env.DB, project)
  return c.json({ ok: true, version: project.version, status: 'approved' })
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
