/**
 * Re-import safety.
 *
 * A second read of the same website never writes anything by itself. It produces
 * a plan: what appeared, what disappeared, and which values moved. The owner
 * approves the categories they want, and only those are applied.
 *
 * An owner's correction is not a category to approve. When the site later says
 * something different from the reading the owner replaced, that field becomes a
 * conflict with both values and both times. It moves only when the owner picks
 * one side; an unchecked conflict leaves the owner's value exactly as it is.
 *
 * An item the owner has given their own photograph to keeps that photograph.
 */
import type { FieldProvenance, MenuItem, MenuSection, SourceSnapshot } from './types'

export type FieldChange = { field: 'price' | 'description' | 'image'; from: string; to: string }

/** A field the owner corrected that the website has since changed. Both
 *  readings and the owner's value stay visible until the owner decides. */
export type SourceConflict = {
  section: string
  name: string
  field: 'price' | 'description'
  /** The website reading the owner replaced. */
  original: string
  /** False when the build has no dated original (an older correction). */
  originalKnown: boolean
  /** What the website says now. */
  latest: string
  /** What the owner's app currently publishes. */
  owner: string
  ownerAt?: string
}

export type ReimportPlan = {
  source: string
  added: { section: string; name: string; price: number }[]
  removed: { section: string; name: string }[]
  changed: { section: string; name: string; changes: FieldChange[]; ownerEdited: boolean }[]
  /** Owner-corrected fields the site has changed. Nothing here is applied by
   *  approval alone; each needs an explicit resolution. */
  conflicts: SourceConflict[]
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
  /** Explicit choices for owner-corrected fields. */
  resolutions?: { name: string; field: 'price' | 'description'; choice: 'owner' | 'source' }[]
}

const name = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim()

const flat = (sections: MenuSection[]) =>
  sections.flatMap((section) => section.items.map((item) => ({ section: section.name, item })))

/** The owner has made this item theirs: an uploaded photo, or a photo that no
 *  longer comes from the website. */
export function ownerEdited(item: MenuItem): boolean {
  return Boolean(item.media) || Boolean(item.image && item.image.source !== 'website')
}

/**
 * How a stored row is recognised in a later read. A source id is the strongest
 * identity; then the row's own id. An owner who renamed an item still owns the
 * same product, so the name it had on the site is the next key, not the name the
 * owner gave it. Only a row with none of those falls back to its visible name.
 */
function identityKeys(item: MenuItem): string[] {
  const keys: string[] = []
  if (item.sourceId) keys.push(`source:${item.sourceId.trim().toLowerCase()}`)
  if (item.id) keys.push(`id:${item.id}`)
  if (item.ownerFields?.includes('name') && item.sourceTrail?.original?.name)
    keys.push(`name:${name(item.sourceTrail.original.name)}`)
  keys.push(`name:${name(item.name)}`)
  return keys
}

/** Pair each stored row with its reading in the new crawl. Nothing is matched
 *  twice, so a rename cannot present the same product as one removal and one
 *  addition. */
function align(current: MenuSection[], incoming: MenuSection[]): Map<MenuItem, MenuItem> {
  const index = new Map<string, { item: MenuItem; used: boolean }>()
  for (const { item } of flat(incoming))
    for (const key of identityKeys(item)) if (!index.has(key)) index.set(key, { item, used: false })
  const at = new Map<MenuItem, MenuItem>()
  for (const { item } of flat(current)) {
    for (const key of identityKeys(item)) {
      const candidate = index.get(key)
      if (!candidate || candidate.used) continue
      candidate.used = true
      at.set(item, candidate.item)
      break
    }
  }
  return at
}

const shown = (item: MenuItem, field: FieldChange['field']): string => {
  if (field === 'price') return item.price > 0 ? String(item.price) : ''
  if (field === 'description') return item.desc || ''
  return item.image?.url ?? ''
}

/** A value in the words an owner reads, rather than the cents the build stores. */
const ownerFieldProvenance = (at: string): FieldProvenance => ({
  source: 'owner',
  method: 'owner',
  confidence: 'verified',
  validated: true,
  at,
})

/** A value the website supplied keeps the website's own evidence, not the
 *  owner's. A visible-text reading is reported, not silently validated. */
const websiteFieldProvenance = (
  item: MenuItem,
  field: 'price' | 'description' | 'image',
  at: string,
): FieldProvenance => {
  if (field === 'price' && item.priceEvidence) {
    const evidence = item.priceEvidence
    return {
      source: 'website',
      method: evidence.method,
      url: evidence.source,
      confidence: evidence.validated ? 'verified' : 'reported',
      validated: evidence.validated,
      at,
    }
  }
  if (field === 'image' && item.image)
    return {
      source: 'website',
      method: item.image.method ?? 'public-data',
      url: item.image.sourceUrl ?? item.image.url,
      confidence: item.image.method === 'structured-data' ? 'verified' : 'reported',
      validated: item.image.method === 'structured-data',
      at,
    }
  const structured = item.sourceMethod === 'structured-data' || item.sourceMethod === 'embedded-json'
  return {
    source: 'website',
    ...(item.sourceMethod ? { method: item.sourceMethod } : {}),
    ...(item.sourceUrl ? { url: item.sourceUrl } : {}),
    confidence: structured ? 'verified' : 'reported',
    validated: structured,
    at,
  }
}

const display = (item: MenuItem, field: 'price' | 'description'): string => {
  if (field === 'price') return item.price > 0 ? (item.price / 100).toFixed(2) : 'no price'
  return item.desc || 'empty'
}

/** Prices compare by amount, so the site's `£9.00` and the build's `9.00` are
 *  the same reading rather than a false conflict. */
const amountKey = (value: string): string => {
  const number = Number(String(value).replace(/[^0-9.]/g, ''))
  return Number.isFinite(number) && String(value).replace(/[^0-9.]/g, '') !== ''
    ? number.toFixed(2)
    : String(value).trim().toLowerCase()
}

const ownerField = (field: 'price' | 'description'): 'price' | 'desc' =>
  field === 'price' ? 'price' : 'desc'

const hasOwnerField = (item: MenuItem, field: 'price' | 'description'): boolean =>
  Boolean(item.ownerFields?.includes(ownerField(field)))

/** What the site said when the owner replaced it, as the build recorded it. */
function sourceOriginal(item: MenuItem, field: 'price' | 'description'): string | undefined {
  if (field === 'price') {
    const fromTrail = item.sourceTrail?.original?.price
    if (fromTrail) return fromTrail
    if (item.sourcePriceEvidence?.raw) return item.sourcePriceEvidence.raw
    if (item.priceEvidence && item.priceEvidence.method !== 'owner' && item.priceEvidence.raw)
      return item.priceEvidence.raw
    return undefined
  }
  return item.sourceTrail?.original?.desc
}

function snapshotOf(item: MenuItem, at: string): SourceSnapshot {
  const evidence =
    item.priceEvidence?.method === 'owner' ? item.sourcePriceEvidence : item.priceEvidence ?? item.sourcePriceEvidence
  return {
    ...(item.name.trim() ? { name: item.name } : {}),
    ...(item.desc.trim() ? { desc: item.desc } : {}),
    ...(item.price > 0 ? { price: evidence?.raw || (item.price / 100).toFixed(2) } : {}),
    ...(evidence ? { priceEvidence: evidence } : {}),
    at,
  }
}

export function diffCatalogue(
  current: MenuSection[],
  incoming: MenuSection[],
  source = '',
): ReimportPlan {
  const at = align(current, incoming)
  const matched = new Set(at.values())
  const plan: ReimportPlan = {
    source,
    added: [],
    removed: [],
    changed: [],
    conflicts: [],
    unchanged: 0,
    requiresApproval: true,
  }

  for (const { section, item } of flat(incoming)) {
    if (!matched.has(item)) plan.added.push({ section, name: item.name, price: item.price })
  }

  for (const { section, item } of flat(current)) {
    const next = at.get(item)
    if (!next) {
      plan.removed.push({ section, name: item.name })
      continue
    }
    const changes: FieldChange[] = []
    let conflicts = 0
    for (const field of ['price', 'description', 'image'] as const) {
      const from = shown(item, field)
      const to = shown(next, field)
      if (from === to) continue
      // A missing value on the site is not a request to delete what is here.
      if (!to && field !== 'price') continue
      // An owner photograph is never swapped for the site's copy.
      if (field === 'image' && ownerEdited(item)) {
        changes.push({ field, from, to })
        continue
      }
      if (field !== 'image' && hasOwnerField(item, field)) {
        const original = sourceOriginal(item, field)
        const latest = field === 'price' ? display(next, field) : to
        // A reading the owner has already answered is not raised again. This is
        // what keeps "keep mine" from asking the same question on every check.
        const answered = item.sourceTrail?.latest
          ? field === 'price'
            ? item.sourceTrail.latest.price && amountKey(item.sourceTrail.latest.price) === amountKey(latest)
            : item.sourceTrail.latest.desc?.trim() === latest.trim()
          : false
        if (answered) continue
        // The site still says what it said when the owner corrected it: there
        // is nothing new to decide, so the owner's value simply stands.
        if (original !== undefined) {
          const same = field === 'price' ? amountKey(original) === amountKey(latest) : original.trim() === latest.trim()
          if (same) continue
        }
        conflicts += 1
        plan.conflicts.push({
          section,
          name: item.name,
          field,
          original: original ?? 'not recorded',
          originalKnown: original !== undefined,
          latest,
          owner: display(item, field),
          ...(item.sourceTrail?.ownerAt ? { ownerAt: item.sourceTrail.ownerAt } : {}),
        })
        continue
      }
      changes.push({ field, from, to })
    }
    if (changes.length)
      plan.changed.push({ section, name: item.name, changes, ownerEdited: ownerEdited(item) })
    else if (!conflicts) plan.unchanged += 1
  }
  return plan
}

/** Record which side won, with both values and the time. The newest reading is
 *  kept so the same difference is not raised again on the next check. */
function recordDecision(
  target: MenuItem,
  next: MenuItem,
  field: 'price' | 'description',
  choice: 'owner' | 'source',
  ownerValue: string,
  now: string,
): void {
  const key = ownerField(field)
  const trail = target.sourceTrail ? { ...target.sourceTrail } : {}
  if (!trail.original) {
    const original = sourceOriginal(target, field)
    if (original)
      trail.original = {
        ...(field === 'price' ? { price: original } : { desc: original }),
        ...(field === 'price' && target.sourcePriceEvidence
          ? { priceEvidence: target.sourcePriceEvidence }
          : {}),
        at: trail.ownerAt ?? now,
      }
  }
  trail.latest = snapshotOf(next, now)
  trail.decisions = [
    ...(trail.decisions ?? []),
    {
      field: key,
      choice,
      ownerValue,
      sourceValue: display(next, field),
      at: now,
    },
  ].slice(-20)
  target.sourceTrail = trail
  target.fieldProvenance = {
    ...(target.fieldProvenance ?? {}),
    [key]: choice === 'owner' ? ownerFieldProvenance(now) : websiteFieldProvenance(next, field, now),
  }
}

/** Apply only what the owner approved. An owner-corrected price or description
 *  moves only through an explicit `source` resolution; without one it is left
 *  untouched even if it appeared in `changed`. */
export function applyApproval(
  current: MenuSection[],
  incoming: MenuSection[],
  approval: Approval,
  now = new Date().toISOString(),
): MenuSection[] {
  const at = align(current, incoming)
  const matched = new Set(at.values())
  const approvedRemoved = new Set((approval.removed ?? []).map(name))
  const approvedChanges = new Set(approval.changed ?? [])
  const resolutions = new Map<string, 'owner' | 'source'>()
  for (const entry of approval.resolutions ?? []) {
    if (entry.field !== 'price' && entry.field !== 'description') continue
    if (entry.choice !== 'owner' && entry.choice !== 'source') continue
    resolutions.set(`${name(entry.name)}|${entry.field}`, entry.choice)
  }

  const sections = current.map((section) => ({
    ...section,
    items: section.items.filter((item) => !approvedRemoved.has(name(item.name))),
  }))

  for (const { item } of flat(current)) {
    const next = at.get(item)
    if (!next) continue
    const target = sections.flatMap((section) => section.items).find((entry) => entry === item)
    if (!target) continue
    for (const field of ['price', 'description', 'image'] as const) {
      if (field === 'image') {
        // The owner's own photograph is theirs; the site's copy never replaces
        // it, whichever box was ticked.
        if (!approvedChanges.has(`${item.name}|image`) || ownerEdited(item)) continue
        if (next.image) {
          target.image = next.image
          target.fieldProvenance = {
            ...(target.fieldProvenance ?? {}),
            image: websiteFieldProvenance(next, 'image', now),
          }
        }
        continue
      }
      const resolution = resolutions.get(`${name(item.name)}|${field}`)
      if (hasOwnerField(item, field)) {
        if (!resolution) continue
        const ownerValue = display(target, field)
        if (resolution === 'owner') {
          // Keep the owner's value, but record the reading they declined so a
          // later check does not ask again.
          recordDecision(target, next, field, 'owner', ownerValue, now)
          if (field === 'price' && target.priceEvidence?.method === 'owner' && !target.sourcePriceEvidence)
            target.sourcePriceEvidence = target.sourceTrail?.original?.priceEvidence
          continue
        }
        if (field === 'price') {
          target.price = next.price
          if (next.priceEvidence) target.priceEvidence = next.priceEvidence
          else delete target.priceEvidence
          delete target.sourcePriceEvidence
        } else {
          target.desc = next.desc
        }
        const left = (target.ownerFields ?? []).filter((entry) => entry !== ownerField(field))
        if (left.length) target.ownerFields = left
        else delete target.ownerFields
        recordDecision(target, next, field, 'source', ownerValue, now)
        continue
      }
      if (!approvedChanges.has(`${item.name}|${field}`)) continue
      if (field === 'price') {
        target.price = next.price
        if (next.priceEvidence) target.priceEvidence = next.priceEvidence
      } else {
        target.desc = next.desc
      }
      target.fieldProvenance = {
        ...(target.fieldProvenance ?? {}),
        [ownerField(field)]: websiteFieldProvenance(next, field, now),
      }
    }
  }

  if (approval.added) {
    for (const { section, item } of flat(incoming)) {
      if (matched.has(item)) continue
      const target =
        sections.find((entry) => name(entry.name) === name(section)) ??
        sections.find((entry) => entry.items.some((row) => name(row.name) === name(item.name)))
      if (target) target.items.push({ ...item })
      else sections.push({ name: section, items: [{ ...item }] })
    }
  }

  return sections.filter((section) => section.items.length > 0).slice(0, 12)
}
