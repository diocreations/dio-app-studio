import { afterEach, describe, expect, test } from 'bun:test'
import { estimateTokens } from '../src/worker/ai/pricing'
import {
  QuotaExhaustedError,
  createQuotaLedger,
  memoryQuotaStore,
  type QuotaLedger,
} from '../src/worker/ai/quotas'
import { groqProvider, workersAiProvider, type AiStage } from '../src/worker/ai/provider'
import { freeModelFor, neuronsFor } from '../src/worker/ai/zeroCost'

/**
 * The free-tier meter, at the two places it is easiest to get wrong.
 *
 * 1. Cloudflare charges input and output at different Neuron rates, and the
 *    output ceiling is what an expensive answer actually uses. A reservation
 *    that named one total at the input rate would under-state an output-heavy
 *    call by more than half, so several of them could cross the shared pool.
 * 2. Settlement is part of the call, not an afterthought: a malformed, empty,
 *    truncated or refused answer still consumed what the provider reported, and
 *    an answer with no usage at all must keep its reservation rather than hand
 *    back quota that may already be spent.
 *
 * Every provider is mocked at `fetch`; nothing leaves the process.
 */

const CF = freeModelFor('cloudflare', '@cf/openai/gpt-oss-120b')!
const GROQ = freeModelFor('groq', 'openai/gpt-oss-120b')!
const AT = new Date('2026-11-23T10:15:30.000Z')
const schema = {
  type: 'object',
  properties: { ok: { type: 'boolean' } },
  additionalProperties: false,
}

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

/** The same bound the adapters build: prompt, schema and their fixed margin. */
function inputEstimate(system = 's', user = 'u'): number {
  return estimateTokens(`${system}\n${user}`) + estimateTokens(JSON.stringify(schema)) + 900
}

function request(stage: AiStage = 'design', maxOutputTokens = 1_000) {
  return { stage, system: 's', user: 'u', schema, maxOutputTokens }
}

function chatReply(options: {
  content?: string
  prompt?: number
  completion?: number
  finish?: string
  usage?: boolean
}): Response {
  const body: Record<string, unknown> = {
    id: 'chatcmpl-test',
    model: CF.model,
    choices: [
      {
        message: { role: 'assistant', content: options.content ?? '{"ok":true}' },
        finish_reason: options.finish ?? 'stop',
      },
    ],
  }
  if (options.usage !== false) {
    body.usage = {
      prompt_tokens: options.prompt ?? 900,
      completion_tokens: options.completion ?? 40,
    }
  }
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

type ZeroCostOptions = NonNullable<Parameters<typeof workersAiProvider>[2]>

function cloudflare(quota: QuotaLedger, options: ZeroCostOptions = {}) {
  return workersAiProvider({ accountId: 'acct', apiToken: 'token' }, undefined, { quota, ...options })
}

function groq(quota: QuotaLedger) {
  return groqProvider('groq-key', { understand: GROQ.model, design: GROQ.model, copy: GROQ.model }, { quota })
}

describe('Neuron reservations', () => {
  test('input and output are reserved at their own Neuron rates', async () => {
    const ledger = createQuotaLedger(memoryQuotaStore())
    await ledger.reserve(CF, { inputTokens: 1_000, outputTokens: 60_000 }, AT)

    const pool = (await ledger.usage(CF, AT)).pool?.neurons ?? 0
    expect(pool).toBe(neuronsFor(CF, 1_000, 60_000))
    // One total at the input rate would have reserved less than half of this.
    expect(pool).toBeGreaterThan(neuronsFor(CF, 61_000, 0) * 2)
  })

  test('the reservation covers the whole output ceiling plus its reasoning allowance', async () => {
    const quota = createQuotaLedger(memoryQuotaStore())
    let sentMax: number | undefined
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      sentMax = JSON.parse(String(init?.body)).max_tokens
      throw new DOMException('The operation was aborted.', 'AbortError')
    }) as unknown as typeof fetch

    const provider = cloudflare(quota, { reasoningReserveTokens: { design: 4_000 } })
    await expect(provider.generate(request('design', 46_000))).rejects.toThrow()

    // 46,000 visible + 4,000 reasoning is what the request may produce, and the
    // reservation is priced on exactly that output ceiling.
    expect(sentMax).toBe(50_000)
    const pool = (await quota.usage(CF)).pool?.neurons ?? 0
    expect(pool).toBe(neuronsFor(CF, inputEstimate(), 50_000))
  })

  test('concurrent output-heavy calls cannot cross the shared Neuron pool', async () => {
    const quota = createQuotaLedger(memoryQuotaStore())
    let sent = 0
    globalThis.fetch = (async () => {
      sent += 1
      return chatReply({ prompt: 1_000, completion: 50_000 })
    }) as unknown as typeof fetch

    const provider = cloudflare(quota)
    const outcomes = await Promise.all(
      Array.from({ length: 8 }, () =>
        provider.generate(request('design', 50_000)).then(
          () => 'ok' as const,
          (error) => (error instanceof QuotaExhaustedError ? ('refused' as const) : ('error' as const)),
        ),
      ),
    )

    // Each call needs about 3,440 of the 10,000-Neuron day, so exactly two fit.
    expect(outcomes.filter((outcome) => outcome === 'ok')).toHaveLength(2)
    expect(outcomes.filter((outcome) => outcome === 'refused')).toHaveLength(6)
    expect(sent).toBe(2)
    const pool = (await quota.usage(CF)).pool?.neurons ?? 0
    expect(pool).toBeLessThanOrEqual(CF.limits.neuronsPerDay)
  })
})

describe('settling an unsuccessful answer', () => {
  test('a malformed answer is settled at the usage it reported', async () => {
    const quota = createQuotaLedger(memoryQuotaStore())
    globalThis.fetch = (async () =>
      chatReply({ content: '{"not":"the contract"', prompt: 1_500, completion: 60 })) as unknown as typeof fetch

    await expect(cloudflare(quota).generate(request())).rejects.toMatchObject({ code: 'parse' })

    const usage = await quota.usage(CF)
    expect(usage.day.tokens).toBe(1_560)
    expect(usage.pool?.neurons).toBe(neuronsFor(CF, 1_500, 60))
  })

  test('an empty answer is refused and its prompt tokens stay charged', async () => {
    const quota = createQuotaLedger(memoryQuotaStore())
    globalThis.fetch = (async () =>
      chatReply({ content: '', prompt: 900, completion: 0 })) as unknown as typeof fetch

    await expect(cloudflare(quota).generate(request())).rejects.toMatchObject({ code: 'parse' })
    expect((await quota.usage(CF)).day.tokens).toBe(900)
  })

  test('a truncated answer is settled and reported as truncated', async () => {
    const quota = createQuotaLedger(memoryQuotaStore())
    globalThis.fetch = (async () =>
      chatReply({ finish: 'length', prompt: 800, completion: 4_000 })) as unknown as typeof fetch

    await expect(cloudflare(quota).generate(request())).rejects.toMatchObject({ code: 'truncated' })

    const usage = await quota.usage(CF)
    expect(usage.day.tokens).toBe(4_800)
    // The output was produced, so it is charged at the output rate.
    expect(usage.pool?.neurons).toBe(neuronsFor(CF, 800, 4_000))
  })

  test('a refusal is settled at what it consumed', async () => {
    const quota = createQuotaLedger(memoryQuotaStore())
    globalThis.fetch = (async () =>
      chatReply({ finish: 'content_filter', prompt: 900, completion: 12 })) as unknown as typeof fetch

    await expect(cloudflare(quota).generate(request())).rejects.toMatchObject({ code: 'refused' })
    expect((await quota.usage(CF)).day.tokens).toBe(912)
  })

  test('an answer with no usage keeps its whole reservation', async () => {
    const quota = createQuotaLedger(memoryQuotaStore())
    globalThis.fetch = (async () =>
      chatReply({ content: 'not json at all', usage: false })) as unknown as typeof fetch

    await expect(groq(quota).generate(request())).rejects.toMatchObject({ code: 'parse' })

    // Nothing was returned to say what it consumed, so the estimate stands:
    // reported usage cannot be invented from an empty body.
    const usage = await quota.usage(GROQ)
    expect(usage.day.tokens).toBe(inputEstimate() + 1_000)
  })

  test('an HTTP refusal releases the reservation, a timeout keeps it', async () => {
    const refused = createQuotaLedger(memoryQuotaStore())
    globalThis.fetch = (async () => new Response('down', { status: 503 })) as unknown as typeof fetch
    await expect(groq(refused).generate(request())).rejects.toMatchObject({ code: 'http' })
    expect((await refused.usage(GROQ)).day.requests).toBe(0)
    expect((await refused.usage(GROQ)).day.tokens).toBe(0)

    const uncertain = createQuotaLedger(memoryQuotaStore())
    globalThis.fetch = (async () => {
      throw new DOMException('The operation was aborted.', 'AbortError')
    }) as unknown as typeof fetch
    await expect(groq(uncertain).generate(request())).rejects.toMatchObject({ code: 'transport' })
    expect((await uncertain.usage(GROQ)).day.requests).toBe(1)
    expect((await uncertain.usage(GROQ)).day.tokens).toBe(inputEstimate() + 1_000)
  })
})
