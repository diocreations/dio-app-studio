import { sanitizeHex } from './pricing'
import type { AppSpec } from './types'
import { themeFor } from './themes'
import { verticalFor } from './verticals'

/*
 * One structured document shared by generation, the editor, preview, the
 * published app and the exports. A node is a home section with its own content,
 * style and responsive rules; the renderer reads this document directly, so an
 * edit in the editor is an edit to what customers see.
 *
 * Stable ids: a default node is `sec_<kind>`, added ones `sec_<kind>_<n>`. They
 * survive rebuilds and reorders, so selection and undo keep pointing at the
 * same section.
 */

export type SectionKind =
  | 'hero'
  | 'featured'
  | 'offers'
  | 'loyalty'
  | 'visit'
  | 'story'
  | 'testimonials'
  | 'cta'

export const SECTION_KINDS: readonly SectionKind[] = [
  'hero',
  'featured',
  'offers',
  'loyalty',
  'visit',
  'story',
  'testimonials',
  'cta',
]

export type Breakpoint = 'desktop' | 'tablet' | 'mobile'

export type SectionStyle = {
  /** A solid colour behind the section, or absent for the page background. */
  background?: string
  color?: string
  align?: 'left' | 'center'
  /** 0 none, 1 comfortable, 2 generous. */
  paddingY?: 0 | 1 | 2
  /** 0 square, 1 soft, 2 round. */
  radius?: 0 | 1 | 2
}

export type Responsive = {
  /** Breakpoints where the section is not shown. */
  hideOn: Breakpoint[]
}

export type DocNode = {
  id: string
  kind: SectionKind
  title?: string
  text?: string
  cta?: { label: string; screen: string }
  style: SectionStyle
  responsive: Responsive
  hidden: boolean
}

export type Doc = {
  v: 1
  /** The one accent every surface derives from. */
  accent?: string
  sections: DocNode[]
}

const KIND_LABEL: Record<SectionKind, string> = {
  hero: 'Hero',
  featured: 'Featured',
  offers: 'Offers',
  loyalty: 'Rewards',
  visit: 'Visit',
  story: 'Story',
  testimonials: 'Testimonials',
  cta: 'Call to action',
}

export function sectionLabel(kind: SectionKind): string {
  return KIND_LABEL[kind]
}

const SCREEN = /^[a-z][a-z0-9-]{0,20}$/
// Added sections use an underscore (`sec_testimonials_m3x`), so allow both.
const NODE_ID = /^sec_[a-z0-9_-]{1,40}$/
const CLAMP = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : ''

function defaultStyle(kind: SectionKind): SectionStyle {
  if (kind === 'cta') return { align: 'center', paddingY: 1, radius: 2 }
  if (kind === 'testimonials') return { align: 'center', paddingY: 1 }
  return {}
}

function node(kind: SectionKind, extra: Partial<DocNode> = {}): DocNode {
  return {
    id: `sec_${kind}`,
    kind,
    style: defaultStyle(kind),
    responsive: { hideOn: [] },
    hidden: false,
    ...extra,
  }
}

/** The order the seeded design would have used, in document terms. */
function seededOrder(spec: AppSpec): SectionKind[] {
  const order = spec.layout?.order
  if (order === 'offers') return ['offers', 'featured', 'loyalty', 'story', 'visit']
  if (order === 'visit') return ['visit', 'story', 'featured', 'offers', 'loyalty']
  if (order === 'rewards') return ['loyalty', 'story', 'featured', 'offers', 'visit']
  return ['featured', 'offers', 'loyalty', 'visit', 'story']
}

function available(spec: AppSpec, kind: SectionKind): boolean {
  if (kind === 'hero' || kind === 'featured' || kind === 'visit') return true
  if (kind === 'offers') return spec.features.includes('offers') && spec.offers.length > 0
  if (kind === 'loyalty') return spec.features.includes('loyalty')
  if (kind === 'story') return Boolean(spec.story?.trim())
  return false
}

/**
 * The document a build starts with. It only contains sections the trade and its
 * features can actually render, so the editor never offers an empty promise.
 */
export function docFromSpec(spec: AppSpec): Doc {
  const order = seededOrder(spec)
  const present = order.filter((kind) => available(spec, kind))
  // A layout's order can omit a section; append anything available but unlisted.
  for (const kind of SECTION_KINDS) {
    if (kind !== 'hero' && available(spec, kind) && !present.includes(kind)) present.push(kind)
  }
  const sections: DocNode[] = [node('hero', { title: spec.name, text: spec.tagline })]
  for (const kind of present) {
    if (kind === 'story') {
      sections.push(node('story', { title: 'Our story', text: spec.story }))
      continue
    }
    sections.push(node(kind))
  }
  return { v: 1, accent: spec.accent, sections }
}

function sanitizeNode(value: unknown, fallbackId: string): DocNode | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const kind = SECTION_KINDS.includes(raw.kind as SectionKind) ? (raw.kind as SectionKind) : null
  if (!kind) return null
  const styleInput =
    raw.style && typeof raw.style === 'object' ? (raw.style as Record<string, unknown>) : {}
  const responsiveInput =
    raw.responsive && typeof raw.responsive === 'object'
      ? (raw.responsive as Record<string, unknown>)
      : {}
  const hideInput = responsiveInput.hideOn
  const hideOn = Array.isArray(hideInput)
    ? (['desktop', 'tablet', 'mobile'] as Breakpoint[]).filter((point) => hideInput.includes(point))
    : []
  const ctaInput = raw.cta && typeof raw.cta === 'object' ? (raw.cta as Record<string, unknown>) : null
  const ctaLabel = ctaInput ? CLAMP(ctaInput.label, 28) : ''
  const screen = ctaInput ? CLAMP(ctaInput.screen, 21) : ''
  const align = styleInput.align === 'center' || styleInput.align === 'left' ? styleInput.align : undefined
  const paddingY = styleInput.paddingY === 0 || styleInput.paddingY === 1 || styleInput.paddingY === 2
    ? styleInput.paddingY
    : undefined
  const radius = styleInput.radius === 0 || styleInput.radius === 1 || styleInput.radius === 2
    ? styleInput.radius
    : undefined
  const id = typeof raw.id === 'string' && NODE_ID.test(raw.id) ? raw.id : fallbackId
  return {
    id,
    kind,
    title: CLAMP(raw.title, 60) || undefined,
    text: CLAMP(raw.text, 600) || undefined,
    ...(ctaLabel && SCREEN.test(screen) ? { cta: { label: ctaLabel, screen } } : {}),
    style: {
      ...(typeof styleInput.background === 'string'
        ? { background: sanitizeHex(styleInput.background, '') || undefined }
        : {}),
      ...(typeof styleInput.color === 'string'
        ? { color: sanitizeHex(styleInput.color, '') || undefined }
        : {}),
      ...(align ? { align } : {}),
      ...(paddingY !== undefined ? { paddingY } : {}),
      ...(radius !== undefined ? { radius } : {}),
    },
    responsive: { hideOn },
    hidden: raw.hidden === true,
  }
}

/**
 * Accepts anything the browser sends and returns a safe document: known kinds
 * only, unique stable ids, bounded text, sanitised colours. The hero always
 * exists, so the page can never be saved without its opening.
 */
export function normalizeDoc(value: unknown, spec: AppSpec): Doc {
  const fallback = docFromSpec(spec)
  if (!value || typeof value !== 'object') return fallback
  const raw = value as Record<string, unknown>
  const input = Array.isArray(raw.sections) ? raw.sections : []
  const seenIds = new Set<string>()
  const sections: DocNode[] = []
  for (const [index, entry] of input.slice(0, 24).entries()) {
    const clean = sanitizeNode(entry, `sec_${index}`)
    if (!clean || seenIds.has(clean.id)) continue
    seenIds.add(clean.id)
    sections.push(clean)
  }
  const hero = sections.find((section) => section.kind === 'hero')
  if (!hero) sections.unshift(fallback.sections[0])
  else hero.hidden = false
  const ordered = [sections.find((section) => section.kind === 'hero')!, ...sections.filter((section) => section.kind !== 'hero')]
  const accent =
    typeof raw.accent === 'string' ? sanitizeHex(raw.accent, '') || undefined : fallback.accent
  return { v: 1, accent, sections: ordered }
}

export function sectionFor(doc: Doc | null, kind: SectionKind): DocNode | undefined {
  return doc?.sections.find((section) => section.kind === kind)
}

export function visibleSections(doc: Doc | null): DocNode[] {
  return (doc?.sections ?? []).filter((section) => !section.hidden)
}

/** A node id that is not in use yet, so duplicates and additions stay stable. */
function nextId(doc: Doc, kind: SectionKind): string {
  const base = `sec_${kind}`
  if (!doc.sections.some((section) => section.id === base)) return base
  let index = 2
  while (doc.sections.some((section) => section.id === `${base}_${index}`)) index += 1
  return `${base}_${index}`
}

export function addSection(doc: Doc, kind: SectionKind, spec: AppSpec): Doc {
  if (sectionFor(doc, kind)) return doc
  const defaults: Partial<Record<SectionKind, Partial<DocNode>>> = {
    testimonials: { title: 'Kind words', text: 'Loved by regulars. Add a review to show it here.' },
    cta: { title: 'Ready when you are', text: 'Start with a message, and we will take it from there.' },
  }
  return {
    ...doc,
    sections: [...doc.sections, node(kind, { id: nextId(doc, kind), ...defaults[kind] })],
  }
}

export function removeSection(doc: Doc, id: string): Doc {
  if (id === 'sec_hero') return doc
  return { ...doc, sections: doc.sections.filter((section) => section.id !== id) }
}

export function moveSection(doc: Doc, id: string, beforeId: string | null): Doc {
  const from = doc.sections.findIndex((section) => section.id === id)
  if (from < 0) return doc
  const moving = doc.sections[from]
  if (moving.kind === 'hero') return doc
  const rest = doc.sections.filter((section) => section.id !== id)
  const at = beforeId ? rest.findIndex((section) => section.id === beforeId) : rest.length
  if (at < 0) return doc
  const heroFirst = rest[0]?.kind === 'hero' ? 1 : 0
  rest.splice(Math.max(at, heroFirst), 0, moving)
  return { ...doc, sections: rest }
}

export function duplicateSection(doc: Doc, id: string): Doc {
  const index = doc.sections.findIndex((section) => section.id === id)
  if (index < 0) return doc
  const copy = doc.sections[index]
  if (copy.kind === 'hero' || SECTION_KINDS.includes(copy.kind) === false) return doc
  const clone: DocNode = {
    ...copy,
    id: nextId(doc, copy.kind),
    title: copy.title ? `${copy.title} (copy)` : copy.title,
  }
  const sections = [...doc.sections]
  sections.splice(index + 1, 0, clone)
  return { ...doc, sections }
}

export function updateSection(
  doc: Doc,
  id: string,
  patch: Partial<Pick<DocNode, 'title' | 'text' | 'hidden' | 'style' | 'responsive'>>,
): Doc {
  return {
    ...doc,
    sections: doc.sections.map((section) =>
      section.id === id
        ? {
            ...section,
            ...(patch.title !== undefined ? { title: CLAMP(patch.title, 60) || undefined } : {}),
            ...(patch.text !== undefined ? { text: CLAMP(patch.text, 600) || undefined } : {}),
            ...(patch.hidden !== undefined ? { hidden: Boolean(patch.hidden) } : {}),
            ...(patch.style ? { style: { ...section.style, ...patch.style } } : {}),
            ...(patch.responsive
              ? {
                  responsive: {
                    hideOn: (['desktop', 'tablet', 'mobile'] as Breakpoint[]).filter((point) =>
                      patch.responsive?.hideOn?.includes(point),
                    ),
                  },
                }
              : {}),
          }
        : section,
    ),
  }
}

export type AiResult = { doc: Doc; summary: string }

/**
 * The on-device assistant. It understands a small, honest vocabulary of design
 * instructions and applies them to the same document the editor and renderer
 * use; anything it does not understand is said so rather than guessed at.
 *
 * This is deliberately not a model call: it costs nothing, works offline and
 * cannot invent content. A hosted model can replace this function behind the
 * same signature later without touching the editor.
 */
export function applyCommand(doc: Doc, command: string, spec: AppSpec): AiResult {
  const text = command.trim().toLowerCase()
  if (!text) return { doc, summary: 'Type an instruction first.' }

  const palette: [RegExp, string, string][] = [
    [/\bpremium|luxur|elegant\b/, '#9a7b4f', 'A quieter, premium palette with warm gold.'],
    [/\bmodern|contemporary\b/, '#1f2937', 'A modern charcoal accent.'],
    [/\bwarm|cosy|cozy\b/, '#c05a33', 'A warmer terracotta accent.'],
    [/\bminimal|clean\b/, '#2f3a34', 'A restrained, minimal accent.'],
    [/\bbold|vibrant\b/, '#c22f5e', 'A bolder accent for the primary actions.'],
  ]
  for (const [pattern, accent, summary] of palette) {
    if (pattern.test(text)) return { doc: { ...doc, accent }, summary }
  }

  if (/testimonial|review/.test(text)) {
    return { doc: addSection(doc, 'testimonials', spec), summary: 'Added a testimonials section.' }
  }
  if (/\bcta\b|call to action|closing/.test(text)) {
    return { doc: addSection(doc, 'cta', spec), summary: 'Added a closing call to action.' }
  }
  if (/hero/.test(text)) {
    const hero = sectionFor(doc, 'hero')
    if (!hero) return { doc, summary: 'This build has no hero to change.' }
    return {
      doc: updateSection(doc, hero.id, {
        style: { align: 'center', paddingY: 2 },
        text: hero.text ? `${hero.text.replace(/[.\s]+$/, '')}. Book or order in a few taps.` : hero.text,
      }),
      summary: 'Made the hero more direct and centred.',
    }
  }
  if (/rearrange|reorder|order/.test(text)) {
    const movable = doc.sections.filter((section) => section.kind !== 'hero')
    if (movable.length < 2) return { doc, summary: 'There is only one section to arrange.' }
    const [first, ...rest] = movable
    const next = { ...doc, sections: [doc.sections[0], ...rest, first] }
    return { doc: next, summary: 'Moved the first section to the end.' }
  }
  if (/mobile|responsive/.test(text)) {
    return {
      doc: {
        ...doc,
        sections: doc.sections.map((section) => ({ ...section, responsive: { hideOn: [] } })),
      },
      summary: 'Cleared every section’s device hiding, so the mobile layout shows the full page.',
    }
  }
  const colour = /#([0-9a-f]{3}|[0-9a-f]{6})\b/i.exec(text)
  if (colour) {
    const accent = sanitizeHex(colour[0], '')
    if (accent)
      return { doc: { ...doc, accent }, summary: `Set the accent to ${accent.toUpperCase()}.` }
  }
  return {
    doc,
    summary: 'I did not catch that one. Try “make it premium”, “add testimonials” or “rearrange the homepage”.',
  }
}
