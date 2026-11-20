import { describe, expect, test } from 'bun:test'
import app from '../src/worker/index'
import { createProject } from '../src/worker/db'
import { MemoryD1 } from './memoryD1'
import { ownerCookieFor } from './ownerCookie'

/**
 * The auto-hide is a loop, not a one-way door: a block hidden because it drew
 * nothing must reappear when the business details make it draw. The dashboard
 * saves those details on a different route than the editor, so the
 * reconciliation has to live there too.
 */

const NODE = 'sec_fx_gym_trainers'

async function gym() {
  const db = new MemoryD1() as unknown as D1Database
  const env = { DB: db, ASSETS: {} as Fetcher }
  const project = await createProject(db, {
    name: 'Iron Yard Probe',
    contact: '',
    email: '',
    vertical: 'gym',
    accent: '#8fd6a4',
    logo: 'IY',
    features: ['classes'],
    platforms: ['pwa'],
    plan: 'onetime',
  })
  const cookie = await ownerCookieFor(db, project)
  // No real coaches yet: the trade's sample team is stripped for customers.
  const row = await db.prepare('SELECT spec FROM projects WHERE id = ?').bind(project.id).first<{ spec: string }>()
  const spec = JSON.parse(row!.spec)
  spec.team = []
  await db.prepare('UPDATE projects SET spec = ? WHERE id = ?').bind(JSON.stringify(spec), project.id).run()
  return { db, env, project, cookie }
}

function docWithTrainers() {
  return {
    v: 2,
    screens: [
      {
        id: 'scr_home',
        kind: 'home',
        name: 'Train',
        icon: 'home',
        nav: true,
        hidden: false,
        sections: [
          { id: 'sec_hero', kind: 'heading', title: 'Train with us', hidden: false },
          { id: NODE, kind: 'flagship', variant: 'gym-trainers', hidden: false },
        ],
      },
    ],
  }
}

async function putDoc(env: unknown, token: string, cookie: string) {
  return app.request(
    `https://plattr.example/api/projects/${token}/doc`,
    {
      method: 'PUT',
      headers: { origin: 'https://plattr.example', 'content-type': 'application/json', cookie },
      body: JSON.stringify({ doc: docWithTrainers() }),
    },
    env as never,
  )
}

function settings(env: unknown, token: string, cookie: string, team: string) {
  return app.request(
    `https://plattr.example/api/projects/${token}/app-settings`,
    {
      method: 'PUT',
      headers: { origin: 'https://plattr.example', 'content-type': 'application/json', cookie },
      body: JSON.stringify({ team }),
    },
    env as never,
  )
}

async function storedDoc(env: unknown, token: string, cookie: string) {
  const response = await app.request(
    `https://plattr.example/api/projects/${token}/doc`,
    { headers: { cookie } },
    env as never,
  )
  const body = (await response.json()) as {
    doc: { screens: { sections: { id: string; hidden: boolean; hiddenBecause?: string }[] }[] }
  }
  return body.doc.screens[0].sections.find((node) => node.id === NODE)
}

describe('automatic sections return on their own', () => {
  test('adding coaches in the dashboard brings the block back', async () => {
    const { env, project, cookie } = await gym()
    const saved = await putDoc(env, project.token, cookie)
    const first = (await saved.json()) as { hidden: string[] }
    expect(first.hidden).toContain(NODE)
    expect((await storedDoc(env, project.token, cookie))?.hidden).toBe(true)

    const added = await settings(env, project.token, cookie, 'Ada Okafor|Head coach\nBen Silva|Strength')
    expect(added.status).toBe(200)
    const payload = (await added.json()) as { hidden: string[]; restored: string[] }
    expect(payload.restored).toContain(NODE)
    expect(payload.hidden).not.toContain(NODE)

    const node = await storedDoc(env, project.token, cookie)
    expect(node?.hidden).toBe(false)
    expect(node?.hiddenBecause).toBeUndefined()
  })

  test('clearing the coaches again hides it, and adding them once more restores it', async () => {
    const { env, project, cookie } = await gym()
    await putDoc(env, project.token, cookie)
    await settings(env, project.token, cookie, 'Ada Okafor|Head coach')
    expect((await storedDoc(env, project.token, cookie))?.hidden).toBe(false)

    const cleared = (await (
      await settings(env, project.token, cookie, '')
    ).json()) as { hidden: string[]; restored: string[] }
    expect(cleared.hidden).toContain(NODE)
    const hidden = await storedDoc(env, project.token, cookie)
    expect(hidden?.hidden).toBe(true)
    expect(hidden?.hiddenBecause).toBe('empty')

    const again = (await (
      await settings(env, project.token, cookie, 'Ada Okafor|Head coach')
    ).json()) as { restored: string[] }
    expect(again.restored).toContain(NODE)
    expect((await storedDoc(env, project.token, cookie))?.hidden).toBe(false)
  })

  test('a project with no saved document is left alone', async () => {
    const { db, env, project, cookie } = await gym()
    const response = await settings(env, project.token, cookie, 'Ada Okafor|Head coach')
    expect(response.status).toBe(200)
    const row = await db.prepare('SELECT doc FROM projects WHERE id = ?').bind(project.id).first<{ doc: string }>()
    expect(row?.doc ?? '').toBe('')
  })
})
