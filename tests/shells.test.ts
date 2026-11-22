import { describe, expect, test } from 'bun:test'
import { renderApp } from '../src/worker/app'
import { buildSpec } from '../src/worker/pricing'
import { PHOTO_KEYWORDS } from '../src/worker/themes'
import { VERTICALS } from '../src/worker/verticals'

type VirtualNode = { tag?: string; attrs?: Record<string, string>; classes: string[] }
type CssRule = { selector: string; props: Record<string, string>; order: number }

/** Minimal CSS reader: top-level rules only, at-rule bodies skipped. */
function parseCss(css: string): CssRule[] {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const rules: CssRule[] = []
  let index = 0
  let order = 0
  while (index < source.length) {
    const open = source.indexOf('{', index)
    if (open < 0) break
    const prelude = source.slice(index, open).trim()
    let depth = 1
    let close = open + 1
    while (close < source.length && depth > 0) {
      if (source[close] === '{') depth++
      else if (source[close] === '}') depth--
      close++
    }
    if (!prelude.startsWith('@')) {
      const props: Record<string, string> = {}
      for (const part of source.slice(open + 1, close - 1).split(';')) {
        const colon = part.indexOf(':')
        if (colon < 1) continue
        props[part.slice(0, colon).trim()] = part.slice(colon + 1).trim()
      }
      // Split selector lists on commas that are not inside a pseudo function.
      for (const selector of prelude.split(/,\s*(?![^()]*\))/)) {
        rules.push({ selector: selector.replace(/\s+/g, ' ').trim(), props, order: order++ })
      }
    }
    index = close
  }
  return rules
}

function specificity(selector: string): number {
  const ids = (selector.match(/#/g) ?? []).length
  const classes = (selector.match(/[.[:]/g) ?? []).length
  const tags = (selector.match(/(?:^|[\s>+~])([a-z][a-z0-9-]*)/gi) ?? []).length
  return ids * 10000 + classes * 100 + tags
}

function node(variant: string, density: string, classes: string[]): VirtualNode[] {
  return [
    {
      tag: 'body',
      attrs: { 'data-variant': variant, 'data-density': density, 'data-corners': 'soft' },
      classes: [],
    },
    { classes },
  ]
}

function matches(selector: string, path: VirtualNode[]): boolean {
  const tokens = selector.split(' ').filter(Boolean)
  if (tokens.length === 0 || tokens.length > path.length) return false
  const slice = path.slice(path.length - tokens.length)
  return tokens.every((token, index) => {
    const target = slice[index]
    const tag = token.match(/^([a-z][a-z0-9-]*)/i)?.[1].toLowerCase()
    if (tag && target.tag !== tag) return false
    const classes = [...token.matchAll(/\.([a-z0-9-]+)/gi)].map((match) => match[1])
    if (!classes.every((name) => target.classes.includes(name))) return false
    const attrs = [...token.matchAll(/\[([a-z-]+)="([^"]*)"\]/gi)]
    if (!attrs.every(([, key, value]) => target.attrs?.[key] === value)) return false
    return true
  })
}

/** Winning declarations for a virtual element, replaying specificity and order. */
function cascade(rules: CssRule[], path: VirtualNode[]): Record<string, string> {
  const winners = new Map<string, { weight: number; order: number; value: string }>()
  for (const rule of rules) {
    if (!matches(rule.selector, path)) continue
    const weight = specificity(rule.selector)
    for (const [property, value] of Object.entries(rule.props)) {
      const best = winners.get(property)
      if (!best || weight > best.weight || (weight === best.weight && rule.order > best.order)) {
        winners.set(property, { weight, order: rule.order, value })
      }
    }
  }
  return Object.fromEntries([...winners].map(([property, best]) => [property, best.value]))
}

const build = (vertical: string) =>
  renderApp(
    buildSpec({ name: 'Reference', vertical: vertical as never, accent: '', logo: 'R', features: [] }),
    { token: 't', live: false },
  )

describe('reference trades carry their own shell', () => {
  test('a restaurant opens on the menu, not a home page', () => {
    const html = build('restaurant')
    expect(html).toContain('"shell":"menu"')
    expect(html).toMatch(/class="screen on" data-screen="catalog"/)
    expect(html).toContain('<span>Menu</span>')
    expect(html).toContain('<span>Visit</span>')
    expect(html).not.toContain('<span>Home</span>')
    expect(html).toContain("DATA.shell === 'menu'")
    // No invented house policy in the shell copy.
    expect(html).not.toContain('Tell the team about allergies when you order.')
    // Tax treatment is never inferred from a website read.
    expect(html).not.toContain('Prices include tax')
    expect(html).not.toContain('Rates include tax')
  })

  test('a gym is a session app with an icon-only dock', () => {
    const html = build('gym')
    expect(html).toContain('"shell":"session"')
    expect(html).toContain('sess-today')
    expect(html).toContain('<span>Today</span>')
    expect(html).toContain('<span>Classes</span>')
    expect(html).toContain("DATA.shell === 'session'")
    expect(html).toContain('body[data-shell="session"] .tab span { display: none; }')
    // Intensity and coach were invented; the class card keeps only real fields.
    expect(html).not.toContain('Intensity')
    expect(html).not.toContain('<span>Coach</span>')
  })

  test('a clinic is a care app, a property app is a listings app', () => {
    const clinic = build('clinic')
    expect(clinic).toContain('"shell":"care"')
    expect(clinic).toContain('care-visit')
    expect(clinic).toContain('<span>Care</span>')
    expect(clinic).toContain('<span>Contact</span>')
    expect(clinic).toContain("DATA.shell === 'care'")
    expect(clinic).not.toContain('Free cancellation')
    expect(clinic).not.toContain('No referral needed')

    const property = build('property')
    expect(property).toContain('"shell":"listing"')
    expect(property).toMatch(/class="screen on" data-screen="catalog"/)
    expect(property).toContain('listing-lead')
    expect(property).toContain('<span>Search</span>')
    expect(property).toContain('<span>Viewings</span>')
    expect(property).toContain("DATA.shell === 'listing'")
    expect(property).not.toContain('<b>45 min</b>')
    // The bar shows the listing name once a detail is open.
    expect(property).toContain('bar-titles')
    expect(property).toContain('body[data-shell="listing"].is-detail .bar-pill { display: none; }')
  })

  test('six builds of one trade do not share a single variant', () => {
    const variants = new Set<string>()
    for (const name of ['Fern', 'Flint', 'Foundry', 'Fable', 'Field', 'Fathom']) {
      const html = renderApp(
        buildSpec({ name, vertical: 'shop', accent: '', logo: 'F', features: [] }),
        { token: 't' + name, live: false },
      )
      // Read the body attributes, not the stylesheet selectors that share the names.
      variants.add(
        html.match(/<body [^>]*data-variant="\d" data-density="\w+" data-corners="\w+" data-media="\w+"/)?.[0] ??
          'missing',
      )
    }
    expect(variants.size).toBeGreaterThan(1)
    for (const variant of variants)
      expect(variant).toMatch(
        /data-variant="[0-3]" data-density="(cozy|standard|roomy)" data-corners="(sharp|soft|round)" data-media="(photo|mixed|art)"/,
      )
  })

  test('the seed spreads over the whole variation space', () => {
    const counts = new Map<string, number>()
    const total = 400
    for (let index = 0; index < total; index++) {
      const html = renderApp(
        buildSpec({ name: `Biz ${index}`, vertical: 'shop', accent: '', logo: 'B', features: [] }),
        {
          token: `tok${index}`,
          live: false,
          photos: { wide: ['https://img.test/w.jpg'], thumb: ['https://img.test/t.jpg'] },
        },
      )
      const match = html.match(
        /<body [^>]*data-variant="(\d)" data-density="(\w+)" data-corners="(\w+)" data-media="(\w+)"/,
      )
      expect(match).not.toBeNull()
      const key = match!.slice(1).join('/')
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const buckets = [...counts.values()]
    let samePairs = 0
    for (const count of buckets) samePairs += (count * (count - 1)) / 2
    const allPairs = (total * (total - 1)) / 2

    // 4 card layouts x 3 densities x 3 corner languages x 3 media treatments.
    expect(counts.size).toBeGreaterThanOrEqual(95)
    expect(Math.max(...buckets)).toBeLessThanOrEqual(14)
    expect(samePairs / allPairs).toBeLessThan(0.02)
  })

  test('the media axis decides whether a build uses photography', () => {
    const photos = {
      wide: ['https://images.example.test/wide-vase.jpg'],
      thumb: ['https://images.example.test/thumb-vase.jpg'],
    }
    const render = (media: string, resolved = true) =>
      renderApp(
        buildSpec({ name: 'Media Probe', vertical: 'shop', accent: '', logo: 'M', features: [] }),
        { token: 'probe', live: false, preview: { media }, ...(resolved ? { photos } : {}) },
      )

    expect(render('photo')).toContain('images.example.test/wide-vase.jpg')
    expect(render('photo')).toContain('images.example.test/thumb-vase.jpg')
    // `mixed` keeps the photographic cover and leaves the interior to artwork.
    expect(render('mixed')).toContain('wide-vase.jpg')
    expect(render('mixed')).not.toContain('thumb-vase.jpg')
    expect(render('art')).not.toContain('images.example.test')
    expect(render('art')).toMatch(/data-media="art"/)
    // No resolved photos means no image requests at all, not a random stand-in.
    expect(render('photo', false)).not.toMatch(/<img class="photo" src="https:/)
    expect(render('photo')).not.toContain('picsum')
    expect(render('photo')).not.toContain('openverse')
    // No photos resolved means the build falls back to artwork, not to a
    // random image service.
    expect(
      renderApp(
        buildSpec({ name: 'Default Probe', vertical: 'shop', accent: '', logo: 'D', features: [] }),
        { token: 'default', live: false },
      ),
    ).toMatch(/data-media="art"/)
  })

  // A rule existing in the stylesheet is not the same as a rule winning. These
  // helpers replay specificity and source order against a virtual element, so a
  // variant that is shadowed by a base or density rule fails the test below.
  test('variant rules actually win the cascade on rows, stack and editorial', () => {
    const html = build('clinic')
    const css = html.match(/<style>([\s\S]*?)<\/style>/)![1]
    const rules = parseCss(css)

    // Each shell reads as a group: a variant may restyle the container or any of
    // the nodes inside it, but at least one of them has to win something new.
    const inner = (variant: string, density: string, shell: string, child: string) => [
      ...node(variant, density, [shell]),
      { classes: [child] },
    ]
    const groups: Record<string, (variant: string, density: string) => VirtualNode[][]> = {
      '.tiles': (variant, density) => [
        node(variant, density, ['tiles']),
        node(variant, density, ['tile']),
        inner(variant, density, 'tile', 'thumb'),
        inner(variant, density, 'tile', 'body'),
        inner(variant, density, 'tile', 'name'),
      ],
      '.r-row': (variant, density) => [
        node(variant, density, ['r-row']),
        inner(variant, density, 'r-row', 'r-art'),
        inner(variant, density, 'r-row', 'name'),
      ],
      '.stack-card': (variant, density) => [
        node(variant, density, ['stack-card']),
        inner(variant, density, 'stack-card', 'band'),
        inner(variant, density, 'stack-card', 'body'),
      ],
      '.h-row': (variant, density) => [
        node(variant, density, ['h-row']),
        inner(variant, density, 'h-row', 'name'),
        inner(variant, density, 'h-row', 'right'),
      ],
    }

    for (const variant of ['1', '2', '3']) {
      for (const density of ['cozy', 'standard', 'roomy']) {
        for (const [name, group] of Object.entries(groups)) {
          const current = group(variant, density)
          const baseline = group('0', density)
          const changed = current.some((path, index) => {
            const before = cascade(rules, baseline[index])
            const after = cascade(rules, path)
            return Object.keys(after).some(
              (property) => after[property] !== undefined && after[property] !== before[property],
            )
          })
          expect(changed, `${name} has no effect under variant ${variant}/${density}`).toBe(true)
        }
      }
    }

    // Imagery must survive every variant, including the "media first" one.
    for (const variant of ['1', '2', '3']) {
      for (const density of ['cozy', 'standard', 'roomy']) {
        const band = cascade(rules, [...node(variant, density, ['stack-card']), { classes: ['band'] }])
        expect(band.display).not.toBe('none')
        expect(band.height).toBeTruthy()
        // "media first" keeps the motif, just shorter than the standard 152px band.
        if (variant === '2') expect(band.height, `v2/${density} band`).toBe('86px')
      }
    }
  })

  test('a reference preset is opt-in and leaves normal builds alone', () => {
    expect(build('restaurant')).not.toContain('data-preset=')
    const spec = buildSpec({ name: 'Preset Probe', vertical: 'restaurant', accent: '', logo: 'P', features: [] })
    const feast = renderApp(spec, { token: 't', live: false, preview: { preset: 'feast' } })
    expect(feast).toContain('data-preset="feast"')
    expect(feast).toContain('body[data-preset="feast"] .h-row')
    const unknown = renderApp(spec, { token: 't', live: false, preview: { preset: 'nope' } })
    expect(unknown).not.toContain('data-preset=')
    // Inherited object keys are not preset names.
    const inherited = renderApp(spec, { token: 't', live: false, preview: { preset: 'toString' } })
    expect(inherited).not.toContain('data-preset=')
    expect(inherited).not.toMatch(/undefined<\/style>/)
  })

  test('every trade knows what its photographs should show', () => {
    for (const id of Object.keys(VERTICALS)) {
      expect(PHOTO_KEYWORDS[id as keyof typeof PHOTO_KEYWORDS]).toBeString()
      // Single searchable words: Openverse treats multiple words as AND.
      expect(PHOTO_KEYWORDS[id as keyof typeof PHOTO_KEYWORDS].length).toBeGreaterThanOrEqual(3)
      expect(PHOTO_KEYWORDS[id as keyof typeof PHOTO_KEYWORDS]).not.toContain(' ')
    }
  })

  test('the standard shell is untouched for the other trades', () => {
    const shop = build('shop')
    expect(shop).toContain('"shell":"standard"')
    expect(shop).toMatch(/class="screen on" data-screen="home"/)
    expect(shop).toContain('<span>Home</span>')
    expect(shop).toContain('<span>More</span>')
  })
})
