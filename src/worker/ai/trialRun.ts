/**
 * One trial generation: gate, budget claim, understand, design, copy, compile.
 *
 * The order matters. The gate is checked before the budget so a closed trial
 * reports *why* it is closed without touching the spend pool. The pool is
 * claimed before the provider exists so a generation that cannot be afforded
 * never opens a socket. Settlement happens on every exit path, including a
 * failure, so a crashed run cannot hold a reservation forever.
 *
 * The same function runs both sides of the comparison; only the provider and
 * its billing differ.
 */

import type { AppSpec } from '../types'
import type { Doc } from '../doc'
import { createLedger } from './ledger'
import type { BusinessBrief, ConceptSpec } from './contracts'
import type { Dossier } from './dossier'
import { runDesignPipeline, PipelineError, type AttemptRecord, type CallRecord } from './pipeline'
import type { Issue } from './validate'
import {
  TRIAL_ID,
  TRIAL_LIMITS,
  trialProvider,
  trialProviderById,
  trialStatus,
  type TrialProvider,
  type TrialProviderId,
  type TrialSpendStore,
} from './trial'

export type TrialConcept = {
  id: string
  name: string
  oneLine: string
  screens: string[]
  /** The same document the preview, editor, saved project and publish read. */
  doc: Doc
  /** The structural choices that must differ between concepts. */
  signature: {
    architecture: string
    type: string
    palette: string[]
    navigation: string[]
    navModel: string
    homeBlocks: string[]
    components: number
  }
}

export type TrialRunStatus = 'ai' | 'blocked' | 'over_budget' | 'failed'

export type TrialRunVerification = {
  /** The pool claim made before the first call: the generation's hard ceiling. */
  poolClaimUsd: number
  hardCapUsd: number
  /** Every HTTP attempt, including failed and retried ones. */
  attemptsMade: number
  retried: boolean
  /** Sum of per-attempt reservations (released as each attempt settles). */
  reservedUsd: number
  /** Sum actually charged across successful and failed attempts. */
  chargedUsd: number
  maxAttemptReservedUsd: number
  /** Charged never exceeded the generation's hard cap. */
  withinHardCap: boolean
  /** No attempt charged more than its own reservation. */
  chargedWithinReservation: boolean
  overReservedUsd: number
  /** Endpoints the gateway reported, per call (empty for a blocked run). */
  servedProviders: string[]
}

export type TrialRun = {
  trialId: string
  provider: TrialProviderId
  providerLabel: string
  /** `primary` = practical comparison; `controlled` = OpenRouter pinned to Groq. */
  arm: TrialProvider['arm']
  gateway: TrialProvider['gateway']
  /** The routing this arm asked for, and therefore what the result compares. */
  routingLabel: string
  expectedProvider?: string
  /** The exact model ID, identical on both sides of the comparison. */
  model: string
  status: TrialRunStatus
  reason?: string
  detail?: string
  brief?: BusinessBrief
  concepts: TrialConcept[]
  calls: CallRecord[]
  /** Every attempt made, including a retry that failed. */
  attempts: AttemptRecord[]
  /** The endpoints OpenRouter reported serving these calls. */
  servedProviders: string[]
  verification: TrialRunVerification
  issues: Issue[]
  costUsd: number
  /** Wall clock for the whole generation, including compilation and validation. */
  latencyMs: number
  softLimitReached: boolean
  budget: {
    totalUsd: number
    spentUsd: number
    reservedUsd: number
    remainingUsd: number
    generationUsd: number
    softUsd: number
    hardUsd: number
  }
}

function budgetOf(
  spend: { spentUsd: number; reservedUsd: number; remainingUsd: number },
  generationUsd: number,
): TrialRun['budget'] {
  return {
    totalUsd: TRIAL_LIMITS.totalUsd,
    spentUsd: spend.spentUsd,
    reservedUsd: spend.reservedUsd,
    remainingUsd: spend.remainingUsd,
    generationUsd,
    softUsd: TRIAL_LIMITS.softUsd,
    hardUsd: TRIAL_LIMITS.hardUsd,
  }
}

function signatureOf(concept: ConceptSpec): TrialConcept['signature'] {
  return {
    architecture: concept.architecture.type,
    type: concept.type.direction,
    palette: [concept.palette.bg, concept.palette.ink, concept.palette.accent],
    navigation: concept.nav.tabs,
    navModel: concept.nav.model,
    homeBlocks: concept.home.blocks.map((block) => block.role),
    components: Object.keys(concept.components).length,
  }
}

function baseOf(provider: TrialProvider) {
  return {
    trialId: TRIAL_ID,
    provider: provider.id,
    providerLabel: provider.label,
    arm: provider.arm,
    gateway: provider.gateway,
    routingLabel: provider.routingLabel,
    expectedProvider: provider.expectedProvider,
    model: provider.model,
  }
}

/**
 * Reconcile what was charged against what was reserved and against both caps,
 * for every attempt rather than only the calls that returned an answer.
 */
function verificationOf(
  attempts: AttemptRecord[],
  calls: CallRecord[],
  chargedUsd: number,
  poolClaimUsd: number,
): TrialRunVerification {
  const reservedUsd = attempts.reduce((total, attempt) => total + attempt.reservedUsd, 0)
  const overReservedUsd = attempts.reduce(
    (total, attempt) => total + Math.max(0, attempt.costUsd - attempt.reservedUsd),
    0,
  )
  return {
    poolClaimUsd,
    hardCapUsd: TRIAL_LIMITS.hardUsd,
    attemptsMade: attempts.length,
    retried: attempts.length > calls.length,
    reservedUsd,
    chargedUsd,
    maxAttemptReservedUsd: attempts.reduce(
      (highest, attempt) => Math.max(highest, attempt.reservedUsd),
      0,
    ),
    withinHardCap: chargedUsd <= TRIAL_LIMITS.hardUsd + 1e-9,
    chargedWithinReservation: overReservedUsd <= 1e-9,
    overReservedUsd,
    servedProviders: [
      ...new Set(
        [
          ...calls.map((call) => call.providerServed),
          ...attempts.map((attempt) => attempt.servedProvider),
        ].filter((served): served is string => Boolean(served)),
      ),
    ],
  }
}

/**
 * Run one generation on one gateway. Never throws for an expected refusal: a
 * closed gate, an exhausted pool or a pipeline failure all come back as a
 * status with the money accounted for.
 */
export async function runTrialGeneration(input: {
  providerId: TrialProviderId
  spec: AppSpec
  dossier: Dossier
  env: Record<string, string | undefined>
  store: TrialSpendStore
  now?: Date
}): Promise<TrialRun> {
  const provider = trialProviderById(input.providerId)
  if (!provider) throw new Error(`Unknown trial provider: ${input.providerId}`)
  const now = input.now ?? new Date()
  const startedAt = Date.now()
  const base = baseOf(provider)

  const availability = trialStatus(input.env)
  if (!availability.available) {
    const spend = await input.store.read(TRIAL_ID, TRIAL_LIMITS.totalUsd, now)
    return {
      ...base,
      status: 'blocked',
      reason: availability.reason,
      detail: `The paid trial needs ${availability.missing.join(', ')}. No provider call was made.`,
      concepts: [],
      calls: [],
      attempts: [],
      servedProviders: [],
      verification: verificationOf([], [], 0, 0),
      issues: [],
      costUsd: 0,
      latencyMs: Date.now() - startedAt,
      softLimitReached: false,
      budget: budgetOf(spend, 0),
    }
  }

  // The hard ceiling, not the estimate: if the pool cannot absorb the worst
  // case, this generation does not start at all.
  const claimed = await input.store.claim(
    TRIAL_ID,
    TRIAL_LIMITS.hardUsd,
    TRIAL_LIMITS.totalUsd,
    now,
  )
  if (!claimed) {
    const spend = await input.store.read(TRIAL_ID, TRIAL_LIMITS.totalUsd, now)
    return {
      ...base,
      status: 'over_budget',
      reason: 'trial_pool_exhausted',
      detail: `The $${TRIAL_LIMITS.totalUsd.toFixed(2)} trial pool cannot absorb another $${TRIAL_LIMITS.hardUsd.toFixed(2)} generation. No provider call was made and nothing was topped up.`,
      concepts: [],
      calls: [],
      attempts: [],
      servedProviders: [],
      verification: verificationOf([], [], 0, 0),
      issues: [],
      costUsd: 0,
      latencyMs: Date.now() - startedAt,
      softLimitReached: false,
      budget: budgetOf(spend, 0),
    }
  }

  const ledger = createLedger(TRIAL_LIMITS.hardUsd)
  const apiKey = (input.env[provider.keyEnv] ?? '').trim()
  try {
    const run = await runDesignPipeline({
      provider: trialProvider(provider, apiKey),
      dossier: input.dossier,
      spec: input.spec,
      ledger,
      softStopUsd: TRIAL_LIMITS.softUsd,
    })
    await input.store.settle(TRIAL_ID, TRIAL_LIMITS.hardUsd, run.costUsd, now)

    const concepts: TrialConcept[] = run.concepts.map((compiled, index) => {
      const concept = run.set.concepts[index]
      return {
        id: compiled.conceptId,
        name: concept?.name ?? compiled.conceptId,
        oneLine: concept?.oneLine ?? '',
        screens: concept?.nav.tabs ?? [],
        doc: compiled.doc,
        signature: signatureOf(concept),
      }
    })

    const spend = await input.store.read(TRIAL_ID, TRIAL_LIMITS.totalUsd, now)
    return {
      ...base,
      status: 'ai',
      brief: run.brief,
      concepts,
      calls: run.calls,
      attempts: run.attempts,
      servedProviders: verificationOf(
        run.attempts,
        run.calls,
        run.costUsd,
        TRIAL_LIMITS.hardUsd,
      ).servedProviders,
      verification: verificationOf(run.attempts, run.calls, run.costUsd, TRIAL_LIMITS.hardUsd),
      issues: run.issues,
      costUsd: run.costUsd,
      latencyMs: Date.now() - startedAt,
      softLimitReached: run.softLimitReached,
      budget: budgetOf(spend, ledger.spentUsd()),
    }
  } catch (error) {
    // The reservation is replaced with what the failed run actually spent, so
    // a refusal releases the pool rather than holding the ceiling.
    await input.store.settle(TRIAL_ID, TRIAL_LIMITS.hardUsd, ledger.spentUsd(), now)
    const spend = await input.store.read(TRIAL_ID, TRIAL_LIMITS.totalUsd, now)
    const pipelineError = error instanceof PipelineError ? error : undefined
    const providerCode = (error as { code?: unknown } | undefined)?.code
    const reasonCode =
      pipelineError?.code ?? (typeof providerCode === 'string' ? providerCode : 'generation_failed')
    const attempts =
      pipelineError?.attempts ??
      (error as { attemptsSpent?: AttemptRecord[] } | undefined)?.attemptsSpent ??
      []
    const calls =
      pipelineError?.calls ??
      (error as { callsSpent?: CallRecord[] } | undefined)?.callsSpent ??
      []
    return {
      ...base,
      status: reasonCode === 'budget' ? 'over_budget' : 'failed',
      reason: reasonCode,
      detail: error instanceof Error ? error.message : 'The generation failed.',
      concepts: [],
      calls,
      attempts,
      servedProviders: verificationOf(attempts, calls, ledger.spentUsd(), TRIAL_LIMITS.hardUsd)
        .servedProviders,
      verification: verificationOf(attempts, calls, ledger.spentUsd(), TRIAL_LIMITS.hardUsd),
      issues: pipelineError?.issues ?? [],
      costUsd: ledger.spentUsd(),
      latencyMs: Date.now() - startedAt,
      softLimitReached: false,
      budget: budgetOf(spend, ledger.spentUsd()),
    }
  }
}
