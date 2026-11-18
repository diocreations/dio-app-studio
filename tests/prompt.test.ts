import { describe, expect, test } from 'bun:test'
import { renderApp } from '../src/worker/app'
import app from '../src/worker/index'
import { buildSpec } from '../src/worker/pricing'
import { cleanLayout, designsFor, readPrompt } from '../src/worker/prompt'
import { briefPage } from '../src/worker/views/brief'

describe('one sentence becomes a brief', () => {
  test('a typo still lands on the right trade', () => {
    const read = readPrompt('I need an app for my saloon')
    expect(read.vertical).toBe('salon')
    expect(read.confidence).toBe('detected')
    expect(read.evidence).toContain('saloon')
  })

  test('an art gallery is read as a gallery, not the default trade', () => {
    const read = readPrompt('i need an app for my art gallery')
    expect(read.vertical).toBe('gallery')
    expect(read.evidence).toContain('art gallery')
  })

  test('the trade decides which features are offered', () => {
    const salon = readPrompt('an app for my hair salon').features
    const gym = readPrompt('an app for my gym').features
    const garage = readPrompt('an app for my garage').features
    expect(salon).toContain('booking')
    expect(gym).toContain('classes')
    expect(garage).toContain('quote')
    expect(new Set([salon.join(), gym.join(), garage.join()]).size).toBe(3)
  })

  test('what the customer asks for is added on top, with a reason', () => {
    const read = readPrompt('App for my gym with class bookings and a loyalty card')
    expect(read.vertical).toBe('gym')
    for (const id of ['catalog', 'classes', 'booking', 'loyalty'] as const)
      expect(read.features).toContain(id)
    // Named by the trade, not the prompt, so it says so.
    expect(read.suggestions.find((entry) => entry.id === 'loyalty')?.why).toContain('Standard')

    const bilingual = readPrompt('a salon app with a Spanish version')
    expect(bilingual.features).toContain('multilingual')
    expect(bilingual.suggestions.find((entry) => entry.id === 'multilingual')?.why).toContain(
      'spanish',
    )
  })

  test('a sentence with no trade in it says it is guessing', () => {
    const read = readPrompt('I need an app for my business')
    expect(read.confidence).toBe('guessed')
    expect(read.features.length).toBeGreaterThan(0)
  })

  test('an empty or hostile prompt is cleaned, not rendered', () => {
    expect(readPrompt('<script>alert(1)</script>').prompt).toBe('alert(1)')
    expect(readPrompt(null).prompt).toBe('')
    expect(readPrompt('x'.repeat(400)).prompt).toHaveLength(240)
  })
})

describe('three designs that are actually different', () => {
  const designs = designsFor('salon')
  const axes = ['variant', 'density', 'corners', 'hero', 'order', 'heroScale', 'buttons', 'cards'] as const

  test('there are three, each with its own preview', () => {
    expect(designs).toHaveLength(3)
    expect(new Set(designs.map((design) => design.id)).size).toBe(3)
    expect(new Set(designs.map((design) => design.preview)).size).toBe(3)
    for (const design of designs) expect(design.preview.startsWith('/demo/app?biz=salon')).toBe(true)
  })

  test('no two share a single axis', () => {
    for (let first = 0; first < designs.length; first += 1) {
      for (let second = first + 1; second < designs.length; second += 1) {
        for (const axis of axes)
          expect(designs[first].axes[axis]).not.toBe(designs[second].axes[axis])
      }
    }
  })

  test('the chosen design is what the build renders', () => {
    const spec = buildSpec({
      name: 'North Salon',
      vertical: 'salon',
      accent: '#7a4b8f',
      logo: 'NS',
      features: ['catalog', 'booking'],
      layout: cleanLayout(designs[0].axes),
    })
    expect(spec.layout).toEqual(designs[0].axes)
    const chosen = renderApp(spec, { token: 'salon-build', live: false })
    expect(chosen).toContain('data-variant="0"')
    expect(chosen).toContain('data-hero="image"')
    const other = renderApp(
      { ...spec, layout: designs[1].axes },
      { token: 'salon-build', live: false },
    )
    expect(other).toContain('data-variant="1"')
    expect(other).not.toBe(chosen)
  })

  test('an empty preview query never wipes the chosen design', () => {
    const spec = buildSpec({
      name: 'North Salon',
      vertical: 'salon',
      accent: '#7a4b8f',
      logo: 'NS',
      features: ['catalog', 'booking'],
      layout: cleanLayout(designs[1].axes),
    })
    const html = renderApp(spec, {
      token: 'salon-build',
      live: false,
      preview: { variant: undefined, density: '', corners: '', hero: '', order: '', heroScale: '' },
    })
    expect(html).toContain('data-variant="1"')
    expect(html).toContain('data-density="roomy"')
    expect(html).toContain('data-corners="round"')
    expect(html).toContain('data-hero="centered"')
    expect(html).toContain('data-order="visit"')
    expect(html).toContain('data-hero-scale="tall"')
  })

  test('the demo route ignores blank axes', async () => {
    const response = await app.request(
      'https://plattr.example/demo/app?biz=salon&variant=&density=',
      undefined,
      { ASSETS: {} as Fetcher } as never,
    )
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).not.toContain('data-density=""')
  })

  test('the element style a customer picks reaches the build, over the trade', () => {
    const spec = buildSpec({
      name: 'North Salon',
      vertical: 'salon',
      accent: '#7a4b8f',
      logo: 'NS',
      features: ['catalog', 'booking'],
      layout: cleanLayout({ ...designs[1].axes, buttons: 'square', cards: 'round' }),
    })
    expect(spec.layout?.buttons).toBe('square')
    // The stylesheet always carries the rules; the body tag is the build.
    const bodyTag = (html: string) => /<body ([^>]*)>/.exec(html)?.[1] ?? ''
    const html = renderApp(spec, { token: 'salon-build', live: false })
    expect(bodyTag(html)).toContain('data-buttons="square"')
    expect(bodyTag(html)).toContain('data-cards="round"')
    // The trade's own rule squares every rounded part with a heavier selector,
    // so the customer's choice sets the radius once per shape, marked important.
    expect(html).toContain('body[data-buttons="square"] { --el-control-r: 0; }')
    expect(html).toContain('body[data-cards="round"] { --el-panel-r: 26px; }')
    // Every control follows the choice, not just the primary button: the appbar
    // icons (search, saved, call), the saved hearts, the search field, the nav
    // bar and its Home/Services/Book items.
    const controls =
      /body\[data-buttons\] :is\(([\s\S]*?)\) \{\s*border-radius: var\(--el-control-r\) !important; \}/
        .exec(html)?.[1]
        .split(',')
        .map((part) => part.trim())
    for (const selector of ['.btn', '.iconbtn', '.save', '.tab', '.nav-list button', '.search-pill'])
      expect(controls).toContain(selector)
    // The nav bar container follows too, but a bottom-pinned bar shapes its top
    // edge only, so the page cannot show through the screen's bottom corners.
    expect(html).toContain('body[data-buttons] .tabbar { border-radius: var(--el-tabbar-r) !important; }')
    expect(html).toContain(
      'body[data-buttons][data-nav="bar"]:not([data-trade="cafe"])',
    )
    // The drawer rows need a fill to show a shape at all.
    expect(html).toContain('body[data-buttons] .nav-list button')
    // Untouched designs keep their own shapes instead.
    const plain = renderApp({ ...spec, layout: designs[1].axes }, { token: 'salon-build', live: false })
    expect(bodyTag(plain)).toContain('data-buttons="round"')
    expect(bodyTag(plain)).not.toContain('data-buttons="square"')
  })

  test('the element shapes are optional, and a malformed one is dropped alone', () => {
    expect(cleanLayout(designs[0].axes)?.buttons).toBe('square')
    const older = cleanLayout({
      variant: 0, density: 'cozy', corners: 'sharp', hero: 'image', order: 'catalog',
      heroScale: 'immersive', cards: 'blob',
    })
    expect(older?.variant).toBe(0)
    expect(older?.buttons).toBeUndefined()
    expect(older?.cards).toBeUndefined()
  })

  test('a malformed layout is dropped whole, never half-applied', () => {
    expect(cleanLayout(designs[0].axes)).toEqual(designs[0].axes)
    expect(cleanLayout({ ...designs[0].axes, variant: 9 })).toBeUndefined()
    expect(cleanLayout({ ...designs[0].axes, corners: 'blob' })).toBeUndefined()
    expect(cleanLayout({ ...designs[0].axes, hero: undefined })).toBeUndefined()
    expect(cleanLayout(null)).toBeUndefined()
    expect(cleanLayout('variant=0')).toBeUndefined()
  })
})

describe('the prompt is the first thing on the brief', () => {
  test('the page asks in plain words and renders a design picker', () => {
    const html = briefPage()
    expect(html).toContain('id="wish"')
    expect(html).toContain('data-wish')
    expect(html).toContain('data-designs')
    expect(html).toContain('data-design-grid')
    expect(html).toContain('/api/prompt')
    expect(html).toContain('data-step-dot="0"')
  })

  test('picking a design lands on features, and the name waits for the build', () => {
    const html = briefPage()
    const business = html.slice(html.indexOf('data-step="1"'), html.indexOf('data-step="2"'))
    const delivery = html.slice(html.indexOf('data-step="3"'))
    expect(business).not.toContain('id="name"')
    expect(delivery).toContain('id="name"')
    expect(html).toContain('Only needed to build')
    // No name gate on the way from business details to features.
    expect(html).not.toContain('Add the business name first')
  })

  test('the trade and brand colour stay reachable after a design pick skips that step', () => {
    const html = briefPage()
    const trade = html.slice(html.indexOf('data-step="1"'), html.indexOf('data-step="2"'))
    const features = html.slice(html.indexOf('data-step="2"'), html.indexOf('data-step="3"'))
    expect(trade).toContain('name="vertical"')
    expect(trade).toContain('data-swatches')
    expect(trade).toContain('id="accent"')
    // The step is named, and the features step points back at it by name.
    expect(html).toContain('2 Trade &amp; brand')
    expect(features).toContain('data-back="1"')
    expect(features).toContain('&larr; Trade &amp; brand')
  })

  test('the brief lets the customer pick the element shapes', () => {
    const html = briefPage()
    for (const key of ['buttons', 'cards', 'density']) expect(html).toContain(`data-el="${key}"`)
    expect(html).toContain('Little curve')
  })

  test('the endpoint answers with a trade, features and three designs', async () => {
    const response = await app.request(
      'https://plattr.example/api/prompt',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: 'I need an app for my gym with classes' }),
      },
      { ASSETS: {} as Fetcher } as never,
    )
    expect(response.status).toBe(200)
    const data = (await response.json()) as {
      vertical: string
      features: string[]
      designs: unknown[]
    }
    expect(data.vertical).toBe('gym')
    expect(data.features).toContain('classes')
    expect(data.designs).toHaveLength(3)
  })

  test('a prompt that says nothing is refused, not guessed at silently', async () => {
    const response = await app.request(
      'https://plattr.example/api/prompt',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: '  ' }),
      },
      { ASSETS: {} as Fetcher } as never,
    )
    expect(response.status).toBe(422)
  })
})
