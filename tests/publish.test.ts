import { describe, expect, test } from 'bun:test'
import { buildSpec } from '../src/worker/pricing'
import { flagshipDocFromSpec, homeSections } from '../src/worker/doc'
import { pruneEmptySections } from '../src/worker/publish'

/**
 * A component the owner saved but that draws nothing must not stay visible:
 * the editor counts it, the dashboard lists it, and the customer sees a gap.
 * The guard renders each saved block with the customer renderer and hides the
 * ones that return no markup.
 */

function gymSpec() {
  return {
    ...buildSpec({
      name: 'Iron Yard Probe',
      vertical: 'gym',
      accent: '#8fd6a4',
      logo: 'IY',
      features: ['classes'],
    }),
    // The trade ships sample coaches; a business that has named none is the
    // case where the saved profiles block draws nothing.
    team: [],
  }
}

function gymDoc() {
  return flagshipDocFromSpec(gymSpec())
}

describe('sections that render nothing', () => {
  test('a block with no data behind it is hidden and reported', () => {
    const spec = gymSpec()
    const doc = gymDoc()
    const empty = homeSections(doc).filter((node) => node.variant === 'gym-trainers')
    expect(empty.length).toBe(1)
    expect(empty[0].hidden).toBe(false)

    const pruned = pruneEmptySections(doc, spec, 'probe')
    expect(pruned.hidden).toContain(empty[0].id)
    const after = homeSections(pruned.doc).find((node) => node.id === empty[0].id)
    expect(after?.hidden).toBe(true)
  })

  test('a block with real content is left visible', () => {
    const spec = gymSpec()
    const doc = gymDoc()
    const pruned = pruneEmptySections(doc, spec, 'probe')
    const plans = homeSections(pruned.doc).find((node) => node.variant === 'gym-plans')
    expect(plans?.hidden).toBe(false)
    expect(pruned.hidden).not.toContain(plans?.id ?? '')
  })

  test('running the guard again finds nothing new to hide', () => {
    const spec = gymSpec()
    const once = pruneEmptySections(gymDoc(), spec, 'probe')
    const twice = pruneEmptySections(once.doc, spec, 'probe')
    expect(twice.hidden).toEqual([])
  })

  test('a hidden block stays hidden without being reported again', () => {
    const spec = gymSpec()
    const once = pruneEmptySections(gymDoc(), spec, 'probe')
    const twice = pruneEmptySections(once.doc, spec, 'probe')
    const still = homeSections(twice.doc).filter((node) => node.hidden).map((node) => node.id)
    expect(still.sort()).toEqual([...once.hidden].sort())
  })

  test('a team the trade supplied as a sample does not keep the block alive', () => {
    // What a real import produces: the trade's sample coaches sit in the spec
    // with sampleContent set, and the customer never sees them.
    const spec = {
      ...buildSpec({ name: 'Iron Yard Probe', vertical: 'gym', accent: '#8fd6a4', logo: 'IY', features: ['classes'] }),
    }
    expect(spec.team?.length).toBeGreaterThan(0)
    expect(spec.sampleContent?.team).toBe(true)
    const pruned = pruneEmptySections(flagshipDocFromSpec(spec), spec, 'probe')
    expect(pruned.hidden).toContain('sec_fx_gym_trainers')
  })

  test('the owner keeps every other component exactly as written', () => {
    const spec = gymSpec()
    const doc = gymDoc()
    const title = homeSections(doc).find((node) => node.variant === 'gym-hero')
    const pruned = pruneEmptySections(doc, spec, 'probe')
    const after = homeSections(pruned.doc).find((node) => node.id === title?.id)
    expect(after).toEqual(title as never)
  })
})
