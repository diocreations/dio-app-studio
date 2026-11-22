import type {
  FieldProvenance,
  MenuItem,
  MenuSection,
  PriceEvidence,
  ProjectEntry,
  SourceContentKind,
  SourceReview,
  SourceSnapshot,
  VerticalId,
} from './types'

/**
 * The source review: what a read kept, what it read but did not publish, and
 * what it could not find.
 *
 * Two rules shape everything here.
 *
 * 1. Nothing is discarded silently. A refused row is kept with its section,
 *    reason and destination, so an owner can see that a policy was read and
 *    belongs on the Visit screen, or that a case study belongs in a portfolio.
 * 2. Owner-provided data never inherits website credibility. A corrected price
 *    is recorded as the owner's, with the site's original reading kept beside
 *    it. A value is never upgraded from unverified to verified by being saved.
 */

const MAX_PAGES = 80
const MAX_REJECTED = 200
const URLISH = /^https?:\/\/[^\s"'<>]{4,300}$/i

function text(value: unknown, limit: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function strings(value: unknown, limit: number, each: number): string[] {
  if (!Array.isArray(value)) return []
  return value.map((entry) => text(entry, each)).filter(Boolean).slice(0, limit)
}

/** The kind of content a refusal reason names. The cleaner's reason is the
 *  evidence; this only gives it the label the review uses. */
export function contentKind(reason: string): SourceContentKind {
  if (/policy/i.test(reason)) return 'policy'
  if (/article|journal|caption|editorial|promo article/i.test(reason)) return 'article'
  if (/location/i.test(reason)) return 'location'
  if (/promotion|not-a-room|room/i.test(reason)) return 'promotion'
  if (/navigation|heading|option|about-page|contact-page|markup/i.test(reason)) return 'navigation'
  return 'unknown'
}

/** Where content that is not inventory belongs. A practice's journal entry can
 *  become a project; a restaurant's location page remains information; site
 *  chrome has no destination. */
export function destinationFor(
  kind: SourceContentKind,
  vertical: VerticalId,
): SourceReview['rejected'][number]['destination'] {
  if (kind === 'navigation' || kind === 'unknown') return 'excluded'
  if (kind === 'article' && ['professional', 'agency', 'studio', 'portfolio', 'film', 'gallery'].includes(vertical)) {
    return 'portfolio'
  }
  return 'information'
}

function kindOf(value: unknown, reason: string): SourceContentKind {
  return ['policy', 'article', 'location', 'promotion', 'navigation', 'unknown'].includes(String(value))
    ? (value as SourceContentKind)
    : contentKind(reason)
}

/** A ledger from the importer's own report fields. Accepts raw rejected rows
 *  (`name`, `section`, `reason`, optional `source`) so the brief can send what
 *  it already holds without duplicating the classification. */
export function sanitizeSourceReview(input: unknown, vertical: VerticalId): SourceReview | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined
  const raw = input as Record<string, unknown>
  const pages = (raw.pages && typeof raw.pages === 'object' ? raw.pages : {}) as Record<string, unknown>
  const read = strings(pages.read ?? raw.pagesRead, MAX_PAGES, 220)
  const failed = (Array.isArray(pages.failed) ? pages.failed : Array.isArray(raw.pagesFailed) ? raw.pagesFailed : [])
    .slice(0, 40)
    .map((entry) => {
      const row = (entry ?? {}) as Record<string, unknown>
      return { url: text(row.url, 220), reason: text(row.reason, 120) }
    })
    .filter((entry) => entry.url)
  const rejectedInput = Array.isArray(raw.rejected) ? raw.rejected : []
  const rejected = rejectedInput
    .slice(0, MAX_REJECTED)
    .map((entry) => {
      const row = (entry ?? {}) as Record<string, unknown>
      const name = text(row.name, 160)
      const reason = text(row.reason, 120) || 'not-inventory'
      if (!name) return null
      const kind = kindOf(row.kind, reason)
      const destination = ['information', 'portfolio', 'excluded'].includes(String(row.destination))
        ? (row.destination as SourceReview['rejected'][number]['destination'])
        : destinationFor(kind, vertical)
      const source = URLISH.test(String(row.source ?? '')) ? String(row.source) : undefined
      return { name, section: text(row.section, 60) || 'Catalogue', kind, reason, ...(source ? { source } : {}), destination }
    })
    .filter((entry): entry is SourceReview['rejected'][number] => entry !== null)
  const status = ['complete', 'partial', 'empty'].includes(String(raw.status))
    ? (raw.status as SourceReview['status'])
    : rejected.length
      ? 'empty'
      : 'partial'
  const source = URLISH.test(String(raw.source ?? '')) ? String(raw.source) : ''
  const host = text(raw.host, 120) || (() => {
    try {
      return new URL(source).host
    } catch {
      return ''
    }
  })()
  return {
    source,
    host,
    status,
    pages: {
      read,
      failed,
      usedSitemap: pages.usedSitemap === true || raw.usedSitemap === true,
    },
    found: strings(raw.found, 20, 160),
    missing: strings(raw.missing, 20, 100),
    rejected,
    questions: (Array.isArray(raw.questions) ? raw.questions : [])
      .slice(0, 20)
      .map((entry) => {
        const row = (entry ?? {}) as Record<string, unknown>
        return {
          field: text(row.field, 30),
          why: text(row.why, 240),
          kind: row.kind === 'blocker' ? ('blocker' as const) : ('confirm' as const),
        }
      })
      .filter((entry) => entry.field && entry.why),
    conflicts: (Array.isArray(raw.conflicts) ? raw.conflicts : [])
      .slice(0, 20)
      .map((entry) => {
        const row = (entry ?? {}) as Record<string, unknown>
        const values = (Array.isArray(row.values) ? row.values : [])
          .slice(0, 5)
          .map((value) => {
            const item = (value ?? {}) as Record<string, unknown>
            return { value: text(item.value, 120), source: text(item.source, 200) }
          })
          .filter((value) => value.value)
        return { field: text(row.field, 30), values }
      })
      .filter((entry) => entry.field && entry.values.length > 1),
  }
}

export function sanitizeProjects(input: unknown): ProjectEntry[] {
  if (!Array.isArray(input)) return []
  const out: ProjectEntry[] = []
  for (const entry of input.slice(0, 40)) {
    const row = (entry ?? {}) as Record<string, unknown>
    const title = text(row.title, 120)
    if (!title) continue
    const desc = text(row.desc, 400)
    out.push({
      title,
      ...(desc ? { desc } : {}),
      source: row.source === 'owner' ? 'owner' : 'website',
      // Absent means an older entry that was already published. Only an
      // explicit false marks a website suggestion waiting for the owner.
      ...(row.accepted === false ? { accepted: false } : {}),
    })
  }
  return out
}

/** The owner's own price, explicitly labelled as theirs. */
export function ownerPrice(price: number, currency: string, raw?: string): PriceEvidence {
  return {
    method: 'owner',
    source: 'Owner entry',
    raw: raw ?? (price > 0 ? (price / 100).toFixed(2) : ''),
    currency,
    validated: true,
  }
}

/** A dated reading of an item as the source gave it. The evidence attached is
 *  the website's, never an owner entry: a snapshot exists to preserve what the
 *  site said. */
export function snapshotOf(item: MenuItem, at: string): SourceSnapshot {
  const evidence =
    item.priceEvidence?.method === 'owner'
      ? item.sourcePriceEvidence
      : item.priceEvidence ?? item.sourcePriceEvidence
  return {
    ...(item.name.trim() ? { name: item.name } : {}),
    ...(item.desc.trim() ? { desc: item.desc } : {}),
    ...(item.price > 0 ? { price: evidence?.raw || (item.price / 100).toFixed(2) } : {}),
    ...(evidence ? { priceEvidence: evidence } : {}),
    at,
  }
}

function sameItem(left: MenuItem, right: MenuItem): boolean {
  if (left.sourceId && right.sourceId && left.sourceId === right.sourceId) return true
  if (left.id && right.id && left.id === right.id) return true
  return left.name.trim().toLowerCase() === right.name.trim().toLowerCase()
}

const ownerField = (at: string): FieldProvenance => ({
  source: 'owner',
  method: 'owner',
  confidence: 'verified',
  validated: true,
  at,
})

const unverifiedField = (): FieldProvenance => ({
  source: 'unverified',
  confidence: 'unverified',
  validated: false,
})

const websiteField = (evidence: PriceEvidence): FieldProvenance => ({
  source: 'website',
  method: evidence.method,
  url: evidence.source,
  confidence: evidence.validated ? 'verified' : 'reported',
  validated: evidence.validated,
})

/**
 * Record what the owner changed between the stored catalogue and the one they
 * saved. Returns a new menu; nothing here changes a value, only its provenance.
 */
export function markOwnerEdits(
  previous: MenuSection[],
  next: MenuSection[],
  currency: string,
  now = new Date().toISOString(),
): { menu: MenuSection[]; corrected: number; added: number } {
  let corrected = 0
  let added = 0
  const menu = next.map((section) => {
    const before = previous.find((entry) => entry.name === section.name)
    return {
      ...section,
      items: section.items.map((item, itemIndex) => {
        // A seeded catalogue has no stable ids until its first save. Match by
        // position in that case, so renaming a sample item records the name as
        // the owner's without claiming the untouched price as theirs too.
        const original =
          before?.items.find((entry) => sameItem(entry, item)) ??
          (before?.items[itemIndex] && !before.items[itemIndex].id && !before.items[itemIndex].sourceId
            ? before.items[itemIndex]
            : undefined)
        if (!original) {
          added += 1
          const fields: MenuItem['ownerFields'] = ['name']
          if (item.desc) fields.push('desc')
          if (item.price > 0) fields.push('price')
          return {
            ...item,
            // An item added by the owner has no website source at all.
            sourceUrl: undefined,
            sourceMethod: undefined,
            ownerFields: fields,
            ...(item.price > 0 ? { priceEvidence: ownerPrice(item.price, currency) } : {}),
            // Nothing on an owner-created row came from a website. Empty
            // optional fields stay unverified rather than inheriting the row.
            fieldProvenance: {
              name: ownerField(now),
              ...(item.desc ? { desc: ownerField(now) } : { desc: unverifiedField() }),
              ...(item.price > 0 ? { price: ownerField(now) } : { price: unverifiedField() }),
              image: item.media || item.image ? ownerField(now) : unverifiedField(),
              availability: ownerField(now),
            },
          }
        }
        const fields = new Set<NonNullable<MenuItem['ownerFields']>[number]>(original.ownerFields ?? [])
        const changedName = item.name.trim() !== original.name.trim()
        const changedDesc = item.desc.trim() !== original.desc.trim()
        const changedPrice = item.price !== original.price
        if (changedName) fields.add('name')
        if (changedDesc) fields.add('desc')
        if (changedPrice) fields.add('price')
        // A price with no price is not an owner correction: clearing it must
        // leave no "your data" claim behind on an item with no price at all.
        if (item.price <= 0) fields.delete('price')
        if (!changedName && !changedDesc && !changedPrice) {
          const kept = [...fields]
          return {
            ...item,
            ...(kept.length ? { ownerFields: kept } : { ownerFields: undefined }),
            priceEvidence: kept.includes('price') ? item.priceEvidence : item.price > 0 ? original.priceEvidence : undefined,
            sourcePriceEvidence: kept.includes('price') ? item.sourcePriceEvidence : undefined,
            // Provenance is the server's record, not a field the browser can
            // rewrite on an unchanged row.
            fieldProvenance: original.fieldProvenance ?? item.fieldProvenance,
          }
        }
        corrected += 1
        // The first correction is the one that preserves what the site said.
        // A later edit reuses it, so the original reading is never lost to the
        // owner's second or third change of mind.
        const sourceTrail = {
          ...(original.sourceTrail?.original
            ? { original: original.sourceTrail.original }
            : { original: snapshotOf(original, now) }),
          ...(original.sourceTrail?.latest ? { latest: original.sourceTrail.latest } : {}),
          ownerAt: now,
          ...(original.sourceTrail?.decisions?.length
            ? { decisions: original.sourceTrail.decisions }
            : {}),
        }
        const sourceEvidence =
          original.priceEvidence?.method === 'owner'
            ? original.sourcePriceEvidence
            : original.priceEvidence ?? original.sourcePriceEvidence
        // Setting the value back to the site's own reading is not a correction;
        // it restores the website provenance instead of keeping an owner claim.
        const sourcePrice =
          sourceEvidence && sourceEvidence.method !== 'owner'
            ? Math.round(Number(String(sourceEvidence.raw).replace(/[^0-9.]/g, '')) * 100)
            : NaN
        const reverted = changedPrice && Number.isFinite(sourcePrice) && sourcePrice === item.price
        if (reverted) fields.delete('price')
        const fieldProvenance = {
          ...(original.fieldProvenance ?? item.fieldProvenance ?? {}),
          ...(changedName ? { name: ownerField(now) } : {}),
          ...(changedDesc ? { desc: ownerField(now) } : {}),
          ...(changedPrice && !reverted ? { price: ownerField(now) } : {}),
          ...(reverted && sourceEvidence ? { price: websiteField(sourceEvidence) } : {}),
          ...(item.media && item.media.id !== original.media?.id ? { image: ownerField(now) } : {}),
        }
        return {
          ...item,
          sourceTrail,
          fieldProvenance,
          ...(fields.size ? { ownerFields: [...fields] } : { ownerFields: undefined }),
          ...(reverted
            ? { priceEvidence: sourceEvidence, sourcePriceEvidence: undefined }
            : changedPrice
              ? {
                  // Keep the site's original reading beside the owner's value. An
                  // earlier owner entry is not a website reading.
                  sourcePriceEvidence:
                    sourceEvidence && sourceEvidence.method !== 'owner' ? sourceEvidence : undefined,
                  priceEvidence: item.price > 0 ? ownerPrice(item.price, currency) : undefined,
                }
              : {}),
        }
      }),
    }
  })
  return { menu, corrected, added }
}

/** Aggregate counts a review screen can state without re-deriving them. */
export function reviewCounts(review: SourceReview | undefined, menu: MenuSection[]) {
  const items = menu.flatMap((section) => section.items)
  return {
    items: items.length,
    owner: items.filter((item) => item.ownerFields?.length).length,
    verified: items.filter((item) => item.priceEvidence?.method !== 'owner' && item.priceEvidence?.validated).length,
    unpriced: items.filter((item) => item.price <= 0).length,
    rejected: review?.rejected.length ?? 0,
    information: review?.rejected.filter((entry) => entry.destination === 'information').length ?? 0,
    portfolio: review?.rejected.filter((entry) => entry.destination === 'portfolio').length ?? 0,
    missing: review?.missing.length ?? 0,
  }
}
