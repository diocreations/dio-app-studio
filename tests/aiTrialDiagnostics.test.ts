import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { DesignSetSchema, jsonSchemaOf } from '../src/worker/ai/contracts'
import {
  DIAGNOSTIC_EXCERPT_LIMIT,
  ProviderError,
  sanitizeExcerpt,
  type AiProvider,
} from '../src/worker/ai/provider'
import { TRIAL_ID, TRIAL_PROVIDERS, memoryTrialStore, trialProvider } from '../src/worker/ai/trial'
import { runTrialGeneration } from '../src/worker/ai/trialRun'
import { briefFrom, copySetFor, crawlSpec, sampleDesignSet } from './freeAiMock'

/**
 * Why a provider refused, kept without its secrets.
 *
 * These tests drive the real trial adapters through a stubbed `fetch`: no
 * provider is contacted, nothing is billed, and the assertions are about what
 * reaches the report — the status, the provider's own classification, a bounded
 * excerpt, and the request facts that make a failure diagnosable later.
 */

const originalFetch = globalThis.fetch

const GROQ_KEY = 'gsk-diagnostic-test-key-4c1f9a2e'
const OPENROUTER_KEY = 'sk-or-diagnostic-test-key-7b2d'

function restore(): void {
  globalThis.fetch = originalFetch
}

function respond(body: unknown, status = 400, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

const VALIDATION_MESSAGE =
  "Generated JSON does not match the expected schema. Please adjust your prompt. See 'failed_generation' for more details. Error: jsonschema: '/concepts/0' does not validate with /properties/concepts/items/required: missing properties: 'id', 'name', 'rhythm'"

const FAILED_GENERATION =
  '{"thesis":"Workwear that ages well","concepts":[{"type":{"direction":"editorial"},"palette":{"bg":"#ffffff"}}]}'

function jsonValidateFailed(failedGeneration = FAILED_GENERATION): Response {
  return respond({
    error: {
      message: VALIDATION_MESSAGE,
      type: 'invalid_request_error',
      code: 'json_validate_failed',
      failed_generation: failedGeneration,
    },
  })
}

const groqProvider = (): AiProvider => trialProvider(TRIAL_PROVIDERS.find((entry) => entry.id === 'groq')!, GROQ_KEY)

const designRequest = (provider: AiProvider) => ({
  stage: 'design' as const,
  system: 'design system prompt',
  user: 'design user prompt',
  schema: jsonSchemaOf(DesignSetSchema),
  maxOutputTokens: 9000,
})

describe('a provider refusal keeps its classification, bounded and sanitized', () => {
  test('status, code, type and failed_generation survive into diagnostics', async () => {
    globalThis.fetch = (async () => jsonValidateFailed()) as unknown as typeof fetch
    const provider = groqProvider()
    let caught: ProviderError | undefined
    try {
      await provider.generate(designRequest(provider))
    } catch (error) {
      caught = error as ProviderError
    } finally {
      restore()
    }
    expect(caught).toBeInstanceOf(ProviderError)
    expect(caught?.code).toBe('http')
    expect(caught?.status).toBe(400)
    expect(caught?.retryable).toBe(false)
    // No usage in the body: the charge is not established, so it stays unknown.
    expect(caught?.billing).toBe('unknown')
    const diagnostics = caught?.diagnostics
    expect(diagnostics?.status).toBe(400)
    expect(diagnostics?.code).toBe('json_validate_failed')
    expect(diagnostics?.type).toBe('invalid_request_error')
    expect(diagnostics?.failedGeneration).toBe(FAILED_GENERATION)
    expect(diagnostics?.usageReported).toBe(false)
    expect(diagnostics?.bodyExcerpt).toContain('json_validate_failed')
    // The excerpt of the error itself does not duplicate the whole generation.
    expect(diagnostics?.bodyExcerpt).not.toContain('Workwear that ages well')
  })

  test('the request facts recorded are the ones the call was sent with', async () => {
    globalThis.fetch = (async () => jsonValidateFailed()) as unknown as typeof fetch
    const provider = groqProvider()
    const request = designRequest(provider)
    let caught: ProviderError | undefined
    try {
      await provider.generate(request)
    } catch (error) {
      caught = error as ProviderError
    } finally {
      restore()
    }
    const served = provider.reserveOutputFor?.('design', request.maxOutputTokens)
    expect(caught?.diagnostics?.request.maxOutputTokens).toBe(served)
    expect(caught?.diagnostics?.request.maxOutputTokens).toBeGreaterThan(request.maxOutputTokens)
    expect(caught?.diagnostics?.request.reasoningEffort).toBe(provider.effortFor?.('design'))
    expect(caught?.diagnostics?.request.schemaDigest).toMatch(/^[a-f0-9]{64}$/)
    expect(caught?.diagnostics?.request.schemaDigest).toBe(
      createHash('sha256').update(JSON.stringify(request.schema)).digest('hex'),
    )
  })

  test('keys, Bearer tokens and key-like values are redacted from the excerpt', async () => {
    const leaked = `authorization: Bearer sk-or-v1-abcdefgh12345678 gsk-livekey1234567890 {"api_key":"plain-secret-value"}`
    globalThis.fetch = (async () => jsonValidateFailed(leaked)) as unknown as typeof fetch
    const provider = groqProvider()
    let caught: ProviderError | undefined
    try {
      await provider.generate(designRequest(provider))
    } catch (error) {
      caught = error as ProviderError
    } finally {
      restore()
    }
    const excerpt = caught?.diagnostics?.failedGeneration ?? ''
    const body = caught?.diagnostics?.bodyExcerpt ?? ''
    expect(excerpt).toContain('[redacted]')
    for (const text of [excerpt, body]) {
      expect(text).not.toContain('sk-or-v1-abcdefgh12345678')
      expect(text).not.toContain('gsk-livekey1234567890')
      expect(text).not.toContain('plain-secret-value')
      expect(text).not.toContain(GROQ_KEY)
      expect(text).not.toContain('Bearer sk-or')
    }
  })

  test('diagnostic excerpts are capped at 2,000 characters', async () => {
    const long = `{"concepts":[${'"padding":"'.concat('x'.repeat(6000), '"}')}`
    globalThis.fetch = (async () => jsonValidateFailed(long)) as unknown as typeof fetch
    const provider = groqProvider()
    let caught: ProviderError | undefined
    try {
      await provider.generate(designRequest(provider))
    } catch (error) {
      caught = error as ProviderError
    } finally {
      restore()
    }
    expect(caught?.diagnostics?.failedGeneration?.length).toBeLessThanOrEqual(
      DIAGNOSTIC_EXCERPT_LIMIT,
    )
    expect(caught?.diagnostics?.failedGeneration?.endsWith('…[truncated]')).toBe(true)
    expect(caught?.diagnostics?.bodyExcerpt?.length).toBeLessThanOrEqual(DIAGNOSTIC_EXCERPT_LIMIT)
    // The sanitizer is the same rule, exercised directly on an unbounded value.
    expect(sanitizeExcerpt('y'.repeat(9000))).toHaveLength(DIAGNOSTIC_EXCERPT_LIMIT)
    expect(sanitizeExcerpt(undefined)).toBeUndefined()
  })
})

describe('diagnostics carry only approved provider fields', () => {
  /** A value that looks like nothing in particular: only an unknown field can carry it. */
  const UNKNOWN_SECRET = 'hunter2-not-a-real-key-9f8e7d'
  const generateAndCatch = async (response: Response): Promise<ProviderError | undefined> => {
    globalThis.fetch = (async () => response) as unknown as typeof fetch
    const provider = groqProvider()
    let caught: ProviderError | undefined
    try {
      await provider.generate(designRequest(provider))
    } catch (error) {
      caught = error as ProviderError
    } finally {
      restore()
    }
    return caught
  }

  test('unknown and nested provider fields are excluded from the excerpt', async () => {
    const caught = await generateAndCatch(
      respond({
        error: {
          message: VALIDATION_MESSAGE,
          code: 'json_validate_failed',
          type: 'invalid_request_error',
          param: 'response_format.json_schema',
          failed_generation: FAILED_GENERATION,
          internal_trace: UNKNOWN_SECRET,
          meta: { nested: { leaked: UNKNOWN_SECRET } },
          headers: { authorization: 'Bearer sk-abcdefgh12345678' },
        },
        request: { echoed_body: UNKNOWN_SECRET },
      }),
    )
    const diagnostics = caught?.diagnostics
    // The approved details are still there.
    expect(diagnostics?.code).toBe('json_validate_failed')
    expect(diagnostics?.type).toBe('invalid_request_error')
    expect(diagnostics?.bodyExcerpt).toContain('json_validate_failed')
    expect(diagnostics?.bodyExcerpt).toContain('response_format.json_schema')
    // Nothing outside the allow-list is copied, not even sanitized.
    expect(diagnostics?.bodyExcerpt).not.toContain(UNKNOWN_SECRET)
    expect(diagnostics?.bodyExcerpt).not.toContain('internal_trace')
    expect(diagnostics?.bodyExcerpt).not.toContain('nested')
    expect(diagnostics?.bodyExcerpt).not.toContain('authorization')
    expect(diagnostics?.bodyExcerpt).not.toContain('echoed_body')
    // `failed_generation` is kept separately, never folded into the excerpt.
    expect(diagnostics?.bodyExcerpt).not.toContain('Workwear that ages well')
    expect(diagnostics?.failedGeneration).toBe(FAILED_GENERATION)
    // The diagnostics object has exactly the approved shape and nothing else.
    expect(Object.keys(diagnostics ?? {}).sort()).toEqual([
      'bodyExcerpt',
      'code',
      'failedGeneration',
      'request',
      'status',
      'type',
      'usageReported',
    ])
  })

  test('a fake secret inside an unknown field never reaches the report', async () => {
    const caught = await generateAndCatch(
      respond({
        error: {
          message: VALIDATION_MESSAGE,
          code: 'json_validate_failed',
          type: 'invalid_request_error',
          internal_trace: UNKNOWN_SECRET,
        },
      }),
    )
    expect(JSON.stringify(caught?.diagnostics)).not.toContain(UNKNOWN_SECRET)
    // A run is the exact object the report writes, so this covers report.json
    // and the fields REPORT.md reads from it.
    const { run } = await runWithGateway(() =>
      respond({
        error: {
          message: VALIDATION_MESSAGE,
          code: 'json_validate_failed',
          type: 'invalid_request_error',
          internal_trace: UNKNOWN_SECRET,
          meta: { leaked: UNKNOWN_SECRET },
        },
      }),
    )
    const serialized = JSON.stringify(run)
    expect(serialized).not.toContain(UNKNOWN_SECRET)
    expect(serialized).not.toContain('internal_trace')
    expect(serialized).toContain('json_validate_failed')
  })

  test('code and type accept only classification identifiers', async () => {
    const valid = await generateAndCatch(
      respond({
        error: {
          message: VALIDATION_MESSAGE,
          code: 'json_validate_failed',
          type: 'invalid_request_error',
        },
      }),
    )
    // Legitimate classifications survive unchanged.
    expect(valid?.diagnostics?.code).toBe('json_validate_failed')
    expect(valid?.diagnostics?.type).toBe('invalid_request_error')

    // Each rejected value carries a marker that nothing else in a report uses.
    const rejected = [
      { value: 'ghp_not-a-real-token-4c1f9a2e7b', marker: 'ghp_' },
      { value: 'invalid request error', marker: 'request error' },
      { value: ' invalid_request_error', marker: 'invalid_request_error' },
      { value: 'invalid_request_error ', marker: 'invalid_request_error' },
      { value: 'invalid_request_error\nX-Injected: 1', marker: 'X-Injected' },
      { value: 'https://example.com/errors/invalid_request_error', marker: 'example.com' },
      { value: '{"code":"json_validate_failed"}', marker: 'json_validate_failed' },
      { value: `invalid_${'x'.repeat(200)}`, marker: 'xxx' },
      { value: 'sk-live-abcdefgh1234', marker: 'sk-live' },
    ]
    for (const { value, marker } of rejected) {
      const caught = await generateAndCatch(
        respond({ error: { message: VALIDATION_MESSAGE, code: value, type: value } }),
      )
      const diagnostics = caught?.diagnostics
      expect(diagnostics?.code).toBeUndefined()
      expect(diagnostics?.type).toBeUndefined()
      expect(JSON.stringify(diagnostics)).not.toContain(marker)
      // A rejected classification leaves only the request facts behind.
      expect(Object.keys(diagnostics ?? {}).sort()).toEqual(['request', 'status', 'usageReported'])
    }

    // Nothing rejected reaches the report or the reason it states.
    const { run } = await runWithGateway(() =>
      respond({
        error: {
          message: 'the request was rejected',
          code: 'ghp_not-a-real-token-4c1f9a2e7b',
          type: 'ghp_not-a-real-token-4c1f9a2e7b',
        },
      }),
    )
    expect(JSON.stringify(run)).not.toContain('ghp_')
    expect(run.detail).not.toContain('ghp_')
    expect(run.detail).toContain('HTTP 400')
  })

  test('a secret inside the provider message never reaches diagnostics or the report', async () => {
    // `ghp_` matches no redaction pattern, so only excluding `message` keeps it out.
    const MESSAGE_SECRET = 'ghp_not-a-real-token-4c1f9a2e7b'
    const caught = await generateAndCatch(
      respond({
        error: {
          message: `Invalid request: Authorization: Bearer ${MESSAGE_SECRET}`,
          code: 'json_validate_failed',
          type: 'invalid_request_error',
        },
      }),
    )
    expect(JSON.stringify(caught?.diagnostics)).not.toContain(MESSAGE_SECRET)
    expect(caught?.diagnostics?.bodyExcerpt ?? '').not.toContain('Invalid request')
    expect(caught?.diagnostics?.bodyExcerpt).toContain('json_validate_failed')
    // The report is written from the run, so this covers report.json and the
    // fields REPORT.md renders.
    const { run } = await runWithGateway(() =>
      respond({
        error: {
          message: `echo ${MESSAGE_SECRET}`,
          code: 'json_validate_failed',
          type: 'invalid_request_error',
        },
      }),
    )
    expect(JSON.stringify(run)).not.toContain(MESSAGE_SECRET)
    // The reported reason is built from the allow-listed classification.
    expect(run.detail).not.toContain(MESSAGE_SECRET)
    expect(run.detail).toContain('HTTP 400')
    expect(run.detail).toContain('json_validate_failed')
  })

  test('param is kept only when it is a parameter path', async () => {
    const valid = await generateAndCatch(
      respond({
        error: {
          message: VALIDATION_MESSAGE,
          code: 'json_validate_failed',
          type: 'invalid_request_error',
          param: 'concepts[0].name',
        },
      }),
    )
    // Valid code, type and param all remain available.
    expect(valid?.diagnostics?.code).toBe('json_validate_failed')
    expect(valid?.diagnostics?.type).toBe('invalid_request_error')
    expect(valid?.diagnostics?.bodyExcerpt).toContain('concepts[0].name')

    const rejected = [
      'Authorization: Bearer sk-live-abcdefgh1234',
      '{"api_key":"plain-secret-value"}',
      'https://example.com/?token=plain-secret-value',
      `concepts.${'x'.repeat(300)}`,
      'concepts[0].name\nX-Injected: 1',
      'concepts[0].name plain-secret-value',
    ]
    for (const param of rejected) {
      const caught = await generateAndCatch(
        respond({
          error: {
            message: VALIDATION_MESSAGE,
            code: 'json_validate_failed',
            type: 'invalid_request_error',
            param,
          },
        }),
      )
      const excerpt = caught?.diagnostics?.bodyExcerpt ?? ''
      expect(excerpt).not.toContain('param')
      expect(excerpt).not.toContain('plain-secret-value')
      expect(excerpt).not.toContain('Authorization')
      // A rejected param does not disturb the rest of the classification.
      expect(caught?.diagnostics?.code).toBe('json_validate_failed')
      expect(caught?.diagnostics?.type).toBe('invalid_request_error')
    }
  })
})

/**
 * One business, one arm, a stubbed gateway. `design` answers however the test
 * asks it to; `understand` and `copy` always succeed so the run reaches design.
 */
async function runWithGateway(
  answerForDesign: (attempt: number) => Response,
): Promise<{ run: Awaited<ReturnType<typeof runTrialGeneration>>; designRequests: number }> {
  const { spec, dossier } = await crawlSpec()
  const brief = briefFrom(dossier)
  const set = sampleDesignSet()
  let designRequests = 0
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as {
      model: string
      response_format: { json_schema: { name: string } }
    }
    const stage = body.response_format.json_schema.name.replace('plattr_', '')
    if (stage === 'understand') {
      return respond(
        {
          id: 'gen-understand',
          model: body.model,
          choices: [{ message: { role: 'assistant', content: JSON.stringify(brief) }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1000, completion_tokens: 400 },
        },
        200,
      )
    }
    if (stage === 'design') {
      designRequests += 1
      return answerForDesign(designRequests)
    }
    return respond(
      {
        id: 'gen-copy',
        model: body.model,
        choices: [
          { message: { role: 'assistant', content: JSON.stringify(copySetFor(set)) }, finish_reason: 'stop' },
        ],
        usage: { prompt_tokens: 800, completion_tokens: 300 },
      },
      200,
    )
  }) as unknown as typeof fetch
  const run = await runTrialGeneration({
    providerId: 'groq',
    spec,
    dossier,
    env: { GROQ_API_KEY: GROQ_KEY, OPENROUTER_API_KEY: OPENROUTER_KEY, PLATTR_AI_TRIAL: 'approved' },
    store: memoryTrialStore(),
  })
  restore()
  return { run, designRequests }
}

describe('reporting distinguishes failed calls from retries', () => {
  test('a 400 with no usage stays unknown, keeps its reservation and is not a retry', async () => {
    const { run, designRequests } = await runWithGateway(() => jsonValidateFailed())
    expect(designRequests).toBe(1)
    expect(run.status).toBe('failed')
    expect(run.attempts).toHaveLength(2)
    expect(run.attempts[1].stage).toBe('design')
    expect(run.attempts[1].ok).toBe(false)
    expect(run.attempts[1].billing).toBe('unknown')
    expect(run.attempts[1].costUsd).toBe(0)
    expect(run.attempts[1].retainedUsd).toBeGreaterThan(0)
    expect(run.attempts[1].diagnostics?.code).toBe('json_validate_failed')
    // Two attempts, one call record: the failed design attempt has none.
    expect(run.calls).toHaveLength(1)
    expect(run.verification.attemptsMade).toBe(2)
    expect(run.verification.retried).toBe(false)
    expect(run.verification.failedCalls).toBe(1)
    // Only the confirmed understand charge is booked; the design reservation is kept.
    expect(run.verification.chargedUsd).toBeGreaterThan(0)
    expect(run.verification.retainedUsd).toBeCloseTo(run.attempts[1].retainedUsd, 9)
    expect(run.verification.accountedUsd).toBeCloseTo(
      run.verification.chargedUsd + run.verification.retainedUsd,
      9,
    )
    expect(run.verification.chargedWithinReservation).toBe(true)
    expect(run.verification.withinHardCap).toBe(true)
  })

  test('a 503 that is retried once reports exactly one retry', async () => {
    const { run, designRequests } = await runWithGateway((attempt) =>
      attempt === 1
        ? respond({ error: { message: 'temporarily unavailable', type: 'server_error' } }, 503)
        : respond(
            {
              id: 'gen-design',
              model: 'openai/gpt-oss-120b',
              choices: [
                { message: { role: 'assistant', content: JSON.stringify(sampleDesignSet()) }, finish_reason: 'stop' },
              ],
              usage: { prompt_tokens: 2000, completion_tokens: 900 },
            },
            200,
          ),
    )
    expect(designRequests).toBe(2)
    expect(run.status).toBe('ai')
    expect(run.verification.attemptsMade).toBe(4)
    expect(run.verification.retried).toBe(true)
    expect(run.verification.failedCalls).toBe(1)
    expect(run.attempts[1].diagnostics?.status).toBe(503)
    expect(run.verification.withinHardCap).toBe(true)
  })

  test('several successful stages in one generation are not a retry', async () => {
    const { run } = await runWithGateway(() =>
      respond(
        {
          id: 'gen-design',
          model: 'openai/gpt-oss-120b',
          choices: [
            { message: { role: 'assistant', content: JSON.stringify(sampleDesignSet()) }, finish_reason: 'stop' },
          ],
          usage: { prompt_tokens: 2000, completion_tokens: 900 },
        },
        200,
      ),
    )
    expect(run.status).toBe('ai')
    expect(run.calls).toHaveLength(3)
    expect(run.verification.attemptsMade).toBe(3)
    expect(run.verification.retried).toBe(false)
    expect(run.verification.failedCalls).toBe(0)
  })

  test('the serialized run carries no credentials or authorization material', async () => {
    const { run } = await runWithGateway(() => jsonValidateFailed())
    const serialized = JSON.stringify(run)
    expect(serialized).not.toContain(GROQ_KEY)
    expect(serialized).not.toContain(OPENROUTER_KEY)
    expect(serialized).not.toContain('Bearer')
    expect(serialized).not.toContain('authorization')
    expect(serialized).toContain('json_validate_failed')
  })
})

describe('historical trial evidence is never rewritten', () => {
  /** Recorded before the second live attempt overwrote `live/`. */
  const historical: Record<string, string> = {
    'docs/qa/ai-trial-2026-11-23/live-attempt1-2026-11-23/REPORT.md':
      '9caf941862988d1fb89ac7be5475b23db250876cb1f0d8ee5755bde1ac15b473',
    'docs/qa/ai-trial-2026-11-23/live-attempt1-2026-11-23/report.json':
      'a6d598864a77006c7d153873f9122d151c1ca79f9853084413f4a093e2f18837',
  }

  test('the preserved November 23 report still matches its recorded digest', () => {
    let checked = 0
    for (const [path, digest] of Object.entries(historical)) {
      if (!existsSync(path)) continue
      expect(createHash('sha256').update(readFileSync(path)).digest('hex')).toBe(digest)
      checked += 1
    }
    // Absent evidence is skipped rather than asserted: the files are local and
    // untracked, but when present they must be byte-identical.
    expect(checked).toBeLessThanOrEqual(Object.keys(historical).length)
  })

  test('the cumulative ledger still holds both historical generations', () => {
    const ledger = '.chrome-qa/ai-trial-spend.sqlite'
    if (!existsSync(ledger)) return
    const db = new Database(ledger, { readonly: true })
    try {
      const row = db
        .prepare('SELECT generations, spent_micros FROM ai_trial_spend WHERE trial_id = ?')
        .get(TRIAL_ID) as { generations: number; spent_micros: number } | null
      expect(row).not.toBeNull()
      expect(row?.generations).toBeGreaterThanOrEqual(2)
      // The two stopped attempts spent more than zero and less than the pool.
      expect(row?.spent_micros).toBeGreaterThan(0)
      expect(row!.spent_micros).toBeLessThan(30_000_000)
    } finally {
      db.close()
    }
  })
})
