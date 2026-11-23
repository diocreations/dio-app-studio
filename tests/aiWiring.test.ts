import { afterEach, describe, expect, test } from 'bun:test'
import app from '../src/worker/index'
import { createProject } from '../src/worker/db'
import { createQuotaLedger, d1QuotaStore, memoryQuotaStore, type QuotaLedger } from '../src/worker/ai/quotas'
import { groqProvider } from '../src/worker/ai/provider'
import { freeModelFor } from '../src/worker/ai/zeroCost'
import { MemoryD1 } from './memoryD1'
import {
  JEWELLERY_URL,
  briefFrom,
  crawlSpec,
  freeEnv,
  freeProviderFetch,
  sampleDesignSet,
  siteFetch,
} from './freeAiMock'

/**
 * The product route, with both free providers mocked at `fetch`.
 *
 * Every assertion here is about the shipping path: `POST /api/discover` calls
 * `designWithFreeProviders`, which builds the provider from the route, reserves
 * from the D1 ledger before each call, settles afterwards, and returns the
 * three compiled documents beside the deterministic plan.
 */

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

type Body = {
  draft?: { token: string; version: number; preview: string }
  design?: {
    status: string
    reason?: string
    costUsd?: number
    billing?: string
    missingKeys?: string[]
    calls?: { stage: string; provider: string; costUsd: number; attempts: number; inputTokens: number; outputTokens: number }[]
    concepts?: { id: string; name: string; doc: unknown; spec: { menu: { items: { name: string; price: number }[] }[] } }[]
    inputTokens?: number
    outputTokens?: number
  }
  concepts?: { id: string; preview: string; spec: { menu: { items: { name: string; price: number }[] }[] } }[]
}

let visitor = 0

async function discover(env: unknown, fetchImpl: typeof fetch) {
  globalThis.fetch = fetchImpl
  // A distinct connection per call: the importer's per-visitor throttle is a
  // real limit, and one test must not spend another test's allowance.
  const ip = `10.1.0.${++visitor}`
  const response = await app.request(
    'https://plattr.example/api/discover',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://plattr.example',
        'cf-connecting-ip': ip,
      },
      body: JSON.stringify({ url: JEWELLERY_URL }),
    },
    env as never,
  )
  return { response, body: (await response.json()) as Body }
}

async function ledgerFor(env: { DB: unknown }): Promise<QuotaLedger> {
  return createQuotaLedger(d1QuotaStore(env.DB as never))
}

const GROQ = freeModelFor('groq', 'openai/gpt-oss-120b')!
const CF = freeModelFor('cloudflare', '@cf/openai/gpt-oss-120b')!

describe('the discover route runs the free design pipeline', () => {
  test('understand, design and copy all run, settle and cost $0.00', async () => {
    const { dossier } = await crawlSpec()
    const set = sampleDesignSet()
    const mock = freeProviderFetch({ brief: briefFrom(dossier), set })
    const env = freeEnv(new MemoryD1())

    const { response, body } = await discover(env, mock.fetch)

    expect(response.status).toBe(200)
    expect(body.design?.status).toBe('ai')
    expect(body.design?.billing).toBe('free')
    expect(body.design?.costUsd).toBe(0)
    expect(body.design?.concepts).toHaveLength(3)

    // The real answers carried the three documents, not just an id list.
    for (const concept of body.design!.concepts!) {
      expect(concept.doc).toBeTruthy()
      expect(concept.name.length).toBeGreaterThan(0)
    }
    expect(body.design!.concepts!.map((concept) => concept.id).sort()).toEqual(
      ['counter', 'festival', 'vault'],
    )

    // One call per stage, on the free providers only, none billed.
    expect(body.design!.calls!.map((call) => call.stage)).toEqual(['understand', 'design', 'copy'])
    expect(body.design!.calls!.map((call) => call.provider)).toEqual(['groq', 'cloudflare', 'groq'])
    expect(body.design!.calls!.every((call) => call.costUsd === 0)).toBe(true)
    expect(body.design!.calls!.every((call) => call.attempts === 1)).toBe(true)
    expect(mock.calls.hosts.every((host) =>
      ['geestores.example', 'api.groq.com', 'api.cloudflare.com'].includes(host),
    )).toBe(true)

    // The ledger settled to what the providers reported.
    const ledger = await ledgerFor(env)
    const groq = await ledger.usage(GROQ)
    const cf = await ledger.usage(CF)
    const reported = body.design!.calls!.reduce(
      (total, call) => total + call.inputTokens + call.outputTokens,
      0,
    )
    expect(reported).toBe((body.design!.inputTokens ?? 0) + (body.design!.outputTokens ?? 0))
    expect(groq.day.requests).toBe(2)
    expect(cf.day.requests).toBe(1)
    expect(groq.day.tokens + cf.day.tokens).toBe(reported)
    expect(cf.pool?.neurons ?? 0).toBeGreaterThan(0)

    // No page body, contact detail or key travelled to a provider.
    for (const sent of mock.calls.bodies) {
      expect(sent).not.toContain('<html')
      expect(sent).not.toContain('test-groq-key')
      expect(sent).not.toContain('test-cloudflare-token')
      expect(sent).not.toContain('geestores.example/shop')
    }

    // The deterministic plan is still the response's `concepts`, so previews,
    // editing and publishing behave exactly as before.
    expect(body.concepts).toHaveLength(3)
    expect(body.concepts!.every((concept) => concept.preview.includes('?concept='))).toBe(true)
    expect(body.draft?.token).toBeTruthy()
  })

  test('a missing free key skips the model and invents no business fact', async () => {
    const { dossier } = await crawlSpec()
    const mock = freeProviderFetch({ brief: briefFrom(dossier), set: sampleDesignSet() })
    const env = freeEnv(new MemoryD1(), false)

    const { response, body } = await discover(env, mock.fetch)

    expect(response.status).toBe(200)
    expect(body.design?.status).toBe('skipped')
    expect(body.design?.reason).toBe('no_provider')
    expect(body.design?.missingKeys?.sort()).toEqual([
      'CLOUDFLARE_ACCOUNT_ID',
      'CLOUDFLARE_API_TOKEN',
      'GROQ_API_KEY',
    ])
    expect(mock.calls.groq).toBe(0)
    expect(mock.calls.cloudflare).toBe(0)
    expect(body.concepts).toHaveLength(3)

    // Every catalogue row the fallback offers is a row the site published.
    const site = await crawlSpec()
    const published = new Set(
      site.spec.menu.flatMap((section) =>
        section.items.map((item) => `${item.name}@${item.price}`),
      ),
    )
    for (const concept of body.concepts!) {
      for (const section of concept.spec.menu) {
        for (const item of section.items) {
          expect(published.has(`${item.name}@${item.price}`)).toBe(true)
        }
      }
    }
  })

  test('an exhausted free allowance pauses the design step, not the build', async () => {
    const { dossier } = await crawlSpec()
    const set = sampleDesignSet()
    const mock = freeProviderFetch({ brief: briefFrom(dossier), set })
    const env = freeEnv(new MemoryD1())

    // The table exists as soon as the app has written anything; a build is the
    // first write on this fresh database.
    await createProject(env.DB as never, {
      name: 'GeeStores',
      contact: '',
      email: '',
      vertical: 'shop',
      accent: '#b8863f',
      logo: 'GS',
      features: ['catalog'],
      platforms: ['pwa'],
      plan: 'onetime',
    })
    // A 429 recorded on the shared pool: every caller is blocked until it clears.
    const ledger = await ledgerFor(env)
    await ledger.noteRateLimit(CF, new Date(Date.now() + 60_000))

    const { response, body } = await discover(env, mock.fetch)

    expect(response.status).toBe(200)
    expect(body.design?.status).toBe('paused')
    expect(body.design?.reason).toBe('quota_exhausted')
    expect(mock.calls.cloudflare).toBe(0)
    expect(body.concepts).toHaveLength(3)
  })

  test('a failing provider is released, accounted and reported', async () => {
    const { dossier } = await crawlSpec()
    const set = sampleDesignSet()
    const mock = freeProviderFetch({ brief: briefFrom(dossier), set, design: 'server_error' })
    const env = freeEnv(new MemoryD1())

    const { response, body } = await discover(env, mock.fetch)

    expect(response.status).toBe(200)
    expect(body.design?.status).toBe('failed')
    // The two attempts the retry policy allows were made, and both released.
    expect(mock.calls.cloudflare).toBe(2)
    const ledger = await ledgerFor(env)
    const cf = await ledger.usage(CF)
    expect(cf.day.requests).toBe(0)
    expect(cf.day.tokens).toBe(0)
    expect(cf.pool?.neurons ?? 0).toBe(0)
    // The understanding call that did succeed stays on the books.
    const groq = await ledger.usage(GROQ)
    expect(groq.day.requests).toBe(1)
    expect(body.concepts).toHaveLength(3)
  })

  test('a failed copy pass keeps the design headings and releases only copy', async () => {
    const { dossier } = await crawlSpec()
    const mock = freeProviderFetch({
      brief: briefFrom(dossier),
      set: sampleDesignSet(),
      copy: 'server_error',
    })
    const env = freeEnv(new MemoryD1())

    const { body } = await discover(env, mock.fetch)

    // A design without the copy pass is still a design: the headings the set
    // already carried are what compile into the documents.
    expect(body.design?.status).toBe('ai')
    expect(body.design?.concepts).toHaveLength(3)
    // The refused copy attempt is not a recorded call; the documents still are.
    expect(body.design?.calls?.map((call) => call.stage)).toEqual(['understand', 'design'])

    const ledger = await ledgerFor(env)
    const groq = await ledger.usage(GROQ)
    const understand = body.design!.calls![0]
    // Copy reserved, failed, and gave its reservation back: only the
    // understanding call is charged.
    // One understanding call, then the retry policy's two copy attempts.
    expect(mock.calls.groq).toBe(3)
    expect(groq.day.requests).toBe(1)
    expect(groq.day.tokens).toBe(understand.inputTokens + understand.outputTokens)
  })

  test('a timeout releases its reservation instead of charging the day', async () => {
    const quota = createQuotaLedger(memoryQuotaStore())
    let attempts = 0
    globalThis.fetch = (async () => {
      attempts += 1
      throw new DOMException('The operation was aborted.', 'AbortError')
    }) as unknown as typeof fetch
    const provider = groqProvider('test-groq-key', {
      understand: 'openai/gpt-oss-120b',
      design: 'openai/gpt-oss-120b',
      copy: 'openai/gpt-oss-120b',
    }, { quota })

    await expect(
      provider.generate({
        stage: 'understand',
        system: 's',
        user: 'u',
        schema: { type: 'object', properties: { ok: { type: 'boolean' } }, additionalProperties: false },
        maxOutputTokens: 100,
      }),
    ).rejects.toThrow()
    expect(attempts).toBe(1)
    const usage = await quota.usage(freeModelFor('groq', 'openai/gpt-oss-120b')!)
    expect(usage.day.requests).toBe(0)
    expect(usage.day.tokens).toBe(0)
  })

  test('a malformed design answer is refused rather than compiled', async () => {
    const { dossier } = await crawlSpec()
    const mock = freeProviderFetch({
      brief: briefFrom(dossier),
      set: sampleDesignSet(),
      design: 'malformed',
    })
    const env = freeEnv(new MemoryD1())

    const { body } = await discover(env, mock.fetch)
    expect(body.design?.status).toBe('failed')
    expect(body.design?.reason).toBe('design_invalid')
    expect(mock.calls.cloudflare).toBe(1)
  })
})
