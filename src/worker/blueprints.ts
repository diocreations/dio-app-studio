import type { AppSpec } from './types'
import { directionsFor } from './directions'
import type { Doc, DocNode, ScreenKind } from './doc'

/**
 * Structural blueprints.
 *
 * A direction answers "what does this business look like". A blueprint answers
 * "how is this application put together": which block opens the landing screen,
 * whether the catalogue is the landing screen at all, which blocks are allowed
 * on it, and which tabs exist in which order. Two concepts with different
 * directions but one blueprint are one application in two skins, so generation
 * assigns a blueprint to each direction and validates the three documents
 * against each other before the owner sees them.
 *
 * The blueprints are compositions over a trade's own block vocabulary (the
 * flagship variants a trade already has), not three universal page templates:
 * a hotel receives rooms and a stay card, a restaurant a dish and an order
 * action. The structural strategies are shared because they describe customer
 * intent — read, browse, be immersed — not the business.
 */

export type BlueprintId = 'lead' | 'index' | 'immersive'

/** What a block does for the customer, independent of what it is called. */
export type BlockRole = 'lead' | 'discovery' | 'proof' | 'action' | 'visit' | 'utility' | 'note'

export type Blueprint = {
  id: BlueprintId
  label: string
  thesis: string
  /** Home blocks, in order. A role absent from the list is left off home. */
  home: BlockRole[]
  /** Visible tabs, in order. Only kinds the build actually has are used. */
  nav: ScreenKind[]
  initial: 'home' | 'catalog'
  density: 'roomy' | 'standard' | 'compact'
  /** Where the first photograph sits on the landing screen. */
  hero: 'title-first' | 'catalogue-first' | 'image-first'
}

const BLUEPRINTS: Record<BlueprintId, Blueprint> = {
  lead: {
    id: 'lead',
    label: 'Narrative lead',
    thesis: 'A title, one strong body of work, then the action. Home is the story; the catalogue is a room off it.',
    home: ['lead', 'discovery', 'action'],
    nav: ['home', 'catalog', 'book', 'quote', 'more'],
    initial: 'home',
    density: 'roomy',
    hero: 'title-first',
  },
  index: {
    id: 'index',
    label: 'Catalogue first',
    thesis: 'The app opens on what there is to choose from. Home is a short index of search, work and the next step.',
    home: ['utility', 'discovery', 'action', 'proof', 'visit'],
    nav: ['catalog', 'home', 'book', 'quote', 'more'],
    initial: 'catalog',
    density: 'standard',
    hero: 'catalogue-first',
  },
  immersive: {
    id: 'immersive',
    label: 'Image first',
    thesis: 'Photographs before words, a short statement after them, and room for search beside the catalogue.',
    home: ['discovery', 'proof', 'visit'],
    nav: ['home', 'catalog', 'search', 'book', 'more', 'quote'],
    initial: 'home',
    density: 'roomy',
    hero: 'image-first',
  },
}

/** Which flagship block plays which part for the five trades with a composition
 *  of their own. Anything unlisted falls back to reading the block's name. */
const ROLES: Partial<Record<string, Record<string, BlockRole>>> = {
  shop: {
    'shop-title': 'lead',
    'shop-products': 'discovery',
    'shop-search': 'utility',
    'shop-all': 'action',
  },
  restaurant: {
    'dine-title': 'lead',
    'dine-feature': 'discovery',
    'dine-actions': 'action',
    'dine-note': 'note',
    'dine-facts': 'visit',
  },
  hotel: {
    'hotel-cover': 'lead',
    'hotel-rooms': 'discovery',
    'hotel-stay': 'action',
    'hotel-facts': 'visit',
  },
  salon: {
    'salon-title': 'lead',
    'salon-services': 'discovery',
    'salon-dates': 'utility',
    'salon-staff': 'proof',
    'salon-action': 'action',
  },
  professional: {
    'pro-title': 'lead',
    'pro-intro': 'lead',
    'pro-index': 'discovery',
    'pro-team': 'proof',
    'pro-actions': 'action',
    'pro-facts': 'visit',
  },
}

const DISCOVERY = /(products|rooms|services|menu|listings|work|index|shelf|plans|stays|departments|stock|subjects|formats|sessions|screenings|shows|works)/i
const ACTION = /(action|book|join|enrol|order|reserve|quote|contact|enquire|brief|appointment|urgent|help)/i
const UTILITY = /(search|dates|filters|timetable)/i
const VISIT = /(facts|visit|area|care|privacy|delivery|disclosure|process)/i
const LEAD = /(hero|cover|title|intro)/i

function roleOf(variant: string, index: number, total: number): BlockRole {
  if (DISCOVERY.test(variant)) return 'discovery'
  if (ACTION.test(variant)) return 'action'
  if (UTILITY.test(variant)) return 'utility'
  if (VISIT.test(variant)) return 'visit'
  if (LEAD.test(variant)) return 'lead'
  if (index === 0) return 'lead'
  if (index === total - 1) return 'action'
  return index % 2 === 0 ? 'proof' : 'note'
}

/** A small stable hash, so two businesses of the same trade do not open with
 *  the same three structures in the same order. */
function hash(text: string): number {
  let value = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index)
    value = Math.imul(value, 16777619)
  }
  return value >>> 0
}

/** Structures a named visual direction can honestly carry. An editorial
 *  direction can lead with a statement or with a picture; a minimal one is an
 *  index; a lifestyle one is image-led. A direction is never given a structure
 *  that contradicts what its label promises to the owner. */
const PREFERENCES: { test: RegExp; options: BlueprintId[] }[] = [
  { test: /(lifestyle|playful|bold)/, options: ['immersive', 'lead'] },
  { test: /(minimal|modern|technical|clinical|performance)/, options: ['index', 'lead'] },
  { test: /(editorial|luxe|classic|gallery|cinema|warm)/, options: ['lead', 'immersive'] },
]

function preferencesFor(id: string): BlueprintId[] {
  return PREFERENCES.find((entry) => entry.test.test(id))?.options ?? ['lead', 'index', 'immersive']
}

/** All three directions of a trade, resolved together so no two can take the
 *  same structure. A direction with two honest options alternates with the
 *  business, so the trio is not permanently fixed to a category. */
function assignments(spec: AppSpec): BlueprintId[] {
  const list = directionsFor(spec.vertical)
  const used = new Set<BlueprintId>()
  const chosen: BlueprintId[] = []
  const parity = hash(`${spec.name}|${spec.vertical}|${spec.tagline ?? ''}`) % 2
  for (const entry of list) {
    const options = preferencesFor(entry.id)
    // Only the genuinely interchangeable directions alternate (a narrative can
    // lead with type or with a picture). An index direction stays an index.
    const ordered = parity && options[0] === 'lead' ? [...options].reverse() : options
    const next =
      ordered.find((id) => !used.has(id)) ??
      (['lead', 'index', 'immersive'] as BlueprintId[]).find((id) => !used.has(id)) ??
      'lead'
    used.add(next)
    chosen.push(next)
  }
  return chosen
}

/** The blueprint for the direction on this specification. */
export function blueprintFor(spec: AppSpec): Blueprint {
  const list = directionsFor(spec.vertical)
  const index = Math.max(0, list.findIndex((entry) => entry.id === spec.direction))
  return BLUEPRINTS[assignments(spec)[index] ?? 'lead']
}

function rolesFor(spec: AppSpec, nodes: DocNode[], total: number): (BlockRole | null)[] {
  const table = ROLES[spec.vertical]
  return nodes.map((node, index) => {
    if (!node.variant) return null
    return table?.[node.variant] ?? roleOf(node.variant, index, total)
  })
}

/** Compose home from the blueprint. Content, item references, calls to action
 *  and photographs stay on their own nodes; only their membership and order
 *  change. */
export function composeHome(
  spec: AppSpec,
  sections: DocNode[],
): { home: DocNode[]; elsewhere: DocNode[] } {
  const blueprint = blueprintFor(spec)
  const roles = rolesFor(spec, sections, sections.length)
  const chosen: DocNode[] = []
  const take = (role: BlockRole, at?: number) => {
    for (let index = 0; index < sections.length; index += 1) {
      if (roles[index] !== role) continue
      const node = sections[index]
      if (chosen.some((entry) => entry.id === node.id)) continue
      if (at === undefined) chosen.push(node)
      else chosen.splice(at, 0, node)
      return true
    }
    return false
  }
  for (const role of blueprint.home) take(role)
  // A photograph-led landing puts the name after the picture, not before it.
  if (blueprint.id === 'immersive' && chosen.length) take('lead', 1)
  // A trade with few blocks still needs a composed screen rather than one
  // lonely band. The fillers keep each blueprint's own hierarchy: an index
  // never gains a marketing title, a narrative never loses one.
  const fillers: BlockRole[] =
    blueprint.id === 'lead' ? ['proof', 'note', 'visit'] : blueprint.id === 'index' ? ['note', 'proof', 'visit'] : ['proof', 'visit', 'note']
  for (const role of fillers) {
    if (chosen.length >= 3) break
    take(role)
  }
  // Nothing a blueprint does not put on home is silently deleted: the other
  // blocks keep their own order after the composed run, where the owner can
  // still select and move them.
  return { home: chosen, elsewhere: sections.filter((section) => !chosen.includes(section)) }
}

/** Navigation belongs to the blueprint: the same trade can open on its
 *  catalogue in one concept and on its story in another. */
export function composeScreens(spec: AppSpec, doc: Doc): { doc: Doc; blueprint: Blueprint } {
  const blueprint = blueprintFor(spec)
  const byKind = new Map<ScreenKind, (typeof doc.screens)[number]>()
  for (const screen of doc.screens) {
    if (screen.hidden || screen.kind === 'detail') continue
    if (!byKind.has(screen.kind)) byKind.set(screen.kind, screen)
  }
  const visible: string[] = []
  for (const kind of blueprint.nav) {
    const screen = byKind.get(kind)
    if (!screen || visible.includes(screen.id)) continue
    visible.push(screen.id)
    if (visible.length === 5) break
  }
  const home = doc.screens.find((screen) => screen.kind === 'home')
  if (home && !visible.includes(home.id)) visible.push(home.id)
  const initial =
    blueprint.initial === 'catalog'
      ? byKind.get('catalog')?.id ?? doc.initialScreen
      : home?.id ?? doc.initialScreen
  for (const screen of doc.screens) screen.nav = visible.includes(screen.id)
  // Tabs follow the blueprint, not insertion order; screens that are not tabs
  // keep their relative order after them. The shell renders navScreens by this
  // order and opens initialScreen, so both are read from one place.
  const ordered = [...doc.screens].sort((a, b) => {
    const ai = visible.indexOf(a.id)
    const bi = visible.indexOf(b.id)
    if (ai > -1 && bi > -1) return ai - bi
    if (ai > -1) return -1
    if (bi > -1) return 1
    return doc.screens.indexOf(a) - doc.screens.indexOf(b)
  })
  doc.screens = ordered
  doc.initialScreen = initial
  return { doc, blueprint }
}

/** Generation calls this once, after the trade's own blocks are built. */
export function composeDoc(spec: AppSpec, doc: Doc): Doc {
  const home = doc.screens.find((screen) => screen.kind === 'home')
  if (home) {
    const composed = composeHome(spec, home.sections)
    // Blocks the blueprint does not put first still belong to the owner and
    // stay visible and editable after the composed run; nothing is deleted or
    // hidden by generation.
    home.sections = [...composed.home, ...composed.elsewhere]
  }
  return composeScreens(spec, doc).doc
}

export type Structure = {
  initial: string
  nav: string[]
  sections: string[]
  roles: BlockRole[]
  count: number
}

function roleList(spec: AppSpec, nodes: DocNode[]): BlockRole[] {
  const roles = rolesFor(spec, nodes, nodes.length)
  return nodes.map((node, index) => roles[index] ?? 'proof')
}

/** What the owner is actually comparing, taken from the document rather than
 *  from the direction that produced it. */
export function structureOf(spec: AppSpec, doc: Doc): Structure {
  const home = doc.screens.find((screen) => screen.kind === 'home')
  const nodes = (home?.sections ?? []).filter((node) => !node.hidden)
  return {
    initial: doc.screens.find((screen) => screen.id === doc.initialScreen)?.kind ?? 'home',
    nav: doc.screens.filter((screen) => screen.nav).map((screen) => screen.kind),
    sections: nodes.map((node) => node.variant ?? node.kind),
    roles: roleList(spec, nodes),
    count: nodes.length,
  }
}

function jaccard(a: string[], b: string[]): number {
  const left = new Set(a)
  const right = new Set(b)
  if (!left.size && !right.size) return 1
  let shared = 0
  for (const value of left) if (right.has(value)) shared += 1
  return shared / (left.size + right.size - shared)
}

export type PairVerdict = {
  a: string
  b: string
  score: number
  sameInitial: boolean
  sameOrder: boolean
  reasons: string[]
}

export type Diversity = { ok: boolean; pairs: PairVerdict[] }

/**
 * Compare three concepts as applications, not as colourways. Two documents that
 * open on the same screen, carry the same tabs and show the same blocks in the
 * same order are one design and fail regardless of type or palette.
 */
export function validateConcepts(
  spec: AppSpec,
  docs: { id: string; doc: Doc }[],
): Diversity {
  const pairs: PairVerdict[] = []
  for (let i = 0; i < docs.length; i += 1) {
    for (let j = i + 1; j < docs.length; j += 1) {
      const left = structureOf(spec, docs[i].doc)
      const right = structureOf(spec, docs[j].doc)
      const sameInitial = left.initial === right.initial
      const sameOrder = left.sections.join('>') === right.sections.join('>')
      const sectionScore = jaccard(left.sections, right.sections)
      const navScore = jaccard(left.nav, right.nav)
      // Hierarchy and chrome are what an owner experiences, so they carry the
      // weight. A shared block vocabulary is expected within one trade; the
      // same order, opening screen and tabs are what make it one design.
      const score =
        (sameOrder ? 0.4 : 0) +
        (sameInitial ? 0.25 : 0) +
        (navScore === 1 ? 0.25 : 0) +
        (sectionScore === 1 ? 0.1 : 0)
      const reasons: string[] = []
      if (sameOrder) reasons.push('same sections in the same order')
      if (sameInitial) reasons.push('same opening screen')
      if (navScore === 1) reasons.push('same tabs')
      if (sectionScore >= 0.8) reasons.push('same block set')
      pairs.push({
        a: docs[i].id,
        b: docs[j].id,
        score: Math.round(score * 100) / 100,
        sameInitial,
        sameOrder,
        reasons,
      })
    }
  }
  // Different tokens are not enough. Two concepts must arrange their home
  // differently, and must also differ in what opens or what the tabs are;
  // otherwise they are the same application with a different paint.
  // A concept must put its blocks in a different hierarchy and must also differ
  // in what opens or in its tabs. Equal order with a new palette fails here.
  return {
    ok: pairs.every(
      (pair) =>
        !pair.sameOrder &&
        !(pair.sameInitial && pair.reasons.includes('same tabs')),
    ),
    pairs,
  }
}

/**
 * Block-level editability audit. Every rendered component must carry the id of
 * a document node on some screen, and every visible node must reach the page.
 * It cannot see inside a component's own markup, so it is a floor, not a
 * substitute for element-level selection.
 */
export function auditCoverage(
  doc: Doc,
  html: string,
): { missing: string[]; unknown: string[] } {
  const rendered = new Set([...html.matchAll(/data-sec="(sec_[^"]+)"/g)].map((match) => match[1]))
  const nodes = doc.screens.flatMap((screen) => screen.sections)
  const visible = new Set(nodes.filter((node) => !node.hidden).map((node) => node.id))
  return {
    missing: [...visible].filter((id) => !rendered.has(id)),
    unknown: [...rendered].filter((id) => !nodes.some((node) => node.id === id)),
  }
}

/** The three documents one business is offered, in direction order. */
export function conceptDocs(spec: AppSpec, build: (spec: AppSpec) => Doc): {
  docs: { id: string; doc: Doc }[]
  diversity: Diversity
} {
  const list = directionsFor(spec.vertical)
  const docs = list.map((direction) => ({
    id: direction.id,
    doc: build({ ...spec, direction: direction.id }),
  }))
  return { docs, diversity: validateConcepts(spec, docs) }
}
