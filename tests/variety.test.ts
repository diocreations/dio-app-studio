import { describe, expect, test } from 'bun:test'
import { renderApp } from '../src/worker/app'
import { buildSpec } from '../src/worker/pricing'
import { DESIGNS } from '../src/worker/prompt'
import { LAYOUT_DECK_SIZE } from '../src/worker/types'
import { VERTICAL_IDS } from '../src/worker/verticals'

/**
 * Variety is a product promise, so it gets a failure condition, not a vibe.
 *
 * Eight briefs — including two in the same trade — and several seeds per brief
 * are rendered for real, then palette, type pairing, corner radius and layout
 * are read back out of the generated HTML. The suite fails when an axis
 * collapses, and names the builds that twinned.
 */

// Only the presence of resolved photos matters here: it turns the media axis on.
const PHOTOS = {
  wide: ['https://img.test/wide.jpg'],
  thumb: ['https://img.test/thumb.jpg'],
}

const BRIEFS = [
  { name: 'Marlow & Sons', vertical: 'restaurant', accent: '#c8452b', logo: 'MS' },
  { name: 'Northline Supply', vertical: 'shop', accent: '#1f6feb', logo: 'NS' },
  { name: 'Iron Yard', vertical: 'gym', accent: '#f59f00', logo: 'IY' },
  { name: 'Bramble Dental', vertical: 'clinic', accent: '#12b886', logo: 'BD' },
  { name: 'Keystone Homes', vertical: 'property', accent: '#7048e8', logo: 'KH' },
  { name: 'Pitstop Garage', vertical: 'auto', accent: '#d6336c', logo: 'PG' },
  // Same trade and the same brand colour: palette and type are expected to
  // twin, so only the seed can keep these two builds apart.
  { name: 'Slow Pour', vertical: 'cafe', accent: '#8a5a2b', logo: 'SP' },
  { name: 'Little Fern', vertical: 'cafe', accent: '#8a5a2b', logo: 'LF' },
] as const

const AXES = ['palette', 'type', 'radius', 'layout'] as const
type Axis = (typeof AXES)[number]
type Axes = Record<Axis, string>

function build(
  brief: (typeof BRIEFS)[number],
  seed: string,
  version = 1,
  slot?: number,
  withPhotos = true,
): string {
  const spec = buildSpec({
    name: brief.name,
    vertical: brief.vertical,
    accent: brief.accent,
    logo: brief.logo,
    features: [],
  })
  return renderApp(spec, {
    token: seed,
    version,
    slot,
    live: false,
    photos: withPhotos ? PHOTOS : undefined,
  })
}

function cssToken(html: string, name: string): string {
  return new RegExp(`--${name}:\\s*([^;]+);`).exec(html)?.[1].trim() ?? ''
}

function bodyAttrs(html: string): Record<string, string> {
  const tag = /<body [^>]*>/.exec(html)?.[0] ?? ''
  return Object.fromEntries(
    [...tag.matchAll(/data-([a-z-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]),
  )
}

function signature(html: string): Axes {
  const attrs = bodyAttrs(html)
  return {
    palette: [
      cssToken(html, 'bg'),
      cssToken(html, 'surface'),
      cssToken(html, 'surface-2'),
      cssToken(html, 'ink'),
      cssToken(html, 'accent'),
      attrs.theme ?? '',
    ].join('|'),
    type: [cssToken(html, 'display'), cssToken(html, 'body'), cssToken(html, 'weight'), cssToken(html, 'tracking')].join('|'),
    radius: [cssToken(html, 'radius'), cssToken(html, 'r-card'), cssToken(html, 'r-media')].join('|'),
    layout: ['layout', 'shell', 'variant', 'density', 'media', 'nav', 'hero', 'order', 'hero-scale']
      .map((key) => attrs[key] ?? '')
      .join('|'),
  }
}

function groupsFor(builds: { label: string; axes: Axes }[], axis: Axis): Map<string, string[]> {
  const groups = new Map<string, string[]>()
  for (const build of builds) {
    groups.set(build.axes[axis], [...(groups.get(build.axes[axis]) ?? []), build.label])
  }
  return groups
}

/** The guard the suite enforces: every axis must reach its minimum spread. */
function varietyIssues(builds: { label: string; axes: Axes }[], minimum: Record<Axis, number>): string[] {
  return AXES.flatMap((axis) => {
    const groups = groupsFor(builds, axis)
    if (groups.size >= minimum[axis]) return []
    const collapsed = [...groups.values()].filter((labels) => labels.length > 1)
    return [
      `${axis}: ${groups.size} distinct across ${builds.length} builds (needs ${minimum[axis]})` +
        (collapsed.length ? ` — shared by ${collapsed.map((labels) => labels.join(' + ')).join('; ')}` : ''),
    ]
  })
}

/** A blank report means no twins; a failure prints exactly who twinned. */
function twinReport(builds: { label: string; axes: Axes }[]): string {
  const groups = new Map<string, string[]>()
  for (const build of builds) {
    const key = JSON.stringify(build.axes)
    groups.set(key, [...(groups.get(key) ?? []), build.label])
  }
  return [...groups.values()]
    .filter((labels) => labels.length > 1)
    .map((labels) => labels.join(' + '))
    .join('; ')
}

describe('generated builds vary by design', () => {
  test('different briefs land on different palettes, type, corners and layouts', () => {
    // Tokens are unique per project, which is what keys each deck.
    const builds = BRIEFS.map((brief) => ({ label: brief.name, axes: signature(build(brief, `token-${brief.logo}`)) }))
    // Two cafés share a trade and a brand colour, so palette and type both
    // collapse by design: 7 distinct is the honest ceiling on each. Radius and
    // layout are the seed's job and must stay varied.
    const issues = varietyIssues(builds, { palette: 7, type: 7, radius: 6, layout: 7 })
    expect(issues).toEqual([])
  })

  test('the seed separates two briefs that share a trade and a brand colour', () => {
    const pair = BRIEFS.filter((brief) => brief.vertical === 'cafe').map((brief, index) => ({
      label: brief.name,
      // Distinct allocated slots, exactly as two projects reach renderApp.
      axes: signature(build(brief, `pair-${index}`, 1, index)),
    }))
    // Palette and type belong to the trade and the brand, so they are expected
    // to match. Anything else matching means the seed failed to separate them.
    const shared = AXES.filter((axis) => pair[0].axes[axis] === pair[1].axes[axis])
    const report =
      shared.length === 2 && shared[0] === 'palette' && shared[1] === 'type'
        ? ''
        : `${pair[0].label} + ${pair[1].label} share: ${shared.join(', ') || 'nothing'}`
    expect(report).toBe('')
  })

  test('a seed reshuffles layout and corners but never the brand', () => {
    const brief = BRIEFS.find((entry) => entry.vertical === 'shop')!
    const builds = Array.from({ length: 24 }, (_, index) => ({
      label: `seed-${index}`,
      axes: signature(build(brief, `seed-${index}`)),
    }))

    expect(groupsFor(builds, 'layout').size, 'layout spread').toBeGreaterThanOrEqual(12)
    expect(groupsFor(builds, 'radius').size, 'radius spread').toBe(3)
    // Palette and type belong to the business, so they must not drift per seed.
    expect(groupsFor(builds, 'palette').size, 'palette stability').toBe(1)
    expect(groupsFor(builds, 'type').size, 'type stability').toBe(1)
  })

  test('500 builds are distinct before the 2,304-layout deck wraps', () => {
    const brief = BRIEFS.find((entry) => entry.vertical === 'shop')!
    // 4 card layouts x 3 rhythms x 3 media x 4 hero compositions x 4 orders
    // x 4 hero scales.
    expect(LAYOUT_DECK_SIZE).toBe(2304)
    const axes = Array.from({ length: 500 }, (_, index) =>
      signature(build(brief, 'deck-token', index + 1)),
    )
    const layouts = axes.map((entry) => entry.layout)
    expect(new Set(layouts).size).toBe(500)
    const designs = axes.map((entry) => JSON.stringify(entry))
    expect(new Set(designs).size).toBe(500)
  })

  test('500 allocated slots stay distinct across projects and versions', () => {
    const brief = BRIEFS.find((entry) => entry.vertical === 'shop')!
    const builds = Array.from({ length: 500 }, (_, index) =>
      signature(build(brief, `project-${index}`, (index % 5) + 1, index)),
    )
    expect(new Set(builds.map((entry) => entry.layout)).size).toBe(500)
    expect(new Set(builds.map((entry) => JSON.stringify(entry))).size).toBe(500)
  })

  test('500 allocated slots stay distinct without photos', () => {
    const brief = BRIEFS.find((entry) => entry.vertical === 'shop')!
    const builds = Array.from({ length: 500 }, (_, index) =>
      signature(build(brief, `no-photo-${index}`, 1, index, false)),
    )
    expect(new Set(builds.map((entry) => entry.layout)).size).toBe(500)
  })

  test('the four section orders reorder the rendered home page', () => {
    const spec = buildSpec({
      name: 'Order Probe',
      vertical: 'shop',
      accent: '#1f6feb',
      logo: 'OP',
      features: ['catalog', 'offers', 'loyalty'],
    })
    const markers = {
      featured: 'data-item',
      offers: 'Right now',
      loyalty: 'class="loyalty"',
      visit: 'Find us',
      story: 'home-story',
    } as const
    const expected = {
      catalog: ['featured', 'offers', 'loyalty', 'visit', 'story'],
      offers: ['offers', 'featured', 'loyalty', 'story', 'visit'],
      visit: ['visit', 'story', 'featured', 'offers', 'loyalty'],
      rewards: ['loyalty', 'story', 'featured', 'offers', 'visit'],
    } as const

    for (const [order, sequence] of Object.entries(expected)) {
      const html = renderApp(spec, {
        token: 'order-probe',
        live: false,
        photos: PHOTOS,
        preview: { order },
      })
      const home = /<section[^>]*data-screen="home"[\s\S]*?<\/section>/.exec(html)?.[0] ?? ''
      const positions = sequence.map((key) => home.indexOf(markers[key]))
      expect(positions.every((position) => position >= 0), `${order} blocks present`).toBe(true)
      expect(positions, `${order} block order`).toEqual([...positions].sort((a, b) => a - b))
    }
  })

  test('every trade gets three different home compositions from the designs', () => {
    // The brief offers Editorial, Calm and Compact for every trade. They must
    // differ in what the home screen shows and in what order, not just in
    // colour: a trade whose features leave a design's sections empty still has
    // to land on a different page.
    const markers: [string, string[]][] = [
      ['featured', ['data-item', 'class="r-row"', 'class="stack-card"', 'class="tiles"', 'class="h-row"']],
      ['offers', ['Right now']],
      ['loyalty', ['class="loyalty"']],
      ['visit', ['Find us']],
      ['story', ['home-story']],
    ]
    for (const vertical of VERTICAL_IDS) {
      const spec = buildSpec({ name: 'Design Probe', vertical, accent: '#2a5a8f', logo: 'DP', features: [] })
      const compositions = DESIGNS.map((design) => {
        const html = renderApp(spec, {
          token: `probe-${vertical}`,
          live: false,
          preview: { ...design.axes },
        })
        const home = /<section[^>]*data-screen="home"[\s\S]*?<\/section>/.exec(html)?.[0] ?? ''
        return markers
          .map(([name, candidates]) => ({
            name,
            at: Math.min(
              ...candidates.map((candidate) => {
                const at = home.indexOf(candidate)
                return at < 0 ? Number.POSITIVE_INFINITY : at
              }),
            ),
          }))
          .filter((entry) => Number.isFinite(entry.at))
          .sort((a, b) => a.at - b.at)
          .map((entry) => entry.name)
          .join('>')
      })
      expect(new Set(compositions).size, `${vertical}: ${compositions.join(' / ')}`).toBe(3)
    }
  })

  test('a trade with no offers still gets three different home orders', () => {
    // The three brief designs ask for catalog, visit and offers in turn. A trade
    // without offers must not have the offers design fall back to the catalog
    // page: that would leave two of three designs with the same composition.
    const spec = buildSpec({
      name: 'Cornfield & Co',
      vertical: 'professional',
      accent: '#17110d',
      logo: 'CC',
      features: ['catalog', 'quote', 'booking', 'reviews'],
    })
    const markers = { featured: 'data-item', visit: 'Find us', story: 'home-story' } as const
    const sequences = (['catalog', 'offers', 'visit'] as const).map((order) => {
      const html = renderApp(spec, { token: 'no-offers', live: false, preview: { order } })
      const home = /<section[^>]*data-screen="home"[\s\S]*?<\/section>/.exec(html)?.[0] ?? ''
      return Object.entries(markers)
        .map(([key, marker]) => ({ key, at: home.indexOf(marker) }))
        .filter((entry) => entry.at >= 0)
        .sort((a, b) => a.at - b.at)
        .map((entry) => entry.key)
        .join('>')
    })
    expect(sequences.every((sequence) => sequence.includes('>'))).toBe(true)
    expect(new Set(sequences).size).toBe(3)
  })

  test('no two builds across briefs and seeds share a whole design', () => {
    const builds = BRIEFS.flatMap((brief) =>
      Array.from({ length: 4 }, (_, index) => ({
        label: `${brief.name} · seed ${index}`,
        axes: signature(build(brief, `${brief.logo}-${index}`)),
      })),
    )
    expect(twinReport(builds)).toBe('')
  })

  test('the guard fails when a palette, type, radius or layout collapses', () => {
    // Same brief and seed: the exact "twins" this suite exists to prevent.
    const axes = signature(build(BRIEFS[0], 'same-seed'))
    const twins = Array.from({ length: 4 }, (_, index) => ({ label: `twin-${index}`, axes }))
    const issues = varietyIssues(twins, { palette: 4, type: 4, radius: 4, layout: 4 })
    expect(issues).toHaveLength(4)
    for (const axis of AXES) expect(issues.join('\n')).toContain(`${axis}: 1 distinct`)
    expect(twinReport(twins)).toBe('twin-0 + twin-1 + twin-2 + twin-3')
  })
})
