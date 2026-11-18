import { describe, expect, test } from 'bun:test'
import { createProject, getProject, saveVersion, spendImportBudget } from '../src/worker/db'
import { MemoryD1 } from './memoryD1'

describe('variation slot allocation', () => {
  test('500 projects receive 500 distinct stored slots', async () => {
    const db = new MemoryD1() as unknown as D1Database
    const slots = new Set<number>()
    let first: Awaited<ReturnType<typeof createProject>> | null = null

    for (let index = 0; index < 500; index++) {
      const project = await createProject(db, {
        name: `Deck Shop ${index}`,
        contact: '',
        email: '',
        vertical: 'shop',
        accent: '#1f6feb',
        logo: 'DS',
        features: ['catalog'],
        platforms: ['pwa'],
        plan: 'onetime',
      })
      first ??= project
      expect(project.variationSlot).not.toBeNull()
      slots.add(project.variationSlot!)
    }

    expect(slots.size).toBe(500)
    // The slot is persisted, not just returned from createProject.
    const reloaded = await getProject(db, first!.token)
    expect(reloaded?.variationSlot).toBe(first!.variationSlot)
  })

  test('projects and their versions claim 500 distinct slots', async () => {
    const db = new MemoryD1() as unknown as D1Database
    const slots = new Set<number>()

    for (let index = 0; index < 250; index++) {
      const project = await createProject(db, {
        name: `Version Shop ${index}`,
        contact: '',
        email: '',
        vertical: 'shop',
        accent: '#1f6feb',
        logo: 'VS',
        features: ['catalog'],
        platforms: ['pwa'],
        plan: 'onetime',
      })
      slots.add(project.variationSlot!)
      const rebuilt = await saveVersion(db, project, { name: `Version Shop ${index} Two` })
      slots.add(rebuilt.variationSlot!)
    }

    expect(slots.size).toBe(500)
  })

  test('a rebuild claims a new stored slot', async () => {
    const db = new MemoryD1() as unknown as D1Database
    const project = await createProject(db, {
      name: 'Rebuild Shop',
      contact: '',
      email: '',
      vertical: 'shop',
      accent: '#1f6feb',
      logo: 'RS',
      features: ['catalog'],
      platforms: ['pwa'],
      plan: 'onetime',
    })
    const rebuilt = await saveVersion(db, project, { name: 'Rebuild Shop Two' })

    expect(rebuilt.version).toBe(2)
    expect(rebuilt.variationSlot).not.toBe(project.variationSlot)
    expect((await getProject(db, project.token))?.variationSlot).toBe(rebuilt.variationSlot)
  })
})

describe('import allowance', () => {
  test('every attempt is counted once, on the day it was made', async () => {
    const db = new MemoryD1() as unknown as D1Database
    expect(await spendImportBudget(db, '2026-11-18')).toBe(1)
    expect(await spendImportBudget(db, '2026-11-18')).toBe(2)
    expect(await spendImportBudget(db, '2026-11-18')).toBe(3)
    // A new day starts its own count instead of inheriting yesterday's.
    expect(await spendImportBudget(db, '2026-11-19')).toBe(1)
    expect(await spendImportBudget(db, '2026-11-18')).toBe(4)
  })
})
