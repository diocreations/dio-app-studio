import { describe, expect, test } from 'bun:test'
import { createProject, deleteProject, getProject, saveVersion, spendImportBudget } from '../src/worker/db'
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

describe('project deletion', () => {
  test('removes owner sessions and customer records, not just the project row', async () => {
    const db = new MemoryD1() as unknown as D1Database
    const project = await createProject(db, {
      name: 'Deletion Shop',
      contact: '',
      email: '',
      vertical: 'shop',
      accent: '#2a5a8f',
      logo: 'DS',
      features: ['catalog', 'ordering', 'booking', 'quote'],
      platforms: ['pwa'],
      plan: 'onetime',
    })
    const now = new Date().toISOString()
    await db.prepare('INSERT INTO owner_sessions (id, project_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)')
      .bind('own_' + 'a'.repeat(48), project.id, now, now, now).run()
    await db.prepare('INSERT INTO customers (id, project_id, contact_key, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind('cus_test', project.id, 'test@example.com', 'Test Customer', now, now).run()
    await db.prepare('INSERT INTO orders (id, project_id, customer_id, number, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind('ord_test', project.id, 'cus_test', '5001', now, now).run()
    await db.prepare('INSERT INTO order_items (id, order_id, name) VALUES (?, ?, ?)')
      .bind('oit_test', 'ord_test', 'Test item').run()
    await db.prepare('INSERT INTO bookings (id, project_id, customer_id, number, date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind('bok_test', project.id, 'cus_test', 'B1', '2026-11-23', now, now).run()
    await db.prepare('INSERT INTO enquiries (id, project_id, customer_id, name, contact, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind('enq_test', project.id, 'cus_test', 'Test Customer', 'test@example.com', now, now).run()

    await deleteProject(db, project.id)

    for (const table of ['projects', 'owner_sessions', 'customers', 'orders', 'order_items', 'bookings', 'enquiries']) {
      const row = await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>()
      expect(row?.n, table).toBe(0)
    }
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
    // That first import of the 19th pruned the 18th, so counting it again
    // starts from zero: only today's counter is kept.
  })
})
