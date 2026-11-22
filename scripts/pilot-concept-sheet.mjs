/**
 * Build the moderator's private concept-comparison sheet for the supervised
 * pilot. It is intentionally an untracked local file: project tokens are
 * capabilities for the customer preview and do not belong in a report.
 *
 *   bun scripts/pilot-concept-sheet.mjs
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const APPS = JSON.parse(await readFile(process.env.PILOT_APPS ?? '.chrome-qa/pilot-projects.json', 'utf8'))
const ORIGIN = process.env.PILOT_ORIGIN ?? 'http://127.0.0.1:5173'
const OUT = process.env.PILOT_SHEET ?? '.chrome-qa/pilot-concepts.html'
const SHOTS = process.env.PILOT_SHOTS ?? 'docs/qa/supervised-pilot-2026-11-22/screens'
const ONLY = process.env.PILOT_SITE ?? ''
const DIRS = {
  yarmouth: ['minimal', 'editorial', 'lifestyle'],
  padella: ['editorial', 'modern', 'luxe'],
  bluetit: ['minimal', 'editorial', 'luxe'],
  afl: ['classic', 'minimal', 'editorial'],
}
const LABEL = {
  yarmouth: 'Yarmouth Oilskins · retail',
  padella: 'Padella · restaurant',
  bluetit: 'Blue Tit London · salon',
  afl: 'Architecture for London · professional services',
}

if (ONLY && !DIRS[ONLY]) throw new Error(`unknown PILOT_SITE: ${ONLY}`)
const sections = Object.entries(DIRS)
  .filter(([site]) => !ONLY || site === ONLY)
  .map(([site, directions]) => {
    const cards = directions
      .map((direction) => {
        const app = APPS.find((entry) => entry.site === site && entry.direction === direction)
        if (!app) return ''
        const shot = `${SHOTS}/${site}--${direction}--home--390.png`
        return `<a class="concept" href="${ORIGIN}/p/${app.token}/app" target="_blank" rel="noreferrer">
          <img src="../${shot}" alt="${site} ${direction} home screen" />
          <b>${direction}</b><span>Open customer preview</span>
        </a>`
      })
      .join('')
    return `<section><h2>${LABEL[site]}</h2><div class="row">${cards}</div></section>`
  })
  .join('\n')

await mkdir('.chrome-qa', { recursive: true })
await writeFile(
  OUT,
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pilot concept sheet</title><style>
body{font:15px/1.5 system-ui,sans-serif;margin:32px;background:#f7f1e7;color:#17110d}h1{font:600 34px Georgia,serif;margin:0 0 6px}h2{font:600 22px Georgia,serif;margin:30px 0 10px}p{color:#6c5b4c}.row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;max-width:1000px}.concept{display:grid;gap:6px;text-decoration:none;color:inherit;background:#fffdf9;border:1px solid #ddd0c1;border-radius:14px;padding:10px}.concept img{width:100%;display:block;border-radius:9px;border:1px solid #eee3d6}.concept b{font-size:14px;text-transform:capitalize}.concept span{font-size:12px;color:#7a6757}@media(max-width:700px){.row{grid-template-columns:1fr}}
</style></head><body>
<h1>Pilot concept sheet</h1><p>Open each preview in a new tab. The moderator reveals the three concepts before starting the concept-choice timer. This file is local and untracked.</p>
${sections}
</body></html>`,
)
console.log(OUT)
