#!/usr/bin/env bun
/**
 * Build private, per-business owner access packs for moderated sessions.
 *
 * Writes links and owner keys to separate files under the gitignored
 * .chrome-qa/session-access directory. Values are never printed. The owner key
 * is derived from the local OWNER_SECRET in .dev.vars with the same algorithm
 * as src/worker/ownerAuth.ts.
 *
 *   bun scripts/pilot-access-pack.mjs
 */
import { createHmac } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const appsFile = path.join(root, '.chrome-qa/pilot-projects.json')
const varsFile = path.join(root, '.dev.vars')
const outDir = path.join(root, '.chrome-qa/session-access')
const origin = process.env.PILOT_ORIGIN ?? 'http://127.0.0.1:5173'

if (!fs.existsSync(appsFile)) throw new Error(`missing ${appsFile}`)
if (!fs.existsSync(varsFile)) throw new Error(`missing ${varsFile}`)

const vars = Object.fromEntries(
  fs
    .readFileSync(varsFile, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const at = line.indexOf('=')
      return [line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^['"]|['"]$/g, '')]
    }),
)
if (!vars.OWNER_SECRET) throw new Error('OWNER_SECRET is not set in .dev.vars')

const apps = JSON.parse(fs.readFileSync(appsFile, 'utf8'))
const groups = new Map()
for (const app of apps) {
  const key = createHmac('sha256', vars.OWNER_SECRET)
    .update('plattr-owner-key-v1:' + app.token)
    .digest('hex')
    .slice(0, 32)
  const group = groups.get(app.site) ?? []
  group.push({ ...app, key })
  groups.set(app.site, group)
}

fs.mkdirSync(outDir, { recursive: true })
for (const [site, entries] of groups) {
  const links = entries
    .map((entry) => `${entry.direction}\t${origin}/p/${entry.token}\t${origin}/p/${entry.token}/app`)
    .join('\n')
  const keys = entries
    .map((entry) => `${entry.direction}\t${entry.token}\t${entry.key}`)
    .join('\n')
  const linksFile = path.join(outDir, `${site}-links.txt`)
  const keysFile = path.join(outDir, `${site}-keys.txt`)
  fs.writeFileSync(
    linksFile,
    `# Private owner links for ${site}. Keep with the moderator; do not send in the same message as the key.\n${links}\n`,
    { mode: 0o600 },
  )
  fs.writeFileSync(
    keysFile,
    `# Owner keys for ${site}. Transfer one to the owner's password manager, then remove this file.\n${keys}\n`,
    { mode: 0o600 },
  )
}

console.log(
  JSON.stringify({
    output: path.relative(root, outDir),
    businesses: [...groups.keys()],
    links: [...groups.values()].reduce((sum, entries) => sum + entries.length, 0),
    note: 'links and keys are separate, mode 600, gitignored; no value was printed',
  }),
)
