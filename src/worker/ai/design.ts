/**
 * The product's AI design step, on free providers only.
 *
 * This is the one place the shipping application asks a model for a design. It
 * refuses to run without the free keys, refuses to run without the shared quota
 * ledger, and returns a *status* rather than throwing: a caller that cannot get
 * a design keeps the deterministic plan it already has.
 *
 * No money can move here. The adapters enforce `ZERO_COST_MODE`, reserve from
 * the D1 quota ledger before each request and settle afterwards; the dollar
 * ledger passed to the pipeline is capped at zero because the models are priced
 * at zero.
 */

import type { AppSpec } from '../types'
import { dossierFromSpec } from './dossier'
import { createLedger } from './ledger'
import { runDesignPipeline } from './pipeline'
import { createQuotaLedger, QuotaExhaustedError, type QuotaLedger } from './quotas'
import { missingKeysForRoute, providerForRoute, ZERO_COST_ROUTES, type ZeroCostRoute } from './routes'
import type { AiProvider } from './provider'

export type FreeDesignOutcome =
  | {
      status: 'ai'
      route: string
      billing: 'free'
      costUsd: 0
      models: Record<'understand' | 'design' | 'copy', string>
      concepts: { id: string; name: string; direction: string; spec: AppSpec; doc: unknown }[]
      calls: {
        stage: string
        provider: string
        model: string
        inputTokens: number
        outputTokens: number
        reasoningTokens: number
        attempts: number
        costUsd: number
        ok: boolean
      }[]
      inputTokens: number
      outputTokens: number
    }
  | { status: 'skipped'; reason: 'no_provider'; missingKeys: string[] }
  | { status: 'paused'; reason: 'quota_exhausted'; detail: string; resetsAt: string }
  | { status: 'failed'; reason: string; detail: string }

export type FreeDesignInput = {
  spec: AppSpec
  source: string
  env: Record<string, string | undefined>
  quota: QuotaLedger
  route?: ZeroCostRoute
  /** Injectable for tests; the shipping path is `runDesignPipeline`. */
  pipeline?: typeof runDesignPipeline
  provider?: AiProvider
}

/**
 * Run understand → design → copy on the free route, or explain why not.
 *
 * A failed probe, an exhausted allowance, a malformed answer and a validation
 * refusal all leave the caller with its deterministic plan. There is no partial
 * design: the pipeline either compiles three validated concepts or throws.
 */
export async function designWithFreeProviders(input: FreeDesignInput): Promise<FreeDesignOutcome> {
  const route = input.route ?? ZERO_COST_ROUTES[0]
  const missingKeys = missingKeysForRoute(route, input.env)
  const provider = input.provider ?? (missingKeys.length ? null : providerForRoute(route, input.env, { quota: input.quota }))
  if (!provider) return { status: 'skipped', reason: 'no_provider', missingKeys }

  const dossier = dossierFromSpec(input.spec, { source: input.source })
  try {
    const run = await (input.pipeline ?? runDesignPipeline)({
      provider,
      dossier,
      spec: input.spec,
      // Free models are priced at zero, so this ledger can never block and can
      // never report a cost. The real control is the quota ledger above.
      ledger: createLedger(0),
    })
    return {
      status: 'ai',
      route: route.id,
      billing: 'free',
      costUsd: 0,
      models: {
        understand: route.stages.understand.model,
        design: route.stages.design.model,
        copy: route.stages.copy.model,
      },
      concepts: run.concepts.map((concept) => ({
        id: concept.conceptId,
        name: concept.name,
        direction: concept.direction,
        spec: concept.spec,
        doc: concept.doc,
      })),
      calls: run.calls.map((call) => ({
        stage: call.stage,
        provider: call.provider,
        model: call.model,
        inputTokens: call.inputTokens,
        outputTokens: call.outputTokens,
        reasoningTokens: call.reasoningTokens,
        attempts: call.attempts,
        costUsd: call.costUsd,
        ok: call.ok,
      })),
      inputTokens: run.calls.reduce((total, call) => total + call.inputTokens, 0),
      outputTokens: run.calls.reduce((total, call) => total + call.outputTokens, 0),
    }
  } catch (error) {
    if (error instanceof QuotaExhaustedError) {
      return {
        status: 'paused',
        reason: 'quota_exhausted',
        detail: error.detail,
        resetsAt: error.resetsAt.toISOString(),
      }
    }
    const code = (error as { code?: string })?.code ?? 'pipeline_failed'
    const message = error instanceof Error ? error.message : 'The design step failed.'
    return { status: 'failed', reason: code, detail: message }
  }
}
