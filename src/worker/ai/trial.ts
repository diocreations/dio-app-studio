/**
 * The approved paid trial: Groq against OpenRouter, one generation contract.
 *
 * Both sides run the **same model**, `openai/gpt-oss-120b`, with the same
 * prompts, stages, schemas and token ceilings. That is the point: a difference
 * in the output is a difference between the gateways and their endpoints, not
 * between two model families.
 *
 * Nothing here runs unless the owner has done three things: placed
 * `GROQ_API_KEY` and `OPENROUTER_API_KEY` in the local secret store (`.dev.vars`,
 * gitignored) and set `PLATTR_AI_TRIAL=approved`. Keys are checked before a
 * socket is opened, never returned by a function here, never logged and never
 * put in a result object.
 *
 * The money rules:
 *
 *  - $30.00 for the whole trial, enforced by one atomic statement that reserves
 *    a generation's hard ceiling against the pool before any call.
 *  - $0.40 per generation, enforced by the in-process ledger: a call whose own
 *    ceiling does not fit is never sent.
 *  - $0.18 soft: once a generation has spent that much, the optional copy pass
 *    is skipped. At these prices it is a guard, not a likely event.
 *  - No top-up, no credit purchase, no second card. The pool only goes down.
 *
 * Settlement uses the gateway-reported charge on OpenRouter and the published
 * Groq rate applied to Groq's reported tokens, because Groq reports tokens but
 * not dollars. A failed Groq call that had already produced tokens books that
 * charge before the failure propagates.
 */

import {
  groqPaidProvider,
  openRouterProvider,
  type AiModels,
  type AiProvider,
  type OpenRouterRouting,
} from './provider'
import type { ModelPrice } from './pricing'
import type { D1Like } from './quotas'

export const TRIAL_ID = 'groq-vs-openrouter-2026-11-23'

export const TRIAL_LIMITS = {
  /** Total for the whole trial, across both gateways and every business. */
  totalUsd: 30,
  /** After this, a generation keeps its design and skips the copy pass. */
  softUsd: 0.18,
  /** The reservation ceiling per generation. A provider charge above an
   *  attempt's reservation is still booked and reported, not clamped. */
  hardUsd: 0.4,
} as const

export type TrialProviderId = 'groq' | 'openrouter' | 'openrouter-groq'

export type TrialProvider = {
  id: TrialProviderId
  /** `primary` is the practical comparison; `controlled` isolates the gateway
   *  by pinning OpenRouter to the same endpoint Groq runs directly. */
  arm: 'primary' | 'controlled'
  /** Which gateway receives the request. */
  gateway: 'groq' | 'openrouter'
  label: string
  /** What routing this arm asks for; recorded with every result. */
  routingLabel: string
  routing?: OpenRouterRouting
  /** The only endpoint this arm may be served by, when pinned. */
  expectedProvider?: string
  /** The environment variable that holds this gateway's key. */
  keyEnv: 'GROQ_API_KEY' | 'OPENROUTER_API_KEY'
  /** The exact model ID sent to both gateways. */
  model: string
  contextTokens: number
  maxOutputTokens: number
  /** What this route is normally billed at, used to price a Groq call. */
  price: ModelPrice
  /** The dearest endpoint this route can be billed at, for reservations. */
  reservationPrice: ModelPrice
  /** Where the price was read, and what it covers. */
  pricing: string
  models: AiModels
}

/** Groq production price, console.groq.com/docs/models, read 2026-11-23. */
export const GROQ_PRICE: ModelPrice = {
  input: 0.15 / 1_000_000,
  cachedInput: 0.075 / 1_000_000,
  output: 0.6 / 1_000_000,
}

/**
 * OpenRouter passes through the endpoint price with no inference markup. The
 * cheapest standard endpoints for this model were listed at $0.03 in / $0.15
 * out on 2026-11-23; that is what price-sorted routing normally pays.
 */
export const OPENROUTER_PRICE: ModelPrice = {
  input: 0.03 / 1_000_000,
  cachedInput: 0.03 / 1_000_000,
  output: 0.15 / 1_000_000,
}

/**
 * The dearest endpoint OpenRouter lists for this model on 2026-11-23: $0.35
 * input (Cerebras) and $0.95 output (SambaNova). Price-sorted routing should
 * never select it, but a reservation must cover the worst endpoint the routing
 * rules permit or the $0.40 generation cap would be nominal.
 */
export const OPENROUTER_RESERVATION_PRICE: ModelPrice = {
  input: 0.35 / 1_000_000,
  cachedInput: 0.35 / 1_000_000,
  output: 0.95 / 1_000_000,
}

/**
 * The controlled arm pins OpenRouter to its Groq endpoint, so the only endpoint
 * it can be billed at is Groq's own published rate. Fallbacks are disabled, so
 * a reservation at that rate is exact rather than a spread over the catalogue.
 */
export const OPENROUTER_GROQ_PRICE: ModelPrice = GROQ_PRICE

const TRIAL_MODEL = 'openai/gpt-oss-120b'

const TRIAL_MODELS: AiModels = {
  understand: TRIAL_MODEL,
  design: TRIAL_MODEL,
  copy: TRIAL_MODEL,
}

export const TRIAL_PROVIDERS: TrialProvider[] = [
  {
    id: 'groq',
    arm: 'primary',
    gateway: 'groq',
    label: 'Groq · GroqCloud',
    routingLabel: 'direct to GroqCloud; no gateway in between',
    keyEnv: 'GROQ_API_KEY',
    model: TRIAL_MODEL,
    contextTokens: 131_072,
    maxOutputTokens: 65_536,
    price: GROQ_PRICE,
    reservationPrice: GROQ_PRICE,
    pricing:
      'Groq production price, read 2026-11-23: $0.15 input / $0.075 cached input / $0.60 output per 1M tokens; 131,072 context; 65,536 max completion; strict json_schema supported.',
    models: TRIAL_MODELS,
  },
  {
    id: 'openrouter',
    arm: 'primary',
    gateway: 'openrouter',
    label: 'OpenRouter · cheapest eligible endpoint',
    routingLabel:
      'OpenRouter price-sorted routing over same-model endpoints with fallbacks allowed; the serving endpoint is unspecified until the response reports it',
    routing: {
      // Do not ask for one vendor: ask for the cheapest endpoint of this model
      // that can honour the schema. OpenRouter decides which endpoint serves
      // the call, and reports it in the response.
      allowFallbacks: true,
      sort: 'price',
      requireParameters: true,
      dataCollection: 'deny',
    },
    keyEnv: 'OPENROUTER_API_KEY',
    model: TRIAL_MODEL,
    contextTokens: 131_072,
    maxOutputTokens: 65_536,
    price: OPENROUTER_PRICE,
    reservationPrice: OPENROUTER_RESERVATION_PRICE,
    pricing:
      'OpenRouter standard pay-as-you-go, read 2026-11-23: no inference markup; cheapest standard endpoints for this model $0.03 input / $0.15 output per 1M, dearest listed $0.35 / $0.95. Billed at the selected endpoint and settled from usage.cost.',
    models: TRIAL_MODELS,
  },
  {
    id: 'openrouter-groq',
    arm: 'controlled',
    gateway: 'openrouter',
    label: 'OpenRouter · pinned to Groq',
    routingLabel:
      'OpenRouter pinned to its Groq endpoint (provider.only=["Groq"]) with fallbacks disabled; a response served by any other endpoint is refused',
    routing: {
      only: ['Groq'],
      allowFallbacks: false,
      requireParameters: true,
      dataCollection: 'deny',
    },
    expectedProvider: 'Groq',
    keyEnv: 'OPENROUTER_API_KEY',
    model: TRIAL_MODEL,
    contextTokens: 131_072,
    maxOutputTokens: 65_536,
    price: OPENROUTER_GROQ_PRICE,
    reservationPrice: OPENROUTER_GROQ_PRICE,
    pricing:
      'OpenRouter pinned to Groq with fallbacks off, read 2026-11-23: the endpoint is Groq\'s own $0.15 input / $0.075 cached input / $0.60 output per 1M. OpenRouter charges no inference markup for it; its 5.5% credit-purchase fee is paid at top-up, not per call, and is recorded separately.',
    models: TRIAL_MODELS,
  },
]

export function trialProviderById(id: string): TrialProvider | undefined {
  return TRIAL_PROVIDERS.find((provider) => provider.id === id)
}

/** The only table the trial adds. Micro-dollars keep the arithmetic integral. */
export const TRIAL_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS ai_trial_spend (
  trial_id TEXT PRIMARY KEY,
  reserved_micros INTEGER NOT NULL DEFAULT 0,
  spent_micros INTEGER NOT NULL DEFAULT 0,
  generations INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);`

export const trialMicros = (usd: number): number => Math.ceil(Math.max(0, usd) * 1_000_000)

export type TrialSpend = {
  reservedUsd: number
  spentUsd: number
  generations: number
  remainingUsd: number
}

export type TrialSpendStore = {
  /** Atomically reserve `usd` against the pool, or refuse when it does not fit. */
  claim(trialId: string, usd: number, capUsd: number, at: Date): Promise<boolean>
  /** Replace a claimed reservation with what the generation actually cost. */
  settle(trialId: string, reservedUsd: number, actualUsd: number, at: Date): Promise<void>
  read(trialId: string, capUsd: number, at?: Date): Promise<TrialSpend>
}

/**
 * The pool claim. `WHERE` carries the ceiling, so the database decides — a
 * second process cannot slip in between a read and a write.
 */
export const TRIAL_CLAIM_SQL = `
INSERT INTO ai_trial_spend (trial_id, reserved_micros, spent_micros, generations, updated_at)
VALUES (?, ?, 0, 1, ?)
ON CONFLICT(trial_id) DO UPDATE SET
  reserved_micros = ai_trial_spend.reserved_micros + excluded.reserved_micros,
  generations = ai_trial_spend.generations + 1,
  updated_at = excluded.updated_at
WHERE ai_trial_spend.spent_micros + ai_trial_spend.reserved_micros + excluded.reserved_micros <= ?
RETURNING trial_id;`

export const TRIAL_SETTLE_SQL = `
UPDATE ai_trial_spend
SET reserved_micros = MAX(0, reserved_micros - ?),
    spent_micros = spent_micros + ?,
    updated_at = ?
WHERE trial_id = ?;`

export function d1TrialStore(db: D1Like): TrialSpendStore {
  return {
    async claim(trialId, usd, capUsd, at) {
      const micros = trialMicros(usd)
      const row = await db
        .prepare(TRIAL_CLAIM_SQL)
        .bind(trialId, micros, at.toISOString(), trialMicros(capUsd))
        .first<{ trial_id: string }>()
      return Boolean(row?.trial_id)
    },
    async settle(trialId, reservedUsd, actualUsd, at) {
      await db
        .prepare(TRIAL_SETTLE_SQL)
        .bind(trialMicros(reservedUsd), trialMicros(actualUsd), at.toISOString(), trialId)
        .run()
    },
    async read(trialId, capUsd) {
      const row = await db
        .prepare(
          'SELECT reserved_micros, spent_micros, generations FROM ai_trial_spend WHERE trial_id = ?',
        )
        .bind(trialId)
        .first<{ reserved_micros: number; spent_micros: number; generations: number }>()
      const reserved = Number(row?.reserved_micros ?? 0) / 1_000_000
      const spent = Number(row?.spent_micros ?? 0) / 1_000_000
      return {
        reservedUsd: reserved,
        spentUsd: spent,
        generations: Number(row?.generations ?? 0),
        remainingUsd: Math.max(0, capUsd - reserved - spent),
      }
    },
  }
}

/** The same contract for tests and for a dry run with no database. */
export function memoryTrialStore(): TrialSpendStore {
  const rows = new Map<string, { reserved: number; spent: number; generations: number }>()
  const row = (trialId: string) => {
    const existing = rows.get(trialId)
    if (existing) return existing
    const created = { reserved: 0, spent: 0, generations: 0 }
    rows.set(trialId, created)
    return created
  }
  return {
    async claim(trialId, usd, capUsd) {
      const entry = row(trialId)
      const micros = trialMicros(usd)
      if (trialMicros(entry.reserved + entry.spent) + micros > trialMicros(capUsd)) return false
      entry.reserved += micros / 1_000_000
      entry.generations += 1
      return true
    },
    async settle(trialId, reservedUsd, actualUsd) {
      const entry = row(trialId)
      entry.reserved = Math.max(0, entry.reserved - reservedUsd)
      entry.spent += Math.max(0, actualUsd)
    },
    async read(trialId, capUsd) {
      const entry = row(trialId)
      return {
        reservedUsd: entry.reserved,
        spentUsd: entry.spent,
        generations: entry.generations,
        remainingUsd: Math.max(0, capUsd - entry.reserved - entry.spent),
      }
    },
  }
}

export type TrialAvailability =
  | { available: true; providers: TrialProvider[] }
  | { available: false; reason: 'no_keys' | 'not_approved'; missing: string[] }

/**
 * Three independent switches, checked before anything is built. A comparison
 * needs both keys, so one key alone is reported as a missing key, not as a
 * partial trial. The returned `missing` names variables only — never values.
 */
export function trialStatus(env: Record<string, string | undefined>): TrialAvailability {
  const missing: string[] = []
  // Three arms share two keys; each missing variable is named once.
  for (const keyEnv of new Set(TRIAL_PROVIDERS.map((provider) => provider.keyEnv))) {
    if (!(env[keyEnv] ?? '').trim()) missing.push(keyEnv)
  }
  const approved = (env.PLATTR_AI_TRIAL ?? '').trim().toLowerCase() === 'approved'
  if (!approved) missing.push('PLATTR_AI_TRIAL=approved')
  if (!missing.length) return { available: true, providers: TRIAL_PROVIDERS }
  return {
    available: false,
    reason: approved ? 'no_keys' : 'not_approved',
    missing,
  }
}

/** Reasoning headroom, identical on both gateways, so the comparison is not a
 *  difference in token ceilings. */
export const TRIAL_REASONING = {
  reasoning: { understand: 'low', design: 'medium', copy: 'low' } as const,
  reasoningReserveTokens: { understand: 400, design: 2_500, copy: 600 },
}

/**
 * The comparison provider. Both sides send the same model, schema, messages and
 * ceilings. Only the gateway, its routing and its billing differ.
 */
export function trialProvider(provider: TrialProvider, apiKey: string): AiProvider {
  if (!apiKey.trim()) throw new Error(`${provider.keyEnv} is not set; no provider was built.`)
  if (provider.gateway === 'groq') {
    return groqPaidProvider(apiKey, provider.models, {
      price: provider.price,
      reservationPrice: provider.reservationPrice,
      reasoning: TRIAL_REASONING.reasoning,
      reasoningReserveTokens: TRIAL_REASONING.reasoningReserveTokens,
      timeoutMs: 300_000,
    })
  }
  return openRouterProvider(apiKey, provider.models, {
    authorised: true,
    price: provider.price,
    reservationPrice: provider.reservationPrice,
    reasoning: TRIAL_REASONING.reasoning,
    reasoningReserveTokens: TRIAL_REASONING.reasoningReserveTokens,
    routing: provider.routing,
    expectedProvider: provider.expectedProvider,
    timeoutMs: 300_000,
  })
}
