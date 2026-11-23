import { describe, expect, test } from 'bun:test'
import { renderApp } from '../src/worker/app'
import {
  auditCoverage,
  blueprintFor,
  structureOf,
  validateConcepts,
  type ConceptBlueprintId,
} from '../src/worker/blueprints'
import { directionsFor } from '../src/worker/directions'
import { flagshipDocFromSpec, homeSections } from '../src/worker/doc'
import { buildSpec } from '../src/worker/pricing'

const TRADES = ['shop', 'restaurant', 'hotel', 'salon', 'professional'] as const

function specFor(vertical: (typeof TRADES)[number], name = 'Concept & Co') {
  const spec = buildSpec({
    name,
    vertical,
    accent: '#2f4a3f',
    logo: 'CC',
    features: ['catalog', 'booking', 'quote'],
  })
  // A named team is real content; the profile block otherwise draws nothing
  // and the publish guard hides it, which is a different concern from mapping.
  if (vertical === 'professional') {
    spec.team = [{ name: 'Ada Okafor', role: 'Partner' }]
    spec.staff = ['Ada Okafor']
    spec.sampleContent = { ...spec.sampleContent!, team: false, staff: false }
  }
  return spec
}

function docsFor(vertical: (typeof TRADES)[number], name?: string) {
  const base = specFor(vertical, name)
  return directionsFor(vertical).map((direction) => ({
    id: direction.id,
    spec: { ...base, direction: direction.id },
    doc: flagshipDocFromSpec({ ...base, direction: direction.id }),
  }))
}

/** The order the real renderer emits home blocks in. */
function renderedOrder(spec: Parameters<typeof flagshipDocFromSpec>[0], doc: ReturnType<typeof flagshipDocFromSpec>) {
  const html = renderApp(spec, { token: 'blueprint-probe', live: false, flagship: true, doc })
  const match = /<section[^>]*data-screen="home"/.exec(html)
  const start = match?.index ?? -1
  const next = start < 0 ? -1 : html.indexOf('<section', start + 8)
  const home = start < 0 || next < 0 ? '' : html.slice(start, next)
  return [...home.matchAll(/data-sec="(sec_[^"]+)"/g)].map((match) => match[1])
}

describe('structural blueprints', () => {
  test('every direction gets a blueprint, and a business gets all three', () => {
    for (const vertical of TRADES) {
      const base = specFor(vertical)
      const ids = directionsFor(vertical).map(
        (direction) => blueprintFor({ ...base, direction: direction.id }).id,
      )
      expect(new Set(ids).size).toBe(3)
    }
  })

  test('which direction gets which structure rotates with the business', () => {
    const samples: ConceptBlueprintId[][] = []
    for (let index = 0; index < 24 && samples.length < 2; index += 1) {
      const base = specFor('shop', `Business ${index}`)
      const ids = directionsFor('shop').map(
        (direction) => blueprintFor({ ...base, direction: direction.id }).id,
      )
      if (!samples.some((entry) => entry.join() === ids.join())) samples.push(ids)
    }
    expect(samples.length).toBe(2)
  })

  test('the three documents for each trade differ in hierarchy and in chrome', () => {
    for (const vertical of TRADES) {
      const docs = docsFor(vertical)
      const structures = docs.map((entry) => structureOf(entry.spec, entry.doc))
      for (let i = 0; i < structures.length; i += 1) {
        for (let j = i + 1; j < structures.length; j += 1) {
          const left = structures[i]
          const right = structures[j]
          expect(left.sections.join('>')).not.toBe(right.sections.join('>'))
          expect(left.initial !== right.initial || left.nav.join() !== right.nav.join()).toBe(true)
        }
      }
      expect(validateConcepts(docs[0].spec, docs).ok).toBe(true)
    }
  })

  test('the renderer emits each composition in its own order', () => {
    for (const vertical of TRADES) {
      const orders = docsFor(vertical).map((entry) => renderedOrder(entry.spec, entry.doc).join('>'))
      expect(new Set(orders).size).toBe(3)
    }
  })

  test('a tab bar never grows past five and always keeps home and catalogue', () => {
    for (const vertical of TRADES) {
      for (const entry of docsFor(vertical)) {
        const nav = entry.doc.screens.filter((screen) => screen.nav)
        expect(nav.length).toBeLessThanOrEqual(5)
        const kinds = nav.map((screen) => screen.kind)
        expect(kinds).toContain('home')
        expect(kinds).toContain('catalog')
        const initial = entry.doc.screens.find((screen) => screen.id === entry.doc.initialScreen)
        expect(initial?.kind === 'home' || initial?.kind === 'catalog').toBe(true)
      }
    }
  })

  test('generation keeps every block and the catalogue references it was given', () => {
    for (const vertical of TRADES) {
      const plain = homeSections(flagshipDocFromSpec(specFor(vertical)))
      const generated = docsFor(vertical)
      const variants = new Set(
        generated.flatMap((entry) => homeSections(entry.doc).map((node) => node.variant ?? '')),
      )
      const refs = new Set(generated.flatMap((entry) => homeSections(entry.doc).map((node) => node.itemRef)))
      for (const node of plain) {
        expect(variants.has(node.variant ?? '')).toBe(true)
        if (node.itemRef) expect(refs).toContain(node.itemRef)
      }
    }
  })

  test('the three concepts also differ in arrangement and navigation model', () => {
    for (const vertical of TRADES) {
      const entries = docsFor(vertical)
      const structures = entries.map((entry) => structureOf(entry.spec, entry.doc))
      const arrangements = new Set(structures.map((entry) => entry.layouts.join('>')))
      const models = new Set(entries.map((entry) => entry.doc.design?.nav))
      expect(arrangements.size).toBeGreaterThan(1)
      expect(models.size).toBe(3)
      // A catalogue cannot lose its product grid or become a different data set
      // just because the arrangement changed.
      for (const entry of entries) expect(entry.doc.screens.map((screen) => screen.kind)).toContain('catalog')
    }
  })

  test('every concept exposes its own architecture on the document body', () => {
    for (const vertical of TRADES) {
      for (const entry of docsFor(vertical)) {
        const blueprint = blueprintFor(entry.spec)
        const html = renderApp(entry.spec, {
          token: 'architecture-probe',
          live: false,
          flagship: true,
          doc: entry.doc,
        })
        expect(html).toContain(`data-concept="${blueprint.id}"`)
        expect(html).toContain(`data-header="${blueprint.architecture.header}"`)
        expect(html).toContain(`data-catalog="${blueprint.architecture.catalog}"`)
        expect(html).toContain(`data-detail="${blueprint.architecture.detail}"`)
        expect(html).toContain(`[data-concept="${blueprint.id}"]`)
        expect(html).not.toContain('Photograph to come')
      }
    }
  })

  test('the validator counts architecture, not palette, as differentiation', () => {
    for (const vertical of TRADES) {
      const docs = docsFor(vertical)
      const verdict = validateConcepts(docs[0].spec, docs)
      expect(verdict.ok).toBe(true)
      for (const pair of verdict.pairs) {
        expect(pair.axesDifferent).toBeGreaterThanOrEqual(5)
      }
    }
  })

  test('every visible component on each concept maps to its document node', () => {
    for (const vertical of TRADES) {
      for (const entry of docsFor(vertical)) {
        const html = renderApp(entry.spec, {
          token: 'audit-probe',
          live: false,
          flagship: true,
          doc: entry.doc,
        })
        const audit = auditCoverage(entry.doc, html)
        expect(audit.missing).toEqual([])
        expect(audit.unknown).toEqual([])
      }
    }
  })

  test('identical documents are rejected however they are styled', () => {
    const base = specFor('hotel')
    const doc = flagshipDocFromSpec(base)
    const verdict = validateConcepts(base, [
      { id: 'a', doc },
      { id: 'b', doc: structuredClone(doc) },
      { id: 'c', doc: flagshipDocFromSpec({ ...base, direction: 'luxe' }) },
    ])
    expect(verdict.ok).toBe(false)
    const twins = verdict.pairs.find((pair) => pair.a === 'a' && pair.b === 'b')
    expect(twins?.sameOrder).toBe(true)
    expect(twins?.reasons).toContain('same sections in the same order')
  })
})
