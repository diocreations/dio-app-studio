import { describe, expect, test } from 'bun:test'
import { cleanMenu } from '../src/worker/importer'
import type { MenuSection, VerticalId } from '../src/worker/types'

/**
 * Regression tests driven by the five live crawls that were actually run
 * (`docs/qa/live-discovery-2026-11-20`). The stored reports are the evidence:
 * re-cleaning their raw catalogue must remove the faults the run exposed while
 * preserving every genuine price and name.
 */

type Report = { site: { vertical: VerticalId; menu: MenuSection[]; name: string } }

async function report(site: string): Promise<Report> {
  const text = await Bun.file(`docs/qa/live-discovery-2026-11-20/${site}/report.json`).text()
  return JSON.parse(text) as Report
}

function reclean(site: Report) {
  return cleanMenu(site.site.menu, site.site.vertical)
}

describe('a repeated number is not a price', () => {
  test('Pimlico Plumbers cannot produce the invented £1,000 service prices', async () => {
    const stored = await report('service')
    const raw = stored.site.menu.flatMap((section) => section.items).filter((item) => item.price > 0)
    // The crawl really did carry nine items at one identical figure.
    expect(raw.length).toBeGreaterThanOrEqual(9)
    expect(new Set(raw.map((item) => item.price)).size).toBe(1)

    const { sections, quality } = reclean(stored)
    const kept = sections.flatMap((section) => section.items)
    expect(kept.length).toBeGreaterThan(0)
    // Every invented price is gone, and each removal is recorded with a reason.
    expect(kept.every((item) => item.price === 0)).toBe(true)
    expect(quality.suspectPrices.length).toBeGreaterThanOrEqual(9)
  })

  test('genuine, varied prices survive the same guard', async () => {
    for (const site of ['buttertales', 'dishoom']) {
      const stored = await report(site)
      const before = stored.site.menu
        .flatMap((section) => section.items)
        .filter((item) => item.price > 0)
      const { sections } = reclean(stored)
      const after = sections.flatMap((section) => section.items).filter((item) => item.price > 0)
      expect(after.length, `${site} priced items`).toBe(before.length)
      expect(new Set(after.map((item) => item.price)).size).toBeGreaterThan(1)
    }
  })

  test('a two-item page is not treated as uniform evidence', async () => {
    const menu: MenuSection[] = [
      { name: 'Repairs', items: [{ name: 'Leak repair', desc: 'Same day', price: 12000 }, { name: 'Boiler service', desc: 'Annual', price: 12000 }] },
    ]
    const { sections } = cleanMenu(menu, 'trades')
    // Two identical prices can be a real tariff; five cannot be a coincidence.
    expect(sections.flatMap((section) => section.items).every((item) => item.price === 12000)).toBe(true)
  })
})

describe('navigation is not catalogue', () => {
  test('RHS no longer sells its own navigation', async () => {
    const stored = await report('complex')
    const { sections, quality } = reclean(stored)
    const names = sections.flatMap((section) => section.items.map((item) => item.name))

    expect(names.some((name) => /rsaquo|&[a-z]+;|›|»/i.test(name))).toBe(false)
    expect(names.some((name) => /^(about us|contact|home|shop all|delivery|returns)$/i.test(name))).toBe(false)
    // The drop is reported, not silent.
    expect(quality.dropped.some((entry) => entry.reason === 'navigation')).toBe(true)
  })

  test('footer and promotional labels are rejected in any trade', async () => {
    const menu: MenuSection[] = [
      {
        name: 'Shop',
        items: [
          { name: 'Gift card', desc: '', price: 5000 },
          { name: 'Delivery & returns ›', desc: '', price: 0 },
          { name: 'About us', desc: '', price: 0 },
          { name: 'Monstera', desc: 'Indoor plant', price: 2400 },
        ],
      },
    ]
    const { sections } = cleanMenu(menu, 'shop')
    const names = sections.flatMap((section) => section.items.map((item) => item.name))
    expect(names).toContain('Monstera')
    expect(names.some((name) => /delivery|about us/i.test(name))).toBe(false)
  })

  test('entities are decoded before a name is stored', async () => {
    const menu: MenuSection[] = [{ name: 'Books', items: [{ name: 'Ernst Benary &amp; Sons', desc: 'Seeds', price: 1000 }] }]
    const { sections } = cleanMenu(menu, 'shop')
    expect(sections[0].items[0].name).toBe('Ernst Benary & Sons')
  })
})
