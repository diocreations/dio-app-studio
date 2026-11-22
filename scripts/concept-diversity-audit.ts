/**
 * Separate what the three concepts actually change.
 *
 *   bun scripts/concept-diversity-audit.ts
 *
 * Reads only the saved concept documents. Styling, layout, information
 * architecture and customer journey are reported independently, so a pair that
 * shares a home composition cannot be mistaken for three applications just
 * because its palette and type differ. The validator's own six dimensions and
 * reasons are kept beside that reading.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { validateConcepts } from '../src/worker/blueprints'
import { flagshipDocFromSpec } from '../src/worker/doc'
import type { AppSpec } from '../src/worker/types'
import type { Doc } from '../src/worker/doc'

const ROOT = process.env.CONCEPT_ROOT ?? 'docs/qa/generation-benchmark-2026-11-21-recovery'
const OUT = process.env.CONCEPT_OUT ?? 'docs/qa/final-acceptance-2026-11-22'
const FILE = process.env.CONCEPT_FILE ?? 'concepts.json'
/** `current` builds the documents with the generator now in the tree, instead
 *  of reading the earlier saved documents. The saved evidence is never edited. */
const BUILD = process.env.CONCEPT_BUILD === 'current'
const SITES = ['yarmouth', 'padella', 'pelirocco', 'bluetit', 'afl']

type Reading = {
  concept: string
  accent: string
  direction?: string
  navModel?: string
  typography?: string
  initial: string
  screens: string[]
  tabs: string[]
  home: string[]
  functional: string[]
}

const read = (site: string, concept: string): { spec: AppSpec; doc: Doc } => {
  const spec = JSON.parse(readFileSync(`${ROOT}/${site}/concepts/${concept}.spec.json`, 'utf8')) as AppSpec
  return {
    spec,
    doc: BUILD
      ? flagshipDocFromSpec(spec)
      : (JSON.parse(readFileSync(`${ROOT}/${site}/concepts/${concept}.doc.json`, 'utf8')) as Doc),
  }
}

function reading(concept: string, spec: AppSpec, doc: Doc): Reading {
  const screens = doc.screens.map((screen) => screen.kind)
  const tabs = doc.screens.filter((screen) => screen.nav).map((screen) => screen.kind)
  const home = doc.screens.find((screen) => screen.kind === 'home')?.sections.map((node) => node.variant) ?? []
  const initial = doc.initialScreen ?? doc.screens.find((screen) => screen.nav)?.id ?? doc.screens[0]?.id ?? ''
  const functional = home.filter((variant) =>
    /search|dates|filters|timetable|stay|order|reserve|book|action|quote|enquire|urgent|help/i.test(variant),
  )
  return {
    concept,
    accent: doc.accent ?? spec.accent,
    direction: doc.design?.direction ?? spec.design?.direction,
    navModel: doc.design?.nav ?? spec.design?.nav,
    typography: doc.design?.typography ?? spec.design?.typography,
    initial,
    screens,
    tabs,
    home,
    functional,
  }
}

type Pair = {
  a: string
  b: string
  styling: boolean
  layout: boolean
  informationArchitecture: boolean
  journey: boolean
  dimensions: { name: string; different: boolean }[]
  reasons: string[]
  validatorOk: boolean
  score: number
}

const sites: Record<string, unknown> = {}
mkdirSync(OUT, { recursive: true })

for (const site of SITES) {
  const concepts = readdirSync(`${ROOT}/${site}/concepts`)
    .filter((file) => file.endsWith('.doc.json'))
    .map((file) => file.replace('.doc.json', ''))
  const entries = concepts.map((concept) => ({ concept, ...read(site, concept) }))
  const readings = entries.map((entry) => reading(entry.concept, entry.spec, entry.doc))
  const validator = validateConcepts(entries[0].spec, entries.map((entry) => ({ id: entry.concept, doc: entry.doc })))
  const pairs: Pair[] = []
  for (let i = 0; i < readings.length; i += 1) {
    for (let j = i + 1; j < readings.length; j += 1) {
      const a = readings[i]
      const b = readings[j]
      const verdict = validator.pairs.find(
        (pair) =>
          (pair.a === a.concept && pair.b === b.concept) || (pair.a === b.concept && pair.b === a.concept),
      )
      pairs.push({
        a: a.concept,
        b: b.concept,
        // Palette, type and chrome are styling. Different tokens are not a
        // different application, so this never counts towards structure.
        styling: a.accent !== b.accent || a.direction !== b.direction || a.navModel !== b.navModel || a.typography !== b.typography,
        layout: a.home.join('>') !== b.home.join('>'),
        informationArchitecture: a.screens.join('>') !== b.screens.join('>') || a.tabs.join('>') !== b.tabs.join('>'),
        journey: a.initial !== b.initial || a.tabs.join('>') !== b.tabs.join('>') || a.functional.join('>') !== b.functional.join('>'),
        dimensions: verdict?.dimensions ?? [],
        reasons: verdict?.reasons ?? [],
        validatorOk: Boolean(verdict) && !verdict.sameOrder && verdict.axesDifferent >= 5,
        score: verdict?.score ?? 0,
      })
    }
  }
  const structural = pairs.filter((pair) => pair.layout && pair.informationArchitecture && pair.journey)
  sites[site] = {
    concepts: readings,
    pairs,
    validatorOk: validator.ok,
    allPairsStructural: structural.length === pairs.length,
    // The limitation is named rather than hidden: these pairs share a home
    // composition and/or journey even though their styling differs.
    failingPairs: pairs.filter((pair) => !pair.validatorOk).map((pair) => `${pair.a}/${pair.b}`),
  }
}

const result = { generatedAt: new Date().toISOString(), source: ROOT, built: BUILD ? 'current-generator' : 'saved-documents', sites }
writeFileSync(`${OUT}/${FILE}`, JSON.stringify(result, null, 2))

for (const [site, value] of Object.entries(sites) as [string, { validatorOk: boolean; failingPairs: string[]; pairs: Pair[] }][]) {
  console.log(`${site}: validator ${value.validatorOk ? 'pass' : 'FAIL'}${value.failingPairs.length ? ` (${value.failingPairs.join(', ')})` : ''}`)
  for (const pair of value.pairs)
    console.log(
      `  ${pair.a}/${pair.b}: styling ${pair.styling ? 'different' : 'same'} · layout ${pair.layout ? 'different' : 'same'} · IA ${pair.informationArchitecture ? 'different' : 'same'} · journey ${pair.journey ? 'different' : 'same'}`,
    )
}
console.log(`\nwrote ${OUT}/${FILE}`)
