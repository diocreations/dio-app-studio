import { customerSpec } from './app'
import { type CopiedField, type Doc } from './doc'
import { flagshipSection, type FlagshipContext } from './flagship'
import type { AppSpec } from './types'

/**
 * Carries a copied business value forward when the business changes it.
 *
 * A generated heading that still reads exactly what the specification said is
 * a copy and follows the new value. One the owner has rewritten no longer
 * matches, so it keeps the owner's words. Nothing else in the document moves.
 */
export function refreshCopiedCopy(
  doc: Doc,
  before: AppSpec,
  after: AppSpec,
): { doc: Doc; changed: number } {
  let changed = 0
  const screens = doc.screens.map((screen) => ({
    ...screen,
    sections: screen.sections.map((node) => {
      if (!node.follows) return node
      let next = node
      for (const slot of ['title', 'text'] as const) {
        const source: CopiedField | undefined = node.follows[slot]
        if (!source) continue
        const was = String(before[source] ?? '').trim()
        const now = String(after[source] ?? '').trim()
        if (!was || was === now) continue
        if ((next[slot] ?? '').trim() !== was) continue
        changed += 1
        next = { ...next, [slot]: now || undefined }
      }
      return next
    }),
  }))
  return changed ? { doc: { ...doc, screens }, changed } : { doc, changed }
}

/**
 * A saved component that renders nothing is worse than an absent one: the
 * editor lists it as a visible part of the app, the dashboard counts it, and
 * the published page silently skips it. Examples are the coach profiles on a
 * gym with no team and the visit details on a restaurant with no hours.
 *
 * This runs where a document is stored and where it is approved, so a section
 * that cannot draw itself is marked hidden in the document and stays that way
 * until it has something to say. Nothing an owner wrote is touched: the block
 * is checked with the customer renderer, and a component is only hidden when
 * that renderer returns no markup at all.
 */
export function pruneEmptySections(
  doc: Doc,
  spec: AppSpec,
  token: string,
): { doc: Doc; hidden: string[] } {
  // The same specification the published page renders with, so a block that
  // only holds sample data counts as empty here exactly as it does there.
  const customer = customerSpec(spec)
  const ctx: FlagshipContext = {
    spec: customer,
    token,
    booking: customer.features.includes('booking') || customer.features.includes('classes'),
    doc,
  }
  const hidden: string[] = []
  const screens = doc.screens.map((screen) => {
    let emptied = false
    const sections = screen.sections.map((node) => {
      if (node.hidden || node.kind !== 'flagship') return node
      let markup = ''
      try {
        markup = flagshipSection(ctx, node)
      } catch {
        // A renderer that trips over unusual data must not take the save down.
        return node
      }
      if (markup.trim()) return node
      emptied = true
      hidden.push(node.id)
      return { ...node, hidden: true, hiddenBecause: 'empty' as const }
    })
    return emptied ? { ...screen, sections } : screen
  })
  return hidden.length ? { doc: { ...doc, screens }, hidden } : { doc, hidden }
}
