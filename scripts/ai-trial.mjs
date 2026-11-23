#!/usr/bin/env bun
/**
 * The Groq vs OpenRouter trial, run through three arms on the same model.
 *
 *   bun scripts/ai-trial.mjs                 # mocked answers, no keys, no cost
 *   bun scripts/ai-trial.mjs --status        # gate and pool only, no calls
 *   bun scripts/ai-trial.mjs --live --approve-trial   # the paid run
 *
 * Every arm sends `openai/gpt-oss-120b` with the same prompts, stages, schemas,
 * output ceilings and reasoning allowance. The primary comparison is direct
 * Groq against OpenRouter routing to the cheapest eligible endpoint; the
 * controlled arm pins OpenRouter to Groq with fallbacks disabled. This is a
 * provider-routing and gateway comparison, not a gateway-only one, and the
 * endpoint reported by each response is recorded rather than assumed.
 *
 * Mocked mode is the default. It exercises the gate, the spend pool, the
 * validators, the compiler and the renderer with a deterministic stand-in for a
 * model answer, and writes every artefact to
 * `docs/qa/ai-trial-2026-11-23/mocked`. It is **not** a model comparison: the
 * report says `mode: "mocked"` and `comparable: false`.
 *
 * Live mode refuses to start unless both keys are present in `.dev.vars` or the
 * environment, `PLATTR_AI_TRIAL=approved` is set, and `--approve-trial` is
 * passed. It never prints a key, never tops up, and settles every generation
 * against the reported charge (OpenRouter) or the published rate (Groq).
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { Database } from 'bun:sqlite'

import { renderApp } from '../src/worker/app.ts'
import { auditCoverage, validateConcepts } from '../src/worker/blueprints.ts'
import { MAX_OUTPUT_TOKENS } from '../src/worker/ai/pipeline.ts'
import { estimateMaxUsd } from '../src/worker/ai/pricing.ts'
import {
  TRIAL_LIMITS,
  TRIAL_PROVIDERS,
  TRIAL_SCHEMA_SQL,
  TRIAL_ID,
  d1TrialStore,
  memoryTrialStore,
  trialStatus,
} from '../src/worker/ai/trial.ts'
import { runTrialGeneration } from '../src/worker/ai/trialRun.ts'
import { exitCodeFor, runMatrix } from './ai-trial-matrix.ts'
import { briefFor, designSetFor, trialBusinesses } from '../tests/aiTrialFixtures.ts'
import { copySetFor } from '../tests/freeAiMock.ts'

const argv = process.argv.slice(2)
const live = argv.includes('--live')
const approved = argv.includes('--approve-trial')
const statusOnly = argv.includes('--status')
const shots = !argv.includes('--no-shots')
const OUT = live ? 'docs/qa/ai-trial-2026-11-23/live' : 'docs/qa/ai-trial-2026-11-23/mocked'

/**
 * Local secrets, read and never printed. `.dev.vars` is gitignored and is the
 * only place a key is expected; the environment wins when both exist.
 */
function devVars() {
  const values = {}
  if (!existsSync('.dev.vars')) return values
  for (const line of readFileSync('.dev.vars', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!match) continue
    let value = match[2]
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    values[match[1]] = value
  }
  return values
}

const env = {
  ...devVars(),
  ...Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined)),
}
// Mocked mode simulates an open gate so the pipeline can run without keys. The
// values are literal markers, never credentials, and only code whose `fetch`
// is the stand-in below can read them.
if (!live && !statusOnly) {
  env.GROQ_API_KEY = env.GROQ_API_KEY || 'mocked-groq-key-not-a-secret'
  env.OPENROUTER_API_KEY = env.OPENROUTER_API_KEY || 'mocked-openrouter-key-not-a-secret'
  env.PLATTR_AI_TRIAL = env.PLATTR_AI_TRIAL || 'approved'
}
const availability = trialStatus(env)

/** A file-backed D1 shape, so a live pool survives a restarted script. */
class LocalD1 {
  #db
  constructor(path) {
    if (path !== ':memory:') {
      const dir = path.replace(/\/[^/]+$/, '')
      if (dir && dir !== path) mkdirSync(dir, { recursive: true })
    }
    this.#db = new Database(path)
    this.#db.exec(TRIAL_SCHEMA_SQL)
  }
  prepare(sql) {
    const run = (params) => {
      const result = this.#db.prepare(sql).run(...params)
      return { success: true, meta: { changes: Number(result.changes) } }
    }
    const bound = (params) => ({
      __run: () => run(params),
      run: async () => run(params),
      first: async () => this.#db.prepare(sql).get(...params) ?? null,
      all: async () => ({ results: this.#db.prepare(sql).all(...params) }),
    })
    return {
      bind: (...params) => bound(params),
      __run: () => run([]),
      run: async () => run([]),
      first: async () => this.#db.prepare(sql).get() ?? null,
      all: async () => ({ results: this.#db.prepare(sql).all() }),
    }
  }
  async batch(statements) {
    return statements.map((statement) => (statement.__run ? statement.__run() : statement.run()))
  }
}

if (live && !availability.available) {
  console.error(`The paid trial is closed: missing ${availability.missing.join(', ')}. No provider call was made.`)
  process.exit(2)
}
if (live && !approved) {
  console.error('Live mode needs --approve-trial as well as both keys. No provider call was made.')
  process.exit(2)
}

if (statusOnly) {
  console.log(`gate: ${availability.available ? 'open' : `closed (${availability.reason})`}`)
  if (!availability.available) console.log(`missing: ${availability.missing.join(', ')}`)
  console.log(`limits: soft $${TRIAL_LIMITS.softUsd.toFixed(2)} · hard $${TRIAL_LIMITS.hardUsd.toFixed(2)} · total $${TRIAL_LIMITS.totalUsd.toFixed(2)}`)
  for (const provider of TRIAL_PROVIDERS) {
    const rate = `$${(provider.price.input * 1_000_000).toFixed(3)} in / $${(provider.price.output * 1_000_000).toFixed(3)} out per 1M`
    console.log(
      `provider: ${provider.id} (${provider.arm}) → ${provider.model} · key ${provider.keyEnv} · ${rate} · ${provider.routingLabel}`,
    )
  }
  const store = d1TrialStore(new LocalD1('.chrome-qa/ai-trial-spend.sqlite'))
  const spend = await store.read(TRIAL_ID, TRIAL_LIMITS.totalUsd)
  console.log(
    `pool $${TRIAL_LIMITS.totalUsd.toFixed(2)} · spent $${spend.spentUsd.toFixed(4)} · reserved $${spend.reservedUsd.toFixed(4)} · remaining $${spend.remainingUsd.toFixed(2)} · ${spend.generations} generation(s)`,
  )
  console.log('no provider call was made')
  process.exit(0)
}

/* ------------------------------------------------------------------------- *
 * Mocked gateways. Only used without --live.
 * ------------------------------------------------------------------------- */

const mockedCalls = []
let activeBusiness = null
const designCache = new Map()

if (!live) {
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    if (url.hostname !== 'openrouter.ai' && url.hostname !== 'api.groq.com') {
      throw new Error(`a mocked trial tried to reach ${url.href}`)
    }
    const body = JSON.parse(String(init?.body))
    const stage = body.response_format.json_schema.name.replace('plattr_', '')
    if (!activeBusiness) throw new Error('no active business fixture')
    // The request body itself decides which arm this is: the pinned arm asks
    // OpenRouter for one endpoint with fallbacks off.
    const pinned =
      Array.isArray(body.provider?.only) &&
      body.provider.only.includes('Groq') &&
      body.provider.allow_fallbacks === false
    mockedCalls.push({ host: url.hostname, model: body.model, stage, pinned })
    if (!designCache.has(activeBusiness.id)) {
      const brief = briefFor(activeBusiness.dossier)
      designCache.set(activeBusiness.id, {
        brief,
        set: designSetFor(activeBusiness.dossier, brief, activeBusiness.spec),
      })
    }
    const { brief, set } = designCache.get(activeBusiness.id)
    const answer = stage === 'understand' ? brief : stage === 'design' ? set : copySetFor(set)
    const armId =
      url.hostname === 'api.groq.com' ? 'groq' : pinned ? 'openrouter-groq' : 'openrouter'
    // Test-only seam, reachable only inside a mocked run: it lets a regression
    // test prove the matrix stops at the first failed generation. A live run
    // never installs this fetch and never reads this variable.
    const injected = process.env.PLATTR_AI_TRIAL_MOCK_FAIL
    if (
      injected &&
      (injected === `${activeBusiness.id}:${armId}` || injected === `${activeBusiness.id}:*`)
    ) {
      return new Response(
        JSON.stringify({ error: 'injected failure for the fail-fast regression test' }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      )
    }
    const provider = TRIAL_PROVIDERS.find((entry) => entry.id === armId)
    const promptTokens = stage === 'design' ? 2_100 : 900
    const completionTokens = stage === 'design' ? 1_400 : 400
    const usage = { prompt_tokens: promptTokens, completion_tokens: completionTokens }
    // OpenRouter reports the charge; Groq reports tokens only, so its adapter
    // prices them at the published rate. The stand-in endpoint names are
    // labelled as such: they exercise the attribution path, not a real vendor.
    const served = url.hostname === 'api.groq.com' ? 'Groq' : pinned ? 'Groq' : 'MockedCheapestEndpoint'
    if (provider.gateway === 'openrouter') {
      usage.cost = promptTokens * provider.price.input + completionTokens * provider.price.output
    }
    return new Response(
      JSON.stringify({
        id: `mocked-${mockedCalls.length}`,
        model: body.model,
        ...(provider.gateway === 'openrouter' ? { provider: served } : {}),
        choices: [{ message: { role: 'assistant', content: JSON.stringify(answer) }, finish_reason: 'stop' }],
        usage,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }
}

/* ------------------------------------------------------------------------- *
 * Scoring. Structural and reproducible; it does not pretend to judge taste.
 * ------------------------------------------------------------------------- */

function scoreRun(run, business) {
  const docs = run.concepts.map((concept) => ({ id: concept.id, doc: concept.doc }))
  const diversity =
    docs.length === 3 ? validateConcepts(business.spec, docs) : { ok: false, pairs: [] }
  const screens = run.concepts.map((concept) =>
    concept.doc.screens.filter((screen) => screen.nav).map((screen) => screen.kind),
  )
  const nodes = docs.reduce(
    (total, entry) => total + entry.doc.screens.reduce((count, screen) => count + (screen.sections?.length ?? 0), 0),
    0,
  )
  let coverageMissing = 0
  let coverageUnknown = 0
  for (const concept of run.concepts) {
    const html = renderApp(business.spec, {
      token: `audit-${business.id}-${run.provider}-${concept.id}`,
      live: false,
      flagship: true,
      doc: concept.doc,
    })
    const audit = auditCoverage(concept.doc, html)
    coverageMissing += audit.missing.length
    coverageUnknown += audit.unknown.length
  }
  const palettes = new Set(run.concepts.map((concept) => concept.signature.palette.join('|')))
  const typographies = new Set(run.concepts.map((concept) => `${concept.signature.type}|${concept.signature.homeBlocks.join('>')}`))
  const navModels = new Set(run.concepts.map((concept) => concept.signature.navModel))
  return {
    grounding: {
      brief: run.brief ? 'validated against the dossier before design' : 'not reached',
      designIssues: [...new Set(run.issues.map((issue) => issue.code))],
      invented: run.issues.filter((issue) => /ungrounded|claim|invent/i.test(issue.code)).length,
    },
    businessRelevance: {
      catalogueEntries: business.dossier.catalogue.entries,
      catalogueScreens: docs.filter((entry) => entry.doc.screens.some((screen) => screen.kind === 'catalog' && screen.nav)).length,
      workflows: business.dossier.workflows,
    },
    diversity: {
      ok: diversity.ok,
      pairs: diversity.pairs.map((pair) => ({
        pair: `${pair.a}/${pair.b}`,
        score: pair.score,
        axesDifferent: pair.axesDifferent,
        reasons: pair.reasons,
      })),
      minAxes: diversity.pairs.length ? Math.min(...diversity.pairs.map((pair) => pair.axesDifferent)) : 0,
    },
    visual: {
      distinctPalettes: palettes.size,
      distinctTypeAndHierarchy: typographies.size,
      distinctNavModels: navModels.size,
      note: 'structural checks (palette, type, hierarchy, nav); contrast is enforced by the validator, taste is not judged',
    },
    completeness: {
      concepts: run.concepts.length,
      screens,
      nodes,
      components: run.concepts.reduce((total, concept) => total + concept.signature.components, 0),
      editability: {
        missing: coverageMissing,
        unknown: coverageUnknown,
        note: coverageMissing
          ? 'a node the app renderer omits because this business has no data for that section; it stays in the document and is editable in the editor'
          : 'every visible node reached the rendered page under its own id',
      },
    },
    latency: {
      totalMs: run.latencyMs,
      byStage: run.calls.map((call) => ({ stage: call.stage, ms: call.latencyMs })),
      note: live ? 'wall clock and provider latency' : 'mocked fetch, so latency is the pipeline overhead only',
    },
    cost: {
      usd: Number(run.costUsd.toFixed(6)),
      calls: run.calls.length,
      stages: run.calls.map((call) => call.stage),
      softLimitReached: run.softLimitReached,
    },
  }
}

function callCeilings() {
  return TRIAL_PROVIDERS.map((provider) => {
    const rows = [
      ['understand', MAX_OUTPUT_TOKENS.understand + 400, 6_000],
      ['design', MAX_OUTPUT_TOKENS.design + 2_500, 8_000],
      ['copy', MAX_OUTPUT_TOKENS.copy + 600, 6_000],
    ]
    const ceiling = rows.reduce(
      (total, [, output, input]) => total + estimateMaxUsd(provider.model, input, output, provider.reservationPrice),
      0,
    )
    return {
      provider: provider.id,
      model: provider.model,
      inputPerMillion: provider.price.input * 1_000_000,
      outputPerMillion: provider.price.output * 1_000_000,
      reservationInputPerMillion: provider.reservationPrice.input * 1_000_000,
      reservationOutputPerMillion: provider.reservationPrice.output * 1_000_000,
      ceilingUsd: Number(ceiling.toFixed(4)),
    }
  })
}

function chromePath() {
  return [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].find((entry) => entry && existsSync(entry))
}

function capture(htmlPath, pngPath) {
  const chrome = chromePath()
  if (!chrome) return { ok: false, reason: 'no Chrome or Chromium binary found' }
  const result = spawnSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--window-size=480,1000',
      '--virtual-time-budget=2500',
      `--screenshot=${resolve(pngPath)}`,
      `file://${resolve(htmlPath)}`,
    ],
    { stdio: 'ignore' },
  )
  return result.status === 0 && existsSync(pngPath)
    ? { ok: true }
    : { ok: false, reason: `chrome exited ${result.status}` }
}

/* ------------------------------------------------------------------------- *
 * The run.
 * ------------------------------------------------------------------------- */

const startedAt = new Date().toISOString()
const businesses = await trialBusinesses()
const store = live ? d1TrialStore(new LocalD1('.chrome-qa/ai-trial-spend.sqlite')) : memoryTrialStore()
const artefacts = []
let captureFailure = null

/**
 * One cell of the matrix: the generation, its score and its screenshots.
 *
 * The whole record is returned, including a failed generation's charges and
 * retained reservations, so a stopped matrix still reports what it spent.
 */
async function generate(business, provider, generation) {
  activeBusiness = business
  const run = await runTrialGeneration({
    providerId: provider.id,
    spec: business.spec,
    dossier: business.dossier,
    env,
    store,
  })
  const record = {
    generation,
    business: {
      id: business.id,
      label: business.label,
      type: business.businessType,
      source: business.source,
      fixture: business.fixture,
    },
    provider: {
      id: provider.id,
      arm: provider.arm,
      label: provider.label,
      model: provider.model,
      keyEnv: provider.keyEnv,
      routingLabel: provider.routingLabel,
      expectedProvider: provider.expectedProvider,
    },
    status: run.status,
    reason: run.reason,
    detail: run.detail,
    costUsd: Number(run.costUsd.toFixed(6)),
    latencyMs: run.latencyMs,
    /** Which endpoint the gateway said served each call. */
    servedProviders: run.servedProviders,
    /** Every attempt, including one that failed and was retried. */
    attempts: run.attempts,
    verification: run.verification,
    budget: run.budget,
    issues: run.issues.map((issue) => ({ code: issue.code, message: issue.message })),
    score: run.status === 'ai' ? scoreRun(run, business) : null,
  }
  const spend = await store.read(TRIAL_ID, TRIAL_LIMITS.totalUsd)
  console.log(
    `${String(generation).padStart(2)} ${business.id.padEnd(9)} ${provider.id.padEnd(15)} ${run.status}${run.reason ? ` (${run.reason})` : ''} · charged $${record.costUsd.toFixed(4)} · retained $${record.verification.retainedUsd.toFixed(4)} · pool remaining $${spend.remainingUsd.toFixed(2)}`,
  )

  // A failed generation has no concepts to render, and the matrix stops after
  // it, so the screenshot pass only runs for a completed generation.
  if (shots && run.status === 'ai') {
    await mkdir(join(OUT, business.id), { recursive: true })
    for (const concept of run.concepts) {
      const name = `${provider.id}-${concept.id}`
      const token = `trial-${business.id}-${name}`
      const html = renderApp(business.spec, {
        token,
        live: false,
        flagship: true,
        doc: concept.doc,
      })
      const htmlPath = join(OUT, business.id, `${name}.html`)
      await writeFile(htmlPath, html)
      const pngPath = join(OUT, business.id, `${name}.png`)
      const shot = capture(htmlPath, pngPath)
      if (!shot.ok && !captureFailure) captureFailure = shot.reason
      artefacts.push({
        business: business.id,
        provider: provider.id,
        concept: concept.id,
        html: htmlPath,
        png: shot.ok ? pngPath : null,
        captured: shot.ok,
      })
    }
  }

  return record
}

// Fail-fast: the matrix stops at the first generation that does not finish, so
// a broken key or a refused answer cannot be repeated across the remaining
// cells, where each failure would still book a charge or a retained
// reservation.
const matrix = await runMatrix({
  businesses,
  providers: TRIAL_PROVIDERS,
  runGeneration: generate,
})
const runs = matrix.runs

const totalCost = runs.reduce((sum, run) => sum + run.costUsd, 0)
const latencies = runs.filter((run) => run.score).map((run) => run.latencyMs)
const report = {
  mode: live ? 'live' : 'mocked',
  comparable: live,
  /** False when the matrix stopped at a failed generation. */
  complete: matrix.complete,
  runStatus: matrix.complete ? 'complete' : 'interrupted',
  plan: {
    businesses: businesses.length,
    arms: TRIAL_PROVIDERS.length,
    planned: matrix.planned,
    completed: runs.filter((run) => run.status === 'ai').length,
    failed: matrix.failed ? 1 : 0,
    skipped: matrix.skipped.length,
  },
  interrupted: matrix.failed
    ? {
        generation: matrix.failed.generation,
        business: matrix.failed.business.id,
        provider: matrix.failed.provider.id,
        status: matrix.failed.status,
        reason: matrix.failed.reason,
        detail: matrix.failed.detail,
        costUsd: matrix.failed.costUsd,
        chargedUsd: matrix.failed.verification.chargedUsd,
        retainedUsd: matrix.failed.verification.retainedUsd,
        poolRemainingUsd: matrix.failed.budget.remainingUsd,
      }
    : null,
  skipped: matrix.skipped,
  generatedAt: startedAt,
  comparison: {
    kind: 'provider-routing and gateway comparison',
    note: 'The primary arms are not gateway-only: direct Groq is compared with OpenRouter routing to the cheapest eligible endpoint of the same model, and OpenRouter chooses that endpoint. The controlled arm pins OpenRouter to its Groq endpoint with fallbacks disabled, isolating the gateway for the same model and endpoint.',
    arms: { primary: ['groq', 'openrouter'], controlled: ['openrouter-groq'] },
  },
  limits: TRIAL_LIMITS,
  providers: TRIAL_PROVIDERS.map((provider) => ({
    id: provider.id,
    arm: provider.arm,
    gateway: provider.gateway,
    label: provider.label,
    keyEnv: provider.keyEnv,
    model: provider.model,
    routingLabel: provider.routingLabel,
    expectedProvider: provider.expectedProvider,
    pricing: provider.pricing,
  })),
  callCeilings: callCeilings(),
  gate: live ? (availability.available ? 'open' : `closed (${availability.reason})`) : 'simulated (mocked mode)',
  totalCostUsd: Number(totalCost.toFixed(6)),
  businesses: businesses.map((business) => ({
    id: business.id,
    label: business.label,
    type: business.businessType,
    source: business.source,
    fixture: business.fixture,
  })),
  runs,
  artefacts,
  screenshotFailure: captureFailure,
  mockedCalls: live ? undefined : mockedCalls.length,
  latency: {
    minMs: latencies.length ? Math.min(...latencies) : null,
    maxMs: latencies.length ? Math.max(...latencies) : null,
    medianMs: latencies.length ? [...latencies].sort((a, b) => a - b)[Math.floor(latencies.length / 2)] : null,
  },
  notice: live
    ? 'Live answers from a provider-routing and gateway comparison: direct Groq against OpenRouter routing to the cheapest eligible endpoint, plus a pinned OpenRouter-to-Groq control. Costs are reported or published-rate charges. This does not publish or deploy anything.'
    : 'Mocked deterministic stand-in answers. Neither provider was contacted, no money was spent, and the columns are not a quality comparison. The pinned control and the served-endpoint records are exercised with stand-in endpoint names. Set both keys and --approve-trial for the real run.',
}

await mkdir(OUT, { recursive: true })
await writeFile(join(OUT, 'report.json'), JSON.stringify(report, null, 2))
await writeFile(join(OUT, 'REPORT.md'), markdown(report))
console.log(`\n${report.notice}`)
if (matrix.complete) {
  console.log(`complete: all ${matrix.planned} planned generations ran`)
} else {
  console.log(
    `interrupted: generation ${matrix.failed.generation} (${matrix.failed.business.id} / ${matrix.failed.provider.id}) failed; ${matrix.skipped.length} generation(s) skipped and not run`,
  )
}
console.log(`wrote ${join(OUT, 'REPORT.md')} and ${join(OUT, 'report.json')}`)
// A stopped matrix must not look like a successful run to a shell or CI step.
process.exitCode = exitCodeFor(matrix.complete)

function markdown(data) {
  const lines = []
  lines.push('# Plattr AI trial: Groq vs OpenRouter')
  lines.push('')
  lines.push(`- Generated: ${data.generatedAt}`)
  lines.push(`- Mode: **${data.mode}**${data.comparable ? '' : ' — not comparable'}`)
  lines.push(`- Gate: ${data.gate}`)
  lines.push(`- Run: **${data.complete ? 'complete' : 'interrupted'}**${data.complete ? '' : ` — stopped at generation ${data.interrupted.generation}; ${data.plan.skipped} generation(s) skipped`}`)
  lines.push(`- Same model on every arm: \`${TRIAL_PROVIDERS[0].model}\``)
  lines.push('- Comparison type: **provider-routing and gateway**, not gateway-only. The primary arms compare direct Groq with OpenRouter routing to the cheapest eligible endpoint; the controlled arm pins OpenRouter to its Groq endpoint with fallbacks disabled.')
  lines.push('- The serving endpoint is recorded from each response; a pinned call served by anything else is refused, and an unpinned call that does not report its endpoint is not treated as a known vendor.');
  lines.push(`- Spend${data.comparable ? '' : ' (simulated)'}: $${data.totalCostUsd.toFixed(4)} of $${TRIAL_LIMITS.totalUsd.toFixed(2)}`)
  lines.push(`- Limits: soft $${TRIAL_LIMITS.softUsd.toFixed(2)} / hard reservation $${TRIAL_LIMITS.hardUsd.toFixed(2)} per generation, no top-up`)
  lines.push('- Scope: this is an initial nine-generation screening comparison (one sample per business and arm), not a winner determination. Mocked evidence is plumbing evidence, not model quality; live results are observations that may justify a larger run.')
  lines.push('')
  lines.push(`> ${data.notice}`)
  lines.push('')
  lines.push('## Providers')
  lines.push('')
  lines.push('| Arm | Gateway | Key | Model | Input /1M | Output /1M | Routing | Pricing note |')
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const row of data.callCeilings) {
    const provider = data.providers.find((entry) => entry.id === row.provider)
    lines.push(`| ${provider.arm === 'controlled' ? 'controlled' : 'primary'} | ${provider.label} | \`${provider.keyEnv}\` | \`${row.model}\` | $${row.inputPerMillion.toFixed(3)} | $${row.outputPerMillion.toFixed(3)} | ${provider.routingLabel} | ${provider.pricing} |`)
  }
  lines.push('')
  lines.push('## Run status')
  lines.push('')
  lines.push(`- Planned generations: ${data.plan.planned} (${data.plan.businesses} businesses × ${data.plan.arms} arms)`)
  lines.push(`- Completed: ${data.plan.completed}`)
  lines.push(`- Failed: ${data.plan.failed}`)
  lines.push(`- Skipped after the failure: ${data.plan.skipped}`)
  lines.push('')
  if (data.interrupted) {
    const failed = data.interrupted
    lines.push('## Interrupted run')
    lines.push('')
    lines.push(`Generation ${failed.generation} — **${failed.business} / ${failed.provider}** — ${failed.status}${failed.reason ? ` (${failed.reason})` : ''}`)
    lines.push('')
    lines.push(`- Detail: ${failed.detail ?? 'no detail'}`)
    lines.push(`- Charged: $${failed.chargedUsd.toFixed(6)} · Retained (uncertain): $${failed.retainedUsd.toFixed(6)} · Pool remaining: $${failed.poolRemainingUsd.toFixed(2)}`)
    lines.push('- The matrix stopped at this generation. No later generation was sent, and the completed results above are preserved.')
    lines.push('')
    for (const cell of data.skipped) {
      lines.push(`- skipped: generation ${cell.generation} — ${cell.business} / ${cell.provider}`)
    }
    lines.push('')
  }
  lines.push('## Runs')
  lines.push('')
  lines.push('| Business | Type | Arm | Status | Served by | Latency (ms) | Cost (USD) | Concepts | Diversity | Min axes | Nodes | Editable (missing/unknown) |')
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const run of data.runs) {
    const score = run.score
    const served = run.servedProviders?.length ? run.servedProviders.join(', ') : '—'
    lines.push(
      `| ${run.business.label} | ${run.business.type} | ${run.provider.id}${run.provider.arm === 'controlled' ? ' (control)' : ''} | ${run.status}${run.reason ? ` (${run.reason})` : ''} | ${served} | ${run.latencyMs} | ${run.costUsd.toFixed(4)} | ${score?.completeness.concepts ?? 0} | ${score ? (score.diversity.ok ? 'distinct' : 'failed') : '—'} | ${score?.diversity.minAxes ?? '—'} | ${score?.completeness.nodes ?? '—'} | ${score ? `${score.completeness.editability.missing}/${score.completeness.editability.unknown}` : '—'} |`,
    )
  }
  lines.push('')
  lines.push('## Routing, charged cost and the cap')
  lines.push('')
  lines.push('Every HTTP attempt is reserved before it is sent and settled with its charge, including an attempt that failed and was retried. `served` is what the gateway reported, not what the routing asked for. A timeout, dropped connection, 429/5xx, or an answer without usable billing information keeps its reservation as `retained` instead of refunding it.')
  lines.push('')
  lines.push('| Business | Arm | Routing asked for | Endpoint(s) served | Attempts | Reserved (USD) | Charged (USD) | Retained (uncertain) | Accounted (USD) | Hard reservation (USD) | Within reservation | Charged ≤ reservation | Over reservation (USD) | Uncertain attempts | Retried |')
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const run of data.runs) {
    const verification = run.verification
    const expected = run.provider.expectedProvider ? `; pinned to ${run.provider.expectedProvider}` : ''
    lines.push(
      `| ${run.business.label} | ${run.provider.id} | ${run.provider.routingLabel}${expected} | ${run.servedProviders?.join(', ') || '—'} | ${verification.attemptsMade} | ${verification.reservedUsd.toFixed(6)} | ${verification.chargedUsd.toFixed(6)} | ${verification.retainedUsd.toFixed(6)} | ${verification.accountedUsd.toFixed(6)} | ${verification.hardCapUsd.toFixed(2)} | ${verification.withinHardCap ? 'yes' : 'NO'} | ${verification.chargedWithinReservation ? 'yes' : 'NO'} | ${verification.overReservedUsd.toFixed(6)} | ${verification.uncertainAttempts} | ${verification.retried ? 'yes' : 'no'} |`,
    )
  }
  lines.push('')
  lines.push('The hard figure is a reservation/budget ceiling, not an absolute provider invoice cap. A reported charge above an attempt reservation is still booked; `Over reservation` and `Within reservation` expose any such overspend rather than clamping it.')
  lines.push('')
  const failures = data.runs.filter((run) => run.status !== 'ai')
  if (failures.length) {
    lines.push('## Refusals and failures')
    lines.push('')
    for (const run of failures) {
      lines.push(`- **${run.business.label} / ${run.provider.id}** — ${run.status}: ${run.detail ?? run.reason ?? 'no detail'}`)
    }
    lines.push('')
  }
  lines.push('## Screenshots')
  lines.push('')
  if (!data.artefacts.length) {
    lines.push(data.screenshotFailure ? `Screenshots were not captured: ${data.screenshotFailure}.` : 'No screenshots were requested.')
  } else {
    for (const business of data.businesses) {
      const shots = data.artefacts.filter((entry) => entry.business === business.id)
      if (!shots.length) continue
      lines.push(`### ${business.label} (${business.type})`)
      lines.push('')
      for (const shot of shots) {
        const name = `${shot.provider}-${shot.concept}`
        lines.push(`- **${shot.provider} / ${shot.concept}** ${shot.captured ? `![${name}](${business.id}/${name}.png)` : '(not captured)'}`)
      }
      lines.push('')
    }
    lines.push('The HTML beside each PNG is the same document the preview, editor and saved project read: `renderApp(spec, { doc })`.')
  }
  lines.push('')
  lines.push('## What each run measured')
  lines.push('')
  lines.push('- **Factual grounding** — the brief is validated against the dossier before design; headings are checked for ungrounded or claim-bearing text; every issue code is listed per run.')
  lines.push('- **Business relevance** — catalogue entries read, catalogue screens in the navigation, workflows the read established.')
  lines.push('- **Concept diversity** — pairwise axes from the compiled documents; a palette-only triple is refused before this table is written.')
  lines.push('- **Visual structure** — distinct palettes, type/hierarchy pairings and navigation models. Contrast is a validator rule; taste is not scored.')
  lines.push('- **Completeness and editability** — concepts, screens, document nodes, components, and a coverage audit: every visible node must reach the rendered page under its own id, or it is not editable from the same document.')
  lines.push('- **Latency** — wall clock for the whole generation and per stage. Mocked mode measures pipeline overhead only; the live run measures the gateways.')
  lines.push('- **Cost and routing** — OpenRouter settles from its reported `usage.cost`; Groq is priced at its published rate from reported tokens. The endpoint that served each call is recorded, every attempt is reconciled against its reservation and the $0.40 cap, and a retried or failed attempt is counted rather than hidden. A charge that cannot be established (timeout, dropped connection, 429/5xx, no usage) is conservatively retained: it is never released as free and never disappears from the budget.')
  lines.push('')
  lines.push('## Worst case per generation')
  lines.push('')
  lines.push('| Gateway | Model | Reservation price in/out per 1M | Ceiling per generation |')
  lines.push('| --- | --- | --- | --- |')
  for (const row of data.callCeilings) {
    lines.push(`| ${row.provider} | \`${row.model}\` | $${row.reservationInputPerMillion.toFixed(2)} / $${row.reservationOutputPerMillion.toFixed(2)} | $${row.ceilingUsd.toFixed(4)} |`)
  }
  lines.push('')
  lines.push('## What still needs your keys')
  lines.push('')
  lines.push('1. Put `GROQ_API_KEY` and `OPENROUTER_API_KEY` in `.dev.vars` (gitignored). They are not requested in chat and never logged.')
  lines.push('2. Add `PLATTR_AI_TRIAL=approved` to `.dev.vars` for the duration of the trial.')
  lines.push('3. Run `bun scripts/ai-trial.mjs --status` to confirm the gate, both keys and the pool without contacting a provider.')
  lines.push('4. Run `bun scripts/ai-trial.mjs --live --approve-trial`. Nine generations (three businesses × three arms: Groq, OpenRouter cheapest, OpenRouter pinned to Groq) fit far inside the $30 pool; each is refused before its first call if it cannot reserve its $0.40 ceiling.')
  lines.push('5. The live report is written to `docs/qa/ai-trial-2026-11-23/live/`. Nothing is deployed, published or written to production data.')
  lines.push('')
  return lines.join('\n')
}
