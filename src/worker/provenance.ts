/**
 * Field-level provenance for extracted business information.
 *
 * A value without a source is a guess, and a guess presented as a fact is the
 * failure mode URL-first generation has to avoid. Every field therefore carries
 * where it was read, how, which selector or structured-data path proved it, how
 * sure the read is, any reading that disagreed, and whether the owner still has
 * to answer for it.
 *
 * The record is deliberately one shape for products, prices, currencies,
 * images, categories, identity, contact details and policies. A reviewer should
 * never have to learn a second vocabulary to ask "where did this come from?".
 */

export type Method = 'structured-data' | 'metadata' | 'visible-text' | 'inferred'

/** `verified` is proven by the source's own structured record; `likely` is a
 *  clean visible reading; `guess` is an inference or an unresolved conflict. */
export type Confidence = 'verified' | 'likely' | 'guess'

/** A second reading of the same field. The first reading stays in `value`;
 *  every other reading is kept here so a disagreement is never collapsed. */
export type ProvenanceConflict = {
  value: string
  source: string
  method: Method
  /** The selector or structured-data path this reading came from. */
  reference?: string
}

export type Provenance<T = string> = {
  /** Exactly what the source said, or what the read concluded. Never a filled
   *  in placeholder: an absent value stays empty. */
  value: T
  /** The page the value was read from. Empty when nothing was read. */
  source: string
  method: Method
  /** A selector or structured-data reference, when one can be named. */
  reference?: string
  confidence: Confidence
  /** Readings that disagreed with `value`. A non-empty list means unresolved. */
  conflicts: ProvenanceConflict[]
  /** True when the owner has to answer before this value is trusted. */
  needsConfirmation: boolean
  /** A price published as a range. The bounds are kept as written, and the
   *  lower bound is never presented as the price of the item. */
  range?: { from: string; to: string; raw: string }
}

export type ProvenanceInput<T> = {
  value: T
  source?: string
  method?: Method
  reference?: string
  confidence?: Confidence
  conflicts?: ProvenanceConflict[]
  needsConfirmation?: boolean
  range?: Provenance['range']
}

export function provenance<T = string>(input: ProvenanceInput<T>): Provenance<T> {
  return {
    value: input.value,
    source: input.source ?? '',
    method: input.method ?? 'inferred',
    ...(input.reference ? { reference: input.reference } : {}),
    confidence: input.confidence ?? 'guess',
    conflicts: input.conflicts ?? [],
    needsConfirmation: input.needsConfirmation ?? false,
    ...(input.range ? { range: input.range } : {}),
  }
}

/** An absent value. It says nothing, and it asks for nothing until the caller
 *  decides the field is genuinely required. */
export function absent<T = string>(): Provenance<T> {
  return provenance<T>({ value: '' as unknown as T, confidence: 'guess' })
}

const RANGE_PATTERN =
  /([£$€₹¥]\s?\d[\d.,]*)\s*(?:–|—|-|‒|to|until)\s*(?:[£$€₹¥]\s?)?(\d[\d.,]*)/i

/** A price written as a range, as the source wrote it. "from £89" is not a
 *  range: it is a published starting price and is read as one. */
export function priceRange(raw: string): Provenance['range'] | undefined {
  const match = RANGE_PATTERN.exec(raw ?? '')
  if (!match) return undefined
  const from = match[1].trim()
  const currency = /^[£$€₹¥]/.exec(from)?.[0] ?? ''
  const to = /^[£$€₹¥]/.test(match[2].trim()) ? match[2].trim() : `${currency}${match[2].trim()}`
  return { from, to, raw: match[0].replace(/\s+/g, ' ').trim() }
}

/** Which reading is more trustworthy, used only to decide whether a conflict
 *  blocks publication. It never picks a winner on the owner's behalf. */
export function unresolved<T>(field: Provenance<T>): boolean {
  return field.conflicts.length > 0 || field.needsConfirmation
}

/** A short human line for a field's evidence, used by the start page. */
export function evidenceLine(field: Provenance<unknown>): string {
  if (!field.value) return 'not found on the source'
  const parts: string[] = [field.confidence, field.method]
  if (field.reference) parts.push(field.reference)
  if (field.conflicts.length) parts.push(`${field.conflicts.length} conflicting reading${field.conflicts.length === 1 ? '' : 's'}`)
  if (field.needsConfirmation) parts.push('confirmation needed')
  return parts.join(' · ')
}
