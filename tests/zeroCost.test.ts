import { afterEach, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dossierForPrompt, type Dossier } from '../src/worker/ai/dossier'
import { understandPrompt } from '../src/worker/ai/prompts'
import { costUsd, estimateMaxUsd } from '../src/worker/ai/pricing'
import {
  assertZeroCost,
  freeModelFor,
  isFreeModel,
  neuronsFor,
  PaidRequestRefused,
  ZERO_COST_MODE,
  type FreeModel,
} from '../src/worker/ai/zeroCost'
import {
  QUOTA_SCHEMA_SQL,
  QuotaExhaustedError,
  createQuotaLedger,
  d1QuotaStore,
  memoryQuotaStore,
  type D1Like,
  type QuotaStore,
} from '../src/worker/ai/quotas'
import { fileQuotaStore } from '../src/worker/ai/quotasFile'
import { groqProvider, stagedProvider, workersAiProvider } from '../src/worker/ai/provider'

const GROQ = 'openai/gpt-oss-120b'
const CF = '@cf/openai/gpt-oss-120b'
const AT = new Date('2026-11-23T10:15:30.000Z')

const spec = (model: string): FreeModel => {
  const spec = freeModelFor('groq', model) ?? freeModelFor('cloudflare', model)
  if (!spec) throw new Error(`no free spec for ${model}`)
  return spec
}

const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, additionalProperties: false }

/** Minimal D1 shim over bun:sqlite, so the real SQL is what is tested. */
function sqliteD1(db: Database): D1Like {
  return {
    prepare(sql: string) {
      let values: unknown[] = []
      const api = {
        bind(...args: unknown[]) {
          values = args
          return api
        },
        async first<T = unknown>(): Promise<T | null> {
          const row = db.prepare(sql).get(...(values as never[]))
          return (row as T | undefined) ?? null
        },
        async run(): Promise<unknown> {
          db.prepare(sql).run(...(values as never[]))
          return { success: true }
        },
      }
      return api
    },
  }
}

describe('zero-cost guard', () => {
  test('the mode is on and only Groq and Cloudflare are reachable', () => {
    expect(ZERO_COST_MODE).toBe(true)
    expect(assertZeroCost({ provider: 'groq', model: GROQ }).provider).toBe('groq')
    expect(assertZeroCost({ provider: 'cloudflare', model: CF }).provider).toBe('cloudflare')
    for (const provider of ['anthropic', 'openai', 'openrouter', 'gemini']) {
      expect(() => assertZeroCost({ provider, model: GROQ })).toThrow(PaidRequestRefused)
    }
    expect(() => assertZeroCost({ provider: 'groq', model: 'anthropic/claude-sonnet-5.5' })).toThrow(
      /not on the free allowlist/,
    )
  })

  test('Gemini and OpenRouter are refused as future providers, not accepted', () => {
    try {
      assertZeroCost({ provider: 'gemini', model: 'gemini-3.8-flash' })
      throw new Error('should have refused')
    } catch (error) {
      expect(error).toBeInstanceOf(PaidRequestRefused)
      expect((error as PaidRequestRefused).code).toBe('future_provider')
    }
    try {
      assertZeroCost({ provider: 'openrouter', model: 'meta-llama/llama-3.2-3b-instruct:free' })
      throw new Error('should have refused')
    } catch (error) {
      expect((error as PaidRequestRefused).code).toBe('future_provider')
    }
  })

  test('no fallback list, no automatic routing, no context overrun', () => {
    expect(() =>
      assertZeroCost({ provider: 'groq', model: GROQ, routing: { models: [GROQ, 'gpt-6-sol'] } }),
    ).toThrow(/fallback list/)
    expect(() =>
      assertZeroCost({ provider: 'groq', model: GROQ, routing: { allowFallbacks: true } }),
    ).toThrow(/allow_fallbacks/)
    expect(() => assertZeroCost({ provider: 'groq', model: GROQ, routing: { autoRouter: true } })).toThrow(
      /Automatic model routing/,
    )
    expect(() =>
      assertZeroCost({ provider: 'cloudflare', model: CF, estimatedTokens: 500_000 }),
    ).toThrow(/over 128000/)
    // A safe, explicit false is accepted.
    expect(() => assertZeroCost({ provider: 'groq', model: GROQ, routing: { allowFallbacks: false } })).not.toThrow()
  })

  test('a free model costs exactly nothing, at any volume', () => {
    for (const model of [GROQ, CF]) {
      expect(isFreeModel(model)).toBe(true)
      expect(costUsd(model, { inputTokens: 10_000_000, cachedInputTokens: 0, outputTokens: 10_000_000 })).toBe(0)
      expect(estimateMaxUsd(model, 10_000_000, 65_536)).toBe(0)
    }
  })

  test('Cloudflare neurons are derived from the published per-token rates', () => {
    const cloudflare = spec(CF)
    // 1M input at 31,818/M and 1M output at 68,182/M.
    expect(neuronsFor(cloudflare, 1_000_000, 0)).toBe(31_818)
    expect(neuronsFor(cloudflare, 0, 1_000_000)).toBe(68_182)
    expect(neuronsFor(spec(GROQ), 1_000_000, 1_000_000)).toBe(0)
  })
})

describe('quota ledger', () => {
  test('the daily ceiling is enforced and a refusal leaves no phantom reservation', async () => {
    const store = memoryQuotaStore()
    const ledger = createQuotaLedger(store)
    // The minute window is widened here so this test isolates the daily ceiling;
    // the next test covers Groq's real 8,000 tokens/minute.
    const groq: FreeModel = {
      ...spec(GROQ),
      limits: { ...spec(GROQ).limits, tokensPerMinute: 200_000, requestsPerMinute: 100 },
    }

    // Three in-flight requests of 60k tokens fill 200k/day. They stay reserved,
    // exactly like concurrent requests from different users would.
    for (let index = 0; index < 3; index += 1) {
      await ledger.reserve(groq, { inputTokens: 60_000, outputTokens: 0 }, AT)
    }
    const before = await store.read(`groq:${GROQ}:day:2026-11-23`)
    expect(before).toMatchObject({ requests: 3, tokens: 180_000 })

    // The fourth would exceed 200k. It must throw, and add nothing anywhere.
    await expect(
      ledger.reserve(groq, { inputTokens: 60_000, outputTokens: 0 }, AT),
    ).rejects.toBeInstanceOf(QuotaExhaustedError)
    const after = await store.read(`groq:${GROQ}:day:2026-11-23`)
    expect(after).toMatchObject({ requests: 3, tokens: 180_000 })
    const minute = await store.read(`groq:${GROQ}:minute:2026-11-23T10:15`)
    expect(minute).toMatchObject({ requests: 3, tokens: 180_000 })
  })

  test('a request larger than the tokens-per-minute window is refused with the reset time', async () => {
    const store = memoryQuotaStore()
    const ledger = createQuotaLedger(store)
    const groq = spec(GROQ)
    try {
      // Groq's free plan allows 8,000 tokens/minute: the full design call does
      // not fit, which is why the design stage runs on Workers AI.
      await ledger.reserve(groq, { inputTokens: 15_000, outputTokens: 0 }, AT)
      throw new Error('should have refused')
    } catch (error) {
      expect(error).toBeInstanceOf(QuotaExhaustedError)
      const exhausted = error as QuotaExhaustedError
      expect(exhausted.scope).toBe('minute')
      expect(exhausted.resetsAt.toISOString()).toBe('2026-11-23T10:16:00.000Z')
    }
    // Nothing was consumed on the daily counter either.
    const day = await store.read(`groq:${GROQ}:day:2026-11-23`)
    expect(day).toMatchObject({ requests: 0, tokens: 0 })
  })

  test('settlement replaces the reservation with reported usage', async () => {
    const store = memoryQuotaStore()
    const ledger = createQuotaLedger(store)
    const cloudflare = spec(CF)
    const reservation = await ledger.reserve(cloudflare, { inputTokens: 5_000, outputTokens: 0 }, AT)
    const reserved = await ledger.usage(cloudflare, AT)
    expect(reserved.remaining.neurons).toBeLessThan(10_000)
    expect(reserved.remaining.neurons).toBeGreaterThan(9_000)

    await ledger.settle(reservation, { tokens: 4_200, neurons: 300 }, AT)
    const settled = await ledger.usage(cloudflare, AT)
    expect(settled.day.tokens).toBe(4_200)
    expect(settled.pool?.neurons).toBe(300)
    expect(settled.remaining.neurons).toBe(9_700)
  })

  test('a 429 blocks the model for everyone until the retry time', async () => {
    const store = memoryQuotaStore()
    const ledger = createQuotaLedger(store)
    const groq = spec(GROQ)
    await ledger.noteRateLimit(groq, new Date('2026-11-23T10:20:00.000Z'), AT)
    await expect(
      ledger.reserve(groq, { inputTokens: 1_000, outputTokens: 0 }, AT),
    ).rejects.toBeInstanceOf(QuotaExhaustedError)
    const state = await store.read(`groq:${GROQ}:day:2026-11-23`)
    expect(state.rateLimits).toBe(1)
    // Once the block passes, the same ledger works again.
    const later = new Date('2026-11-23T10:21:00.000Z')
    await expect(ledger.reserve(groq, { inputTokens: 1_000, outputTokens: 0 }, later)).resolves.toBeTruthy()
  })

  test('a store that cannot answer is a refusal, not an optimistic attempt', async () => {
    const broken: QuotaStore = {
      async tryConsume() {
        throw new Error('D1 unavailable')
      },
      async adjust() {},
      async read() {
        throw new Error('D1 unavailable')
      },
      async noteRateLimit() {},
    }
    const ledger = createQuotaLedger(broken)
    await expect(
      ledger.reserve(spec(GROQ), { inputTokens: 100, outputTokens: 0 }, AT),
    ).rejects.toThrow('D1 unavailable')
  })

  test('the SQL itself refuses the extra concurrent reservation', () => {
    const db = new Database(':memory:')
    db.exec(QUOTA_SCHEMA_SQL)
    const store = d1QuotaStore(sqliteD1(db))
    const limits = { requests: 3, tokens: 1_000, neurons: 1_000 }
    const attempt = () =>
      store.tryConsume('k', { requests: 1, tokens: 10, neurons: 0 }, limits, AT)

    const results = [] as boolean[]
    // D1 serialises writers; the WHERE clause decides, not the caller.
    const pending = Promise.all(Array.from({ length: 10 }, () => attempt()))
    return pending.then((outcomes) => {
      results.push(...outcomes)
      expect(results.filter(Boolean)).toHaveLength(3)
      expect(results.filter((ok) => !ok)).toHaveLength(7)
    })
  })

  test('settlement never drives a counter below zero', async () => {
    const db = new Database(':memory:')
    db.exec(QUOTA_SCHEMA_SQL)
    const store = d1QuotaStore(sqliteD1(db))
    await store.tryConsume('k', { requests: 1, tokens: 100, neurons: 0 }, { requests: 5, tokens: 500, neurons: 500 }, AT)
    await store.adjust('k', { requests: -1, tokens: -400, neurons: 0 }, AT)
    expect((await store.read('k')).tokens).toBe(0)
    expect((await store.read('k')).requests).toBe(0)
  })

  test('a Cloudflare neuron pool exhaustion stops the day, not the request', async () => {
    const store = memoryQuotaStore()
    const ledger = createQuotaLedger(store)
    const cloudflare = spec(CF)
    // 10,000 neurons / (5,000 input at 31,818/M) ≈ 159 neurons per reservation.
    const reservation = await ledger.reserve(cloudflare, { inputTokens: 120_000, outputTokens: 0 }, AT)
    await ledger.settle(reservation, { tokens: 120_000, neurons: 9_900 }, AT)
    try {
      await ledger.reserve(cloudflare, { inputTokens: 10_000, outputTokens: 0 }, AT)
      throw new Error('should have refused')
    } catch (error) {
      expect(error).toBeInstanceOf(QuotaExhaustedError)
      expect((error as QuotaExhaustedError).scope).toBe('pool')
      expect((error as QuotaExhaustedError).resetsAt.toISOString()).toBe('2026-11-24T00:00:00.000Z')
    }
  })

  test('a file-backed ledger is shared between two processes, with one lock', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'plattr-quota-'))
    try {
      const path = join(dir, 'quota.json')
      const first = createQuotaLedger(fileQuotaStore(path))
      const second = createQuotaLedger(fileQuotaStore(path))
      const limits = { requests: 12, tokens: 1_000_000, neurons: 1_000_000 }
      const stores = [fileQuotaStore(path), fileQuotaStore(path)]
      const attempts = Array.from({ length: 40 }, (_, index) =>
        stores[index % 2].tryConsume('shared', { requests: 1, tokens: 1, neurons: 0 }, limits, AT),
      )
      const outcomes = await Promise.all(attempts)
      expect(outcomes.filter(Boolean)).toHaveLength(12)
      // Both ledgers read the same total.
      const usage = await first.usage(spec(GROQ), AT)
      expect(usage.day.requests).toBe(0)
      expect(await second.reserve(spec(GROQ), { inputTokens: 1, outputTokens: 0 }, AT)).toBeTruthy()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('free adapters', () => {
  const originalFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('Groq is called with a strict schema and records a zero cost', async () => {
    const captured: { url: string; headers: Record<string, string>; body: any } = { url: '', headers: {}, body: null }
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      captured.url = String(url)
      captured.headers = (init?.headers ?? {}) as Record<string, string>
      captured.body = JSON.parse(String(init?.body))
      return new Response(
        JSON.stringify({
          id: 'chatcmpl-1',
          model: GROQ,
          choices: [{ message: { role: 'assistant', content: '{"ok":true}' }, finish_reason: 'stop' }],
          usage: {
            prompt_tokens: 900,
            completion_tokens: 120,
            completion_tokens_details: { reasoning_tokens: 40 },
            prompt_tokens_details: { cached_tokens: 300 },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as typeof fetch

    const quota = createQuotaLedger(memoryQuotaStore())
    const provider = groqProvider('groq-key', { understand: GROQ, design: GROQ, copy: GROQ }, {
      quota,
      reasoning: { design: 'medium' },
      reasoningReserveTokens: { design: 4000 },
    })
    const result = await provider.generate({ stage: 'design', system: 's', user: 'u', schema, maxOutputTokens: 900 })

    expect(captured.url).toBe('https://api.groq.com/openai/v1/chat/completions')
    expect(captured.headers.authorization).toBe('Bearer groq-key')
    expect(captured.body.model).toBe(GROQ)
    expect(captured.body.max_completion_tokens).toBe(4900)
    expect(captured.body.reasoning_effort).toBe('medium')
    expect(captured.body.response_format.json_schema.strict).toBe(true)
    // No fallback list and no provider routing block, ever.
    expect(captured.body.models).toBeUndefined()
    expect(captured.body.provider).toBeUndefined()
    expect(result.provider).toBe('groq')
    expect(result.costUsd).toBe(0)
    expect(result.usage.reasoningTokens).toBe(40)
    // The ledger settled to reported usage, not the reservation.
    const usage = await quota.usage(spec(GROQ), new Date())
    expect(usage.day.tokens).toBe(1_020)
  })

  test('a paid model ID is refused before any socket is opened', async () => {
    let calls = 0
    globalThis.fetch = (async () => {
      calls += 1
      throw new Error('should not be called')
    }) as unknown as typeof fetch
    const provider = groqProvider('groq-key', {
      understand: GROQ,
      design: 'claude-sonnet-5-5',
      copy: GROQ,
    })
    await expect(
      provider.generate({ stage: 'design', system: 's', user: 'u', schema, maxOutputTokens: 100 }),
    ).rejects.toBeInstanceOf(PaidRequestRefused)
    expect(calls).toBe(0)
  })

  test('an exhausted quota stops the call before it is sent', async () => {
    let calls = 0
    globalThis.fetch = (async () => {
      calls += 1
      throw new Error('should not be called')
    }) as unknown as typeof fetch
    const store = memoryQuotaStore()
    const quota = createQuotaLedger(store)
    const groq = spec(GROQ)
    await store.tryConsume(
      `groq:${GROQ}:day:${new Date().toISOString().slice(0, 10)}`,
      { requests: 1_000, tokens: 0, neurons: 0 },
      { requests: 1_000, tokens: 200_000, neurons: 0 },
      new Date(),
    )
    const provider = groqProvider('groq-key', { understand: GROQ, design: GROQ, copy: GROQ }, { quota })
    await expect(
      provider.generate({ stage: 'design', system: 's', user: 'u', schema, maxOutputTokens: 100 }),
    ).rejects.toBeInstanceOf(QuotaExhaustedError)
    expect(calls).toBe(0)
    void groq
  })

  test('Workers AI is called at the account URL with a bearer token and a zero cost', async () => {
    const captured: { url: string; headers: Record<string, string>; body: any } = { url: '', headers: {}, body: null }
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      captured.url = String(url)
      captured.headers = (init?.headers ?? {}) as Record<string, string>
      captured.body = JSON.parse(String(init?.body))
      return new Response(
        JSON.stringify({
          id: 'cf-1',
          model: CF,
          choices: [{ message: { role: 'assistant', content: '{"ok":true}' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 4_000, completion_tokens: 2_000 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as typeof fetch

    const quota = createQuotaLedger(memoryQuotaStore())
    const provider = workersAiProvider({ accountId: 'acct-1', apiToken: 'cf-token' }, undefined, { quota })
    const result = await provider.generate({
      stage: 'design',
      system: 's',
      user: 'u',
      schema,
      maxOutputTokens: 3_000,
    })
    expect(captured.url).toBe(
      'https://api.cloudflare.com/client/v4/accounts/acct-1/ai/v1/chat/completions',
    )
    expect(captured.headers.authorization).toBe('Bearer cf-token')
    expect(captured.body.model).toBe(CF)
    expect(captured.body.max_tokens).toBe(3_000)
    expect(captured.body.response_format.json_schema.strict).toBe(true)
    expect(result.costUsd).toBe(0)
    // 6,000 tokens at Cloudflare's rates is a real Neuron charge, but $0 cash.
    const usage = await quota.usage(spec(CF), new Date())
    expect(usage.pool?.neurons).toBeGreaterThan(0)
  })

  test('a staged provider sends each stage to its own free provider', async () => {
    const seen: string[] = []
    const fake = (name: 'groq' | 'cloudflare') => ({
      name,
      modelFor: () => (name === 'groq' ? GROQ : CF),
      async generate() {
        seen.push(name)
        return {
          json: {},
          usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 },
          model: name === 'groq' ? GROQ : CF,
          provider: name,
          latencyMs: 1,
          requestId: name,
          costUsd: 0,
        }
      },
    })
    const mixed = stagedProvider({ understand: fake('groq'), design: fake('cloudflare'), copy: fake('groq') })
    await mixed.generate({ stage: 'understand', system: 's', user: 'u', schema, maxOutputTokens: 10 })
    await mixed.generate({ stage: 'design', system: 's', user: 'u', schema, maxOutputTokens: 10 })
    await mixed.generate({ stage: 'copy', system: 's', user: 'u', schema, maxOutputTokens: 10 })
    expect(seen).toEqual(['groq', 'cloudflare', 'groq'])
  })
})

describe('provider payload privacy', () => {
  const dossier: Dossier = {
    kind: 'url',
    business: {
      name: 'GeeStores',
      category: 'Jewellery shop',
      trade: 'shop',
      tagline: 'Fine things',
      story: 'A shop in Chennai.',
      hours: '9-6',
      address: '1 Market Road',
      phone: '+44 7700 900123',
      email: 'owner@example.com',
    },
    catalogue: { entries: 2, priced: 2, withPhotograph: 1, currency: 'INR', sections: [] },
    facts: [],
    quotes: [],
    workflows: ['browse'],
    allowedScreens: ['home', 'catalog'],
    sample: true,
  }

  test('the dossier sent to a provider carries no contact records or secrets', () => {
    const payload = JSON.stringify(dossierForPrompt(dossier))
    expect(payload).not.toContain('owner@example.com')
    expect(payload).not.toContain('+44 7700 900123')
    for (const forbidden of ['email', 'phone', 'card', 'payment', 'secret', 'token', 'password', 'cvv']) {
      expect(payload.toLowerCase()).not.toContain(`"${forbidden}"`)
    }
  })

  test('the understand prompt is built from that minimised dossier', () => {
    const prompt = understandPrompt(dossier)
    expect(prompt.user).not.toContain('owner@example.com')
    expect(prompt.user).not.toContain('900123')
    expect(prompt.system).toContain('Never add a price')
  })
})
