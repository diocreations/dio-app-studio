/**
 * What a model call costs, in dollars, from published list prices.
 *
 * The numbers are per token so every calculation stays exact. They are not a
 * substitute for the invoice: a provider can change a price, a gateway can
 * route to a different endpoint, and a cached read is billed differently from
 * a fresh one. `docs/AI_TRIAL_GROQ_VS_OPENROUTER_2026-11-23.md` records the
 * prices the trial was built from and when they were read.
 */

import { isFreeModel } from './zeroCost'

export type ModelPrice = {
  /** USD per input token. */
  input: number
  /** USD per cached input token. */
  cachedInput: number
  /** USD per output token. Reasoning tokens are billed here too. */
  output: number
}

export const MODEL_PRICES: Record<string, ModelPrice> = {
  // Anthropic, standard tier, read 2026-11-23.
  'claude-sonnet-5-5': { input: 2 / 1_000_000, cachedInput: 0.1 / 1_000_000, output: 10 / 1_000_000 },
  'claude-haiku-5-5': { input: 0.1 / 1_000_000, cachedInput: 0.01 / 1_000_000, output: 0.5 / 1_000_000 },
  // OpenAI, standard tier, read 2026-11-23.
  'gpt-6-sol': { input: 2 / 1_000_000, cachedInput: 0.1 / 1_000_000, output: 10 / 1_000_000 },
  'gpt-6.1-terra': { input: 1 / 1_000_000, cachedInput: 0.05 / 1_000_000, output: 5 / 1_000_000 },
  // OpenRouter passes the endpoint price through with no inference markup.
  // Groq's endpoint for `openai/gpt-oss-120b`, read from the endpoints API on
  // 2026-11-23: $0.15 input / $0.075 cached / $0.60 output per 1M tokens.
  'openai/gpt-oss-120b': { input: 0.15 / 1_000_000, cachedInput: 0.075 / 1_000_000, output: 0.6 / 1_000_000 },
  // OpenRouter Anthropic slugs, list price, read 2026-11-23.
  'anthropic/claude-sonnet-5.5': { input: 2 / 1_000_000, cachedInput: 0.1 / 1_000_000, output: 10 / 1_000_000 },
  'anthropic/claude-haiku-5.5': { input: 0.1 / 1_000_000, cachedInput: 0.01 / 1_000_000, output: 0.5 / 1_000_000 },
}

/**
 * A ceiling for a reservation, not a billing figure.
 *
 * The Groq route pins `provider.only: ["groq"]`, so the Groq endpoint price is
 * the only price it can be billed at and is therefore the real ceiling. The
 * same model is served by about twenty other endpoints; the dearest today is
 * Cerebras at $0.35 input and SambaNova at $0.95 output. Removing the pin
 * without raising this bound would make the $0.40 generation cap nominal.
 */
export const RESERVATION_PRICES: Record<string, ModelPrice> = {
  'openai/gpt-oss-120b': { input: 0.15 / 1_000_000, cachedInput: 0.075 / 1_000_000, output: 0.6 / 1_000_000 },
}

/**
 * OpenRouter's standard pay-as-you-go plan: 5.5% of every credit purchase.
 * Inference itself is passed through at the endpoint's list price, so this is a
 * cash cost on funding credits, not a per-request markup. It is a rate, not a
 * flat charge: a $0.79 purchase costs about $0.04, a $4.00 purchase about
 * $0.22. Read 2026-11-23.
 */
export const OPENROUTER_CREDIT_FEE_RATE = 0.055

export type Usage = {
  /** Every input token billed, cached or not. */
  inputTokens: number
  /** The part of `inputTokens` the provider served from its prompt cache. */
  cachedInputTokens: number
  /** Visible answer tokens plus any reasoning tokens the provider billed. */
  outputTokens: number
  /** The reasoning part of `outputTokens`, when the provider reports it. */
  reasoningTokens?: number
}

/** A free-tier call costs exactly nothing. The list price below is what the
 *  model would cost on a paid plan; it is not what Plattr pays, so the guard's
 *  models are priced at zero rather than at their commercial rate. */
const FREE_PRICE: ModelPrice = { input: 0, cachedInput: 0, output: 0 }

export function priceFor(model: string): ModelPrice {
  if (isFreeModel(model)) return FREE_PRICE
  const price = MODEL_PRICES[model]
  if (!price) throw new Error(`No price on file for model ${model}`)
  return price
}

export function costWithPrice(price: ModelPrice, usage: Usage): number {
  const cached = Math.max(0, Math.min(usage.inputTokens, usage.cachedInputTokens))
  return (
    (usage.inputTokens - cached) * price.input +
    cached * price.cachedInput +
    Math.max(0, usage.outputTokens) * price.output
  )
}

export function costUsd(model: string, usage: Usage): number {
  return costWithPrice(priceFor(model), usage)
}

/** The most a call can cost: every input token fresh, every output token used,
 *  priced at the dearest endpoint the route could be billed at. */
export function estimateMaxUsd(
  model: string,
  inputTokens: number,
  maxOutputTokens: number,
  priceOverride?: ModelPrice,
): number {
  // A free-tier model has no billable ceiling. `RESERVATION_PRICES` records the
  // commercial rate this model would cost on a paid plan; that is not a
  // reservation Plattr can ever incur, so it must not reach the ledger. An
  // explicit provider price overrides that: the approved trial bills the same
  // model on a paid plan, and the reservation must be real there.
  if (!priceOverride && isFreeModel(model)) return 0
  const price = priceOverride ?? RESERVATION_PRICES[model] ?? priceFor(model)
  return Math.max(0, inputTokens) * price.input + Math.max(0, maxOutputTokens) * price.output
}

/** A token estimate for a prompt, before the provider has counted it. English
 *  prose runs about four characters per token; JSON is denser. This is a
 *  reservation bound, never a billing figure. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.6)
}

/** The 5.5% charged on the credit purchase that funds `inferenceUsd` of calls.
 *  Credits are bought in cents, so a real purchase can differ by under a cent
 *  from this figure; the report states the amount actually purchased. */
export function openRouterCreditFeeUsd(inferenceUsd: number): number {
  if (!(inferenceUsd > 0)) return 0
  return inferenceUsd * OPENROUTER_CREDIT_FEE_RATE
}

/** All-in cash: the credits needed plus the fee charged to buy them. */
export function openRouterCashUsd(inferenceUsd: number): number {
  return inferenceUsd + openRouterCreditFeeUsd(inferenceUsd)
}

/** Credits affordable inside an all-in cash ceiling that includes the fee.
 *  Floored to the cent because credits are bought in cents: $28.44 of credits
 *  cost $30.0042, which is over a $30.00 ceiling, while $28.43 costs $29.9937
 *  and stays inside it. */
export function openRouterInferenceBudgetUsd(allInUsd: number): number {
  if (!(allInUsd > 0)) return 0
  return Math.floor((allInUsd / (1 + OPENROUTER_CREDIT_FEE_RATE)) * 100) / 100
}

export function dollars(value: number): string {
  return `$${value.toFixed(value < 0.01 ? 4 : 2)}`
}
