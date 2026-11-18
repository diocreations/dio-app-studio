import {
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
import type { VideoLink } from './types'
import { verticalFor } from './verticals'

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
  status: ProjectStatus
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
  status: string
  version: number
  variation_slot: number | null
  created_at: string
  updated_at: string
}

const SCHEMA = [
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
    status TEXT NOT NULL DEFAULT 'in_review',
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
  `CREATE TABLE IF NOT EXISTS project_budget (
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
  `CREATE INDEX IF NOT EXISTS notes_by_project ON notes (project_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS activity_by_project ON activity (project_id, created_at)`,
]

/** Columns added after the first deployments. Duplicate-column errors are fine. */
const MIGRATIONS = [
  `ALTER TABLE projects ADD COLUMN vertical TEXT NOT NULL DEFAULT 'restaurant'`,
  `ALTER TABLE projects ADD COLUMN custom TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE projects ADD COLUMN variation_slot INTEGER`,
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

export function ensureSchema(db: D1Database): Promise<void> {
  const existing = ready.get(db)
  if (existing) return existing
  const setup = (async () => {
    for (const statement of SCHEMA) await db.prepare(statement).run()
    for (const statement of MIGRATIONS) {
      try {
        await db.prepare(statement).run()
      } catch {
        // Column already exists.
      }
    }
  })()
  ready.set(db, setup)
  return setup
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
    status:
      row.status === 'approved'
        ? 'approved'
        : row.status === 'changes_requested'
          ? 'changes_requested'
          : 'in_review',
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
  /** Trailer and clip links the customer typed; cleaned in `buildSpec`. */
  videos?: VideoLink[]
  /** A platform bundle to quote and build alongside the app. */
  bundle?: string
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
    videos: input.videos,
    bundle: input.bundle,
    site: input.site,
  })

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
  return row ? toProject(row) : null
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
  return row?.used ?? 1
}

/**
 * Counts one build against a daily bucket and says whether it fits. Keys are
 * `<day>:<bucket>` so yesterday's rows never block today, and a visitor's
 * bucket is a hash rather than an address.
 */
export async function spendProjectBudget(
  db: D1Database,
  bucket: string,
  limit: number,
  day = new Date().toISOString().slice(0, 10),
): Promise<boolean> {
  await ensureSchema(db)
  const row = await db
    .prepare(
      `INSERT INTO project_budget (key, used) VALUES (?, 1)
         ON CONFLICT(key) DO UPDATE SET used = used + 1 WHERE used < ?
         RETURNING used`,
    )
    .bind(`${day}:${bucket}`, limit)
    .first<{ used: number }>()
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
  await db.batch([
    db.prepare('DELETE FROM notes WHERE project_id = ?').bind(id),
    db.prepare('DELETE FROM activity WHERE project_id = ?').bind(id),
    db.prepare('DELETE FROM projects WHERE id = ?').bind(id),
  ])
}

export type ProjectPatch = {
  name?: string
  /** Menu edits arrive untyped from the browser and are sanitised here. */
  spec?: Partial<Omit<AppSpec, 'menu'>> & { menu?: unknown }
  features?: string[]
  accent?: string
  logo?: string
  custom?: string
}

export async function saveVersion(
  db: D1Database,
  project: Project,
  patch: ProjectPatch,
): Promise<Project> {
  await ensureSchema(db)
  const features = patch.features
    ? normalizeFeatures(patch.features)
    : project.features
  const accent = sanitizeHex(patch.accent ?? patch.spec?.accent, project.accent)
  const name = (patch.name ?? patch.spec?.name ?? project.name).trim().slice(0, 60)
  const logo = sanitizeLogo(patch.logo ?? patch.spec?.logo, project.logo)
  const custom = (patch.custom ?? patch.spec?.custom ?? project.custom ?? '')
    .trim()
    .slice(0, 600)
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

  await db
    .prepare(
      `UPDATE projects
         SET name = ?, features = ?, accent = ?, logo = ?, spec = ?, quote = ?, custom = ?,
             version = ?, variation_slot = ?, status = 'in_review', updated_at = ?
       WHERE id = ?`,
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
      new Date().toISOString(),
      project.id,
    )
    .run()

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
