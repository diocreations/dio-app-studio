#!/usr/bin/env bun
/**
 * Verify the private session-access packs without printing links, tokens or
 * keys. Signs in with each derived owner key, checks the workspace/review and
 * customer app, then signs the test session out again.
 *
 *   bun scripts/pilot-access-verify.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const dir = path.join(root, '.chrome-qa/session-access')
const origin = process.env.PILOT_ORIGIN ?? 'http://127.0.0.1:5173'
const sites = ['yarmouth', 'padella', 'bluetit', 'afl']
let failed = 0

for (const site of sites) {
  const links = fs
    .readFileSync(path.join(dir, `${site}-links.txt`), 'utf8')
    .split('\n')
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const [direction, owner, app] = line.split('\t')
      return { direction, owner, app }
    })
  const keys = new Map(
    fs
      .readFileSync(path.join(dir, `${site}-keys.txt`), 'utf8')
      .split('\n')
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const [direction, , key] = line.split('\t')
        return [direction, key]
      }),
  )
  for (const entry of links) {
    const key = keys.get(entry.direction)
    const label = `${site}/${entry.direction}`
    if (!key) {
      console.log(`${label}: FAIL no key`)
      failed++
      continue
    }
    const login = await fetch(`${entry.owner}/dashboard/login`, {
      method: 'POST',
      body: new URLSearchParams({ key }),
      redirect: 'manual',
    })
    const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]
    if (login.status !== 303 || !cookie) {
      console.log(`${label}: FAIL login ${login.status}`)
      failed++
      continue
    }
    const auth = { headers: { cookie } }
    const workspace = await fetch(entry.owner, auth)
    const review = await fetch(`${entry.owner}/review`, auth)
    const app = await fetch(entry.app)
    const logout = await fetch(`${entry.owner}/dashboard/logout`, {
      method: 'POST',
      headers: { cookie },
      redirect: 'manual',
    })
    const ok = workspace.status === 200 && review.status === 200 && app.status === 200 && logout.status === 303
    console.log(
      `${label}: ${ok ? 'ok' : 'FAIL'} workspace=${workspace.status} review=${review.status} app=${app.status} logout=${logout.status}`,
    )
    if (!ok) failed++
  }
}

console.log(failed ? `${failed} access check(s) failed` : '12/12 owner access checks passed; test sessions signed out')
process.exit(failed ? 1 : 0)
