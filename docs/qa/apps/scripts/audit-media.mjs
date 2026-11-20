/**
 * Unused uploads, reported and never deleted here.
 *
 * The rule lives in src/worker/media.ts and src/worker/mediaCleanup.ts: a row is
 * a candidate only when no current document, no saved version and no stored
 * record names it, and it is older than the grace period. This script reads the
 * local database directly for a quick answer; the Worker is the only thing that
 * can delete the stored variants, so removal goes through
 * `scripts/media-cleanup.mjs`.
 *
 *   bun docs/qa/apps/scripts/audit-media.mjs
 *   GRACE_HOURS=1 bun docs/qa/apps/scripts/audit-media.mjs
 */
import { Database } from 'bun:sqlite'
import { orphanMedia } from '../../../../src/worker/media'
import { localDatabase } from './sessions.mjs'

const graceHours = Number(process.env.GRACE_HOURS || 24)
const db = new Database(localDatabase())

const rows = db.prepare('SELECT id, project_id, created_at, bytes FROM media ORDER BY created_at').all()
const projects = db.prepare('SELECT id, token, name, doc, spec FROM projects').all()

let total = 0
let unreadable = 0
for (const project of projects) {
  const media = rows.filter((row) => row.project_id === project.id)
  if (!media.length) continue
  const versions = db
    .prepare('SELECT id, doc FROM doc_versions WHERE project_id = ?')
    .all(project.id)
    .map((version) => {
      try {
        return JSON.parse(version.doc)
      } catch {
        // A version that cannot be read might name any image. The Worker refuses
        // to delete anything in this state; the report says so rather than
        // guessing that the version references nothing.
        unreadable += 1
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
    ? `\n${total} upload${total === 1 ? '' : 's'} referenced by nothing older than ${graceHours}h.\nRemove them with: bun scripts/media-cleanup.mjs --token <token> --apply --backup <manifest>`
    : `\nNo unused uploads older than ${graceHours}h.`,
)
if (unreadable)
  console.log(
    `\n${unreadable} saved version${unreadable === 1 ? '' : 's'} could not be read. Cleanup refuses to run until they are repaired; deleting images now could break a restorable design.`,
  )
