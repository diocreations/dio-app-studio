import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
  GROQ_PRICE,
  OPENROUTER_PRICE,
  TRIAL_CLAIM_SQL,
  TRIAL_ID,
  TRIAL_LIMITS,
  TRIAL_PROVIDERS,
  TRIAL_SCHEMA_SQL,
  memoryTrialStore,
  trialStatus,
  trialProviderById,
} from '../src/worker/ai/trial'
import { runTrialGeneration } from '../src/worker/ai/trialRun'
import { runDesignPipeline } from '../src/worker/ai/pipeline'
import { createLedger } from '../src/worker/ai/ledger'
import { ProviderError, type AiProvider } from '../src/worker/ai/provider'
import type { BusinessBrief, DesignSet } from '../src/worker/ai/contracts'
import { parseBrief } from '../src/worker/ai/validate'
import { briefFrom, copySetFor, crawlSpec, sampleDesignSet } from './freeAiMock'

/**
 * The paid trial, exercised entirely offline.
 *
 * `fetch` answers only the two trial gateways and records every body it was
 * given. A call to any other host fails the test, which is how "no provider is
 * reached before the keys and the approval" is proven rather than asserted.
 */

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

const GROQ_KEY = 'gsk-test-trial-key-never-logged'
const OPENROUTER_KEY = 'sk-or-test-trial-key-never-logged'

type Stage = 'understand' | 'design' | 'copy'

type TrialCalls = { hosts: string[]; bodies: string[]; stages: Stage[]; auth: string[] }

function trialFetch(options: {
  brief: BusinessBrief
  set: DesignSet
  /** Reported charge on OpenRouter. Groq reports tokens, not dollars. */
  cost?: Partial<Record<Stage, number>>
  designSet?: DesignSet
  /** The endpoint OpenRouter reports. Defaults to Groq, for the pinned arm. */
  served?: string
  /** Fail this stage once with a retryable 503 before answering. */
  failOnce?: Stage
  /** Fail this stage once with a non-2xx body that carries billing information. */
  failOnceWithCost?: { stage: Stage; status: number; cost: number }
  /** Cut this stage off at the token limit, after the provider has billed. */
  truncate?: Stage
  /** Answer with usage but no choices at all. */
  noChoices?: Stage
  /** Answer without any usage block: the charge cannot be established. */
  omitUsage?: Stage
}): { fetch: typeof fetch; calls: TrialCalls } {
  const calls: TrialCalls = { hosts: [], bodies: [], stages: [], auth: [] }
  let failed = false
  let failedWithCost = false
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    calls.hosts.push(url.hostname)
    if (url.hostname !== 'openrouter.ai' && url.hostname !== 'api.groq.com') {
      throw new Error(`the trial reached ${url.href}; only the two trial gateways may be called`)
    }
    const headers = new Headers(init?.headers)
    calls.auth.push(headers.get('authorization') ?? '')
    const body = JSON.parse(String(init?.body)) as {
      model: string
      response_format: { json_schema: { name: string } }
    }
    calls.bodies.push(String(init?.body))
    const stage = body.response_format.json_schema.name.replace('plattr_', '') as Stage
    calls.stages.push(stage)
    if (options.failOnce === stage && !failed) {
      failed = true
      return new Response(JSON.stringify({ error: 'temporarily unavailable' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (options.failOnceWithCost?.stage === stage && !failedWithCost) {
      failedWithCost = true
      return new Response(
        JSON.stringify({
          error: 'upstream failed after inference',
          usage: { prompt_tokens: 900, completion_tokens: 100, cost: options.failOnceWithCost.cost },
        }),
        { status: options.failOnceWithCost.status, headers: { 'content-type': 'application/json' } },
      )
    }
    const answer =
      stage === 'understand'
        ? options.brief
        : stage === 'design'
          ? (options.designSet ?? options.set)
          : copySetFor(options.set)
    const usage: Record<string, unknown> = {
      prompt_tokens: 1_000,
      completion_tokens: 500,
    }
    const truncated = options.truncate === stage
    if (url.hostname === 'openrouter.ai') {
      usage.cost = options.cost?.[stage] ?? 0.001
    }
    const choices =
      options.noChoices === stage
        ? []
        : [
            {
              message: {
                role: 'assistant',
                content: truncated ? '{"concepts":[]}' : JSON.stringify(answer),
              },
              finish_reason: truncated ? 'length' : 'stop',
            },
          ]
    return new Response(
      JSON.stringify({
        id: `gen-${calls.stages.length}`,
        model: body.model,
        ...(url.hostname === 'openrouter.ai' ? { provider: options.served ?? 'Groq' } : {}),
        choices,
        ...(options.omitUsage === stage ? {} : { usage }),
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }) as typeof fetch
  return { fetch: fetchImpl, calls }
}

const trialEnv = () => ({
  GROQ_API_KEY: GROQ_KEY,
  OPENROUTER_API_KEY: OPENROUTER_KEY,
  PLATTR_AI_TRIAL: 'approved',
})

describe('the paid trial is closed until the owner opens it', () => {
  test('without keys nothing is built and no provider is called', async () => {
    const { spec, dossier } = await crawlSpec()
    const { fetch, calls } = trialFetch({ brief: briefFrom(dossier), set: sampleDesignSet() })
    globalThis.fetch = fetch
    const run = await runTrialGeneration({
      providerId: 'groq',
      spec,
      dossier,
      env: { PLATTR_AI_TRIAL: 'approved' },
      store: memoryTrialStore(),
    })
    expect(run.status).toBe('blocked')
    expect(run.reason).toBe('no_keys')
    expect(run.detail).toContain('GROQ_API_KEY')
    expect(run.detail).toContain('OPENROUTER_API_KEY')
    expect(run.detail).not.toContain('sk-')
    expect(calls.hosts).toHaveLength(0)
    expect(run.budget.spentUsd).toBe(0)
  })

  test('keys alone do not start a paid run', async () => {
    const { spec, dossier } = await crawlSpec()
    const { fetch, calls } = trialFetch({ brief: briefFrom(dossier), set: sampleDesignSet() })
    globalThis.fetch = fetch
    for (const approval of [undefined, 'enabled', 'yes', '']) {
      const run = await runTrialGeneration({
        providerId: 'openrouter',
        spec,
        dossier,
        env: {
          GROQ_API_KEY: GROQ_KEY,
          OPENROUTER_API_KEY: OPENROUTER_KEY,
          ...(approval ? { PLATTR_AI_TRIAL: approval } : {}),
        },
        store: memoryTrialStore(),
      })
      expect(run.status).toBe('blocked')
      expect(run.reason).toBe('not_approved')
      expect(run.detail).toContain('PLATTR_AI_TRIAL=approved')
    }
    expect(calls.hosts).toHaveLength(0)
  })

  test('a comparison needs both keys; one key alone is refused before any call', async () => {
    const { spec, dossier } = await crawlSpec()
    const { fetch, calls } = trialFetch({ brief: briefFrom(dossier), set: sampleDesignSet() })
    globalThis.fetch = fetch
    const run = await runTrialGeneration({
      providerId: 'groq',
      spec,
      dossier,
      env: { GROQ_API_KEY: GROQ_KEY, PLATTR_AI_TRIAL: 'approved' },
      store: memoryTrialStore(),
    })
    expect(run.status).toBe('blocked')
    expect(run.reason).toBe('no_keys')
    expect(run.detail).toContain('OPENROUTER_API_KEY')
    expect(run.detail).not.toContain('GROQ_API_KEY,')
    expect(calls.hosts).toHaveLength(0)
  })

  test('the gate reports variable names, never values', () => {
    expect(trialStatus({})).toEqual({
      available: false,
      reason: 'not_approved',
      missing: ['GROQ_API_KEY', 'OPENROUTER_API_KEY', 'PLATTR_AI_TRIAL=approved'],
    })
    expect(trialStatus({ GROQ_API_KEY: GROQ_KEY, OPENROUTER_API_KEY: OPENROUTER_KEY })).toEqual({
      available: false,
      reason: 'not_approved',
      missing: ['PLATTR_AI_TRIAL=approved'],
    })
    expect(JSON.stringify(trialStatus(trialEnv()))).not.toContain(GROQ_KEY)
    expect(JSON.stringify(trialStatus(trialEnv()))).not.toContain(OPENROUTER_KEY)
  })
})

describe('Groq and OpenRouter run the same generation', () => {
  test('each side contacts only its own gateway with its own key and the same model', async () => {
    const { spec, dossier } = await crawlSpec()
    const brief = briefFrom(dossier)
    const set = sampleDesignSet()
    for (const provider of TRIAL_PROVIDERS) {
      const { fetch, calls } = trialFetch({ brief, set })
      globalThis.fetch = fetch
      const run = await runTrialGeneration({
        providerId: provider.id,
        spec,
        dossier,
        env: trialEnv(),
        store: memoryTrialStore(),
      })
      expect(run.status).toBe('ai')
      expect(run.provider).toBe(provider.id)
      expect(run.model).toBe('openai/gpt-oss-120b')
      expect(new Set(calls.hosts)).toEqual(
        new Set([provider.gateway === 'groq' ? 'api.groq.com' : 'openrouter.ai']),
      )
      for (const body of calls.bodies) expect(JSON.parse(body).model).toBe(provider.model)
      // Each gateway is given its own key and only its own key.
      const expected = provider.gateway === 'groq' ? GROQ_KEY : OPENROUTER_KEY
      expect(calls.auth.every((header) => header === `Bearer ${expected}`)).toBe(true)
      expect(run.concepts).toHaveLength(3)
      expect(run.latencyMs).toBeGreaterThanOrEqual(0)
      expect(run.calls.every((call) => call.reservedUsd > 0)).toBe(true)
      // Every arm records the endpoint that answered, not just the one asked for.
      expect(run.servedProviders).toEqual([provider.gateway === 'groq' ? 'groq' : 'Groq'])
      expect(run.attempts).toHaveLength(3)
      expect(run.verification.chargedUsd).toBeCloseTo(run.costUsd, 9)
      expect(run.verification.withinHardCap).toBe(true)
      expect(run.verification.chargedWithinReservation).toBe(true)
    }
  })

  test('Groq is priced from its published rate; OpenRouter from the reported charge', async () => {
    const { spec, dossier } = await crawlSpec()
    const brief = briefFrom(dossier)
    const set = sampleDesignSet()
    const groq = trialFetch({ brief, set })
    globalThis.fetch = groq.fetch
    const groqRun = await runTrialGeneration({
      providerId: 'groq',
      spec,
      dossier,
      env: trialEnv(),
      store: memoryTrialStore(),
    })
    // 1,000 input + 500 output at $0.15 / $0.60 per 1M, three calls.
    const perCall = 1_000 * GROQ_PRICE.input + 500 * GROQ_PRICE.output
    expect(groqRun.status).toBe('ai')
    expect(groqRun.costUsd).toBeCloseTo(perCall * 3, 9)
    expect(groqRun.calls.every((call) => call.reportedCostUsd === undefined)).toBe(true)

    const routed = trialFetch({ brief, set, cost: { understand: 0.0031, design: 0.0427, copy: 0.0022 } })
    globalThis.fetch = routed.fetch
    const routedRun = await runTrialGeneration({
      providerId: 'openrouter',
      spec,
      dossier,
      env: trialEnv(),
      store: memoryTrialStore(),
    })
    expect(routedRun.status).toBe('ai')
    expect(routedRun.costUsd).toBeCloseTo(0.048, 6)
    expect(routedRun.calls.every((call) => call.reportedCostUsd !== undefined)).toBe(true)
    // The two gateways are not priced from one shared table.
    expect(OPENROUTER_PRICE.output).not.toBe(GROQ_PRICE.output)
  })
})

describe('the trial budget is a ceiling, not a target', () => {
  test('the $30 pool is claimed atomically and refuses the generation that would cross it', async () => {
    const store = memoryTrialStore()
    const outcomes: boolean[] = []
    for (let index = 0; index < 8; index += 1) {
      outcomes.push(await store.claim(TRIAL_ID, 5, TRIAL_LIMITS.totalUsd, new Date()))
    }
    expect(outcomes).toEqual([true, true, true, true, true, true, false, false])
    const spend = await store.read(TRIAL_ID, TRIAL_LIMITS.totalUsd)
    expect(spend.reservedUsd).toBeCloseTo(30, 6)
    expect(spend.remainingUsd).toBe(0)

    await store.settle(TRIAL_ID, 5, 0.4, new Date())
    expect((await store.read(TRIAL_ID, TRIAL_LIMITS.totalUsd)).remainingUsd).toBeCloseTo(4.6, 6)
    expect(await store.claim(TRIAL_ID, 4.5, TRIAL_LIMITS.totalUsd, new Date())).toBe(true)
  })

  test('an exhausted pool refuses before the provider exists', async () => {
    const { spec, dossier } = await crawlSpec()
    const store = memoryTrialStore()
    for (let index = 0; index < 6; index += 1) {
      expect(await store.claim(TRIAL_ID, 5, TRIAL_LIMITS.totalUsd, new Date())).toBe(true)
    }
    await store.settle(TRIAL_ID, 30, 29.7, new Date())

    const { fetch, calls } = trialFetch({ brief: briefFrom(dossier), set: sampleDesignSet() })
    globalThis.fetch = fetch
    const run = await runTrialGeneration({
      providerId: 'openrouter',
      spec,
      dossier,
      env: trialEnv(),
      store,
    })
    expect(run.status).toBe('over_budget')
    expect(run.reason).toBe('trial_pool_exhausted')
    expect(calls.hosts).toHaveLength(0)
    expect(run.budget.spentUsd).toBeCloseTo(29.7, 6)
  })

  test('a single generation cannot spend past its $0.40 hard limit', async () => {
    const { spec, dossier } = await crawlSpec()
    const { fetch, calls } = trialFetch({
      brief: briefFrom(dossier),
      set: sampleDesignSet(),
      cost: { understand: 0.41 },
    })
    globalThis.fetch = fetch
    const run = await runTrialGeneration({
      providerId: 'openrouter',
      spec,
      dossier,
      env: trialEnv(),
      store: memoryTrialStore(),
    })
    expect(run.status).toBe('over_budget')
    expect(calls.stages).toEqual(['understand'])
    expect(run.costUsd).toBeCloseTo(0.41, 6)
  })

  test('the $0.18 soft limit keeps the design and skips the copy pass', async () => {
    const { spec, dossier } = await crawlSpec()
    const { fetch, calls } = trialFetch({
      brief: briefFrom(dossier),
      set: sampleDesignSet(),
      cost: { understand: 0.19, design: 0.02 },
    })
    globalThis.fetch = fetch
    const run = await runTrialGeneration({
      providerId: 'openrouter',
      spec,
      dossier,
      env: trialEnv(),
      store: memoryTrialStore(),
    })
    expect(run.status).toBe('ai')
    expect(run.softLimitReached).toBe(true)
    expect(calls.stages).toEqual(['understand', 'design'])
    expect(run.issues.some((issue) => issue.code === 'soft_limit')).toBe(true)
    expect(run.concepts).toHaveLength(3)
  })
})

describe('three concepts, not three palettes', () => {
  test('a set that only changes colours is refused as not distinct', async () => {
    const { spec, dossier } = await crawlSpec()
    const original = sampleDesignSet()
    const base = original.concepts[0]
    const paletteOnly: DesignSet = {
      ...original,
      concepts: [
        base,
        { ...base, id: 'variant-b', palette: { ...base.palette, accent: '#1f5f8b' } },
        { ...base, id: 'variant-c', palette: { ...base.palette, accent: '#7a2f3a' } },
      ],
    }
    const { fetch, calls } = trialFetch({
      brief: briefFrom(dossier),
      set: sampleDesignSet(),
      designSet: paletteOnly,
    })
    globalThis.fetch = fetch
    const run = await runTrialGeneration({
      providerId: 'groq',
      spec,
      dossier,
      env: trialEnv(),
      store: memoryTrialStore(),
    })
    expect(run.status).toBe('failed')
    expect(run.reason).toBe('design_invalid')
    expect(run.issues.some((issue) => issue.code === 'concepts_not_distinct')).toBe(true)
    expect(run.issues.some((issue) => issue.message.includes('share one type pairing'))).toBe(true)
    expect(run.concepts).toHaveLength(0)
    expect(calls.stages).toEqual(['understand', 'design'])
  })

  test('the accepted set carries three different structures into the documents', async () => {
    const { spec, dossier } = await crawlSpec()
    const { fetch } = trialFetch({ brief: briefFrom(dossier), set: sampleDesignSet() })
    globalThis.fetch = fetch
    const run = await runTrialGeneration({
      providerId: 'groq',
      spec,
      dossier,
      env: trialEnv(),
      store: memoryTrialStore(),
    })
    expect(run.status).toBe('ai')
    const signatures = run.concepts.map((concept) => JSON.stringify(concept.signature))
    expect(new Set(signatures).size).toBe(3)
    for (const concept of run.concepts) expect(concept.doc.screens.length).toBeGreaterThan(0)
  })
})

describe('the keys never leave the process', () => {
  test('neither key appears in a request body, an issue or a result', async () => {
    const { spec, dossier } = await crawlSpec()
    const { fetch, calls } = trialFetch({ brief: briefFrom(dossier), set: sampleDesignSet() })
    globalThis.fetch = fetch
    const run = await runTrialGeneration({
      providerId: 'openrouter',
      spec,
      dossier,
      env: trialEnv(),
      store: memoryTrialStore(),
    })
    expect(run.status).toBe('ai')
    for (const body of calls.bodies) {
      expect(body).not.toContain(OPENROUTER_KEY)
      expect(body).not.toContain(GROQ_KEY)
    }
    const result = JSON.stringify(run)
    expect(result).not.toContain(OPENROUTER_KEY)
    expect(result).not.toContain(GROQ_KEY)
  })
})

describe('the brief keeps facts and assumptions apart', () => {
  test('an assumption may not restate a price or a claim as fact', async () => {
    const { dossier } = await crawlSpec()
    const brief = briefFrom(dossier)
    brief.assumptions = [
      { claim: 'Rings start at ₹2,499', basis: 'guess', why: 'typical for the category' },
      { claim: 'Most customers buy gifts', basis: 'inference', why: 'copy mentions gifting' },
    ]
    const result = parseBrief(brief, dossier)
    expect(result.value).not.toBeNull()
    const issues = result.issues.filter((issue) => issue.code === 'invented_assumption')
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toContain('₹2,499')
    expect(brief.assumptions[1].claim).toBe('Most customers buy gifts')
  })
})

describe('concept navigation reaches the document in every trade', () => {
  test('a restaurant and a practice compile three different journeys, not one shell', async () => {
    const { compileConcept } = await import('../src/worker/ai/compile')
    const { validateConcepts } = await import('../src/worker/blueprints')
    const { trialBusinesses, briefFor, designSetFor } = await import('./aiTrialFixtures')
    const businesses = (await trialBusinesses()).filter((business) => business.id !== 'geestores')
    expect(businesses).toHaveLength(2)
    for (const business of businesses) {
      const brief = briefFor(business.dossier)
      const set = designSetFor(business.dossier, brief, business.spec)
      const docs = set.concepts.map((concept) => ({
        id: concept.id,
        doc: compileConcept({ spec: business.spec, brief, concept }).doc,
      }))
      const diversity = validateConcepts(business.spec, docs)
      expect(diversity.ok).toBe(true)
      expect(new Set(docs.map((entry) => entry.doc.initialScreen)).size).toBeGreaterThan(1)
      expect(new Set(docs.map((entry) => entry.doc.design?.nav)).size).toBe(3)
    }
  })
})

describe('the trial schema cannot drift from its migration', () => {
  test('the migration and TRIAL_SCHEMA_SQL create the same table', () => {
    const migration = readFileSync(
      new URL('../migrations/0002_ai_trial_spend.sql', import.meta.url).pathname,
      'utf8',
    )
    const migrated = new Database(':memory:')
    migrated.exec(migration)
    const runtime = new Database(':memory:')
    runtime.exec(TRIAL_SCHEMA_SQL)
    const columns = (db: Database) =>
      db
        .prepare("SELECT name FROM pragma_table_info('ai_trial_spend') ORDER BY cid")
        .all()
        .map((row) => (row as { name: string }).name)
    expect(columns(migrated)).toEqual(columns(runtime))
    expect(columns(migrated)).toEqual([
      'trial_id',
      'reserved_micros',
      'spent_micros',
      'generations',
      'updated_at',
    ])
    expect(TRIAL_CLAIM_SQL).toContain('ON CONFLICT(trial_id) DO UPDATE')
    expect(TRIAL_CLAIM_SQL).toContain('<= ?')
  })
})

describe('an uncertain charge keeps its reservation', () => {
  /** A provider that always fails with the given error, for the guard path. */
  const failingProvider = (makeError: () => ProviderError): AiProvider => ({
    name: 'groq',
    modelFor: () => 'openai/gpt-oss-120b',
    priceFor: () => GROQ_PRICE,
    reservationPriceFor: () => GROQ_PRICE,
    generate: async () => {
      throw makeError()
    },
  })

  const failWith = async (error: ProviderError) => {
    const { spec, dossier } = await crawlSpec()
    const ledger = createLedger(TRIAL_LIMITS.hardUsd)
    let thrown: unknown
    try {
      await runDesignPipeline({
        provider: failingProvider(() => error),
        dossier,
        spec,
        ledger,
      })
    } catch (caught) {
      thrown = caught
    }
    return { ledger, thrown }
  }

  test('a timeout is retried and both attempts keep their reservation', async () => {
    const { ledger, thrown } = await failWith(
      new ProviderError('timeout', 'Groq did not answer within 300000ms.', { retryable: true }),
    )
    const attempts = (thrown as { attemptsSpent?: { reservedUsd: number; retainedUsd: number; billing: string; costUsd: number }[] })
      .attemptsSpent ?? []
    // One retry: the first uncertain attempt cannot disappear from the budget.
    expect(attempts).toHaveLength(2)
    expect(attempts.every((attempt) => attempt.billing === 'unknown')).toBe(true)
    expect(attempts.every((attempt) => attempt.retainedUsd === attempt.reservedUsd)).toBe(true)
    expect(attempts.every((attempt) => attempt.costUsd === 0)).toBe(true)
    expect(ledger.reservedUsd()).toBe(0)
    expect(ledger.spentUsd()).toBeCloseTo(
      attempts.reduce((total, attempt) => total + attempt.reservedUsd, 0),
      9,
    )
  })

  test('a dropped connection is also unknown, not free', async () => {
    const { ledger, thrown } = await failWith(
      new ProviderError('transport', 'Groq could not be reached (socket closed).', { retryable: true }),
    )
    const attempts = (thrown as { attemptsSpent?: { retainedUsd: number }[] }).attemptsSpent ?? []
    expect(attempts).toHaveLength(2)
    expect(ledger.spentUsd()).toBeGreaterThan(0)
    expect(ledger.retainedUsd()).toBeCloseTo(
      attempts.reduce((total, attempt) => total + attempt.retainedUsd, 0),
      9,
    )
  })

  test('a confirmed rejection before inference releases the reservation', async () => {
    const { ledger, thrown } = await failWith(
      new ProviderError('http', 'invalid request', {
        status: 400,
        retryable: false,
        billing: 'not_billed',
      }),
    )
    const attempts = (thrown as { attemptsSpent?: { billing: string; retainedUsd: number }[] })
      .attemptsSpent ?? []
    expect(attempts).toHaveLength(1)
    expect(attempts[0].billing).toBe('not_billed')
    expect(attempts[0].retainedUsd).toBe(0)
    expect(ledger.spentUsd()).toBe(0)
    expect(ledger.reservedUsd()).toBe(0)
  })

  test('a 4xx without billing information is uncertain, not free', async () => {
    const { ledger, thrown } = await failWith(
      new ProviderError('http', 'OpenRouter returned 400', { status: 400, retryable: false }),
    )
    const attempts = (thrown as { attemptsSpent?: { billing: string; retainedUsd: number }[] })
      .attemptsSpent ?? []
    expect(attempts).toHaveLength(1)
    expect(attempts[0].billing).toBe('unknown')
    expect(attempts[0].retainedUsd).toBeGreaterThan(0)
    expect(ledger.spentUsd()).toBeGreaterThan(0)
  })

  test('an attempt with no billing classification is unknown and retained', async () => {
    const { spec, dossier } = await crawlSpec()
    const store = memoryTrialStore()
    const provider: AiProvider = {
      name: 'groq',
      modelFor: () => 'openai/gpt-oss-120b',
      priceFor: () => GROQ_PRICE,
      reservationPriceFor: () => GROQ_PRICE,
      generate: async () => {
        // A failure outside the provider error type: no billing classification.
        throw new Error('socket reset before billing could be read')
      },
    }
    const run = await runTrialGeneration({
      providerId: 'groq',
      spec,
      dossier,
      env: trialEnv(),
      store,
      provider,
    })
    expect(run.status).toBe('failed')
    expect(run.reason).toBe('generation_failed')
    expect(run.attempts).toHaveLength(1)
    expect(run.attempts[0].billing).toBe('unknown')
    expect(run.attempts[0].retainedUsd).toBeGreaterThan(0)
    expect(run.attempts[0].costUsd).toBe(0)
    expect(run.verification.uncertainAttempts).toBe(1)
    expect(run.verification.retainedUsd).toBeGreaterThan(0)
    expect(run.verification.chargedUsd).toBe(0)
    expect(run.verification.accountedUsd).toBeCloseTo(run.verification.retainedUsd, 9)
    expect(run.costUsd).toBeCloseTo(run.verification.accountedUsd, 9)
    // The persistent pool keeps the reservation instead of refunding it.
    const pool = await store.read(TRIAL_ID, TRIAL_LIMITS.totalUsd)
    expect(pool.spentUsd).toBeCloseTo(run.verification.accountedUsd, 9)
    expect(pool.remainingUsd).toBeCloseTo(TRIAL_LIMITS.totalUsd - pool.spentUsd, 9)
  })

  test('a 5xx after inference is charged when the body reports usage.cost', async () => {
    const { spec, dossier } = await crawlSpec()
    const { fetch, calls } = trialFetch({
      brief: briefFrom(dossier),
      set: sampleDesignSet(),
      failOnceWithCost: { stage: 'understand', status: 503, cost: 0.004 },
    })
    globalThis.fetch = fetch
    const run = await runTrialGeneration({
      providerId: 'openrouter',
      spec,
      dossier,
      env: trialEnv(),
      store: memoryTrialStore(),
    })
    expect(run.status).toBe('ai')
    expect(calls.stages).toEqual(['understand', 'understand', 'design', 'copy'])
    expect(run.attempts).toHaveLength(4)
    expect(run.attempts[0].billing).toBe('billed')
    expect(run.attempts[0].costUsd).toBeCloseTo(0.004, 9)
    expect(run.attempts[0].retainedUsd).toBe(0)
    expect(run.verification.chargedUsd).toBeGreaterThanOrEqual(0.004)
  })

  test('usage without choices is charged before the parse failure', async () => {
    const { spec, dossier } = await crawlSpec()
    const { fetch } = trialFetch({
      brief: briefFrom(dossier),
      set: sampleDesignSet(),
      noChoices: 'understand',
      cost: { understand: 0.006 },
    })
    globalThis.fetch = fetch
    const run = await runTrialGeneration({
      providerId: 'openrouter',
      spec,
      dossier,
      env: trialEnv(),
      store: memoryTrialStore(),
    })
    expect(run.status).toBe('failed')
    expect(run.reason).toBe('parse')
    expect(run.attempts).toHaveLength(1)
    expect(run.attempts[0].billing).toBe('billed')
    expect(run.attempts[0].costUsd).toBeCloseTo(0.006, 9)
    expect(run.verification.chargedUsd).toBeCloseTo(0.006, 9)
    expect(run.verification.retainedUsd).toBe(0)
  })

  test('a response with no usage at all retains the reservation and stays visible', async () => {
    const { spec, dossier } = await crawlSpec()
    const { fetch } = trialFetch({
      brief: briefFrom(dossier),
      set: sampleDesignSet(),
      omitUsage: 'understand',
      cost: { design: 0.002, copy: 0.001 },
    })
    globalThis.fetch = fetch
    const run = await runTrialGeneration({
      providerId: 'openrouter',
      spec,
      dossier,
      env: trialEnv(),
      store: memoryTrialStore(),
    })
    expect(run.status).toBe('ai')
    expect(run.attempts[0].billing).toBe('unknown')
    expect(run.attempts[0].costUsd).toBe(0)
    expect(run.attempts[0].retainedUsd).toBeGreaterThan(0)
    expect(run.verification.uncertainAttempts).toBe(1)
    expect(run.verification.retainedUsd).toBeGreaterThan(0)
    expect(run.verification.accountedUsd).toBeCloseTo(
      run.verification.chargedUsd + run.verification.retainedUsd,
      9,
    )
    expect(run.verification.withinHardCap).toBe(true)
  })
})

describe('the catalogue has two primary arms and one controlled arm', () => {
  test('each arm pins the same model and carries a verified price', () => {
    expect(TRIAL_PROVIDERS.map((provider) => provider.id)).toEqual([
      'groq',
      'openrouter',
      'openrouter-groq',
    ])
    for (const provider of TRIAL_PROVIDERS) expect(provider.model).toBe('openai/gpt-oss-120b')
    const groq = trialProviderById('groq')!
    expect(groq.price.input * 1_000_000).toBeCloseTo(0.15, 6)
    expect(groq.price.output * 1_000_000).toBeCloseTo(0.6, 6)
    const router = trialProviderById('openrouter')!
    expect(router.arm).toBe('primary')
    expect(router.routing?.sort).toBe('price')
    expect(router.routing?.allowFallbacks).toBe(true)
    expect(router.reservationPrice.output).toBeGreaterThanOrEqual(router.price.output)
    expect(router.pricing).toContain('2026-11-23')
    // The control is the same gateway and model, pinned to one endpoint.
    const pinned = trialProviderById('openrouter-groq')!
    expect(pinned.arm).toBe('controlled')
    expect(pinned.gateway).toBe('openrouter')
    expect(pinned.routing?.only).toEqual(['Groq'])
    expect(pinned.routing?.allowFallbacks).toBe(false)
    expect(pinned.expectedProvider).toBe('Groq')
    expect(pinned.price).toEqual(GROQ_PRICE)
  })

  test('the pinned arm asks OpenRouter for Groq only, with fallbacks disabled', async () => {
    const { spec, dossier } = await crawlSpec()
    const { fetch, calls } = trialFetch({ brief: briefFrom(dossier), set: sampleDesignSet() })
    globalThis.fetch = fetch
    const run = await runTrialGeneration({
      providerId: 'openrouter-groq',
      spec,
      dossier,
      env: trialEnv(),
      store: memoryTrialStore(),
    })
    expect(run.status).toBe('ai')
    for (const raw of calls.bodies) {
      const body = JSON.parse(raw) as { provider: Record<string, unknown> }
      expect(body.provider.only).toEqual(['Groq'])
      expect(body.provider.allow_fallbacks).toBe(false)
      expect(body.provider).not.toHaveProperty('sort')
    }
  })

  test('a pinned call served by another endpoint is refused and still charged', async () => {
    const { spec, dossier } = await crawlSpec()
    const { fetch, calls } = trialFetch({
      brief: briefFrom(dossier),
      set: sampleDesignSet(),
      served: 'DeepInfra',
      cost: { understand: 0.012 },
    })
    globalThis.fetch = fetch
    const run = await runTrialGeneration({
      providerId: 'openrouter-groq',
      spec,
      dossier,
      env: trialEnv(),
      store: memoryTrialStore(),
    })
    expect(run.status).toBe('failed')
    expect(run.reason).toBe('provider_mismatch')
    expect(calls.stages).toEqual(['understand'])
    // The wrong-endpoint answer is recorded, not silently attributed to Groq.
    expect(run.servedProviders).toEqual(['DeepInfra'])
    expect(run.attempts).toHaveLength(1)
    expect(run.attempts[0].costUsd).toBeCloseTo(0.012, 9)
    expect(run.verification.chargedUsd).toBeCloseTo(0.012, 9)
    expect(run.verification.withinHardCap).toBe(true)
  })
})

describe('every attempt is reconciled against its reservation and the cap', () => {
  test('a billed failure is charged, counted, and stays inside the hard cap', async () => {
    const { spec, dossier } = await crawlSpec()
    const { fetch, calls } = trialFetch({
      brief: briefFrom(dossier),
      set: sampleDesignSet(),
      truncate: 'design',
      cost: { understand: 0.002, design: 0.008 },
    })
    globalThis.fetch = fetch
    const run = await runTrialGeneration({
      providerId: 'openrouter',
      spec,
      dossier,
      env: trialEnv(),
      store: memoryTrialStore(),
    })
    expect(run.status).toBe('failed')
    expect(run.reason).toBe('truncated')
    expect(calls.stages).toEqual(['understand', 'design'])
    // The failed design attempt is in the record and in the charge.
    expect(run.attempts).toHaveLength(2)
    expect(run.attempts[1].ok).toBe(false)
    expect(run.attempts[1].costUsd).toBeCloseTo(0.008, 9)
    expect(run.costUsd).toBeCloseTo(0.01, 9)
    expect(run.verification.chargedUsd).toBeCloseTo(0.01, 9)
    expect(run.verification.chargedWithinReservation).toBe(true)
    expect(run.verification.withinHardCap).toBe(true)
  })

  test('a retried attempt reserves twice and is reported as retried', async () => {
    const { spec, dossier } = await crawlSpec()
    const { fetch, calls } = trialFetch({
      brief: briefFrom(dossier),
      set: sampleDesignSet(),
      failOnce: 'design',
    })
    globalThis.fetch = fetch
    const run = await runTrialGeneration({
      providerId: 'openrouter',
      spec,
      dossier,
      env: trialEnv(),
      store: memoryTrialStore(),
    })
    expect(run.status).toBe('ai')
    expect(calls.stages).toEqual(['understand', 'design', 'design', 'copy'])
    // Three calls, four attempts: the failed attempt has its own reservation.
    expect(run.calls).toHaveLength(3)
    expect(run.attempts).toHaveLength(4)
    expect(run.verification.retried).toBe(true)
    expect(run.verification.reservedUsd).toBeGreaterThan(
      run.verification.chargedUsd,
    )
    expect(run.verification.withinHardCap).toBe(true)
    expect(run.verification.chargedWithinReservation).toBe(true)
  })

  test('a successful retry settles the pool with the retained attempt too', async () => {
    const { spec, dossier } = await crawlSpec()
    const { fetch, calls } = trialFetch({
      brief: briefFrom(dossier),
      set: sampleDesignSet(),
      failOnce: 'design',
    })
    globalThis.fetch = fetch
    const store = memoryTrialStore()
    const run = await runTrialGeneration({
      providerId: 'openrouter',
      spec,
      dossier,
      env: trialEnv(),
      store,
    })
    expect(run.status).toBe('ai')
    expect(calls.stages).toEqual(['understand', 'design', 'design', 'copy'])
    const uncertain = run.attempts.find((attempt) => attempt.billing === 'unknown')
    expect(uncertain?.retainedUsd).toBeGreaterThan(0)
    expect(run.verification.retainedUsd).toBeGreaterThan(0)
    expect(run.verification.accountedUsd).toBeCloseTo(
      run.verification.chargedUsd + run.verification.retainedUsd,
      9,
    )
    // The run's cost and the persistent pool both carry the retained reservation.
    expect(run.costUsd).toBeCloseTo(run.verification.accountedUsd, 9)
    const pool = await store.read(TRIAL_ID, TRIAL_LIMITS.totalUsd)
    expect(pool.spentUsd).toBeCloseTo(run.verification.accountedUsd, 9)
    expect(pool.spentUsd).toBeGreaterThan(run.verification.chargedUsd)
    expect(pool.remainingUsd).toBeCloseTo(TRIAL_LIMITS.totalUsd - pool.spentUsd, 9)
  })

  test('a run with no uncertain attempts keeps normal accounting unchanged', async () => {
    const { spec, dossier } = await crawlSpec()
    const { fetch } = trialFetch({ brief: briefFrom(dossier), set: sampleDesignSet() })
    globalThis.fetch = fetch
    const store = memoryTrialStore()
    const run = await runTrialGeneration({
      providerId: 'openrouter',
      spec,
      dossier,
      env: trialEnv(),
      store,
    })
    expect(run.status).toBe('ai')
    expect(run.verification.retainedUsd).toBe(0)
    expect(run.verification.uncertainAttempts).toBe(0)
    expect(run.verification.accountedUsd).toBeCloseTo(run.verification.chargedUsd, 9)
    expect(run.costUsd).toBeCloseTo(run.verification.chargedUsd, 9)
    expect(run.costUsd).toBeCloseTo(
      run.calls.reduce((total, call) => total + call.costUsd, 0),
      9,
    )
    const pool = await store.read(TRIAL_ID, TRIAL_LIMITS.totalUsd)
    expect(pool.spentUsd).toBeCloseTo(run.verification.chargedUsd, 9)
    expect(pool.remainingUsd).toBeCloseTo(TRIAL_LIMITS.totalUsd - pool.spentUsd, 9)
  })
})
