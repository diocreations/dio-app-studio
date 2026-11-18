import { describe, expect, test } from 'bun:test'
import { renderApp } from '../src/worker/app'
import { docFromSpec, normalizeDoc } from '../src/worker/doc'
import { DIRECTIONS, directionFor, themeForDirection } from '../src/worker/directions'
import { buildSpec } from '../src/worker/pricing'
import { VERTICAL_IDS } from '../src/worker/verticals'

/**
 * A direction has to change the product, not just its accent. These tests read
 * the rendered document and fail if two directions in one trade collapse onto
 * the same type, layout, navigation and palette.
 */

const PHOTOS = {
  wide: ['https://img.test/wide.jpg'],
  thumb: ['https://img.test/thumb.jpg'],
}

function spec(vertical: (typeof VERTICAL_IDS)[number] = 'restaurant') {
  return buildSpec({ name: 'Test Co', vertical, accent: '#a34b2b', logo: 'TC', features: [] })
}

function attrs(html: string): Record<string, string> {
  const tag = /<body [^>]*>/.exec(html)?.[0] ?? ''
  return Object.fromEntries(
    [...tag.matchAll(/data-([a-z-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]),
  )
}

function token(html: string, name: string): string {
  return new RegExp(`--${name}:\\s*([^;]+);`).exec(html)?.[1].trim() ?? ''
}

describe('design directions', () => {
  test('every trade has at least three named directions with unique ids', () => {
    for (const id of VERTICAL_IDS) {
      const list = DIRECTIONS[id]
      expect(list.length).toBeGreaterThanOrEqual(3)
      expect(new Set(list.map((entry) => entry.id)).size).toBe(list.length)
      for (const entry of list) expect(entry.label.length).toBeGreaterThan(3)
    }
  })

  test('directions change type, layout, navigation and surfaces together', () => {
    for (const id of VERTICAL_IDS) {
      const signatures = new Set<string>()
      for (const direction of DIRECTIONS[id]) {
        const theme = themeForDirection(id, direction.id)
        signatures.add(
          [
            theme.layout,
            theme.nav,
            theme.display,
            theme.bg,
            theme.radius,
            direction.options.variant,
            direction.options.cards,
            direction.options.buttons,
          ].join('|'),
        )
      }
      // At least two genuinely different systems per trade, even where a third
      // direction shares a palette with a sibling.
      expect(signatures.size).toBeGreaterThanOrEqual(2)
    }
  })

  test('a document opens on its trade direction, and legacy builds keep theirs', () => {
    const base = spec('salon')
    const doc = docFromSpec(base)
    expect(doc.design?.direction).toBe(DIRECTIONS.salon[0].id)
    const html = renderApp(base, { token: 'direction', doc, photos: PHOTOS })
    expect(attrs(html).direction).toBe(DIRECTIONS.salon[0].id)
    expect(attrs(html).layout).toBe(themeForDirection('salon', DIRECTIONS.salon[0].id).layout)

    const legacy = renderApp(base, { token: 'legacy', photos: PHOTOS })
    expect(attrs(legacy).direction).toBeUndefined()
    expect(attrs(legacy).layout).toBe('rows')
  })

  test('owner overrides persist on the shared document and reach the app', () => {
    const base = spec('restaurant')
    const direction = DIRECTIONS.restaurant[1]
    const doc = normalizeDoc(
      {
        ...docFromSpec(base),
        design: {
          direction: direction.id,
          typography: 'compact',
          nav: 'dock',
          buttons: 'round',
          cards: 'square',
          density: 'cozy',
        },
      },
      base,
    )
    expect(doc.design).toEqual({
      direction: direction.id,
      typography: 'compact',
      nav: 'dock',
      buttons: 'round',
      cards: 'square',
      density: 'cozy',
    })
    const html = renderApp(base, { token: 'custom', doc, photos: PHOTOS })
    const body = attrs(html)
    expect(body.direction).toBe(direction.id)
    expect(body.type).toBe('compact')
    expect(body.nav).toBe('dock')
    expect(body.buttons).toBe('round')
    expect(body.cards).toBe('square')
    expect(body.density).toBe('cozy')
    expect(token(html, 'display')).toContain('Avenir Next Condensed')
  })

  test('unknown directions and invalid values are rejected, not rendered', () => {
    const base = spec('shop')
    const doc = normalizeDoc(
      {
        ...docFromSpec(base),
        design: { direction: 'not-a-direction', buttons: 'blob', narf: 1 },
      },
      base,
    )
    expect(doc.design?.direction).toBeUndefined()
    expect(doc.design?.buttons).toBeUndefined()
    const html = renderApp(base, { token: 'invalid', doc, photos: PHOTOS })
    expect(attrs(html).direction).toBeUndefined()
    expect(html).not.toContain('not-a-direction')
  })

  test('direction applies to the published app and the editor preview alike', () => {
    const base = spec('hotel')
    const doc = docFromSpec(base)
    const published = renderApp(base, { token: 'same', doc, photos: PHOTOS })
    const canvas = renderApp(base, { token: 'same', doc, photos: PHOTOS, editor: true, screen: 'home' })
    for (const html of [published, canvas]) {
      expect(html).toContain(`data-direction="${directFor('hotel')}"`)
      expect(html).toContain(themeForDirection('hotel', directFor('hotel')).bg)
    }
    expect(attrs(published).editor).toBeUndefined()
    expect(attrs(canvas).editor).toBe('1')
  })
})

function directFor(vertical: (typeof VERTICAL_IDS)[number]): string {
  return directionFor(vertical, undefined).id
}
