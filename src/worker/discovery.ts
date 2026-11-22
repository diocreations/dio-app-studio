import type { ImportedSite, ImportReport } from './importer'
import { directionsFor } from './directions'
import { blueprintFor, validateConcepts, type Diversity } from './blueprints'
import { buildSpec } from './pricing'
import { flagshipDocFromSpec, type Doc } from './doc'
import type { AppSpec, MenuItem, VerticalId } from './types'
import { assessItem, payloadFor, ruleFor, type Payload } from './catalogue'
import {
  priceRange,
  provenance,
  type Confidence,
  type Method,
  type Provenance,
  type ProvenanceConflict,
} from './provenance'

/**
 * What a website read actually established, and how well.
 *
 * Plattr's rule for URL-first generation is that the customer is never asked for
 * something the read already produced, and never shown a value the read did not
 * support. Both need provenance: a value without a source cannot be trusted, and
 * a value without a confidence cannot be asked about correctly.
 */

export type { Confidence, Method, Provenance, ProvenanceConflict }

/** One field, with its source, method, reference and confidence. */
export type Field<T> = Provenance<T>

/** A policy page the site links to. Its content is not verified here: the
 *  record says plainly what was read (a link and its label), not what the page
 *  says. */
export type DiscoveryPolicy = {
  kind: 'shipping' | 'returns' | 'privacy' | 'terms' | 'other'
  label: Field<string>
  url: string
}

export type DiscoveryItem = {
  sourceId?: string
  name: string
  desc: string
  price: number
  meta?: string
  /** What this entry is, where it was read, how, and whether the trade's own
   *  evidence requirements were met. A row without this cannot be published. */
  evidence: {
    payload: Payload
    source: string
    method: Method
    confidence: Confidence
    status: 'verified' | 'incomplete'
    /** What the source did not provide, in the trade's own terms. */
    missing: string[]
  }
  /** Every price and identity the source lists for this product. */
  variants?: MenuItem['variants']
  /** Size, colour and other choices, when the source states them. */
  optionGroups?: MenuItem['optionGroups']
  /** The business's own photograph for this exact item, when the read tied one to it. */
  image?: string
  imageMethod?: 'structured-data' | 'embedded-json' | 'og-image' | 'public-data' | 'visible-markup'
  /** Field-by-field provenance. A row is not one claim: the name, description,
   *  price, currency, photograph and category each have their own evidence. */
  fields: {
    name: Field<string>
    desc: Field<string>
    price: Field<string>
    currency: Field<string>
    image: Field<string>
    category: Field<string>
  }
}

export type DiscoverySection = {
  name: string
  items: DiscoveryItem[]
  source: string
}

/** Two readings of the same field that disagree. The owner answers one question each. */
export type DiscoveryConflict = {
  field: string
  values: { value: string; source: string }[]
}

export type DiscoveryQuestion = {
  field: string
  why: string
  /** A blocker stops a build; a confirm can be answered later without blocking. */
  kind: 'blocker' | 'confirm'
}

export type Discovery = {
  url: string
  host: string
  pages: { read: string[]; failed: { url: string; reason: string }[]; usedSitemap: boolean }
  business: {
    name: Field<string>
    category: Field<string>
    tagline: Field<string>
    story: Field<string>
    trade: Field<VerticalId>
    accent: Field<string>
    logo: Field<{ url: string; alt?: string } | null>
    hours: Field<string>
    phone: Field<string>
    email: Field<string>
    address: Field<string>
  }
  /** Policy pages the site links to, read as links rather than as copy. */
  policies: DiscoveryPolicy[]
  commerce: {
    currency: Field<string>
    sections: DiscoverySection[]
    products: number
    priced: number
    withImage: number
    /** The commercial thing this trade sells: products, dishes, rooms… */
    payload: Payload
    /** `complete` needs every entry verified; `empty` is an honest answer, not
     *  a reason to invent a catalogue. */
    status: 'complete' | 'partial' | 'empty'
    /** Rows the read refused, with the reason, so a failed extraction is
     *  visible rather than silently absent. */
    rejected: { name: string; section: string; payload: Payload; reason: string }[]
    /** Evidence this trade needs that the source did not supply. */
    requirements: { met: string[]; missing: string[] }
    /** Whether prices are published, quote-based, or simply unknown. */
    pricingBasis: 'published' | 'quote' | 'unknown'
  }
  conflicts: DiscoveryConflict[]
  missing: string[]
  questions: DiscoveryQuestion[]
  tradeCandidates: { id: VerticalId; score: number; evidence: string[] }[]
  /** True when the page was a JavaScript shell: reported, never guessed at. */
  clientRendered: boolean
}

export type DiscoveryConcept = {
  id: string
  name: string
  note: string
  spec: AppSpec
  doc: Doc
}

export type DiscoveryPlan = {
  discovery: Discovery
  concepts: DiscoveryConcept[]
  /** The structural comparison of the three documents. A plan whose concepts
   *  are the same application in three skins must not reach the owner. */
  diversity: Diversity
  /** Only the fields a build genuinely cannot proceed without. */
  blockers: DiscoveryQuestion[]
  /** Questions worth asking, never blocking. */
  confirmations: DiscoveryQuestion[]
}

function field<T>(
  value: T,
  source: string,
  method: Method,
  confidence: Confidence,
  extra: { reference?: string; conflicts?: ProvenanceConflict[]; needsConfirmation?: boolean; range?: Provenance['range'] } = {},
): Field<T> {
  return provenance<T>({ value, source, method, confidence, ...extra })
}

/** The reference for a value read from structured data, named the way a
 *  reviewer can find it in the page source. */
const METHOD_REFERENCE: Record<string, string> = {
  'json-ld': 'json-ld:offers.price',
  microdata: '[itemprop="price"]',
  'shopify-variant': 'embedded-json:variants[].price',
  meta: 'meta[product:price:amount]',
  text: 'visible-text:card price',
}

const POLICY_LINK: { kind: DiscoveryPolicy['kind']; pattern: RegExp }[] = [
  { kind: 'shipping', pattern: /shipping|delivery|dispatch/i },
  { kind: 'returns', pattern: /returns?|refunds?/i },
  { kind: 'privacy', pattern: /privacy|gdpr|cookies?/i },
  { kind: 'terms', pattern: /terms|conditions|legal/i },
  { kind: 'other', pattern: /polic|faq|accessibility|complaints?/i },
]

/**
 * Policy pages the entry page links to. This records a link, its label and the
 * page it came from — never a summary of a page that was not read. A policy the
 * crawl did not open is evidence that the policy exists, not evidence of what
 * it says.
 */
function policyLinks(html: string, source: string): DiscoveryPolicy[] {
  const out: DiscoveryPolicy[] = []
  const seen = new Set<string>()
  const anchors = html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{1,160}?)<\/a>/gi)
  for (const match of anchors) {
    const href = match[1] ?? ''
    const label = trim((match[2] ?? '').replace(/<[^>]+>/g, ''))
    let url: URL
    try {
      url = new URL(href, source)
    } catch {
      continue
    }
    if (url.origin !== new URL(source).origin) continue
    const kind = POLICY_LINK.find((entry) => entry.pattern.test(url.pathname) || entry.pattern.test(label))?.kind
    if (!kind) continue
    const key = `${kind}:${url.pathname}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      kind,
      url: url.toString(),
      label: field(label || url.pathname, source, 'visible-text', 'likely', {
        reference: `a[href="${url.pathname}"]`,
        // The link is real; what the policy says has not been read. The owner
        // confirms the policy is theirs rather than being shown invented copy.
        needsConfirmation: true,
      }),
    })
  }
  return out.slice(0, 6)
}

/**
 * Two ways of writing one business name are not a conflict. Case, punctuation,
 * spacing, a leading "the", an "&" against "and" and a legal suffix all
 * normalise away; a marketing sentence is not a name at all.
 */
function nameKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(ltd|limited|llp|inc|plc|co|company|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function comparableName(value: string): boolean {
  const words = value.trim().split(/\s+/)
  // A sentence is a description, not a competing name: never compare it.
  return words.length <= 6 && value.trim().length <= 60
}

function distinctNames(values: string[]): string[] {
  const kept: string[] = []
  for (const value of values) {
    if (!comparableName(value)) continue
    const key = nameKey(value)
    if (!key) continue
    if (kept.some((existing) => {
      const other = nameKey(existing)
      return other === key || other.includes(key) || key.includes(other)
    })) continue
    kept.push(value.trim())
  }
  return kept
}

function jsonLd(html: string): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = []
  const pattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(html))) {
    try {
      const parsed = JSON.parse(match[1])
      const list = Array.isArray(parsed) ? parsed : parsed['@graph'] ? parsed['@graph'] : [parsed]
      for (const entry of list) if (entry && typeof entry === 'object') blocks.push(entry as Record<string, unknown>)
    } catch {
      /* malformed structured data is ignored, not guessed at */
    }
  }
  return blocks
}

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(strings)
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).flatMap(strings)
  return []
}

function trim(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/** A cents amount as a bare figure. Currency is never attached here: the
 *  amount and the code are separate fields with separate evidence. */
function moneyText(cents: number): string {
  return (cents / 100).toFixed(2)
}

const CURRENCY_SYMBOL: Record<string, string> = {
  '£': 'GBP',
  $: 'USD',
  '€': 'EUR',
  '₹': 'INR',
  '¥': 'JPY',
  'A$': 'AUD',
  'C$': 'CAD',
}

/** Which fields the page backed with structured data rather than prose. */
function pageSignals(html: string, site: ImportedSite) {
  const blocks = jsonLd(html)
  const names = blocks.map((block) => trim(strings(block.name)[0] ?? '')).filter(Boolean)
  const hours = blocks.flatMap((block) => strings(block.openingHours ?? block.openingHoursSpecification)).map(trim).filter(Boolean)
  const phone = blocks.map((block) => trim(strings(block.telephone)[0] ?? '')).filter(Boolean)
  const addressBlocks = blocks.map((block) => block.address).filter(Boolean)
  const prices = blocks.flatMap((block) => strings(block.price)).filter(Boolean)
  const productNames = blocks.filter((block) => /Product|Service|MenuItem|Room|Course/i.test(strings(block['@type']).join(' '))).length
  const ogName = /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i.exec(html)?.[1] ?? ''
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1]?.replace(/<[^>]+>/g, '') ?? ''
  const symbols = [...new Set((site.menu.flatMap((section) => section.items).map((item) => item.price).length ? html.match(/[£$€₹¥]/g) ?? [] : []))]
  return { blocks, names, hours, phone, addressBlocks, prices, productNames, ogName: trim(ogName), h1: trim(h1), symbols }
}

/**
 * Read one site's facts into a discovery record.
 *
 * `html` is the entry page, used only to establish *how* a value was found. When
 * it is absent every value falls back to the importer's own report, at the
 * confidence that report justifies — it never upgrades a guess to a fact.
 */
export function buildDiscovery(input: {
  report?: ImportReport
  site: ImportedSite
  source: string
  html?: string
  pagesRead?: string[]
  pagesFailed?: { url: string; reason: string }[]
  usedSitemap?: boolean
  clientRendered?: boolean
}): Discovery {
  const { site, source } = input
  const html = input.html ?? ''
  const proof = pageSignals(html, site)
  const sourceOf = (section: { name: string } | undefined) => (section ? source : source)

  const nameMethod: Method = proof.names.length ? 'structured-data' : proof.ogName || site.name ? 'metadata' : 'visible-text'
  const nameConfidence: Confidence = proof.names.length ? 'verified' : site.name ? 'likely' : 'guess'

  // A name read three ways that disagrees three ways is a conflict, not a pick.
  const nameValues = distinctNames([proof.names[0], proof.ogName, proof.h1].filter(Boolean) as string[])
  const conflicts: DiscoveryConflict[] = []
  const nameReadings: ProvenanceConflict[] = []
  if (proof.names[0]) nameReadings.push({ value: proof.names[0], source, method: 'structured-data', reference: 'json-ld:name' })
  if (proof.ogName) nameReadings.push({ value: proof.ogName, source, method: 'metadata', reference: 'meta[property="og:site_name"]' })
  if (proof.h1) nameReadings.push({ value: proof.h1, source, method: 'visible-text', reference: 'h1' })
  const nameConflictReadings = nameValues.length > 1
    ? nameReadings.filter((reading) => nameValues.some((value) => nameKey(value) === nameKey(reading.value)))
    : []
  if (nameValues.length > 1) {
    conflicts.push({ field: 'name', values: nameValues.map((value) => ({ value, source })) })
  }

  const items = site.menu.flatMap((section) => section.items)
  const missingDescriptions = items.filter((item) => !item.desc.trim()).length
  const policies = policyLinks(html, source)
  const priced = items.filter((item) => item.price > 0)
  const withImage = items.filter((item) => item.image?.url)
  const payload = payloadFor(site.vertical)
  const rule = ruleFor(site.vertical)
  // The same verdict the cleaner used, run again on the rows that survived so
  // discovery can say what each one is missing. It never upgrades a value.
  const verdicts = site.menu.flatMap((section) =>
    section.items.map((item) =>
      assessItem({
        name: item.name,
        desc: item.desc,
        price: item.price,
        image: Boolean(item.image || item.media),
        variants: item.variants?.length ?? 0,
        meta: item.meta,
        capacity: item.capacity,
        section: section.name,
        vertical: site.vertical,
        source: item.sourceUrl,
        priceVerified: item.priceEvidence?.validated,
      }),
    ),
  )
  const verified = verdicts.filter((verdict) => verdict.accept && verdict.status === 'verified').length
  const accepted = verdicts.filter((verdict) => verdict.accept).length
  const advised = new Set(
    verdicts.flatMap((verdict) => (verdict.accept ? verdict.evidence : [])),
  )
  const requirementMissing = rule.advises.filter((key) => !advised.has(key))
  // A refusal recorded by the cleaner is part of the read, not a quiet deletion.
  const rejected = (input.report?.quality.dropped ?? []).map((entry) => ({
    name: entry.name,
    section: entry.section,
    payload: (/article|journal|caption/.test(entry.reason)
      ? 'article'
      : /policy/.test(entry.reason)
        ? 'policy'
        : /navigation|heading|option/.test(entry.reason)
          ? 'navigation'
          : /location/.test(entry.reason)
            ? 'location'
            : /promotion|room/.test(entry.reason)
              ? 'promotion'
              : 'unknown') as Payload,
    reason: entry.reason,
  }))

  // A Shopify feed often prints the currency only in its variant labels
  // ("£5.00"); that is still the shop's own money, beside its own price.
  const variantSymbols = items
    .flatMap((item) => item.variants ?? [])
    .map((variant) => /[£$€₹¥]/.exec(variant.name)?.[0] ?? '')
    .filter(Boolean)
  const symbolCodes = [...new Set([...proof.symbols, ...variantSymbols].map((symbol) => CURRENCY_SYMBOL[symbol]).filter(Boolean))]
  // A shop can omit its currency from metadata while printing one beside every
  // price. That symbol is evidence, not a guess; two different symbols are not.
  const currencyBasis = site.currency || (symbolCodes.length === 1 ? symbolCodes[0] : '')
  if (site.currency && symbolCodes.length === 1 && symbolCodes[0] !== site.currency) {
    conflicts.push({
      field: 'currency',
      values: [
        { value: currencyBasis, source },
        { value: symbolCodes[0], source: 'currency symbols beside prices' },
      ],
    })
  }
  const currencyReadings: ProvenanceConflict[] = (site.currencyCandidates ?? [])
    .filter((candidate) => candidate.code)
    .map((candidate) => ({
      value: candidate.code,
      source: candidate.source || source,
      method: candidate.method === 'meta' ? 'metadata' : candidate.method === 'json-ld' ? 'structured-data' : 'visible-text',
      reference:
        candidate.method === 'meta'
          ? 'meta[product:price:currency]'
          : candidate.method === 'json-ld'
            ? 'json-ld:offers.priceCurrency'
            : 'visible-text:currency beside prices',
    }))
  const currencyConflictReadings = [...new Map(currencyReadings.map((entry) => [entry.value, entry])).values()]
  const currencyConflicted = currencyConflictReadings.length > 1 || Boolean(site.currencyConflict)
  if (currencyConflicted && currencyConflictReadings.length > 1) {
    conflicts.push({ field: 'currency', values: currencyConflictReadings.map((entry) => ({ value: entry.value, source: entry.source })) })
  }
  const priceConflicts = site.priceConflicts ?? []
  for (const conflict of priceConflicts) {
    conflicts.push({
      field: `price:${conflict.name}`,
      values: [
        { value: moneyText(conflict.page), source: conflict.pageSource },
        { value: moneyText(conflict.feed), source: conflict.feedSource },
      ],
    })
  }

  const priceMethod: Method = proof.prices.length && priced.length ? 'structured-data' : priced.length ? 'visible-text' : 'inferred'
  const hoursMethod: Method = proof.hours.length ? 'structured-data' : site.hours ? 'visible-text' : 'inferred'
  const contactMethod: Method = proof.phone.length ? 'structured-data' : 'visible-text'

  const pricingBasis: 'published' | 'quote' | 'unknown' = priced.length
    ? 'published'
    : items.length && (payload === 'service' || payload === 'treatment' || payload === 'room')
      ? 'quote'
      : 'unknown'

  const missing: string[] = []
  if (!site.name.trim()) missing.push('business name')
  if (!items.length) missing.push(`${rule.label} list`)
  if (!site.phone.trim() && !site.email.trim()) missing.push('contact details')
  if (!site.address.trim()) missing.push('address')
  if (priced.length && !currencyBasis) missing.push('currency')
  if (pricingBasis === 'published' && !currencyBasis) missing.push('currency')
  if (items.length && payload === 'room' && !priced.length) missing.push('room rates')
  if (items.length && !withImage.length) missing.push(`${rule.label} photographs`)
  if (missingDescriptions) missing.push(`${rule.label} descriptions`)
  if (items.length && !policies.length) missing.push('business policies')
  if (requirementMissing.length) missing.push(`${rule.label} ${requirementMissing.join(', ')}`)

  const evidenceOf = (item: MenuItem): DiscoveryItem['evidence'] => {
    const verdict = assessItem({
      name: item.name,
      desc: item.desc,
      price: item.price,
      image: Boolean(item.image || item.media),
      variants: item.variants?.length ?? 0,
      meta: item.meta,
      capacity: item.capacity,
      vertical: site.vertical,
      source: item.sourceUrl,
      priceVerified: item.priceEvidence?.validated,
    })
    const method: Method =
      item.sourceMethod === 'embedded-json'
        ? 'structured-data'
        : item.sourceMethod ??
          (item.priceEvidence?.method === 'json-ld' ? 'structured-data' : 'visible-text')
    const confidence: Confidence = item.priceEvidence?.validated
      ? 'verified'
      : verdict.status === 'verified'
        ? 'likely'
        : 'guess'
    return {
      payload: verdict.payload,
      source: item.sourceUrl || source,
      method,
      confidence,
      status: verdict.status === 'rejected' ? 'incomplete' : verdict.status,
      missing: verdict.missing,
    }
  }

  const conflictingPrices = new Map(priceConflicts.map((entry) => [entry.name.toLowerCase(), entry]))
  const currencyMethod: Method = site.currencyEvidence
    ? site.currencyEvidence.method === 'meta'
      ? 'metadata'
      : site.currencyEvidence.method === 'json-ld' || site.currencyEvidence.method.startsWith('shopify')
        ? 'structured-data'
        : 'visible-text'
    : site.currency
      ? 'metadata'
      : symbolCodes.length
        ? 'visible-text'
        : 'inferred'
  const currencyReference = site.currencyEvidence
    ? site.currencyEvidence.method === 'meta'
      ? 'meta[product:price:currency]'
      : site.currencyEvidence.method === 'json-ld'
        ? 'json-ld:offers.priceCurrency'
        : site.currencyEvidence.method.startsWith('shopify')
          ? 'embedded-json:shop.currency'
          : 'visible-text:currency beside prices'
    : symbolCodes.length
      ? 'visible-text:currency beside prices'
      : undefined
  const currencyField: DiscoveryItem['fields']['currency'] = field(
    currencyBasis,
    site.currencyEvidence?.source || source,
    currencyMethod,
    currencyBasis ? (currencyConflicted ? 'guess' : 'likely') : 'guess',
    {
      ...(currencyReference ? { reference: currencyReference } : {}),
      conflicts: currencyConflictReadings.length > 1 ? currencyConflictReadings : [],
      needsConfirmation: !currencyBasis || currencyConflicted,
    },
  )

  /** Each catalogue row's own evidence. A row is not one claim: six fields,
   *  six origins, and any disagreement kept beside the value it disagrees with. */
  const fieldsOf = (item: MenuItem, sectionName: string): DiscoveryItem['fields'] => {
    const nameStructured = item.sourceMethod === 'structured-data' || item.sourceMethod === 'embedded-json'
    const sourceOfItem = item.sourceUrl || source
    const priceConflict = conflictingPrices.get(item.name.toLowerCase())
    const raw = item.priceEvidence?.raw || (item.price > 0 ? moneyText(item.price) : '')
    const range = priceRange(raw)
    const priceConfidence: Confidence = priceConflict || range ? 'guess' : item.priceEvidence?.validated ? 'verified' : item.price > 0 ? 'likely' : 'guess'
    const priceReadings: ProvenanceConflict[] = priceConflict
      ? [
          { value: moneyText(priceConflict.page), source: priceConflict.pageSource, method: 'visible-text', reference: 'visible-text:page price' },
          { value: moneyText(priceConflict.feed), source: priceConflict.feedSource, method: 'structured-data', reference: 'embedded-json:variants[].price' },
        ]
      : []
    const imageMethod = item.image?.method
    return {
      name: field(item.name, sourceOfItem, nameStructured ? 'structured-data' : 'visible-text', nameStructured ? 'verified' : 'likely', {
        reference: nameStructured ? 'json-ld:name' : 'visible-text:card title',
      }),
      desc: field(item.desc, sourceOfItem, nameStructured ? 'structured-data' : 'visible-text', item.desc ? (nameStructured ? 'verified' : 'likely') : 'guess', {
        reference: nameStructured ? 'json-ld:description' : 'visible-text:item description',
        // A missing description is genuinely missing information, not a
        // stylistic choice the read is allowed to make for the owner.
        needsConfirmation: !item.desc.trim(),
      }),
      price: field(raw, sourceOfItem, item.priceEvidence?.method === 'json-ld' ? 'structured-data' : 'visible-text', priceConfidence, {
        reference: METHOD_REFERENCE[item.priceEvidence?.method ?? ''] ?? (item.priceEvidence ? 'visible-text:card price' : undefined),
        conflicts: priceReadings,
        needsConfirmation: Boolean(priceConflict) || Boolean(range),
        ...(range ? { range } : {}),
      }),
      currency: currencyField,
      image: field(item.image?.url ?? '', item.image?.sourceUrl ?? sourceOfItem, imageMethod === 'structured-data' ? 'structured-data' : imageMethod ? 'visible-text' : 'inferred', item.image?.url ? (imageMethod === 'structured-data' ? 'verified' : 'likely') : 'guess', {
        needsConfirmation: !item.image?.url,
        reference:
          imageMethod === 'structured-data'
            ? 'json-ld:image'
            : imageMethod === 'embedded-json'
              ? 'embedded-json:product.image'
              : imageMethod === 'og-image'
                ? 'meta[property="og:image"]'
                : imageMethod
                  ? 'visible-text:img in product card'
                  : undefined,
      }),
      category: field(sectionName, sourceOfItem, 'visible-text', sectionName && !/^(?:catalogue|products?|featured|items?|the collection)$/i.test(sectionName) ? 'likely' : 'guess', {
        reference: 'visible-text:section heading',
        needsConfirmation: !sectionName,
      }),
    }
  }

  const ranged = items
    .map((item) => ({ name: item.name, range: priceRange(item.priceEvidence?.raw ?? '') }))
    .filter((entry): entry is { name: string; range: NonNullable<Provenance['range']> } => Boolean(entry.range))

  const questions: DiscoveryQuestion[] = []
  if (!site.name.trim()) questions.push({ field: 'name', why: 'Nothing on the site named the business.', kind: 'blocker' })
  for (const conflict of priceConflicts) {
    questions.push({
      field: `price:${conflict.name}`,
      why: `The page prices “${conflict.name}” at ${moneyText(conflict.page)} and the product feed at ${moneyText(conflict.feed)}. Nothing is published until you choose, and neither figure is guessed at.`,
      kind: 'confirm',
    })
  }
  if (ranged.length) {
    const example = ranged[0]
    questions.push({
      field: 'price-ranges',
      why: `${ranged.length} ${rule.label}${ranged.length === 1 ? ' is' : 's are'} priced as a range (for example “${example.range.raw}” for ${example.name}). The app reads the lower bound as a starting price and says “from”; confirm the range or give us one price.`,
      kind: 'confirm',
    })
  }
  if (missingDescriptions) {
    questions.push({
      field: 'descriptions',
      why: `${missingDescriptions} of ${items.length} ${rule.label}${items.length === 1 ? '' : 's'} ${missingDescriptions === 1 ? 'has' : 'have'} no description on the site. Nothing was written for them; add your own words in the editor.`,
      kind: 'confirm',
    })
  }
  if (site.verticalConfidence === 'guessed') {
    questions.push({
      field: 'category',
      why: `The trade was inferred${site.category ? ` as “${site.category}”` : ''} from the pages read rather than stated by the business. Is that how you describe it?`,
      kind: 'confirm',
    })
  }
  if (items.length && !policies.length) {
    questions.push({
      field: 'policies',
      why: 'No shipping, returns, privacy or terms page was linked from the pages read. The app does not write a policy: add yours before publishing.',
      kind: 'confirm',
    })
  }
  if (items.length && !withImage.length) {
    questions.push({
      field: 'photographs',
      why: `No ${rule.label} photograph was published on the pages read. The app uses its own typographic field rather than a stock photo or another product's image.`,
      kind: 'confirm',
    })
  } else if (items.length && withImage.length < items.length) {
    questions.push({
      field: 'photographs',
      why: `${items.length - withImage.length} of ${items.length} ${rule.label}s have no photograph on the site. They keep a typographic field; no stock image is substituted.`,
      kind: 'confirm',
    })
  }
  // A name taken from the domain is a guess about the brand, and the site may
  // write it with spaces, capitals or punctuation that a hostname cannot hold.
  if (site.nameSource === 'host' || (site.nameSource === undefined && /^[a-z0-9]+$/.test(site.name.trim()))) {
    questions.push({
      field: 'name',
      why: `We only read the name as “${site.name.trim()}”, from the web address. Is that how the business writes it?`,
      kind: 'confirm',
    })
  }
  if (!items.length) {
    questions.push({
      field: 'catalogue',
      why: `No ${rule.label}s could be read as commercial inventory — the pages the crawler reached were policies, articles, locations or navigation. Add them, or point us at the page that lists your ${rule.label}s.`,
      kind: 'confirm',
    })
  }
  if (items.length && !priced.length && payload !== 'service') {
    questions.push({
      field: 'pricing',
      why: `The site lists ${rule.label}s but publishes no prices for them. Prices stay hidden until you add them.`,
      kind: 'confirm',
    })
  }
  if (!site.phone.trim() && !site.email.trim()) {
    questions.push({ field: 'contact', why: 'No phone or email was published.', kind: 'confirm' })
  }
  if (priced.length && !currencyBasis) {
    questions.push({ field: 'currency', why: 'Prices were read but not the currency.', kind: 'confirm' })
  }
  // The owner's own name and email are the buyer's, not the business's. They are
  // asked once, at delivery, and are never presented as something the site said.

  // A site can genuinely be two businesses (a garden centre with a café). That
  // is not a classification to guess at quietly: the second reading is listed as
  // a candidate and the owner is asked which one the app should lead with.
  const SECTION_TRADE: { trade: VerticalId; words: string[] }[] = [
    { trade: 'restaurant', words: ['menu', 'dish', 'kitchen', 'breakfast', 'dinner', 'pizza', 'coffee'] },
    { trade: 'cafe', words: ['café', 'cafe', 'bakery', 'pastry', 'brunch', 'tea'] },
    { trade: 'plants-indoor', words: ['indoor plant', 'houseplant', 'house plant'] },
    { trade: 'plants-outdoor', words: ['outdoor plant', 'garden', 'shrub', 'tree'] },
    { trade: 'salon', words: ['hair', 'beauty', 'facial', 'nails', 'barber'] },
    { trade: 'gym', words: ['class', 'training', 'membership', 'workout', 'yoga'] },
    { trade: 'clinic', words: ['clinic', 'treatment', 'dentist', 'physio', 'doctor'] },
    { trade: 'hotel', words: ['room', 'suite', 'stay', 'night'] },
    { trade: 'property', words: ['property', 'listing', 'apartment', 'flat'] },
    { trade: 'courses', words: ['course', 'term', 'lesson', 'curriculum'] },
    { trade: 'marketplace', words: ['vendor', 'stall', 'seller', 'market'] },
  ]
  const haystack = [
    site.category,
    ...site.menu.map((section) => section.name),
    // Item names matter when the sections are generic ("Products", "Services"):
    // a garden centre's café is only visible in what it sells.
    ...site.menu.flatMap((section) => section.items.slice(0, 20).map((item) => item.name)),
    site.tagline,
  ]
    .join(' ')
    .toLowerCase()
  const rivals = SECTION_TRADE.filter(
    (entry) => entry.trade !== site.vertical && entry.words.some((word) => haystack.includes(word)),
  ).slice(0, 2)
  // One trade question, only when a second trade is evidenced by a section
  // name or the site's own category — never by a product title.
  const sectionText = [site.category, ...site.menu.map((section) => section.name)].join(' ').toLowerCase()
  const evidenced = rivals.filter((rival) => rival.words.some((word) => sectionText.includes(word)))
  if (evidenced.length && site.verticalConfidence !== 'guessed') {
    questions.push({
      field: 'trade',
      why: `The site reads as ${site.vertical} and also as ${evidenced[0].trade} (it has a ${evidenced[0].words[0]} section). Which one should the app lead with?`,
      kind: 'confirm',
    })
  }

  const tradeEvidence = [site.categoryBasis, site.category].filter(Boolean)

  return {
    url: source,
    host: (() => {
      try {
        return new URL(source).host
      } catch {
        return source
      }
    })(),
    pages: {
      read: input.pagesRead ?? [source],
      failed: input.pagesFailed ?? [],
      usedSitemap: Boolean(input.usedSitemap),
    },
    business: {
      name: field(site.name.trim(), source, nameMethod, nameConfidence, {
        reference: proof.names.length
          ? 'json-ld:name'
          : proof.ogName
            ? 'meta[property="og:site_name"]'
            : site.nameSource === 'title'
              ? 'title'
              : site.nameSource === 'host'
                ? 'website hostname'
                : 'h1',
        conflicts: nameConflictReadings,
        needsConfirmation: site.nameSource === 'host' || nameConfidence !== 'verified',
      }),
      category: field(
        site.category.trim(),
        source,
        site.categoryBasis && /structured|schema/i.test(site.categoryBasis) ? 'structured-data' : 'visible-text',
        site.categoryBasis && /structured|schema/i.test(site.categoryBasis) ? 'verified' : site.category ? 'likely' : 'guess',
        {
          reference: site.categoryBasis && /structured|schema/i.test(site.categoryBasis) ? 'json-ld:@type' : 'visible-text:business category',
          needsConfirmation: !site.category.trim() || site.verticalConfidence === 'guessed',
        },
      ),
      tagline: field(site.tagline.trim(), source, 'visible-text', site.tagline ? 'likely' : 'guess', {
        reference: 'meta[property="og:description"] or visible introduction',
      }),
      story: field(site.story.trim(), source, 'visible-text', site.story ? 'likely' : 'guess', {
        reference: 'visible-text:about copy',
      }),
      trade: field(site.vertical, source, 'inferred', site.verticalConfidence === 'detected' ? 'verified' : 'guess', {
        reference: site.categoryBasis || 'trade signals on the pages read',
        needsConfirmation: site.verticalConfidence !== 'detected',
      }),
      accent: field(
        site.accent,
        site.accent ? source : '',
        site.design?.palette ? 'visible-text' : 'inferred',
        site.accent ? 'likely' : 'guess',
        { reference: site.design?.palette ? 'stylesheet palette' : 'theme-color or design tokens' },
      ),
      logo: field(site.logoImage ?? null, source, 'metadata', site.logoImage ? 'likely' : 'guess', {
        reference: 'structured data logo, og:logo or link[rel=icon]',
      }),
      hours: field(site.hours.trim(), site.contactEvidence?.hours || source, hoursMethod, site.hours ? (proof.hours.length ? 'verified' : 'likely') : 'guess', {
        reference: proof.hours.length ? 'json-ld:openingHours' : 'visible-text:opening hours',
      }),
      phone: field(site.phone.trim(), site.contactEvidence?.phone || source, contactMethod, site.phone ? (proof.phone.length ? 'verified' : 'likely') : 'guess', {
        reference: proof.phone.length ? 'json-ld:telephone' : 'a[href^="tel:"]',
      }),
      email: field(site.email.trim(), site.contactEvidence?.email || source, 'visible-text', site.email ? 'likely' : 'guess', {
        reference: 'a[href^="mailto:"]',
      }),
      address: field(
        site.address.trim(),
        site.contactEvidence?.address || source,
        proof.addressBlocks.length ? 'structured-data' : 'visible-text',
        site.address ? (proof.addressBlocks.length ? 'verified' : 'likely') : 'guess',
        { reference: proof.addressBlocks.length ? 'json-ld:address' : 'visible-text:address' },
      ),
    },
    policies,
    commerce: {
      currency: field(
        currencyBasis,
        site.currencyEvidence?.source || source,
        currencyMethod,
        currencyBasis ? (currencyConflicted ? 'guess' : 'likely') : 'guess',
        {
          ...(currencyReference ? { reference: currencyReference } : {}),
          conflicts: currencyConflictReadings.length > 1 ? currencyConflictReadings : [],
          needsConfirmation: !currencyBasis || currencyConflicted,
        },
      ),
      sections: site.menu.map((section) => ({
        name: section.name,
        source: sourceOf(section),
        items: section.items.map((item) => ({
          ...(item.sourceId ? { sourceId: item.sourceId } : {}),
          name: item.name,
          desc: item.desc,
          price: item.price,
          meta: item.meta,
          ...(item.variants?.length ? { variants: item.variants } : {}),
          ...(item.optionGroups?.length ? { optionGroups: item.optionGroups } : {}),
          image: item.image?.url,
          imageMethod: item.image?.method,
          evidence: evidenceOf(item),
          fields: fieldsOf(item, section.name),
        })),
      })),
      products: items.length,
      priced: priced.length,
      withImage: withImage.length,
      payload,
      status: !items.length ? 'empty' : accepted > 0 && verified === accepted ? 'complete' : 'partial',
      rejected,
      requirements: {
        met: rule.advises.filter((key) => advised.has(key)),
        missing: requirementMissing,
      },
      pricingBasis,
    },
    conflicts,
    missing,
    questions,
    tradeCandidates: [
      { id: site.vertical, score: site.verticalConfidence === 'detected' ? 0.9 : 0.6, evidence: tradeEvidence },
      ...rivals.map((rival) => ({ id: rival.trade, score: 0.45, evidence: [rival.words[0]] })),
    ],
    clientRendered: Boolean(input.clientRendered),
  } satisfies Discovery
}

/** The site facts, ready for `buildSpec`: no menu means no invented catalogue. */
function siteFor(discovery: Discovery, site: ImportedSite) {
  return {
    ...site,
    menu: discovery.commerce.sections.map((section) => ({
      name: section.name,
      items: section.items.map(
        (item): MenuItem => ({
          ...(item.sourceId ? { sourceId: item.sourceId } : {}),
          ...(item.evidence.source ? { sourceUrl: item.evidence.source } : {}),
          ...(item.evidence.method === 'structured-data'
            ? { sourceMethod: 'structured-data' as const }
            : item.evidence.method === 'metadata'
              ? { sourceMethod: 'metadata' as const }
              : { sourceMethod: 'visible-text' as const }),
          name: item.name,
          desc: item.desc,
          price: item.price,
          ...(item.meta ? { meta: item.meta } : {}),
          ...(item.variants?.length ? { variants: item.variants } : {}),
          ...(item.optionGroups?.length ? { optionGroups: item.optionGroups } : {}),
          // Only the business's own photograph, with the method that tied it here.
          ...(item.image
            ? { image: { url: item.image, source: 'website' as const, method: item.imageMethod ?? 'public-data' } }
            : {}),
        }),
      ),
    })),
    phone: discovery.business.phone.value,
    email: discovery.business.email.value,
    address: discovery.business.address.value,
    hours: discovery.business.hours.value,
    category: discovery.business.category.value,
    story: discovery.business.story.value,
    accent: discovery.business.accent.value,
    currency: discovery.commerce.currency.value,
    website: discovery.url,
    tagline: discovery.business.tagline.value,
  }
}

/**
 * Three real documents from one discovery.
 *
 * Each concept is the same verified facts rendered through a different
 * direction: different type pairing, navigation, surfaces and density, which is
 * what makes them different applications rather than three colours.
 */
export function discoverPlan(
  discovery: Discovery,
  site: ImportedSite,
  overrides: { name?: string; accent?: string; logo?: string } = {},
): DiscoveryPlan {
  const facts = siteFor(discovery, site)
  const vertical = discovery.business.trade.value
  const name = (overrides.name ?? discovery.business.name.value).trim()
  const concepts = directionsFor(vertical).map((direction) => {
    const spec = buildSpec({
      name: name || 'Your business',
      vertical,
      accent: overrides.accent || discovery.business.accent.value || '#2f4a3f',
      logo: overrides.logo || initialsFor(name),
      features: site.features ?? [],
      category: discovery.business.category.value,
      direction: direction.id,
      site: facts,
    })
    const blueprint = blueprintFor(spec)
    return {
      id: direction.id,
      name: direction.label,
      note: `${direction.blurb} · ${blueprint.label}`,
      spec,
      doc: flagshipDocFromSpec(spec),
    }
  })
  return {
    discovery,
    concepts,
    diversity: validateConcepts(
      concepts[0].spec,
      concepts.map((concept) => ({ id: concept.id, doc: concept.doc })),
    ),
    // Questions are keyed by field: an owner never sees the same question twice.

    blockers: uniqueQuestions(discovery.questions.filter((question) => question.kind === 'blocker')),
    confirmations: uniqueQuestions(discovery.questions.filter((question) => question.kind === 'confirm')),
  }
}

function uniqueQuestions(questions: DiscoveryQuestion[]): DiscoveryQuestion[] {
  const seen = new Set<string>()
  return questions.filter((question) => {
    if (seen.has(question.field)) return false
    seen.add(question.field)
    return true
  })
}

function initialsFor(name: string): string {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return 'AP'
  return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase()
}
