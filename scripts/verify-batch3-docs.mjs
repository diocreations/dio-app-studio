// Batch-3 document persistence and version-restore rehearsal against the dev D1.
import { readFileSync } from 'node:fs'

const ORIGIN = process.env.PLATTR_ORIGIN || 'http://127.0.0.1:8795'
const APPS = ['trades', 'auto', 'ecommerce', 'courses', 'finance']

for (const key of APPS) {
  const { token, cookie } = JSON.parse(readFileSync(`.wrangler/qa-batch3/${key}.json`, 'utf8'))
  const headers = { cookie, origin: ORIGIN, 'content-type': 'application/json' }
  const docResponse = await fetch(`${ORIGIN}/api/projects/${token}/doc`, { headers })
  if (!docResponse.ok) throw new Error(`${key} doc ${docResponse.status}`)
  const { doc } = await docResponse.json()
  const home = doc.screens.find((screen) => screen.kind === 'home')
  const first = home.sections[0]
  const second = home.sections[1]
  // Establish the clean document as the version baseline before editing it.
  const baseline = await fetch(`${ORIGIN}/api/projects/${token}/doc`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ doc }),
  })
  if (!baseline.ok) throw new Error(`${key} baseline ${baseline.status}`)
  const edited = structuredClone(doc)
  edited.screens.find((screen) => screen.kind === 'home').sections[0].title = `${first.title} · QA`
  edited.screens.find((screen) => screen.kind === 'home').sections[1].hidden = true
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
  console.log(`${key}: title and visibility edit persisted; original document restored`)
}
