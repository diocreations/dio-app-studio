import { describe, expect, test } from 'bun:test'
import { renderApp } from '../src/worker/app'
import { createProject } from '../src/worker/db'
import {
  docFromSpec,
  flagshipDocFromSpec,
  homeScreen,
  homeSections,
  moveSection,
  normalizeDoc,
  updateSection,
} from '../src/worker/doc'
import { FLAGSHIP_TRADES, sectionImageSource } from '../src/worker/flagship'
import app from '../src/worker/index'
import { buildSpec } from '../src/worker/pricing'
import type { VerticalId } from '../src/worker/types'
import { MemoryD1 } from './memoryD1'
import { ownerCookieFor } from './ownerCookie'

const MARKERS: Partial<Record<VerticalId, string>> = {
  restaurant: 'fx-dine',
  shop: 'fx-shop',
  salon: 'fx-salon',
  hotel: 'fx-hotel',
  professional: 'fx-pro',
  cafe: 'fx-cafe',
  gym: 'fx-gym',
  clinic: 'fx-clinic',
  property: 'fx-property',
  studio: 'fx-studio',
  trades: 'fx-trades',
  auto: 'fx-auto',
  ecommerce: 'fx-ecom',
  courses: 'fx-courses',
  finance: 'fx-finance',
  hospital: 'fx-hospital',
  'plants-indoor': 'fx-plants-indoor',
  'plants-outdoor': 'fx-plants-outdoor',
  tuition: 'fx-tuition',
  school: 'fx-school',
  kindergarten: 'fx-kindergarten',
  agency: 'fx-agency',
  influencer: 'fx-influencer',
  portfolio: 'fx-portfolio',
  film: 'fx-film',
  gallery: 'fx-gallery',
  marketplace: 'fx-marketplace',
}

function probeSpec(vertical: VerticalId) {
  return buildSpec({
    name: 'Flagship Probe',
    vertical,
    accent: '#2f4a3f',
    logo: 'FP',
    features: [],
  })
}

function renderFlagship(vertical: VerticalId, flagship = true): string {
  return renderApp(probeSpec(vertical), { token: `flagship-${vertical}`, live: false, flagship })
}

/** The owner's own view: sample names stay editable there, never public. */
function renderFlagshipEditor(vertical: VerticalId): string {
  return renderApp(probeSpec(vertical), {
    token: `flagship-${vertical}-editor`,
    live: false,
    flagship: true,
    editor: true,
  })
}

describe('flagship compositions', () => {
  test('every flagship trade gets its own front page', () => {
    expect([...FLAGSHIP_TRADES].sort()).toEqual((Object.keys(MARKERS) as VerticalId[]).sort())
    const signatures = new Set<string>()
    for (const [vertical, marker] of Object.entries(MARKERS) as [VerticalId, string][]) {
      const html = renderFlagship(vertical)
      expect(html).toContain('data-flagship="1"')
      expect(html, `${vertical} composition`).toContain(marker)
      expect(html, `${vertical} catalogue`).toContain('data-screen="catalog"')
      signatures.add(html.length + '|' + marker)
    }
    expect(signatures.size).toBe(27)
  })

  test('a concept chosen on the brief becomes the document direction', () => {
    const spec = buildSpec({
      name: 'Concept Probe',
      vertical: 'restaurant',
      accent: '#2f4a3f',
      logo: 'CP',
      features: [],
      direction: 'luxe',
    })
    expect(spec.direction).toBe('luxe')
    const doc = flagshipDocFromSpec(spec)
    expect(doc.design?.direction).toBe('luxe')
    // The document is the source of truth from birth: a save and reload keeps it,
    // and an unknown direction on a stored spec falls back rather than inventing.
    expect(normalizeDoc(JSON.parse(JSON.stringify(doc)), spec).design?.direction).toBe('luxe')
    const unknown = buildSpec({ name: 'Concept Probe', vertical: 'restaurant', accent: '#2f4a3f', logo: 'CP', features: [], direction: 'not-a-direction' })
    expect(unknown.direction).toBeUndefined()
    expect(flagshipDocFromSpec(unknown).design?.direction).toBe('editorial')
  })

  test('the flagship layer keeps the real customer workflows', () => {
    const restaurant = renderFlagship('restaurant')
    expect(restaurant).toContain('data-checkout-name')
    expect(restaurant).toContain('data-book-name')
    expect(restaurant).toContain('/orders')
    expect(restaurant).toContain('/bookings')
    expect(restaurant).not.toContain('Demo checkout')

    const salon = renderFlagship('salon')
    expect(salon).toContain('Request appointment')
    expect(salon).toContain('data-book-name')

    const professional = renderFlagship('professional')
    // A practice's first step is a proposal; the intro-call screen stays
    // available but is not advertised as already booked.
    expect(professional).toContain('Request a proposal')
    expect(professional).toContain('Request a consultation')
    expect(professional).not.toContain('Book a consultation')
  })

  test('a saved document without flagship blocks keeps the document renderer', () => {
    // The published page must never show static flagship markup that ignores a
    // saved document: a build whose document has no flagship nodes stays on the
    // document renderer even for a flagship trade.
    for (const vertical of ['hospital', 'tuition', 'school'] as VerticalId[]) {
      const spec = probeSpec(vertical)
      const legacy = docFromSpec(spec)
      const html = renderApp(spec, { token: `legacy-${vertical}`, live: false, flagship: true, doc: legacy })
      expect(html).not.toContain('data-flagship="1"')
      expect(html).toContain(`data-trade="${vertical}"`)
    }
  })

  test('the second batch keeps each trade workflow and its own section language', () => {
    const cafe = renderFlagship('cafe')
    expect(cafe).toContain('data-sec="sec_fx_cafe_menu"')
    expect(cafe).toContain('data-sec="sec_fx_cafe_order"')
    expect(cafe).toContain('data-cart-open')
    expect(cafe).toContain('Reserve a table')
    expect(cafe).toContain('data-book-name')
    expect(cafe).not.toContain('id="book-service"')

    const gym = renderFlagship('gym')
    expect(gym).toContain('data-sec="sec_fx_gym_timetable"')
    expect(gym).toContain('Strength 101')
    // Ada is the trade's sample coach: public renders never name her as staff,
    // while the owner's editor keeps the sample so it stays replaceable.
    expect(gym).not.toContain('with Ada')
    expect(renderFlagshipEditor('gym')).toContain('with Ada')
    expect(gym).toContain('Membership enquiry')
    expect(gym).toContain('data-book-name')
    expect(gym).toContain('data-quote-message')

    const clinic = renderFlagship('clinic')
    expect(renderFlagshipEditor('clinic')).toContain('data-sec="sec_fx_clinic_doctors"')
    expect(clinic).not.toContain('Dr Amara Osei')
    expect(renderFlagshipEditor('clinic')).toContain('Dr Amara Osei')
    expect(clinic).not.toContain('New patients welcome')
    expect(clinic).toContain('Please do not include medical details')
    expect(clinic).toContain('Appointment, treatment or a general question')
    expect(clinic).toContain('data-book-name')

    const property = renderFlagship('property')
    expect(property).toContain('data-sec="sec_fx_property_listings"')
    expect(property).toContain('data-property-filter')
    expect(property).toContain('Search by area, price or bedrooms')
    expect(property).toContain('$685,000')
    expect(property).toContain('Book a viewing')
    expect(property).toContain('Request a valuation')

    const studio = renderFlagship('studio')
    expect(studio).toContain('data-sec="sec_fx_studio_work"')
    expect(renderFlagshipEditor('studio')).toContain('Nell Fraser')
    expect(studio).not.toContain('Nell Fraser')
    expect(studio).toContain('Request a shoot brief')
    expect(studio).toContain('Book a call')
    expect(studio).toContain('data-quote-message')
  })

  test('the third batch keeps each trade workflow and its own section language', () => {
    const trades = renderFlagship('trades')
    expect(trades).toContain('data-sec="sec_fx_trades_jobs"')
    expect(trades).toContain('Leak repair')
    expect(trades).toContain('24/7 emergency')
    expect(trades).toContain('Request a quote')
    expect(trades).toContain('data-book-name')
    expect(trades).toContain('data-quote-message')

    const auto = renderFlagship('auto')
    expect(auto).toContain('data-sec="sec_fx_auto_jobs"')
    expect(auto).toContain('Full service')
    expect(auto).toContain('fx-auto-plate')
    expect(auto).toContain('What a service includes')
    expect(auto).toContain('data-book-name')

    const ecommerce = renderFlagship('ecommerce')
    expect(ecommerce).toContain('data-sec="sec_fx_ecom_products"')
    expect(ecommerce).toContain('data-add=')
    expect(ecommerce).toContain('data-cart-open')
    expect(ecommerce).toContain('data-checkout-name')
    expect(ecommerce).toContain('Everyday tote')

    const courses = renderFlagship('courses')
    expect(courses).toContain('data-sec="sec_fx_courses_list"')
    expect(courses).toContain('Read a set of accounts')
    expect(courses).toContain('What\'s included')
    expect(courses).toContain('Browse the courses')
    expect(courses).toContain('data-checkout-name')

    const finance = renderFlagship('finance')
    expect(finance).toContain('data-sec="sec_fx_finance_disclosure"')
    expect(finance).not.toContain('Fee-only')
    expect(finance).toContain('Capital at risk')
    expect(renderFlagshipEditor('finance')).toContain('Helen Marsh')
    expect(finance).not.toContain('Helen Marsh')
    expect(finance).toContain('data-book-name')
    expect(finance).toContain('data-quote-message')
  })

  test('fallback art is decorative, not a fake product photograph', () => {
    const shop = renderFlagship('shop')
    expect(shop).toContain('class="fx-art')
    expect(shop).toContain('aria-hidden="true"')
    expect(shop).not.toContain('src="https://images.pexels.com')
  })

  test('every flagship starts as document blocks with stable ids', () => {
    for (const vertical of FLAGSHIP_TRADES) {
      const spec = buildSpec({ name: 'Document Probe', vertical, accent: '#2f4a3f', logo: 'DP', features: [] })
      const doc = flagshipDocFromSpec(spec)
      const sections = homeSections(doc)
      expect(sections.length).toBeGreaterThan(3)
      expect(new Set(sections.map((node) => node.id)).size).toBe(sections.length)
      for (const node of sections) {
        expect(node.kind).toBe('flagship')
        expect(node.variant).toBeTruthy()
        expect(node.id).toMatch(/^sec_[a-z0-9_-]+$/)
      }
      const html = renderApp(spec, { token: `doc-${vertical}`, live: false, flagship: true, doc, editor: true })
      for (const node of sections) expect(html).toContain(`data-sec="${node.id}"`)
    }
  })

  test('a saved flagship document drives order, copy, hiding and imagery', () => {
    const spec = buildSpec({ name: 'Document Probe', vertical: 'restaurant', accent: '#2f4a3f', logo: 'DP', features: ['ordering', 'booking'] })
    let doc = flagshipDocFromSpec(spec)
    const home = homeScreen(doc)
    doc = updateSection(doc, home.id, 'sec_fx_dine_title', { title: 'A changed restaurant' })
    doc = updateSection(doc, home.id, 'sec_fx_dine_feature', {
      text: 'The owner wrote this line.',
      media: { id: 'med_0123456789abcdef', width: 1200, height: 800, alt: 'Dish', focalX: 32, focalY: 61 },
    })
    doc = moveSection(doc, home.id, 'sec_fx_dine_feature', 'sec_fx_dine_title')
    doc = updateSection(doc, home.id, 'sec_fx_dine_note', { hidden: true })
    const html = renderApp(spec, { token: 'saved-flagship', live: false, flagship: true, doc })
    expect(html).toContain('A changed restaurant')
    expect(html).toContain('The owner wrote this line.')
    expect(html).toContain('/p/saved-flagship/media/med_0123456789abcdef/640.webp')
    expect(html).toContain('object-position:32% 61%')
    expect(html.indexOf('data-sec="sec_fx_dine_feature"')).toBeLessThan(
      html.indexOf('data-sec="sec_fx_dine_title"'),
    )
    expect(html).not.toContain('data-sec="sec_fx_dine_note"')
  })

  test('the app API saves, publishes and restores the exact flagship document', async () => {
    const db = new MemoryD1() as unknown as D1Database
    const project = await createProject(db, {
      name: 'Flagship Save',
      contact: '',
      email: '',
      vertical: 'restaurant',
      accent: '#c8452b',
      logo: 'FS',
      features: ['catalog', 'ordering', 'booking'],
      platforms: ['pwa'],
      plan: 'onetime',
    })
    const env = { DB: db, ASSETS: {} as Fetcher }
    const cookie = await ownerCookieFor(db, project)
    const initial = await (
      await app.request(`https://plattr.example/p/${project.token}/app`, {}, env as never)
    ).text()
    expect(initial).toContain('data-sec="sec_fx_dine_title"')

    let doc = flagshipDocFromSpec(project.spec)
    const home = homeScreen(doc)
    // The editor saves its starting document on first open; that is the
    // baseline a later restore returns to.
    await app.request(
      `https://plattr.example/api/projects/${project.token}/doc`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json', origin: 'https://plattr.example', cookie },
        body: JSON.stringify({ doc }),
      },
      env as never,
    )
    doc = updateSection(doc, home.id, 'sec_fx_dine_title', { title: 'Published exactly' })
    const put = await app.request(
      `https://plattr.example/api/projects/${project.token}/doc`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json', origin: 'https://plattr.example', cookie },
        body: JSON.stringify({ doc }),
      },
      env as never,
    )
    expect(put.status).toBe(200)
    const published = await (
      await app.request(`https://plattr.example/p/${project.token}/app`, {}, env as never)
    ).text()
    expect(published).toContain('Published exactly')
    expect(published).toContain('data-sec="sec_fx_dine_title"')

    const listed = (await (
      await app.request(`https://plattr.example/api/projects/${project.token}/doc/versions`, { headers: { cookie } }, env as never)
    ).json()) as { versions: { id: string }[] }
    expect(listed.versions.length).toBeGreaterThan(0)
    const restored = await app.request(
      `https://plattr.example/api/projects/${project.token}/doc/versions/${listed.versions[0].id}/restore`,
      { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://plattr.example', cookie } },
      env as never,
    )
    expect(restored.status).toBe(200)
    const after = await (
      await app.request(`https://plattr.example/p/${project.token}/app`, {}, env as never)
    ).text()
    expect(after).not.toContain('Published exactly')
  })

  test('the editor exposes direct component controls and handles canvas drops', async () => {
    const db = new MemoryD1() as unknown as D1Database
    const project = await createProject(db, {
      name: 'Flagship Edit',
      contact: '',
      email: '',
      vertical: 'shop',
      accent: '#2a5a8f',
      logo: 'FE',
      features: ['catalog'],
      platforms: ['pwa'],
      plan: 'onetime',
    })
    const env = { DB: db, ASSETS: {} as Fetcher }
    const cookie = await ownerCookieFor(db, project)
    const html = await (
      await app.request(`https://plattr.example/p/${project.token}/edit`, { headers: { cookie } }, env as never)
    ).text()
    expect(html).toContain('id="quickEditor"')
    expect(html).toContain('data-quick="photo"')
    expect(html).toContain("message.type === 'move'")
    expect(html).toContain('data-sec')
  })

  test('the dashboard edits doctor and coach profile cards without a rebuild', async () => {
    const db = new MemoryD1() as unknown as D1Database
    const project = await createProject(db, {
      name: 'Profile Clinic',
      contact: '',
      email: '',
      vertical: 'clinic',
      accent: '#2a5a8f',
      logo: 'PC',
      features: ['catalog', 'booking', 'quote'],
      platforms: ['pwa'],
      plan: 'onetime',
    })
    const env = { DB: db, ASSETS: {} as Fetcher }
    const cookie = await ownerCookieFor(db, project)
    const response = await app.request(
      `https://plattr.example/api/projects/${project.token}/app-settings`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json', origin: 'https://plattr.example', cookie },
        body: JSON.stringify({
          team: 'Dr Sam Rivera | Clinical lead | GDC 12345\nNia Cole | Hygienist',
        }),
      },
      env as never,
    )
    expect(response.status).toBe(200)
    const saved = (await response.json()) as { spec: { team: { name: string; role: string }[]; staff: string[] } }
    expect(saved.spec.team.map((person) => person.name)).toEqual(['Dr Sam Rivera', 'Nia Cole'])
    expect(saved.spec.staff).toEqual(['Dr Sam Rivera', 'Nia Cole'])
    const html = await (
      await app.request(`https://plattr.example/p/${project.token}/app`, {}, env as never)
    ).text()
    expect(html).toContain('Dr Sam Rivera')
    expect(html).toContain('Clinical lead')
  })

  test('an owner can relabel and retarget a batch-2 call to action', () => {
    const cases = [
      ['cafe', 'sec_fx_cafe_reserve'],
      ['gym', 'sec_fx_gym_join'],
      ['clinic', 'sec_fx_clinic_appointments'],
      ['property', 'sec_fx_property_viewing'],
      ['studio', 'sec_fx_studio_book'],
      ['trades', 'sec_fx_trades_quote'],
      ['auto', 'sec_fx_auto_quote'],
      ['ecommerce', 'sec_fx_ecom_delivery'],
      ['courses', 'sec_fx_courses_enrol'],
      ['finance', 'sec_fx_finance_review'],
    ] as const
    for (const [vertical, sectionId] of cases) {
      const spec = buildSpec({ name: 'CTA Probe', vertical, accent: '#2f4a3f', logo: 'CP', features: [] })
      let doc = flagshipDocFromSpec(spec)
      doc = updateSection(doc, homeScreen(doc).id, sectionId, {
        cta: { label: `QA ${vertical} action`, screen: 'scr_catalog' },
      })
      const html = renderApp(spec, { token: `cta-${vertical}`, live: false, flagship: true, doc })
      const start = html.indexOf(`data-sec="${sectionId}"`)
      const next = html.indexOf('data-sec="', start + 1)
      const block = html.slice(start, next === -1 ? undefined : next)
      expect(block, `${vertical} label`).toContain(`QA ${vertical} action`)
      expect(block, `${vertical} destination`).toContain('data-go="catalog"')
    }
  })
})

describe('section photograph source', () => {
  const node = (kind: string, variant?: string) => ({ kind, variant, media: undefined }) as never

  test('edits section media only where the section renders it', () => {
    expect(sectionImageSource(node('image'))).toBe('section')
    expect(sectionImageSource(node('flagship', 'pro-intro'))).toBe('section')
    expect(sectionImageSource(node('flagship', 'story'))).toBe('section')
  })

  test('sends product, room and service blocks to the catalogue', () => {
    for (const variant of ['dine-feature', 'shop-products', 'salon-services', 'hotel-cover', 'hotel-rooms', 'ecom-products'])
      expect(sectionImageSource(node('flagship', variant))).toBe('catalogue')
  })
})

test('a restaurant with no published dishes offers the table request, not an empty menu', () => {
  const spec = buildSpec({
    name: 'Padella',
    vertical: 'restaurant',
    accent: '#c8452b',
    logo: 'P',
    features: ['catalog', 'ordering', 'booking'],
    // A saved menu can hold empty sections; counting sections rather than
    // dishes used to send this home button to an empty catalogue.
    site: { website: 'https://www.padella.co', menu: [{ name: 'Menu', items: [] }] },
  })
  expect(spec.actions?.view).toBe('View menu')
  expect(spec.actions?.book).toBe('Request a table')
  const doc = flagshipDocFromSpec(spec)
  const html = renderApp(spec, { token: 'empty-menu', live: false, flagship: true, doc })
  expect(html).toContain('Request a table')
  expect(html).toContain('data-go="book"')
  expect(html).not.toContain('>See the menu<')
})

test('the client bundle defines the missing-media mark it uses', () => {
  const html = renderApp(probeSpec('salon'), { token: 'client-mark', live: false, flagship: true })
  expect(html).toContain('const mediaMark = (label) =>')
})
