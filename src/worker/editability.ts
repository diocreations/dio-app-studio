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
  'App bar: back, brand mark, title, search, saved and cart buttons',
  'Launch splash and brand mark',
  'Bottom tab bar container and active state',
  'Cart, checkout and booking sheets',
  'Runtime product-detail body (built from the selected catalogue item)',
  'Form inputs and their validation states',
] as const

export type ElementAudit = {
  sections: number
  slots: number
  configured: number
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
  const configured = Object.keys(doc.elements ?? {})
  return {
    sections: doc.screens.reduce((total, screen) => total + screen.sections.length, 0),
    slots: slots.length,
    configured: configured.length,
    missing: configured.filter((key) => !seen.has(key)),
    duplicates: [...duplicates],
    systemControlled: SYSTEM_CONTROLLED,
  }
}
