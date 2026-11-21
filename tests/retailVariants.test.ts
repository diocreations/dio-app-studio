/**
 * Synthetic retail coverage.
 *
 * The saved Present & Correct fixture has no option matrix, so these assertions
 * use a separate, hand-authored shop (tests/fixtures/retail-variants.json). It
 * exercises structured size/colour groups, per-combination prices and photos,
 * a sold-out combination, combinations the owner never entered, and a legacy
 * flat variant list. Nothing here is merged into the saved acceptance fixture.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { buildSpec } from '../src/worker/pricing'

const fixture = JSON.parse(readFileSync('tests/fixtures/retail-variants.json', 'utf8'))
const spec = buildSpec({
  name: fixture.name,
  vertical: 'shop',
  accent: fixture.accent,
  logo: fixture.logo,
  features: fixture.features,
  site: fixture,
})
const items = spec.menu.flatMap((section) => section.items)
const item = (name: string) => {
  const found = items.find((entry) => entry.name === name)
  if (!found) throw new Error(`${name} missing from the synthetic catalogue`)
  return found
}

describe('synthetic retail variants', () => {
  test('keeps size and colour groups with every valid combination', () => {
    const shirt = item('Field Shirt')
    expect(shirt.optionGroups?.map((group) => group.name)).toEqual(['Size', 'Colour'])
    expect(shirt.optionGroups?.[0].options).toEqual(['S', 'M', 'L'])
    expect(shirt.optionGroups?.[1].options).toEqual(['Ink', 'Bone', 'Clay'])
    expect(shirt.variants).toHaveLength(7)
    for (const variant of shirt.variants ?? []) {
      expect(variant.values?.Size).toBeTruthy()
      expect(variant.values?.Colour).toBeTruthy()
    }
  })

  test('keeps each combination price and its own photograph', () => {
    const shirt = item('Field Shirt')
    const ink = shirt.variants?.find((variant) => variant.name === 'L / Ink')
    const bone = shirt.variants?.find((variant) => variant.name === 'S / Bone')
    expect(ink?.price).toBe(4400)
    expect(bone?.price).toBe(4400)
    expect(ink?.media?.id).not.toBe(bone?.media?.id)
    expect(ink?.media?.alt).toContain('Ink')
    expect(bone?.media?.alt).toContain('Bone')
  })

  test('keeps a sold-out combination marked instead of dropping it', () => {
    const shirt = item('Field Shirt')
    const soldOutCombination = shirt.variants?.find((variant) => variant.name === 'M / Bone')
    const soldOutOption = shirt.variants?.find((variant) => variant.name === 'S / Clay')
    expect(soldOutCombination?.available).toBe(false)
    expect(soldOutOption?.available).toBe(false)
    // The other combinations in the same groups remain purchasable.
    expect(shirt.variants?.some((variant) => variant.available !== false && variant.values?.Colour === 'Bone')).toBe(true)
  })

  test('does not invent combinations the owner never entered', () => {
    const trousers = item('Field Trouser')
    expect(trousers.variants).toHaveLength(4)
    const combinations = (trousers.variants ?? []).map((variant) => variant.name)
    expect(combinations).toEqual(['30 / Olive', '32 / Olive', '30 / Black', '34 / Black'])
    expect(combinations).not.toContain('32 / Black')
    expect(combinations).not.toContain('34 / Olive')
  })

  test('keeps a legacy flat variant list without option groups', () => {
    const tote = item('Canvas Tote')
    expect(tote.optionGroups ?? []).toHaveLength(0)
    expect(tote.variants?.map((variant) => [variant.name, variant.price, variant.available])).toEqual([
      ['Natural', 1800, undefined],
      ['Black', 1900, false],
    ])
    expect(tote.variants?.[1].media?.id).toBe('med_eeeeeeeeeeeeeeee')
  })
})
