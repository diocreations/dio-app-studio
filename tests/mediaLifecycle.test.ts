import { describe, expect, test } from 'bun:test'
import { collectMediaIds, orphanMedia } from '../src/worker/media'

/**
 * Cleanup is only safe if every place a reference can hide is read. These tests
 * pin the rule down before anything is ever deleted: a current document, an old
 * saved version, a catalogue and an offer all count as use.
 */

const old = '2024-01-01T00:00:00.000Z'
const now = Date.parse('2024-02-01T00:00:00.000Z')

const doc = {
  screens: [{ id: 'scr_home', sections: [{ id: 'sec_a', media: { id: 'med_used' } }] }],
}
const version = {
  screens: [{ id: 'scr_home', sections: [{ id: 'sec_b', media: { id: 'med_history' } }] }],
}
const spec = {
  menu: [{ name: 'Coffee', items: [{ name: 'Flat white', media: { id: 'med_catalog' } }] }],
  offers: [{ title: 'Two for one', media: { id: 'med_offer' } }],
}

describe('unused media', () => {
  test('every shape a reference hides in is collected', () => {
    const found = collectMediaIds([doc, version, spec])
    expect([...found].sort()).toEqual(['med_catalog', 'med_history', 'med_offer', 'med_used'])
  })

  test('nothing in use is a candidate, whatever record names it', () => {
    const rows = ['med_used', 'med_history', 'med_catalog', 'med_offer', 'med_orphan'].map((id) => ({
      id,
      created_at: old,
    }))
    expect(orphanMedia(rows, [doc, version, spec], { now })).toEqual(['med_orphan'])
  })

  test('a recent upload is kept even when nothing points at it yet', () => {
    const rows = [{ id: 'med_fresh', created_at: '2024-01-31T22:00:00.000Z' }]
    expect(orphanMedia(rows, [], { now })).toEqual([])
    expect(orphanMedia(rows, [], { now, graceHours: 1 })).toEqual(['med_fresh'])
  })

  test('a row without a date is never deleted', () => {
    expect(orphanMedia([{ id: 'med_unknown' }], [], { now })).toEqual([])
  })

  test('an empty library and empty documents produce no work', () => {
    expect(orphanMedia([], [{ screens: [] }], { now })).toEqual([])
  })
})
