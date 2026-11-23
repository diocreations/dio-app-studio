import { costUsd, estimateTokens, type Usage } from './pricing'
import type { QuotaLedger, QuotaReservation } from './quotas'
import { assertZeroCost, neuronsFor, PaidRequestRefused, type FreeModel } from './zeroCost'

/**
 * One contract for every provider.
 *
 * Each adapter speaks its vendor's native structured-output surface directly
 * over `fetch`: no SDK, no extra bundle, no vendor type leaking into the design
 * pipeline. A call returns parsed JSON, the provider's own token usage, the
 * provider's reported charge where it reports one, and the cost derived from
 * the price table as a fallback. Nothing here decides whether the JSON is any
 * good; that is the validator's job.
 *
 * Keys are read from the server environment only. This module must never be
 * imported by browser code, and no adapter returns the key it was given.
 */

export type AiStage = 'understand' | 'design' | 'copy'
export type ProviderName = 'anthropic' | 'openai' | 'openrouter' | 'groq' | 'cloudflare' | 'mixed'
export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh'

export type AiModels = Record<AiStage, string>

export type GenerateRequest = {
  stage: AiStage
  system: string
  user: string
  /** JSON Schema from `jsonSchemaOf`, never a hand-written string. */
  schema: Record<string, unknown>
  /** Ceiling for the visible JSON answer, not for reasoning tokens. */
  maxOutputTokens: number
}

export type GenerateResult = {
  json: unknown
  usage: Usage
  /** The model this route asked for. */
  model: string
  /** The model the provider says answered, when it differs from the request. */
  modelServed?: string
  provider: ProviderName
  /** The upstream provider a gateway used, e.g. "Groq". */
  providerServed?: string
  latencyMs: number
  requestId: string
  /** What the call actually cost: provider-reported when available. */
  costUsd: number
  /** The provider's own charge, untouched. Absent for Anthropic and OpenAI. */
  reportedCostUsd?: number
}

export type AiProvider = {
  name: ProviderName
  modelFor(stage: AiStage): string
  /** Reasoning effort sent for this stage, for the call record. */
  effortFor?(stage: AiStage): ReasoningEffort | undefined
  /** A route-specific visible-output ceiling, when the default is wrong. */
  maxOutputFor?(stage: AiStage): number | undefined
  /** Billed output to reserve: visible ceiling plus reasoning allowance. */
  reserveOutputFor?(stage: AiStage, visibleMax: number): number
  generate(request: GenerateRequest): Promise<GenerateResult>
}

export type ProviderErrorCode =
  | 'no_key'
  | 'http'
  | 'parse'
  | 'truncated'
  | 'refused'
  | 'timeout'
  | 'transport'
  /** The gateway answered from an endpoint the route did not pin. */
  | 'provider_mismatch'

export class ProviderError extends Error {
  code: ProviderErrorCode
  status?: number
  retryable: boolean
  retryAfterMs?: number

  constructor(
    code: ProviderErrorCode,
    message: string,
    options: { status?: number; retryable?: boolean; retryAfterMs?: number } = {},
  ) {
    super(message)
    this.name = 'ProviderError'
    this.code = code
    this.status = options.status
    this.retryable = options.retryable === true
    this.retryAfterMs = options.retryAfterMs
  }
}

export const ANTHROPIC_MODELS: AiModels = {
  understand: 'claude-haiku-5-5',
  design: 'claude-sonnet-5-5',
  copy: 'claude-haiku-5-5',
}

/** The bake-off uses the same two roles on the OpenAI side: a stronger model
 *  for the design set, a cheaper one for reading and copy. */
export const OPENAI_MODELS: AiModels = {
  understand: 'gpt-6.1-terra',
  design: 'gpt-6-sol',
  copy: 'gpt-6.1-terra',
}

/** The default for `providerFromEnv`. The trial configures routes explicitly. */
export const OPENROUTER_MODELS: AiModels = {
  understand: 'openai/gpt-oss-120b',
  design: 'openai/gpt-oss-120b',
  copy: 'openai/gpt-oss-120b',
}

const DEFAULT_TIMEOUT_MS = 180_000

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0
}

function messageOf(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback
  const raw = body as Record<string, unknown>
  const error = raw.error as Record<string, unknown> | undefined
  if (error && typeof error.message === 'string') return error.message
  if (typeof raw.message === 'string') return raw.message
  return fallback
}

/** Retry-After is either delta-seconds or an HTTP date. Cap it so a hostile or
 *  mistaken header cannot park the trial for an hour. */
function retryAfterMsOf(value: string | null): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 15_000)
  const at = Date.parse(value)
  if (Number.isFinite(at)) return Math.min(Math.max(0, at - Date.now()), 15_000)
  return undefined
}

async function postJson(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string>,
  timeoutMs: number,
  label: string,
): Promise<Record<string, unknown> | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (error) {
    const timedOut = controller.signal.aborted
    throw new ProviderError(
      timedOut ? 'timeout' : 'transport',
      timedOut
        ? `${label} did not answer within ${timeoutMs}ms.`
        : `${label} could not be reached (${error instanceof Error ? error.message : 'unknown error'}).`,
      { retryable: true },
    )
  } finally {
    clearTimeout(timer)
  }
  const parsed = (await response.json().catch(() => null)) as Record<string, unknown> | null
  if (!response.ok) {
    throw new ProviderError('http', messageOf(parsed, `${label} returned ${response.status}`), {
      status: response.status,
      retryable: response.status === 429 || response.status >= 500,
      retryAfterMs: retryAfterMsOf(response.headers.get('retry-after')),
    })
  }
  return parsed
}

/** OpenAI-compatible `message.content` is a string on these models; an array of
 *  parts is accepted too so a gateway formatting change is not a parse failure. */
function messageText(message: Record<string, unknown> | undefined): string {
  if (!message) return ''
  const content = message.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter(
      (part): part is { text: string } =>
        Boolean(part) && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string',
    )
    .map((part) => part.text)
    .join('')
}

function parseJson(text: string): unknown {
  if (!text) throw new ProviderError('parse', 'The provider returned no text block.')
  try {
    return JSON.parse(text)
  } catch {
    throw new ProviderError('parse', 'The provider returned text that is not JSON.')
  }
}

/**
 * The paid adapters are kept only so their refusal is explicit and testable.
 * Plattr has no paid path: calling one throws before the key is read or a
 * request is built.
 */
function refusePaid(provider: 'anthropic' | 'openai' | 'openrouter', model: string): void {
  throw new PaidRequestRefused(
    'unknown_provider',
    `${provider} (${model}) is a paid provider and is not available: Plattr spends nothing.`,
  )
}

export function anthropicProvider(
  apiKey: string,
  models: AiModels = ANTHROPIC_MODELS,
  options: { timeoutMs?: number } = {},
): AiProvider {
  if (!apiKey) throw new ProviderError('no_key', 'ANTHROPIC_API_KEY is not set')
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  return {
    name: 'anthropic',
    modelFor: (stage) => models[stage],
    async generate(request: GenerateRequest): Promise<GenerateResult> {
      refusePaid('anthropic', models[request.stage])
      const model = models[request.stage]
      const started = Date.now()
      const body = await postJson(
        'https://api.anthropic.com/v1/messages',
        {
          model,
          max_tokens: request.maxOutputTokens,
          system: request.system,
          messages: [{ role: 'user', content: request.user }],
          output_config: {
            format: { type: 'json_schema', schema: request.schema },
          },
        },
        { 'x-api-key': apiKey, 'anthropic-version': '2026-10-21' },
        timeoutMs,
        'Anthropic',
      )
      if (body?.stop_reason === 'max_tokens') {
        throw new ProviderError('truncated', 'The design answer was cut off at the token limit.')
      }
      const blocks = Array.isArray(body?.content) ? (body.content as Record<string, unknown>[]) : []
      const text = blocks
        .filter((block) => block?.type === 'text' && typeof block.text === 'string')
        .map((block) => String(block.text))
        .join('')
      const json = parseJson(text)
      const usageRaw = (body?.usage ?? {}) as Record<string, unknown>
      const usage: Usage = {
        inputTokens: count(usageRaw.input_tokens),
        cachedInputTokens: count(usageRaw.cache_read_input_tokens),
        outputTokens: count(usageRaw.output_tokens),
        reasoningTokens: 0,
      }
      return {
        json,
        usage,
        model,
        modelServed: typeof body?.model === 'string' ? body.model : undefined,
        provider: 'anthropic',
        latencyMs: Date.now() - started,
        requestId: typeof body?.id === 'string' ? body.id : '',
        costUsd: costUsd(model, usage),
      }
    },
  }
}

export function openaiProvider(
  apiKey: string,
  models: AiModels = OPENAI_MODELS,
  options: { timeoutMs?: number } = {},
): AiProvider {
  if (!apiKey) throw new ProviderError('no_key', 'OPENAI_API_KEY is not set')
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  return {
    name: 'openai',
    modelFor: (stage) => models[stage],
    async generate(request: GenerateRequest): Promise<GenerateResult> {
      refusePaid('openai', models[request.stage])
      const model = models[request.stage]
      const started = Date.now()
      const body = await postJson(
        'https://api.openai.com/v1/responses',
        {
          model,
          input: [
            { role: 'system', content: request.system },
            { role: 'user', content: request.user },
          ],
          max_output_tokens: request.maxOutputTokens,
          text: {
            format: {
              type: 'json_schema',
              name: `plattr_${request.stage}`,
              strict: true,
              schema: request.schema,
            },
          },
        },
        { authorization: `Bearer ${apiKey}` },
        timeoutMs,
        'OpenAI',
      )
      if (body?.status === 'incomplete') {
        throw new ProviderError('truncated', 'The design answer was cut off at the token limit.')
      }
      const output = Array.isArray(body?.output) ? (body.output as Record<string, unknown>[]) : []
      const fromBlocks = output
        .flatMap((block) => (Array.isArray(block.content) ? (block.content as Record<string, unknown>[]) : []))
        .filter((block) => block.type === 'output_text' && typeof block.text === 'string')
        .map((block) => String(block.text))
        .join('')
      const text = typeof body?.output_text === 'string' ? body.output_text : fromBlocks
      const json = parseJson(text)
      const usageRaw = (body?.usage ?? {}) as Record<string, unknown>
      const details = (usageRaw.input_tokens_details ?? {}) as Record<string, unknown>
      const outputDetails = (usageRaw.output_tokens_details ?? {}) as Record<string, unknown>
      const usage: Usage = {
        inputTokens: count(usageRaw.input_tokens),
        cachedInputTokens: count(details.cached_tokens),
        outputTokens: count(usageRaw.output_tokens),
        reasoningTokens: count(outputDetails.reasoning_tokens),
      }
      return {
        json,
        usage,
        model,
        modelServed: typeof body?.model === 'string' ? body.model : undefined,
        provider: 'openai',
        latencyMs: Date.now() - started,
        requestId: typeof body?.id === 'string' ? body.id : '',
        costUsd: costUsd(model, usage),
      }
    },
  }
}

/**
 * OpenRouter provider routing.
 *
 * `order` names preferred upstream providers. `allowFallbacks` lets the gateway
 * use another endpoint of the same model if the preferred one fails; the
 * responding endpoint is recorded on every call. `requireParameters` keeps a
 * request away from endpoints that cannot honour the JSON schema.
 */
export type OpenRouterRouting = {
  order?: string[]
  only?: string[]
  ignore?: string[]
  allowFallbacks?: boolean
  requireParameters?: boolean
  dataCollection?: 'allow' | 'deny'
  sort?: 'price' | 'throughput' | 'latency'
}

export type OpenRouterOptions = {
  routing?: OpenRouterRouting
  /** Endpoint slug this route must be served by. Checked against the
   *  response's `provider` field; absent or different attribution fails the
   *  call, because the bake-off compares vendors, not just model IDs. */
  expectedProvider?: string
  reasoning?: Partial<Record<AiStage, ReasoningEffort>>
  /** Billed output above the visible ceiling, reserved and sent as headroom. */
  reasoningReserveTokens?: Partial<Record<AiStage, number>>
  timeoutMs?: number
}

/**
 * OpenRouter, OpenAI-compatible Chat Completions.
 *
 * Structured outputs: `response_format = { type: "json_schema", json_schema: {
 * name, strict, schema } }`. Usage carries `cost` in credits, which are USD,
 * plus cached and reasoning token counts. Reasoning tokens are billed as output
 * and count against `max_tokens` on most endpoints, so the request ceiling is
 * the visible answer ceiling plus this route's reasoning allowance.
 */
export function openRouterProvider(
  apiKey: string,
  models: AiModels = OPENROUTER_MODELS,
  options: OpenRouterOptions = {},
): AiProvider {
  if (!apiKey) throw new ProviderError('no_key', 'OPENROUTER_API_KEY is not set')
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const routing = options.routing
  const reserveFor = (stage: AiStage, visibleMax: number) =>
    visibleMax + Math.max(0, options.reasoningReserveTokens?.[stage] ?? 0)
  const effortFor = (stage: AiStage) => options.reasoning?.[stage]

  return {
    name: 'openrouter',
    modelFor: (stage) => models[stage],
    effortFor,
    reserveOutputFor: reserveFor,
    async generate(request: GenerateRequest): Promise<GenerateResult> {
      refusePaid('openrouter', models[request.stage])
      const model = models[request.stage]
      const started = Date.now()
      const effort = effortFor(request.stage)
      const maxTokens = reserveFor(request.stage, request.maxOutputTokens)
      const provider = routing
        ? {
            ...(routing.order?.length ? { order: routing.order } : {}),
            ...(routing.only?.length ? { only: routing.only } : {}),
            ...(routing.ignore?.length ? { ignore: routing.ignore } : {}),
            ...(routing.allowFallbacks !== undefined ? { allow_fallbacks: routing.allowFallbacks } : {}),
            ...(routing.requireParameters !== undefined ? { require_parameters: routing.requireParameters } : {}),
            ...(routing.dataCollection ? { data_collection: routing.dataCollection } : {}),
            ...(routing.sort ? { sort: routing.sort } : {}),
          }
        : undefined
      const body = await postJson(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model,
          messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: request.user },
          ],
          max_tokens: maxTokens,
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: `plattr_${request.stage}`,
              strict: true,
              schema: request.schema,
            },
          },
          ...(effort ? { reasoning: { effort } } : {}),
          ...(provider && Object.keys(provider).length ? { provider } : {}),
        },
        { authorization: `Bearer ${apiKey}` },
        timeoutMs,
        'OpenRouter',
      )
      const choices = Array.isArray(body?.choices) ? (body.choices as Record<string, unknown>[]) : []
      const choice = choices[0]
      if (!choice) {
        throw new ProviderError('parse', messageOf(body, 'OpenRouter returned no choices.'))
      }
      if (choice.finish_reason === 'length') {
        throw new ProviderError('truncated', 'The design answer was cut off at the token limit.')
      }
      if (choice.finish_reason === 'error') {
        throw new ProviderError('refused', messageOf(choice, 'The upstream provider stopped with an error.'))
      }
      const providerServed =
        typeof body?.provider === 'string'
          ? body.provider
          : typeof choice.provider === 'string'
            ? choice.provider
            : undefined
      // Attribution is part of the measurement. A pinned route that is served
      // by anything else is not the comparison that was authorised, so the
      // answer is refused rather than recorded against the wrong vendor.
      if (options.expectedProvider) {
        if (!providerServed) {
          throw new ProviderError(
            'provider_mismatch',
            `OpenRouter did not report which endpoint served this call, so ${options.expectedProvider} could not be confirmed. The answer was discarded.`,
          )
        }
        if (providerServed.toLowerCase() !== options.expectedProvider.toLowerCase()) {
          throw new ProviderError(
            'provider_mismatch',
            `OpenRouter served this call from ${providerServed}, not ${options.expectedProvider}. The route is pinned; the answer was discarded.`,
          )
        }
      }
      const json = parseJson(messageText(choice.message as Record<string, unknown> | undefined))
      const usageRaw = (body?.usage ?? {}) as Record<string, unknown>
      const promptDetails = (usageRaw.prompt_tokens_details ?? {}) as Record<string, unknown>
      const completionDetails = (usageRaw.completion_tokens_details ?? {}) as Record<string, unknown>
      const usage: Usage = {
        inputTokens: count(usageRaw.prompt_tokens),
        cachedInputTokens: count(promptDetails.cached_tokens),
        outputTokens: count(usageRaw.completion_tokens),
        reasoningTokens: count(completionDetails.reasoning_tokens),
      }
      const reported =
        typeof usageRaw.cost === 'number' && Number.isFinite(usageRaw.cost) && usageRaw.cost >= 0
          ? usageRaw.cost
          : undefined
      return {
        json,
        usage,
        model,
        modelServed: typeof body?.model === 'string' ? body.model : undefined,
        provider: 'openrouter',
        providerServed,
        latencyMs: Date.now() - started,
        requestId: typeof body?.id === 'string' ? body.id : '',
        costUsd: reported ?? costUsd(model, usage),
        reportedCostUsd: reported,
      }
    },
  }
}


/* ------------------------------------------------------------------------- *
 * Zero-cost providers.
 *
 * Both adapters refuse a call before it is sent unless `assertZeroCost` accepts
 * the exact provider and model, and both reserve from the shared quota ledger
 * first. A call that would cross a free allowance throws `QuotaExhaustedError`
 * with the reset time instead of being attempted, so Plattr pauses rather than
 * spends. Every result carries `costUsd: 0` and `billingMode: 'free'`.
 * ------------------------------------------------------------------------- */

export type ZeroCostOptions = {
  /** Shared, store-backed quota accounting. Required by the route builder. */
  quota?: QuotaLedger
  reasoning?: Partial<Record<AiStage, ReasoningEffort>>
  /** Billed output above the visible ceiling, reserved and sent as headroom. */
  reasoningReserveTokens?: Partial<Record<AiStage, number>>
  timeoutMs?: number
}

/** Tokens reserved for a call: prompt + schema + a fixed margin for the input
 *  half, and the billed output ceiling for the other. Deliberately an upper
 *  bound; settlement uses the provider's reported usage. The two halves stay
 *  separate because an output token costs more than twice an input token on
 *  Cloudflare's Neuron table. */
function reserveTokens(
  system: string,
  user: string,
  schema: Record<string, unknown>,
  outputTokens: number,
): { inputTokens: number; outputTokens: number } {
  return {
    inputTokens:
      estimateTokens(`${system}\n${user}`) + estimateTokens(JSON.stringify(schema)) + 900,
    outputTokens: Math.max(0, outputTokens),
  }
}

function chatCompletionUsage(body: Record<string, unknown>): Usage {
  const usageRaw = (body?.usage ?? {}) as Record<string, unknown>
  const promptDetails = (usageRaw.prompt_tokens_details ?? {}) as Record<string, unknown>
  const completionDetails = (usageRaw.completion_tokens_details ?? {}) as Record<string, unknown>
  return {
    inputTokens: count(usageRaw.prompt_tokens),
    cachedInputTokens: count(promptDetails.cached_tokens),
    outputTokens: count(usageRaw.completion_tokens),
    reasoningTokens: count(completionDetails.reasoning_tokens),
  }
}

/**
 * What the response body establishes before any judgement about its content.
 *
 * Usage is read first because it decides the settlement even when the answer is
 * unusable: a truncated, malformed or refused answer still consumed tokens the
 * provider counted. The problem is returned rather than thrown, so the adapter
 * can settle the attempt before it fails. One parser serves Groq and Workers AI.
 */
function auditChatCompletion(
  body: Record<string, unknown>,
  label: string,
): { usage: Usage; json?: unknown; problem?: ProviderError } {
  const usage = chatCompletionUsage(body)
  const choices = Array.isArray(body?.choices) ? (body.choices as Record<string, unknown>[]) : []
  const choice = choices[0]
  if (!choice) {
    return { usage, problem: new ProviderError('parse', messageOf(body, `${label} returned no choices.`)) }
  }
  if (choice.finish_reason === 'length') {
    return { usage, problem: new ProviderError('truncated', 'The design answer was cut off at the token limit.') }
  }
  if (choice.finish_reason === 'error' || choice.finish_reason === 'content_filter') {
    return { usage, problem: new ProviderError('refused', messageOf(choice, 'The provider stopped the answer.')) }
  }
  try {
    return { usage, json: parseJson(messageText(choice.message as Record<string, unknown> | undefined)) }
  } catch (error) {
    return {
      usage,
      problem:
        error instanceof ProviderError
          ? error
          : new ProviderError('parse', 'The provider answer could not be read.'),
    }
  }
}

/**
 * Settle one attempt against what the provider says it consumed.
 *
 * Reported usage is authoritative even when the answer was refused: those
 * tokens were spent. With no usage at all the reservation stands untouched —
 * returning it would hand back allowance that was very likely consumed.
 */
async function settleAttempt(
  quota: QuotaLedger,
  reservation: QuotaReservation,
  spec: FreeModel,
  usage: Usage,
): Promise<void> {
  const reported = usage.inputTokens + usage.outputTokens
  if (reported <= 0) return
  await quota.settle(reservation, {
    tokens: reported,
    neurons: neuronsFor(spec, usage.inputTokens, usage.outputTokens),
  })
}

/**
 * The reservation's fate when no answer arrives at all.
 *
 * An HTTP status means the provider answered and refused that attempt, so the
 * reservation is given back. A timeout or a dropped connection is different:
 * the request may already have been counted at the provider. In that case the
 * reservation is deliberately kept, over-stating the day rather than silently
 * releasing quota that may have been used.
 */
async function abandonAttempt(
  quota: QuotaLedger,
  spec: FreeModel,
  reservation: QuotaReservation,
  error: unknown,
): Promise<void> {
  if (!(error instanceof ProviderError) || error.status === undefined) return
  if (error.status === 429) {
    await quota.noteRateLimit(spec, new Date(Date.now() + (error.retryAfterMs ?? 60_000)))
  }
  await quota.release(reservation)
}

/**
 * GroqCloud, free plan, OpenAI-compatible Chat Completions.
 *
 * `response_format.json_schema.strict` gives constrained decoding on
 * `openai/gpt-oss-120b`, which is why the design pipeline can still demand an
 * exact `DesignSet`. The free plan's 8,000 tokens/minute is the reason the
 * design stage lives on Cloudflare instead: a full design call does not fit.
 */
export function groqProvider(
  apiKey: string,
  models: AiModels = { understand: 'openai/gpt-oss-120b', design: 'openai/gpt-oss-120b', copy: 'openai/gpt-oss-120b' },
  options: ZeroCostOptions = {},
): AiProvider {
  if (!apiKey) throw new ProviderError('no_key', 'GROQ_API_KEY is not set')
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const effortFor = (stage: AiStage) => options.reasoning?.[stage]
  const reserveFor = (stage: AiStage, visibleMax: number) =>
    visibleMax + Math.max(0, options.reasoningReserveTokens?.[stage] ?? 0)

  return {
    name: 'groq',
    modelFor: (stage) => models[stage],
    effortFor,
    reserveOutputFor: reserveFor,
    async generate(request: GenerateRequest): Promise<GenerateResult> {
      const model = models[request.stage]
      const spec: FreeModel = assertZeroCost({ provider: 'groq', model })
      const outputTokens = reserveFor(request.stage, request.maxOutputTokens)
      const started = Date.now()
      // Input and output both count against the ceiling, so the reservation is
      // the same upper bound the request is built from, at the output ceiling
      // this call is allowed to use.
      const reserved = reserveTokens(request.system, request.user, request.schema, outputTokens)
      const actualReservation = options.quota ? await options.quota.reserve(spec, reserved) : null
      const effort = effortFor(request.stage)
      let body: Record<string, unknown> | null
      try {
        body = await postJson(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            model,
            messages: [
              { role: 'system', content: request.system },
              { role: 'user', content: request.user },
            ],
            max_completion_tokens: outputTokens,
            response_format: {
              type: 'json_schema',
              json_schema: { name: `plattr_${request.stage}`, strict: true, schema: request.schema },
            },
            ...(effort ? { reasoning_effort: effort } : {}),
          },
          { authorization: `Bearer ${apiKey}` },
          timeoutMs,
          'Groq',
        )
      } catch (error) {
        if (actualReservation && options.quota)
          await abandonAttempt(options.quota, spec, actualReservation, error)
        throw error
      }
      // The response arrived, so parsing and validation happen inside the
      // settlement lifecycle: whatever the body is, the attempt is accounted
      // for before the caller sees a result or an error.
      const audited = auditChatCompletion(body ?? {}, 'Groq')
      if (actualReservation && options.quota)
        await settleAttempt(options.quota, actualReservation, spec, audited.usage)
      if (audited.problem) throw audited.problem
      const { usage } = audited
      return {
        json: audited.json,
        usage,
        model,
        modelServed: typeof body?.model === 'string' ? body.model : undefined,
        provider: 'groq',
        providerServed: 'groq',
        latencyMs: Date.now() - started,
        requestId: typeof body?.id === 'string' ? body.id : '',
        costUsd: 0,
      }
    },
  }
}

/**
 * Cloudflare Workers AI, free allocation, OpenAI-compatible Chat Completions.
 *
 * The free plan has no overage: the daily Neuron pool simply stops. That is the
 * strongest form of the guarantee — even a bug here cannot produce an invoice.
 * The account ID is part of the URL; the token needs Workers AI read/run.
 */
export function workersAiProvider(
  auth: { accountId: string; apiToken: string },
  models: AiModels = {
    understand: '@cf/openai/gpt-oss-120b',
    design: '@cf/openai/gpt-oss-120b',
    copy: '@cf/openai/gpt-oss-120b',
  },
  options: ZeroCostOptions = {},
): AiProvider {
  if (!auth.accountId) throw new ProviderError('no_key', 'CLOUDFLARE_ACCOUNT_ID is not set')
  if (!auth.apiToken) throw new ProviderError('no_key', 'CLOUDFLARE_API_TOKEN is not set')
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const effortFor = (stage: AiStage) => options.reasoning?.[stage]
  const reserveFor = (stage: AiStage, visibleMax: number) =>
    visibleMax + Math.max(0, options.reasoningReserveTokens?.[stage] ?? 0)
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(
    auth.accountId,
  )}/ai/v1/chat/completions`

  return {
    name: 'cloudflare',
    modelFor: (stage) => models[stage],
    effortFor,
    reserveOutputFor: reserveFor,
    async generate(request: GenerateRequest): Promise<GenerateResult> {
      const model = models[request.stage]
      const spec = assertZeroCost({ provider: 'cloudflare', model })
      const outputTokens = reserveFor(request.stage, request.maxOutputTokens)
      const reserved = reserveTokens(request.system, request.user, request.schema, outputTokens)
      const started = Date.now()
      const reservation = options.quota ? await options.quota.reserve(spec, reserved) : null
      const effort = effortFor(request.stage)
      let body: Record<string, unknown> | null
      try {
        body = await postJson(
          url,
          {
            model,
            messages: [
              { role: 'system', content: request.system },
              { role: 'user', content: request.user },
            ],
            max_tokens: outputTokens,
            response_format: {
              type: 'json_schema',
              json_schema: { name: `plattr_${request.stage}`, strict: true, schema: request.schema },
            },
            ...(effort ? { reasoning_effort: effort } : {}),
          },
          { authorization: `Bearer ${auth.apiToken}` },
          timeoutMs,
          'Cloudflare Workers AI',
        )
      } catch (error) {
        if (reservation && options.quota)
          await abandonAttempt(options.quota, spec, reservation, error)
        throw error
      }
      // Parsed and settled together: a refusal, an empty answer or a truncated
      // one is charged what the provider reported, never left half-accounted.
      const audited = auditChatCompletion(body ?? {}, 'Cloudflare Workers AI')
      if (reservation && options.quota)
        await settleAttempt(options.quota, reservation, spec, audited.usage)
      if (audited.problem) throw audited.problem
      const { usage } = audited
      return {
        json: audited.json,
        usage,
        model,
        modelServed: typeof body?.model === 'string' ? body.model : undefined,
        provider: 'cloudflare',
        providerServed: 'cloudflare',
        latencyMs: Date.now() - started,
        requestId: typeof body?.id === 'string' ? body.id : '',
        costUsd: 0,
      }
    },
  }
}

/**
 * One pipeline over several providers: Plattr sends the small stages to Groq and
 * the design set to Cloudflare, because Groq's free 8,000 tokens/minute cannot
 * carry a full design call. Each delegate keeps its own guard and its own quota
 * reservation, so a mix cannot hide a breach.
 */
export function stagedProvider(byStage: Record<AiStage, AiProvider>): AiProvider {
  return {
    name: 'mixed',
    modelFor: (stage) => byStage[stage].modelFor(stage),
    effortFor: (stage) => byStage[stage].effortFor?.(stage),
    maxOutputFor: (stage) => byStage[stage].maxOutputFor?.(stage),
    reserveOutputFor: (stage, visibleMax) =>
      byStage[stage].reserveOutputFor?.(stage, visibleMax) ?? visibleMax,
    generate: (request) => byStage[request.stage].generate(request),
  }
}

/**
 * The zero-cost provider for an environment, or null when a required free key is
 * absent. Null is a normal state: nothing is attempted and Plattr keeps its
 * deterministic fallback. There is no paid provider to fall back to, by design.
 */
export function providerFromEnv(
  env: Record<string, string | undefined>,
  options: { quota?: QuotaLedger } = {},
): AiProvider | null {
  const groqKey = env.GROQ_API_KEY?.trim()
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim()
  const apiToken = env.CLOUDFLARE_API_TOKEN?.trim()
  if (!groqKey || !accountId || !apiToken) return null
  const quota = options.quota
  if (!quota) {
    throw new Error(
      'A shared quota ledger is required: ZERO_COST_MODE never calls a provider from an in-memory counter.',
    )
  }
  const groq = groqProvider(groqKey, undefined, { quota })
  const cloudflare = workersAiProvider({ accountId, apiToken }, undefined, { quota })
  return stagedProvider({ understand: groq, design: cloudflare, copy: groq })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Spend hooks around one HTTP attempt. A retry is a second billable request, so
 * the pipeline reserves each attempt separately instead of reserving once and
 * hoping the retry is free.
 */
export type AttemptGuard = {
  /** Throws when this attempt's reservation does not fit the budget. */
  begin(): void
  /** Releases the reservation and books what the attempt actually cost. */
  end(result?: GenerateResult): void
}

/** One retry, only for transport failures, timeouts, 429 and 5xx. A schema or
 *  grounding failure is never retried here: more freedom is not the fix. */
export async function generateWithRetry(
  provider: AiProvider,
  request: GenerateRequest,
  retries = 1,
  guard?: AttemptGuard,
): Promise<GenerateResult> {
  for (let attempt = 0; ; attempt += 1) {
    guard?.begin()
    let result: GenerateResult | undefined
    try {
      result = await provider.generate(request)
    } catch (error) {
      guard?.end()
      const retryable = error instanceof ProviderError && error.retryable
      if (!retryable || attempt >= retries) throw error
      const delay = error.retryAfterMs ?? 500 * (attempt + 1)
      await sleep(delay)
      continue
    }
    guard?.end(result)
    if (!result) throw new ProviderError('transport', 'The provider returned nothing.')
    return result
  }
}
