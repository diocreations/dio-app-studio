import { describe, expect, test } from 'bun:test'
import { flagshipHome } from '../src/worker/flagship'
import { docFromSpec, flagshipDocFromSpec, homeSections, normalizeDoc } from '../src/worker/doc'
import { buildSpec, sanitizeMenu } from '../src/worker/pricing'

/**
 * A generated component that features a catalogue record must reference it, not
 * copy it. These tests pin the identity down: ids survive reordering and a
 * re-import, a reordered menu does not change the featured item, and a removed
 * item leaves the component with its own words rather than silently featuring
 * whichever dish now sits first.
 */

function dishSpec() {
  const menu = sanitizeMenu([
    {
      name: 'Breakfast',
      items: [
        { name: 'Bacon Naan Roll', desc: 'Smoked streaky bacon.', price: 1170 },
        { name: 'House Chai', desc: 'Slow-brewed with cardamom.', price: 320 },
      ],
    },
    { name: 'Biryani', items: [{ name: 'Lamb Biryani', desc: 'Cooked in a sealed pot.', price: 1650 }] },
  ])
  return {
    ...buildSpec({ name: 'Dishoom Probe', vertical: 'restaurant', accent: '#7a2f2f', logo: 'DP', features: ['ordering'] }),
    menu,
  }
}

const ids = (spec: ReturnType<typeof dishSpec>) =>
  spec.menu.flatMap((section) => section.items.map((item) => item.id))

function homeDoc(spec: ReturnType<typeof dishSpec>) {
  return flagshipDocFromSpec(spec)
}

function featureNode(doc: ReturnType<typeof homeDoc>) {
  return homeSections(doc).find((node) => node.variant === 'dine-feature')
}

function render(spec: ReturnType<typeof dishSpec>, doc: ReturnType<typeof homeDoc>) {
  return flagshipHome({ spec, token: 'probe', booking: false, doc })
}

describe('stable catalogue identity', () => {
  test('every item gets an id derived from its section and name', () => {
    const spec = dishSpec()
    const all = ids(spec)
    expect(all.every((id) => typeof id === 'string' && /^itm_[a-f0-9]{8,24}$/.test(id as string))).toBe(true)
    expect(new Set(all).size).toBe(all.length)
  })

  test('reordering sections and items keeps every id', () => {
    const spec = dishSpec()
    const before = new Set(ids(spec))
    const reordered = {
      ...spec,
      menu: [...spec.menu].reverse().map((section) => ({ ...section, items: [...section.items].reverse() })),
    }
    const after = sanitizeMenu(reordered.menu)
    for (const item of after.flatMap((section) => section.items)) expect(before.has(item.id as string)).toBe(true)
  })

  test('identically named products in one section stay distinguishable', () => {
    const menu = sanitizeMenu([{ name: 'Pieces', items: [{ name: 'Print', price: 500 }, { name: 'Print', price: 900 }] }])
    const [first, second] = menu[0].items
    expect(first.id).not.toBe(second.id)
  })

  test('a new build binds its featured dish to the catalogue', () => {
    const spec = dishSpec()
    const node = featureNode(homeDoc(spec))
    expect(node?.itemRef).toBe(spec.menu[0].items[0].id)
  })
})

describe('featured dish follows its reference', () => {
  test('the referenced dish is shown, not whichever is first', () => {
    const spec = dishSpec()
    const chai = spec.menu[0].items[1]
    const doc = homeDoc(spec)
    const node = featureNode(doc)!
    node.itemRef = chai.id as string
    const html = render(spec, doc)
    expect(html).toContain('House Chai')
    expect(html).not.toContain('Bacon Naan Roll')
  })

  test('reordering the catalogue does not change the featured dish', () => {
    const spec = dishSpec()
    const doc = homeDoc(spec)
    const reordered = {
      ...spec,
      menu: spec.menu.map((section) => ({ ...section, items: [...section.items].reverse() })),
    }
    const html = render(reordered, doc)
    expect(html).toContain('Bacon Naan Roll')
    expect(html).not.toContain('House Chai')
  })

  test('a removed dish falls back to the component own words', () => {
    const spec = dishSpec()
    const doc = homeDoc(spec)
    const node = featureNode(doc)!
    node.title = 'Tonight from the kitchen'
    node.itemRef = 'itm_deadbeef'
    const html = render(spec, doc)
    expect(html).toContain('Tonight from the kitchen')
    expect(html).not.toContain('House Chai')
    expect(html).not.toContain('Bacon Naan Roll')
  })

  test('a re-import that keeps the names keeps the selection', () => {
    const spec = dishSpec()
    const doc = homeDoc(spec)
    const ref = featureNode(doc)!.itemRef
    const reimported = {
      ...spec,
      menu: sanitizeMenu([
        { name: 'Breakfast', items: [{ name: 'Bacon Naan Roll', desc: 'New words.', price: 1250 }, { name: 'House Chai', desc: 'Slow-brewed with cardamom.', price: 320 }] },
      ]),
    }
    expect(reimported.menu[0].items[0].id).toBe(ref)
    const html = render(reimported, doc)
    expect(html).toContain('Bacon Naan Roll')
  })
})

describe('documents written before references existed', () => {
  test('a featured dish is bound by name once, and the result is stored', () => {
    const spec = dishSpec()
    const legacy = {
      v: 2,
      screens: [
        {
          id: 'scr_home',
          kind: 'home',
          name: 'Home',
          icon: 'home',
          nav: true,
          hidden: false,
          sections: [
            { id: 'sec_fx_dine_feature', kind: 'flagship', variant: 'dine-feature', title: 'House Chai', hidden: false },
          ],
        },
      ],
    }
    const doc = normalizeDoc(legacy, spec)
    const node = homeSections(doc).find((entry) => entry.variant === 'dine-feature')
    expect(node?.itemRef).toBe(spec.menu[0].items[1].id as string)
  })

  test('a reference to an item this build no longer has is dropped', () => {
    const spec = dishSpec()
    const legacy = {
      v: 2,
      screens: [
        {
          id: 'scr_home',
          kind: 'home',
          name: 'Home',
          icon: 'home',
          nav: true,
          hidden: false,
          sections: [
            {
              id: 'sec_fx_dine_feature',
              kind: 'flagship',
              variant: 'dine-feature',
              title: 'Gone',
              itemRef: 'itm_deadbeef',
              hidden: false,
            },
          ],
        },
      ],
    }
    const doc = normalizeDoc(legacy, spec)
    const node = homeSections(doc).find((entry) => entry.variant === 'dine-feature')
    expect(node?.itemRef).toBeUndefined()
  })

  test('a plain document without catalogue references is unchanged', () => {
    const spec = dishSpec()
    const plain = docFromSpec(spec)
    const doc = normalizeDoc(JSON.parse(JSON.stringify(plain)), spec)
    expect(homeSections(doc).length).toBe(homeSections(plain).length)
  })
})
