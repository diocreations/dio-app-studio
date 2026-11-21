import { describe, expect, test } from 'bun:test'
import { renderApp } from '../src/worker/app'
import { flagshipDocFromSpec, normalizeDoc, type Doc } from '../src/worker/doc'
import { APPEARANCE_CONTROLS, AUDIT_COVERAGE, auditElementCoverage, elementSlots, SYSTEM_CONTROLLED } from '../src/worker/editability'
import { directionsFor } from '../src/worker/directions'
import { buildSpec } from '../src/worker/pricing'

const TRADES = ['shop', 'restaurant', 'hotel', 'salon', 'professional'] as const

function specFor(vertical: (typeof TRADES)[number]) {
  return buildSpec({
    name: 'Cedar & Co',
    vertical,
    accent: '#2f4a3f',
    logo: 'CC',
    features: ['catalog', 'booking', 'quote'],
  })
}

function render(doc: Doc, spec: ReturnType<typeof specFor>) {
  return renderApp(spec, { token: 'audit-probe', live: false, flagship: true, doc })
}

describe('element editability', () => {
  test('every rendered slot can be named and keeps its override through reload', () => {
    for (const vertical of TRADES) {
      const spec = specFor(vertical)
      const base = flagshipDocFromSpec(spec)
      const slots = elementSlots(render(base, spec))
      expect(slots.length).toBeGreaterThan(10)

      const elements: Record<string, unknown> = {}
      for (const [index, key] of slots.entries()) {
        elements[key] = {
          name: `Element ${index}`,
          ...(key.includes('~img~') ? { style: { imageFit: 'contain' } } : { text: `Edited ${index}` }),
          style: { fontSize: 16, color: '#17110d' },
        }
      }
      const doc = normalizeDoc({ ...base, elements }, spec)
      // Every slot survives the same normalisation a save uses.
      expect(Object.keys(doc.elements ?? {})).toHaveLength(slots.length)
      expect(doc.elements?.[slots[0]]?.name).toBe('Element 0')

      const html = render(doc, spec)
      const audit = auditElementCoverage(doc, html)
      expect(audit.missing).toEqual([])
      expect(audit.duplicates).toEqual([])
      expect(audit.configured).toBe(slots.length)
      expect(html).toContain('__PLATTR_ELEMENTS__')
      expect(html).toContain('Edited 0')
    }
  })

  test('all fifteen trade concepts expose a persistent slot for every rendered element', () => {
    let slots = 0
    for (const vertical of TRADES) {
      const base = specFor(vertical)
      if (vertical === 'professional') {
        base.team = [{ name: 'Ada Okafor', role: 'Partner' }]
        base.staff = ['Ada Okafor']
        base.sampleContent = { ...base.sampleContent!, team: false, staff: false }
      }
      for (const direction of directionsFor(vertical)) {
        const spec = { ...base, direction: direction.id }
        const doc = flagshipDocFromSpec(spec)
        const html = render(doc, spec)
        const rendered = elementSlots(html)
        const audit = auditElementCoverage(doc, html)
        expect(audit.duplicates).toEqual([])
        expect(audit.missing).toEqual([])
        // Every rendered slot is a key the save path keeps, so every one can
        // carry an owner patch. Nothing visible is left without a Doc node.
        const edged = normalizeDoc(
          { ...doc, elements: Object.fromEntries(rendered.map((key) => [key, { name: 'Element' }])) },
          spec,
        )
        expect(Object.keys(edged.elements ?? {})).toHaveLength(rendered.length)
        slots += rendered.length
      }
    }
    expect(slots).toBeGreaterThan(500)
  })

  test('element copies, removals and sibling positions survive the audit', () => {
    const spec = specFor('shop')
    const base = flagshipDocFromSpec(spec)
    const doc = normalizeDoc(
      {
        ...base,
        elements: {
          'sec_fx_shop_title~h1~0': { position: 20, removed: true, style: { fontSize: 30 } },
          'sec_fx_shop_title~h1~0~cabc123': {
            duplicateOf: 'sec_fx_shop_title~h1~0',
            name: 'Second headline',
            text: 'A second headline',
            position: 10,
            style: { fontSize: 20 },
          },
          'chrome~nav~0': { navIcon: 'bag', action: { screen: 'catalog' } },
        },
      },
      spec,
    )
    const original = doc.elements?.['sec_fx_shop_title~h1~0']
    const copy = doc.elements?.['sec_fx_shop_title~h1~0~cabc123']
    expect(original?.removed).toBe(true)
    expect(original?.position).toBe(20)
    expect(copy?.duplicateOf).toBe('sec_fx_shop_title~h1~0')
    expect(copy?.position).toBe(10)
    expect(doc.elements?.['chrome~nav~0']?.navIcon).toBe('bag')
    const audit = auditElementCoverage(doc, render(doc, spec))
    expect(audit.copies).toBe(1)
    expect(audit.missing).toEqual([])
    expect(audit.duplicates).toEqual([])
  })

  test('a container copy keeps its remapped child tree and counts as one copy', () => {
    const spec = specFor('shop')
    const base = flagshipDocFromSpec(spec)
    const root = 'sec_fx_shop_title~div~0~cabc123'
    const child = 'sec_fx_shop_title~h1~0~cabc123'
    const doc = normalizeDoc(
      {
        ...base,
        elements: {
          [root]: {
            duplicateOf: 'sec_fx_shop_title~div~0',
            copyTree: { 'sec_fx_shop_title~h1~0': child },
            name: 'Intro copy',
          },
          [child]: {
            duplicateOf: 'sec_fx_shop_title~h1~0',
            copyParent: root,
            text: 'A copied headline',
            style: { fontSize: 20 },
          },
        },
      },
      spec,
    )
    expect(doc.elements?.[root]?.copyTree).toEqual({ 'sec_fx_shop_title~h1~0': child })
    expect(doc.elements?.[child]?.copyParent).toBe(root)
    expect(doc.elements?.[child]?.duplicateOf).toBe('sec_fx_shop_title~h1~0')
    const audit = auditElementCoverage(doc, render(doc, spec))
    expect(audit.copies).toBe(1)
    expect(audit.copiedElements).toBe(2)
    expect(audit.missing).toEqual([])
    expect(audit.coverage).toEqual(AUDIT_COVERAGE)

    const bad = normalizeDoc(
      {
        ...base,
        elements: {
          [root]: { duplicateOf: 'sec_fx_shop_title~div~0', copyTree: { 'bad': 'also-bad' } },
          [child]: { duplicateOf: 'sec_fx_shop_title~h1~0', copyParent: 'not-a-clone' },
        },
      },
      spec,
    )
    expect(bad.elements?.[root]?.copyTree).toBeUndefined()
    expect(bad.elements?.[child]?.copyParent).toBeUndefined()
  })

  test('system chrome is reported rather than pretending it is an element', () => {
    expect(SYSTEM_CONTROLLED.length).toBeGreaterThan(5)
    expect(SYSTEM_CONTROLLED.join(' ')).toContain('App bar')
    expect(APPEARANCE_CONTROLS.length).toBeGreaterThan(2)
    expect(AUDIT_COVERAGE.map(([area]) => area)).toEqual(
      expect.arrayContaining(['Nested elements', 'Dynamic components', 'Navigation', 'Responsive layouts', 'Empty and loading states']),
    )
  })

  test('hostile or malformed element overrides are dropped and clamped', () => {
    const spec = specFor('shop')
    const base = flagshipDocFromSpec(spec)
    const doc = normalizeDoc(
      {
        ...base,
        elements: {
          'sec_fx_shop_title~h1~0': {
            name: 'Hero',
            text: 'A different headline',
            style: {
              fontSize: 900,
              color: 'url(javascript:alert(1))',
              background: '#fff',
              width: 900,
              layout: 'diagonal',
              cropTop: 60,
              cropBottom: 60,
              cropLeft: 10,
            },
            navIcon: 'sparkles',
            duplicateOf: 'sec_fx_shop_title~p~0',
            position: 9999,
          },
          'not a slot': { text: 'nope' },
          'sec_fx_shop_title~script~0': { text: 'nope' },
          'sec_fx_shop_title~p~0': { media: { id: 'https://evil.example/a.png' } },
        },
      },
      spec,
    )
    const entry = doc.elements?.['sec_fx_shop_title~h1~0']
    expect(entry?.style?.fontSize).toBe(96)
    expect(entry?.style?.width).toBe(100)
    expect(entry?.style?.color).toBeUndefined()
    expect(entry?.style?.layout).toBeUndefined()
    // A crop leaving no image is dropped whole, while a valid inset survives.
    expect(entry?.style?.cropTop).toBeUndefined()
    expect(entry?.style?.cropLeft).toBeUndefined()
    expect(entry?.navIcon).toBeUndefined()
    expect(entry?.duplicateOf).toBe('sec_fx_shop_title~p~0')
    expect(entry?.position).toBe(999)
    expect(doc.elements?.['not a slot']).toBeUndefined()
    expect(doc.elements?.['sec_fx_shop_title~script~0']).toBeUndefined()
    expect(doc.elements?.['sec_fx_shop_title~p~0']).toBeUndefined()
  })
})
