import { describe, expect, test } from 'bun:test'
import { buildSpec, sanitizeMenu } from '../src/worker/pricing'
import { flagshipDocFromSpec, homeSections, normalizeDoc } from '../src/worker/doc'
import { refreshCopiedCopy } from '../src/worker/publish'

/**
 * A generated heading that copies the business name is right until the
 * business renames itself. These tests pin both halves of the rule: a copied
 * value follows the specification, and a value the owner wrote does not.
 */

function restaurantSpec(overrides: { name?: string; tagline?: string; hours?: string; address?: string } = {}) {
  const menu = sanitizeMenu([
    { name: 'Small plates', items: [{ name: 'Bacon Naan Roll', desc: 'Smoked bacon.', price: 1170 }] },
  ])
  return {
    ...buildSpec({
      name: overrides.name ?? 'Dishoom Probe',
      vertical: 'restaurant',
      accent: '#7a2f2f',
      logo: 'DP',
      features: ['ordering'],
    }),
    ...(overrides.tagline ? { tagline: overrides.tagline } : {}),
    ...(overrides.hours ? { hours: overrides.hours } : {}),
    ...(overrides.address ? { address: overrides.address } : {}),
    menu,
  }
}

const introTitle = (doc: ReturnType<typeof flagshipDocFromSpec>) =>
  homeSections(doc).find((node) => node.variant === 'dine-title')?.title

describe('copied business values', () => {
  test('a generated heading is recorded as copied', () => {
    const spec = restaurantSpec()
    const doc = flagshipDocFromSpec(spec)
    const title = homeSections(doc).find((node) => node.variant === 'dine-title')
    expect(title?.follows?.title).toBe('name')
    expect(title?.follows?.text).toBe('tagline')
  })

  test('a rename carries the generated heading with it', () => {
    const before = restaurantSpec()
    const after = restaurantSpec({ name: 'Dishoom Borough' })
    const result = refreshCopiedCopy(flagshipDocFromSpec(before), before, after)
    expect(result.changed).toBe(1)
    expect(introTitle(result.doc)).toBe('Dishoom Borough')
  })

  test('a heading the owner rewrote keeps the owner words', () => {
    const before = restaurantSpec()
    const doc = flagshipDocFromSpec(before)
    const edited = {
      ...doc,
      screens: doc.screens.map((screen) => ({
        ...screen,
        sections: screen.sections.map((node) =>
          node.variant === 'dine-title' ? { ...node, title: 'Our own words' } : node,
        ),
      })),
    }
    const after = restaurantSpec({ name: 'Dishoom Borough' })
    const result = refreshCopiedCopy(edited, before, after)
    expect(result.changed).toBe(0)
    expect(introTitle(result.doc)).toBe('Our own words')
  })

  test('an edited paragraph survives while its heading follows', () => {
    const before = restaurantSpec({ tagline: 'Bombay comfort food.' })
    const doc = flagshipDocFromSpec(before)
    const edited = {
      ...doc,
      screens: doc.screens.map((screen) => ({
        ...screen,
        sections: screen.sections.map((node) =>
          node.variant === 'dine-title' ? { ...node, text: 'Bombay comfort food.' } : node,
        ),
      })),
    }
    // Rewriting to the same words keeps the copy provenance; change them and it
    // is the owner's sentence from then on.
    const renamed = refreshCopiedCopy(
      edited,
      before,
      restaurantSpec({ name: 'Dishoom Borough', tagline: 'Bombay comfort food.' }),
    )
    expect(introTitle(renamed.doc)).toBe('Dishoom Borough')

    const rewritten = {
      ...renamed.doc,
      screens: renamed.doc.screens.map((screen) => ({
        ...screen,
        sections: screen.sections.map((node) =>
          node.variant === 'dine-title' ? { ...node, text: 'Our own words about the food.' } : node,
        ),
      })),
    }
    const next = refreshCopiedCopy(
      rewritten,
      restaurantSpec({ name: 'Dishoom Borough', tagline: 'Bombay comfort food.' }),
      restaurantSpec({ name: 'Dishoom Borough', tagline: 'A new tagline.' }),
    )
    const title = homeSections(next.doc).find((node) => node.variant === 'dine-title')
    expect(title?.text).toBe('Our own words about the food.')
  })

  test('a copy provenance survives normalisation and re-saving', () => {
    const spec = restaurantSpec()
    const saved = normalizeDoc(JSON.parse(JSON.stringify(flagshipDocFromSpec(spec))), spec)
    const again = normalizeDoc(JSON.parse(JSON.stringify(saved)), spec)
    const title = homeSections(again).find((node) => node.variant === 'dine-title')
    expect(title?.follows).toEqual({ title: 'name', text: 'tagline' })
  })

  test('a re-import that keeps the name does not touch any copy', () => {
    const before = restaurantSpec()
    const same = restaurantSpec()
    const result = refreshCopiedCopy(flagshipDocFromSpec(before), before, same)
    expect(result.changed).toBe(0)
  })

  test('removing the hours clears the heading that copied them', () => {
    const before = restaurantSpec({ hours: 'Tue to Sun, 12pm to 11pm', address: '12 Upper St' })
    const seeded = flagshipDocFromSpec(before)
    const home = homeSections(seeded)
    // A visit-details block as the editor saves it: both values copied from
    // the specification.
    const withFacts = normalizeDoc(
      {
        ...seeded,
        screens: seeded.screens.map((screen) =>
          screen.kind === 'home'
            ? {
                ...screen,
                sections: [
                  ...home,
                  {
                    id: 'sec_fx_facts',
                    kind: 'flagship',
                    variant: 'dine-facts',
                    title: before.hours,
                    text: before.address,
                    style: {},
                    responsive: { hideOn: [] },
                    hidden: false,
                  },
                ],
              }
            : screen,
        ),
      },
      before,
    )
    const facts = homeSections(withFacts).find((node) => node.id === 'sec_fx_facts')
    expect(facts?.follows).toEqual({ title: 'hours', text: 'address' })

    const after = { ...before, hours: '' }
    const result = refreshCopiedCopy(withFacts, before, after)
    const changed = homeSections(result.doc).find((node) => node.id === 'sec_fx_facts')
    expect(changed?.title).toBeUndefined()
    expect(changed?.text).toBe('12 Upper St')
  })

  test('prose that merely mentions the business name is never rewritten', () => {
    const before = restaurantSpec({ tagline: 'Bombay comfort food.' })
    const seeded = flagshipDocFromSpec(before)
    // A sentence that contains the name is not a copy of the name.
    const withProse = normalizeDoc(
      {
        ...seeded,
        screens: seeded.screens.map((screen) =>
          screen.kind === 'home'
            ? {
                ...screen,
                sections: [
                  ...screen.sections,
                  {
                    id: 'sec_fx_note',
                    kind: 'flagship',
                    variant: 'dine-note',
                    text: 'Dishoom Probe is open for lunch.',
                    style: {},
                    responsive: { hideOn: [] },
                    hidden: false,
                  },
                ],
              }
            : screen,
        ),
      },
      before,
    )
    const note = homeSections(withProse).find((node) => node.id === 'sec_fx_note')
    expect(note?.follows).toBeUndefined()
    const next = refreshCopiedCopy(withProse, before, restaurantSpec({ name: 'Dishoom Borough' }))
    const after = homeSections(next.doc).find((node) => node.id === 'sec_fx_note')
    expect(after?.text).toBe('Dishoom Probe is open for lunch.')
  })
})
