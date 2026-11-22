/**
 * Does every visible element in the actual benchmark app have a document key?
 *
 *   bun scripts/generation-benchmark-editability.mjs
 *
 * Reads each project's live document with its owner cookie, fetches the actual
 * customer HTML, and runs the same slot audit the editor relies on. This is a
 * coverage audit, not a substitute for the browser save/reload pass.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { auditElementCoverage, elementSlots, SYSTEM_CONTROLLED } from '../src/worker/editability'

const API = process.env.BENCH_API ?? 'http://127.0.0.1:5173'
const ROOT = process.env.BENCH_ROOT ?? 'docs/qa/generation-benchmark-2026-11-21'
const APPS = process.env.BENCH_APPS ?? '.chrome-qa/generation-benchmark-apps.json'
const apps = JSON.parse(await readFile(APPS, 'utf8'))
const rows = []
for (const app of apps) {
  const docResponse = await fetch(`${API}/api/projects/${app.token}/doc`, {
    headers: { cookie: app.cookie },
  })
  if (!docResponse.ok) {
    rows.push({ site: app.site, direction: app.direction, token: app.token, error: `doc ${docResponse.status}` })
    continue
  }
  const { doc } = await docResponse.json()
  const html = await fetch(`${API}/p/${app.token}/app`).then((response) => response.text())
  const slots = elementSlots(html)
  const audit = auditElementCoverage(doc, html)
  rows.push({
    site: app.site,
    direction: app.direction,
    token: app.token,
    sections: doc.screens?.reduce((total, screen) => total + screen.sections.length, 0) ?? 0,
    screens: doc.screens?.length ?? 0,
    slots: slots.length,
    copies: audit.copies,
    copiedElements: audit.copiedElements,
    missing: audit.missing,
    duplicates: audit.duplicates,
    pass: audit.missing.length === 0 && audit.duplicates.length === 0,
  })
}
await writeFile(`${ROOT}/editability.json`, JSON.stringify({ rows, systemControlled: SYSTEM_CONTROLLED }, null, 2))
for (const row of rows) {
  console.log(
    `${row.site}/${row.direction.padEnd(9)} ${row.pass ? 'PASS' : 'FAIL'} slots:${String(row.slots).padEnd(4)} ` +
      `copies:${String(row.copies).padEnd(4)} missing:${row.missing?.length ?? '?'} duplicates:${row.duplicates?.length ?? '?'}`,
  )
  for (const key of row.missing ?? []) console.log(`  missing ${key}`)
  for (const key of row.duplicates ?? []) console.log(`  duplicate ${key}`)
}
console.log(`${rows.filter((row) => row.pass).length}/${rows.length} pass -> ${ROOT}/editability.json`)
