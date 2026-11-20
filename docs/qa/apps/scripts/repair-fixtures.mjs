/**
 * Repairs the local QA fixtures so a fresh import of those five sites does not
 * bring back test photographs or hidden sections.
 *
 * The five demo builds were exercised by hand: screenshots of the app itself
 * were uploaded as if they were business photography, and sections were hidden
 * while testing the visibility toggle. Those states live in the local D1 file,
 * so they survive a re-import and a fresh checkout. This script is the
 * versioned repair: it is idempotent and safe to run on every clean setup.
 *
 *   bun docs/qa/apps/scripts/repair-fixtures.mjs --dry-run
 *   bun docs/qa/apps/scripts/repair-fixtures.mjs
 *
 * It touches only the local Wrangler database named by fixtures.json. It never
 * reads or writes the hosted environment, and it never prints a session token.
 */
import { Database } from 'bun:sqlite'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { localDatabase } from './sessions.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(here, '../../../..')

/** The generator's own catalogue normaliser, so a repaired fixture carries the
 *  same stable item ids an import would produce today. */
const { sanitizeMenu } = await import(path.join(repoRoot, 'src/worker/pricing.ts'))
const fixtures = JSON.parse(fs.readFileSync(path.join(here, 'fixtures.json'), 'utf8'))
const DRY = process.argv.includes('--dry-run')

/** The uploads that were test material, identified by their own dimensions.
 *  A screenshot of the app is phone-shaped; business photography is not. */
const TEST_UPLOADS = [
  { width: 390, height: 844 },
  { width: 295, height: 640 },
]

/** Copy the generator once wrote into a document, before it learned not to. */
const PLACEHOLDER_COPY = ['The kitchen is writing its first menu.']

/** Sections the fixtures are meant to publish. */
const INTENDED = {
  shop: ['sec_fx_shop_all'],
  restaurant: ['sec_fx_dine_actions'],
  cafe: ['sec_fx_offers'],
  gym: ['sec_fx_offers'],
  salon: ['sec_fx_offers'],
}

/** Blocks whose renderer has nothing to say for this business: a visible block
 *  that publishes no markup is worse than an honest absence. */
const EMPTY_BLOCKS = {
  restaurant: ['sec_fx_dine_facts'],
  gym: ['sec_fx_gym_trainers'],
}

const db = new Database(localDatabase())

function testUploadIds(projectId) {
  const rows = db.query('select id, width, height, alt from media where project_id = ?').all(projectId)
  return new Set(
    rows
      .filter((row) => !row.alt && TEST_UPLOADS.some((size) => size.width === row.width && size.height === row.height))
      .map((row) => row.id),
  )
}

function plan(project) {
  const doc = project.doc ? JSON.parse(project.doc) : null
  const spec = project.spec ? JSON.parse(project.spec) : {}
  const changes = []
  if (!doc) return { doc, changes }
  const uploads = testUploadIds(project.id)
  const owned = new Set(db.query('select id from media where project_id = ?').all(project.id).map((row) => row.id))
  const intended = INTENDED[spec.vertical] ?? []
  const empty = EMPTY_BLOCKS[spec.vertical] ?? []
  // The catalogue gains stable item ids, exactly as a fresh import stores them.
  const menu = sanitizeMenu(spec.menu ?? [])
  const items = menu.flatMap((section) => section.items)
  const menuChanged = JSON.stringify(menu) !== JSON.stringify(spec.menu ?? [])
  if (menuChanged) spec.menu = menu
  const byName = new Map(items.map((item) => [String(item.name).trim().toLowerCase(), item.id]))

  for (const screen of doc.screens ?? []) {
    for (const node of screen.sections ?? []) {
      if (node.media && (uploads.has(node.media.id) || !owned.has(node.media.id))) {
        delete node.media
        changes.push(`${screen.id}/${node.id}: removed test photograph`)
      }
      if (intended.includes(node.id) && node.hidden) {
        node.hidden = false
        changes.push(`${screen.id}/${node.id}: visible again`)
      }
      if (empty.includes(node.id) && !node.hidden) {
        node.hidden = true
        changes.push(`${screen.id}/${node.id}: hidden, the business has nothing for it`)
      }
      // A featured dish is bound to its catalogue record, and the copied title
      // it was built with is dropped in favour of the reference.
      if (node.variant === 'dine-feature' && !node.itemRef && node.title) {
        const ref = byName.get(node.title.trim().toLowerCase())
        if (ref) {
          node.itemRef = ref
          delete node.title
          changes.push(`${screen.id}/${node.id}: bound to ${ref}`)
        }
      }
      if (node.text && PLACEHOLDER_COPY.includes(node.text)) {
        delete node.text
        changes.push(`${screen.id}/${node.id}: removed placeholder copy`)
      }
    }
  }
  if (menuChanged) changes.push('catalogue: stable item ids assigned')
  return { doc, spec, menuChanged, changes, uploads }
}

const report = { dryRun: DRY, database: path.basename(localDatabase()), apps: [], mediaDeleted: 0 }

for (const app of fixtures.apps) {
  const project = db.query('select id, token, doc, spec from projects where token = ?').get(app.token)
  if (!project) {
    report.apps.push({ app: app.key, missing: true })
    continue
  }
  const { doc, spec, menuChanged, changes, uploads } = plan(project)
  if (changes.length && !DRY) {
    db.query('update projects set doc = ?, updated_at = ? where id = ?').run(
      JSON.stringify(doc),
      new Date().toISOString(),
      project.id,
    )
    if (menuChanged)
      db.query('update projects set spec = ?, updated_at = ? where id = ?').run(
        JSON.stringify(spec),
        new Date().toISOString(),
        project.id,
      )
  }
  let removed = 0
  if (uploads?.size) {
    removed = uploads.size
    if (!DRY) {
      for (const id of uploads) db.query('delete from media where id = ? and project_id = ?').run(id, project.id)
    }
    report.mediaDeleted += removed
  }
  report.apps.push({ app: app.key, changes, mediaDeleted: removed })
}

if (!DRY) {
  // Fixture state is disposable; nothing here belongs in a commit.
  fs.writeFileSync(
    path.join(os.tmpdir(), 'plattr-fixture-repair.json'),
    JSON.stringify(report, null, 2),
  )
}
console.log(JSON.stringify(report, null, 2))
