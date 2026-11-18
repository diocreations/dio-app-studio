import { describe, expect, test } from 'bun:test'
import { renderApp } from '../src/worker/app'
import { buildSpec } from '../src/worker/pricing'

/** The gallery demo: five works across three sections, which is five slides. */
const spec = buildSpec({
  name: 'Kiln Lane Gallery',
  vertical: 'gallery',
  accent: '#6a4a30',
  logo: 'KL',
  features: ['catalog', 'booking', 'events', 'gallery'],
})
const html = renderApp(spec, { token: 'showcase-check' })

const slides = [
  ...html.matchAll(
    /<button class="slide" type="button" data-jump="(\d+)">[\s\S]*?<span class="cap">([^<]+)<\/span>/g,
  ),
].map((match) => ({ jump: Number(match[1]), name: match[2] }))

/** Two works per section, five slides at most — the section each one is in. */
const expected = spec.menu
  .flatMap((section, index) =>
    section.items.slice(0, 2).map((item) => ({ name: item.name, jump: index })),
  )
  .slice(0, 5)

describe('the home carousel', () => {
  test('every slide names its own work and carries that work’s section', () => {
    expect(slides).toEqual(expected)
    // A strip that all pointed at one section would pass the check above only if
    // the catalogue were a single section, so it has to span several.
    expect(new Set(slides.map((slide) => slide.jump)).size).toBeGreaterThan(1)
  })

  test('the catalogue has a filter chip and a section for every jump', () => {
    for (const slide of slides) {
      expect(html).toContain(`data-filter="${slide.jump}"`)
      expect(html).toContain(`data-section="${slide.jump}"`)
    }
  })

  test('a tap opens the catalogue filtered to that jump', () => {
    const handler = html.match(/dataset\.jump !== undefined[\s\S]{0,120}/)?.[0] ?? ''
    expect(handler).toContain("go('catalog')")
    expect(handler).toContain('setFilter(target.dataset.jump)')
  })
})
