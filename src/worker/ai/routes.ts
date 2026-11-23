import type { AiModels, AiProvider, AiStage, ReasoningEffort } from './provider'
import { groqProvider, stagedProvider, workersAiProvider } from './provider'
import type { QuotaLedger } from './quotas'
import { assertZeroCost, type ZeroCostProvider } from './zeroCost'

/**
 * The free routes. This is the only place a provider or model is chosen.
 *
 * There is no paid route, no credit balance and no fallback list: a model that
 * is not on the free allowlist cannot be named here, and `providerForRoute`
 * refuses to build one. Server-side only — never imported by browser code.
 */

export type ZeroCostRouteId = 'plattr-zero-cost' | 'groq-direct' | 'cloudflare-direct'

export type StageRoute = { provider: ZeroCostProvider; model: string }

export type ZeroCostRoute = {
  id: ZeroCostRouteId
  label: string
  billing: 'free'
  stages: Record<AiStage, StageRoute>
  reasoning?: Partial<Record<AiStage, ReasoningEffort>>
  /** Billed output above the visible ceiling, reserved as headroom. */
  reasoningReserveTokens?: Partial<Record<AiStage, number>>
  /** The only fallback setting Plattr ever sends. */
  routing: { allowFallbacks: false }
  timeoutMs?: number
}

const GROQ = 'openai/gpt-oss-120b'
const CF = '@cf/openai/gpt-oss-120b'

/**
 * `plattr-zero-cost` is the shipping route: the two small stages fit Groq's
 * 8,000 tokens/minute free ceiling, the design set does not, so it runs on
 * Workers AI's 128k-context model and its daily Neuron pool.
 */
export const ZERO_COST_ROUTES: ZeroCostRoute[] = [
  {
    id: 'plattr-zero-cost',
    label: 'Groq + Cloudflare Workers AI (free tiers only)',
    billing: 'free',
    stages: {
      understand: { provider: 'groq', model: GROQ },
      design: { provider: 'cloudflare', model: CF },
      copy: { provider: 'groq', model: GROQ },
    },
    reasoning: { understand: 'low', design: 'medium', copy: 'low' },
    reasoningReserveTokens: { understand: 1000, design: 4000, copy: 1500 },
    routing: { allowFallbacks: false },
    timeoutMs: 300_000,
  },
  {
    id: 'groq-direct',
    label: 'Groq only (free plan)',
    billing: 'free',
    stages: {
      understand: { provider: 'groq', model: GROQ },
      design: { provider: 'groq', model: GROQ },
      copy: { provider: 'groq', model: GROQ },
    },
    reasoning: { understand: 'low', design: 'medium', copy: 'low' },
    reasoningReserveTokens: { understand: 1000, design: 4000, copy: 1500 },
    routing: { allowFallbacks: false },
    timeoutMs: 300_000,
  },
  {
    id: 'cloudflare-direct',
    label: 'Cloudflare Workers AI only (free allocation)',
    billing: 'free',
    stages: {
      understand: { provider: 'cloudflare', model: CF },
      design: { provider: 'cloudflare', model: CF },
      copy: { provider: 'cloudflare', model: CF },
    },
    reasoning: { understand: 'low', design: 'medium', copy: 'low' },
    reasoningReserveTokens: { understand: 1000, design: 4000, copy: 1500 },
    routing: { allowFallbacks: false },
    timeoutMs: 300_000,
  },
]

/** Every key a route needs. Absent keys mean "do nothing", never "pay". */
export const ZERO_COST_REQUIRED_KEYS = [
  'GROQ_API_KEY',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_API_TOKEN',
] as const

const STAGES: AiStage[] = ['understand', 'design', 'copy']

export function routeById(id: string): ZeroCostRoute | undefined {
  return ZERO_COST_ROUTES.find((route) => route.id === id)
}

export function routeModels(route: ZeroCostRoute): string[] {
  return Array.from(new Set(STAGES.map((stage) => route.stages[stage].model)))
}

export function routeProviders(route: ZeroCostRoute): ZeroCostProvider[] {
  return Array.from(new Set(STAGES.map((stage) => route.stages[stage].provider)))
}

export function missingKeysForRoute(
  route: ZeroCostRoute,
  env: Record<string, string | undefined>,
): string[] {
  const missing = new Set<string>()
  for (const provider of routeProviders(route)) {
    if (provider === 'groq' && !env.GROQ_API_KEY?.trim()) missing.add('GROQ_API_KEY')
    if (provider === 'cloudflare') {
      if (!env.CLOUDFLARE_ACCOUNT_ID?.trim()) missing.add('CLOUDFLARE_ACCOUNT_ID')
      if (!env.CLOUDFLARE_API_TOKEN?.trim()) missing.add('CLOUDFLARE_API_TOKEN')
    }
  }
  return [...missing]
}

/**
 * Build the provider for a route, or null when a required free key is absent.
 *
 * Null is a normal state: nothing is attempted and the product keeps its
 * deterministic fallback. A missing quota ledger is *not* normal — the guard
 * refuses to call a provider from an in-memory counter — so that throws.
 */
export function providerForRoute(
  route: ZeroCostRoute,
  env: Record<string, string | undefined>,
  options: { quota?: QuotaLedger } = {},
): AiProvider | null {
  if (missingKeysForRoute(route, env).length) return null
  const quota = options.quota
  if (!quota) {
    throw new Error(
      'A shared quota ledger is required: ZERO_COST_MODE never calls a provider from an in-memory counter.',
    )
  }

  // The guard runs at build time as well as per call, so a route edit cannot
  // introduce a paid model without failing here first.
  for (const stage of STAGES) {
    assertZeroCost({ ...route.stages[stage], routing: route.routing })
  }

  const models: AiModels = {
    understand: route.stages.understand.model,
    design: route.stages.design.model,
    copy: route.stages.copy.model,
  }
  const providers = routeProviders(route)
  const groq = providers.includes('groq')
    ? groqProvider(env.GROQ_API_KEY!.trim(), models, {
        quota,
        reasoning: route.reasoning,
        reasoningReserveTokens: route.reasoningReserveTokens,
        timeoutMs: route.timeoutMs,
      })
    : null
  const cloudflare = providers.includes('cloudflare')
    ? workersAiProvider(
        {
          accountId: env.CLOUDFLARE_ACCOUNT_ID!.trim(),
          apiToken: env.CLOUDFLARE_API_TOKEN!.trim(),
        },
        models,
        {
          quota,
          reasoning: route.reasoning,
          reasoningReserveTokens: route.reasoningReserveTokens,
          timeoutMs: route.timeoutMs,
        },
      )
    : null

  const byStage = {} as Record<AiStage, AiProvider>
  for (const stage of STAGES) {
    const stageRoute = route.stages[stage]
    const provider = stageRoute.provider === 'groq' ? groq : cloudflare
    if (!provider) throw new Error(`No provider built for ${route.id}/${stage}.`)
    byStage[stage] = provider
  }
  return providers.length === 1 ? byStage.understand : stagedProvider(byStage)
}
