/**
 * The evaluation's three businesses, as fixed inputs.
 *
 * GeeStores is the importer fixture used by the rest of the suite. Padella
 * (restaurant) and Architecture for London (professional services) are saved
 * crawls from `docs/qa/generation-benchmark-2026-11-21`: the same spec the
 * deterministic pipeline produced from those sites, so a trial run sees real
 * catalogue shape without contacting any business.
 *
 * `designSetFor` is the *mock* model answer. It is a deterministic stand-in
 * built from three reviewed directions, and every evaluation that uses it is
 * labelled `comparable: false`. It exists so the harness, the validator, the
 * compiler and the screenshots can be exercised before a key is supplied; it is
 * not evidence that a model produced these concepts.
 */

import { readFileSync } from 'node:fs'
import { docFromSpec, flagshipDocFromSpec } from '../src/worker/doc'
import { FLAGSHIP_TRADES } from '../src/worker/flagship'
import { composeDoc } from '../src/worker/blueprints'
import { dossierFromSpec, type Dossier } from '../src/worker/ai/dossier'
import type { AppSpec, VerticalId } from '../src/worker/types'
import type { BusinessBrief, ConceptSpec, DesignSet } from '../src/worker/ai/contracts'
import { crawlSpec } from './freeAiMock'

export type TrialBusiness = {
  id: 'geestores' | 'padella' | 'afl'
  label: string
  businessType: string
  trade: VerticalId
  source: string
  /** Provenance for the saved fixture, shown in the report. */
  fixture: string
  spec: AppSpec
  dossier: Dossier
}

function savedSpec(path: string): AppSpec {
  return JSON.parse(readFileSync(new URL(path, import.meta.url).pathname, 'utf8')) as AppSpec
}

export async function trialBusinesses(): Promise<TrialBusiness[]> {
  const geestores = await crawlSpec()
  const padella = savedSpec('../docs/qa/generation-benchmark-2026-11-21/padella/concepts/editorial.spec.json')
  const afl = savedSpec('../docs/qa/generation-benchmark-2026-11-21/afl/concepts/classic.spec.json')
  return [
    {
      id: 'geestores',
      label: 'GeeStores',
      businessType: 'Jewellery retail',
      trade: 'shop',
      source: 'https://geestores.example/',
      fixture: 'tests/freeAiMock.ts site fixture (importer fixture suite)',
      spec: geestores.spec,
      dossier: geestores.dossier,
    },
    {
      id: 'padella',
      label: 'Padella',
      businessType: 'Restaurant',
      trade: padella.vertical,
      source: 'https://www.padella.co/',
      fixture: 'docs/qa/generation-benchmark-2026-11-21/padella (saved crawl)',
      spec: padella,
      dossier: dossierFromSpec(padella, { source: 'https://www.padella.co/' }),
    },
    {
      id: 'afl',
      label: 'Architecture for London',
      businessType: 'Professional services',
      trade: afl.vertical,
      source: 'https://www.architectureforlondon.com/',
      fixture: 'docs/qa/generation-benchmark-2026-11-21/afl (saved crawl)',
      spec: afl,
      dossier: dossierFromSpec(afl, { source: 'https://www.architectureforlondon.com/' }),
    },
  ]
}

/**
 * A brief that states only what the dossier carries. No audience, no story and
 * no assumption is added: this is the floor the comparison starts from.
 */
export function briefFor(dossier: Dossier): BusinessBrief {
  const category = dossier.business.category || `${dossier.business.trade} business`
  return {
    identity: {
      name: dossier.business.name,
      trade: dossier.business.trade,
      category,
      summary: dossier.business.tagline || `${category}, as read from its website.`,
      nameConfidence: 'likely',
    },
    audience: { primary: 'Customers the site speaks to', secondary: [], confidence: 'guess' },
    offer: {
      currency: dossier.catalogue.currency,
      catalogueEntries: dossier.catalogue.entries,
      entriesWithPhotograph: dossier.catalogue.withPhotograph,
      workflows: dossier.workflows.map((id) => ({
        id: id as 'browse' | 'buy' | 'book' | 'quote' | 'visit',
        available: true,
        why: 'the read established this workflow',
      })),
    },
    brand: { personality: ['plain', 'direct'], formality: 'balanced', energy: 'calm' },
    vocabulary: { catalog: 'Catalogue', item: 'Item', buy: 'Order', enquire: 'Ask' },
    constraints: { mustNotInvent: ['prices', 'materials'] },
    assumptions: [],
    questions: [],
  }
}

const TEMPLATE = JSON.parse(
  readFileSync(new URL('../docs/p1-ai-proposal/geestores.design-set.json', import.meta.url).pathname, 'utf8'),
) as DesignSet

const NAMES: Record<string, { name: string; oneLine: string; rationale: ConceptSpec['rationale'] }> = {
  editorial: {
    name: 'The Ledger',
    oneLine: 'Editorial catalogue with a masthead and a serif voice.',
    rationale: {
      for: 'Readers who want the catalogue to feel written, not listed.',
      whyThisBusiness: 'The offer is browsed by reading; a journal header gives every entry context.',
      tradeOff: 'A masthead costs the first screen 40px of catalogue space.',
    },
  },
  utility: {
    name: 'The Index',
    oneLine: 'Dense index with a dock, search first and quiet type.',
    rationale: {
      for: 'People who already know what they came for.',
      whyThisBusiness: 'A full catalogue is faster to scan when search leads and cards stay compact.',
      tradeOff: 'The dense index gives up most of the imagery above the fold.',
    },
  },
  campaign: {
    name: 'The Season',
    oneLine: 'Image-first campaign with an overlay header and rounded cards.',
    rationale: {
      for: 'First-time visitors who need a reason to stay.',
      whyThisBusiness: 'One strong image makes the offer legible before any list is read.',
      tradeOff: 'A campaign frame needs a photograph good enough to carry the screen.',
    },
  },
}

function roleFor(variant: string): ConceptSpec['home']['blocks'][number]['role'] {
  const value = variant.toLowerCase()
  if (/title|hero|intro|cover|headline/.test(value)) return 'lead'
  if (/product|menu|index|feature|shop|service|work|room|room|treatment|subject/.test(value)) return 'discovery'
  if (/team|proof|review|testimonial/.test(value)) return 'proof'
  if (/action|book|order|reserve|quote|contact|enquire|join/.test(value)) return 'action'
  if (/facts|visit|hours|area|delivery|care/.test(value)) return 'visit'
  if (/search|filter|timetable|dates/.test(value)) return 'utility'
  return 'note'
}

/**
 * Three reviewed directions, adapted to one business, with the home composed
 * from this business's own blocks. Each direction orders them differently, so
 * the three documents differ in what the opening screen actually shows, not
 * only in colour. Words are structural or absent: this stand-in has not read a
 * sentence it may quote.
 */
export function designSetFor(
  dossier: Dossier,
  brief: BusinessBrief,
  spec: AppSpec,
): DesignSet {
  const base = FLAGSHIP_TRADES.has(spec.vertical) ? flagshipDocFromSpec(spec) : docFromSpec(spec)
  // Compose once as the blueprint would, so the stand-in only orders sections
  // this business actually has content for.
  const composed = composeDoc(spec, structuredClone(base))
  const home = composed.screens.find((screen) => screen.kind === 'home')
  const variants: string[] = []
  for (const node of home?.sections ?? []) {
    const variant = node.variant ?? node.kind
    // Utility leftovers (policy, cookie, newsletter) are not a concept's home;
    // they stay in the document after the authored run, as the compiler intends.
    if (/cookie|policy|privacy|newsletter|social|footer|legal/i.test(variant)) continue
    if (!variants.includes(variant)) variants.push(variant)
  }
  const orders = [variants, [...variants.slice(-1), ...variants.slice(0, -1)], [...variants].reverse()]
  const layouts: ConceptSpec['home']['blocks'][number]['layout'][] = ['split', 'grid', 'strip']
  const concepts = TEMPLATE.concepts.map((concept, index) => {
    const key = ['editorial', 'utility', 'campaign'][index] as keyof typeof NAMES
    const meta = NAMES[key]
    const id = ['ledger', 'index', 'season'][index]
    const tabs = concept.nav.tabs.filter((screen) => dossier.allowedScreens.includes(screen))
    const safeTabs = tabs.length >= 2 ? tabs : (['home', 'more'] as typeof tabs)
    const labels = concept.nav.labels.filter((entry) => safeTabs.includes(entry.screen))
    const order = [...(orders[index] ?? variants)].slice(0, 7)
    const blocks = order.map((variant) => ({
      role: roleFor(variant),
      variant,
      layout: layouts[index],
    }))
    return {
      ...concept,
      id,
      name: meta.name,
      oneLine: meta.oneLine,
      rationale: {
        ...meta.rationale,
        whyThisBusiness: `${meta.rationale.whyThisBusiness} Written for ${brief.identity.category.toLowerCase()}.`,
      },
      nav: {
        ...concept.nav,
        tabs: safeTabs,
        initialScreen: safeTabs.includes(concept.nav.initialScreen) ? concept.nav.initialScreen : ('home' as const),
        labels: labels.length >= 2 ? labels : safeTabs.map((screen) => ({ screen, label: screen === 'home' ? 'Home' : screen[0].toUpperCase() + screen.slice(1) })),
      },
      home: {
        ...concept.home,
        blocks: blocks.length >= 3 ? blocks : concept.home.blocks,
      },
      content: { headings: [], notes: [] },
      differentiation: {
        against: [] as string[],
        axes: concept.differentiation.axes,
      },
    }
  })
  for (const concept of concepts) {
    concept.differentiation.against = concepts
      .filter((other) => other.id !== concept.id)
      .map((other) => other.id)
  }
  return {
    thesis: `Three directions for ${brief.identity.name}: a written catalogue, a dense index and a campaign frame.`,
    concepts,
    diversityClaim: [
      { pair: ['ledger', 'index'], different: ['typography', 'navigation', 'hierarchy', 'productPresentation', 'screenStructure', 'rhythm'] },
      { pair: ['index', 'season'], different: ['typography', 'palette', 'hero', 'navigation', 'hierarchy', 'componentDesign'] },
      { pair: ['ledger', 'season'], different: ['typography', 'palette', 'hero', 'hierarchy', 'screenStructure', 'rhythm'] },
    ],
    rejectedAlternatives: [],
  }
}
