import { describe, expect, test } from 'bun:test'
import app from '../src/worker/index'
import { MemoryD1 } from './memoryD1'
import {
  JEWELLERY_URL,
  briefFrom,
  crawlSpec,
  freeEnv,
  freeProviderFetch,
  sampleDesignSet,
} from './freeAiMock'

/**
 * One complete journey, with both free providers mocked at `fetch`:
 *
 *   business URL → understanding → three concepts → selection → editing →
 *   save/reload → approval → published preview
 *
 * Nothing here reaches a provider, a paid endpoint or the network. The site is
 * a fixture, the models answer from the reviewed sample, and the cost is
 * asserted to be exactly $0.00 at every step it is reported.
 */

type Concept = { id: string; name: string; doc: unknown; spec: { menu: unknown[] } }

describe('one mocked journey from a URL to a published preview', () => {
  test('URL → concepts → selection → edit → save/reload → publish', async () => {
    const { dossier } = await crawlSpec()
    const set = sampleDesignSet()
    const mock = freeProviderFetch({ brief: briefFrom(dossier), set })
    const env = freeEnv(new MemoryD1())
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock.fetch

    try {
      /* 1. The URL-first read and the model's three concepts. */
      const discoverResponse = await app.request(
        'https://plattr.example/api/discover',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: 'https://plattr.example',
            'cf-connecting-ip': '10.9.0.1',
          },
          body: JSON.stringify({ url: JEWELLERY_URL }),
        },
        env,
      )
      expect(discoverResponse.status).toBe(200)
      const discovered = (await discoverResponse.json()) as {
        source: string
        draft: { token: string; version: number; preview: string }
        design: { status: string; costUsd: number; concepts: Concept[] }
        concepts: { id: string; preview: string }[]
        discovery: { business: { name: { value: string }; trade: { value: string } } }
      }
      const cookie = (discoverResponse.headers.get('set-cookie') ?? '').split(';')[0]
      expect(cookie).toContain('=')
      expect(discovered.design.status).toBe('ai')
      expect(discovered.design.costUsd).toBe(0)
      expect(discovered.design.concepts).toHaveLength(3)
      expect(discovered.discovery.business.name.value).toBeTruthy()

      const token = discovered.draft.token
      const headers = {
        'content-type': 'application/json',
        origin: 'https://plattr.example',
        cookie,
      }

      /* 1b. Each AI concept previews on the real app before anything is chosen. */
      const previews = new Map<string, string>()
      for (const concept of discovered.design.concepts) {
        const previewResponse = await app.request(
          `https://plattr.example/p/${token}/app?design=${concept.id}`,
          { headers: { cookie } },
          env,
        )
        expect(previewResponse.status).toBe(200)
        previews.set(concept.id, await previewResponse.text())
      }
      expect(new Set(previews.values()).size).toBe(3)
      for (const concept of discovered.design.concepts) {
        const designed = set.concepts.find((entry) => entry.id === concept.id)!
        expect(previews.get(concept.id)).toContain(`--accent: ${designed.palette.accent}`)
      }
      // An unknown option is not guessed into some other build.
      const unknown = await app.request(
        `https://plattr.example/p/${token}/app?design=not-a-concept`,
        { headers: { cookie } },
        env,
      )
      expect(unknown.status).toBe(200)
      // It falls back to the saved build, not to some other stored concept.
      const otherAccent = set.concepts.find(
        (entry) => entry.id === discovered.design.concepts[1].id,
      )!.palette.accent
      expect(await unknown.text()).not.toContain(`--accent: ${otherAccent}`)

      /* 2. Selection: the owner keeps the second concept. */
      const chosen = discovered.design.concepts[1]
      const selectResponse = await app.request(
        `https://plattr.example/api/projects/${token}/doc`,
        { method: 'PUT', headers, body: JSON.stringify({ doc: chosen.doc }) },
        env,
      )
      expect(selectResponse.status).toBe(200)
      const selected = (await selectResponse.json()) as { ok: boolean; doc: unknown }
      expect(selected.ok).toBe(true)
      expect(JSON.stringify(selected.doc)).toContain(chosen.id)

      /* 3. Editing the build the owner just chose. */
      const editResponse = await app.request(
        `https://plattr.example/api/projects/${token}`,
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            name: 'GeeStores Studio',
            version: discovered.draft.version,
            spec: { tagline: 'Pieces made to be kept' },
          }),
        },
        env,
      )
      expect(editResponse.status).toBe(200)
      const edited = (await editResponse.json()) as { version: number }
      expect(edited.version).toBeGreaterThan(discovered.draft.version)

      /* 4. Save is durable: a reload returns the selected concept and the edit. */
      const reloadResponse = await app.request(
        `https://plattr.example/api/projects/${token}/doc`,
        { headers: { cookie } },
        env,
      )
      expect(reloadResponse.status).toBe(200)
      const reloaded = (await reloadResponse.json()) as { doc: unknown; saved: boolean }
      expect(reloaded.saved).toBe(true)
      expect(JSON.stringify(reloaded.doc)).toContain(chosen.id)

      // Before publication the draft is visible to its owner only.
      const appResponse = await app.request(
        `https://plattr.example/p/${token}/app`,
        { headers: { cookie } },
        env,
      )
      expect(appResponse.status).toBe(200)
      const html = await appResponse.text()
      expect(html).toContain('GeeStores Studio')
      expect(html).toContain('Pieces made to be kept')

      /* 5. Approval, then publication. */
      const approveResponse = await app.request(
        `https://plattr.example/api/projects/${token}/approve`,
        { method: 'POST', headers: { cookie } },
        env,
      )
      expect(approveResponse.status).toBe(200)

      const publishResponse = await app.request(
        `https://plattr.example/api/projects/${token}/publish`,
        { method: 'POST', headers: { cookie } },
        env,
      )
      expect(publishResponse.status).toBe(200)
      const published = (await publishResponse.json()) as { status: string; url: string; publishedAt: string }
      expect(published.status).toBe('published')
      expect(published.publishedAt).toBeTruthy()
      expect(published.url).toContain(`/p/${token}/app`)

      /* 6. The published preview is the edited application. */
      const preview = await app.request(`https://plattr.example/p/${token}/app`, {}, env)
      expect(preview.status).toBe(200)
      const previewHtml = await preview.text()
      expect(previewHtml).toContain('GeeStores Studio')
      // The chosen concept's palette is what the published app paints with.
      expect(previewHtml).toContain(`--accent: ${set.concepts[1].palette.accent}`)

      /* 7. Every model call was free, and only free hosts were contacted. */
      expect(mock.calls.hosts.every((host) =>
        ['geestores.example', 'api.groq.com', 'api.cloudflare.com'].includes(host),
      )).toBe(true)
      expect(discovered.design.costUsd).toBe(0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
