/**
 * The single gate every AI provider call passes through.
 *
 * Plattr must never spend money. Not "usually", not "unless a retry is needed":
 * never. Layer 1 is the provider accounts themselves — none of them has a
 * payment method, so an overrun returns `429`/an error instead of an invoice.
 * This module is layer 2: a deny-by-default allowlist of exact provider and
 * model IDs, checked before a socket is opened.
 *
 * A paid model is not "discouraged" here, it is unreachable: there is no route,
 * no fallback list and no configuration that can name one. Gemini and
 * OpenRouter are declared as future providers and refused by name until a later
 * change is reviewed and approved.
 *
 * Server-only. Nothing in this file may be imported by browser code.
 */

/** Kept as a literal so the guard cannot be flipped by an environment variable. */
export const ZERO_COST_MODE = true

export type ZeroCostProvider = 'groq' | 'cloudflare'

/** Providers that are planned but deliberately not implemented yet. */
export const FUTURE_PROVIDERS = ['gemini', 'openrouter'] as const

/** A number no request can reach, used where a provider publishes no limit. */
export const NO_LIMIT = Number.MAX_SAFE_INTEGER

export type FreeAllowance = {
  requestsPerDay: number
  tokensPerDay: number
  requestsPerMinute: number
  tokensPerMinute: number
  /** Billed compute on Cloudflare's pool. Zero where the provider has none. */
  neuronsPerDay: number
}

export type FreeModel = {
  provider: ZeroCostProvider
  model: string
  label: string
  contextTokens: number
  maxOutputTokens: number
  structuredOutput: 'json_schema-strict'
  /** What the provider does when the free allowance is gone. */
  overrun: string
  reset: 'utc-midnight'
  limits: FreeAllowance
  /** Cloudflare bills in Neurons; Groq has no equivalent. */
  neuronsPerMillion?: { input: number; output: number }
}

const GROQ_CHAT_LIMITS: FreeAllowance = {
  requestsPerDay: 1_000,
  tokensPerDay: 200_000,
  requestsPerMinute: 30,
  tokensPerMinute: 8_000,
  neuronsPerDay: 0,
}

/**
 * Read from the published free-plan tables on 2026-11-23:
 * console.groq.com/docs/rate-limits and developers.cloudflare.com/workers-ai.
 * They are the guard's copy of the quota, not a substitute for the provider's
 * own meter — the quota ledger settles against reported usage.
 */
export const FREE_MODELS: FreeModel[] = [
  {
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    label: 'Groq GPT-OSS 120B (free plan)',
    contextTokens: 131_072,
    maxOutputTokens: 65_536,
    structuredOutput: 'json_schema-strict',
    overrun: '429 rate limit; no charge, quota refills',
    reset: 'utc-midnight',
    limits: GROQ_CHAT_LIMITS,
  },
  {
    provider: 'groq',
    model: 'openai/gpt-oss-20b',
    label: 'Groq GPT-OSS 20B (free plan)',
    contextTokens: 131_072,
    maxOutputTokens: 65_536,
    structuredOutput: 'json_schema-strict',
    overrun: '429 rate limit; no charge, quota refills',
    reset: 'utc-midnight',
    limits: GROQ_CHAT_LIMITS,
  },
  {
    provider: 'groq',
    model: 'qwen/qwen3.8-27b',
    label: 'Groq Qwen 3.8 27B (free plan)',
    contextTokens: 131_072,
    maxOutputTokens: 65_536,
    structuredOutput: 'json_schema-strict',
    overrun: '429 rate limit; no charge, quota refills',
    reset: 'utc-midnight',
    limits: GROQ_CHAT_LIMITS,
  },
  {
    provider: 'cloudflare',
    model: '@cf/openai/gpt-oss-120b',
    label: 'Cloudflare Workers AI GPT-OSS 120B (free allocation)',
    contextTokens: 128_000,
    maxOutputTokens: 65_536,
    structuredOutput: 'json_schema-strict',
    overrun: 'hard stop at the daily Neuron pool until 00:00 UTC; Workers Free has no overage',
    reset: 'utc-midnight',
    limits: {
      // Cloudflare publishes no request/day cap for text generation; the
      // Neuron pool is the meter. The request cap here is a guard, not a quota.
      requestsPerDay: 100_000,
      tokensPerDay: NO_LIMIT,
      requestsPerMinute: 300,
      tokensPerMinute: NO_LIMIT,
      neuronsPerDay: 10_000,
    },
    neuronsPerMillion: { input: 31_818, output: 68_182 },
  },
  {
    provider: 'cloudflare',
    model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    label: 'Cloudflare Workers AI Llama 3.3 70B (free allocation)',
    contextTokens: 24_000,
    maxOutputTokens: 8_192,
    structuredOutput: 'json_schema-strict',
    overrun: 'hard stop at the daily Neuron pool until 00:00 UTC; Workers Free has no overage',
    reset: 'utc-midnight',
    limits: {
      requestsPerDay: 100_000,
      tokensPerDay: NO_LIMIT,
      requestsPerMinute: 300,
      tokensPerMinute: NO_LIMIT,
      neuronsPerDay: 10_000,
    },
    neuronsPerMillion: { input: 204_805, output: 204_805 },
  },
]

const FREE_BY_PROVIDER_AND_MODEL = new Map(
  FREE_MODELS.map((entry) => [`${entry.provider}:${entry.model}`, entry]),
)

const FREE_MODEL_IDS = new Set(FREE_MODELS.map((entry) => entry.model))

export type PaidRequestRefusedCode =
  | 'mode_disabled'
  | 'unknown_provider'
  | 'future_provider'
  | 'unknown_model'
  | 'paid_fallback'
  | 'context_exceeded'

export class PaidRequestRefused extends Error {
  code: PaidRequestRefusedCode

  constructor(code: PaidRequestRefusedCode, message: string) {
    super(message)
    this.name = 'PaidRequestRefused'
    this.code = code
  }
}

/** Routing a request may carry. Anything that could reach a second, unvetted
 *  endpoint is refused: no fallback list, no automatic upgrade, no model array. */
export type ZeroCostRouting = {
  allowFallbacks?: boolean
  models?: string[]
  autoRouter?: boolean
}

export type ZeroCostRequest = {
  provider: string
  model: string
  routing?: ZeroCostRouting
  /** Input + output estimate, when the caller already knows it. */
  estimatedTokens?: number
}

/**
 * Returns the allowlisted model, or throws. Called inside every adapter before
 * `fetch`, and again by the route builder, so a new caller cannot bypass it.
 */
export function assertZeroCost(request: ZeroCostRequest): FreeModel {
  if (!ZERO_COST_MODE) {
    throw new PaidRequestRefused(
      'mode_disabled',
      'ZERO_COST_MODE is off, so nothing may be sent to a provider: Plattr does not spend money.',
    )
  }
  const provider = String(request.provider || '').toLowerCase()
  if ((FUTURE_PROVIDERS as readonly string[]).includes(provider)) {
    throw new PaidRequestRefused(
      'future_provider',
      `${provider} is a future provider and is not implemented. Plattr currently calls Groq and Cloudflare Workers AI only.`,
    )
  }
  if (provider !== 'groq' && provider !== 'cloudflare') {
    throw new PaidRequestRefused(
      'unknown_provider',
      `${request.provider || '(none)'} is not a zero-cost provider. Plattr calls Groq and Cloudflare Workers AI only.`,
    )
  }
  const spec = FREE_BY_PROVIDER_AND_MODEL.get(`${provider}:${request.model}`)
  if (!spec) {
    throw new PaidRequestRefused(
      'unknown_model',
      `${request.model} is not on the free allowlist for ${provider}. ${describeFreeModels(provider)}`,
    )
  }
  const routing = request.routing
  if (routing) {
    if (Array.isArray(routing.models) && routing.models.length) {
      throw new PaidRequestRefused(
        'paid_fallback',
        'A model fallback list can reach a model that is not on the free allowlist, so the request was refused.',
      )
    }
    if (routing.allowFallbacks === true) {
      throw new PaidRequestRefused(
        'paid_fallback',
        'allow_fallbacks is not permitted: it can route the request to an endpoint that bills.',
      )
    }
    if (routing.autoRouter) {
      throw new PaidRequestRefused('paid_fallback', 'Automatic model routing is not permitted under ZERO_COST_MODE.')
    }
  }
  if (typeof request.estimatedTokens === 'number' && request.estimatedTokens > spec.contextTokens) {
    throw new PaidRequestRefused(
      'context_exceeded',
      `The request estimates ${Math.round(request.estimatedTokens)} tokens, over ${spec.contextTokens} for ${spec.model}.`,
    )
  }
  return spec
}

function describeFreeModels(provider: string): string {
  const models = FREE_MODELS.filter((entry) => entry.provider === provider).map((entry) => entry.model)
  return `Free models for ${provider}: ${models.join(', ') || '(none)'}.`
}

export function isFreeModel(model: string): boolean {
  return FREE_MODEL_IDS.has(model)
}

export function freeModelFor(provider: string, model: string): FreeModel | undefined {
  return FREE_BY_PROVIDER_AND_MODEL.get(`${String(provider).toLowerCase()}:${model}`)
}

/**
 * Neurons a call reserves on Cloudflare's daily pool: the published per-token
 * rates, rounded up so a reservation can only over-state, never under-state.
 */
export function neuronsFor(spec: FreeModel, inputTokens: number, outputTokens: number): number {
  if (!spec.neuronsPerMillion) return 0
  const input = Math.max(0, inputTokens) * (spec.neuronsPerMillion.input / 1_000_000)
  const output = Math.max(0, outputTokens) * (spec.neuronsPerMillion.output / 1_000_000)
  return Math.ceil(input + output)
}

/** The daily Neuron pool is shared by every Cloudflare model on the account, so
 *  it gets its own key rather than one per model. */
export function poolKeyFor(spec: FreeModel, day: string): string | null {
  if (!Number.isFinite(spec.limits.neuronsPerDay) || spec.limits.neuronsPerDay <= 0) return null
  return `${spec.provider}:neurons:day:${day}`
}
