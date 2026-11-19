// Batch-2 document persistence and version-restore rehearsal against the dev D1.
import { readFileSync } from 'node:fs'

const ORIGIN = process.env.PLATTR_ORIGIN || 'http://127.0.0.1:8795'
const APPS = ['cafe', 'gym', 'clinic', 'property', 'studio']

function cookie(key) {
  const row = readFileSync(`.wrangler/qa-batch2/${key}.cookies`, 'utf8')
    .split('\n')
    .filter((line) => line && !line.startsWith('#') || line.startsWith('#HttpOnly_'))
    .map((line) => line.replace(/^#HttpOnly_/, '').split('\t'))
    .find((parts) => parts[5]?.startsWith('plattr_owner_'))
  if (!row) throw new Error(`no owner cookie for ${key}`)
  return `${row[5]}=${row[6]}`
}

for (const key of APPS) {
  const token = JSON.parse(readFileSync(`.wrangler/qa-batch2/${key}.json`, 'utf8')).token
  const headers = { cookie: cookie(key), origin: ORIGIN, 'content-type': 'application/json' }
  const docResponse = await fetch(`${ORIGIN}/api/projects/${token}/doc`, { headers })
  if (!docResponse.ok) throw new Error(`${key} doc ${docResponse.status}`)
  const { doc } = await docResponse.json()
  const home = doc.screens.find((screen) => screen.kind === 'home')
  const first = home.sections[0]
  const second = home.sections[1]
  // Establish the clean document as the baseline before editing it.
  const baseline = await fetch(`${ORIGIN}/api/projects/${token}/doc`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ doc }),
  })
  if (!baseline.ok) throw new Error(`${key} baseline ${baseline.status}`)
  const edited = structuredClone(doc)
  const editedHome = edited.screens.find((screen) => screen.kind === 'home')
  editedHome.sections[0].title = `${first.title} · QA`
  editedHome.sections[1].hidden = true
  const put = await fetch(`${ORIGIN}/api/projects/${token}/doc`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ doc: edited }),
  })
  if (!put.ok) throw new Error(`${key} put ${put.status}: ${await put.text()}`)
  const rendered = await (await fetch(`${ORIGIN}/p/${token}/app`)).text()
  if (!rendered.includes('· QA')) throw new Error(`${key} edit not rendered`)
  if (rendered.includes(`data-sec="${second.id}"`)) throw new Error(`${key} hidden section still rendered`)

  const restore = await fetch(`${ORIGIN}/api/projects/${token}/doc`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ doc }),
  })
  if (!restore.ok) throw new Error(`${key} restore ${restore.status}: ${await restore.text()}`)
  const restored = await (await fetch(`${ORIGIN}/p/${token}/app`)).text()
  if (restored.includes('· QA')) throw new Error(`${key} restore kept edit`)
  if (!restored.includes(`data-sec="${second.id}"`)) throw new Error(`${key} restore did not unhide`)
  console.log(`${key}: edited title and visibility persisted; original document restored`)
}
