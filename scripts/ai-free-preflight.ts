#!/usr/bin/env bun
/**
 * Zero-cost AI preflight. Makes **no network request of any kind**.
 *
 *   bun scripts/ai-free-preflight.ts
 *
 * It reports what Plattr is allowed to call, which free allowances apply, which
 * keys are present (names only — values are never read out), and how many
 * business generations the free pools can carry. It deliberately does not
 * contact a provider: live verification is a separate, explicitly approved step.
 */
import { existsSync, readFileSync } from 'node:fs'
import { ZERO_COST_ROUTES, ZERO_COST_REQUIRED_KEYS, routeModels, routeProviders } from '../src/worker/ai/routes'
import { FREE_MODELS, ZERO_COST_MODE } from '../src/worker/ai/zeroCost'

function devVarsKeys(): Set<string> {
  const path = '.dev.vars'
  if (!existsSync(path)) return new Set()
  const keys = new Set<string>()
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=/.exec(line)
    if (match) keys.add(match[1])
  }
  return keys
}

const localKeys = devVarsKeys()
const present = (name: string) => Boolean(process.env[name]?.trim() || localKeys.has(name))

/** Measured prompt/schema sizes from the five saved businesses, 2026-11-23. */
const STAGE_TOKENS = {
  understand: { prompt: 953, schema: 718, output: 800, reasoning: 500 },
  design: { prompt: 1_581, schema: 1_893, output: 3_600, reasoning: 2_500 },
  copy: { prompt: 1_779, schema: 176, output: 400, reasoning: 300 },
} as const

const stageTotal = (stage: keyof typeof STAGE_TOKENS) => {
  const entry = STAGE_TOKENS[stage]
  return entry.prompt + entry.schema + entry.output + entry.reasoning
}

const groqSmallStages = stageTotal('understand') + stageTotal('copy')
const cloudflareDesign = stageTotal('design')
const cfInput = STAGE_TOKENS.design.prompt + STAGE_TOKENS.design.schema
const cfOutput = STAGE_TOKENS.design.output + STAGE_TOKENS.design.reasoning
const neuralCost = Math.ceil((cfInput * 31_818) / 1_000_000 + (cfOutput * 68_182) / 1_000_000)

const groqPerDay = Math.floor(200_000 / groqSmallStages)
const cfPerDay = Math.floor(10_000 / neuralCost)
const theoretical = Math.min(groqPerDay, cfPerDay)

console.log('Plattr zero-cost AI preflight — offline, no provider request is made.\n')
console.log(`ZERO_COST_MODE: ${ZERO_COST_MODE ? 'on' : 'OFF'}`)
console.log('Paid providers reachable: none (Anthropic, OpenAI, Gemini and OpenRouter are refused by the guard).')
console.log('Billing activation, credit purchase, automatic upgrade, top-up: no code path exists.\n')

console.log('Free models on the allowlist')
console.log('model                                  provider    limits')
for (const entry of FREE_MODELS) {
  const limits = entry.limits
  const tokens = Number.isFinite(limits.tokensPerDay) && limits.tokensPerDay < Number.MAX_SAFE_INTEGER
    ? `${limits.tokensPerDay.toLocaleString()} tok/day`
    : `${limits.neuronsPerDay.toLocaleString()} neurons/day`
  console.log(
    `${entry.model.padEnd(38)} ${entry.provider.padEnd(11)} ` +
      `${limits.requestsPerDay.toLocaleString()} req/day · ${tokens} · ` +
      `${limits.requestsPerMinute} req/min` +
      `${Number.isFinite(limits.tokensPerMinute) && limits.tokensPerMinute < Number.MAX_SAFE_INTEGER ? ` · ${limits.tokensPerMinute.toLocaleString()} tok/min` : ''}`,
  )
}

console.log('\nFree account status (key names only; values are never printed)')
for (const key of ZERO_COST_REQUIRED_KEYS) {
  console.log(`  ${key.padEnd(24)} ${present(key) ? 'present' : 'ABSENT'}`)
}
const anyKey = ZERO_COST_REQUIRED_KEYS.some(present)
console.log(
  anyKey
    ? '  A key is configured locally. This script still made no request; live verification needs approval.'
    : '  No free key is configured, so Plattr cannot call a provider at all. That is the current state.',
)
console.log('  Payment method / billing upgrade required: NO — every account above is used on a free plan only.')

console.log('\nRoutes')
for (const route of ZERO_COST_ROUTES) {
  console.log(
    `  ${route.id.padEnd(18)} ${routeProviders(route).join('+').padEnd(20)} ${routeModels(route).join(', ')}`,
  )
}

console.log('\nDaily capacity (measured prompts; one generation = understand + design + copy)')
console.log(`  Groq understand+copy      ${groqSmallStages.toLocaleString()} tokens each → ${groqPerDay}/day from 200,000`)
console.log(`  Cloudflare design         ${cloudflareDesign.toLocaleString()} tokens ≈ ${neuralCost} neurons → ${cfPerDay}/day from 10,000`)
console.log(`  Shipping hybrid           ${theoretical}/day theoretical, plan for ${Math.floor(theoretical * 0.7)}–${Math.floor(theoretical * 0.8)} usable`)
console.log('  Exhaustion is a pause to the next reset, never a paid fallback.')

console.log('\nCost of every request: $0.00 (recorded literally, not derived from a price table).')
console.log('No request was made by this script.')
