import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { renderApp } from '../src/worker/app'
import { structureOf } from '../src/worker/blueprints'
import {
  compileConcept,
  CompileError,
} from '../src/worker/ai/compile'
import {
  BusinessBriefSchema,
  DesignSetSchema,
  jsonSchemaOf,
  type BusinessBrief,
  type DesignSet,
} from '../src/worker/ai/contracts'
import type { Dossier } from '../src/worker/ai/dossier'
import { createLedger } from '../src/worker/ai/ledger'
import { PipelineError, runDesignPipeline } from '../src/worker/ai/pipeline'
import {
  costUsd,
  estimateMaxUsd,
  openRouterCashUsd,
  openRouterCreditFeeUsd,
  openRouterInferenceBudgetUsd,
} from '../src/worker/ai/pricing'
import {
  anthropicProvider,
  generateWithRetry,
  groqProvider,
  openaiProvider,
  openRouterProvider,
  type AiProvider,
} from '../src/worker/ai/provider'
import { ZERO_COST_REQUIRED_KEYS, ZERO_COST_ROUTES, providerForRoute } from '../src/worker/ai/routes'
import { createQuotaLedger, memoryQuotaStore } from '../src/worker/ai/quotas'
import { isFreeModel, PaidRequestRefused } from '../src/worker/ai/zeroCost'
import { claimRisk, fatal, parseBrief, parseDesignSet } from '../src/worker/ai/validate'
import { docFromSpec, flagshipDocFromSpec, normalizeDoc } from '../src/worker/doc'
import { buildSpec } from '../src/worker/pricing'

const sample = JSON.parse(
  readFileSync(new URL('../docs/p1-ai-proposal/geestores.design-set.json', import.meta.url).pathname, 'utf8'),
) as DesignSet

const dossier: Dossier = {
  kind: 'url',
  business: {
    name: 'GeeStores',
    category: 'Jewellery shop',
    trade: 'shop',
    tagline: '',
    story: '',
    hours: '',
    address: '',
    phone: '',
    email: '',
  },
  catalogue: { entries: 101, priced: 101, withPhotograph: 71, currency: 'INR', sections: [] },
  facts: [
    { id: 'name', label: 'Business name', value: 'GeeStores', source: 'json-ld:name', confidence: 'verified' },
  ],
  quotes: [{ text: 'Jewellery shop', source: 'visible-text:business category' }],
  workflows: ['browse', 'buy'],
  allowedScreens: ['home', 'catalog', 'search', 'more', 'detail'],
  sample: false,
}

const brief: BusinessBrief = {
  identity: {
    name: 'GeeStores',
    trade: 'shop',
    category: 'Jewellery shop',
    summary: 'A jewellery shop selling priced pieces from an online catalogue in India.',
    nameConfidence: 'verified',
  },
  audience: { primary: 'Gift buyers', secondary: [], confidence: 'guess' },
  offer: {
    currency: 'INR',
    catalogueEntries: 101,
    entriesWithPhotograph: 71,
    workflows: [
      { id: 'browse', available: true, why: '101 entries' },
      { id: 'buy', available: true, why: 'checkout present' },
    ],
  },
  brand: { personality: ['ceremonial', 'ornate'], formality: 'formal', energy: 'calm' },
  vocabulary: { catalog: 'Collection', item: 'Piece', buy: 'Add to bag', enquire: 'Ask about this piece' },
  constraints: { mustNotInvent: ['prices', 'materials'] },
  assumptions: [],
  questions: [{ id: 'q1', question: 'Who buys most often?', why: 'decides the hierarchy', skippable: true }],
}

const spec = buildSpec({
  name: 'GeeStores',
  vertical: 'shop',
  accent: '#b8863f',
  logo: 'GS',
  features: ['catalog', 'ordering'],
  category: 'Jewellery shop',
  site: {
    menu: [
      { name: 'Rings', items: [{ name: 'Gold band', desc: '', price: 249900 }, { name: 'Stone ring', desc: '', price: 189900 }] },
      { name: 'Necklaces', items: [{ name: 'Chain', desc: '', price: 129900 }] },
      { name: 'Earrings', items: [{ name: 'Studs', desc: '', price: 89900 }] },
    ],
  },
})

describe('design contracts', () => {
  test('the provider schema is strict, portable and has no field for a fact', () => {
    const schema = jsonSchemaOf(BusinessBriefSchema)
    expect(schema.$schema).toBeUndefined()
    expect(JSON.stringify(schema)).not.toContain('"price"')
    expect(JSON.stringify(schema)).toContain('"additionalProperties":false')
  })

  test('the GeeStores sample matches the shipping schema and validation', () => {
    expect(DesignSetSchema.safeParse(sample).success).toBe(true)
    const result = parseDesignSet(sample, dossier)
    expect(fatal(result.issues)).toEqual([])
  })
})

describe('grounding', () => {
  test('a changed business name or currency is refused', () => {
    const changed = {
      ...brief,
      identity: { ...brief.identity, name: 'Gem Palace' },
      offer: { ...brief.offer, currency: 'USD' },
    }
    const codes = fatal(parseBrief(changed, dossier).issues).map((issue) => issue.code)
    expect(codes).toContain('identity_name')
    expect(codes).toContain('currency')
  })

  test('a workflow the read did not establish is refused', () => {
    const invented = {
      ...brief,
      offer: {
        ...brief.offer,
        workflows: [{ id: 'book', available: true, why: 'assumed' }],
      },
    }
    expect(fatal(parseBrief(invented, dossier).issues).map((issue) => issue.code)).toContain('workflow')
  })

  test('a structural heading carrying a claim is refused', () => {
    const risky = structuredClone(sample)
    risky.concepts[0].content.headings = [
      { slot: 'lead', text: 'Handmade in Jaipur', basis: 'structural' },
    ]
    const codes = fatal(parseDesignSet(risky, dossier).issues).map((issue) => issue.code)
    expect(codes).toContain('claim_in_heading')
    expect(claimRisk('From ₹2,499')).toEqual(['number', 'currency'])
    expect(claimRisk('See every piece')).toEqual([])
  })

  test('an unreadable palette is refused', () => {
    const dark = structuredClone(sample)
    dark.concepts[0].palette.ink = dark.concepts[0].palette.bg
    const codes = fatal(parseDesignSet(dark, dossier).issues).map((issue) => issue.code)
    expect(codes).toContain('palette_contrast')
  })

  test('three concepts that differ on too few axes are refused', () => {
    const same = structuredClone(sample)
    same.concepts[1] = structuredClone(same.concepts[0])
    same.concepts[1].id = 'copy'
    const codes = fatal(parseDesignSet(same, dossier).issues).map((issue) => issue.code)
    expect(codes).toContain('concepts_not_distinct')
  })
})

describe('a concept on the document', () => {
  test('compiles, sanitises, survives reload and renders its own palette', () => {
    const compiled = compileConcept({ spec, brief, concept: sample.concepts[0] })
    expect(compiled.doc.design?.concept?.structure.id).toBe('vault')
    expect(compiled.doc.initialScreen).toBe('scr_home')

    const reloaded = normalizeDoc(JSON.parse(JSON.stringify(compiled.doc)), compiled.spec)
    expect(reloaded.design?.concept?.tokens.palette.bg).toBe('#101110')
    expect(reloaded.design?.concept?.structure.architecture.catalog).toBe('journal')

    const structure = structureOf(compiled.spec, reloaded)
    expect(structure.concept).toBe('generated')
    expect(structure.architecture.cards).toBe('editorial')

    const html = renderApp(compiled.spec, { token: 'p1-test', live: false, doc: reloaded, flagship: true })
    expect(html).toContain('data-concept="vault"')
    expect(html).toContain('#101110')
    // The editor and the customer surface read the same document.
    const edited = renderApp(compiled.spec, {
      token: 'p1-test',
      live: false,
      doc: reloaded,
      flagship: true,
      editor: true,
    })
    expect(edited).toContain('data-concept="vault"')
    expect(edited).toContain('#101110')
  })

  test('a damaged concept is dropped whole, leaving the registered direction', () => {
    const compiled = compileConcept({ spec, brief, concept: sample.concepts[0] })
    const damaged = JSON.parse(JSON.stringify(compiled.doc))
    damaged.design.concept.tokens.palette.ink = damaged.design.concept.tokens.palette.bg
    const reloaded = normalizeDoc(damaged, compiled.spec)
    expect(reloaded.design?.concept).toBeUndefined()
    expect(reloaded.design?.direction).toBe('editorial')
  })

  test('documents written before the field keep their rendering', () => {
    const legacy = docFromSpec(spec)
    expect(legacy.design?.concept).toBeUndefined()
    const html = renderApp(spec, { token: 'legacy', live: false, doc: legacy })
    expect(html).not.toContain('data-concept="vault"')
    const flagship = flagshipDocFromSpec(spec)
    expect(structureOf(spec, flagship).concept).not.toBe('generated')
  })

  test('an unmatched block falls back to its role, and a concept with nothing to place is refused', () => {
    const byRole = structuredClone(sample.concepts[0])
    byRole.home.blocks = [
      { role: 'lead', variant: 'not-a-variant', layout: 'split' },
      { role: 'discovery', variant: 'also-not-a-variant', layout: 'list' },
      { role: 'action', variant: 'still-not-a-variant', layout: 'list' },
    ]
    const compiled = compileConcept({ spec, brief, concept: byRole })
    expect(compiled.doc.design?.concept?.structure.roleSequence).toEqual(['lead', 'discovery', 'action'])

    const empty = structuredClone(sample.concepts[0])
    empty.home.blocks = [
      { role: 'note', variant: 'one', layout: 'list' },
      { role: 'note', variant: 'two', layout: 'list' },
      { role: 'note', variant: 'three', layout: 'list' },
    ]
    expect(() => compileConcept({ spec, brief, concept: empty })).toThrow(CompileError)
  })
})

describe('spend control', () => {
  test('a reservation past the cap is refused, and settling releases the rest', () => {
    const ledger = createLedger(0.01)
    expect(ledger.reserve(0.008)).toBe(true)
    expect(ledger.reserve(0.008)).toBe(false)
    ledger.settle(0.008, 0.002)
    expect(ledger.spentUsd()).toBeCloseTo(0.002, 6)
    expect(ledger.remainingUsd()).toBeCloseTo(0.008, 6)
  })

  test('the price table bills cached input differently', () => {
    const fresh = costUsd('claude-sonnet-5-5', { inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 0 })
    const cached = costUsd('claude-sonnet-5-5', { inputTokens: 1_000_000, cachedInputTokens: 1_000_000, outputTokens: 0 })
    expect(fresh).toBeCloseTo(2, 6)
    expect(cached).toBeCloseTo(0.1, 6)
  })
})

describe('paid providers are unreachable', () => {
  const request = {
    stage: 'design' as const,
    system: 'system',
    user: 'user',
    schema: { type: 'object', properties: {}, additionalProperties: false },
    maxOutputTokens: 100,
  }

  test('Anthropic, OpenAI and OpenRouter refuse before any socket is opened', async () => {
    const original = globalThis.fetch
    let calls = 0
    globalThis.fetch = (async () => {
      calls += 1
      throw new Error('should not be called')
    }) as unknown as typeof fetch
    try {
      await expect(anthropicProvider('k').generate(request)).rejects.toBeInstanceOf(PaidRequestRefused)
      await expect(openaiProvider('k').generate(request)).rejects.toBeInstanceOf(PaidRequestRefused)
      await expect(openRouterProvider('k').generate(request)).rejects.toBeInstanceOf(PaidRequestRefused)
      expect(calls).toBe(0)
    } finally {
      globalThis.fetch = original
    }
  })
})

describe('pipeline', () => {
  const provider = (): AiProvider => {
    const stages: Record<string, unknown> = {
      understand: brief,
      design: sample,
      copy: {
        concepts: sample.concepts.map((concept) => ({
          id: concept.id,
          headings: concept.content.headings,
        })),
      },
    }
    return {
      name: 'anthropic',
      modelFor: (stage) => (stage === 'design' ? 'claude-sonnet-5-5' : 'claude-haiku-5-5'),
      async generate(request) {
        const usage = { inputTokens: 2000, cachedInputTokens: 0, outputTokens: 3000 }
        return {
          json: stages[request.stage],
          usage,
          model: request.stage === 'design' ? 'claude-sonnet-5-5' : 'claude-haiku-5-5',
          provider: 'anthropic',
          latencyMs: 1,
          requestId: 'test',
          costUsd: costUsd(request.stage === 'design' ? 'claude-sonnet-5-5' : 'claude-haiku-5-5', usage),
        }
      },
    }
  }

  test('three concepts come out, with call records and an actual cost', async () => {
    const run = await runDesignPipeline({
      provider: provider(),
      dossier,
      spec,
      ledger: createLedger(1),
    })
    expect(run.concepts).toHaveLength(3)
    expect(run.calls.map((call) => call.stage)).toEqual(['understand', 'design', 'copy'])
    expect(run.costUsd).toBeGreaterThan(0)
    expect(fatal(run.issues)).toEqual([])
  })

  test('the run refuses to start when the reservation does not fit', async () => {
    await expect(
      runDesignPipeline({ provider: provider(), dossier, spec, ledger: createLedger(0.000001) }),
    ).rejects.toBeInstanceOf(PipelineError)
  })
})

describe('gateway routes', () => {
  const schema = { type: 'object', properties: {}, additionalProperties: false }

  test('OpenRouter is refused, so no gateway request can be made', async () => {
    const original = globalThis.fetch
    let calls = 0
    globalThis.fetch = (async () => {
      calls += 1
      throw new Error('should not be called')
    }) as unknown as typeof fetch
    try {
      await expect(
        openRouterProvider('or-key').generate({
          stage: 'design',
          system: 'system',
          user: 'user',
          schema,
          maxOutputTokens: 9000,
        }),
      ).rejects.toBeInstanceOf(PaidRequestRefused)
      expect(calls).toBe(0)
    } finally {
      globalThis.fetch = original
    }
  })

  test('a 429 is retried once, a 400 is not', async () => {
    const original = globalThis.fetch
    let calls = 0
    const ok = JSON.stringify({
      id: 'gen-2',
      model: 'openai/gpt-oss-120b',
      provider: 'Groq',
      choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.000001 },
    })
    globalThis.fetch = (async () => {
      calls += 1
      if (calls === 1) {
        return new Response(JSON.stringify({ error: { message: 'slow down' } }), {
          status: 429,
          headers: { 'retry-after': '0' },
        })
      }
      return new Response(ok, { status: 200 })
    }) as unknown as typeof fetch
    try {
      const provider = groqProvider('groq-key')
      const request = { stage: 'copy' as const, system: 's', user: 'u', schema, maxOutputTokens: 100 }
      const result = await generateWithRetry(provider, request, 1)
      expect(result.json).toEqual({ ok: true })
      expect(calls).toBe(2)
    } finally {
      globalThis.fetch = original
    }

    calls = 0
    globalThis.fetch = (async () => {
      calls += 1
      return new Response(JSON.stringify({ error: { message: 'bad request' } }), { status: 400 })
    }) as unknown as typeof fetch
    try {
      await expect(
        generateWithRetry(groqProvider('groq-key'), {
          stage: 'copy',
          system: 's',
          user: 'u',
          schema,
          maxOutputTokens: 100,
        }),
      ).rejects.toThrow('bad request')
      expect(calls).toBe(1)
    } finally {
      globalThis.fetch = original
    }
  })

  test('every free route is free, constructible and key-gated', () => {
    expect(ZERO_COST_ROUTES.map((route) => route.id)).toEqual([
      'plattr-zero-cost',
      'groq-direct',
      'cloudflare-direct',
    ])
    expect(ZERO_COST_REQUIRED_KEYS).toEqual([
      'GROQ_API_KEY',
      'CLOUDFLARE_ACCOUNT_ID',
      'CLOUDFLARE_API_TOKEN',
    ])
    const env = { GROQ_API_KEY: 'k', CLOUDFLARE_ACCOUNT_ID: 'acct', CLOUDFLARE_API_TOKEN: 't' }
    const quota = createQuotaLedger(memoryQuotaStore())
    for (const route of ZERO_COST_ROUTES) {
      expect(route.billing).toBe('free')
      // The only fallback setting Plattr ever sends.
      expect(route.routing.allowFallbacks).toBe(false)
      // No key, no call: null is a normal state, not an error.
      expect(providerForRoute(route, {})).toBeNull()
      expect(providerForRoute(route, env, { quota })).not.toBeNull()
      for (const stage of Object.values(route.stages)) {
        expect(isFreeModel(stage.model)).toBe(true)
        expect(
          costUsd(stage.model, { inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 1_000_000 }),
        ).toBe(0)
      }
    }
    // A route without the shared ledger is refused rather than counted in memory.
    expect(() => providerForRoute(ZERO_COST_ROUTES[0], env)).toThrow(/shared quota ledger/)
  })

  test('the fee is 5.5% of the credit purchase and the all-in cap is enforced', () => {
    // The free route's model is priced at zero: the list price of $0.15/$0.60
    // per 1M tokens is what a paid plan would charge, and Plattr never pays it.
    expect(estimateMaxUsd('openai/gpt-oss-120b', 1_000_000, 1_000_000)).toBe(0)
    expect(estimateMaxUsd('anthropic/claude-sonnet-5.5', 1_000_000, 1_000_000)).toBeCloseTo(12, 6)
    expect(openRouterCreditFeeUsd(0)).toBe(0)
    // A fee, not a floor: $0.79 of credits costs $0.04345, not $0.80.
    expect(openRouterCreditFeeUsd(0.79)).toBeCloseTo(0.04345, 6)
    expect(openRouterCreditFeeUsd(1.59)).toBeCloseTo(0.08745, 6)
    expect(openRouterCreditFeeUsd(4)).toBeCloseTo(0.22, 6)
    expect(openRouterCreditFeeUsd(100)).toBeCloseTo(5.5, 6)
    // $30 all-in floors to $28.43 of credits and stays inside the ceiling.
    expect(openRouterInferenceBudgetUsd(30)).toBeCloseTo(28.43, 6)
    expect(openRouterCashUsd(openRouterInferenceBudgetUsd(30))).toBeLessThanOrEqual(30)
    expect(openRouterCashUsd(28.44)).toBeGreaterThan(30)
  })

  test('a retry takes its own reservation', async () => {
    const original = globalThis.fetch
    const begun: number[] = []
    let calls = 0
    globalThis.fetch = (async () => {
      calls += 1
      if (calls === 1) {
        return new Response(JSON.stringify({ error: { message: 'slow down' } }), {
          status: 429,
          headers: { 'retry-after': '0' },
        })
      }
      return new Response(
        JSON.stringify({
          id: 'gen-4',
          model: 'openai/gpt-oss-120b',
          provider: 'Groq',
          choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.000001 },
        }),
        { status: 200 },
      )
    }) as unknown as typeof fetch
    const provider = groqProvider('groq-key')
    try {
      const result = await generateWithRetry(
        provider,
        { stage: 'copy', system: 's', user: 'u', schema, maxOutputTokens: 100 },
        1,
        {
          begin: () => {
            begun.push(begun.length + 1)
          },
          end: () => undefined,
        },
      )
      expect(result.json).toEqual({ ok: true })
      expect(calls).toBe(2)
      expect(begun).toHaveLength(2)
    } finally {
      globalThis.fetch = original
    }
  })
})
