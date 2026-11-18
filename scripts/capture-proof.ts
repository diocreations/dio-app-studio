/** Captures a real import into `src/worker/proof.ts`.
 *
 *  The landing page shows a genuine run — the URL, the pages read, the items and
 *  prices that came back, and the app rendered from exactly that data. This
 *  script produces the snapshot so the page loads instantly and never hammers a
 *  stranger's site on every visit.
 *
 *    bun scripts/capture-proof.ts https://books.toscrape.com/
 */

import { writeFile } from 'node:fs/promises'
import { importWebsite } from '../src/worker/importer'

const url = process.argv[2] ?? 'https://books.toscrape.com/'

const report = await importWebsite(url)
const payload = {
  source: report.source,
  host: report.host,
  pages: report.pages,
  capturedAt: new Date().toISOString().slice(0, 10),
  site: report.site,
  found: report.found,
  missing: report.missing,
}

const file = `/** A real import, captured once so the landing page can show it instantly.
 *  Regenerate with: bun scripts/capture-proof.ts ${payload.source}
 *  Captured ${payload.capturedAt}: ${payload.pages} pages, ${payload.site.menu.reduce((total, section) => total + section.items.length, 0)} items.
 *  Nothing here is hand-written — it is the importer's own output. */
import type { ImportedSite } from './importer'
import { buildSpec, type AppSpec, type SiteInfo } from './pricing'

export type SampleImport = {
  source: string
  host: string
  pages: number
  capturedAt: string
  site: ImportedSite
  found: string[]
  missing: string[]
}

export const SAMPLE_IMPORT: SampleImport = ${JSON.stringify(payload, null, 2)}

/** The app built from that read, with no edits. */
export function sampleSpec(): AppSpec {
  const { site } = SAMPLE_IMPORT
  const details: SiteInfo = {
    menu: site.menu,
    category: site.category,
    story: site.story,
    hours: site.hours,
    phone: site.phone,
    address: site.address,
    email: site.email,
    website: site.website,
    currency: site.currency,
    socials: site.socials,
  }
  return buildSpec({
    name: site.name,
    vertical: site.vertical,
    accent: site.accent,
    logo: 'BT',
    features: site.features,
    tagline: site.tagline,
    site: details,
  })
}

export function sampleTotals(): { items: number; sections: number; priced: number } {
  const items = SAMPLE_IMPORT.site.menu.flatMap((section) => section.items)
  return {
    items: items.length,
    sections: SAMPLE_IMPORT.site.menu.length,
    priced: items.filter((item) => item.price > 0).length,
  }
}
`

await writeFile('src/worker/proof.ts', file)
const items = payload.site.menu.reduce((total, section) => total + section.items.length, 0)
console.log(`captured ${payload.source}: ${payload.pages} pages, ${items} items -> src/worker/proof.ts`)
