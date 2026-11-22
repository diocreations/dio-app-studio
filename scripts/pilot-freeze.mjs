#!/usr/bin/env bun
/**
 * Freeze the supervised-pilot baseline: identify the build, fingerprint the 12
 * clean projects and the existing QA evidence, and bind the dataset backup.
 *
 *   bun scripts/pilot-freeze.mjs \
 *     --backup .wrangler/pilot-freeze/<stamp> \
 *     --out docs/qa/pilot-freeze-2026-11-22
 *
 * This is a read-only audit. It does not edit projects, deploy, crawl, or
 * expose owner tokens.
 */
import { Database } from 'bun:sqlite'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : fallback
}
const root = process.cwd()
const appsFile = path.resolve(root, flag('apps', '.chrome-qa/pilot-projects.json'))
const dbFile = path.resolve(root, flag('db', '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/017f96ff90c988f5b934d2789b404a0a0f513de2918297f1afba6b3581b20f80.sqlite'))
const outDir = path.resolve(root, flag('out', 'docs/qa/pilot-freeze-2026-11-22'))
const backupArg = flag('backup', '')
const expectedSites = {
  yarmouth: ['minimal', 'editorial', 'lifestyle'],
  padella: ['editorial', 'modern', 'luxe'],
  bluetit: ['minimal', 'editorial', 'luxe'],
  afl: ['classic', 'minimal', 'editorial'],
}
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex')
const fileHash = (file) => sha256(fs.readFileSync(file))

function sourceFingerprint() {
  // Only the code that ships. Test/QA scripts are recorded by the change log
  // and do not change the owner-visible build identity.
  const groups = ['src', 'package.json', 'bun.lock', 'tsconfig.json', 'tsconfig.worker.json', 'wrangler.jsonc', 'vite.config.ts']
  const files = []
  for (const group of groups) {
    const absolute = path.join(root, group)
    if (!fs.existsSync(absolute)) continue
    if (fs.statSync(absolute).isFile()) {
      files.push(group)
      continue
    }
    const listed = execFileSync(
      'bash',
      ['-lc', `git ls-files -z -- '${group}' && git ls-files -z --others --exclude-standard -- '${group}'`],
      { cwd: root, encoding: 'buffer' },
    )
    for (const rel of listed.toString('utf8').split('\0').filter(Boolean)) files.push(rel)
  }
  const unique = [...new Set(files)].sort()
  const lines = unique.map((rel) => `${rel}\0${fileHash(path.join(root, rel))}`)
  return { hash: sha256(lines.join('\n')), files: unique.length }
}

function evidenceFingerprint() {
  const base = path.join(root, 'docs/qa')
  const freezeName = path.basename(outDir)
  const files = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (path.resolve(full) === path.join(base, freezeName)) continue
        walk(full)
      } else if (entry.isFile()) {
        files.push(path.relative(root, full))
      }
    }
  }
  walk(base)
  files.sort()
  const lines = files.map((rel) => `${rel}\0${fileHash(path.join(root, rel))}`)
  return { hash: sha256(lines.join('\n')), files: files.length }
}

if (!fs.existsSync(appsFile)) throw new Error(`pilot apps file missing: ${appsFile}`)
if (!fs.existsSync(dbFile)) throw new Error(`database missing: ${dbFile}`)
const apps = JSON.parse(fs.readFileSync(appsFile, 'utf8'))
if (apps.length !== 12) throw new Error(`expected 12 pilot applications, found ${apps.length}`)

const db = new Database(dbFile, { readonly: true })
let projects
try {
  projects = apps.map((app) => {
    const row = db
      .query('SELECT id, status, name, contact, spec, created_at FROM projects WHERE token = ?')
      .get(app.token)
    if (!row) throw new Error(`${app.site}/${app.direction}: project row not found`)
    const spec = JSON.parse(row.spec)
    const menu = spec.menu ?? []
    const items = menu.flatMap((section) => section.items ?? [])
    const source = spec.sourceReview ?? {}
    const records = {}
    for (const table of ['orders', 'bookings', 'enquiries']) {
      records[table] = db.query(`SELECT COUNT(*) AS n FROM ${table} WHERE project_id = ?`).get(row.id).n
    }
    return {
      site: app.site,
      direction: app.direction,
      projectId: row.id,
      name: row.name,
      vertical: app.vertical,
      status: row.status,
      createdAt: row.created_at,
      sourceReviewStatus: source.status ?? null,
      sourceHost: source.host ?? null,
      found: source.found?.length ?? 0,
      missing: source.missing?.length ?? 0,
      questions: source.questions?.length ?? 0,
      sections: menu.length,
      items: items.length,
      priced: items.filter((item) => Number(item.price) > 0).length,
      photographs: items.filter((item) => item.image?.url).length,
      customerRecords: records,
    }
  })
  var counts = Object.fromEntries(
    ['projects', 'orders', 'bookings', 'enquiries', 'media'].map((table) => [
      table,
      db.query(`SELECT COUNT(*) AS n FROM ${table}`).get().n,
    ]),
  )
} finally {
  db.close()
}

const shape = new Map()
for (const project of projects) {
  const directions = shape.get(project.site) ?? []
  directions.push(project.direction)
  shape.set(project.site, directions)
}
for (const [site, directions] of Object.entries(expectedSites)) {
  const actual = (shape.get(site) ?? []).slice().sort()
  if (actual.join(',') !== directions.slice().sort().join(','))
    throw new Error(`${site}: expected concepts ${directions.join(', ')}, found ${actual.join(', ') || 'none'}`)
}

const dataset = projects
  .map((project) => ({
    projectId: project.projectId,
    site: project.site,
    direction: project.direction,
    name: project.name,
    status: project.status,
    sourceReviewStatus: project.sourceReviewStatus,
    found: project.found,
    missing: project.missing,
    questions: project.questions,
    sections: project.sections,
    items: project.items,
    priced: project.priced,
    photographs: project.photographs,
  }))
  .sort((a, b) => `${a.site}/${a.direction}`.localeCompare(`${b.site}/${b.direction}`))

let backup = null
if (backupArg) {
  const dir = path.resolve(root, backupArg)
  const manifestPath = path.join(dir, 'manifest.json')
  if (!fs.existsSync(manifestPath)) throw new Error(`backup manifest missing: ${manifestPath}`)
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  backup = {
    directory: path.relative(root, dir),
    createdAt: manifest.createdAt,
    checksum: manifest.checksum,
    databaseSha256: manifest.database.sha256,
    databaseBytes: manifest.database.bytes,
    databaseCounts: manifest.database.counts,
    media: manifest.media,
    restoreNotes: manifest.restoreNotes,
  }
}

const source = sourceFingerprint()
const evidence = evidenceFingerprint()
let head = 'unknown'
let dirty = 0
try {
  head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  dirty = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean).length
} catch {}
const buildId = `plattr-pilot-2026-11-22-${head}-${source.hash.slice(0, 12)}${dirty ? '-dirty' : ''}`

const result = {
  buildId,
  frozenAt: new Date().toISOString(),
  git: { head, dirtyFileCount: dirty, note: 'working tree is not committed; the source hash identifies the frozen code' },
  source: { hash: source.hash, files: source.files },
  existingQaEvidence: {
    hash: evidence.hash,
    files: evidence.files,
    note: 'hash of docs/qa excluding this freeze folder, at final freeze verification',
  },
  database: {
    file: path.relative(root, dbFile),
    sha256: fileHash(dbFile),
    bytes: fs.statSync(dbFile).size,
    counts,
  },
  datasetHash: sha256(JSON.stringify(dataset)),
  projects,
  backup,
  changesSinceFreeze: [],
}
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'BASELINE.json'), JSON.stringify(result, null, 2) + '\n')
fs.writeFileSync(
  path.join(outDir, 'FINGERPRINTS.txt'),
  [
    `buildId ${buildId}`,
    `source ${source.hash}`,
    `existingQa ${evidence.hash}`,
    `database ${result.database.sha256}`,
    `dataset ${result.datasetHash}`,
    backup ? `backup ${backup.checksum}` : 'backup not supplied',
    '',
  ].join('\n'),
)
console.log(
  JSON.stringify(
    {
      buildId,
      source: source.hash.slice(0, 16),
      existingQa: evidence.hash.slice(0, 16),
      database: result.database.sha256.slice(0, 16),
      dataset: result.datasetHash.slice(0, 16),
      projects: projects.length,
      backup: backup?.checksum ?? null,
    },
    null,
    2,
  ),
)
