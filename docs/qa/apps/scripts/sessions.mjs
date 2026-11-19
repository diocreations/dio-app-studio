/**
 * Local owner sessions for the QA fixtures.
 *
 * The owner dashboards need a session cookie that the app itself would issue on
 * sign-in, so the harness mints one straight into the local Wrangler D1 file.
 * Nothing here runs against a hosted database.
 */
import { Database } from 'bun:sqlite'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const repoRoot = path.join(here, '../../../..')

/** The application database, ignoring wrangler's own metadata file. */
export function localDatabase() {
  const dir = path.join(repoRoot, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject')
  if (process.env.PLATTR_DB) return process.env.PLATTR_DB
  const candidates = fs
    .readdirSync(dir)
    .filter((file) => /\.sqlite$/.test(file) && !file.startsWith('metadata'))
    .map((file) => path.join(dir, file))
  const found = candidates.find((file) => {
    try {
      return Boolean(
        new Database(file)
          .query("select name from sqlite_master where type = 'table' and name = 'projects'")
          .get(),
      )
    } catch {
      return false
    }
  })
  if (!found) throw new Error(`No local D1 database with a projects table under ${dir}`)
  return found
}

export function mintSessions(tokens, out) {
  const db = new Database(localDatabase())
  const cookies = {}
  for (const token of tokens) {
    const row = db.query('select id from projects where token = ?').get(token)
    if (!row) {
      console.error(`missing project ${token}; import it again and update fixtures.json`)
      continue
    }
    const id =
      'own_' +
      Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) => byte.toString(16).padStart(2, '0')).join('')
    const now = new Date().toISOString()
    db.query(
      'insert into owner_sessions (id, project_id, created_at, expires_at, last_seen_at) values (?, ?, ?, ?, ?)',
    ).run(id, row.id, now, new Date(Date.now() + 30 * 864e5).toISOString(), now)
    cookies[token] = { name: `plattr_owner_${token.slice(0, 12)}`, value: id }
  }
  const target = out ?? cookieFile()
  fs.writeFileSync(target, JSON.stringify(cookies, null, 2))
  return { target, count: Object.keys(cookies).length }
}

export const cookieFile = () =>
  process.env.QA_COOKIES || path.join(os.tmpdir(), 'plattr-qa-owner-cookies.json')

if (import.meta.main) {
  const fixtures = JSON.parse(fs.readFileSync(path.join(here, 'fixtures.json'), 'utf8'))
  const { target, count } = mintSessions(fixtures.apps.map((app) => app.token))
  console.log(`wrote ${count} owner sessions to ${target}`)
}
