import { fontStackFor } from '../design'
import { docFromSpec, flagshipDocFromSpec, normalizeDoc, type Doc, type DocNode, type ScreenKind } from '../doc'
import { directionsFor } from '../directions'
import { FLAGSHIP_TRADES } from '../flagship'
import type { AppSpec } from '../types'
import type { BusinessBrief, ConceptSpec } from './contracts'

/**
 * Design instructions become a specification and a document. This is the only
 * writer: the model never addresses a document node, a style or a price.
 *
 * Everything here is deterministic. The same concept always compiles to the
 * same document, which is what makes a saved build reviewable and an editor
 * session reproducible.
 */

export class CompileError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'CompileError'
    this.code = code
  }
}

const ROLE_WORDS: Record<string, RegExp> = {
  lead: /(title|hero|cover|intro|headline)/,
  discovery: /(products|services|rooms|menu|work|index|shelf|plans|listings|stock|subjects|formats|sessions|screenings|works|departments|clubs|categories)/,
  proof: /(team|staff|proof|testimonial|review)/,
  action: /(all|action|book|join|order|reserve|quote|contact|enquire|brief|help)/,
  visit: /(facts|visit|area|delivery|care|privacy|disclosure|process)/,
  utility: /(search|dates|timetable|filters)/,
  note: /(note|story|about)/,
}

/** A registered direction the concept's type system is closest to. It remains
 *  the fallback for anything the concept does not specify, and keeps every
 *  legacy surface (brief preview, exports) able to name the look. */
function registeredDirection(vertical: AppSpec['vertical'], type: ConceptSpec['architecture']['type']): string {
  const list = directionsFor(vertical)
  const preferred =
    type === 'serif'
      ? ['editorial', 'luxe', 'classic', 'gallery', 'warm']
      : type === 'display'
        ? ['lifestyle', 'bold', 'playful', 'performance']
        : ['minimal', 'modern', 'technical', 'clinical']
  return (
    list.find((direction) => preferred.some((word) => direction.id.includes(word)))?.id ?? list[0].id
  )
}

function suffix(variant: string, trade: string): string {
  const prefix = `c-${trade}-`
  return variant.startsWith(prefix) ? variant.slice(prefix.length) : variant.replace(/^c-/, '')
}

function matchBlock(
  block: ConceptSpec['home']['blocks'][number],
  trade: string,
  sections: DocNode[],
  used: Set<string>,
): DocNode | undefined {
  const wanted = block.variant.toLowerCase()
  const wantedSuffix = suffix(wanted, trade)
  return (
    sections.find((node) => !used.has(node.id) && (node.variant ?? '').toLowerCase() === wanted) ??
    sections.find(
      (node) =>
        !used.has(node.id) &&
        Boolean(node.variant) &&
        suffix((node.variant ?? '').toLowerCase(), trade) === wantedSuffix,
    ) ??
    sections.find((node) => {
      if (used.has(node.id) || !node.variant) return false
      return ROLE_WORDS[block.role].test(node.variant)
    })
  )
}

function cardVariant(concept: ConceptSpec): 0 | 1 | 2 | 3 {
  if (concept.catalogue.card === 'compact') return 0
  if (concept.catalogue.card === 'campaign') return 1
  return 3
}

function cornerShape(radius: number): 'sharp' | 'soft' | 'round' {
  return radius >= 18 ? 'round' : radius >= 10 ? 'soft' : 'sharp'
}

function accentStyleFor(concept: ConceptSpec): 'solid' | 'block' | 'underline' {
  return concept.type.direction === 'editorial'
    ? 'underline'
    : concept.type.direction === 'compact'
      ? 'block'
      : 'solid'
}

function motifFor(concept: ConceptSpec): 'arches' | 'grid' | 'circle' {
  if (concept.architecture.cards === 'compact') return 'grid'
  if (concept.architecture.cards === 'campaign') return 'circle'
  return 'arches'
}

export type CompiledConcept = {
  conceptId: string
  name: string
  spec: AppSpec
  doc: Doc
  direction: string
}

export function compileConcept(input: {
  spec: AppSpec
  brief: BusinessBrief
  concept: ConceptSpec
}): CompiledConcept {
  const { concept } = input
  const direction = registeredDirection(input.spec.vertical, concept.architecture.type)
  const display = fontStackFor(concept.type.display)
  const body = fontStackFor(concept.type.body)
  if (!display || !body) {
    throw new CompileError('font_unknown', `Unknown type family on concept ${concept.id}.`)
  }

  const spec: AppSpec = {
    ...input.spec,
    accent: concept.palette.accent,
    direction,
    layout: {
      variant: cardVariant(concept),
      density: concept.home.density,
      corners: cornerShape(concept.radius),
      hero: concept.home.hero,
      order: 'catalog',
      heroScale: concept.home.heroScale,
      buttons: concept.components.buttons,
      cards: concept.components.cards,
    },
    structure: {
      nav: 'tabs',
      stickyHeader: true,
      navLabels: concept.nav.labels.map((entry) => entry.label).slice(0, 5),
      hero: concept.home.hero,
      basis: `AI concept ${concept.id}`,
    },
  }

  const base = FLAGSHIP_TRADES.has(spec.vertical)
    ? flagshipDocFromSpec(spec)
    : docFromSpec(spec)
  const home = base.screens.find((screen) => screen.kind === 'home')
  if (!home) throw new CompileError('no_home', 'The seeded document has no home screen.')

  // Navigation is part of the concept, not of the trade's default shell. Until
  // this ran, a restaurant or professional concept inherited the blueprint's
  // tabs, so three concepts that promised different journeys compiled to the
  // same one. The screens are still all present and editable; only which ones
  // are tabs, and which opens first, follows the concept.
  const byKind = new Map<ScreenKind, (typeof base.screens)[number]>()
  for (const screen of base.screens) {
    if (screen.hidden || screen.kind === 'detail' || byKind.has(screen.kind)) continue
    byKind.set(screen.kind, screen)
  }
  const visible: string[] = []
  for (const kind of concept.nav.tabs) {
    const screen = byKind.get(kind as ScreenKind)
    if (screen && !visible.includes(screen.id)) visible.push(screen.id)
  }
  if (!visible.includes(home.id)) visible.push(home.id)
  for (const screen of base.screens) screen.nav = visible.includes(screen.id)
  base.initialScreen = byKind.get(concept.nav.initialScreen as ScreenKind)?.id ?? home.id
  base.design = { ...(base.design ?? {}), nav: concept.nav.model }

  const headings = new Map(
    concept.content.headings
      .filter((heading) => heading.basis === 'structural')
      .map((heading) => [heading.slot, heading.text]),
  )
  const used = new Set<string>()
  const ordered: DocNode[] = []
  let matched = 0
  for (const block of concept.home.blocks) {
    const node = matchBlock(block, spec.vertical, home.sections, used)
    if (!node) continue
    matched += 1
    used.add(node.id)
    const heading = headings.get(block.role)
    ordered.push({
      ...node,
      layout: block.layout,
      ...(heading ? { title: heading.slice(0, 90) } : {}),
    })
  }
  // Nothing the concept did not place is deleted: those blocks stay on the
  // document after the authored run, where the owner can still use them.
  // But a concept that matched almost nothing has not composed a screen, and
  // appending the rest would misrepresent its hierarchy as its own.
  if (matched < 2) {
    throw new CompileError('too_few_blocks', `Concept ${concept.id} matched fewer than two home blocks.`)
  }
  for (const node of home.sections) if (!used.has(node.id)) ordered.push(node)
  if (ordered.length < 3) {
    throw new CompileError('too_few_blocks', `Concept ${concept.id} produced fewer than three home blocks.`)
  }
  home.sections = ordered

  const nav = concept.nav.tabs.filter((kind) =>
    base.screens.some((screen) => screen.kind === kind),
  ) as ScreenKind[]
  base.design = {
    direction,
    typography: concept.type.direction,
    buttons: concept.components.buttons,
    cards: concept.components.cards,
    nav: concept.nav.model,
    density: concept.home.density,
    concept: {
      source: 'ai',
      structure: {
        id: concept.id,
        name: concept.name,
        architecture: concept.architecture,
        roleSequence: concept.home.blocks.map((block) => block.role),
        nav: nav.length >= 2 ? nav.slice(0, 5) : ['home', 'catalog', 'more'],
        navModel: concept.nav.model,
        initial: concept.nav.initialScreen,
      },
      tokens: {
        display,
        body,
        priceFont: concept.type.priceFont,
        weight: concept.type.weight,
        tracking: concept.type.tracking,
        accentStyle: accentStyleFor(concept),
        motif: motifFor(concept),
        palette: concept.palette,
        radius: concept.radius,
      },
    },
  }
  base.accent = concept.palette.accent

  const doc = normalizeDoc(base, spec)
  if (!doc.design?.concept) {
    throw new CompileError('concept_dropped', `Concept ${concept.id} failed document sanitisation.`)
  }
  return { conceptId: concept.id, name: concept.name, spec, doc, direction }
}

