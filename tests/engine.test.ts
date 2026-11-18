import { expect, test } from 'bun:test'
import { buildSpec, normalizeFeatures, quote, usd } from '../src/worker/pricing'
import { createZip } from '../src/worker/export'
import { renderApp } from '../src/worker/app'
import { THEMES, themeFor } from '../src/worker/themes'
import { VERTICALS, VERTICAL_IDS, verticalFor } from '../src/worker/verticals'

test('a quote adds the base build, each capability and each store format', () => {
  const priced = quote({
    features: ['catalog', 'ordering', 'booking'],
    platforms: ['pwa', 'android'],
    plan: 'onetime',
  })
  expect(priced.oneTime).toBe(140000 + 38000 + 26000 + 45000)
  expect(priced.monthly).toBe(0)
  expect(priced.lines[0].label).toBe('Design and build')
  expect(usd(priced.oneTime)).toBe('$2,490')
})

test('the monthly plan charges a setup fee and a retainer instead', () => {
  const priced = quote({
    features: ['nonsense' as never],
    platforms: ['pwa'],
    plan: 'monthly',
  })
  expect(priced.oneTime).toBe(140000)
  expect(priced.setupFee).toBe(42000)
  expect(priced.monthly).toBe(7700)
  expect(priced.firstYear).toBe(42000 + 7700 * 12)
  expect(priced.plan).toBe('monthly')
})

test('capabilities pull in what they depend on', () => {
  expect(normalizeFeatures(['delivery'])).toEqual(['catalog', 'ordering', 'delivery'])
  expect(normalizeFeatures(['classes'])).toEqual(['catalog', 'booking', 'classes'])
  // Builds created before the app went vertical-agnostic still parse.
  expect(normalizeFeatures(['menu', 'reservations'])).toEqual(['catalog', 'booking'])
  expect(normalizeFeatures(['made-up'])).toEqual(['catalog'])
})

test('every trade seeds a usable app with its own vocabulary', () => {
  for (const id of VERTICAL_IDS) {
    const vertical = VERTICALS[id]
    const spec = buildSpec({
      name: 'Test Business',
      vertical: id,
      accent: '',
      logo: '',
      features: [],
    })
    expect(spec.vertical).toBe(id)
    expect(spec.menu.length).toBeGreaterThan(0)
    expect(spec.menu[0].items.length).toBeGreaterThan(0)
    expect(spec.offers.length).toBeGreaterThan(0)
    expect(spec.features).toContain('catalog')
    expect(spec.accent).toMatch(/^#[0-9a-f]{6}$/)
    expect(vertical.vocab.catalog.length).toBeGreaterThan(2)
    expect(vertical.label.length).toBeGreaterThan(2)
  }
})

test('a non-restaurant brief builds the right shape', () => {
  const salon = buildSpec({
    name: 'Marlow & Co',
    vertical: 'salon',
    accent: '#7a4b8f',
    logo: 'MC',
    features: ['catalog', 'booking', 'loyalty'],
  })
  expect(verticalFor(salon.vertical).vocab.bookTitle).toBe('Book an appointment')
  expect(salon.features).toContain('booking')
  expect(salon.features).not.toContain('ordering')
  // Durations survive into the catalogue so a salon build is not a menu.
  expect(salon.menu.some((section) => section.items.some((item) => Boolean(item.meta)))).toBe(true)

  const gym = buildSpec({
    name: 'Ironworks',
    vertical: 'gym',
    accent: '',
    logo: '',
    features: ['classes'],
  })
  expect(gym.features).toContain('classes')
  expect(gym.features).toContain('booking')
  expect(verticalFor(gym.vertical).label).toBe('Gym & studio')

  const trades = buildSpec({
    name: 'Rook Plumbing',
    vertical: 'trades',
    accent: '',
    logo: '',
    features: ['quote'],
    custom: 'Needs a stock list for van parts',
  })
  expect(trades.custom).toBe('Needs a stock list for van parts')
  // A quote-led trade leaves prices on request rather than inventing totals.
  const priced = trades.menu.flatMap((section) => section.items).filter((item) => item.price > 0)
  expect(priced.length).toBeGreaterThan(0)
})

test('unknown trades fall back to a complete build instead of breaking', () => {
  const spec = buildSpec({
    name: 'Something New',
    vertical: 'dog-grooming',
    accent: 'not-a-colour',
    logo: '',
    features: ['booking'],
  })
  expect(spec.vertical).toBe('restaurant')
  expect(spec.accent).toBe('#c8452b')
  expect(spec.menu.length).toBeGreaterThan(0)
})

test('every trade gets its own design system, not a re-labelled clone', () => {
  const seen = new Set<string>()
  for (const id of VERTICAL_IDS) {
    const theme = THEMES[id]
    const signature = [theme.layout, theme.nav, theme.bg, theme.display, theme.radius, theme.motif].join('|')
    expect(seen.has(signature)).toBe(false)
    seen.add(signature)
  }

  const layouts = new Set(VERTICAL_IDS.map((id) => THEMES[id].layout))
  const navs = new Set(VERTICAL_IDS.map((id) => THEMES[id].nav))
  const darks = VERTICAL_IDS.filter((id) => THEMES[id].dark)
  expect(layouts.size).toBeGreaterThanOrEqual(3)
  expect(navs.size).toBe(3)
  expect(darks.length).toBeGreaterThanOrEqual(2)
  // A trade's theme must actually reach the generated document.
  for (const id of VERTICAL_IDS) {
    const theme = themeFor(id)
    const html = renderApp(
      buildSpec({ name: 'Test Co', vertical: id, accent: '', logo: '', features: [] }),
      { token: 'test' },
    )
    expect(html).toContain(`data-layout="${theme.layout}"`)
    expect(html).toContain(`data-nav="${theme.nav}"`)
    expect(html).toContain(theme.bg)
    expect(html).toContain('class="tabbar"')
    expect(html).toContain('data-splash')
    // Guard against template artefacts leaking into the rendered app.
    expect(html).not.toContain('>undefined<')
    expect(html).not.toContain('undefined%')
    expect(html).not.toContain('[object Object]')
    expect(html).not.toContain('NaN')
  }
})

test('the app shell only offers the screens a build actually has', () => {
  const salon = renderApp(
    buildSpec({
      name: 'Marlow & Co',
      vertical: 'salon',
      accent: '#7a4b8f',
      logo: 'MC',
      features: ['catalog', 'booking'],
    }),
    { token: 'salon' },
  )
  expect(salon).toContain('data-screen="book"')
  expect(salon).not.toContain('data-sheet="cart"')
  expect(salon).toContain('data-sheet="note"')

  const shop = renderApp(
    buildSpec({
      name: 'Fern & Flint',
      vertical: 'shop',
      accent: '#2a5a8f',
      logo: 'FF',
      features: ['catalog', 'ordering'],
    }),
    { token: 'shop' },
  )
  expect(shop).toContain('data-sheet="cart"')
  expect(shop).not.toContain('data-screen="book"')
})

test('the zip writer produces an archive with a central directory', () => {
  const bytes = createZip([
    { name: 'index.html', data: new TextEncoder().encode('<h1>hello</h1>') },
    { name: 'a/b.txt', data: new TextEncoder().encode('deep file') },
  ])
  const view = new DataView(bytes.buffer)
  expect(view.getUint32(0, true)).toBe(0x04034b50)
  const end = bytes.length - 22
  expect(view.getUint32(end, true)).toBe(0x06054b50)
  expect(view.getUint16(end + 10, true)).toBe(2)
  expect(new TextDecoder().decode(bytes.slice(40, 40 + 14))).toBe('<h1>hello</h1>')
})
