import { validateConcepts } from '../blueprints'
import type { AppSpec } from '../types'
import { compileConcept, type CompiledConcept } from './compile'
import {
  BusinessBriefSchema,
  CopySchema,
  DesignSetSchema,
  jsonSchemaOf,
  type BusinessBrief,
  type DesignSet,
} from './contracts'
import type { Dossier } from './dossier'
import type { Ledger } from './ledger'
import { estimateMaxUsd, estimateTokens } from './pricing'
import { copyPrompt, designPrompt, understandPrompt } from './prompts'
import {
  generateWithRetry,
  type AiProvider,
  type AiStage,
  type AttemptGuard,
  type BillingState,
  type GenerateResult,
} from './provider'
import { fatal, parseBrief, parseCopy, parseDesignSet, type Issue } from './validate'

/**
 * One cold generation: understand, design, write the words, compile, validate.
 *
 * There is no agent loop and no tool use. Each call has a hard output ceiling
 * and a reservation in the ledger; a failure stops at a named stage instead of
 * producing a partial application.
 */

const SCHEMAS: Record<AiStage, Record<string, unknown>> = {
  understand: jsonSchemaOf(BusinessBriefSchema),
  design: jsonSchemaOf(DesignSetSchema),
  copy: jsonSchemaOf(CopySchema),
}

export const MAX_OUTPUT_TOKENS: Record<AiStage, number> = {
  understand: 1800,
  design: 9000,
  copy: 2600,
}

export type CallRecord = {
  stage: AiStage
  provider: string
  /** The model the route asked for. */
  model: string
  /** The model the provider says answered. */
  modelServed?: string
  /** The upstream endpoint a gateway used. */
  providerServed?: string
  effort?: string
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningTokens: number
  /** HTTP attempts made, including a retry. */
  attempts: number
  /** Reserved across those attempts: the ceiling checked against both caps. */
  reservedUsd: number
  /** What the call was billed: provider-reported when available. */
  costUsd: number
  reportedCostUsd?: number
  latencyMs: number
  ok: boolean
}

/** One HTTP attempt, including a retry: what it reserved and what it charged. */
export type AttemptRecord = {
  stage: AiStage
  attempt: number
  reservedUsd: number
  /** Confirmed charge. An uncertain attempt records 0 here and the reservation
   *  in `retainedUsd`, so it cannot look free. */
  costUsd: number
  /** Reservation kept because the charge could not be established. */
  retainedUsd: number
  billing: BillingState
  ok: boolean
  /** The upstream endpoint, when the gateway reported one for this attempt. */
  servedProvider?: string
}

export type DesignRun = {
  brief: BusinessBrief
  set: DesignSet
  concepts: CompiledConcept[]
  calls: CallRecord[]
  /** Every attempt made, including failed and retried ones. */
  attempts: AttemptRecord[]
  /** What the budget must absorb: confirmed charges plus reservations retained
   *  for attempts whose charge could not be established. Summing `calls` here
   *  would refund a timed-out first attempt when its retry succeeds. */
  costUsd: number
  issues: Issue[]
  /** The optional copy pass was skipped to stay inside the soft limit. */
  softLimitReached: boolean
}

export class PipelineError extends Error {
  code: string
  issues: Issue[]
  /** Calls and attempts completed before the failure, for cost verification. */
  calls: CallRecord[] = []
  attempts: AttemptRecord[] = []

  constructor(code: string, message: string, issues: Issue[] = []) {
    super(message)
    this.name = 'PipelineError'
    this.code = code
    this.issues = issues
  }
}

type StageCall = { result: GenerateResult; attempts: number; reservedUsd: number }

async function callStage(
  provider: AiProvider,
  stage: AiStage,
  ledger: Ledger,
  attemptsLog: AttemptRecord[],
  request: { system: string; user: string; maxOutputTokens: number },
): Promise<StageCall> {
  const model = provider.modelFor(stage)
  // The reservation covers billed output, which for a reasoning model is the
  // visible answer plus the provider's thinking tokens. A gateway that counts
  // reasoning against `max_tokens` is sent the same allowance as headroom by
  // its adapter; a transport that does not is only reserved against it.
  const reserveOutput = provider.reserveOutputFor?.(stage, request.maxOutputTokens) ?? request.maxOutputTokens
  const reservation = estimateMaxUsd(
    model,
    estimateTokens(`${request.system}\n${request.user}`) + 900,
    reserveOutput,
    // The provider knows the price its route can be billed at; the global table
    // cannot, because the same model can be served by two gateways.
    provider.reservationPriceFor?.(model),
  )
  let attempts = 0
  let reservedUsd = 0
  // Each HTTP attempt, including a retry, takes its own reservation. A retry is
  // a second billable request, so one reservation for both would understate
  // the ceiling the trial actually approved.
  const guard: AttemptGuard = {
    begin() {
      if (!ledger.reserve(reservation)) {
        throw new PipelineError(
          'budget',
          `The ${stage} call (attempt ${attempts + 1}) would exceed the remaining budget (${reservation.toFixed(4)} USD reserved, ${ledger.remainingUsd().toFixed(2)} USD left).`,
        )
      }
      attempts += 1
      reservedUsd += reservation
      attemptsLog.push({
        stage,
        attempt: attempts,
        reservedUsd: reservation,
        costUsd: 0,
        retainedUsd: 0,
        billing: 'unknown',
        ok: false,
      })
    },
    end(result) {
      // Three cases, in order of certainty:
      //  - a confirmed charge is settled against the reservation;
      //  - a confirmed rejection before inference releases it;
      //  - anything else (timeout, dropped connection, 5xx, an answer without
      //    usable billing information) keeps the reservation as spent. A
      //    provider may have received and billed a request we never saw finish,
      //    so an unknown charge is never refunded.
      const billing: BillingState = result?.billing ?? 'billed'
      const charged =
        typeof result?.costUsd === 'number' && Number.isFinite(result.costUsd) && result.costUsd >= 0
          ? result.costUsd
          : undefined
      let settled: number | undefined
      let retained = 0
      if (billing === 'billed' && charged !== undefined) {
        ledger.settle(reservation, charged)
        settled = charged
      } else if (billing === 'not_billed') {
        ledger.settle(reservation, 0)
        settled = 0
      } else {
        ledger.retain(reservation)
        retained = reservation
      }
      const entry = attemptsLog[attemptsLog.length - 1]
      if (entry) {
        entry.billing = billing
        entry.costUsd = settled ?? 0
        entry.retainedUsd = retained
        entry.ok = result?.ok ?? false
        entry.servedProvider = result?.servedProvider
      }
    },
  }
  const result = await generateWithRetry(
    provider,
    {
      stage,
      system: request.system,
      user: request.user,
      schema: SCHEMAS[stage],
      maxOutputTokens: request.maxOutputTokens,
    },
    1,
    guard,
  )
  return { result, attempts, reservedUsd }
}

function record(
  call: GenerateResult,
  stage: AiStage,
  ok: boolean,
  spend: { attempts: number; reservedUsd: number },
  effort?: string,
): CallRecord {
  return {
    stage,
    provider: call.provider,
    model: call.model,
    modelServed: call.modelServed,
    providerServed: call.providerServed,
    effort,
    inputTokens: call.usage.inputTokens,
    cachedInputTokens: call.usage.cachedInputTokens,
    outputTokens: call.usage.outputTokens,
    reasoningTokens: call.usage.reasoningTokens ?? 0,
    attempts: spend.attempts,
    reservedUsd: spend.reservedUsd,
    costUsd: call.costUsd,
    reportedCostUsd: call.reportedCostUsd,
    latencyMs: call.latencyMs,
    ok,
  }
}

type PipelineInput = {
  provider: AiProvider
  dossier: Dossier
  spec: AppSpec
  ledger: Ledger
  /** Stop before the optional copy pass once this much has been spent. */
  softStopUsd?: number
}

/**
 * The pipeline, with the calls and attempts it managed to make kept alongside a
 * failure. A refused generation is still billed, so the accounting must survive
 * the throw.
 */
export async function runDesignPipeline(input: PipelineInput): Promise<DesignRun> {
  const spend: { calls: CallRecord[]; attempts: AttemptRecord[] } = { calls: [], attempts: [] }
  try {
    return await runPipeline(input, spend)
  } catch (error) {
    if (error instanceof PipelineError) {
      error.calls = spend.calls
      error.attempts = spend.attempts
    } else if (error instanceof Error) {
      // A provider failure that ends the run still happened after calls and
      // reservations; keep them available to the cost reconciliation.
      ;(error as Error & { attemptsSpent?: AttemptRecord[] }).attemptsSpent = spend.attempts
      ;(error as Error & { callsSpent?: CallRecord[] }).callsSpent = spend.calls
    }
    throw error
  }
}

async function runPipeline(
  input: PipelineInput,
  spend: { calls: CallRecord[]; attempts: AttemptRecord[] },
): Promise<DesignRun> {
  const { provider, dossier, spec, ledger } = input
  const calls = spend.calls
  const issues: Issue[] = []

  const understoodCall = await callStage(provider, 'understand', ledger, spend.attempts, {
    ...understandPrompt(dossier),
    maxOutputTokens: MAX_OUTPUT_TOKENS.understand,
  })
  const understood = understoodCall.result
  const briefResult = parseBrief(understood.json, dossier)
  calls.push(
    record(
      understood,
      'understand',
      Boolean(briefResult.value) && fatal(briefResult.issues).length === 0,
      understoodCall,
      provider.effortFor?.('understand'),
    ),
  )
  if (!briefResult.value || fatal(briefResult.issues).length) {
    throw new PipelineError('brief_invalid', 'The business brief failed validation.', briefResult.issues)
  }
  const brief = briefResult.value

  const designedCall = await callStage(provider, 'design', ledger, spend.attempts, {
    ...designPrompt(dossier, brief),
    maxOutputTokens: MAX_OUTPUT_TOKENS.design,
  })
  const designed = designedCall.result
  const setResult = parseDesignSet(designed.json, dossier)
  calls.push(
    record(
      designed,
      'design',
      Boolean(setResult.value) && fatal(setResult.issues).length === 0,
      designedCall,
      provider.effortFor?.('design'),
    ),
  )
  if (!setResult.value || fatal(setResult.issues).length) {
    throw new PipelineError('design_invalid', 'The design set failed validation.', setResult.issues)
  }
  const set = setResult.value
  issues.push(...setResult.issues)

  // Copy is an improvement, not a dependency. If it fails, the headings the
  // design set already carries are used; nothing is invented to replace them.
  // A trial that has reached its soft limit skips it for the same reason: the
  // design is already complete and validated, and the copy pass is optional.
  const softLimitReached =
    input.softStopUsd !== undefined &&
    ledger.spentUsd() + ledger.reservedUsd() >= input.softStopUsd
  if (softLimitReached) {
    issues.push({
      code: 'soft_limit',
      message: `The generation reached its $${input.softStopUsd!.toFixed(2)} soft limit after the design pass; the copy pass was skipped.`,
    })
  } else {
  try {
    const copiedCall = await callStage(provider, 'copy', ledger, spend.attempts, {
      ...copyPrompt(dossier, brief, set),
      maxOutputTokens: MAX_OUTPUT_TOKENS.copy,
    })
    const copied = copiedCall.result
    const copyResult = parseCopy(copied.json, set, dossier)
    calls.push(
      record(
        copied,
        'copy',
        Boolean(copyResult.value) && fatal(copyResult.issues).length === 0,
        copiedCall,
        provider.effortFor?.('copy'),
      ),
    )
    if (copyResult.value && !fatal(copyResult.issues).length) {
      const byId = new Map(copyResult.value.concepts.map((entry) => [entry.id, entry.headings]))
      for (const concept of set.concepts) {
        const headings = byId.get(concept.id)
        if (headings?.length) concept.content.headings = headings
      }
    } else {
      issues.push({ code: 'copy_failed', message: 'The copy pass was refused; the design set headings stand.' })
      issues.push(...copyResult.issues)
    }
  } catch (error) {
    issues.push({
      code: 'copy_failed',
      message: `The copy pass failed (${error instanceof Error ? error.message : 'unknown'}); the design set headings stand.`,
    })
  }
  }

  const concepts: CompiledConcept[] = []
  for (const concept of set.concepts) {
    try {
      concepts.push(compileConcept({ spec, brief, concept }))
    } catch (error) {
      throw new PipelineError(
        'compile_failed',
        error instanceof Error ? error.message : 'A concept could not be compiled.',
      )
    }
  }

  const diversity = validateConcepts(
    concepts[0].spec,
    concepts.map((concept) => ({ id: concept.conceptId, doc: concept.doc })),
  )
  if (!diversity.ok) {
    throw new PipelineError(
      'not_distinct',
      'The three concepts are not different enough to offer as a choice.',
      diversity.pairs
        .filter((pair) => pair.sameOrder || pair.axesDifferent < 5)
        .map((pair) => ({
          code: 'concepts_not_distinct' as const,
          message: `${pair.a}/${pair.b}: ${pair.reasons.join('; ') || 'too alike'}`,
        })),
    )
  }

  return {
    brief,
    set,
    concepts,
    calls,
    attempts: spend.attempts,
    // The ledger is the authority, not the calls that happened to succeed: a
    // retained reservation for an uncertain attempt is part of the cost even
    // when a retry produced the answer.
    costUsd: ledger.spentUsd(),
    issues,
    softLimitReached,
  }
}
