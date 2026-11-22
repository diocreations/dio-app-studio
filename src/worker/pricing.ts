import { directionsFor } from './directions'
import type {
  AppSpec,
  BundleId,
  FeatureId,
  FieldProvenance,
  LayoutChoice,
  MenuItem,
  MenuItemField,
  MenuSection,
  Platform,
  Plan,
  PriceConflict,
  PriceDecision,
  PriceEvidence,
  ProjectEntry,
  SocialLink,
  SourceReview,
  SourceSnapshot,
  SourceTrail,
  VerticalId,
  VideoLink,
} from './types'
import { cleanDesign, cleanStructure, type DesignKit, type SiteStructure } from './design'
export type { DesignKit }
import { VERTICALS, actionLabelsFor, verticalFor } from './verticals'
import { sanitizeProjects, sanitizeSourceReview } from './review'

export type {
  AppSpec,
  FeatureId,
  LayoutChoice,
  MenuItem,
  MenuSection,
  Plan,
  Platform,
  SocialLink,
  VerticalId,
  Vocab,
} from './types'

/* ------------------------------------------------------------------ */
/* Capabilities. Every vertical uses the same catalogue; each business */
/* picks the ones that fit, and anything outside it goes in the brief. */
/* ------------------------------------------------------------------ */

export type FeatureSpec = {
  id: FeatureId
  label: string
  blurb: string
  price: number
  group: 'Selling' | 'Customers' | 'Growth' | 'Brand'
  core?: boolean
}

export const FEATURES: FeatureSpec[] = [
  {
    id: 'catalog',
    label: 'Catalogue, menu or price list',
    blurb: 'Sections, prices, durations. Included in every build.',
    price: 0,
    group: 'Customers',
    core: true,
  },
  {
    id: 'ordering',
    label: 'Online orders & cart',
    blurb: 'Cart, fulfilment choice, totals and a confirmation.',
    price: 38000,
    group: 'Selling',
  },
  {
    id: 'qr',
    label: 'QR scan-to-order',
    blurb: 'Table cards, shelf tags or van stickers that open the app.',
    price: 20000,
    group: 'Selling',
  },
  {
    id: 'delivery',
    label: 'Delivery & fulfilment',
    blurb: 'Delivery fee, time slots and a live order status screen.',
    price: 24000,
    group: 'Selling',
  },
  {
    id: 'booking',
    label: 'Bookings & appointments',
    blurb: 'Day, time and party size with a confirmation.',
    price: 26000,
    group: 'Selling',
  },
  {
    id: 'classes',
    label: 'Timetable & class booking',
    blurb: 'A weekly schedule with reserve-a-spot buttons.',
    price: 22000,
    group: 'Selling',
  },
  {
    id: 'quote',
    label: 'Quote / enquiry form',
    blurb: 'A short form for jobs that need scoping before a price.',
    price: 18000,
    group: 'Selling',
  },
  {
    id: 'loyalty',
    label: 'Loyalty & memberships',
    blurb: 'A visit card that survives an app restart.',
    price: 19000,
    group: 'Growth',
  },
  {
    id: 'offers',
    label: 'Offers & promotions',
    blurb: 'Promo cards on the home screen for quiet periods.',
    price: 15000,
    group: 'Growth',
  },
  {
    id: 'events',
    label: 'Events & what’s on',
    blurb: 'A dated programme: quiz nights, tastings, open days.',
    price: 14000,
    group: 'Growth',
  },
  {
    id: 'gallery',
    label: 'Gallery & portfolio',
    blurb: 'The room, the work, the team.',
    price: 9000,
    group: 'Brand',
  },
  {
    id: 'reviews',
    label: 'Reviews & testimonials',
    blurb: 'Collect a rating and a line of feedback in the app.',
    price: 11000,
    group: 'Growth',
  },
  {
    id: 'multilingual',
    label: 'Second language',
    blurb: 'Every screen mirrored into a second language.',
    price: 21000,
    group: 'Brand',
  },
  {
    id: 'tablet',
    label: 'Counter / kiosk mode',
    blurb: 'A staff view for taking orders or checking people in.',
    price: 28000,
    group: 'Selling',
  },
]

export const FEATURE_LABEL: Record<FeatureId, string> = FEATURES.reduce(
  (all, feature) => ({ ...all, [feature.id]: feature.label }),
  {} as Record<FeatureId, string>,
)

export const PLATFORMS: {
  id: Platform
  label: string
  price: number
  badge: string
  note: string
}[] = [
  {
    id: 'pwa',
    label: 'Mobile web app (PWA)',
    price: 0,
    badge: 'Included',
    note: 'Installable from a link. Works on iPhone and Android today, no store review.',
  },
  {
    id: 'android',
    label: 'Android package',
    price: 45000,
    badge: 'Play-ready bundle',
    note: 'A signed .aab needs your Play Console upload key — the build project and commands are generated.',
  },
  {
    id: 'ios',
    label: 'iOS package',
    price: 45000,
    badge: 'App Store project',
    note: 'Needs an Apple Developer account, a certificate and about a week of review.',
  },
]

/** Base design + build effort, before features and store formats. */
const BASE_PRICE = 140000

/**
 * Platform products, priced at platform rates rather than app rates.
 *
 * A marketplace is not a bigger version of one shop's app: it is three apps
 * and two back offices, with money moving between parties. That is why it is
 * a bundle with its own price and its own recurring platform fee, and why the
 * brief cannot generate it — the customer storefront can come from the
 * generator, everything behind it is a platform build.
 */
export type Bundle = {
  id: BundleId
  label: string
  blurb: string
  /** One-time build, platform rates. */
  price: number
  /** Hosting, payout rails, push and support, every month. */
  monthly: number
  includes: string[]
}

export const BUNDLES: Bundle[] = [
  {
    id: 'marketplace',
    label: 'Marketplace platform',
    blurb:
      'Customers, stores and drivers in three apps, with a super admin and a store console behind them.',
    price: 1650000,
    monthly: 39500,
    includes: [
      'Customer app: stores, categories, cart, checkout, live tracking, wallet',
      'Store partner app: orders, stock, earnings, KYC upload',
      'Driver app: assignments, navigation, proof of delivery, earnings',
      'Super admin: stores, commission, delivery zones, payouts, analytics',
      'Store admin: products, orders, settlements',
      'Drag-and-drop home builder for banners and category rails',
      'Single-vendor and multi-vendor cart modes, per-store commission',
    ],
  },
]

/** Old feature ids from builds created before the app went vertical-agnostic. */
const LEGACY: Record<string, FeatureId> = {
  menu: 'catalog',
  reservations: 'booking',
}

export type QuoteLine = { label: string; amount: number }

export type Quote = {
  plan: Plan
  oneTime: number
  setupFee: number
  monthly: number
  firstYear: number
  lines: QuoteLine[]
}

export function normalizeFeatures(input: string[]): FeatureId[] {
  const valid = new Set<string>(FEATURES.map((feature) => feature.id))
  const chosen = new Set<FeatureId>(['catalog'])
  for (const raw of input) {
    const id = LEGACY[raw] ?? raw
    if (valid.has(id)) chosen.add(id as FeatureId)
  }
  // These all need a cart or a diary to exist.
  if (chosen.has('qr') || chosen.has('delivery')) chosen.add('ordering')
  if (chosen.has('classes')) {
    chosen.add('booking')
    chosen.add('catalog')
  }
  return FEATURES.filter((feature) => chosen.has(feature.id)).map((feature) => feature.id)
}

export function normalizePlatforms(input: string[]): Platform[] {
  const valid = new Set<string>(['pwa', 'android', 'ios'])
  const chosen: Platform[] = ['pwa']
  for (const id of input) {
    if (valid.has(id) && id !== 'pwa') chosen.push(id as Platform)
  }
  return chosen
}

export function quote(input: {
  features: string[]
  platforms: string[]
  plan: Plan
  /** A platform bundle to add on top of the app, by id. */
  bundle?: string
}): Quote {
  const features = normalizeFeatures(input.features)
  const platforms = normalizePlatforms(input.platforms)
  const bundle = BUNDLES.find((entry) => entry.id === input.bundle)
  // The bundle already carries the customer app, so it stands in for the base
  // build rather than being stacked on top of it.
  const lines: QuoteLine[] = [
    bundle
      ? { label: bundle.label, amount: bundle.price }
      : { label: 'Design and build', amount: BASE_PRICE },
  ]

  for (const feature of FEATURES) {
    if (feature.price > 0 && features.includes(feature.id))
      lines.push({ label: feature.label, amount: feature.price })
  }
  for (const platform of PLATFORMS) {
    if (platform.price > 0 && platforms.includes(platform.id))
      lines.push({ label: platform.label, amount: platform.price })
  }

  const oneTime = lines.reduce((total, line) => total + line.amount, 0)
  const plan: Plan = input.plan === 'monthly' ? 'monthly' : 'onetime'
  const setupFee = plan === 'monthly' ? Math.round((oneTime * 0.3) / 1000) * 1000 : oneTime
  const care = plan === 'monthly' ? Math.max(5900, Math.round((oneTime * 0.055) / 100) * 100) : 0
  // The platform fee runs whichever plan the build is on: hosting, payouts and
  // push cost the same whether the build was invoiced once or spread.
  const monthly = care + (bundle?.monthly ?? 0)

  return {
    plan,
    oneTime,
    setupFee,
    monthly,
    firstYear: setupFee + monthly * 12,
    lines,
  }
}

export function usd(cents: number): string {
  const value = cents / 100
  return value % 1 === 0
    ? `$${value.toLocaleString('en-US')}`
    : `$${value.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`
}

/** Grouped thousands, and whole amounts without a trailing ".00": $1,850. */
export function amountText(cents: number): string {
  const abs = Math.abs(Math.round(cents))
  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const pence = abs % 100
  return `${cents < 0 ? '−' : ''}${whole}${pence ? `.${String(pence).padStart(2, '0')}` : ''}`
}

function amount(cents: number): string {
  return amountText(cents)
}

export function money(cents: number): string {
  return `$${amount(cents)}`
}

/**
 * Money for one build. An imported shop is charged in the currency its own site
 * declared; when that is unconfirmed, the amount is shown with no symbol at all
 * rather than dressed up as dollars. Only generated demo builds — which have no
 * source shop and have always used it — fall back to `$`.
 */
export function moneyForSpec(cents: number, spec: { currency?: string; website?: string }): string {
  return currencySymbolFor(spec) + amountText(cents)
}

/** The symbol to print beside an amount in one build. A confirmed currency
 *  prints its own; an imported shop with none prints nothing; only a generated
 *  demo build, which has no source shop, falls back to dollars. */
export function currencySymbolFor(spec: { currency?: string; website?: string }): string {
  const code = (spec.currency ?? '').trim().toUpperCase()
  if (code && CURRENCY_SYMBOLS[code]) return CURRENCY_SYMBOLS[code]
  return spec.website ? '' : CURRENCY_SYMBOLS.USD
}

/** A price shown in whatever currency the customer's own site uses. */
export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  GBP: '£',
  EUR: '€',
  INR: '₹',
  JPY: '¥',
  AUD: 'A$',
  CAD: 'C$',
  NZD: 'NZ$',
  CHF: 'CHF ',
  SEK: 'kr ',
  NOK: 'kr ',
  DKK: 'kr ',
  ZAR: 'R',
  AED: 'AED ',
  SGD: 'S$',
  BRL: 'R$',
  MXN: 'MX$',
  PLN: 'zł ',
}

export function moneyIn(cents: number, currency?: string): string {
  const symbol = CURRENCY_SYMBOLS[(currency ?? '').toUpperCase()] ?? '$'
  return `${symbol}${amount(cents)}`
}

/* ---------------------------- sanitising --------------------------- */

export function sanitizeHex(value: unknown, fallback: string): string {
  const raw = typeof value === 'string' ? value.trim() : ''
  return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw.toLowerCase() : fallback
}

export function sanitizeLogo(value: unknown, fallback: string): string {
  const raw = typeof value === 'string' ? value.trim().slice(0, 3) : ''
  if (!raw) return fallback
  return /^[\p{L}\p{N}]{1,3}$/u.test(raw) ? raw.toUpperCase() : raw.slice(0, 2)
}

/** Readable ink colour for a brand accent, so previews stay legible. */
/**
 * The label that sits on a brand-coloured surface, chosen by measured contrast
 * rather than a lightness threshold. A mid-tone brand colour can fail AA with
 * a cream label and pass with a dark one, and a threshold picks the wrong one.
 */
export function inkFor(hex: string): string {
  const value = hex.replace('#', '')
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  const channel = (entry: number) => {
    const c = entry / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  const against = (other: [number, number, number]) => {
    const fill = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
    const label = 0.2126 * channel(other[0]) + 0.7152 * channel(other[1]) + 0.0722 * channel(other[2])
    return (Math.max(fill, label) + 0.05) / (Math.min(fill, label) + 0.05)
  }
  return against([0, 0, 0]) >= against([255, 250, 243]) ? '#000000' : '#fffaf3'
}

export function initialsFor(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return 'AP'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

/**
 * Reconstruct the sample-content flags for projects created before the flags
 * existed. A group is sample only while it is still byte-for-byte the trade
 * seed; any edited value is treated as the owner's and is never cleared by the
 * bulk action. Explicit flags on an existing spec win over the inference, so
 * partially migrated rows converge without rewriting an owner's decision.
 */
export function backfillSampleContent(spec: AppSpec): NonNullable<AppSpec['sampleContent']> {
  const vertical = verticalFor(spec.vertical)
  const equal = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
  const inferred = {
    menu: equal(spec.menu, vertical.menu),
    contact:
      spec.phone === vertical.phone &&
      spec.address === vertical.address &&
      spec.hours === vertical.hours &&
      !spec.email,
    story: spec.story === vertical.story,
    offers: equal(spec.offers, vertical.offers),
    team: equal(spec.team ?? [], vertical.team ?? []),
    staff: equal(spec.staff ?? [], vertical.staff ?? []),
    tagline: spec.tagline === vertical.tagline,
  }
  return { ...inferred, ...(spec.sampleContent ?? {}) }
}

/* --------------------------- spec builder -------------------------- */

function copyMenu(menu: MenuSection[]): MenuSection[] {
  return menu.map((section) => ({
    name: section.name,
    items: section.items.map((item) => ({
      ...item,
      ...(item.media ? { media: { ...item.media } } : {}),
    })),
  }))
}

/**
 * A stable identity for a catalogue item: its section and name, not its
 * position. Reordering a menu or re-importing the same site keeps the key, so a
 * document that references this item still finds it.
 */
export function itemKey(section: string, name: string): string {
  const seed = `${section.trim().toLowerCase()}\u0000${name.trim().toLowerCase()}`
  let hash = 0x811c9dc5
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `itm_${hash.toString(16).padStart(8, '0')}`
}

const ITEM_ID = /^itm_[a-f0-9]{8,24}(_\d{1,2})?$/

/** An item image is a stored media id plus presentation, never a remote URL. */
function sanitizeItemImage(value: unknown): MenuItem['image'] {
  const input = value && typeof value === 'object' ? (value as Record<string, unknown>) : null
  const raw = typeof value === 'string' ? value : input && typeof input.url === 'string' ? input.url : ''
  const url = raw.trim()
  if (url.length > 600 || !/^https:\/\/[^\s"'<>]+$/i.test(url)) return undefined
  const alt = input && typeof input.alt === 'string' ? input.alt.trim().slice(0, 140) : ''
  const rawSource = input && typeof input.sourceUrl === 'string' ? input.sourceUrl.trim() : ''
  const sourceUrl =
    rawSource.length <= 600 && /^https:\/\/[^\s"'<>]+$/i.test(rawSource) ? rawSource : undefined
  const methods = ['structured-data', 'embedded-json', 'og-image', 'public-data'] as const
  const method = methods.find((entry) => entry === input?.method)
  const position = (entry: unknown) =>
    typeof entry === 'number' && Number.isFinite(entry)
      ? Math.max(0, Math.min(100, Math.round(entry)))
      : undefined
  return {
    url,
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(alt ? { alt } : {}),
    ...(method ? { method } : {}),
    ...(input?.fit === 'cover' || input?.fit === 'contain' ? { fit: input.fit } : {}),
    ...(position(input?.positionX) !== undefined ? { positionX: position(input?.positionX) } : {}),
    ...(position(input?.positionY) !== undefined ? { positionY: position(input?.positionY) } : {}),
    source: 'website',
  }
}

/** Room capacity is persisted only when the catalogue record states it. A
 *  figure in the trade's sample copy or a guess from the photograph is not
 *  evidence that this room sleeps that many people. */
function statedCapacity(value: unknown, meta: unknown, desc: unknown): number | undefined {
  const direct = Number(value)
  if (Number.isInteger(direct) && direct >= 1 && direct <= 20) return direct
  const text = `${typeof meta === 'string' ? meta : ''} ${typeof desc === 'string' ? desc : ''}`
  const sleeps = text.match(/\bsleeps(?:\s+up\s+to)?\s+(\d{1,2})\b/i)
  const maximum = text.match(/\b(?:max(?:imum)?(?:\s+of)?|up\s+to)\s+(\d{1,2})\s+(?:guests?|people|persons?|adults?)\b/i)
  const count = Number((sleeps ?? maximum)?.[1])
  return Number.isInteger(count) && count >= 1 && count <= 20 ? count : undefined
}

function sanitizeOptionGroups(value: unknown): { name: string; options: string[] }[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, MAX_OPTION_GROUPS).flatMap((raw) => {
    const entry = (raw ?? {}) as Record<string, unknown>
    const name = typeof entry.name === 'string' ? entry.name.trim().slice(0, 24) : ''
    const options = Array.isArray(entry.options)
      ? entry.options
          .map((option) => String(option ?? '').trim().slice(0, 30))
          .filter(Boolean)
          .slice(0, MAX_OPTIONS_PER_GROUP)
      : []
    return name && options.length ? [{ name, options }] : []
  })
}

function sanitizeItemMedia(value: unknown): MenuItem['media'] {
  if (!value || typeof value !== 'object') return undefined
  const input = value as Record<string, unknown>
  if (typeof input.id !== 'string' || !/^med_[a-f0-9]{16,40}$/.test(input.id)) return undefined
  const number = (entry: unknown, max: number, fallback: number) =>
    typeof entry === 'number' && Number.isFinite(entry)
      ? Math.max(0, Math.min(max, Math.round(entry)))
      : fallback
  const dimension = (entry: unknown) =>
    typeof entry === 'number' && Number.isFinite(entry) && entry > 0 && entry <= 12_000
      ? Math.round(entry)
      : undefined
  return {
    id: input.id,
    ...(typeof input.alt === 'string' && input.alt.trim() ? { alt: input.alt.trim().slice(0, 120) } : {}),
    ...(dimension(input.width) ? { width: dimension(input.width) } : {}),
    ...(dimension(input.height) ? { height: dimension(input.height) } : {}),
    focalX: number(input.focalX, 100, 50),
    focalY: number(input.focalY, 100, 50),
    fit: input.fit === 'contain' ? 'contain' : 'cover',
  }
}

/** Upper bounds on a catalogue, high enough that no real shop is truncated:
 *  the live shop this was built against had 706 products on one shelf. */
const MAX_SECTIONS = 40
const MAX_ITEMS_PER_SECTION = 2000
/** A real option matrix is bounded; these caps stop a malformed payload from
 *  turning into an unbounded response while leaving legitimate catalogues
 *  (the 706-product shop included) untouched. */
const MAX_OPTION_GROUPS = 8
const MAX_OPTIONS_PER_GROUP = 20
const MAX_VARIANTS_PER_ITEM = 200

const MONEY_IN_COPY = /\$\s?\d/

/** Demo offers, minus any that promise a dollar price to a shop that is not a
 *  dollar shop. A generated demo build keeps the trade's sample copy. */
function seededOffers(
  vertical: { offers: { title: string; body: string }[] },
  currency: string | undefined,
  imported: boolean,
) {
  const dollars = !imported || currency === 'USD'
  return vertical.offers
    .filter((offer) => dollars || !MONEY_IN_COPY.test(`${offer.title} ${offer.body}`))
    .map((offer) => ({ ...offer }))
}

/** The demo loyalty reward, with its amount left out for other currencies. */
function seededLoyalty(
  vertical: { loyalty: { goal: number; reward: string } },
  currency: string | undefined,
  imported: boolean,
): { goal: number; reward: string } {
  if (!imported || currency === 'USD' || !MONEY_IN_COPY.test(vertical.loyalty.reward)) return { ...vertical.loyalty }
  return { goal: vertical.loyalty.goal, reward: 'Money off your next visit' }
}

/** Price provenance from a source or an owner. A value is only `validated`
 *  when the caller proved it; the sanitiser never upgrades the flag. */
function cleanPriceEvidence(input: unknown): PriceEvidence | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined
  const raw = input as Record<string, unknown>
  const method = (['json-ld', 'shopify-variant', 'microdata', 'meta', 'text', 'owner'] as const).find(
    (entry) => entry === raw.method,
  )
  if (!method) return undefined
  const source = String(raw.source ?? '').trim().slice(0, 300)
  if (!source) return undefined
  return {
    method,
    source,
    raw: String(raw.raw ?? '').trim().slice(0, 40),
    currency: /^[A-Z]{3}$/.test(String(raw.currency ?? '')) ? String(raw.currency) : '',
    validated: raw.validated === true,
    ...(typeof raw.variant === 'string' && raw.variant.trim()
      ? { variant: raw.variant.trim().slice(0, 60) }
      : {}),
  }
}

const FIELD_METHODS = [
  'structured-data',
  'embedded-json',
  'visible-text',
  'metadata',
  'json-ld',
  'shopify-variant',
  'microdata',
  'meta',
  'text',
  'og-image',
  'public-data',
  'owner',
] as const

/** A field origin supplied by a caller. Unlike price evidence, this record is
 *  per field; an invalid entry is dropped and re-derived rather than guessed. */
function cleanFieldProvenance(input: unknown): Partial<Record<MenuItemField, FieldProvenance>> | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined
  const out: Partial<Record<MenuItemField, FieldProvenance>> = {}
  for (const field of ['name', 'desc', 'price', 'image', 'availability'] as const) {
    const raw = (input as Record<string, unknown>)[field]
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const row = raw as Record<string, unknown>
    const source = (['website', 'owner', 'unverified'] as const).find((value) => value === row.source)
    if (!source) continue
    const confidence = (['verified', 'reported', 'unverified'] as const).find(
      (value) => value === row.confidence,
    )
    if (!confidence) continue
    const method = FIELD_METHODS.find((value) => value === row.method)
    const url = typeof row.url === 'string' && row.url.trim() ? row.url.trim().slice(0, 300) : undefined
    const at =
      typeof row.at === 'string' && Number.isFinite(Date.parse(row.at))
        ? new Date(row.at).toISOString()
        : undefined
    out[field] = {
      source,
      ...(method ? { method } : {}),
      ...(url ? { url } : {}),
      confidence,
      validated: source === 'owner' ? true : row.validated === true,
      ...(at ? { at } : {}),
    }
  }
  return Object.keys(out).length ? out : undefined
}

const unverified = (): FieldProvenance => ({
  source: 'unverified',
  confidence: 'unverified',
  validated: false,
})

/** What each field can honestly claim from the row it belongs to. Name and
 *  description are page text; price and image carry their own evidence; a
 *  variant price is not proven by the parent product. */
function deriveFieldProvenance(item: MenuItem, sourceMethod?: MenuItem['sourceMethod']): Partial<Record<MenuItemField, FieldProvenance>> {
  const ownerFields = new Set(item.ownerFields ?? [])
  const source = item.sourceUrl
  const structured = sourceMethod === 'structured-data' || sourceMethod === 'embedded-json'
  const pageField = (value: string, owner: boolean): FieldProvenance =>
    owner
      ? { source: 'owner', method: 'owner', confidence: 'verified', validated: true }
      : source && value
        ? {
            source: 'website',
            ...(sourceMethod ? { method: sourceMethod } : {}),
            url: source,
            confidence: structured ? 'verified' : 'reported',
            validated: structured,
          }
        : unverified()
  const price = item.priceEvidence
  const image = item.image
  return {
    name: pageField(item.name, ownerFields.has('name')),
    desc: pageField(item.desc, ownerFields.has('desc')),
    price: ownerFields.has('price')
      ? { source: 'owner', method: 'owner', confidence: 'verified', validated: true }
      : price
        ? {
            source: 'website',
            method: price.method,
            url: price.source,
            confidence: price.validated ? 'verified' : 'reported',
            validated: price.validated,
          }
        : unverified(),
    image: item.media
      ? { source: 'owner', method: 'owner', confidence: 'verified', validated: true }
      : image
        ? {
            source: 'website',
            method: image.method ?? 'public-data',
            url: image.sourceUrl ?? image.url,
            confidence: image.method === 'structured-data' ? 'verified' : 'reported',
            validated: image.method === 'structured-data',
          }
        : unverified(),
    availability: item.variants?.some((variant) => variant.available !== undefined)
      ? { source: 'website', confidence: 'reported', validated: false }
      : unverified(),
  }
}

function cleanSnapshotText(value: unknown, limit: number): string | undefined {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)
  return text || undefined
}

/** A dated source reading. The one field that cannot be defaulted is `at`: a
 *  snapshot without a time is not evidence, so it is refused rather than
 *  stamped with the current moment. */
function cleanSourceSnapshot(input: unknown): SourceSnapshot | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined
  const row = input as Record<string, unknown>
  const at = typeof row.at === 'string' && Number.isFinite(Date.parse(row.at)) ? new Date(row.at).toISOString() : ''
  if (!at) return undefined
  const name = cleanSnapshotText(row.name, 60)
  const desc = cleanSnapshotText(row.desc, 400)
  const price = cleanSnapshotText(row.price, 40)
  const priceEvidence = cleanPriceEvidence(row.priceEvidence)
  if (!name && !desc && !price) return undefined
  return {
    ...(name ? { name } : {}),
    ...(desc ? { desc } : {}),
    ...(price ? { price } : {}),
    ...(priceEvidence ? { priceEvidence } : {}),
    at,
  }
}

/** The dated correction record. Bounded like every other stored list, and the
 *  choice stays within the two values the build can honour. */
function cleanSourceTrail(input: unknown): SourceTrail | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined
  const row = input as Record<string, unknown>
  const original = cleanSourceSnapshot(row.original)
  const latest = cleanSourceSnapshot(row.latest)
  const ownerAt =
    typeof row.ownerAt === 'string' && Number.isFinite(Date.parse(row.ownerAt))
      ? new Date(row.ownerAt).toISOString()
      : undefined
  const decisions = (Array.isArray(row.decisions) ? row.decisions : [])
    .slice(-20)
    .map((entry) => {
      const decision = (entry ?? {}) as Record<string, unknown>
      const field = (['name', 'desc', 'price'] as const).find((key) => key === decision.field)
      const choice = (['owner', 'source'] as const).find((key) => key === decision.choice)
      const at =
        typeof decision.at === 'string' && Number.isFinite(Date.parse(decision.at))
          ? new Date(decision.at).toISOString()
          : ''
      if (!field || !choice || !at) return null
      const ownerValue = cleanSnapshotText(decision.ownerValue, 400)
      const sourceValue = cleanSnapshotText(decision.sourceValue, 400)
      return { field, choice, ...(ownerValue ? { ownerValue } : {}), ...(sourceValue ? { sourceValue } : {}), at }
    })
    .filter((entry): entry is NonNullable<SourceTrail['decisions']>[number] => entry !== null)
  if (!original && !latest && !ownerAt && !decisions.length) return undefined
  return {
    ...(original ? { original } : {}),
    ...(latest ? { latest } : {}),
    ...(ownerAt ? { ownerAt } : {}),
    ...(decisions.length ? { decisions } : {}),
  }
}

/** Catalogue edits arrive untyped from the browser or a scraped site and are
 *  clamped here, so a malformed item can never reach a rendered app. */
export function sanitizeMenu(input: unknown, keepNames?: Set<string>): MenuSection[] {
  const sections = Array.isArray(input) ? input : []
  return sections
    .slice(0, MAX_SECTIONS)
    .map((section) => {
      const source = section as { name?: unknown; items?: unknown }
      const items = Array.isArray(source.items) ? source.items : []
      const sectionName = String(source.name ?? '').trim().slice(0, 40) || 'Catalogue'
      const used = new Map<string, number>()
      return {
        name: sectionName,
        // A shelf is not a display window: every product the source lists is
        // kept. The customer app pages what it renders instead.
        items: items
          .slice(0, MAX_ITEMS_PER_SECTION)
          .map((item) => {
            const entry = item as {
              id?: unknown
              name?: unknown
              desc?: unknown
              price?: unknown
              tag?: unknown
              meta?: unknown
              capacity?: unknown
              vendor?: unknown
              sourceId?: unknown
              sourceUrl?: unknown
              sourceMethod?: unknown
              ownerFields?: unknown
              priceEvidence?: unknown
              sourcePriceEvidence?: unknown
              sourceTrail?: unknown
              fieldProvenance?: unknown
              media?: unknown
              image?: unknown
              variants?: unknown
              optionGroups?: unknown
            }
            const price =
              typeof entry.price === 'number' && Number.isFinite(entry.price)
                ? Math.max(0, Math.min(1_000_000, Math.round(entry.price)))
                : 0
            const itemName = String(entry.name ?? '').trim().slice(0, 60) || 'Item'
            // A supplied key is kept (it survives an owner reordering their
            // menu); otherwise it is derived from the section and name. Two
            // identically named products in one section stay distinguishable.
            const base =
              typeof entry.id === 'string' && ITEM_ID.test(entry.id) ? entry.id : itemKey(sectionName, itemName)
            const seen = (used.get(base) ?? 0) + 1
            used.set(base, seen)
            const id = seen === 1 ? base : `${base}_${seen}`
            const rawSource = typeof entry.sourceId === 'string' ? entry.sourceId.trim() : ''
            const sourceId = /^[A-Za-z0-9_:/.-]{1,120}$/.test(rawSource) ? rawSource : undefined
            const rawUrl = typeof entry.sourceUrl === 'string' ? entry.sourceUrl.trim() : ''
            const sourceUrl =
              rawUrl.length <= 300 && /^https?:\/\/[^\s"'<>]+$/i.test(rawUrl) ? rawUrl : undefined
            const sourceMethod = (['structured-data', 'embedded-json', 'visible-text', 'metadata'] as const).find(
              (method) => method === entry.sourceMethod,
            )
            const optionGroups = sanitizeOptionGroups(entry.optionGroups)
            const priceEvidence = cleanPriceEvidence(entry.priceEvidence)
            const sourcePriceEvidence = cleanPriceEvidence(entry.sourcePriceEvidence)
            const variants = sanitizeVariants(entry.variants, optionGroups, priceEvidence)
            const capacity = statedCapacity(entry.capacity, entry.meta, entry.desc)
            const ownerFields = (['name', 'desc', 'price'] as const).filter((field) =>
              Array.isArray(entry.ownerFields) && entry.ownerFields.includes(field),
            )
            const sourceTrail = cleanSourceTrail(entry.sourceTrail)
            const media = sanitizeItemMedia(entry.media)
            const image = sanitizeItemImage(entry.image)
            const row: MenuItem = {
              id,
              ...(ownerFields.length ? { ownerFields } : {}),
              ...(priceEvidence ? { priceEvidence } : {}),
              ...(sourcePriceEvidence ? { sourcePriceEvidence } : {}),
              ...(sourceTrail ? { sourceTrail } : {}),
              ...(sourceId ? { sourceId } : {}),
              ...(sourceUrl ? { sourceUrl } : {}),
              ...(sourceMethod ? { sourceMethod } : {}),
              name: itemName,
              desc: String(entry.desc ?? '').trim().slice(0, 400),
              price,
              tag: String(entry.tag ?? '').trim().slice(0, 12) || undefined,
              meta: String(entry.meta ?? '').trim().slice(0, 30) || undefined,
              ...(capacity ? { capacity } : {}),
              vendor: String(entry.vendor ?? '').trim().slice(0, 40) || undefined,
              ...(media ? { media } : {}),
              ...(image ? { image } : {}),
              ...(optionGroups.length ? { optionGroups } : {}),
              ...(variants.length ? { variants } : {}),
            }
            // A caller may have recorded field origins. Anything it did not
            // record is derived from this row's own evidence, never copied from
            // a sibling field or a record-level status.
            return {
              ...row,
              fieldProvenance: {
                ...deriveFieldProvenance(row, sourceMethod),
                ...(cleanFieldProvenance(entry.fieldProvenance) ?? {}),
              },
            }
          })
          // A name with no price, description or photograph is a navigation
          // label or a teaser ("Shop Now"), not a catalogue entry. Omitting it
          // is safer than putting an unexplained tile in front of a customer;
          // a real unpriced item still survives when it has any other evidence.
          .filter(
            (item) =>
              (item.name !== 'Item' || item.price > 0) &&
              (item.price > 0 ||
                item.desc.length > 0 ||
                Boolean(item.image || item.media) ||
                Boolean(item.variants?.length) ||
                keepNames?.has(item.name.toLowerCase())),
          ),
      }
    })
    .filter((section) => section.items.length > 0)
}

/** The options a source listed for one product. Each keeps its own price and
 *  currency, and the one the published price came from stays marked, so the
 *  catalogue is not flattened to a single unexplained figure. */
function sanitizeVariants(
  input: unknown,
  groups: { name: string; options: string[] }[],
  parentEvidence?: PriceEvidence,
): {
  id?: string
  name: string
  price: number
  currency?: string
  selected?: boolean
  values?: Record<string, string>
  available?: boolean
  media?: MenuItem['media']
}[] {
  if (!Array.isArray(input)) return []
  const groupNames = new Map(groups.map((group) => [group.name, new Set(group.options)]))
  const cleanValues = (value: unknown): Record<string, string> | undefined => {
    if (!value || typeof value !== 'object' || !groups.length) return undefined
    const out: Record<string, string> = {}
    for (const [name, option] of Object.entries(value as Record<string, unknown>)) {
      const allowed = groupNames.get(name)
      const text = typeof option === 'string' ? option.trim().slice(0, 30) : ''
      if (allowed && allowed.has(text)) out[name] = text
    }
    return Object.keys(out).length ? out : undefined
  }
  const selectedSeen = input.some(
    (entry) => entry && typeof entry === 'object' && (entry as Record<string, unknown>).selected === true,
  )
  return input.slice(0, MAX_VARIANTS_PER_ITEM).flatMap((raw) => {
    const entry = (raw ?? {}) as Record<string, unknown>
    const name = typeof entry.name === 'string' ? entry.name.trim().slice(0, 40) : ''
    const price = Number(entry.price)
    if (!name || !Number.isFinite(price) || price <= 0) return []
    const currency =
      typeof entry.currency === 'string' && /^[A-Z]{3}$/.test(entry.currency) ? entry.currency : undefined
    const rawId = typeof entry.id === 'string' ? entry.id.trim() : ''
    // Shopify may send a numeric id or a GraphQL gid; both are opaque identity
    // and are preserved rather than rewritten.
    const id = /^[A-Za-z0-9_:/.-]{1,120}$/.test(rawId) ? rawId : undefined
    return [
      {
        ...(id ? { id } : {}),
        name,
        price: Math.min(1_000_000, Math.round(price)),
        ...(currency ? { currency } : {}),
        // A default is meaningful only when the catalogue still marks one; the
        // first option is the fallback at render time.
        ...(selectedSeen && entry.selected === true ? { selected: true } : {}),
        ...(cleanValues(entry.values) ? { values: cleanValues(entry.values) } : {}),
        ...(entry.available === false ? { available: false } : {}),
        ...(sanitizeItemMedia(entry.media) ? { media: sanitizeItemMedia(entry.media) } : {}),
        fieldProvenance: {
          price: parentEvidence
            ? {
                source: 'website',
                method: parentEvidence.method,
                url: parentEvidence.source,
                confidence:
                  parentEvidence.validated && parentEvidence.variant === name ? 'verified' : 'reported',
                validated: parentEvidence.validated && parentEvidence.variant === name,
              }
            : unverified(),
          availability:
            entry.available === false
              ? { source: 'website', confidence: 'reported', validated: false }
              : unverified(),
          ...(cleanFieldProvenance(entry.fieldProvenance) ?? {}),
        },
      },
    ]
  })
}

/**
 * A logo image survives only as an absolute https image and a short, plain alt.
 * A relative path, a data URI or anything scriptable is dropped so the monogram
 * stays the fallback rather than a broken frame appearing in the header.
 */
export function cleanLogoImage(value: unknown): { url: string; alt?: string } | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const url = typeof record.url === 'string' ? record.url.trim() : ''
  if (!/^https:\/\/[^\s"'<>]{4,600}$/i.test(url)) return undefined
  const alt =
    typeof record.alt === 'string'
      ? record.alt.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
      : ''
  return { url, ...(alt ? { alt } : {}) }
}

/** What a website contributed to a build. Every field is optional: whatever the
 *  site did not state falls back to the trade's seeded copy. */
export type SiteInfo = {
  menu?: MenuSection[]
  /** The source's one-line description, cleaned by `buildSpec`. */
  tagline?: string
  /** The business's own logo; initials remain the fallback. */
  logoImage?: { url: string; alt?: string }
  category?: string
  /** Anything the site told us; `cleanDesign` fills in the rest. */
  design?: Partial<DesignKit>
  structure?: Partial<SiteStructure>
  story?: string
  hours?: string
  phone?: string
  address?: string
  email?: string
  website?: string
  currency?: string
  /** How the business receives an order, when the source or the owner stated
   *  it. Absent means the app may offer the trade's generic choice but must not
   *  quote a fee. */
  fulfilment?: AppSpec['fulfilment']
  /** The public statement the currency came from. */
  currencyEvidence?: { code: string; method: string; source: string; raw: string }
  /** Every distinct code the source declared; more than one is a conflict. */
  currencyCandidates?: { code: string; method: string; source: string; raw: string }[]
  /** The source declared more than one currency, so none was published. */
  currencyConflict?: boolean
  socials?: SocialLink[]
  /** Prices the page and the feed disagreed on, and the owner's answers. Kept
   *  on the build as a private review record, never rendered in the app. */
  priceConflicts?: PriceConflict[]
  priceDecisions?: PriceDecision[]
}

/** A free-text category, kept short and never markup. */
/**
 * SEO titles are not brand copy. A description written for a search result
 * often carries pipe separators, a call to action or a keyword list; the same
 * sentence under the hero reads like an advert, not like the business. Keep a
 * normal one-line promise, drop the metadata-shaped ones, and let the trade's
 * neutral tagline be absent rather than inventing a replacement.
 */
function cleanBrandTagline(value: string, name: string): string {
  // Search snippets often end in an ellipsis or a dangling preposition. Cut
  // that tail rather than rejecting the useful part of a real description.
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90)
    .replace(/\s*(?:\.{3}|…).*$/, '')
    .replace(/\s+\b(?:at|and|with|the|of|for|in|on|to|by|from)\s*$/i, '')
    .replace(/[,;:|\-–—\s]+$/, '')
    .trim()
  if (!text) return ''
  const lower = text.toLowerCase()
  if (text.includes('|')) return ''
  if (/\b(official (website|site)|home ?page|welcome to|click here|free shipping|shop now|book now|order online|best .+ in .+)\b/.test(lower)) return ''
  // "Shop handcrafted…" is a real description. Reject command copy like
  // "Shop now", not every sentence that happens to open with the verb.
  if (/^(searching|looking|find|discover|book|order|buy|explore|browse)\b/.test(lower)) return ''
  if (/^shop\b.*\b(now|online|here)\b/.test(lower)) return ''
  if (/\?$/.test(text) && text.split(' ').length > 8) return ''
  if (name && lower.includes(name.trim().toLowerCase())) return ''
  if (text.split(' ').length > 12) return ''
  return text
}

/**
 * The same rule for the longer story block: a search-result sentence is not a
 * business story, and a 40-word keyword list under the hero is not an intro.
 * Keeping it empty is honest; the owner can write the real one.
 */
function cleanBrandStory(value: string, name: string): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 240)
  if (!text) return ''
  const lower = text.toLowerCase()
  if (text.includes('|') || /\.{3}|…$/.test(text)) return ''
  if (/\b(official (website|site)|home ?page|welcome to|click here|free shipping|shop now|book now|order online)\b/.test(lower)) return ''
  if (/^(searching|looking|find|discover|shop|book|order|buy|explore|browse)\b/.test(lower)) return ''
  if (/\?$/.test(text) && text.split(' ').length > 12) return ''
  if (text.split(' ').length > 45) return ''
  // A story that opens with the business name and then describes the offer is
  // legitimate copy. Only reject it when it repeats the name like a title tag.
  if (name && lower.startsWith(name.trim().toLowerCase()) && text.split(' ').length < 8) return ''
  return text
}

export function cleanCategory(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
}

/** Trailers from the project itself: http(s) only, three at most, and the
 *  trade's demo set is used only when the project supplied none. */
export function cleanVideos(input: VideoLink[] | undefined): VideoLink[] {
  return (input ?? [])
    .filter((video) => typeof video?.url === 'string' && /^https?:\/\//i.test(video.url))
    .slice(0, 3)
    .map((video) => ({
      label: String(video.label ?? '').trim().slice(0, 24) || 'Watch',
      url: video.url.slice(0, 200),
    }))
}

function cleanSocials(input: SocialLink[] | undefined): SocialLink[] {
  return (input ?? [])
    .filter((social) => typeof social?.url === 'string' && /^https?:\/\//i.test(social.url))
    .slice(0, 5)
    .map((social) => ({
      label: String(social.label ?? 'Link').trim().slice(0, 20) || 'Link',
      url: social.url.trim().slice(0, 180),
    }))
}

export function buildSpec(input: {
  name: string
  vertical: VerticalId | string
  accent: string
  logo: string
  features: string[]
  tagline?: string
  custom?: string
  category?: string
  /** The read's own record, so evidence survives the crawl session. */
  sourceReview?: unknown
  /** Completed work, kept apart from services. */
  projects?: unknown
  /** Already validated by `cleanLayout`; stored so the build keeps the design
   *  the customer chose rather than a fresh deck slot. */
  layout?: LayoutChoice
  /** The direction the customer picked as a concept. Seeding only: the document
   *  it creates is the source of truth from then on. */
  direction?: string
  /** Trailers and clips the project supplied: one door in, cleaned below. */
  videos?: VideoLink[]
  /** A platform bundle to sell with the build, by id. */
  bundle?: string
  site?: SiteInfo
}): AppSpec {
  const vertical = verticalFor(input.vertical)
  const name = input.name.trim().slice(0, 60) || 'Your business'
  const requested = input.features.length ? input.features : vertical.features
  const site = input.site ?? {}
  // Only a currency this build can actually format is published; anything else
  // is treated as no currency at all rather than printed beside an amount.
  const askedCurrency = String(site.currency ?? '').toUpperCase()
  const currencyCode = /^[A-Z]{3}$/.test(askedCurrency) && CURRENCY_SYMBOLS[askedCurrency]
    ? askedCurrency
    : undefined
  const logoImage = cleanLogoImage(site.logoImage)
  const importedMenu = sanitizeMenu(site.menu)
  // A site import is evidence-based. Missing contact details, offers, team and
  // catalogue stay missing; the trade's demo copy is for a new, empty project,
  // never a stand-in fact in an app that claims to come from someone's site.
  const imported = Boolean(site.website)
  const sourceTagline = cleanBrandTagline(
    typeof (site as { tagline?: unknown }).tagline === 'string'
      ? (site as { tagline: string }).tagline
      : '',
    name,
  )
  const sourceStory = cleanBrandStory(
    typeof (site as { story?: unknown }).story === 'string' ? (site as { story: string }).story : '',
    name,
  )
  const category = cleanCategory(input.category ?? site.category)
  const design = cleanDesign(site.design)
  const structure = cleanStructure(site.structure)
  const direction = directionsFor(vertical.id).find((entry) => entry.id === input.direction)?.id
  const videos = cleanVideos(input.videos)
  const bundle = BUNDLES.find((entry) => entry.id === input.bundle)?.id
  const sourceReview = sanitizeSourceReview(input.sourceReview, vertical.id)
  const projects: ProjectEntry[] = sanitizeProjects(input.projects)
  return {
    name,
    kind: category || vertical.kind,
    tagline: (input.tagline || sourceTagline || (imported ? '' : vertical.tagline)).slice(0, 90),
    story: sourceStory || (imported ? '' : vertical.story),
    accent: sanitizeHex(input.accent, vertical.accent),
    logo: sanitizeLogo(input.logo, initialsFor(name)),
    ...(logoImage ? { logoImage } : {}),
    hours: (site.hours?.trim() || (imported ? '' : vertical.hours)).slice(0, 90),
    phone: (site.phone?.trim() || (imported ? '' : vertical.phone)).slice(0, 24),
    address: (site.address?.trim() || (imported ? '' : vertical.address)).slice(0, 60),
    vertical: vertical.id,
    actions: actionLabelsFor(vertical.id, vertical.vocab),
    features: normalizeFeatures(requested),
    menu: importedMenu.length ? importedMenu : imported ? [] : copyMenu(vertical.menu),
    ...(site.website && importedMenu.length
      ? {
          importSummary: {
            source: site.website.slice(0, 120),
            importedAt: new Date().toISOString(),
            products: importedMenu.reduce((total, section) => total + section.items.length, 0),
            withImage: importedMenu.reduce(
              (total, section) =>
                total + section.items.filter((item) => Boolean(item.image || item.media)).length,
              0,
            ),
            priced: importedMenu.reduce(
              (total, section) => total + section.items.filter((item) => item.price > 0).length,
              0,
            ),
            currency: site.currency && /^[A-Z]{3}$/.test(site.currency) ? site.currency : '',
            categories: importedMenu.slice(0, 12).map((section) => section.name),
          },
        }
      : {}),
    // The trade's demo copy prices things in dollars. A shop that charges in
    // another currency never inherits a dollar figure it did not write, so a
    // dollar-priced sample offer is left out and a dollar-priced sample reward
    // becomes a reward without an amount.
    offers: imported ? [] : seededOffers(vertical, currencyCode, false),
    loyalty: imported ? { goal: 0, reward: '' } : seededLoyalty(vertical, currencyCode, false),
    sampleContent: {
      menu: !imported && importedMenu.length === 0,
      // An imported build never carries the trade's sample contact or story,
      // even when the site was silent about one of them. A missing field stays
      // missing; marking the rest as a sample would misstate what is real.
      contact: !imported && (!site.hours?.trim() || !site.phone?.trim() || !site.address?.trim()),
      story: !imported && !site.story?.trim(),
      offers: !imported,
      team: !imported && Boolean(vertical.team?.length),
      staff: !imported && Boolean(vertical.staff?.length),
      tagline: !imported && !input.tagline && !sourceTagline,
    },
    ...(!imported && vertical.staff?.length ? { staff: [...vertical.staff] } : {}),
    ...(!imported && vertical.team?.length ? { team: vertical.team.map((person) => ({ ...person })) } : {}),
    custom: (input.custom ?? '').trim().slice(0, 600),
    ...(input.layout ? { layout: input.layout } : {}),
    ...(direction ? { direction } : {}),
    ...(category ? { category } : {}),
    ...(design ? { design } : {}),
    ...(structure ? { structure } : {}),
    ...(site.website && /^https?:\/\//i.test(site.website)
      ? { website: site.website.slice(0, 120) }
      : {}),
    ...(site.email?.trim() ? { email: site.email.trim().slice(0, 80) } : {}),
    // The trade's fulfilment words are a capability, not a claim about this
    // business, so they are labelled as the default until the source or the
    // owner supplies its own options.
    fulfilment: site.fulfilment ?? { options: [...vertical.vocab.fulfilment], source: 'default' },
    ...(sourceReview ? { sourceReview } : {}),
    ...(projects.length ? { projects } : {}),
    ...(currencyCode ? { currency: currencyCode } : {}),
    ...(currencyCode && site.currencyEvidence && site.currencyEvidence.code === currencyCode
      ? {
          currencySource: {
            code: site.currencyEvidence.code,
            method: String(site.currencyEvidence.method ?? '').slice(0, 24),
            source: String(site.currencyEvidence.source ?? '').slice(0, 160),
            raw: String(site.currencyEvidence.raw ?? '').slice(0, 120),
          },
        }
      : {}),
    ...(Array.isArray(site.currencyCandidates) && site.currencyCandidates.length
      ? {
          currencyCandidates: site.currencyCandidates
            .filter((entry) => /^[A-Z]{3}$/.test(String(entry.code ?? '')))
            .slice(0, 6)
            .map((entry) => ({
              code: entry.code,
              method: String(entry.method ?? '').slice(0, 24),
              source: String(entry.source ?? '').slice(0, 160),
              raw: String(entry.raw ?? '').slice(0, 120),
            })),
        }
      : {}),
    ...(cleanSocials(site.socials).length ? { socials: cleanSocials(site.socials) } : {}),
    ...(videos.length ? { videos } : {}),
    ...(bundle ? { bundle } : {}),
    ...(site.priceConflicts?.length || site.priceDecisions?.length
      ? {
          review: {
            conflicts: site.priceConflicts ?? [],
            decisions: site.priceDecisions ?? [],
          },
        }
      : {}),
  }
}

/** The vertical a spec belongs to, tolerant of specs saved before verticals. */
export function verticalOf(spec: { vertical?: string }): VerticalId {
  return verticalFor(spec.vertical).id
}

export function defaultFeaturesFor(vertical: string): FeatureId[] {
  return normalizeFeatures(VERTICALS[verticalFor(vertical).id].features)
}
