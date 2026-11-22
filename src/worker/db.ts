import {
  backfillSampleContent,
  buildSpec,
  cleanCategory,
  initialsFor,
  normalizeFeatures,
  normalizePlatforms,
  quote,
  sanitizeHex,
  sanitizeLogo,
  sanitizeMenu,
  type FeatureId,
  type Plan,
  type Platform,
  type Quote,
  type AppSpec,
  type LayoutChoice,
  type SiteInfo,
  type VerticalId,
} from './pricing'
import type { Doc } from './doc'
import type { VideoLink } from './types'
import { verticalFor } from './verticals'
import { ensurePlatformSchema } from './platform/schema'

export type ProjectStatus = 'in_review' | 'changes_requested' | 'approved'
export type NoteStatus = 'open' | 'done'

export type Project = {
  id: string
  token: string
  name: string
  contact: string
  email: string
  vertical: VerticalId
  /** Free-text category: "Bookshop", "Mobile dog grooming". */
  category: string
  custom: string
  plan: Plan
  platforms: Platform[]
  features: FeatureId[]
  accent: string
  logo: string
  quote: Quote
  spec: AppSpec
  /** The editable section document; null until the editor first saves one. */
  doc: Doc | null
  status: ProjectStatus
  /** ISO time the customer app went live; empty while private. */
  publishedAt: string
  version: number
  /** Deck position for the current build; each rebuild claims a new slot. */
  variationSlot: number | null
  createdAt: string
  updatedAt: string
}

export type Note = {
  id: string
  body: string
  author: string
  status: NoteStatus
  version: number
  createdAt: string
}

export type Activity = {
  id: string
  kind: string
  label: string
  detail: string
  createdAt: string
}

type ProjectRow = {
  id: string
  token: string
  name: string
  contact: string
  email: string
  vertical: string
  custom: string
  plan: string
  platforms: string
  features: string
  accent: string
  logo: string
  quote: string
  spec: string
  doc?: string
  status: string
  published_at: string
  version: number
  variation_slot: number | null
  created_at: string
  updated_at: string
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    contact TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    vertical TEXT NOT NULL DEFAULT 'restaurant',
    custom TEXT NOT NULL DEFAULT '',
    plan TEXT NOT NULL DEFAULT 'onetime',
    platforms TEXT NOT NULL DEFAULT '["pwa"]',
    features TEXT NOT NULL DEFAULT '["catalog"]',
    accent TEXT NOT NULL DEFAULT '#e2522d',
    logo TEXT NOT NULL DEFAULT 'AP',
    quote TEXT NOT NULL DEFAULT '{}',
    spec TEXT NOT NULL DEFAULT '{}',
    doc TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'in_review',
    published_at TEXT NOT NULL DEFAULT '',
    version INTEGER NOT NULL DEFAULT 1,
    variation_slot INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS variation_counter (
    name TEXT PRIMARY KEY,
    value INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS import_budget (
    day TEXT PRIMARY KEY,
    used INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS daily_budget (
    key TEXT PRIMARY KEY,
    used INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    body TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT 'customer',
    status TEXT NOT NULL DEFAULT 'open',
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS activity (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    label TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS doc_versions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    doc TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS media (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    hash TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    bytes INTEGER NOT NULL,
    alt TEXT NOT NULL DEFAULT '',
    focal_x INTEGER NOT NULL DEFAULT 50,
    focal_y INTEGER NOT NULL DEFAULT 50,
    created_at TEXT NOT NULL,
    variants TEXT NOT NULL DEFAULT '[]',
    UNIQUE(project_id, hash)
  )`,
  `CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    contact_key TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(project_id, contact_key)
  )`,
  `CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    fulfilment TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    subtotal INTEGER NOT NULL DEFAULT 0,
    delivery_fee INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,
    payment_status TEXT NOT NULL DEFAULT 'unpaid',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    menu_key TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    price INTEGER NOT NULL DEFAULT 0,
    qty INTEGER NOT NULL DEFAULT 1,
    variant TEXT NOT NULL DEFAULT '',
    variant_id TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'requested',
    date TEXT NOT NULL,
    check_out TEXT NOT NULL DEFAULT '',
    nights INTEGER NOT NULL DEFAULT 0,
    nightly_rate INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,
    slot TEXT NOT NULL DEFAULT '',
    party INTEGER NOT NULL DEFAULT 1,
    service TEXT NOT NULL DEFAULT '',
    staff TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS enquiries (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    contact TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS media_cleanup_log (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    media_id TEXT NOT NULL,
    action TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    object_keys TEXT NOT NULL DEFAULT '[]',
    objects INTEGER NOT NULL DEFAULT 0,
    bytes INTEGER NOT NULL DEFAULT 0,
    backup_id TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS media_cleanup_log_by_project ON media_cleanup_log (project_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS owner_sessions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS owner_sessions_by_project ON owner_sessions (project_id, expires_at)`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    recipient TEXT NOT NULL,
    channel TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    payload TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS notes_by_project ON notes (project_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS media_by_project ON media (project_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS orders_by_project ON orders (project_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS order_items_by_order ON order_items (order_id)`,
  `CREATE INDEX IF NOT EXISTS bookings_by_project ON bookings (project_id, date)`,
  `CREATE INDEX IF NOT EXISTS enquiries_by_project ON enquiries (project_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS customers_by_project ON customers (project_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS notifications_by_project ON notifications (project_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS activity_by_project ON activity (project_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS doc_versions_by_project ON doc_versions (project_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS payment_connections (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'test',
    key_id TEXT NOT NULL DEFAULT '',
    secrets TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'connected',
    last_verification TEXT NOT NULL DEFAULT 'untested',
    last_verified_at TEXT NOT NULL DEFAULT '',
    last_error TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(project_id, provider)
  )`,
  `CREATE TABLE IF NOT EXISTS payment_settings (
    project_id TEXT PRIMARY KEY,
    active_provider TEXT NOT NULL DEFAULT '',
    pay_orders INTEGER NOT NULL DEFAULT 1,
    pay_bookings INTEGER NOT NULL DEFAULT 1,
    booking_deposit_percent INTEGER NOT NULL DEFAULT 20,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS payment_transactions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    connection_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'test',
    kind TEXT NOT NULL,
    ref_id TEXT NOT NULL,
    ref_number TEXT NOT NULL DEFAULT '',
    customer_id TEXT NOT NULL DEFAULT '',
    customer_name TEXT NOT NULL DEFAULT '',
    customer_email TEXT NOT NULL DEFAULT '',
    customer_phone TEXT NOT NULL DEFAULT '',
    provider_order_id TEXT NOT NULL DEFAULT '',
    provider_payment_id TEXT NOT NULL DEFAULT '',
    provider_refund_id TEXT NOT NULL DEFAULT '',
    amount INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    status TEXT NOT NULL DEFAULT 'created',
    refund_status TEXT NOT NULL DEFAULT 'none',
    amount_refunded INTEGER NOT NULL DEFAULT 0,
    checkout_url TEXT NOT NULL DEFAULT '',
    failure_reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    paid_at TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS payment_events (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    event_id TEXT NOT NULL,
    event_type TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'received',
    detail TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    UNIQUE(project_id, provider, event_id)
  )`,
  `CREATE INDEX IF NOT EXISTS payment_connections_by_project ON payment_connections (project_id)`,
  `CREATE INDEX IF NOT EXISTS payment_tx_by_project ON payment_transactions (project_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS payment_tx_by_ref ON payment_transactions (project_id, kind, ref_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS payment_tx_provider_order ON payment_transactions (provider, mode, provider_order_id) WHERE provider_order_id <> ''`,
  `CREATE UNIQUE INDEX IF NOT EXISTS payment_tx_provider_payment ON payment_transactions (provider, mode, provider_payment_id) WHERE provider_payment_id <> ''`,
  `CREATE INDEX IF NOT EXISTS payment_events_by_project ON payment_events (project_id, created_at)`,
  /// An unfinished brief, keyed by the unguessable id in its own cookie. It is
  /// never keyed by address, so two visitors on one network cannot meet here.
  `CREATE TABLE IF NOT EXISTS brief_drafts (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
]

/** Columns added after the first deployments. Duplicate-column errors are fine. */
const MIGRATIONS = [
  `ALTER TABLE projects ADD COLUMN vertical TEXT NOT NULL DEFAULT 'restaurant'`,
  `ALTER TABLE projects ADD COLUMN custom TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE projects ADD COLUMN variation_slot INTEGER`,
  `ALTER TABLE projects ADD COLUMN doc TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE projects ADD COLUMN published_at TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE owner_sessions ADD COLUMN last_seen_at TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE order_items ADD COLUMN variant TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE order_items ADD COLUMN variant_id TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE bookings ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'unpaid'`,
  `ALTER TABLE bookings ADD COLUMN paid_amount INTEGER NOT NULL DEFAULT 0`,
  // A hotel stay is a range, not a moment. Nights and the room total are
  // derived on the server from the two dates and the saved room rate.
  `ALTER TABLE bookings ADD COLUMN check_out TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE bookings ADD COLUMN nights INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE bookings ADD COLUMN nightly_rate INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE bookings ADD COLUMN total INTEGER NOT NULL DEFAULT 0`,
  // A checkout names the attempt it came from, so a retried send finds the
  // order it already made instead of charging the customer twice.
  `ALTER TABLE orders ADD COLUMN client_ref TEXT NOT NULL DEFAULT ''`,
  `CREATE UNIQUE INDEX IF NOT EXISTS orders_by_client_ref ON orders (project_id, client_ref) WHERE client_ref <> ''`,
  `CREATE UNIQUE INDEX IF NOT EXISTS projects_variation_slot ON projects (variation_slot)`,
  // Legacy rows get a stable slot before the counter is seeded past them.
  `UPDATE projects SET variation_slot = rowid - 1 WHERE variation_slot IS NULL`,
  `INSERT OR IGNORE INTO variation_counter (name, value)
   SELECT 'layout', COALESCE(MAX(variation_slot) + 1, 0) FROM projects`,
  // Never let the counter fall behind slots that were backfilled manually.
  `UPDATE variation_counter
     SET value = (SELECT COALESCE(MAX(variation_slot) + 1, 0) FROM projects)
     WHERE name = 'layout'
       AND value < (SELECT COALESCE(MAX(variation_slot) + 1, 0) FROM projects)`,
]

const ready = new WeakMap<D1Database, Promise<void>>()
const SCHEMA_VERSION = '2'

export function ensureSchema(db: D1Database): Promise<void> {
  const existing = ready.get(db)
  if (existing) return existing
  const setup = (async () => {
    // A warm database only needs one indexed read. Running dozens of DDL
    // statements on every cold isolate made the first app request after a
    // deployment intermittently fail while D1 serialized the schema lock.
    try {
      const row = await db
        .prepare('SELECT value FROM schema_meta WHERE key = ?')
        .bind('schema_version')
        .first<{ value: string }>()
      if (row?.value === SCHEMA_VERSION) return
    } catch {
      // No metadata table yet: this is a first run or an older database.
    }
    for (const statement of SCHEMA) await db.prepare(statement).run()
    for (const statement of MIGRATIONS) {
      try {
        await db.prepare(statement).run()
      } catch {
        // Column already exists.
      }
    }
    // M1: additive and idempotent. Existing statements above are unchanged and
    // nothing here is read by the current application paths.
    await ensurePlatformSchema(db)
    await db
      .prepare(
        `INSERT INTO schema_meta (key, value) VALUES ('schema_version', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .bind(SCHEMA_VERSION)
      .run()
  })().catch((error) => {
    // Never cache a rejected setup: the next request can retry the migration.
    ready.delete(db)
    throw error
  })
  ready.set(db, setup)
  return setup
}

export type BriefDraft = { id: string; data: string; updated_at: string }

export async function readBriefDraft(db: D1Database, id: string): Promise<BriefDraft | null> {
  await ensureSchema(db)
  const row = await db
    .prepare('SELECT id, data, updated_at FROM brief_drafts WHERE id = ?')
    .bind(id)
    .first<BriefDraft>()
  return row ?? null
}

/** A draft older than the cookie that addressed it can never be restored, so
 *  it is removed instead of kept forever. Bounded to one statement per write. */
export async function pruneBriefDrafts(
  db: D1Database,
  now = Date.now(),
  maxAgeDays = 30,
): Promise<void> {
  await ensureSchema(db)
  const cutoff = new Date(now - maxAgeDays * 24 * 60 * 60 * 1000).toISOString()
  await db.prepare('DELETE FROM brief_drafts WHERE updated_at < ?').bind(cutoff).run()
}

export async function saveBriefDraft(db: D1Database, id: string, data: string): Promise<void> {
  await ensureSchema(db)
  await pruneBriefDrafts(db)
  const now = new Date().toISOString()
  await db
    .prepare(
      `INSERT INTO brief_drafts (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    )
    .bind(id, data, now, now)
    .run()
}

export async function deleteBriefDraft(db: D1Database, id: string): Promise<void> {
  await ensureSchema(db)
  await db.prepare('DELETE FROM brief_drafts WHERE id = ?').bind(id).run()
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function emptyQuote(): Quote {
  return { plan: 'onetime', oneTime: 0, setupFee: 0, monthly: 0, firstYear: 0, lines: [] }
}

function emptySpec(row: ProjectRow): AppSpec {
  const vertical = verticalFor(row.vertical)
  return {
    name: row.name,
    kind: vertical.kind,
    tagline: vertical.tagline,
    story: vertical.story,
    accent: row.accent,
    logo: row.logo,
    hours: vertical.hours,
    phone: vertical.phone,
    address: vertical.address,
    vertical: vertical.id,
    features: ['catalog'],
    menu: [],
    offers: [],
    loyalty: { goal: 6, reward: '' },
    custom: row.custom ?? '',
  }
}

function toProject(row: ProjectRow): Project {
  const vertical = verticalFor(row.vertical)
  const spec = parseJson<AppSpec>(row.spec, emptySpec(row))
  return {
    id: row.id,
    token: row.token,
    name: row.name,
    contact: row.contact,
    email: row.email,
    vertical: vertical.id,
    category: spec.category ?? '',
    custom: row.custom ?? '',
    plan: row.plan === 'monthly' ? 'monthly' : 'onetime',
    platforms: parseJson<Platform[]>(row.platforms, ['pwa']),
    // Normalise on read: builds saved before the rename stored `menu` and
    // `reservations`, and must still open with their tabs intact.
    features: normalizeFeatures(parseJson<FeatureId[]>(row.features, ['catalog'])),
    accent: row.accent,
    logo: row.logo,
    quote: parseJson<Quote>(row.quote, emptyQuote()),
    spec: {
      ...spec,
      vertical: vertical.id,
      features: normalizeFeatures(spec.features ?? []),
      custom: row.custom ?? spec.custom ?? '',
    },
    doc: row.doc ? parseJson<Doc | null>(row.doc, null) : null,
    status:
      row.status === 'approved'
        ? 'approved'
        : row.status === 'changes_requested'
          ? 'changes_requested'
          : 'in_review',
    publishedAt: row.published_at ?? '',
    version: row.version,
    variationSlot: row.variation_slot ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function id(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  return `${prefix}_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export type NewProjectInput = {
  name: string
  contact: string
  email: string
  vertical: string
  tagline?: string
  accent: string
  logo: string
  features: string[]
  platforms: string[]
  plan: Plan
  custom?: string
  /** What the business calls itself, when that is not one of the listed trades. */
  category?: string
  /** Details read from the customer's existing website, already sanitised. */
  site?: SiteInfo
  /** The design picked from the three previews, already sanitised. */
  layout?: LayoutChoice
  /** The concept direction picked on the brief; seeds the new document. */
  direction?: string
  /** Trailer and clip links the customer typed; cleaned in `buildSpec`. */
  videos?: VideoLink[]
  /** A platform bundle to quote and build alongside the app. */
  bundle?: string
  /** The read's record of kept, refused and missing content. */
  sourceReview?: unknown
  /** Completed work accepted as a portfolio, not as services. */
  projects?: unknown
}

/** Atomic across concurrent creates: the counter is the only writer. */
async function nextVariationSlot(db: D1Database): Promise<number> {
  const row = await db
    .prepare(`UPDATE variation_counter SET value = value + 1 WHERE name = 'layout' RETURNING value`)
    .first<{ value: number }>()
  if (!row) throw new Error('variation counter is missing')
  return row.value - 1
}

export async function createProject(
  db: D1Database,
  input: NewProjectInput,
): Promise<Project> {
  await ensureSchema(db)
  const vertical = verticalFor(input.vertical)
  const name = input.name.trim().slice(0, 60) || 'Your business'
  const features = normalizeFeatures(input.features.length ? input.features : vertical.features)
  const platforms = normalizePlatforms(input.platforms)
  const accent = sanitizeHex(input.accent, vertical.accent)
  const logo = sanitizeLogo(input.logo, initialsFor(name))
  const plan: Plan = input.plan === 'monthly' ? 'monthly' : 'onetime'
  const priced = quote({ features, platforms, plan, bundle: input.bundle })
  const custom = (input.custom ?? '').trim().slice(0, 600)
  const category = cleanCategory(input.category ?? input.site?.category)
  const spec = buildSpec({
    name,
    vertical: vertical.id,
    accent,
    logo,
    features,
    tagline: input.tagline,
    custom,
    category,
    layout: input.layout,
    direction: input.direction,
    videos: input.videos,
    bundle: input.bundle,
    sourceReview: input.sourceReview,
    projects: input.projects,
    site: input.site,
  })

  // Work the source suggested is not published work yet. It waits for an
  // explicit owner acceptance on the review page, even if a client sent it as
  // already accepted.
  if (spec.projects?.length)
    spec.projects = spec.projects.map((entry) => ({ ...entry, accepted: false }))

  const row: ProjectRow = {
    id: id('prj'),
    token: newToken(),
    name,
    contact: input.contact.trim().slice(0, 80),
    email: input.email.trim().slice(0, 120),
    vertical: vertical.id,
    custom,
    plan,
    platforms: JSON.stringify(platforms),
    features: JSON.stringify(features),
    accent,
    logo,
    quote: JSON.stringify(priced),
    spec: JSON.stringify(spec),
    status: 'in_review',
    published_at: '',
    version: 1,
    variation_slot: await nextVariationSlot(db),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  await db
    .prepare(
      `INSERT INTO projects
        (id, token, name, contact, email, vertical, custom, plan, platforms, features, accent, logo, quote, spec, status, version, variation_slot, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.token,
      row.name,
      row.contact,
      row.email,
      row.vertical,
      row.custom,
      row.plan,
      row.platforms,
      row.features,
      row.accent,
      row.logo,
      row.quote,
      row.spec,
      row.status,
      row.version,
      row.variation_slot,
      row.created_at,
      row.updated_at,
    )
    .run()

  await log(
    db,
    row.id,
    'build',
    'First build generated',
    `Version 1 · ${category || vertical.label} · ${features.length} features`,
  )
  if (spec.website) {
    let host = spec.website
    try {
      host = new URL(spec.website).hostname.replace(/^www\./, '')
    } catch {
      // Keep the raw string if it is not a parseable URL.
    }
    const items = spec.menu.reduce((total, section) => total + section.items.length, 0)
    await log(
      db,
      row.id,
      'import',
      `Read from ${host}`,
      `${items} catalogue ${items === 1 ? 'entry' : 'entries'} imported from the site`,
    )
  }
  return toProject(row)
}

export async function getProject(
  db: D1Database,
  token: string,
): Promise<Project | null> {
  await ensureSchema(db)
  const row = await db
    .prepare('SELECT * FROM projects WHERE token = ?')
    .bind(token)
    .first<ProjectRow>()
  if (!row) return null
  return backfillProjectSampleContent(db, toProject(row))
}

export async function getProjectById(
  db: D1Database,
  id: string,
): Promise<Project | null> {
  await ensureSchema(db)
  const row = await db.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first<ProjectRow>()
  if (!row) return null
  return backfillProjectSampleContent(db, toProject(row))
}

async function backfillProjectSampleContent(db: D1Database, project: Project): Promise<Project> {
  const filled = backfillSampleContent(project.spec)
  if (JSON.stringify(filled) === JSON.stringify(project.spec.sampleContent)) return project
  await db
    .prepare('UPDATE projects SET spec = ? WHERE id = ?')
    .bind(JSON.stringify({ ...project.spec, sampleContent: filled }), project.id)
    .run()
  return { ...project, spec: { ...project.spec, sampleContent: filled } }
}

/**
 * Autosaves the editor's document. It does not bump the build version: an
 * editor session is continuous work, and versions are for approved builds.
 */
export async function saveDoc(
  db: D1Database,
  project: Project,
  doc: Doc,
  options: { log?: boolean } = {},
): Promise<void> {
  await ensureSchema(db)
  const previous = await db
    .prepare('SELECT doc FROM projects WHERE id = ?')
    .bind(project.id)
    .first<{ doc: string }>()
  const now = new Date().toISOString()
  await db
    .prepare('UPDATE projects SET doc = ?, updated_at = ? WHERE id = ?')
    .bind(JSON.stringify(doc), now, project.id)
    .run()

  // The first save keeps a baseline version. Without it a new build has no
  // earlier design to return to until a minute of editing has passed. After
  // that, autosave snapshots the replaced document at most once a minute.
  const previousDoc = (previous?.doc ?? '').trim()
  if (!previousDoc) {
    await db
      .prepare('INSERT INTO doc_versions (id, project_id, doc, created_at) VALUES (?, ?, ?, ?)')
      .bind(id('dvr'), project.id, JSON.stringify(doc), now)
      .run()
  } else if (previousDoc !== JSON.stringify(doc)) {
    const last = await db
      .prepare('SELECT created_at FROM doc_versions WHERE project_id = ? ORDER BY created_at DESC LIMIT 1')
      .bind(project.id)
      .first<{ created_at: string }>()
    if (!last || Date.now() - Date.parse(last.created_at) > 60_000) {
      await db
        .prepare('INSERT INTO doc_versions (id, project_id, doc, created_at) VALUES (?, ?, ?, ?)')
        .bind(id('dvr'), project.id, previousDoc, now)
        .run()
      // Keep the last twenty; older designs are not recoverable.
      await db
        .prepare(
          `DELETE FROM doc_versions WHERE project_id = ? AND id NOT IN (
             SELECT id FROM doc_versions WHERE project_id = ? ORDER BY created_at DESC LIMIT 20
           )`,
        )
        .bind(project.id, project.id)
        .run()
    }
  }
  // Reconciliation after a settings or catalogue change is not an edit the
  // owner made to the design, so it does not add an activity entry.
  if (options.log !== false) await log(db, project.id, 'edit', 'Design edited', `${doc.screens.length} screens`)
}

export type DocVersion = { id: string; createdAt: string }

export async function listDocVersions(db: D1Database, projectId: string): Promise<DocVersion[]> {
  await ensureSchema(db)
  const { results } = await db
    .prepare('SELECT id, created_at FROM doc_versions WHERE project_id = ? ORDER BY created_at DESC LIMIT 20')
    .bind(projectId)
    .all<{ id: string; created_at: string }>()
  return (results ?? []).map((row) => ({ id: row.id, createdAt: row.created_at }))
}

export async function getDocVersion(
  db: D1Database,
  projectId: string,
  versionId: string,
): Promise<Doc | null> {
  await ensureSchema(db)
  const row = await db
    .prepare('SELECT doc FROM doc_versions WHERE id = ? AND project_id = ?')
    .bind(versionId, projectId)
    .first<{ doc: string }>()
  if (!row) return null
  return parseJson<Doc | null>(row.doc, null)
}

/**
 * Counts one import attempt against the day's allowance and returns the new
 * total. The upsert is atomic, so every isolate shares one count.
 */
export async function spendImportBudget(
  db: D1Database,
  day = new Date().toISOString().slice(0, 10),
): Promise<number> {
  await ensureSchema(db)
  const row = await db
    .prepare(
      `INSERT INTO import_budget (day, used) VALUES (?, 1)
         ON CONFLICT(day) DO UPDATE SET used = used + 1 RETURNING used`,
    )
    .bind(day)
    .first<{ used: number }>()
  const used = row?.used ?? 1
  // The upsert is atomic, so exactly one request sees `used === 1` per day and
  // sweeps; two isolates crossing midnight cannot both be the "first".
  if (used === 1) await pruneDailyBudgets(db, day)
  return used
}

/**
 * Drops counters from earlier days so the two budget tables stay small. Both
 * key on the ISO date, which sorts before every longer key for the same day,
 * so one comparison clears every old bucket.
 *
 * Each table is guarded on its own: a failure is logged and retried by the
 * next day's first request, and never fails the build or import that triggered
 * it. A request that started yesterday can recreate one stale row after the
 * sweep; the following day removes it.
 */
export async function pruneDailyBudgets(
  db: D1Database,
  day = new Date().toISOString().slice(0, 10),
): Promise<void> {
  const sweeps = [
    ['daily_budget', 'DELETE FROM daily_budget WHERE key < ?', `${day}:`],
    ['import_budget', 'DELETE FROM import_budget WHERE day < ?', day],
  ] as const
  for (const [table, sql, cutoff] of sweeps) {
    try {
      await db.prepare(sql).bind(cutoff).run()
    } catch (error) {
      console.error('plattr_prune_error', table, error)
    }
  }
}

/**
 * Counts one build or import against a daily bucket and says whether it fits.
 * Keys are `<day>:<bucket>` so yesterday's rows never block today, and a
 * visitor's bucket is a hash rather than an address.
 */
export async function spendDailyBudget(
  db: D1Database,
  bucket: string,
  limit: number,
  day = new Date().toISOString().slice(0, 10),
): Promise<boolean> {
  await ensureSchema(db)
  const row = await db
    .prepare(
      `INSERT INTO daily_budget (key, used) VALUES (?, 1)
         ON CONFLICT(key) DO UPDATE SET used = used + 1 WHERE used < ?
         RETURNING used`,
    )
    .bind(`${day}:${bucket}`, limit)
    .first<{ used: number }>()
  // The shared build bucket is created once per day; use that as the cue.
  if (row?.used === 1 && bucket === 'all') await pruneDailyBudgets(db, day)
  return Boolean(row)
}

export async function listProjects(db: D1Database): Promise<Project[]> {
  await ensureSchema(db)
  const { results } = await db
    .prepare('SELECT * FROM projects ORDER BY created_at DESC LIMIT 200')
    .all<ProjectRow>()
  return results.map(toProject)
}

/** Removes a build with its notes and activity. Used by the operator board. */
export async function deleteProject(db: D1Database, id: string): Promise<void> {
  await ensureSchema(db)
  const project = await db
    .prepare('SELECT token FROM projects WHERE id = ?')
    .bind(id)
    .first<{ token: string }>()
  await db.batch([
    db.prepare('DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE project_id = ?)').bind(id),
    db.prepare('DELETE FROM orders WHERE project_id = ?').bind(id),
    db.prepare('DELETE FROM bookings WHERE project_id = ?').bind(id),
    db.prepare('DELETE FROM enquiries WHERE project_id = ?').bind(id),
    db.prepare('DELETE FROM customers WHERE project_id = ?').bind(id),
    db.prepare('DELETE FROM notifications WHERE project_id = ?').bind(id),
    db.prepare('DELETE FROM payment_events WHERE project_id = ?').bind(id),
    db.prepare('DELETE FROM payment_transactions WHERE project_id = ?').bind(id),
    db.prepare('DELETE FROM payment_connections WHERE project_id = ?').bind(id),
    db.prepare('DELETE FROM payment_settings WHERE project_id = ?').bind(id),
    db.prepare('DELETE FROM media_cleanup_log WHERE project_id = ?').bind(id),
    db.prepare('DELETE FROM media WHERE project_id = ?').bind(id),
    db.prepare('DELETE FROM owner_sessions WHERE project_id = ?').bind(id),
    db.prepare('DELETE FROM doc_versions WHERE project_id = ?').bind(id),
    db.prepare('DELETE FROM notes WHERE project_id = ?').bind(id),
    db.prepare('DELETE FROM activity WHERE project_id = ?').bind(id),
    db.prepare('DELETE FROM projects WHERE id = ?').bind(id),
  ])
  if (!project?.token) return
  // M2 gives each app its own synthetic organisation. Removing the app must not
  // leave that organisation behind as a new orphan, so drop it only while it is
  // still unclaimed and holds nothing (no members, billing or transfers).
  try {
    await db
      .prepare(
        `DELETE FROM organizations
          WHERE slug = ? AND claim_status = 'unclaimed'
            AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.org_id = organizations.id)
            AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.org_id = organizations.id)
            AND NOT EXISTS (SELECT 1 FROM invitations i WHERE i.org_id = organizations.id)
            AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.org_id = organizations.id)
            AND NOT EXISTS (SELECT 1 FROM ownership_transfers t WHERE t.to_org_id = organizations.id)`,
      )
      .bind(`app-${project.token}`)
      .run()
  } catch (error) {
    // Best effort: a failed cleanup must never fail the delete itself.
    console.error('plattr_org_cleanup_error', error)
  }
}

/** A save based on an older copy of the build. The caller must reload before
 *  changing anything; the newer owner decision stays untouched. */
export class VersionConflictError extends Error {
  currentVersion: number
  currentUpdatedAt: string
  constructor(currentVersion: number, currentUpdatedAt: string) {
    super('This build changed in another session.')
    this.name = 'VersionConflictError'
    this.currentVersion = currentVersion
    this.currentUpdatedAt = currentUpdatedAt
  }
}

export type ProjectPatch = {
  name?: string
  /** Menu edits arrive untyped from the browser and are sanitised here. */
  spec?: Partial<Omit<AppSpec, 'menu'>> & { menu?: unknown }
  features?: string[]
  accent?: string
  logo?: string
  custom?: string
  /** The concept the owner chose from the URL-first review. */
  direction?: string
}

export async function saveVersion(
  db: D1Database,
  project: Project,
  patch: ProjectPatch,
  expect: { version?: number; updatedAt?: string } = {},
): Promise<Project> {
  await ensureSchema(db)
  if (expect.version !== undefined && expect.version !== project.version)
    throw new VersionConflictError(project.version, project.updatedAt)
  if (expect.updatedAt !== undefined && expect.updatedAt !== project.updatedAt)
    throw new VersionConflictError(project.version, project.updatedAt)
  const features = patch.features
    ? normalizeFeatures(patch.features)
    : project.features
  const accent = sanitizeHex(patch.accent ?? patch.spec?.accent, project.accent)
  const name = (patch.name ?? patch.spec?.name ?? project.name).trim().slice(0, 60)
  const logo = sanitizeLogo(patch.logo ?? patch.spec?.logo, project.logo)
  const custom = (patch.custom ?? patch.spec?.custom ?? project.custom ?? '')
    .trim()
    .slice(0, 600)
  const direction = patch.direction?.trim().slice(0, 24)
  const { menu: menuInput, ...specRest } = patch.spec ?? {}

  const spec: AppSpec = {
    ...project.spec,
    ...specRest,
    name: name || project.name,
    accent,
    logo,
    features,
    custom,
  }
  // Guard the seeded catalogue against empty or malformed edits.
  spec.menu = sanitizeMenu(menuInput ?? spec.menu)
  if (direction) spec.direction = direction
  // An imported build has no trade-sample copy left, even if an older record
  // still carries flags from before the import rules were tightened. Keeping
  // those flags would show the owner a "sample content" warning for their own
  // real catalogue.
  if (spec.website) {
    spec.sampleContent = {
      menu: false,
      contact: false,
      story: false,
      offers: false,
      team: false,
      staff: false,
      tagline: false,
    }
  }
  if ('category' in specRest) {
    const category = cleanCategory(specRest.category)
    if (category) spec.category = category
    else delete spec.category
  }

  const priced = quote({
    features,
    platforms: project.platforms,
    plan: project.plan,
    bundle: project.spec.bundle,
  })
  const version = project.version + 1
  // Every rebuild is a new build, so it gets its own deck slot. Keeping the
  // old slot and offsetting by version would collide with other projects.
  const variationSlot = await nextVariationSlot(db)
  const updatedAt = new Date().toISOString()
  // The compare-and-set is on the row we read, not just the client's claim: a
  // second writer that loaded the same copy loses even if both raced past the
  // checks above.
  const write = await db
    .prepare(
      `UPDATE projects
         SET name = ?, features = ?, accent = ?, logo = ?, spec = ?, quote = ?, custom = ?,
             version = ?, variation_slot = ?, status = 'in_review', published_at = '', updated_at = ?
       WHERE id = ? AND version = ? AND updated_at = ?`,
    )
    .bind(
      spec.name,
      JSON.stringify(features),
      accent,
      logo,
      JSON.stringify(spec),
      JSON.stringify(priced),
      custom,
      version,
      variationSlot,
      updatedAt,
      project.id,
      project.version,
      project.updatedAt,
    )
    .run()
  if (!(write as { meta?: { changes?: number } }).meta?.changes)
    throw new VersionConflictError(project.version, project.updatedAt)

  await log(db, project.id, 'rebuild', `Rebuilt as version ${version}`, summarisePatch(patch))
  return {
    ...project,
    spec,
    features,
    accent,
    logo,
    custom,
    quote: priced,
    version,
    variationSlot,
    status: 'in_review',
    publishedAt: '',
    updatedAt,
  }
}

function summarisePatch(patch: ProjectPatch): string {
  const bits: string[] = []
  if (patch.features) bits.push('feature set')
  if (patch.accent || patch.logo) bits.push('brand')
  if (patch.name) bits.push('name')
  if (patch.spec?.menu) bits.push('catalogue')
  if (patch.spec?.tagline) bits.push('tagline')
  if (patch.custom) bits.push('custom requirements')
  if (patch.direction) bits.push('concept')
  return bits.length ? `Updated ${bits.join(', ')}` : 'Applied customer edits'
}

export async function approveProject(
  db: D1Database,
  project: Project,
): Promise<void> {
  await ensureSchema(db)
  await db
    .prepare(`UPDATE projects SET status = 'approved', updated_at = ? WHERE id = ?`)
    .bind(new Date().toISOString(), project.id)
    .run()
  await db
    .prepare(`UPDATE notes SET status = 'done' WHERE project_id = ? AND status = 'open'`)
    .bind(project.id)
    .run()
  await log(
    db,
    project.id,
    'approved',
    'Customer approved the build',
    `Version ${project.version} locked for packaging`,
  )
}

/**
 * Publish or withdraw the customer app. `status` remains the review state;
 * `published_at` is the public gate, so approving a later draft does not put it
 * online by itself. Unpublishing keeps every project row and version.
 */
export async function setProjectPublished(
  db: D1Database,
  project: Project,
  published: boolean,
): Promise<string> {
  await ensureSchema(db)
  const at = published ? new Date().toISOString() : ''
  await db
    .prepare('UPDATE projects SET published_at = ?, updated_at = ? WHERE id = ?')
    .bind(at, new Date().toISOString(), project.id)
    .run()
  await log(
    db,
    project.id,
    published ? 'published' : 'unpublished',
    published ? 'Published the customer app' : 'Took the customer app offline',
    published
      ? `Version ${project.version} is live at /p/${project.token}/app`
      : 'The customer app is private again; the saved build is unchanged.',
  )
  return at
}

export async function addNote(
  db: D1Database,
  project: Project,
  body: string,
  author: 'customer' | 'studio',
): Promise<Note> {
  await ensureSchema(db)
  const note: Note = {
    id: id('note'),
    body: body.trim().slice(0, 800),
    author,
    status: 'open',
    version: project.version,
    createdAt: new Date().toISOString(),
  }
  await db
    .prepare(
      `INSERT INTO notes (id, project_id, body, author, status, version, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      note.id,
      project.id,
      note.body,
      note.author,
      note.status,
      note.version,
      note.createdAt,
    )
    .run()
  await db
    .prepare(
      `UPDATE projects SET status = 'changes_requested', updated_at = ? WHERE id = ?`,
    )
    .bind(new Date().toISOString(), project.id)
    .run()
  await log(db, project.id, 'note', 'Change requested', note.body)
  return note
}

export async function listNotes(db: D1Database, projectId: string): Promise<Note[]> {
  await ensureSchema(db)
  const { results } = await db
    .prepare(
      `SELECT id, body, author, status, version, created_at FROM notes
        WHERE project_id = ? ORDER BY created_at DESC LIMIT 50`,
    )
    .bind(projectId)
    .all<{
      id: string
      body: string
      author: string
      status: string
      version: number
      created_at: string
    }>()
  return results.map((row) => ({
    id: row.id,
    body: row.body,
    author: row.author,
    status: row.status === 'done' ? 'done' : 'open',
    version: row.version,
    createdAt: row.created_at,
  }))
}

export async function log(
  db: D1Database,
  projectId: string,
  kind: string,
  label: string,
  detail = '',
): Promise<void> {
  await ensureSchema(db)
  await db
    .prepare(
      `INSERT INTO activity (id, project_id, kind, label, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id('act'), projectId, kind, label, detail.slice(0, 240), new Date().toISOString())
    .run()
}

export async function listActivity(
  db: D1Database,
  projectId: string,
): Promise<Activity[]> {
  await ensureSchema(db)
  const { results } = await db
    .prepare(
      `SELECT id, kind, label, detail, created_at FROM activity
        WHERE project_id = ? ORDER BY created_at DESC LIMIT 30`,
    )
    .bind(projectId)
    .all<{
      id: string
      kind: string
      label: string
      detail: string
      created_at: string
    }>()
  return results.map((row) => ({
    id: row.id,
    kind: row.kind,
    label: row.label,
    detail: row.detail,
    createdAt: row.created_at,
  }))
}
