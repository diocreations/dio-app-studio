import { describe, expect, test } from 'bun:test'
import { buildSpec } from '../src/worker/pricing'
import { flagshipDocFromSpec, homeSections } from '../src/worker/doc'
import { pruneEmptySections } from '../src/worker/publish'
import type { AppSpec } from '../src/worker/types'

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

  test('a section hidden for being empty comes back when the business supplies the content', () => {
    const empty = gymSpec()
    const pruned = pruneEmptySections(gymDoc(), empty, 'probe')
    expect(pruned.hidden).toContain('sec_fx_gym_trainers')

    // The owner adds real coaches in the dashboard. The saved block was hidden
    // automatically, so the next reconciliation shows it again.
    const filled = {
      ...pruned.doc,
    }
    const withTeam: AppSpec = {
      ...empty,
      team: [{ name: 'Ada Okafor', role: 'Head coach' }],
      staff: ['Ada Okafor'],
      // The dashboard clears both sample flags when the owner edits the team.
      sampleContent: { ...empty.sampleContent!, team: false, staff: false },
    }
    const after = pruneEmptySections(filled, withTeam, 'probe')
    expect(after.restored).toContain('sec_fx_gym_trainers')
    const node = homeSections(after.doc).find((entry) => entry.id === 'sec_fx_gym_trainers')
    expect(node?.hidden).toBe(false)
    expect(node?.hiddenBecause).toBeUndefined()
  })

  test('a section the owner hid by hand stays hidden when the data arrives', () => {
    const base = gymSpec()
    const spec: AppSpec = {
      ...base,
      team: [{ name: 'Ada Okafor', role: 'Head coach' }],
      sampleContent: { ...base.sampleContent!, team: false, staff: false },
    }
    const doc = flagshipDocFromSpec(spec)
    const trainers = homeSections(doc).find((entry) => entry.variant === 'gym-trainers')
    expect(trainers).toBeDefined()
    // No `hiddenBecause`, so this is the owner's own decision.
    const ownerHidden = {
      ...doc,
      screens: doc.screens.map((screen) => ({
        ...screen,
        sections: screen.sections.map((node) =>
          node.id === trainers!.id ? { ...node, hidden: true } : node,
        ),
      })),
    }
    const after = pruneEmptySections(ownerHidden, spec, 'probe')
    expect(after.restored).toEqual([])
    expect(homeSections(after.doc).find((entry) => entry.id === trainers!.id)?.hidden).toBe(true)
  })

  test('a block that stays empty is not reported again', () => {
    const spec = gymSpec()
    const once = pruneEmptySections(gymDoc(), spec, 'probe')
    const twice = pruneEmptySections(once.doc, spec, 'probe')
    expect(twice.hidden).toEqual([])
    expect(twice.restored).toEqual([])
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
