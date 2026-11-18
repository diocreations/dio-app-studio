import { describe, expect, test } from 'bun:test'
import { renderApp } from '../src/worker/app'
import { createProject } from '../src/worker/db'
import {
  addSection,
  applyCommand,
  docFromSpec,
  moveSection,
  normalizeDoc,
  sectionFor,
  updateSection,
} from '../src/worker/doc'
import app from '../src/worker/index'
import { buildSpec } from '../src/worker/pricing'
import { MemoryD1 } from './memoryD1'

function spec() {
  return buildSpec({
    name: 'Fern & Flint',
    vertical: 'shop',
    accent: '#2a5a8f',
    logo: 'FF',
    features: ['catalog', 'offers', 'loyalty', 'reviews'],
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
    features: ['catalog', 'offers', 'loyalty', 'reviews'],
    platforms: ['pwa'],
    plan: 'onetime',
  })
  return { db, project }
}

const JSON_HEADERS = { 'content-type': 'application/json' }

describe('the shared document', () => {
  test('a build starts with stable section ids and its own words', () => {
    const doc = docFromSpec(spec())
    expect(doc.sections[0]).toMatchObject({ id: 'sec_hero', kind: 'hero' })
    expect(doc.sections.map((section) => section.id)).toContain('sec_featured')
    expect(sectionFor(doc, 'story')?.text).toBeTruthy()
    expect(docFromSpec(spec()).sections.map((section) => section.id)).toEqual(
      doc.sections.map((section) => section.id),
    )
  })

  test('the hero cannot be moved and sections cannot duplicate ids', () => {
    const doc = docFromSpec(spec())
    expect(moveSection(doc, 'sec_hero', null)).toEqual(doc)
    const featured = sectionFor(doc, 'featured')!
    const visit = sectionFor(doc, 'visit')!
    const moved = moveSection(doc, visit.id, featured.id)
    expect(moved.sections.map((section) => section.kind).slice(0, 4)).toEqual([
      'hero',
      'visit',
      'featured',
      'offers',
    ])

    const attempted = normalizeDoc(
      {
        v: 1,
        sections: [
          { id: 'sec_featured', kind: 'featured' },
          { id: 'sec_featured', kind: 'featured', title: 'Second' },
          { id: 'sec_bad', kind: 'unknown' },
        ],
      },
      spec(),
    )
    expect(attempted.sections.filter((section) => section.kind === 'featured')).toHaveLength(1)
    expect(attempted.sections[0].kind).toBe('hero')

    // Ids the editor generates for added sections survive normalisation.
    const added = normalizeDoc(
      {
        v: 1,
        sections: [
          { id: 'sec_hero', kind: 'hero' },
          { id: 'sec_testimonials_m3x9', kind: 'testimonials' },
        ],
      },
      spec(),
    )
    expect(added.sections[1].id).toBe('sec_testimonials_m3x9')

    // The hero cannot be hidden: the page would lose its opening.
    const hidden = normalizeDoc(
      { v: 1, sections: [{ id: 'sec_hero', kind: 'hero', hidden: true }] },
      spec(),
    )
    expect(hidden.sections[0].hidden).toBe(false)
  })

  test('editing a section updates the same document the renderer reads', () => {
    const doc = docFromSpec(spec())
    const edited = updateSection(doc, 'sec_hero', { title: 'A different welcome', text: 'A new line.' })
    const html = renderApp(spec(), { token: 'editor-test', doc: edited })
    expect(html).toContain('data-sec="sec_hero"')
    expect(html).toContain('A different welcome')
    expect(html).toContain('A new line.')
  })

  test('order, hiding and added sections all reach the rendered page', () => {
    let doc = docFromSpec(spec())
    doc = moveSection(doc, 'sec_visit', 'sec_featured')
    doc = updateSection(doc, 'sec_offers', { hidden: true })
    doc = addSection(doc, 'testimonials', spec())
    doc = updateSection(doc, 'sec_testimonials', { title: 'Loved locally', text: 'Best shop in town.' })
    const html = renderApp(spec(), { token: 'editor-test', doc })
    expect(html.indexOf('data-sec="sec_visit"')).toBeLessThan(
      html.indexOf('data-sec="sec_featured"'),
    )
    expect(html).not.toContain('data-sec="sec_offers"')
    expect(html).toContain('Loved locally')
    expect(html).toContain('Best shop in town.')
  })

  test('responsive visibility is rendered as real CSS rules', () => {
    const doc = updateSection(docFromSpec(spec()), 'sec_story', {
      responsive: { hideOn: ['mobile'] },
    })
    const html = renderApp(spec(), { token: 'editor-test', doc })
    expect(html).toContain('hide-mobile')
    expect(html).toContain('.hide-mobile { display: none !important; }')
  })
})

describe('the local design assistant', () => {
  test('design words change the accent and say what they did', () => {
    const doc = docFromSpec(spec())
    const premium = applyCommand(doc, 'make this feel premium', spec())
    expect(premium.doc.accent).toBe('#9a7b4f')
    expect(premium.summary).toContain('premium')
  })

  test('it can add a section, reorder, and refuses to guess', () => {
    const doc = docFromSpec(spec())
    const added = applyCommand(doc, 'add a testimonials section', spec())
    expect(sectionFor(added.doc, 'testimonials')).toBeTruthy()

    const reordered = applyCommand(doc, 'rearrange the homepage', spec())
    expect(reordered.doc.sections[1].kind).toBe(doc.sections[2].kind)

    const unknown = applyCommand(doc, 'make it dance', spec())
    expect(unknown.doc).toEqual(doc)
    expect(unknown.summary).toContain('did not catch')
  })
})

describe('the editor and its API', () => {
  test('the editor page is private and draws all three panels', async () => {
    const { db, project } = await projectWithDb()
    const env = { DB: db, ASSETS: {} as Fetcher }
    const response = await app.request(`https://plattr.example/p/${project.token}/edit`, {}, env)
    expect(response.status).toBe(200)
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    const html = await response.text()
    expect(html).toContain('Properties')
    expect(html).toContain('Add a section')
    expect(html).toContain('Structure')
    expect(html).toContain('content="noindex, nofollow"')
  })

  test('a document save is persisted and read back by the app', async () => {
    const { db, project } = await projectWithDb()
    const env = { DB: db, ASSETS: {} as Fetcher }
    const start = await app.request(`https://plattr.example/api/projects/${project.token}/doc`, {}, env)
    const startBody = (await start.json()) as { doc: { sections: { id: string }[] }; saved: boolean }
    expect(startBody.saved).toBe(false)
    const doc = docFromSpec(project.spec)
    const hero = sectionFor(doc, 'hero')!
    doc.sections = doc.sections.map((section) =>
      section.id === hero.id ? { ...section, title: 'Saved by the editor' } : section,
    )

    const put = await app.request(
      `https://plattr.example/api/projects/${project.token}/doc`,
      {
        method: 'PUT',
        headers: { ...JSON_HEADERS, origin: 'https://plattr.example' },
        body: JSON.stringify({ doc }),
      },
      env,
    )
    expect(put.status).toBe(200)
    const saved = await app.request(`https://plattr.example/api/projects/${project.token}/doc`, {}, env)
    const savedBody = (await saved.json()) as { saved: boolean }
    expect(savedBody.saved).toBe(true)

    const html = await (
      await app.request(`https://plattr.example/p/${project.token}/app`, {}, env)
    ).text()
    expect(html).toContain('Saved by the editor')
  })

  test('cross-site, wrong-type and unknown-token writes are refused', async () => {
    const { db, project } = await projectWithDb()
    const env = { DB: db, ASSETS: {} as Fetcher }
    const path = `https://plattr.example/api/projects/${project.token}/doc`
    const body = JSON.stringify({ doc: docFromSpec(project.spec) })

    const cross = await app.request(
      path,
      { method: 'PUT', headers: { ...JSON_HEADERS, origin: 'https://evil.example' }, body },
      env,
    )
    expect(cross.status).toBe(403)

    const wrongType = await app.request(
      path,
      { method: 'PUT', headers: { 'content-type': 'text/plain' }, body },
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
    const { db, project } = await projectWithDb()
    const env = { DB: db, ASSETS: {} as Fetcher }
    const response = await app.request(
      `https://plattr.example/api/projects/${project.token}/doc/ai`,
      {
        method: 'POST',
        headers: { ...JSON_HEADERS, origin: 'https://plattr.example' },
        body: JSON.stringify({
          command: 'add a testimonials section',
          doc: docFromSpec(project.spec),
        }),
      },
      env,
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      doc: { sections: { kind: string }[] }
      summary: string
    }
    expect(body.doc.sections.some((section) => section.kind === 'testimonials')).toBe(true)
    expect(body.summary).toContain('testimonials')

    // Nothing was written: the stored document is still absent.
    const stored = await app.request(`https://plattr.example/api/projects/${project.token}/doc`, {}, env)
    expect(((await stored.json()) as { saved: boolean }).saved).toBe(false)
  })
})
