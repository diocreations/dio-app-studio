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

export type DesignRun = {
  brief: BusinessBrief
  set: DesignSet
  concepts: CompiledConcept[]
  calls: CallRecord[]
  costUsd: number
  issues: Issue[]
}

export class PipelineError extends Error {
  code: string
  issues: Issue[]

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
    },
    end(result) {
      // On a transport failure the provider may still have billed something we
      // cannot see. The ledger records zero and the run aborts, so the trial
      // ceiling is never crossed by an estimate.
      ledger.settle(reservation, result?.costUsd ?? 0)
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

export async function runDesignPipeline(input: {
  provider: AiProvider
  dossier: Dossier
  spec: AppSpec
  ledger: Ledger
}): Promise<DesignRun> {
  const { provider, dossier, spec, ledger } = input
  const calls: CallRecord[] = []
  const issues: Issue[] = []

  const understoodCall = await callStage(provider, 'understand', ledger, {
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

  const designedCall = await callStage(provider, 'design', ledger, {
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
  try {
    const copiedCall = await callStage(provider, 'copy', ledger, {
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
    costUsd: calls.reduce((total, call) => total + call.costUsd, 0),
    issues,
  }
}
