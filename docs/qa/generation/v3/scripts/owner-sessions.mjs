/* Mint local owner sessions for the parity fixtures. The database discovery and
   session insert live in ../apps/scripts/sessions.mjs so both harnesses share
   one implementation. */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mintSessions } from '../../../apps/scripts/sessions.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const config = JSON.parse(fs.readFileSync(path.join(here, 'apps.json'), 'utf8'))
const { target, count } = mintSessions(config.apps.map((app) => app.token))
console.log(`wrote ${count} owner sessions to ${target}`)
