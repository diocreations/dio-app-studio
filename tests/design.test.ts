import { describe, expect, test } from 'bun:test'
import { renderApp } from '../src/worker/app'
import {
  cleanDesign,
  cleanStructure,
  contrast,
  parseManifest,
  readDesign,
  readStructure,
} from '../src/worker/design'
import { importWebsite } from '../src/worker/importer'
import { buildSpec } from '../src/worker/pricing'
import { THEMES } from '../src/worker/themes'

const FALLBACK = { bg: '#f7f1e6', ink: '#191310', muted: '#7d6b5b' }

const SITE_CSS = `
  :root { --background: #f6f1e8; --foreground: #1b1611; --primary: #8a5a2b }
  body { background: #f6f1e8; color: #1b1611; font-family: Inter, system-ui, sans-serif }
  .card { border-radius: 14px }
`

describe('reading a site’s own design language', () => {
  test('palette, typeface and corners come from the stylesheet', () => {
    const kit = readDesign('<html></html>', SITE_CSS, FALLBACK)
    expect(kit).toBeDefined()
    expect(kit!.bg).toBe('#f6f1e8')
    expect(kit!.ink).toBe('#1b1611')
    expect(kit!.radius).toBe(14)
    expect(kit!.display).toContain('Inter')
    expect(kit!.fontLabel).toBe('Inter')
    expect(kit!.dark).toBe(false)
    expect(kit!.basis).toContain('Inter')
  })

  test('a serif site keeps a serif display face', () => {
    const kit = readDesign(
      '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600&display=swap" rel="stylesheet">',
      '',
      FALLBACK,
    )
    expect(kit!.display).toContain('Playfair Display')
    expect(kit!.display).toContain('serif')
  })

  test('an unreadable pair is rejected in favour of the trade theme', () => {
    const kit = readDesign('<html></html>', 'body{background:#ffffff;color:#fefefe}', FALLBACK)
    expect(contrast(kit!.bg, kit!.ink)).toBeGreaterThanOrEqual(4.5)
  })

  test('a white site still gets a raised card surface', () => {
    const kit = readDesign('<html></html>', 'body{background:#ffffff;color:#141414}', FALLBACK)
    expect(kit!.bg).toBe('#ffffff')
    expect(kit!.surface).not.toBe('#ffffff')
    expect(contrast(kit!.ink, kit!.bg)).toBeGreaterThanOrEqual(4.5)
  })

  test('nothing measurable leaves the trade theme alone', () => {
    expect(readDesign('<html></html>', '', FALLBACK)).toBeUndefined()
  })

  test('a font alone does not claim their palette', () => {
    const kit = readDesign('<html></html>', 'body{font-family:Inter,sans-serif}', FALLBACK)
    expect(kit!.palette).toBe(false)
    expect(kit!.basis).not.toContain('palette')
    expect(kit!.basis).toContain('Inter')
  })

  test('the trade colours stay when the site declared none', () => {
    const spec = buildSpec({
      name: 'Fern & Co',
      vertical: 'shop',
      accent: '#2f5d3a',
      logo: 'F',
      features: ['catalog'],
      site: { design: { bg: '#000000', ink: '#ffffff', palette: false, radius: 12 } },
    })
    const html = renderApp(spec, { token: 't', live: false })
    expect(html).toContain(THEMES.shop.bg)
    expect(html).toContain('--radius: 12px')
  })

  test('a manifest splash colour is used, and disclosed as such', () => {
    const kit = readDesign('<html></html>', '', FALLBACK, '#f5f8f4')
    expect(kit!.palette).toBe(true)
    expect(kit!.basis).toContain('splash colour')
    expect(kit!.basis).toContain('neutral ink')
    expect(contrast(kit!.bg, kit!.ink)).toBeGreaterThanOrEqual(4.5)
  })

  test('a dark site is read as dark', () => {
    const kit = readDesign('<html></html>', 'body{background:#0d1117;color:#e6edf3}', FALLBACK)
    expect(kit!.dark).toBe(true)
    expect(kit!.surface).not.toBe(kit!.bg)
  })
})

describe('nav and hero structure', () => {
  const drawerSite = `<!doctype html><html><head><title>Fern</title></head><body>
    <header class="site-header sticky">
      <a href="/" class="logo">Fern</a>
      <button class="hamburger" aria-label="Open menu" aria-expanded="false"><span></span></button>
      <nav><a href="/shop">Shop</a><a href="/about">About</a></nav>
    </header>
    <section class="hero hero--split"><div class="copy"><h1>Flowers</h1></div><img src="/hero.jpg" alt=""></section>
    </body></html>`

  const tabsSite = `<!doctype html><html><body>
    <header><nav><a href="/shop">Shop</a><a href="/journal">Journal</a><a href="/about">About</a><a href="/contact">Contact</a></nav></header>
    <section class="banner"><h1 style="text-align:center">Hey</h1></section>
    </body></html>`

  test('a hamburger header reads as a drawer, with their labels', () => {
    const structure = readStructure(drawerSite, 'header{position:sticky;top:0}')
    expect(structure!.nav).toBe('drawer')
    expect(structure!.stickyHeader).toBe(true)
    expect(structure!.hero).toBe('split')
    expect(structure!.navLabels).toEqual(['Shop', 'About'])
    expect(structure!.basis).toContain('drawer')
  })

  test('a row of links reads as tabs, and centred copy as a centred hero', () => {
    const structure = readStructure(tabsSite, '')
    expect(structure!.nav).toBe('tabs')
    expect(structure!.navLabels.length).toBe(4)
    expect(structure!.hero).toBe('centered')
  })

  test('a photo behind the first screen is an image hero', () => {
    const structure = readStructure(
      '<html><body><header><nav><a href="/a">A</a></nav></header><div class="hero"><img src="/x.jpg"></div></body></html>',
      '',
    )
    expect(structure!.hero).toBe('image')
  })

  test('a logo link is not a nav label', () => {
    const structure = readStructure(
      '<html><body><header><a href="/">Fern &amp; Co</a></header><div class="hero"><img src="/x.jpg"></div></body></html>',
      '',
      'Fern & Co',
    )
    expect(structure!.navLabels).toEqual([])
  })

  test('a page with no header or hero says nothing', () => {
    expect(readStructure('<html><body><p>hi</p></body></html>', '')).toBeUndefined()
  })

  test('a posted structure is clamped', () => {
    expect(cleanStructure({ nav: 'sidebar' })).toBeUndefined()
    const clean = cleanStructure({ nav: 'drawer', hero: 'banana', navLabels: ['a'.repeat(40), 7, 'Shop'] })!
    expect(clean.hero).toBe('none')
    expect(clean.navLabels).toEqual(['a'.repeat(22), 'Shop'])
  })

  test('the app opens a drawer when their mobile nav does', () => {
    const spec = buildSpec({
      name: 'Fern & Co',
      vertical: 'shop',
      accent: '#2f5d3a',
      logo: 'F',
      features: ['catalog'],
      site: { structure: { nav: 'drawer', hero: 'centered' } },
    })
    const html = renderApp(spec, { token: 't', live: false })
    expect(html).toContain('data-nav="drawer"')
    expect(html).toContain('data-nav-open')
    expect(html).toContain('data-sheet="nav"')
    expect(html).toContain('body[data-nav="drawer"] .tabbar')
    expect(html).toContain('cover is-centered')
  })
})

describe('the app shell behaves like an app', () => {
  const spec = buildSpec({
    name: 'Ink & Paper',
    vertical: 'shop',
    accent: '#8a5a2b',
    logo: 'IP',
    features: ['catalog', 'ordering'],
    category: 'Bookshop',
    site: {
      menu: [
        {
          name: 'Selected',
          items: [{ name: 'Stoneware mug', desc: 'Glazed by hand.', price: 2400, tag: 'New' }],
        },
      ],
    },
  })
  const html = renderApp(spec, { token: 't', live: false })
  const style = html.split('<style>')[1].split('</style>')[0]

  test('search is a screen with a real field', () => {
    expect(html).toContain('data-search-open')
    expect(html).toContain('data-screen="search"')
    expect(html).toContain('data-search-input')
    expect(html).toContain('data-search-results')
    expect(style).toContain('.search-field')
  })

  test('saved items have their own screen, badge and per-item hearts', () => {
    expect(html).toContain('data-saved-open')
    expect(html).toContain('data-saved-badge')
    expect(html).toContain('data-screen="saved"')
    expect(html).toContain('data-saved-list')
    expect(html).toContain('data-save=')
    expect(style).toContain('.save.on')
  })

  test('the catalogue filters by section instead of only scrolling', () => {
    expect(html).toContain('data-filters')
    expect(html).toContain('data-filter="all"')
    expect(html).toContain('data-section="0"')
    expect(style).toContain('.section-block[hidden]')
  })

  test('detail owns a sticky action bar', () => {
    expect(html).toContain('detail-cta')
    expect(style).toContain('.detail-cta')
  })

  test('offline, install and a self-hiding header are part of the shell', () => {
    expect(html).toContain('data-offline')
    expect(html).toContain('data-install-wrap')
    expect(html).toContain('beforeinstallprompt')
    expect(html).toContain('pointerdown')
    expect(style).toContain('.appbar.is-hidden')
  })

  test('hidden stays hidden, and the detail action is pinned to the bottom', () => {
    expect(style).toContain('[hidden] { display: none !important; }')
    expect(style).toMatch(/\.screen\.is-detail \{[^}]*padding-bottom: 0/)
    expect(style).toMatch(/\.screen\.is-detail > \[data-detail-body\] \{[^}]*min-height: 100%/)
    expect(style).toMatch(/\.detail-cta \{[^}]*margin: auto -18px 0/)
  })

  test('filters keep their active state and mobile fields do not zoom', () => {
    expect(html).toContain('aria-pressed="true"')
    expect(html).not.toContain('state.filter')
    expect(html).toContain('delete stored.filter')
    expect(html).toContain('if (hadDeadFilter) save()')
    expect(style).toMatch(/\.search-field input \{[^}]*font-size: 16px/)
    expect(html).toContain('field.focus({ preventScroll: true })')
  })

  test('the Shop tab opens the whole catalogue, a category jump arrives filtered', () => {
    expect(html).toContain("go(target.dataset.go)")
    expect(html).toContain("if (target.dataset.go === 'catalog') setFilter('all', true)")
    expect(html).toContain("setFilter(target.dataset.jump)")
    expect(html).not.toContain("if (id === 'catalog') setFilter")
    expect(html).toContain("setFilter('all', true)\n    renderSaved")
  })

  test('every imported palette keeps the active chip readable', () => {
    const palettes = [
      { bg: '#efefef', ink: '#5c5852' },
      { bg: '#0c0f12', ink: '#e6e2d8' },
    ]
    for (const palette of palettes) {
      const spec = buildSpec({
        name: 'Wash',
        vertical: 'shop',
        accent: '#8a8a8a',
        logo: 'W',
        features: ['catalog'],
        site: { design: { ...palette, palette: true, radius: 6, basis: '' } },
      })
      const html = renderApp(spec, { token: 't', live: false })
      const style = html.split('<style>')[1].split('</style>')[0]
      const bg = style.match(/--bg: (#[0-9a-f]{6})/)?.[1] as string
      const chipOn = style.match(/--chip-on: (#[0-9a-f]{6})/)?.[1] as string
      const chipOnInk = style.match(/--chip-on-ink: (#[0-9a-f]{6})/)?.[1] as string
      expect(bg).toBe(palette.bg)
      expect(contrast(chipOn, bg)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(chipOnInk, chipOn)).toBeGreaterThanOrEqual(4.5)
    }

    for (const id of Object.keys(THEMES)) {
      const spec = buildSpec({ name: 'Theme', vertical: id as never, accent: '', logo: 'T', features: [] })
      const style = renderApp(spec, { token: 't', live: false }).split('<style>')[1].split('</style>')[0]
      const bg = style.match(/--bg: (#[0-9a-f]{6})/)?.[1] as string
      const chipOn = style.match(/--chip-on: (#[0-9a-f]{6})/)?.[1] as string
      expect(contrast(chipOn, bg)).toBeGreaterThanOrEqual(4.5)
    }
  })

  test('the active chip gets its own contrasting pair, not the site palette', () => {
    expect(style).toMatch(/--chip-on: #/)
    expect(style).toMatch(/--chip-on-ink: #/)
    expect(style).toMatch(/\.chip\.on \{[^}]*background: var\(--chip-on\)[^}]*color: var\(--chip-on-ink\)/)
    expect(style).toMatch(/\.detail-gap \{ flex: 0 0 14px/)
    expect(style).toContain('body[data-nav="floating"] .screen.is-detail { bottom: var(--nav-space); }')
  })

  test('system back walks the screens instead of exiting', () => {
    expect(html).toContain('history.pushState')
    expect(html).toContain("addEventListener('popstate'")
    expect(html).toContain('history.replaceState')
  })

  test('a build with no phone number does not offer a dead call button', () => {
    // A phone the owner actually supplied renders a call button; the trade's
    // sample number is hidden from customers until they confirm it.
    const withPhone = buildSpec({ name: 'Voice', vertical: 'salon', accent: '#8a5a2b', logo: 'V', features: [] })
    withPhone.phone = '020 7946 0018'
    expect(renderApp(withPhone, { token: 't', live: false })).toContain('aria-label="Call"')
    const noPhone = buildSpec({ name: 'Voice', vertical: 'salon', accent: '#8a5a2b', logo: 'V', features: [] })
    expect(renderApp(noPhone, { token: 't', live: false })).not.toContain('aria-label="Call"')
    noPhone.phone = ''
    expect(renderApp(noPhone, { token: 't', live: false })).not.toContain('aria-label="Call"')
  })
})

describe('PWA metadata', () => {
  test('a manifest gives the install identity', () => {
    const pwa = parseManifest(
      JSON.stringify({
        name: 'Fern & Co',
        display: 'standalone',
        theme_color: '#2f5d3a',
        background_color: '#faf7f2',
        icons: [{ src: '/icons/icon-192.png' }],
      }),
      new URL('https://fern.example.com/site.webmanifest'),
    )
    expect(pwa!.name).toBe('Fern & Co')
    expect(pwa!.display).toBe('standalone')
    expect(pwa!.themeColor).toBe('#2f5d3a')
    expect(pwa!.backgroundColor).toBe('#faf7f2')
    expect(pwa!.icon).toBe('https://fern.example.com/icons/icon-192.png')
  })

  test('junk is not a manifest', () => {
    expect(parseManifest('not json', new URL('https://fern.example.com/m.json'))).toBeUndefined()
    expect(parseManifest('{}', new URL('https://fern.example.com/m.json'))).toBeUndefined()
  })
})

describe('an import carries the look into the build', () => {
  const page = `<!doctype html><html><head><title>Fern & Co</title>
    <link rel="stylesheet" href="/theme.css">
    <link rel="manifest" href="/site.webmanifest">
    <meta name="description" content="Flowers, delivered the same day.">
    </head><body><p>Seasonal bouquets. Add to cart.</p>
    <script>navigator.serviceWorker.register('/sw.js')</script></body></html>`

  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input)
    if (url.endsWith('/theme.css'))
      return new Response(SITE_CSS, { headers: { 'content-type': 'text/css' } })
    if (url.endsWith('/site.webmanifest'))
      return new Response(
        JSON.stringify({
          name: 'Fern & Co',
          display: 'standalone',
          theme_color: '#2f5d3a',
          background_color: '#faf7f2',
        }),
        { headers: { 'content-type': 'application/manifest+json' } },
      )
    return new Response(page, { headers: { 'content-type': 'text/html' } })
  }) as unknown as typeof fetch

  test('design and PWA are reported, and survive the round trip', async () => {
    const report = await importWebsite('https://fern.example.com', fetchImpl)
    expect(report.site.design?.bg).toBe('#f6f1e8')
    expect(report.site.design?.radius).toBe(14)
    expect(report.site.pwa?.display).toBe('standalone')
    expect(report.site.pwa?.serviceWorker).toBe(true)
    expect(report.found.join(' | ')).toContain('their look')
    expect(report.found.join(' | ')).toContain('PWA manifest')
    expect(report.notes.join(' ')).toContain('measured, not copied')
  })

  test('the app renders in their palette, not the trade’s', () => {
    const spec = buildSpec({
      name: 'Fern & Co',
      vertical: 'shop',
      accent: '#2f5d3a',
      logo: 'F',
      features: ['catalog'],
      site: {
        design: {
          bg: '#f6f1e8',
          ink: '#1b1611',
          radius: 14,
          dark: false,
          palette: true,
          basis: '',
        },
      },
    })
    const html = renderApp(spec, { token: 't', live: false })
    expect(html).toContain('#f6f1e8')
    expect(html).toContain('--radius: 14px')
  })

  test('a hostile design is dropped rather than rendered', () => {
    expect(cleanDesign({ bg: '#ffffff', ink: '#fdfdfd' })).toBeUndefined()
    expect(cleanDesign({ bg: 'javascript:alert(1)', ink: '#000' })).toBeUndefined()
    expect(cleanDesign({ bg: '#111111', ink: '#f5f5f5', radius: 999 })!.radius).toBe(26)
  })
})
