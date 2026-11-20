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
 * The guard runs both ways. A visible block that draws nothing is hidden and
 * marked `hiddenBecause: 'empty'`; a block that was hidden for that reason is
 * shown again as soon as the business has the details it needs. A block the
 * owner hid by hand has no marker and is never touched.
 *
 * This runs where a document is stored, where it is approved, and wherever the
 * business details or catalogue change, because that is what can make a block
 * draw itself. Nothing an owner wrote is touched: the block is checked with the
 * customer renderer, and only a completely empty rendering changes the flag.
 */
export function pruneEmptySections(
  doc: Doc,
  spec: AppSpec,
  token: string,
): { doc: Doc; hidden: string[]; restored: string[] } {
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
  const restored: string[] = []
  const screens = doc.screens.map((screen) => {
    let changed = false
    const sections = screen.sections.map((node) => {
      if (node.kind !== 'flagship') return node
      // Hidden by the owner: their decision stands, whatever the business has.
      const automatic = node.hidden === true && node.hiddenBecause === 'empty'
      if (node.hidden && !automatic) return node
      let markup = ''
      try {
        markup = flagshipSection(ctx, node)
      } catch {
        // A renderer that trips over unusual data must not take the save down.
        return node
      }
      if (markup.trim()) {
        if (!automatic) return node
        changed = true
        restored.push(node.id)
        return { ...node, hidden: false, hiddenBecause: undefined }
      }
      // Still nothing to draw. Leave an automatic hide exactly as it is.
      if (automatic) return node
      changed = true
      hidden.push(node.id)
      return { ...node, hidden: true, hiddenBecause: 'empty' as const }
    })
    return changed ? { ...screen, sections } : screen
  })
  return hidden.length || restored.length
    ? { doc: { ...doc, screens }, hidden, restored }
    : { doc, hidden, restored }
}
