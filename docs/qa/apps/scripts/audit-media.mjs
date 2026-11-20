/**
 * Unused uploads, reported and never deleted.
 *
 * The rule is in src/worker/media.ts and has tests: a row is a candidate only
 * when no current document, no saved version and no other stored record names
 * it, and it is older than the grace period. Removing it also has to remove the
 * stored objects, which only the worker can do with its bucket binding, so this
 * script stops at a list an operator can read. Run it after a repair or before
 * a storage review.
 *
 *   bun docs/qa/apps/scripts/audit-media.mjs
 *   GRACE_HOURS=1 bun docs/qa/apps/scripts/audit-media.mjs
 */
import { Database } from 'bun:sqlite'
import { orphanMedia } from '../../../../src/worker/media'
import { localDatabase } from './sessions.mjs'

const graceHours = Number(process.env.GRACE_HOURS || 24)
const db = new Database(localDatabase())

const rows = db
  .prepare('SELECT id, project_id, created_at, bytes FROM media ORDER BY created_at')
  .all()

const projects = db.prepare('SELECT id, token, name, doc, spec FROM projects').all()

let total = 0
for (const project of projects) {
  const media = rows.filter((row) => row.project_id === project.id)
  if (!media.length) continue
  const versions = db
    .prepare('SELECT doc FROM doc_versions WHERE project_id = ?')
    .all(project.id)
    .map((version) => {
      try {
        return JSON.parse(version.doc)
      } catch {
        return null
      }
    })
  const stored = [JSON.parse(project.doc || 'null'), JSON.parse(project.spec || 'null'), ...versions]
  const candidates = orphanMedia(media, stored, { graceHours })
  if (!candidates.length) continue
  total += candidates.length
  console.log(`${project.name} (${project.token})`)
  for (const id of candidates) {
    const row = media.find((entry) => entry.id === id)
    const age = Math.round((Date.now() - Date.parse(row.created_at)) / 3600000)
    console.log(`  ${id}  ${row.created_at.slice(0, 10)}  ${age}h  ${Math.round(row.bytes / 1024)}kB`)
  }
}

console.log(
  total
    ? `\n${total} upload${total === 1 ? '' : 's'} referenced by nothing older than ${graceHours}h. Deleting one is an owner action in the app, which removes the stored objects too.`
    : `\nNo unused uploads older than ${graceHours}h.`,
)
