import type { Doc } from './doc'

/**
 * Element-level editability audit.
 *
 * The renderer tags every semantic element inside a section (and every tab) with
 * a slot name: `section~tag~ordinal`. This walks the same markup without a DOM
 * and rebuilds those names, so a saved override can be checked against what the
 * page actually renders. It deliberately does not claim that every byte is
 * editable: the system-controlled list below names visible chrome that belongs
 * to the shell rather than to a component.
 */

const TAGS = 'h1,h2,h3,h4,h5,h6,p,span,img,button,a,svg'

/** Visible parts of the application shell. They follow the design direction and
 *  are not individual document elements. */
export const SYSTEM_CONTROLLED = [
  'App bar: back, brand mark, title, search, saved and cart buttons; brand, type and colours follow the design direction, while the screen title follows the screen name',
  'Launch splash and brand mark; colours and mark follow the design and project logo',
  'Bottom tab bar container and active indicator; labels, destinations and icons are editable on the navigation element',
  'Cart, checkout and booking sheets; fields and totals are runtime-owned, while their copy, currency and surrounding section styling follow the catalogue and design',
  'Runtime product-detail body: photograph, price, stock, product/variant controls and option state are built from the catalogue; product identity, option IDs and prices are not invented here',
  'Search and filter controls: query field, filter chips, result count and empty states are runtime-owned; the search section copy, visibility and styling remain editable',
  'Forms and their validation states: fields, required/error states and submit handling are runtime-owned; form headings and section appearance remain editable',
  'Responsive layouts: breakpoint CSS and per-section hiding are runtime/design-owned; section visibility and component arrangement remain editable',
  'Empty and loading states are rendered only when data is missing or arriving; the containing section remains editable and is not counted as a missing slot',
] as const

/** Appearance surfaces the owner can still configure when a runtime control is
 *  system-owned. Kept beside SYSTEM_CONTROLLED so the report does not imply the
 *  chrome is untouchable. */
export const APPEARANCE_CONTROLS = [
  'Design direction controls palette, type, corners, spacing and surface treatment for shell chrome.',
  'Screen navigation controls labels, destination and icon; the tab bar container follows the design direction.',
  'Catalogue controls product and variant names, prices, images and availability; the runtime controls render those values.',
  'Section-level visibility, responsive hiding, spacing, background and wording remain editable for the screen content around runtime controls.',
] as const

/** The areas the slot audit intentionally walks, including elements nested
 *  inside containers and runtime surfaces that are checked separately. */
export const AUDIT_COVERAGE = [
  ['Nested elements', 'Every semantic tag inside a section, including children of containers, is counted and named by the same slot scheme.'],
  ['Dynamic components', 'Flagship/data-bound sections are rendered from saved fixtures and checked for collisions; catalogue-owned children stay bound.'],
  ['Product and variant controls', 'The runtime detail controls are listed as system-owned; their data comes from the catalogue and their outer section remains editable.'],
  ['Search and filter controls', 'Search fields, filter chips, pagination and result counts are runtime-owned; the search section and result cards remain editable.'],
  ['Navigation', 'Every visible tab exposes a stable chrome~nav key; its label, destination and icon are editable.'],
  ['Buttons and forms', 'Document buttons are element slots; form inputs and validation are explicitly system-owned.'],
  ['Responsive layouts', 'Section responsive visibility is a document property; media rules remain design-owned and are not mistaken for missing elements.'],
  ['Empty and loading states', 'Runtime empty/loading states are listed separately and never counted as a missing saved override.'],
] as const

export type ElementAudit = {
  sections: number
  slots: number
  configured: number
  /** Copied containers created by the element layer, not present in source HTML. */
  copies: number
  /** Every persisted copy entry, including remapped descendants of containers. */
  copiedElements: number
  /** Areas this audit walks; system-owned surfaces are listed separately. */
  coverage: typeof AUDIT_COVERAGE
  /** Overrides whose slot no longer renders (e.g. a section now draws less). */
  missing: string[]
  /** Slot names produced twice, which would make selection ambiguous. */
  duplicates: string[]
  systemControlled: readonly string[]
}

function countsFor(chunk: string): string[] {
  const slots: string[] = []
  const counts: Record<string, number> = {}
  const pattern = new RegExp(`<(${TAGS.split(',').join('|')})\\b|<div\\b[^>]*\\bclass="[^"]*fx-[^"]*"`, 'gi')
  let match: RegExpExecArray | null
  while ((match = pattern.exec(chunk))) {
    const tag = match[1] ? match[1].toLowerCase() : 'div'
    const index = counts[tag] || 0
    counts[tag] = index + 1
    slots.push(tag + '~' + index)
  }
  return slots
}

/** Every element slot the rendered page exposes, in document order. */
export function elementSlots(html: string): string[] {
  const slots: string[] = []
  const parts = html.split('data-sec="')
  for (const part of parts.slice(1)) {
    const id = /^([a-z0-9_]{2,40})"/.exec(part)?.[1]
    if (!id) continue
    const chunk = part.slice(0, part.indexOf('<script')).split('</section>')[0].split('</main>')[0]
    for (const slot of countsFor(chunk)) slots.push(id + '~' + slot)
  }
  const tabs = html.match(/<button class="tab\b/g)?.length ?? 0
  for (let index = 0; index < tabs; index += 1) slots.push(`chrome~nav~${index}`)
  return slots
}

export function auditElementCoverage(doc: Doc, html: string): ElementAudit {
  const slots = elementSlots(html)
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const slot of slots) {
    if (seen.has(slot)) duplicates.add(slot)
    seen.add(slot)
  }
  const configured = Object.entries(doc.elements ?? {})
  const copied = configured.filter(([, entry]) => Boolean(entry?.duplicateOf))
  return {
    sections: doc.screens.reduce((total, screen) => total + screen.sections.length, 0),
    slots: slots.length,
    configured: configured.length,
    copies: copied.filter(([, entry]) => !entry?.copyParent).length,
    copiedElements: copied.length,
    coverage: AUDIT_COVERAGE,
    // A copy is appended by the client layer, so it has no source slot; every
    // other configured key must still point at an element that rendered.
    missing: configured.filter(([key, entry]) => !seen.has(key) && !entry?.duplicateOf).map(([key]) => key),
    duplicates: [...duplicates],
    systemControlled: SYSTEM_CONTROLLED,
  }
}
