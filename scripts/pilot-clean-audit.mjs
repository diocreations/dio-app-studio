/**
 * Read-only audit of the four supervised-pilot businesses.
 *
 * Checks the saved local projects, their three concepts, the owner review page
 * and the customer preview. It does not create orders, edit a build or deploy.
 *
 *   bun scripts/pilot-clean-audit.mjs
 */
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const ORIGIN = process.env.PILOT_ORIGIN ?? 'http://127.0.0.1:5173'
const APPS = JSON.parse(await readFile(process.env.PILOT_APPS ?? '.chrome-qa/pilot-projects.json', 'utf8'))
const DB =
  process.env.PILOT_DB ??
  '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/017f96ff90c988f5b934d2789b404a0a0f513de2918297f1afba6b3581b20f80.sqlite'
const OUT = process.env.PILOT_OUT ?? 'docs/qa/supervised-pilot-2026-11-22'
await mkdir(OUT, { recursive: true })

const BANNED = [
  /owner[- ]confirmed detail/i,
  /benchmark/i,
  /lorem ipsum/i,
  /test phrase/i,
  /contaminat/i,
  /prices? include tax/i,
  /rates? include tax/i,
]
const EXPECT = {
  shop: { cta: 'Add to cart', screen: 'catalog' },
  restaurant: { cta: 'Request a table', screen: 'home' },
  salon: { cta: 'Request appointment', screen: 'catalog' },
  professional: { cta: 'Request a proposal', screen: 'home' },
}
const fields = `token,status,name,contact,email,vertical,json_extract(spec,'$.sourceReview.status') reviewStatus,json_extract(spec,'$.sourceReview.found') found,json_extract(spec,'$.sourceReview.missing') missing,json_extract(spec,'$.sourceReview.questions') questions`
const rows = JSON.parse(
  execFileSync('sqlite3', ['-json', DB, `select ${fields} from projects`], { maxBuffer: 20_000_000 }).toString(),
)
const byToken = new Map(rows.map((row) => [row.token, row]))

const report = []
for (const app of APPS) {
  const row = byToken.get(app.token)
  if (!row) {
    report.push({ site: app.site, direction: app.direction, ok: false, error: 'project missing' })
    continue
  }
  const menu = JSON.parse(
    execFileSync(
      'sqlite3',
      [
        DB,
        `select coalesce(json_group_array(json_object('name', value->>'$.name', 'items', json(value->>'$.items'))), '[]') from projects,json_each(spec,'$.menu') where token='${app.token}'`,
      ],
      { maxBuffer: 20_000_000 },
    ).toString() || '[]',
  )
  const items = menu.flatMap((section) =>
    Array.isArray(section.items) ? section.items : JSON.parse(section.items ?? '[]'),
  )
  const contact = {
    phone: row.contact || '',
    email: row.email || '',
    address: execFileSync('sqlite3', [DB, `select coalesce(json_extract(spec,'$.address'),'') from projects where token='${app.token}'`])
      .toString()
      .trim(),
  }
  const appResponse = await fetch(`${ORIGIN}/p/${app.token}/app`)
  const html = await appResponse.text()
  const reviewResponse = await fetch(`${ORIGIN}/p/${app.token}/review`, { headers: { cookie: app.cookie } })
  const reviewHtml = await reviewResponse.text()
  const workspaceResponse = await fetch(`${ORIGIN}/p/${app.token}`, { headers: { cookie: app.cookie } })
  const workspaceHtml = await workspaceResponse.text()
  const dashboardResponse = await fetch(`${ORIGIN}/api/projects/${app.token}/dashboard`, {
    headers: { cookie: app.cookie },
  })
  const expected = EXPECT[row.vertical] ?? EXPECT.shop
  report.push({
    site: app.site,
    direction: app.direction,
    ok:
      appResponse.status === 200 &&
      reviewResponse.status === 200 &&
      workspaceResponse.status === 200 &&
      dashboardResponse.status === 200 &&
      html.includes(expected.cta) &&
      html.includes('data-screen=') &&
      !BANNED.some((pattern) => pattern.test(html)),
    name: row.name,
    vertical: row.vertical,
    status: row.status,
    sourceReview: row.reviewStatus,
    contact,
    items: items.length,
    sections: menu.length,
    priced: items.filter((item) => item.price > 0).length,
    withPhoto: items.filter((item) => item.image?.url).length,
    missing: JSON.parse(row.missing),
    questions: JSON.parse(row.questions).map((question) => question.field),
    found: JSON.parse(row.found),
    preview: {
      status: appResponse.status,
      concept: /<body[^>]*data-concept="([^"]+)"/.exec(html)?.[1] ?? null,
      expectedCallToAction: expected.cta,
      hasCallToAction: html.includes(expected.cta),
      noIndex: html.includes('noindex'),
      bannedCopy: BANNED.filter((pattern) => pattern.test(html)).map(String),
      bytes: html.length,
    },
    ownerReview: {
      status: reviewResponse.status,
      hasFound: reviewHtml.includes('What we found'),
      hasMissing: reviewHtml.includes('What is missing or unconfirmed'),
      hasChecklist: reviewHtml.includes('Start here, in this order'),
      hasDirectCatalogueLink: reviewHtml.includes('/edit?panel=catalog'),
    },
    workspace: {
      status: workspaceResponse.status,
      hasChecklist: workspaceHtml.includes('Before you approve'),
      hasReviewLink: workspaceHtml.includes(`/p/${app.token}/review`),
    },
    dashboard: { status: dashboardResponse.status },
  })
}

await writeFile(
  `${OUT}/clean-project-audit.json`,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      origin: ORIGIN,
      apps: report.length,
      passed: report.filter((entry) => entry.ok).length,
      report,
    },
    null,
    2,
  ),
)
for (const entry of report)
  console.log(
    `${entry.site}/${entry.direction}: ${entry.ok ? 'ok' : 'FAILED'} · ${entry.items} items · ${entry.status} · ${entry.sourceReview}`,
  )
console.log(`${report.filter((entry) => entry.ok).length}/${report.length} clean previews and owner views passed`)
