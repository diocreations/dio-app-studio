import { describe, expect, test } from 'bun:test'
import { renderApp } from '../src/worker/app'
import { createProject } from '../src/worker/db'
import {
  addScreen,
  addSection,
  applyCommand,
  docFromSpec,
  detachComponent,
  duplicateScreen,
  duplicateSection,
  homeScreen,
  insertComponent,
  saveSectionAsComponent,
  homeSections,
  moveComponentToScreen,
  moveScreen,
  moveSection,
  normalizeDoc,
  removeScreen,
  renameScreen,
  screenFor,
  setInitialScreen,
  setScreenHidden,
  setScreenKind,
  setScreenNav,
  syncComponentInstances,
  updateSection,
} from '../src/worker/doc'
import app from '../src/worker/index'
import { buildSpec } from '../src/worker/pricing'
import { MemoryD1 } from './memoryD1'
import { ownerCookieFor } from './ownerCookie'

function spec() {
  return buildSpec({
    name: 'Fern & Flint',
    vertical: 'shop',
    accent: '#2a5a8f',
    logo: 'FF',
    features: ['catalog', 'offers', 'loyalty', 'reviews', 'booking', 'quote'],
  })
}

async function projectWithDb() {
  const db = new MemoryD1() as unknown as D1Database
  const project = await createProject(db, {
    name: 'Fern & Flint',
    contact: '',
    email: '',
    vertical: 'shop',
    accent: '#2a5a8f',
    logo: 'FF',
    features: ['catalog', 'offers', 'loyalty', 'reviews', 'booking', 'quote'],
    platforms: ['pwa'],
    plan: 'onetime',
  })
  return { db, project, cookie: await ownerCookieFor(db, project) }
}

const JSON_HEADERS = { 'content-type': 'application/json' }

describe('the application document', () => {
  test('a build starts with screens, navigation and a home screen', () => {
    const doc = docFromSpec(spec())
    expect(doc.v).toBe(2)
    expect(doc.screens[0]).toMatchObject({ id: 'scr_home', kind: 'home', nav: true })
    expect(doc.screens.map((entry) => entry.kind)).toContain('catalog')
    expect(doc.screens.map((entry) => entry.kind)).toContain('book')
    expect(doc.screens.map((entry) => entry.kind)).toContain('quote')
    expect(doc.initialScreen).toBe('scr_home')
    expect(homeSections(doc)[0]).toMatchObject({ id: 'sec_hero', kind: 'hero' })
    // Stable across builds.
    expect(docFromSpec(spec()).screens.map((entry) => entry.id)).toEqual(
      doc.screens.map((entry) => entry.id),
    )
  })

  test('version-1 section documents become the home screen of the app', () => {
    const upgraded = normalizeDoc(
      {
        v: 1,
        accent: '#123456',
        sections: [
          { id: 'sec_hero', kind: 'hero', title: 'Kept hero' },
          { id: 'sec_testimonials', kind: 'testimonials', title: 'Kind words' },
        ],
      },
      spec(),
    )
    expect(upgraded.v).toBe(2)
    expect(homeSections(upgraded)[1]).toMatchObject({ kind: 'testimonials', title: 'Kind words' })
    expect(upgraded.screens.map((entry) => entry.kind)).toContain('catalog')
  })

  test('screen ids, kinds and initial screen are normalised', () => {
    const doc = docFromSpec(spec())
    const raw = normalizeDoc(
      {
        v: 2,
        initialScreen: 'missing',
        screens: [
          { id: 'scr_home', kind: 'home', sections: [] },
          { id: 'scr_contact', kind: 'contact', name: 'Help', nav: true },
          { id: 'scr_contact', kind: 'contact', name: 'Duplicate' },
          { id: 'scr_bad', kind: 'not-a-screen' },
          { id: 'scr_testimonials_m3x9', kind: 'custom', sections: [{ id: 'sec_testimonials_m3x9', kind: 'testimonials' }] },
        ],
      },
      spec(),
    )
    expect(raw.screens.filter((entry) => entry.kind === 'contact')).toHaveLength(1)
    expect(raw.initialScreen).toBe('scr_home')
    expect(raw.screens.some((entry) => entry.id === 'scr_testimonials_m3x9')).toBe(true)
    expect(doc.screens.length).toBeGreaterThan(2)
  })
})

describe('screens and navigation', () => {
  test('screens can be added, renamed, duplicated, moved and removed', () => {
    let doc = docFromSpec(spec())
    doc = addScreen(doc, 'contact', spec())
    expect(screenFor(doc, 'contact')).toMatchObject({ id: 'scr_contact', nav: true })
    expect(doc.screens.filter((entry) => entry.kind === 'contact')).toHaveLength(1)
    // Adding an existing built-in kind is a no-op, never a duplicate.
    expect(addScreen(doc, 'contact', spec())).toEqual(doc)

    doc = renameScreen(doc, 'scr_contact', 'Say hello')
    expect(screenFor(doc, 'contact')?.name).toBe('Say hello')
    doc = setScreenNav(doc, 'scr_contact', false)
    expect(screenFor(doc, 'contact')?.nav).toBe(false)
    doc = setInitialScreen(doc, 'scr_contact')
    expect(doc.initialScreen).toBe('scr_contact')

    doc = duplicateScreen(doc, 'scr_contact')
    expect(doc.screens.filter((entry) => entry.kind === 'custom')).toHaveLength(1)

    doc = moveScreen(doc, 'scr_contact', 'scr_home')
    expect(doc.screens[0].kind).toBe('home')
    expect(doc.screens[1].kind).toBe('contact')

    const removed = removeScreen(doc, 'scr_contact')
    expect(screenFor(removed, 'contact')).toBeUndefined()
    // The initial screen falls back to home when its screen disappears.
    expect(removed.screens.some((entry) => entry.id === removed.initialScreen)).toBe(true)
    expect(removeScreen(removed, 'scr_home')).toEqual(removed)
  })

  test('a screen can change type, hide and reopen without losing its content', () => {
    let doc = docFromSpec(spec())
    doc = addScreen(doc, 'custom', spec())
    const custom = screenFor(doc, 'custom')!
    // Every section starts with a stable, valid id — even before a save.
    const ids = doc.screens.flatMap((screen) => screen.sections.map((node) => node.id))
    expect(ids.every((id) => /^sec_[a-z0-9_-]{1,40}$/.test(id))).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
    expect(normalizeDoc(doc, spec()).screens.flatMap((screen) => screen.sections.map((node) => node.id))).toEqual(ids)
    doc = renameScreen(doc, custom.id, 'Field notes')
    doc = setScreenKind(doc, custom.id, 'about')
    expect(screenFor(doc, 'about')).toMatchObject({ id: custom.id, name: 'Field notes' })
    // A built-in role cannot be duplicated by a second screen.
    doc = addScreen(doc, 'profile', spec())
    const profile = screenFor(doc, 'profile')!
    expect(setScreenKind(doc, custom.id, 'profile')).toEqual(doc)
    // Built-in app screens keep their role and cannot be withdrawn.
    expect(setScreenKind(doc, 'scr_catalog', 'about')).toEqual(doc)
    expect(setScreenHidden(doc, 'scr_catalog', true)).toEqual(doc)

    doc = setScreenNav(doc, custom.id, true)
    expect(renderApp(spec(), { token: 'screen-kind', doc })).toContain('data-screen="' + custom.id + '"')
    doc = setScreenHidden(doc, custom.id, true)
    const hidden = renderApp(spec(), { token: 'screen-kind', doc })
    expect(hidden).not.toContain('data-screen="' + custom.id + '"')
    expect(hidden).not.toContain('<span>Field notes</span>')

    // The opening screen is always visible; choosing it clears a hide.
    expect(setScreenHidden(doc, profile.id, true).screens.find((entry) => entry.id === profile.id)?.hidden).toBe(true)
    doc = setInitialScreen(doc, custom.id)
    expect(screenFor(doc, 'about')?.hidden).toBe(false)
    expect(setScreenHidden(doc, custom.id, true)).toEqual(doc)
  })

  test('the rendered app follows screen order, navigation and initial screen', () => {
    let doc = docFromSpec(spec())
    doc = addScreen(doc, 'contact', spec())
    doc = updateSection(doc, 'scr_contact', 'sec_heading', { title: 'Come say hello' })
    doc = setInitialScreen(doc, 'scr_contact')
    const html = renderApp(spec(), { token: 'screen-test', doc })

    expect(html).toContain('data-screen="scr_contact"')
    expect(html).toContain('Come say hello')
    expect(html).toContain('data-go="scr_contact"')
    expect(html).toContain('class="screen on" data-screen="scr_contact"')
    // The contact screen rides the app's bottom navigation.
    expect(html).toContain('<span>Contact</span>')

    const off = setScreenNav(doc, 'scr_contact', false)
    const hidden = renderApp(spec(), { token: 'screen-test', doc: off })
    expect(hidden).not.toContain('<span>Contact</span>')
  })

  test('components can be reordered, hidden and added per screen', () => {
    let doc = docFromSpec(spec())
    const home = homeScreen(doc)
    const featured = homeSections(doc).find((node) => node.kind === 'featured')!
    const visit = homeSections(doc).find((node) => node.kind === 'visit')!
    doc = moveSection(doc, home.id, visit.id, featured.id)
    expect(homeSections(doc).slice(0, 3).map((node) => node.kind)).toEqual(['hero', 'visit', 'featured'])

    doc = updateSection(doc, home.id, 'sec_offers', { hidden: true })
    doc = addSection(doc, home.id, 'testimonials', spec())
    doc = updateSection(doc, home.id, 'sec_testimonials', {
      title: 'Loved locally',
      text: 'Best shop in town.',
    })
    const html = renderApp(spec(), { token: 'component-test', doc })
    expect(html.indexOf('data-sec="sec_visit"')).toBeLessThan(html.indexOf('data-sec="sec_featured"'))
    expect(html).not.toContain('data-sec="sec_offers"')
    expect(html).toContain('Loved locally')
    expect(html).toContain('Best shop in town.')
  })

  test('a duplicated screen keeps its remapped element records and a deleted screen drops them', () => {
    let doc = docFromSpec(spec())
    doc = addScreen(doc, 'contact', spec())
    const contact = screenFor(doc, 'contact')!
    const sourceSection = contact.sections[0].id
    const sourceKey = `${sourceSection}~h1~0`
    const cloneKey = `${sourceSection}~div~0~cabc123`
    doc = normalizeDoc(
      {
        ...doc,
        elements: {
          [sourceKey]: { text: 'A copied welcome', style: { fontSize: 31 }, action: { screen: 'scr_home' } },
          [cloneKey]: {
            duplicateOf: sourceKey,
            copyTree: { [sourceKey]: `${sourceSection}~h1~0~cabc123` },
          },
        },
      },
      spec(),
    )

    const duplicated = duplicateScreen(doc, contact.id)
    const custom = duplicated.screens.find((entry) => entry.kind === 'custom')!
    const copiedSection = custom.sections[0].id
    expect(copiedSection).not.toBe(sourceSection)
    expect(duplicated.elements?.[`${copiedSection}~h1~0`]).toMatchObject({
      text: 'A copied welcome',
      style: { fontSize: 31 },
      action: { screen: 'scr_home' },
    })
    expect(duplicated.elements?.[`${copiedSection}~div~0~cabc123`]?.copyTree).toEqual({
      [`${copiedSection}~h1~0`]: `${copiedSection}~h1~0~cabc123`,
    })
    expect(duplicated.elements?.[sourceKey]?.text).toBe('A copied welcome')

    const repeated = duplicateScreen(duplicated, contact.id)
    const allSections = repeated.screens.flatMap((entry) => entry.sections.map((section) => section.id))
    expect(new Set(allSections).size).toBe(allSections.length)

    const removed = removeScreen(repeated, custom.id)
    expect(Object.keys(removed.elements ?? {}).some((key) => key.startsWith(copiedSection + '~'))).toBe(false)
    expect(removed.elements?.[sourceKey]?.text).toBe('A copied welcome')
  })

  test('a section can be reused, updated everywhere and detached as an independent copy', () => {
    const business = spec()
    const itemId = 'itm_0123456789abcdef'
    const homeId = homeScreen(docFromSpec(business)).id
    const listId = 'sec_product_list'
    const media = {
      id: 'med_0123456789abcdef01234567',
      alt: 'Shared photo',
      width: 1200,
      height: 800,
    }
    let doc = normalizeDoc(
      {
        ...docFromSpec(business),
        screens: docFromSpec(business).screens.map((screen) =>
          screen.id === homeId
            ? {
                ...screen,
                sections: [
                  ...screen.sections,
                  {
                    id: listId,
                    kind: 'productList',
                    itemRef: itemId,
                    cta: { label: 'View', screen: 'scr_catalog' },
                    style: {},
                    responsive: { hideOn: [] },
                    hidden: false,
                  },
                ],
              }
            : screen,
        ),
        elements: {
          [`${listId}~h3~0`]: {
            text: 'Shared heading',
            media,
            action: { screen: 'scr_catalog' },
          },
        },
      },
      business,
    )
    doc = saveSectionAsComponent(doc, homeId, listId, 'Product row')
    expect(doc.library).toHaveLength(1)
    const component = doc.library![0]
    expect(component.id).toBe('cmp_productlist')
    expect(component.section.itemRef).toBe(itemId)
    expect(component.elements?.[`${component.section.id}~h3~0`]?.media?.id).toBe(media.id)
    expect(doc.elements?.[`${listId}~h3~0`]?.media?.id).toBe(media.id)
    expect(homeSections(doc).find((node) => node.id === listId)?.componentId).toBe(component.id)

    doc = addScreen(doc, 'custom', business)
    const target = screenFor(doc, 'custom')!
    doc = insertComponent(doc, target.id, component.id)
    const instance = screenFor(doc, 'custom')!.sections.at(-1)!
    expect(instance.id).not.toBe(listId)
    expect(instance.id).not.toBe(component.section.id)
    expect(instance.componentId).toBe(component.id)
    // A second screen gets its own instance id, never the definition's.
    doc = addScreen(doc, 'custom', business)
    const secondTargetId = doc.screens.at(-1)!.id
    doc = insertComponent(doc, secondTargetId, component.id)
    const secondInstance = doc.screens.find((screen) => screen.id === secondTargetId)!.sections.at(-1)!
    expect(secondInstance.id).not.toBe(instance.id)
    expect(secondInstance.id).not.toBe(component.section.id)
    expect(secondInstance.componentId).toBe(component.id)
    // The same product, photo and action, with no second product identity.
    expect(instance.itemRef).toBe(itemId)
    expect(doc.elements?.[`${instance.id}~h3~0`]).toMatchObject({
      text: 'Shared heading',
      media: { id: media.id },
      action: { screen: 'scr_catalog' },
    })
    // One identity, shared by every copy — not a second catalogue product.
    expect(
      new Set([
        instance.itemRef,
        component.section.itemRef,
        homeSections(doc).find((node) => node.id === listId)?.itemRef,
      ]).size,
    ).toBe(1)

    doc = updateSection(doc, target.id, instance.id, { title: 'Reused row' })
    doc = syncComponentInstances(doc, target.id, instance.id)
    expect(homeSections(doc).find((node) => node.id === listId)?.title).toBe('Reused row')
    expect(doc.library![0].section.title).toBe('Reused row')

    doc = detachComponent(doc, target.id, instance.id)
    expect(screenFor(doc, 'custom')!.sections.at(-1)?.componentId).toBeUndefined()
    doc = updateSection(doc, target.id, instance.id, { title: 'Local row' })
    expect(doc.library![0].section.title).toBe('Reused row')
    expect(homeSections(doc).find((node) => node.id === listId)?.title).toBe('Reused row')

    // Duplicating a component is independent, not another linked instance.
    doc = duplicateSection(doc, target.id, instance.id)
    const copy = screenFor(doc, 'custom')!.sections.at(-1)!
    expect(copy.id).not.toBe(instance.id)
    expect(copy.componentId).toBeUndefined()
    expect(doc.elements?.[`${copy.id}~h3~0`]?.media?.id).toBe(media.id)

    const clean = normalizeDoc(doc, business)
    expect(clean.library?.[0]).toMatchObject({ id: component.id, name: 'Product row' })
    expect(clean.library?.[0].section.itemRef).toBe(itemId)
    expect(clean.library?.[0].elements?.[`${component.section.id}~h3~0`]?.action).toEqual({
      screen: 'scr_catalog',
    })
  })

  test('mobile component kinds render as real controls', () => {
    let doc = docFromSpec(spec())
    doc = addScreen(doc, 'custom', spec())
    const custom = doc.screens.find((entry) => entry.kind === 'custom')!
    doc = addSection(doc, custom.id, 'productList', spec())
    doc = addSection(doc, custom.id, 'button', spec())
    doc = updateSection(doc, custom.id, 'sec_button', {
      title: 'Book now',
      cta: { label: 'Book now', screen: 'scr_book' },
    })
    const html = renderApp(spec(), { token: 'components-test', doc })
    expect(html).toContain('data-screen="scr_custom"')
    // A working button, pointed at the booking screen's DOM id.
    expect(html).toContain('data-go="book"')
    expect(html).toContain('Book now')
    expect(html).toContain('data-item="0-0"')
  })

  test('components can move between screens without id collisions', () => {
    let doc = docFromSpec(spec())
    doc = addScreen(doc, 'contact', spec())
    doc = addSection(doc, 'scr_contact', 'testimonials', spec())
    const home = homeScreen(doc)
    const moving = home.sections.find((node) => node.kind === 'visit')!
    doc = moveComponentToScreen(doc, home.id, moving.id, 'scr_contact')
    expect(homeScreen(doc).sections.some((node) => node.id === moving.id)).toBe(false)
    const contact = doc.screens.find((entry) => entry.id === 'scr_contact')!
    expect(contact.sections.some((node) => node.id === moving.id)).toBe(true)
    // The hero never leaves home.
    expect(moveComponentToScreen(doc, home.id, 'sec_hero', 'scr_contact')).toEqual(doc)
  })

  test('responsive visibility is still real CSS', () => {
    const doc = updateSection(docFromSpec(spec()), 'scr_home', 'sec_story', {
      responsive: { hideOn: ['mobile'] },
    })
    const html = renderApp(spec(), { token: 'responsive-test', doc })
    expect(html).toContain('hide-mobile')
    expect(html).toContain('.hide-mobile { display: none !important; }')
  })
})

describe('the local design assistant', () => {
  test('design words change the accent and say what they did', () => {
    const premium = applyCommand(docFromSpec(spec()), 'make this feel premium', spec())
    expect(premium.doc.accent).toBe('#9a7b4f')
    expect(premium.summary).toContain('premium')
  })

  test('screen instructions edit the same document', () => {
    const doc = docFromSpec(spec())
    const contact = applyCommand(doc, 'add a contact screen', spec())
    expect(screenFor(contact.doc, 'contact')).toBeTruthy()
    expect(contact.summary).toContain('Contact screen')

    const blank = applyCommand(doc, 'add a new screen', spec())
    expect(blank.doc.screens.some((entry) => entry.kind === 'custom')).toBe(true)

    const testimonials = applyCommand(doc, 'add a testimonials section', spec())
    expect(homeSections(testimonials.doc).some((node) => node.kind === 'testimonials')).toBe(true)

    const nav = applyCommand(doc, 'add bottom navigation', spec())
    expect(nav.doc.screens.filter((entry) => entry.nav).length).toBeGreaterThanOrEqual(3)

    const unknown = applyCommand(doc, 'make it dance', spec())
    expect(unknown.doc).toEqual(doc)
    expect(unknown.summary).toContain('did not catch')
  })
})

describe('the editor and its API', () => {
  test('the editor page is private and built around the phone canvas', async () => {
    const { db, project, cookie } = await projectWithDb()
    const env = { DB: db, ASSETS: {} as Fetcher }
    const response = await app.request(`https://plattr.example/p/${project.token}/edit`, { headers: { cookie } }, env)
    expect(response.status).toBe(200)
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    const html = await response.text()
    expect(html).toContain('Screens')
    expect(html).toContain('Reusable components')
    expect(html).toContain('Layers on this screen')
    expect(html).toContain('Add component')
    expect(html).toContain('Properties')
    expect(html).toContain('class="phone mobile"')
    expect(html).toContain('content="noindex, nofollow"')
  })

  test('screens and components persist and are read back by the app', async () => {
    const { db, project, cookie } = await projectWithDb()
    const env = { DB: db, ASSETS: {} as Fetcher }
    const start = await app.request(`https://plattr.example/api/projects/${project.token}/doc`, { headers: { cookie } }, env)
    const startBody = (await start.json()) as { doc: { screens: unknown[] }; saved: boolean }
    expect(startBody.saved).toBe(false)

    let doc = docFromSpec(project.spec)
    doc = addScreen(doc, 'contact', project.spec)
    doc = updateSection(doc, homeScreen(doc).id, 'sec_hero', { title: 'Saved by the editor' })

    const put = await app.request(
      `https://plattr.example/api/projects/${project.token}/doc`,
      {
        method: 'PUT',
        headers: { ...JSON_HEADERS, origin: 'https://plattr.example', cookie },
        body: JSON.stringify({ doc }),
      },
      env,
    )
    expect(put.status).toBe(200)
    const saved = (await (
      await app.request(`https://plattr.example/api/projects/${project.token}/doc`, { headers: { cookie } }, env)
    ).json()) as { saved: boolean; doc: { screens: { kind: string }[] } }
    expect(saved.saved).toBe(true)
    expect(saved.doc.screens.some((entry) => entry.kind === 'contact')).toBe(true)

    const html = await (
      await app.request(`https://plattr.example/p/${project.token}/app`, {}, env)
    ).text()
    expect(html).toContain('Saved by the editor')
    expect(html).toContain('data-screen="scr_contact"')
  })

  test('saved versions list and restore the previous design', async () => {
    const { db, project, cookie } = await projectWithDb()
    const env = { DB: db, ASSETS: {} as Fetcher }
    const path = `https://plattr.example/api/projects/${project.token}/doc`
    const write = async (doc: ReturnType<typeof docFromSpec>) =>
      app.request(
        path,
        { method: 'PUT', headers: { ...JSON_HEADERS, origin: 'https://plattr.example', cookie }, body: JSON.stringify({ doc }) },
        env,
      )

    const first = docFromSpec(project.spec)
    first.screens[0].sections[0].title = 'Version one'
    expect((await write(first)).status).toBe(200)

    const second = docFromSpec(project.spec)
    second.screens[0].sections[0].title = 'Version two'
    expect((await write(second)).status).toBe(200)

    const listed = (await (
      await app.request(`https://plattr.example/api/projects/${project.token}/doc/versions`, { headers: { cookie } }, env)
    ).json()) as { versions: { id: string; createdAt: string }[] }
    expect(listed.versions.length).toBe(1)

    const restored = await app.request(
      `https://plattr.example/api/projects/${project.token}/doc/versions/${listed.versions[0].id}/restore`,
      { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://plattr.example', cookie } },
      env,
    )
    expect(restored.status).toBe(200)
    const restoredDoc = (await restored.json()) as { doc: { screens: { sections: { title?: string }[] }[] } }
    expect(restoredDoc.doc.screens[0].sections[0].title).toBe('Version one')

    const html = await (
      await app.request(`https://plattr.example/p/${project.token}/app`, {}, env)
    ).text()
    expect(html).toContain('Version one')

    const cross = await app.request(
      `https://plattr.example/api/projects/${project.token}/doc/versions/${listed.versions[0].id}/restore`,
      { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example', cookie } },
      env,
    )
    expect(cross.status).toBe(403)

    const missing = await app.request(
      `https://plattr.example/api/projects/${project.token}/doc/versions/dvr_missing/restore`,
      { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://plattr.example', cookie } },
      env,
    )
    expect(missing.status).toBe(404)
  })

  test('cross-site, wrong-type and unknown-token writes are refused', async () => {
    const { db, project, cookie } = await projectWithDb()
    const env = { DB: db, ASSETS: {} as Fetcher }
    const path = `https://plattr.example/api/projects/${project.token}/doc`
    const body = JSON.stringify({ doc: docFromSpec(project.spec) })

    const cross = await app.request(
      path,
      { method: 'PUT', headers: { ...JSON_HEADERS, origin: 'https://evil.example', cookie }, body },
      env,
    )
    expect(cross.status).toBe(403)

    const wrongType = await app.request(
      path,
      { method: 'PUT', headers: { 'content-type': 'text/plain', cookie }, body },
      env,
    )
    expect(wrongType.status).toBe(415)

    const missing = await app.request(
      'https://plattr.example/api/projects/000000000000000000000000/doc',
      { method: 'PUT', headers: { ...JSON_HEADERS, origin: 'https://plattr.example' }, body },
      env,
    )
    expect(missing.status).toBe(404)
  })

  test('AI previews are returned, not saved', async () => {
    const { db, project, cookie } = await projectWithDb()
    const env = { DB: db, ASSETS: {} as Fetcher }
    const response = await app.request(
      `https://plattr.example/api/projects/${project.token}/doc/ai`,
      {
        method: 'POST',
        headers: { ...JSON_HEADERS, origin: 'https://plattr.example', cookie },
        body: JSON.stringify({
          command: 'add a contact screen',
          doc: docFromSpec(project.spec),
        }),
      },
      env,
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      doc: { screens: { kind: string }[] }
      summary: string
    }
    expect(body.doc.screens.some((entry) => entry.kind === 'contact')).toBe(true)
    expect(body.summary).toContain('Contact')

    const stored = await app.request(`https://plattr.example/api/projects/${project.token}/doc`, { headers: { cookie } }, env)
    expect(((await stored.json()) as { saved: boolean }).saved).toBe(false)
  })
})
