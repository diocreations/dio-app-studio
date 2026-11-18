import { describe, expect, test } from 'bun:test'
import { renderApp } from '../src/worker/app'
import { buildSpec } from '../src/worker/pricing'
import { THEMES } from '../src/worker/themes'
import type { VerticalId } from '../src/worker/types'

/**
 * One design family per trade is the product promise, so dropping one is a test
 * failure, not a judgement call.
 *
 * The suite reads the stylesheet the app actually ships and insists every
 * trade in the theme deck still owns a family block: scoped rules, a corner
 * language of its own, and chrome, hero or nav to match. It also pins the nine
 * newer families to the shared parts they re-cut — a later edit that lets a
 * rounded system card back into the hotel or salon fails here, not in review.
 */

const TRADES: VerticalId[] = [
  'restaurant',
  'cafe',
  'shop',
  'salon',
  'gym',
  'clinic',
  'trades',
  'professional',
  'property',
  'hotel',
  'studio',
  'auto',
  'hospital',
  'ecommerce',
  'plants-indoor',
  'plants-outdoor',
  'courses',
  'tuition',
  'school',
  'kindergarten',
  'finance',
  'agency',
  'influencer',
  'portfolio',
  'film',
  'gallery',
  'marketplace',
]

/** The trades that replaced the shared card system after the first three. */
const RESHAPED: VerticalId[] = [
  'shop',
  'salon',
  'gym',
  'trades',
  'professional',
  'property',
  'hotel',
  'studio',
  'auto',
]

const ACCENTS: Record<VerticalId, string> = {
  restaurant: '#c8452b',
  cafe: '#8a5a2b',
  shop: '#2a5a8f',
  salon: '#a04a6a',
  gym: '#c8f14a',
  clinic: '#2a5a8f',
  trades: '#b4451f',
  professional: '#1f4e79',
  property: '#2f5d50',
  hotel: '#c9a227',
  studio: '#e6e6e6',
  auto: '#b23b1e',
  hospital: '#0f6b6b',
  ecommerce: '#b3391f',
  'plants-indoor': '#2f6b3a',
  'plants-outdoor': '#4a6b1f',
  courses: '#3f4bd8',
  tuition: '#a2521f',
  school: '#1f4f8f',
  kindergarten: '#c2557a',
  finance: '#145a4a',
  agency: '#b8400f',
  influencer: '#c72f6b',
  portfolio: '#2b2b2b',
  film: '#b8862b',
  gallery: '#6a4a30',
  marketplace: '#d98324',
}

function stylesheet(): string {
  const spec = buildSpec({
    name: 'Family Probe',
    vertical: 'restaurant',
    accent: '#c8452b',
    logo: 'FP',
    features: [],
  })
  return renderApp(spec, { token: 'family-probe', live: false }).split('<style>')[1].split('</style>')[0]
}

/**
 * The stylesheet is written family by family, each block opening with
 * `body[data-trade="…"]`. Slicing from a trade's first selector to the next
 * trade's first selector yields that whole family, multi-line rules included.
 */
function familyBlocks(css: string): Map<string, string> {
  const first = new Map<string, number>()
  for (const match of css.matchAll(/body\[data-trade="([a-z-]+)"\]/g)) {
    if (!first.has(match[1])) first.set(match[1], match.index ?? 0)
  }
  const ordered = [...first.entries()].sort((a, b) => a[1] - b[1])
  const blocks = new Map<string, string>()
  ordered.forEach(([trade, start], index) => {
    const end = index + 1 < ordered.length ? ordered[index + 1][1] : css.length
    blocks.set(trade, css.slice(start, end))
  })
  return blocks
}

/** A blank report means every family is present and has a grammar; else it names what is missing. */
function familyIssues(css: string): string[] {
  const blocks = familyBlocks(css)
  return TRADES.flatMap((trade) => {
    const block = blocks.get(trade)
    if (!block) return [`${trade}: no family block`]
    const issues: string[] = []
    // Eight rules that each change what renders. The bar used to be ten, which
    // only invited padding: restating a base rule with the theme's own radius
    // counts for nothing, so the number is lower and the rules are real.
    const rules = (block.match(/\{/g) ?? []).length
    if (rules < 8) issues.push(`${trade}: only ${rules} rules`)
    if (!/border-radius/.test(block)) issues.push(`${trade}: no corner language of its own`)
    if (!/\.(appbar|cover|l-hero|tabbar)\b/.test(block)) issues.push(`${trade}: no chrome, hero or nav of its own`)
    return issues
  })
}

describe('the design families', () => {
  const css = stylesheet()

  test('the theme deck and the families cover the same trades', () => {
    expect(Object.keys(THEMES).sort()).toEqual([...TRADES].sort())
    expect(TRADES).toHaveLength(27)
  })

  test('every trade owns a family with its own corners, chrome and nav', () => {
    expect(familyIssues(css)).toEqual([])
  })

  test('no two families are the same block', () => {
    const blocks = familyBlocks(css)
    const sources = TRADES.map((trade) => blocks.get(trade))
    expect(new Set(sources).size).toBe(TRADES.length)
  })

  test('each trade renders under its family, not a neighbour’s', () => {
    for (const trade of TRADES) {
      const spec = buildSpec({
        name: 'Family Probe',
        vertical: trade,
        accent: ACCENTS[trade],
        logo: 'FP',
        features: [],
      })
      const html = renderApp(spec, { token: `probe-${trade}`, live: false })
      expect(html, `${trade} body scope`).toContain(`data-trade="${trade}"`)
      expect(html, `${trade} family rules`).toContain(`body[data-trade="${trade}"]`)
    }
  })

  test('the nine newer families re-cut the shared card, button, chip and slot', () => {
    const blocks = familyBlocks(css)
    for (const trade of RESHAPED) {
      const block = blocks.get(trade) ?? ''
      for (const part of ['.card', '.btn', '.chip', '.slot']) {
        expect(block, `${trade} ${part} follows the family geometry`).toContain(part)
      }
    }
  })

  test('dropping any single family is reported, not silently accepted', () => {
    for (const trade of TRADES) {
      const block = familyBlocks(css).get(trade)!
      const broken = css.replace(block, '')
      expect(familyIssues(broken), `${trade} removal`).toEqual([`${trade}: no family block`])
    }
  })

  test('a family reduced to a stub is reported too', () => {
    const blocks = familyBlocks(css)
    const stub = `body[data-trade="hotel"] .appbar { border-bottom: 1px solid var(--ink); }\n`
    const broken = css.replace(blocks.get('hotel')!, stub)
    const issues = familyIssues(broken)
    expect(issues).toContain('hotel: only 1 rules')
    expect(issues).toContain('hotel: no corner language of its own')
  })
})
