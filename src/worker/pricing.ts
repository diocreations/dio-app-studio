import type {
  AppSpec,
  BundleId,
  FeatureId,
  LayoutChoice,
  MenuItem,
  MenuSection,
  Platform,
  Plan,
  SocialLink,
  VerticalId,
  VideoLink,
} from './types'
import { cleanDesign, cleanStructure, type DesignKit, type SiteStructure } from './design'
export type { DesignKit }
import { VERTICALS, verticalFor } from './verticals'

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
function amount(cents: number): string {
  const abs = Math.abs(Math.round(cents))
  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const pence = abs % 100
  return `${cents < 0 ? '−' : ''}${whole}${pence ? `.${String(pence).padStart(2, '0')}` : ''}`
}

export function money(cents: number): string {
  return `$${amount(cents)}`
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
export function inkFor(hex: string): string {
  const value = hex.replace('#', '')
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.62 ? '#1a1410' : '#fffaf3'
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
  return {
    url,
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(alt ? { alt } : {}),
    ...(method ? { method } : {}),
    source: 'website',
  }
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

/** Catalogue edits arrive untyped from the browser or a scraped site and are
 *  clamped here, so a malformed item can never reach a rendered app. */
export function sanitizeMenu(input: unknown): MenuSection[] {
  const sections = Array.isArray(input) ? input : []
  return sections
    .slice(0, 12)
    .map((section) => {
      const source = section as { name?: unknown; items?: unknown }
      const items = Array.isArray(source.items) ? source.items : []
      return {
        name: String(source.name ?? '').trim().slice(0, 40) || 'Catalogue',
        items: items
          .slice(0, 30)
          .map((item) => {
            const entry = item as {
              name?: unknown
              desc?: unknown
              price?: unknown
              tag?: unknown
              meta?: unknown
              vendor?: unknown
              media?: unknown
              image?: unknown
            }
            const price =
              typeof entry.price === 'number' && Number.isFinite(entry.price)
                ? Math.max(0, Math.min(1_000_000, Math.round(entry.price)))
                : 0
            return {
              name: String(entry.name ?? '').trim().slice(0, 60) || 'Item',
              desc: String(entry.desc ?? '').trim().slice(0, 400),
              price,
              tag: String(entry.tag ?? '').trim().slice(0, 12) || undefined,
              meta: String(entry.meta ?? '').trim().slice(0, 30) || undefined,
              vendor: String(entry.vendor ?? '').trim().slice(0, 40) || undefined,
              ...(sanitizeItemMedia(entry.media) ? { media: sanitizeItemMedia(entry.media) } : {}),
              ...(sanitizeItemImage(entry.image) ? { image: sanitizeItemImage(entry.image) } : {}),
            }
          })
          .filter((item) => item.name !== 'Item' || item.price > 0),
      }
    })
    .filter((section) => section.items.length > 0)
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
  socials?: SocialLink[]
}

/** A free-text category, kept short and never markup. */
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
  /** Already validated by `cleanLayout`; stored so the build keeps the design
   *  the customer chose rather than a fresh deck slot. */
  layout?: LayoutChoice
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
  const logoImage = cleanLogoImage(site.logoImage)
  const importedMenu = sanitizeMenu(site.menu)
  const category = cleanCategory(input.category ?? site.category)
  const design = cleanDesign(site.design)
  const structure = cleanStructure(site.structure)
  const videos = cleanVideos(input.videos)
  const bundle = BUNDLES.find((entry) => entry.id === input.bundle)?.id
  return {
    name,
    kind: category || vertical.kind,
    tagline: (input.tagline || vertical.tagline).slice(0, 90),
    story: (site.story?.trim() || vertical.story).slice(0, 240),
    accent: sanitizeHex(input.accent, vertical.accent),
    logo: sanitizeLogo(input.logo, initialsFor(name)),
    ...(logoImage ? { logoImage } : {}),
    hours: (site.hours?.trim() || vertical.hours).slice(0, 90),
    phone: (site.phone?.trim() || vertical.phone).slice(0, 24),
    address: (site.address?.trim() || vertical.address).slice(0, 60),
    vertical: vertical.id,
    features: normalizeFeatures(requested),
    menu: importedMenu.length ? importedMenu : copyMenu(vertical.menu),
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
    offers: vertical.offers.map((offer) => ({ ...offer })),
    loyalty: { ...vertical.loyalty },
    sampleContent: {
      menu: importedMenu.length === 0,
      contact: !site.hours?.trim() || !site.phone?.trim() || !site.address?.trim(),
      story: !site.story?.trim(),
      offers: true,
      team: Boolean(vertical.team?.length),
      staff: Boolean(vertical.staff?.length),
      tagline: !input.tagline,
    },
    ...(vertical.staff?.length ? { staff: [...vertical.staff] } : {}),
    ...(vertical.team?.length ? { team: vertical.team.map((person) => ({ ...person })) } : {}),
    custom: (input.custom ?? '').trim().slice(0, 600),
    ...(input.layout ? { layout: input.layout } : {}),
    ...(category ? { category } : {}),
    ...(design ? { design } : {}),
    ...(structure ? { structure } : {}),
    ...(site.website && /^https?:\/\//i.test(site.website)
      ? { website: site.website.slice(0, 120) }
      : {}),
    ...(site.email?.trim() ? { email: site.email.trim().slice(0, 80) } : {}),
    ...(site.currency && /^[A-Z]{3}$/.test(site.currency) ? { currency: site.currency } : {}),
    ...(cleanSocials(site.socials).length ? { socials: cleanSocials(site.socials) } : {}),
    ...(videos.length ? { videos } : {}),
    ...(bundle ? { bundle } : {}),
  }
}

/** The vertical a spec belongs to, tolerant of specs saved before verticals. */
export function verticalOf(spec: { vertical?: string }): VerticalId {
  return verticalFor(spec.vertical).id
}

export function defaultFeaturesFor(vertical: string): FeatureId[] {
  return normalizeFeatures(VERTICALS[verticalFor(vertical).id].features)
}
