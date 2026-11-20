#!/usr/bin/env bun
/**
 * Rotate a Worker's `OWNER_SECRET` and write the owner keys it implies.
 *
 *   bun scripts/owner-keys.mjs --config wrangler.staging.jsonc \
 *     --database plattr-staging --host https://plattr-staging.dio-app.workers.dev \
 *     --out .wrangler/owner-keys/plattr-staging.txt
 *
 * Cloudflare never returns a secret value, so the only moment the derived
 * per-project keys are knowable is the moment the secret is written. Rotating
 * from the dashboard would therefore lock every business out until each key was
 * reissued by hand, which is why rotating and writing the keys are one step.
 *
 * The owner key is `hmac_sha256(OWNER_SECRET, 'plattr-owner-key-v1:' + token)`,
 * first 32 hex characters — the same derivation as `src/worker/ownerAuth.ts`.
 *
 * Order matters: the project list is read first, so a database that cannot be
 * reached stops the run before the secret changes. The keys are written to disk
 * immediately after the secret is written, before sessions are cleared, so a
 * later failure can never leave a rotated secret with no keys on record.
 *
 * Sessions are separate from keys: an owner session is a random row in
 * `owner_sessions`. Rotating the secret does not end existing sessions, so this
 * deletes them, which is what makes the rotation complete. `--keep-sessions`
 * only changes the secret; the sign-in check always removes the one session it
 * creates itself.
 *
 * The secret itself is generated here and never printed, logged or written to
 * a file.
 */
import { createHmac, randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { runWrangler, runWranglerStdout } from './backup/r2.mjs'

const args = process.argv.slice(2)
const flag = (name, fallback = '') => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : fallback
}
const config = flag('config')
const database = flag('database')
const host = flag('host').replace(/\/$/, '')
const out = path.resolve(flag('out', '.wrangler/owner-keys/keys.txt'))
const keepSessions = args.includes('--keep-sessions')
if (!config || !database) {
  console.error(
    'usage: bun scripts/owner-keys.mjs --config <wrangler.jsonc> --database <d1 name> [--host <origin>] [--out <file>] [--keep-sessions]',
  )
  process.exit(2)
}
if (!fs.existsSync(config)) {
  console.error(`no ${config} in this directory; run this from the repository root`)
  process.exit(2)
}

/** The derivation in `src/worker/ownerAuth.ts`, for one token. */
function ownerKey(secret, token) {
  return createHmac('sha256', secret).update('plattr-owner-key-v1:' + token).digest('hex').slice(0, 32)
}

function execute(command) {
  const parsed = JSON.parse(
    runWranglerStdout(['d1', 'execute', database, '--remote', '-y', '--json', '--command', command]),
  )
  const result = Array.isArray(parsed) ? parsed[0] : parsed
  return { rows: result?.results ?? [], changes: result?.meta?.changes ?? 0 }
}

function projects() {
  const { rows } = execute('SELECT token, name, vertical FROM projects ORDER BY created_at')
  if (!rows.length) throw new Error(`no projects came back from ${database}; not rotating a secret nothing can use`)
  return rows
}

console.log(`${database}: reading projects before anything changes`)
const list = projects()
console.log(`${list.length} projects`)

const secret = randomBytes(32).toString('hex')
runWrangler(['secret', 'put', 'OWNER_SECRET', '--config', config], { input: secret + '\n' })
console.log(`rotated OWNER_SECRET on the Worker in ${config}`)

const keys = list.map((project) => ({ ...project, key: ownerKey(secret, project.token) }))
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(
  out,
  keys.map((project) => `${project.name}\t${project.vertical}\t${project.token}\t${project.key}`).join('\n') + '\n',
  { mode: 0o600 },
)
console.log(`${keys.length} owner keys written to ${out} (mode 600, gitignored)`)

if (keepSessions) {
  console.log('kept existing owner sessions (--keep-sessions)')
} else {
  console.log(`deleted ${execute('DELETE FROM owner_sessions').changes} existing owner session(s)`)
}

async function verify() {
  if (!host) return 'sign-in not checked (no --host)'
  const token = list[0].token
  const wrong = await fetch(`${host}/p/${token}/dashboard/login`, {
    method: 'POST',
    body: new URLSearchParams({ key: 'not-the-key' }),
    redirect: 'manual',
  })
  const right = await fetch(`${host}/p/${token}/dashboard/login`, {
    method: 'POST',
    body: new URLSearchParams({ key: keys[0].key }),
    redirect: 'manual',
  })
  if (wrong.status !== 401) throw new Error(`${host} answered ${wrong.status} for a wrong key, not 401`)
  const session = right.headers.get('set-cookie') ?? ''
  if (right.status !== 303 || !/plattr_owner_/.test(session))
    throw new Error(`${host} answered ${right.status} for the derived key, not 303 with a session`)
  const cookie = session.split(';')[0]
  const id = cookie.slice(cookie.indexOf('=') + 1)
  const dashboard = await fetch(`${host}/api/projects/${token}/dashboard`, {
    headers: { cookie },
    redirect: 'manual',
  })
  if (dashboard.status !== 200) throw new Error(`${host} dashboard answered ${dashboard.status} with the new session`)
  // Only the session this check created is removed: with --keep-sessions the
  // operator's own sessions are none of this script's business.
  if (!/^own_[a-f0-9]{48}$/.test(id)) throw new Error(`unexpected session id in the login cookie: ${id}`)
  execute(`DELETE FROM owner_sessions WHERE id = '${id}'`)
  return `signed in at ${host} as ${list[0].name}: wrong key 401, derived key 303, dashboard 200, check session removed`
}

const check = await verify()
console.log('')
// Names and tokens only: a token is in every dashboard URL, a key is the
// credential for it. Printing keys to a terminal is how they end up in a
// report, a screenshot or a log.
for (const project of keys) console.log(`${project.name}\t${project.token}`)
console.log(`\n${check}`)
console.log(`owner keys are in ${out}; read them there, they are not printed`)
