/* Mint local owner sessions for the fixture projects so the parity harness can
   open each editor. Reads the projects straight out of the local Wrangler D1
   file, so it needs a dev server that has already served these projects. */
import { Database } from 'bun:sqlite'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const config = JSON.parse(fs.readFileSync(new URL('./apps.json', import.meta.url), 'utf8'))
const repoRoot = path.join(path.dirname(new URL(import.meta.url).pathname), '../../../../..')
const stateDir = path.join(repoRoot, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject')
// The folder also holds wrangler's own metadata database, so pick the file
// that actually carries the application tables.
const candidates = process.env.PLATTR_DB
  ? [process.env.PLATTR_DB]
  : fs
      .readdirSync(stateDir)
      .filter((file) => /\.sqlite$/.test(file) && !file.startsWith('metadata'))
      .map((file) => path.join(stateDir, file))

const hasProjects = (file) => {
  try {
    return Boolean(
      new Database(file)
        .query("select name from sqlite_master where type = 'table' and name = 'projects'")
        .get(),
    )
  } catch {
    return false
  }
}

const dbPath = candidates.find(hasProjects)

if (!dbPath) {
  console.error(`No local D1 database with a projects table under ${stateDir}.`)
  process.exit(1)
}

const out = process.env.PARITY_COOKIES || path.join(os.tmpdir(), 'plattr-owner-cookies.json')
const db = new Database(dbPath)
const cookies = {}
for (const app of config.apps) {
  const row = db.query('select id from projects where token = ?').get(app.token)
  if (!row) {
    console.error(`missing project ${app.key} (${app.token}); import it again and update apps.json`)
    continue
  }
  const id = 'own_' + Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('')
  const now = new Date().toISOString()
  const expires = new Date(Date.now() + 30 * 864e5).toISOString()
  db.query(
    'insert into owner_sessions (id, project_id, created_at, expires_at, last_seen_at) values (?, ?, ?, ?, ?)',
  ).run(id, row.id, now, expires, now)
  cookies[app.token] = { name: `plattr_owner_${app.token.slice(0, 12)}`, value: id }
}
fs.writeFileSync(out, JSON.stringify(cookies, null, 2))
console.log(`wrote ${Object.keys(cookies).length} owner sessions to ${out}`)
