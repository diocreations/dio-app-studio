/**
 * Re-import safety.
 *
 * A second read of the same website never writes anything by itself. It produces
 * a plan: what appeared, what disappeared, and which values moved. The owner
 * approves the categories they want, and only those are applied. An item the
 * owner has given their own photograph to is marked as theirs, and its
 * photograph is never swapped for the site's without that approval.
 */
import type { MenuItem, MenuSection } from './types'

export type FieldChange = { field: 'price' | 'description' | 'image'; from: string; to: string }

export type ReimportPlan = {
  source: string
  added: { section: string; name: string; price: number }[]
  removed: { section: string; name: string }[]
  changed: { section: string; name: string; changes: FieldChange[]; ownerEdited: boolean }[]
  unchanged: number
  /** Always true: nothing is applied without the owner choosing it. */
  requiresApproval: boolean
}

export type Approval = {
  added?: boolean
  /** Item names the owner accepts losing. */
  removed?: string[]
  /** `<item name>|<field>` entries the owner accepts changing. */
  changed?: string[]
}

const name = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim()

const flat = (sections: MenuSection[]) =>
  sections.flatMap((section) => section.items.map((item) => ({ section: section.name, item })))

/** The owner has made this item theirs: an uploaded photo, or a photo that no
 *  longer comes from the website. */
export function ownerEdited(item: MenuItem): boolean {
  return Boolean(item.media) || Boolean(item.image && item.image.source !== 'website')
}

const shown = (item: MenuItem, field: FieldChange['field']): string => {
  if (field === 'price') return item.price > 0 ? String(item.price) : ''
  if (field === 'description') return item.desc || ''
  return item.image?.url ?? ''
}

export function diffCatalogue(
  current: MenuSection[],
  incoming: MenuSection[],
  source = '',
): ReimportPlan {
  const before = new Map(flat(current).map((entry) => [name(entry.item.name), entry]))
  const after = new Map(flat(incoming).map((entry) => [name(entry.item.name), entry]))
  const plan: ReimportPlan = {
    source,
    added: [],
    removed: [],
    changed: [],
    unchanged: 0,
    requiresApproval: true,
  }

  for (const [key, entry] of after) {
    const existing = before.get(key)
    if (!existing) {
      plan.added.push({ section: entry.section, name: entry.item.name, price: entry.item.price })
      continue
    }
    const changes: FieldChange[] = []
    for (const field of ['price', 'description', 'image'] as const) {
      const from = shown(existing.item, field)
      const to = shown(entry.item, field)
      if (from === to) continue
      // A missing value on the site is not a request to delete what is here.
      if (!to && field !== 'price') continue
      changes.push({ field, from, to })
    }
    if (changes.length)
      plan.changed.push({
        section: entry.section,
        name: entry.item.name,
        changes,
        ownerEdited: ownerEdited(existing.item),
      })
    else plan.unchanged += 1
  }

  for (const [key, entry] of before) {
    if (!after.has(key)) plan.removed.push({ section: entry.section, name: entry.item.name })
  }
  return plan
}

/** Apply only what the owner approved, leaving every other field alone. */
export function applyApproval(
  current: MenuSection[],
  incoming: MenuSection[],
  approval: Approval,
): MenuSection[] {
  const before = new Map(flat(current).map((entry) => [name(entry.item.name), entry]))
  const after = new Map(flat(incoming).map((entry) => [name(entry.item.name), entry]))
  const approvedRemoved = new Set((approval.removed ?? []).map(name))
  const approvedChanges = new Set(approval.changed ?? [])

  const sections = current.map((section) => ({
    ...section,
    items: section.items.filter((item) => !approvedRemoved.has(name(item.name))),
  }))

  for (const [key, item] of before) {
    const next = after.get(key)?.item
    if (!next) continue
    const wanted = (['price', 'description', 'image'] as const).filter((field) =>
      approvedChanges.has(`${item.item.name}|${field}`),
    )
    if (!wanted.length) continue
    const target = sections
      .flatMap((section) => section.items)
      .find((entry) => name(entry.name) === key)
    if (!target) continue
    for (const field of wanted) {
      // The owner's own photograph is theirs; the site's copy never replaces it.
      if (field === 'image' && ownerEdited(item.item)) continue
      if (field === 'price') target.price = next.price
      if (field === 'description') target.desc = next.desc
      if (field === 'image' && next.image) target.image = next.image
    }
  }

  if (approval.added) {
    for (const [key, entry] of after) {
      if (before.has(key)) continue
      const target =
        sections.find((section) => name(section.name) === name(entry.section)) ??
        sections.find((section) => section.items.some((item) => name(item.name) === key))
      if (target) target.items.push({ ...entry.item })
      else sections.push({ name: entry.section, items: [{ ...entry.item }] })
    }
  }

  return sections.filter((section) => section.items.length > 0).slice(0, 12)
}
