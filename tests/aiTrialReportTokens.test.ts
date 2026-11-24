import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PROMPT_DIGEST, PROMPT_VERSION } from '../src/worker/ai/prompts'

/**
 * The live report must carry what a paid call actually consumed.
 *
 * The first paid attempt could not be audited for tokens because the report
 * dropped `calls`, so this pins the per-call record: usage, latency, provider
 * and model attribution, the reservation, the charge and the billing class.
 * It runs the real harness in mocked mode (a local stand-in gateway), so no
 * provider is contacted and nothing is spent.
 */

type Call = {
  stage: string
  provider: string
  model: string
  modelServed?: string
  providerServed?: string
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningTokens: number
  latencyMs: number
  reservedUsd: number
  costUsd: number
  reportedCostUsd?: number
  attempts: number
  ok: boolean
}

type Attempt = { stage: string; billing: string; reservedUsd: number; costUsd: number }

type Run = {
  provider: { id: string }
  status: string
  calls: Call[]
  attempts: Attempt[]
}

describe('the report preserves per-call token accounting', () => {
  test('tokens, latency, attribution, cost and billing reach report.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'plattr-trial-tokens-'))
    try {
      const script = join(import.meta.dir, '..', 'scripts', 'ai-trial.mjs')
      const env = { ...process.env }
      delete env.PLATTR_AI_TRIAL_MOCK_FAIL
      const proc = spawnSync(process.execPath, [script, '--no-shots'], {
        cwd: dir,
        env,
        encoding: 'utf8',
        timeout: 120_000,
      })
      expect(proc.status).toBe(0)

      const raw = readFileSync(
        join(dir, 'docs/qa/ai-trial-2026-11-23/mocked/report.json'),
        'utf8',
      )
      const report = JSON.parse(raw) as {
        mode: string
        comparable: boolean
        promptVersion: string
        promptDigest: string
        runs: Run[]
      }

      // Provenance: mocked evidence says so, and names its instructions.
      expect(report.mode).toBe('mocked')
      expect(report.comparable).toBe(false)
      expect(report.promptVersion).toBe(PROMPT_VERSION)
      expect(report.promptDigest).toBe(PROMPT_DIGEST)

      expect(report.runs).toHaveLength(9)
      const calls = report.runs.flatMap((run) => run.calls)
      expect(calls).toHaveLength(27)

      for (const call of calls) {
        // Usage, including the two counts that were invisible before.
        expect(call.inputTokens).toBeGreaterThan(0)
        expect(call.outputTokens).toBeGreaterThan(0)
        expect(typeof call.cachedInputTokens).toBe('number')
        expect(typeof call.reasoningTokens).toBe('number')
        expect(call.latencyMs).toBeGreaterThanOrEqual(0)
        // Attribution: what was asked for and what answered.
        expect(call.model).toBe('openai/gpt-oss-120b')
        expect(call.modelServed).toBe('openai/gpt-oss-120b')
        expect(['groq', 'openrouter']).toContain(call.provider)
        expect(typeof call.providerServed).toBe('string')
        // Money: the reservation, the charge, and the attempt count.
        expect(call.reservedUsd).toBeGreaterThan(0)
        expect(call.costUsd).toBeGreaterThan(0)
        expect(call.attempts).toBeGreaterThanOrEqual(1)
        expect(call.ok).toBe(true)
      }

      // The two gateways bill differently, and the record keeps that apart.
      const routed = report.runs.find((run) => run.provider.id === 'openrouter')
      if (!routed) throw new Error('the OpenRouter arm is missing')
      expect(typeof routed.calls[0].reportedCostUsd).toBe('number')
      expect(routed.calls[0].providerServed).toBe('MockedCheapestEndpoint')

      const groq = report.runs.find((run) => run.provider.id === 'groq')
      if (!groq) throw new Error('the Groq arm is missing')
      expect(groq.calls[0].reportedCostUsd).toBeUndefined()
      expect(groq.calls[0].providerServed).toBe('groq')

      const pinned = report.runs.find((run) => run.provider.id === 'openrouter-groq')
      if (!pinned) throw new Error('the pinned arm is missing')
      expect(pinned.calls[0].providerServed).toBe('Groq')

      // Every attempt keeps its billing classification and reservation.
      const attempts = report.runs.flatMap((run) => run.attempts)
      expect(attempts).toHaveLength(27)
      for (const attempt of attempts) {
        expect(attempt.billing).toBe('billed')
        expect(attempt.reservedUsd).toBeGreaterThan(0)
        expect(attempt.costUsd).toBeGreaterThan(0)
      }

      // Nothing secret is written into the report.
      expect(raw).not.toContain('key-not-a-secret')
      expect(raw.toLowerCase()).not.toContain('authorization')
      expect(raw.toLowerCase()).not.toContain('bearer')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 120_000)
})
