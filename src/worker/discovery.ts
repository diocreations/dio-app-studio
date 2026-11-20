import type { ImportedSite, ImportReport } from './importer'
import { directionsFor } from './directions'
import { buildSpec } from './pricing'
import { flagshipDocFromSpec, type Doc } from './doc'
import type { AppSpec, MenuItem, VerticalId } from './types'

/**
 * What a website read actually established, and how well.
 *
 * Plattr's rule for URL-first generation is that the customer is never asked for
 * something the read already produced, and never shown a value the read did not
 * support. Both need provenance: a value without a source cannot be trusted, and
 * a value without a confidence cannot be asked about correctly.
 */

export type Method = 'structured-data' | 'metadata' | 'visible-text' | 'inferred'
export type Confidence = 'verified' | 'likely' | 'guess'

export type Field<T> = {
  value: T
  /** Exact page the value came from. */
  source: string
  method: Method
  confidence: Confidence
}

export type DiscoveryItem = {
  name: string
  desc: string
  price: number
  meta?: string
  /** The business's own photograph for this exact item, when the read tied one to it. */
  image?: string
  imageMethod?: 'structured-data' | 'embedded-json' | 'og-image' | 'public-data'
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
  commerce: {
    currency: Field<string>
    sections: DiscoverySection[]
    products: number
    priced: number
    withImage: number
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
  /** Only the fields a build genuinely cannot proceed without. */
  blockers: DiscoveryQuestion[]
  /** Questions worth asking, never blocking. */
  confirmations: DiscoveryQuestion[]
}

const EMPTY = { value: '', source: '', method: 'visible-text' as Method, confidence: 'guess' as Confidence }

function field<T>(value: T, source: string, method: Method, confidence: Confidence): Field<T> {
  return { value, source, method, confidence }
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
function provenance(html: string, site: ImportedSite) {
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
  const proof = provenance(html, site)
  const sourceOf = (section: { name: string } | undefined) => (section ? source : source)

  const nameMethod: Method = proof.names.length ? 'structured-data' : proof.ogName || site.name ? 'metadata' : 'visible-text'
  const nameConfidence: Confidence = proof.names.length ? 'verified' : site.name ? 'likely' : 'guess'

  // A name read three ways that disagrees three ways is a conflict, not a pick.
  const nameValues = [...new Set([proof.names[0], proof.ogName, proof.h1].filter(Boolean) as string[])]
  const conflicts: DiscoveryConflict[] = []
  if (nameValues.length > 1) {
    conflicts.push({ field: 'name', values: nameValues.map((value) => ({ value, source })) })
  }

  const items = site.menu.flatMap((section) => section.items)
  const priced = items.filter((item) => item.price > 0)
  const withImage = items.filter((item) => item.image?.url)

  const currencyBasis = site.currency || ''
  const symbolCodes = [...new Set(proof.symbols.map((symbol) => CURRENCY_SYMBOL[symbol]).filter(Boolean))]
  if (currencyBasis && symbolCodes.length === 1 && symbolCodes[0] !== currencyBasis) {
    conflicts.push({
      field: 'currency',
      values: [
        { value: currencyBasis, source },
        { value: symbolCodes[0], source: 'currency symbols beside prices' },
      ],
    })
  }

  const priceMethod: Method = proof.prices.length && priced.length ? 'structured-data' : priced.length ? 'visible-text' : 'inferred'
  const hoursMethod: Method = proof.hours.length ? 'structured-data' : site.hours ? 'visible-text' : 'inferred'
  const contactMethod: Method = proof.phone.length ? 'structured-data' : 'visible-text'

  const missing: string[] = []
  if (!site.name.trim()) missing.push('business name')
  if (!items.length) missing.push('products or services')
  if (!site.phone.trim() && !site.email.trim()) missing.push('contact details')
  if (!site.address.trim()) missing.push('address')
  if (priced.length && !currencyBasis) missing.push('currency')

  const questions: DiscoveryQuestion[] = []
  if (!site.name.trim()) questions.push({ field: 'name', why: 'Nothing on the site named the business.', kind: 'blocker' })
  if (!items.length) {
    questions.push({
      field: 'catalogue',
      why: 'No products or services could be read. Add them, or point us at the page that lists them.',
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
  for (const rival of rivals) {
    questions.push({
      field: 'trade',
      why: `The site reads as ${site.vertical} and also as ${rival.trade} (it mentions ${rival.words[0]}). Which one should the app lead with?`,
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
      name: field(site.name.trim(), source, nameMethod, nameConfidence),
      category: field(
        site.category.trim(),
        source,
        site.categoryBasis && /structured|schema/i.test(site.categoryBasis) ? 'structured-data' : 'visible-text',
        site.categoryBasis && /structured|schema/i.test(site.categoryBasis) ? 'verified' : site.category ? 'likely' : 'guess',
      ),
      tagline: field(site.tagline.trim(), source, 'visible-text', site.tagline ? 'likely' : 'guess'),
      story: field(site.story.trim(), source, 'visible-text', site.story ? 'likely' : 'guess'),
      trade: field(site.vertical, source, 'inferred', site.verticalConfidence === 'detected' ? 'verified' : 'guess'),
      accent: field(
        site.accent,
        site.accent ? source : '',
        site.design?.palette ? 'visible-text' : 'inferred',
        site.accent ? 'likely' : 'guess',
      ),
      logo: field(site.logoImage ?? null, source, 'metadata', site.logoImage ? 'likely' : 'guess'),
      hours: field(site.hours.trim(), source, hoursMethod, site.hours ? (proof.hours.length ? 'verified' : 'likely') : 'guess'),
      phone: field(site.phone.trim(), source, contactMethod, site.phone ? (proof.phone.length ? 'verified' : 'likely') : 'guess'),
      email: field(site.email.trim(), source, 'visible-text', site.email ? 'likely' : 'guess'),
      address: field(
        site.address.trim(),
        source,
        proof.addressBlocks.length ? 'structured-data' : 'visible-text',
        site.address ? (proof.addressBlocks.length ? 'verified' : 'likely') : 'guess',
      ),
    },
    commerce: {
      currency: field(currencyBasis, source, symbolCodes.length ? 'visible-text' : 'metadata', currencyBasis ? 'likely' : 'guess'),
      sections: site.menu.map((section) => ({
        name: section.name,
        source: sourceOf(section),
        items: section.items.map((item) => ({
          name: item.name,
          desc: item.desc,
          price: item.price,
          meta: item.meta,
          image: item.image?.url,
          imageMethod: item.image?.method,
        })),
      })),
      products: items.length,
      priced: priced.length,
      withImage: withImage.length,
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
          name: item.name,
          desc: item.desc,
          price: item.price,
          ...(item.meta ? { meta: item.meta } : {}),
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
      tagline: discovery.business.tagline.value,
      category: discovery.business.category.value,
      direction: direction.id,
      site: facts,
    })
    return { id: direction.id, name: direction.label, note: direction.blurb, spec, doc: flagshipDocFromSpec(spec) }
  })
  return {
    discovery,
    concepts,
    blockers: discovery.questions.filter((question) => question.kind === 'blocker'),
    confirmations: discovery.questions.filter((question) => question.kind === 'confirm'),
  }
}

function initialsFor(name: string): string {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return 'AP'
  return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase()
}
