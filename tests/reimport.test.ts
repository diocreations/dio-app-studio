import { describe, expect, test } from 'bun:test'
import { applyApproval, diffCatalogue, ownerEdited } from '../src/worker/reimport'
import type { MenuSection } from '../src/worker/types'

const sections = (items: { name: string; price?: number; desc?: string; image?: string }[]): MenuSection[] => [
  {
    name: 'Menu',
    items: items.map((item) => ({
      name: item.name,
      desc: item.desc ?? '',
      price: item.price ?? 0,
      ...(item.image ? { image: { url: item.image, source: 'website' as const } } : {}),
    })),
  },
]

describe('re-import never writes by itself', () => {
  test('an unchanged catalogue produces no changes', () => {
    const current = sections([{ name: 'Naan Roll', price: 1170 }])
    const plan = diffCatalogue(current, sections([{ name: 'Naan Roll', price: 1170 }]))
    expect(plan.changed).toEqual([])
    expect(plan.added).toEqual([])
    expect(plan.removed).toEqual([])
    expect(plan.unchanged).toBe(1)
    expect(plan.requiresApproval).toBe(true)
  })

  test('a new item, a gone item and a moved price are described, not applied', () => {
    const current = sections([
      { name: 'Naan Roll', price: 1170 },
      { name: 'House Chai', price: 490 },
    ])
    const incoming = sections([
      { name: 'Naan Roll', price: 1250 },
      { name: 'Masala Dabba', price: 1500 },
    ])
    const plan = diffCatalogue(current, incoming)

    expect(plan.added.map((entry) => entry.name)).toEqual(['Masala Dabba'])
    expect(plan.removed.map((entry) => entry.name)).toEqual(['House Chai'])
    expect(plan.changed[0]?.changes).toEqual([{ field: 'price', from: '1170', to: '1250' }])
  })

  test('a price the site stopped publishing is not a request to delete it', () => {
    const current = sections([{ name: 'Tasting Menu', price: 6500 }])
    const plan = diffCatalogue(current, sections([{ name: 'Tasting Menu', price: 0 }]))
    expect(plan.changed[0]?.changes).toEqual([{ field: 'price', from: '6500', to: '' }])
  })

  test('a description the site no longer has is left alone', () => {
    const current = sections([{ name: 'Naan Roll', price: 1170, desc: 'Smoked bacon.' }])
    const plan = diffCatalogue(current, sections([{ name: 'Naan Roll', price: 1170 }]))
    expect(plan.changed).toEqual([])
  })
})

describe('approval decides what moves', () => {
  const current = sections([
    { name: 'Naan Roll', price: 1170 },
    { name: 'House Chai', price: 490 },
  ])
  const incoming = sections([
    { name: 'Naan Roll', price: 1250 },
    { name: 'Masala Dabba', price: 1500 },
  ])

  test('nothing approved means nothing changes', () => {
    expect(applyApproval(current, incoming, {})).toEqual(current)
  })

  test('an approved price moves and an unapproved removal is kept', () => {
    const next = applyApproval(current, incoming, { changed: ['Naan Roll|price'] })
    expect(next[0]?.items.find((item) => item.name === 'Naan Roll')?.price).toBe(1250)
    expect(next[0]?.items.some((item) => item.name === 'House Chai')).toBe(true)
    expect(next[0]?.items.some((item) => item.name === 'Masala Dabba')).toBe(false)
  })

  test('approved additions arrive in the section the site put them in', () => {
    const next = applyApproval(current, incoming, { added: true })
    expect(next[0]?.items.map((item) => item.name)).toContain('Masala Dabba')
  })

  test('an owner photograph is never swapped for the site copy', () => {
    const owned: MenuSection[] = [
      {
        name: 'Menu',
        items: [
          {
            name: 'Naan Roll',
            desc: '',
            price: 1170,
            media: { id: 'med_0123456789abcdef' },
          },
        ],
      },
    ]
    const site = sections([{ name: 'Naan Roll', price: 1170, image: 'https://example.com/naan.jpg' }])
    expect(ownerEdited(owned[0]!.items[0]!)).toBe(true)
    const plan = diffCatalogue(owned, site)
    expect(plan.changed[0]?.ownerEdited).toBe(true)
    const next = applyApproval(owned, site, { changed: ['Naan Roll|image'] })
    expect(next[0]?.items[0]?.image).toBeUndefined()
    expect(next[0]?.items[0]?.media?.id).toBe('med_0123456789abcdef')
  })

  test('an approved removal is the only way an item leaves', () => {
    const next = applyApproval(current, incoming, { removed: ['House Chai'] })
    expect(next[0]?.items.map((item) => item.name)).toEqual(['Naan Roll'])
  })
})
