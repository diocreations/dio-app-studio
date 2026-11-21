import { sanitizeHex } from './pricing'
import { composeDoc } from './blueprints'
import { directionFor, directionsFor } from './directions'
import type { AppSpec, ElementShape } from './types'
import { themeFor } from './themes'
import { verticalFor } from './verticals'

/*
 * One structured document shared by generation, the editor, preview, the
 * published PWA and the exports. Version 2 models a mobile application: an
 * ordered set of screens, a navigation bar, an initial screen, and the content
 * sections inside each screen. Section and screen ids are stable, so selection,
 * drag targets, navigation links and undo snapshots survive edits.
 */

export type SectionKind =
  | 'hero'
  | 'featured'
  | 'offers'
  | 'loyalty'
  | 'visit'
  | 'story'
  | 'testimonials'
  | 'cta'
  | 'heading'
  | 'text'
  | 'button'
  | 'image'
  | 'banner'
  | 'productList'
  | 'search'
  | 'form'
  | 'gallery'
  | 'flagship'

export const SECTION_KINDS: readonly SectionKind[] = [
  'hero',
  'featured',
  'offers',
  'loyalty',
  'visit',
  'story',
  'testimonials',
  'cta',
  'heading',
  'text',
  'button',
  'image',
  'banner',
  'productList',
  'search',
  'form',
  'gallery',
  'flagship',
]

/**
 * The five flagship trades keep their own composition, but each visible block
 * is an ordinary document node. The variant chooses the trade-specific
 * presentation; the node itself supplies the stable id, words, image and
 * visibility that every editor surface already understands.
 */
export const FLAGSHIP_VARIANTS = [
  'dine-title',
  'dine-feature',
  'dine-actions',
  'dine-facts',
  'dine-note',
  'shop-search',
  'shop-title',
  'shop-products',
  'shop-all',
  'salon-title',
  'salon-dates',
  'salon-services',
  'salon-staff',
  'salon-action',
  'hotel-cover',
  'hotel-stay',
  'hotel-rooms',
  'hotel-facts',
  'pro-title',
  'pro-intro',
  'pro-team',
  'pro-index',
  'pro-actions',
  'pro-facts',
  'cafe-hero',
  'cafe-menu',
  'cafe-order',
  'cafe-reserve',
  'gym-hero',
  'gym-plans',
  'gym-timetable',
  'gym-trainers',
  'gym-join',
  'clinic-hero',
  'clinic-specialities',
  'clinic-doctors',
  'clinic-care',
  'clinic-privacy',
  'clinic-appointments',
  'property-hero',
  'property-search',
  'property-listings',
  'property-viewing',
  'property-enquire',
  'studio-hero',
  'studio-work',
  'studio-services',
  'studio-team',
  'studio-book',
  'trades-hero',
  'trades-jobs',
  'trades-proof',
  'trades-quote',
  'trades-area',
  'trades-book',
  'auto-hero',
  'auto-vehicle',
  'auto-jobs',
  'auto-slots',
  'auto-promise',
  'auto-quote',
  'ecom-hero',
  'ecom-drop',
  'ecom-products',
  'ecom-delivery',
  'ecom-rewards',
  'courses-hero',
  'courses-path',
  'courses-list',
  'courses-included',
  'courses-enrol',
  'finance-hero',
  'finance-disclosure',
  'finance-services',
  'finance-process',
  'finance-advisers',
  'finance-review',
  'c-hospital-hero',
  'c-hospital-departments',
  'c-hospital-visiting',
  'c-hospital-urgent',
  'c-plants-indoor-hero',
  'c-plants-indoor-shelf',
  'c-plants-indoor-care',
  'c-plants-indoor-help',
  'c-plants-outdoor-hero',
  'c-plants-outdoor-season',
  'c-plants-outdoor-stock',
  'c-plants-outdoor-visit',
  'c-tuition-hero',
  'c-tuition-subjects',
  'c-tuition-trial',
  'c-tuition-enquire',
  'c-school-hero',
  'c-school-term',
  'c-school-clubs',
  'c-school-events',
  'c-school-contact',
  'c-kindergarten-hero',
  'c-kindergarten-day',
  'c-kindergarten-sessions',
  'c-kindergarten-visit',
  'c-agency-hero',
  'c-agency-work',
  'c-agency-services',
  'c-agency-contact',
  'c-influencer-hero',
  'c-influencer-formats',
  'c-influencer-reach',
  'c-influencer-brief',
  'c-portfolio-hero',
  'c-portfolio-work',
  'c-portfolio-about',
  'c-portfolio-contact',
  'c-film-hero',
  'c-film-screenings',
  'c-film-cast',
  'c-film-stills',
  'c-film-book',
  'c-gallery-hero',
  'c-gallery-show',
  'c-gallery-works',
  'c-gallery-facts',
  'c-gallery-visit',
  'c-marketplace-hero',
  'c-marketplace-vendors',
  'c-marketplace-categories',
  'c-marketplace-delivery',
  'c-marketplace-shop',
  'offers',
] as const

export type FlagshipVariant = (typeof FLAGSHIP_VARIANTS)[number]

/** Screens the app shell knows how to render. */
export type ScreenKind =
  | 'home'
  | 'catalog'
  | 'search'
  | 'saved'
  | 'detail'
  | 'book'
  | 'quote'
  | 'more'
  | 'contact'
  | 'profile'
  | 'about'
  | 'custom'

export const SCREEN_KINDS: readonly ScreenKind[] = [
  'home',
  'catalog',
  'search',
  'saved',
  'detail',
  'book',
  'quote',
  'more',
  'contact',
  'profile',
  'about',
  'custom',
]

export type ScreenIcon =
  | 'home'
  | 'catalog'
  | 'bag'
  | 'calendar'
  | 'dots'
  | 'plus'
  | 'chevron'
  | 'phone'
  | 'search'
  | 'heart'
  | 'quote'

export type Breakpoint = 'desktop' | 'tablet' | 'mobile'

export type SectionStyle = {
  background?: string
  color?: string
  align?: 'left' | 'center'
  /** 0 none, 1 comfortable, 2 generous. */
  paddingY?: 0 | 1 | 2
  /** 0 square, 1 soft, 2 round. */
  radius?: 0 | 1 | 2
}

export type Responsive = { hideOn: Breakpoint[] }

/** A reference to a stored image, never a URL or credential. */
export type MediaRef = {
  id: string
  alt?: string
  /** Intrinsic pixels, so the first paint reserves the right space. */
  width?: number
  height?: number
  focalX?: number
  focalY?: number
  fit?: 'cover' | 'contain'
  aspect?: 'auto' | 'wide' | 'square' | 'portrait'
}

/**
 * One editable element inside a component. The key names a stable slot in the
 * rendered block (section, tag and ordinal), so an override survives a reload,
 * a rebuild and a reorder without a second component tree.
 *
 * Everything here is presentation except the navigation action: catalogue-bound
 * text and photographs are deliberately not overridable, so editing a card can
 * never rename a product or replace the photograph the catalogue owns.
 */
export type ElementStyle = {
  fontSize?: number
  weight?: number
  color?: string
  align?: 'left' | 'center' | 'right'
  lineHeight?: number
  width?: number
  height?: number
  padding?: number
  margin?: number
  gap?: number
  background?: string
  radius?: number
  shadow?: 'none' | 'soft' | 'strong'
  border?: number
  imageFit?: 'cover' | 'contain'
  focalX?: number
  focalY?: number
  aspect?: 'auto' | 'wide' | 'square' | 'portrait'
  /** Child arrangement for a container or card. */
  layout?: 'stack' | 'row' | 'grid'
  /** Percentage cropped from each edge with CSS object-view-box. */
  cropTop?: number
  cropRight?: number
  cropBottom?: number
  cropLeft?: number
}

export type NavIconName = ScreenIcon | 'none'

export type ElementConfig = {
  /** The owner's name for this element in the layer tree. */
  name?: string
  /** Replacement words. Ignored for catalogue-bound elements. */
  text?: string
  hidden?: boolean
  style?: ElementStyle
  /** A replacement photograph. Ignored for catalogue-owned images. */
  media?: MediaRef
  /** A destination for an element that already navigates. */
  action?: { screen: string }
  /** A copy of another slot's element, inserted beside it by the element layer. */
  duplicateOf?: string
  /** A copied descendant belongs to this copied container. */
  copyParent?: string
  /** For a copied container: source slot -> copied slot for every descendant. */
  copyTree?: Record<string, string>
  /** Deleted from the page. Unlike hidden, this is only reversible with undo. */
  removed?: boolean
  /** Order among this element's siblings. Applied after slots are named. */
  position?: number
  /** A library icon replacing a bottom-navigation glyph. */
  navIcon?: NavIconName
}

/** Business values a generated component copied from the specification. */
export type CopiedField = 'name' | 'tagline' | 'hours' | 'address'
export type Follows = { title?: CopiedField; text?: CopiedField }

export type DocNode = {
  id: string
  kind: SectionKind
  /** The reusable component this section is an instance of, when linked. */
  componentId?: string
  title?: string
  text?: string
  /** Set when the heading or words are a copy of a specification value rather
   *  than the owner's own writing. A copied value follows the business when it
   *  changes; anything the owner typed is left alone. */
  follows?: Follows
  cta?: { label: string; screen: string }
  /** Presentation inside a flagship composition. Never used by generic kinds. */
  variant?: FlagshipVariant
  /** How this component arranges its own children. Set by a blueprint so the
   *  same product data can read as a list, a grid or a filmstrip. */
  layout?: 'grid' | 'list' | 'strip' | 'split'
  /** The catalogue item this component features, by its stable item id. The
   *  component resolves the current name, description, price and photograph
   *  from the catalogue instead of keeping a copy that can go stale. */
  itemRef?: string
  media?: MediaRef
  style: SectionStyle
  responsive: Responsive
  hidden: boolean
  /** Why the app hid this section by itself. Only ever set for a component
   *  that draws nothing with the current business details; cleared the moment
   *  the owner shows it again or it has something to say. */
  hiddenBecause?: 'empty'
}

export type ScreenNode = {
  id: string
  kind: ScreenKind
  name: string
  icon: ScreenIcon
  /** In the bottom navigation. Only the first five visible entries render. */
  nav: boolean
  hidden: boolean
  sections: DocNode[]
}

/**
 * The owner's design choices. They live on the shared document, so the canvas,
 * the review link and the published app cannot drift apart. A direction is a
 * named visual system; the remaining fields are deliberate overrides.
 */
export type DocDesign = {
  direction?: string
  typography?: 'editorial' | 'modern' | 'compact'
  buttons?: ElementShape
  cards?: ElementShape
  nav?: 'bar' | 'floating' | 'dock'
  density?: 'cozy' | 'standard' | 'roomy'
}

export type Doc = {
  v: 2
  accent?: string
  design?: DocDesign
  /** Screen id the app opens on. */
  initialScreen: string
  screens: ScreenNode[]
  /** Element overrides, keyed by the stable slot the renderer tags. */
  elements?: Record<string, ElementConfig>
  /** Sections the owner saved to insert on more than one screen. */
  library?: ComponentLibraryEntry[]
}

/**
 * A reusable section. Instances carry `componentId`; the definition keeps the
 * same content and element overrides under a stable library id, so inserting
 * it never duplicates a product or a business identity.
 */
export type ComponentLibraryEntry = {
  id: string
  name: string
  section: DocNode
  elements?: Record<string, ElementConfig>
}

const SHAPE = (value: unknown): ElementShape | undefined =>
  value === 'square' || value === 'soft' || value === 'round' ? value : undefined

function sanitizeDesign(value: unknown, spec: AppSpec): DocDesign | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  const allowed = directionsFor(verticalFor(spec.vertical).id).map((entry) => entry.id)
  const direction =
    typeof raw.direction === 'string' && allowed.includes(raw.direction) ? raw.direction : undefined
  const typography =
    raw.typography === 'editorial' || raw.typography === 'modern' || raw.typography === 'compact'
      ? raw.typography
      : undefined
  const nav =
    raw.nav === 'bar' || raw.nav === 'floating' || raw.nav === 'dock' ? raw.nav : undefined
  const density =
    raw.density === 'cozy' || raw.density === 'standard' || raw.density === 'roomy'
      ? raw.density
      : undefined
  const design: DocDesign = {
    ...(direction ? { direction } : {}),
    ...(typography ? { typography } : {}),
    ...(SHAPE(raw.buttons) ? { buttons: SHAPE(raw.buttons) } : {}),
    ...(SHAPE(raw.cards) ? { cards: SHAPE(raw.cards) } : {}),
    ...(nav ? { nav } : {}),
    ...(density ? { density } : {}),
  }
  return Object.keys(design).length ? design : undefined
}

const KIND_LABEL: Record<SectionKind, string> = {
  hero: 'Hero',
  featured: 'Featured',
  offers: 'Offers',
  loyalty: 'Rewards',
  visit: 'Visit',
  story: 'Story',
  testimonials: 'Testimonials',
  cta: 'Call to action',
  heading: 'Heading',
  text: 'Text',
  button: 'Button',
  image: 'Image',
  banner: 'Banner',
  productList: 'Product list',
  search: 'Search',
  form: 'Contact form',
  gallery: 'Gallery',
  flagship: 'Featured block',
}

const SCREEN_LABEL: Record<ScreenKind, string> = {
  home: 'Home',
  catalog: 'Catalogue',
  search: 'Search',
  saved: 'Saved',
  detail: 'Details',
  book: 'Booking',
  quote: 'Enquiry',
  more: 'More',
  contact: 'Contact',
  profile: 'Profile',
  about: 'About',
  custom: 'Screen',
}

const SCREEN_ICON: Record<ScreenKind, ScreenIcon> = {
  home: 'home',
  catalog: 'catalog',
  search: 'search',
  saved: 'heart',
  detail: 'chevron',
  book: 'calendar',
  quote: 'quote',
  more: 'dots',
  contact: 'phone',
  profile: 'dots',
  about: 'quote',
  custom: 'dots',
}

const SECTION_ID = /^sec_[a-z0-9_-]{1,40}$/
const ITEM_REF = /^itm_[a-f0-9]{8,24}(_\d{1,2})?$/
const SCREEN_ID = /^scr_[a-z0-9_-]{1,40}$/
const SCREEN_TARGET = /^[a-z][a-z0-9_-]{0,30}$/
const CLAMP = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : ''

export function sectionLabel(kind: SectionKind): string {
  return KIND_LABEL[kind]
}

export function screenLabel(kind: ScreenKind): string {
  return SCREEN_LABEL[kind]
}

/** Default icon for a screen kind, used when the document has none. */
export function screenIconFor(kind: ScreenKind): ScreenIcon {
  return SCREEN_ICON[kind]
}

function defaultStyle(kind: SectionKind): SectionStyle {
  if (kind === 'cta' || kind === 'button') return { align: 'center', paddingY: 1, radius: 2 }
  if (kind === 'testimonials' || kind === 'heading') return { align: 'center', paddingY: 1 }
  return {}
}

function section(kind: SectionKind, extra: Partial<DocNode> = {}): DocNode {
  return {
    id: `sec_${kind}`,
    kind,
    style: defaultStyle(kind),
    responsive: { hideOn: [] },
    hidden: false,
    ...extra,
  }
}

function screen(kind: ScreenKind, extra: Partial<ScreenNode> = {}): ScreenNode {
  return {
    id: `scr_${kind}`,
    kind,
    name: SCREEN_LABEL[kind],
    icon: SCREEN_ICON[kind],
    nav: false,
    hidden: false,
    sections: [],
    ...extra,
  }
}

function seededOrder(spec: AppSpec, kinds: SectionKind[]): SectionKind[] {
  const order = spec.layout?.order
  if (order === 'offers') return ['offers', ...kinds.filter((kind) => kind !== 'offers')]
  if (order === 'visit') return ['visit', ...kinds.filter((kind) => kind !== 'visit')]
  if (order === 'rewards') return ['loyalty', ...kinds.filter((kind) => kind !== 'loyalty')]
  return kinds
}

function available(spec: AppSpec, kind: SectionKind): boolean {
  if (kind === 'hero' || kind === 'featured' || kind === 'visit') return true
  if (kind === 'offers') return spec.features.includes('offers') && spec.offers.length > 0
  if (kind === 'loyalty') return spec.features.includes('loyalty')
  if (kind === 'story') return Boolean(spec.story?.trim())
  return ['heading', 'text', 'button', 'image', 'banner', 'productList', 'search', 'form', 'gallery'].includes(kind)
}

/** Home content the seeded design would have produced. */
export function defaultHomeSections(spec: AppSpec): DocNode[] {
  const kinds: SectionKind[] = ['featured', 'offers', 'loyalty', 'visit', 'story']
  const present = seededOrder(spec, kinds).filter((kind) => available(spec, kind))
  for (const kind of kinds) {
    if (available(spec, kind) && !present.includes(kind)) present.push(kind)
  }
  const sections: DocNode[] = [section('hero', { title: spec.name, text: spec.tagline })]
  for (const kind of present) {
    if (kind === 'story') {
      sections.push(section('story', { title: 'Our story', text: spec.story }))
      continue
    }
    sections.push(section(kind))
  }
  return sections
}

/**
 * The app a build starts with: the home screen, the trade's catalogue, and the
 * feature screens that are actually usable, plus More for everything else.
 * Unsupported screens are never offered.
 */
export function docFromSpec(spec: AppSpec): Doc {
  const vertical = verticalFor(spec.vertical)
  const shell = themeFor(vertical.id).shell ?? 'standard'
  const features = spec.features
  const screens: ScreenNode[] = [
    screen('home', {
      name: shell === 'menu' ? 'Menu' : shell === 'listing' ? 'Explore' : 'Home',
      nav: true,
      sections: defaultHomeSections(spec),
    }),
    screen('catalog', {
      name: vertical.vocab.catalog,
      nav: true,
      sections: [],
    }),
    screen('search', { nav: false }),
    screen('saved', { nav: false }),
    screen('detail', { nav: false }),
    screen('more', { name: 'More', nav: true, sections: [] }),
  ]
  if (features.includes('ordering') || features.includes('delivery')) {
    // The cart itself is a sheet in the app; no separate screen is needed.
  }
  if (features.includes('booking') || features.includes('classes')) {
    screens.push(
      screen('book', { name: vertical.vocab.bookTitle, nav: true }),
    )
  }
  if (features.includes('quote')) screens.push(screen('quote', { nav: true }))
  const initial = screens.find((entry) => entry.kind === (shell === 'menu' || shell === 'listing' ? 'catalog' : 'home'))
  return {
    v: 2,
    accent: spec.accent,
    design: { direction: directionFor(vertical.id, spec.direction).id },
    initialScreen: initial?.id ?? 'scr_home',
    screens,
  }
}

/** The home screen, which always exists. */
function flagshipSection(variant: FlagshipVariant, extra: Partial<DocNode> = {}): DocNode {
  return section('flagship', {
    id: `sec_fx_${variant.replace(/-/g, '_')}`,
    variant,
    ...extra,
  })
}

/**
 * The starting document for a flagship build. The order is the trade's own
 * composition, not a generic stack: a restaurant opens on its identity and one
 * dish, a shop on search and products, a salon on dates and treatments, a hotel
 * on its cover and stay card, a professional on its practice statement. Every
 * block is a normal document node from birth, so from the first editor session
 * it can be selected, rewritten, photographed, reordered and hidden.
 */
export function flagshipDocFromSpec(spec: AppSpec): Doc {
  const doc = docFromSpec(spec)
  const first = spec.menu.flatMap((entry) => entry.items)[0]
  const hours = (spec.hours || '').split('·')[0].trim()
  const address = spec.address || ''
  const canBook = spec.features.includes('booking') || spec.features.includes('classes')
  const canQuote = spec.features.includes('quote')
  const bookingScreen = canBook ? 'scr_book' : 'scr_catalog'
  const quoteScreen = canQuote ? 'scr_quote' : 'scr_catalog'
  let sections: DocNode[] = []

  if (spec.vertical === 'restaurant') {
    sections = [
      flagshipSection('dine-title', { title: spec.name, text: spec.tagline }),
      // Only the dish's own words: placeholder copy written here would be saved
      // into the owner's document and read as a statement about their food.
      // The featured dish points at the catalogue item rather than copying its
      // name, so a re-import or a reorder cannot leave the home naming one dish
      // and describing another. Its own words are the owner's edit; the name
      // comes from the catalogue.
      flagshipSection('dine-feature', {
        ...(first?.id ? { itemRef: first.id } : { title: first?.name || 'The menu' }),
        ...(!first?.id && first?.desc ? { text: first.desc } : {}),
      }),
      flagshipSection('dine-actions', {
        title: 'See the menu',
        cta: { label: 'See the menu', screen: 'scr_catalog' },
      }),
    ]
  } else if (spec.vertical === 'shop') {
    sections = [
      flagshipSection('shop-search', { title: 'Search the collection' }),
      flagshipSection('shop-title', { title: spec.tagline }),
      flagshipSection('shop-products', { title: 'New in' }),
      flagshipSection('shop-all', {
        title: 'Browse everything',
        cta: { label: 'Browse everything', screen: 'scr_catalog' },
      }),
    ]
  } else if (spec.vertical === 'salon') {
    sections = [
      flagshipSection('salon-title', {
        title: spec.tagline,
        text: [spec.name, address].filter(Boolean).join(' · '),
      }),
      flagshipSection('salon-dates', { title: 'Choose a day' }),
      flagshipSection('salon-services', { title: 'Choose a treatment' }),
      flagshipSection('salon-staff', {
        text:
          spec.staff?.length && !spec.sampleContent?.team
            ? `With ${spec.staff.slice(0, 4).join(', ')}`
            : 'With the team',
      }),
      flagshipSection('salon-action', {
        title: 'Book an appointment',
        cta: { label: 'Book an appointment', screen: 'scr_book' },
      }),
    ]
  } else if (spec.vertical === 'hotel') {
    sections = [
      flagshipSection('hotel-cover', { title: spec.name, text: spec.tagline }),
      flagshipSection('hotel-stay', { title: 'View rooms' }),
      flagshipSection('hotel-rooms', { title: 'Rooms' }),
      flagshipSection('hotel-facts', {
        title: hours || 'Reception',
        text: [address, 'Check-in 15:00 · Check-out 11:00'].filter(Boolean).join(' · '),
      }),
    ]
  } else if (spec.vertical === 'cafe') {
    sections = [
      flagshipSection('cafe-hero', { title: spec.name, text: spec.tagline }),
      flagshipSection('cafe-menu', { title: 'From the counter' }),
      flagshipSection('cafe-order', {
        title: 'Takeaway, ready when you are',
        text: 'Order ahead and collect at the bar.',
        cta: { label: 'Start an order', screen: 'scr_catalog' },
      }),
      flagshipSection('cafe-reserve', {
        title: 'A table, held for you',
        text: hours ? `Kitchen open ${hours.toLowerCase()}` : 'Walk-ins always welcome.',
        cta: { label: 'Reserve a table', screen: bookingScreen },
      }),
    ]
  } else if (spec.vertical === 'gym') {
    sections = [
      flagshipSection('gym-hero', { title: spec.name, text: spec.tagline }),
      flagshipSection('gym-plans', { title: 'Memberships' }),
      flagshipSection('gym-timetable', { title: 'This week' }),
      flagshipSection('gym-trainers', { title: 'Your coaches' }),
      flagshipSection('gym-join', {
        title: 'Not sure where to start?',
        text: 'Tell us your goal and we will suggest the right plan.',
        cta: { label: 'Ask about membership', screen: quoteScreen },
      }),
    ]
  } else if (spec.vertical === 'clinic') {
    sections = [
      flagshipSection('clinic-hero', { title: spec.name, text: spec.tagline }),
      flagshipSection('clinic-specialities', { title: 'Specialities' }),
      flagshipSection('clinic-doctors', { title: 'The clinical team' }),
      flagshipSection('clinic-care', { title: 'How a visit works' }),
      flagshipSection('clinic-privacy', {
        title: 'Your information stays yours',
        text: 'We only ask for what we need to arrange your appointment. Please leave medical details out of this form; we will discuss them privately at the clinic.',
      }),
      flagshipSection('clinic-appointments', {
        title: 'Book an appointment',
        text: 'Choose a treatment and a time that suits you.',
        cta: { label: 'Book an appointment', screen: bookingScreen },
      }),
    ]
  } else if (spec.vertical === 'property') {
    sections = [
      flagshipSection('property-hero', { title: spec.name, text: spec.tagline }),
      flagshipSection('property-search', { title: 'Search homes' }),
      flagshipSection('property-listings', { title: 'On the market' }),
      flagshipSection('property-viewing', {
        title: 'See it for yourself',
        text: 'Viewings run Monday to Saturday, at the property.',
        cta: { label: 'Book a viewing', screen: bookingScreen },
      }),
      flagshipSection('property-enquire', {
        title: 'Thinking of selling?',
        text: 'A measured valuation, with the numbers explained in person.',
        cta: { label: 'Request a valuation', screen: quoteScreen },
      }),
    ]
  } else if (spec.vertical === 'studio') {
    sections = [
      flagshipSection('studio-hero', { title: spec.name, text: spec.tagline }),
      flagshipSection('studio-work', { title: 'Selected work' }),
      flagshipSection('studio-services', { title: 'Ways to work together' }),
      flagshipSection('studio-team', { title: 'The studio' }),
      flagshipSection('studio-book', {
        title: 'Start a project',
        text: 'Tell us what you are making. We will reply with availability and a clear quote.',
        cta: { label: 'Request a shoot brief', screen: quoteScreen },
      }),
    ]
  } else if (spec.vertical === 'trades') {
    sections = [
      flagshipSection('trades-hero', { title: spec.name, text: spec.tagline }),
      flagshipSection('trades-jobs', { title: 'What we fix' }),
      flagshipSection('trades-proof', {
        title: 'The promise',
        text: 'Fixed price agreed before work starts, twelve-month workmanship guarantee, and a clean floor when we leave.',
      }),
      flagshipSection('trades-quote', {
        title: 'Send a photo, get a price',
        text: 'Tell us what has gone wrong. We reply with a fixed price, usually within one working day.',
        cta: { label: 'Request a quote', screen: quoteScreen },
      }),
      flagshipSection('trades-area', {
        title: 'Where we work',
        text: address || 'Covering the whole city',
      }),
      flagshipSection('trades-book', {
        title: 'Book a call-out',
        text: 'Morning and afternoon visits, Monday to Saturday.',
        cta: { label: 'Book a call-out', screen: bookingScreen },
      }),
    ]
  } else if (spec.vertical === 'auto') {
    sections = [
      flagshipSection('auto-hero', { title: spec.name, text: spec.tagline }),
      flagshipSection('auto-vehicle', {
        title: 'What we look after',
        text: 'Petrol, diesel, hybrid and electric. Cars and light vans.',
      }),
      flagshipSection('auto-jobs', { title: 'Work & prices' }),
      flagshipSection('auto-slots', {
        title: 'Next available',
        text: 'Choose a slot and we confirm by phone the same day.',
        cta: { label: 'Book a slot', screen: bookingScreen },
      }),
      flagshipSection('auto-promise', { title: 'What a service includes' }),
      flagshipSection('auto-quote', {
        title: 'Not sure what it needs?',
        text: 'Describe the noise, the light or the warning. We will price the diagnosis before you book it in.',
        cta: { label: 'Get a quote', screen: quoteScreen },
      }),
    ]
  } else if (spec.vertical === 'ecommerce') {
    sections = [
      flagshipSection('ecom-hero', { title: spec.name, text: spec.tagline }),
      flagshipSection('ecom-drop', { title: 'New this week' }),
      flagshipSection('ecom-products', { title: 'The shelf' }),
      flagshipSection('ecom-delivery', {
        title: 'Packed and posted',
        text: 'Orders placed before 2pm leave the same working day. Collection is from the workshop, usually next day.',
      }),
      ...(spec.features.includes('loyalty')
        ? [flagshipSection('ecom-rewards', { title: 'Keep coming back' })]
        : []),
    ]
  } else if (spec.vertical === 'courses') {
    sections = [
      flagshipSection('courses-hero', { title: spec.name, text: spec.tagline }),
      flagshipSection('courses-path', { title: 'How a course runs' }),
      flagshipSection('courses-list', { title: 'Courses open now' }),
      flagshipSection('courses-included', { title: "What's included" }),
      flagshipSection('courses-enrol', {
        title: 'Start with the free lesson',
        text: 'Every course opens with a full lesson you can watch before you pay. No card, no sign-up.',
        cta: { label: 'Choose a course', screen: 'scr_catalog' },
      }),
    ]
  } else if (spec.vertical === 'finance') {
    sections = [
      flagshipSection('finance-hero', { title: spec.name, text: spec.tagline }),
      flagshipSection('finance-disclosure', {
        title: 'How we are paid',
        text: 'Ask how the adviser is paid and what the fee covers before you commit.',
      }),
      flagshipSection('finance-services', { title: 'Services & fees' }),
      flagshipSection('finance-process', { title: 'What a review looks like' }),
      flagshipSection('finance-advisers', { title: 'Your advisers' }),
      flagshipSection('finance-review', {
        title: 'Book a first meeting',
        text: 'Thirty minutes, no paperwork, no obligation. We will tell you if advice is not the right answer.',
        cta: { label: 'Book a meeting', screen: bookingScreen },
      }),
    ]
  } else if (spec.vertical === 'professional') {
    sections = [
      flagshipSection('pro-title', { title: spec.name, text: spec.tagline }),
      flagshipSection('pro-intro', { title: 'How we can help', text: spec.story }),
      flagshipSection('pro-team', { title: "The people you'll work with" }),
      flagshipSection('pro-index', { title: 'Services' }),
      flagshipSection('pro-actions', {
        title: spec.features.includes('booking') ? 'Book a consultation' : 'Send an enquiry',
        cta: {
          label: spec.features.includes('booking') ? 'Book a consultation' : 'Send an enquiry',
          screen: spec.features.includes('booking') ? 'scr_book' : 'scr_quote',
        },
      }),
      flagshipSection('pro-facts', {
        title: hours || 'Hours',
        text: address,
      }),
    ]
  } else if (spec.vertical === 'hospital') {
    sections = [
      flagshipSection('c-hospital-hero', { title: spec.name, text: spec.tagline }),
      flagshipSection('c-hospital-departments', { title: 'Departments & clinics' }),
      flagshipSection('c-hospital-visiting', {
        title: 'Visiting and clinics',
        text: hours ? `Visiting from ${hours.replace(/^[^0-9]*/, '').toLowerCase()}` : '',
      }),
      flagshipSection('c-hospital-urgent', {
        title: 'Need care today?',
        text: 'Walk-in clinics and the urgent treatment centre need no appointment.',
        cta: { label: 'Find a clinic', screen: 'scr_catalog' },
      }),
    ]
  } else if (spec.vertical === 'plants-indoor') {
    sections = [
      flagshipSection('c-plants-indoor-hero', { title: spec.name, text: spec.tagline }),
      flagshipSection('c-plants-indoor-shelf', { title: 'Easy care, in stock' }),
      flagshipSection('c-plants-indoor-care', {
        title: 'Light and water',
        text: 'Every plant here is chosen for a real flat: low light, radiators, a fortnight away.',
      }),
      flagshipSection('c-plants-indoor-help', {
        title: 'Not sure which plant?',
        text: 'Tell us the room and the light. We will answer with two or three that will live.',
        cta: { label: 'Ask about a plant', screen: 'scr_catalog' },
      }),
    ]
  } else if (spec.vertical === 'plants-outdoor') {
    sections = [
      flagshipSection('c-plants-outdoor-hero', { title: spec.name, text: spec.tagline }),
      flagshipSection('c-plants-outdoor-season', { title: 'Bare-root season' }),
      flagshipSection('c-plants-outdoor-stock', { title: 'Ready to plant' }),
      flagshipSection('c-plants-outdoor-visit', {
        title: 'At the nursery',
        text: [spec.hours, address].filter(Boolean).join(' · '),
        cta: { label: 'Plan a visit', screen: 'scr_catalog' },
      }),
    ]
  } else if (spec.vertical === 'tuition') {
    sections = [
      flagshipSection('c-tuition-hero', { title: spec.name, text: spec.tagline }),
      flagshipSection('c-tuition-subjects', { title: 'Subjects and groups' }),
      flagshipSection('c-tuition-trial', { title: 'Trial lessons' }),
      flagshipSection('c-tuition-enquire', {
        title: 'Ask about a place',
        text: 'Small groups, six to a table. Tell us the year group and the subject.',
        cta: { label: 'Book a trial lesson', screen: bookingScreen },
      }),
    ]
  } else if (spec.vertical === 'school') {
    sections = [
      flagshipSection('c-school-hero', { title: spec.name, text: spec.tagline }),
      flagshipSection('c-school-term', { title: 'Term dates' }),
      flagshipSection('c-school-clubs', { title: 'Clubs' }),
      flagshipSection('c-school-events', {
        title: 'This half term',
        text: 'Parents’ evenings and the winter fair are booked through the app.',
        cta: { label: 'Book a parents’ evening', screen: bookingScreen },
      }),
      flagshipSection('c-school-contact', { title: 'The school day', text: hours }),
    ]
  } else if (spec.vertical === 'kindergarten') {
    sections = [
      flagshipSection('c-kindergarten-hero', { title: spec.name, text: spec.tagline }),
      flagshipSection('c-kindergarten-day', { title: 'A day here', text: 'One room, eighteen children, and a garden with a mud kitchen.' }),
      flagshipSection('c-kindergarten-sessions', { title: 'Sessions and fees' }),
      flagshipSection('c-kindergarten-visit', {
        title: 'Book a visit',
        text: 'Come and see a morning. We will answer the funding and ratio questions plainly.',
        cta: { label: 'Book a visit', screen: bookingScreen },
      }),
    ]
  } else if (spec.vertical === 'agency') {
    sections = [
      flagshipSection('c-agency-hero', { title: spec.name, text: spec.tagline }),
      flagshipSection('c-agency-work', { title: 'Selected work' }),
      flagshipSection('c-agency-services', { title: 'What we do' }),
      flagshipSection('c-agency-contact', {
        title: 'Start with a conversation',
        text: 'The strategist who pitches the work is the one who does it.',
        cta: { label: 'Request a proposal', screen: quoteScreen },
      }),
    ]
  } else if (spec.vertical === 'influencer') {
    sections = [
      flagshipSection('c-influencer-hero', { title: spec.name, text: spec.tagline }),
      flagshipSection('c-influencer-formats', { title: 'Formats and rates' }),
      flagshipSection('c-influencer-reach', { title: 'Reach and turnaround', text: 'Three formats a month, shot and edited in-house.' }),
      flagshipSection('c-influencer-brief', {
        title: 'Request the rate card',
        text: 'Send the brief, the dates and the usage you need. Rates are per format.',
        cta: { label: 'Request the rate card', screen: quoteScreen },
      }),
    ]
  } else if (spec.vertical === 'portfolio') {
    sections = [
      flagshipSection('c-portfolio-hero', { title: spec.name, text: spec.tagline }),
      flagshipSection('c-portfolio-work', { title: 'Selected work' }),
      flagshipSection('c-portfolio-about', { title: 'About the studio', text: spec.story }),
      flagshipSection('c-portfolio-contact', {
        title: 'Start a project',
        text: 'A few lines about the work, the dates and the budget is plenty.',
        cta: { label: 'Start a project', screen: quoteScreen },
      }),
    ]
  } else if (spec.vertical === 'film') {
    sections = [
      flagshipSection('c-film-hero', { title: spec.name, text: spec.tagline }),
      flagshipSection('c-film-screenings', { title: 'Screenings' }),
      flagshipSection('c-film-cast', { title: 'Cast and crew' }),
      flagshipSection('c-film-stills', { title: 'Stills & posters' }),
      flagshipSection('c-film-book', {
        title: 'Book a screening',
        text: 'Q&A screenings with the director after the Friday show.',
        cta: { label: 'Book a screening', screen: bookingScreen },
      }),
    ]
  } else if (spec.vertical === 'gallery') {
    sections = [
      flagshipSection('c-gallery-hero', { title: spec.name, text: spec.tagline }),
      flagshipSection('c-gallery-show', { title: 'On view' }),
      flagshipSection('c-gallery-works', { title: 'Works on view' }),
      flagshipSection('c-gallery-facts', { title: 'Plan your visit', text: hours }),
      flagshipSection('c-gallery-visit', {
        title: 'Plan your visit',
        text: 'Private views are on Thursday evenings; members have the rooms to themselves on Sunday morning.',
        cta: { label: 'Book a viewing', screen: bookingScreen },
      }),
    ]
  } else if (spec.vertical === 'marketplace') {
    sections = [
      flagshipSection('c-marketplace-hero', { title: spec.name, text: spec.tagline }),
      flagshipSection('c-marketplace-vendors', { title: 'The shops' }),
      flagshipSection('c-marketplace-categories', { title: 'Categories' }),
      flagshipSection('c-marketplace-delivery', { title: 'Delivery and collection', text: hours }),
      flagshipSection('c-marketplace-shop', {
        title: 'One basket, any store',
        text: 'Order from several shops at once and track it to the door.',
        cta: { label: 'Shop the market', screen: 'scr_catalog' },
      }),
    ]
  }

  if (spec.features.includes('offers') && spec.offers.length)
    sections.push(flagshipSection('offers', { title: 'Right now' }))

  const home = homeScreen(doc)
  home.sections = sections
  home.hidden = false
  home.nav = true
  const names: Partial<Record<ScreenKind, string>> =
    spec.vertical === 'restaurant'
      ? { home: 'Dine', catalog: 'Menu', book: 'Reserve', more: 'Visit' }
      : spec.vertical === 'shop'
        ? { home: 'Home', catalog: 'Shop', more: 'More' }
        : spec.vertical === 'salon'
          ? { home: 'Home', catalog: 'Services', book: 'Book', more: 'Visit' }
          : spec.vertical === 'hotel'
            ? { home: 'Stay', catalog: 'Rooms', book: 'Dates', more: 'More' }
            : spec.vertical === 'cafe'
              ? { home: 'Café', catalog: 'Menu', book: 'Reserve', more: 'Visit' }
              : spec.vertical === 'gym'
                ? { home: 'Train', catalog: 'Plans', book: 'Classes', quote: 'Join', more: 'Visit' }
                : spec.vertical === 'clinic'
                  ? { home: 'Care', catalog: 'Services', book: 'Book', quote: 'Enquire', more: 'Visit' }
                  : spec.vertical === 'property'
                    ? { home: 'Homes', catalog: 'Listings', book: 'Viewings', quote: 'Enquire', more: 'Visit' }
                    : spec.vertical === 'studio'
                      ? { home: 'Work', catalog: 'Services', book: 'Book', quote: 'Enquire', more: 'Visit' }
                      : spec.vertical === 'trades'
                        ? { home: 'Home', catalog: 'Services', book: 'Call-out', quote: 'Quote', more: 'Contact' }
                        : spec.vertical === 'auto'
                          ? { home: 'Garage', catalog: 'Work', book: 'Book', quote: 'Quote', more: 'Visit' }
                          : spec.vertical === 'ecommerce'
                            ? { home: 'Shop', catalog: 'Browse', more: 'Visit' }
                            : spec.vertical === 'courses'
                              ? { home: 'Learn', catalog: 'Courses', more: 'More' }
                              : spec.vertical === 'finance'
                                ? { home: 'Advice', catalog: 'Services', book: 'Meeting', quote: 'Enquiry', more: 'Contact' }
                                : { home: 'Home', catalog: 'Services', book: 'Consult', quote: 'Enquire', more: 'Contact' }
  for (const screen of doc.screens) {
    const name = names[screen.kind]
    if (name) screen.name = name
  }
  // Booking belongs beside the catalogue, before the More screen, so the tab
  // order follows the customer journey rather than insertion order.
  const book = doc.screens.findIndex((screen) => screen.kind === 'book')
  const more = doc.screens.findIndex((screen) => screen.kind === 'more')
  if (book > -1 && more > -1 && book > more) {
    const [entry] = doc.screens.splice(book, 1)
    doc.screens.splice(more, 0, entry)
  }
  // Quote-led trades put the enquiry tab before Visit, so the five visible
  // tabs follow the customer journey rather than document insertion order.
  const quote = doc.screens.findIndex((screen) => screen.kind === 'quote')
  const visit = doc.screens.findIndex((screen) => screen.kind === 'more')
  if (quote > -1 && visit > -1 && quote > visit && ['trades', 'auto', 'finance'].includes(spec.vertical)) {
    const [entry] = doc.screens.splice(quote, 1)
    doc.screens.splice(visit, 0, entry)
  }
  doc.initialScreen = home.id
  return composeDoc(spec, followCopies(doc, spec))
}

export function homeScreen(doc: Doc): ScreenNode {
  return doc.screens.find((entry) => entry.kind === 'home') ?? doc.screens[0]
}

export function homeSections(doc: Doc | null): DocNode[] {
  return doc ? homeScreen(doc).sections : []
}

export function screenFor(doc: Doc | null, kind: ScreenKind): ScreenNode | undefined {
  return doc?.screens.find((entry) => entry.kind === kind)
}

export function screenById(doc: Doc | null, id: string): ScreenNode | undefined {
  return doc?.screens.find((entry) => entry.id === id)
}

/** Visible screens in navigation order, capped at what a tab bar can hold. */
export function navScreens(doc: Doc | null): ScreenNode[] {
  return (doc?.screens ?? []).filter((entry) => entry.nav && !entry.hidden && entry.kind !== 'detail').slice(0, 5)
}

/** The DOM screen id used by the app shell. */
export function appScreenId(screen: ScreenNode): string {
  return screen.kind === 'contact' || screen.kind === 'profile' || screen.kind === 'about' || screen.kind === 'custom'
    ? screen.id
    : screen.kind
}

export function initialAppScreen(doc: Doc | null): string {
  if (!doc) return 'home'
  const selected = doc.screens.find((entry) => entry.id === doc.initialScreen) ?? homeScreen(doc)
  return appScreenId(selected)
}

function sanitizeSection(value: unknown, fallbackId: string): DocNode | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const kind = SECTION_KINDS.includes(raw.kind as SectionKind) ? (raw.kind as SectionKind) : null
  if (!kind) return null
  const variant =
    kind === 'flagship' && FLAGSHIP_VARIANTS.includes(raw.variant as FlagshipVariant)
      ? (raw.variant as FlagshipVariant)
      : undefined
  if (kind === 'flagship' && !variant) return null
  const styleInput =
    raw.style && typeof raw.style === 'object' ? (raw.style as Record<string, unknown>) : {}
  const responsiveInput =
    raw.responsive && typeof raw.responsive === 'object'
      ? (raw.responsive as Record<string, unknown>)
      : {}
  const hideInput = responsiveInput.hideOn
  const hideOn = Array.isArray(hideInput)
    ? (['desktop', 'tablet', 'mobile'] as Breakpoint[]).filter((point) => hideInput.includes(point))
    : []
  const ctaInput = raw.cta && typeof raw.cta === 'object' ? (raw.cta as Record<string, unknown>) : null
  const ctaLabel = ctaInput ? CLAMP(ctaInput.label, 28) : ''
  const screenTarget = ctaInput ? CLAMP(ctaInput.screen, 31) : ''
  const align = styleInput.align === 'center' || styleInput.align === 'left' ? styleInput.align : undefined
  const paddingY = styleInput.paddingY === 0 || styleInput.paddingY === 1 || styleInput.paddingY === 2
    ? styleInput.paddingY
    : undefined
  const radius = styleInput.radius === 0 || styleInput.radius === 1 || styleInput.radius === 2
    ? styleInput.radius
    : undefined
  const id = typeof raw.id === 'string' && SECTION_ID.test(raw.id) ? raw.id : fallbackId
  const mediaInput = raw.media && typeof raw.media === 'object' ? (raw.media as Record<string, unknown>) : null
  const mediaId =
    mediaInput && typeof mediaInput.id === 'string' && /^med_[a-f0-9]{16,40}$/.test(mediaInput.id)
      ? mediaInput.id
      : ''
  const focal = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : undefined
  const dimension = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 12_000
      ? Math.round(value)
      : undefined
  const media: MediaRef | undefined = mediaId
    ? {
        id: mediaId,
        ...(CLAMP(mediaInput?.alt, 120) ? { alt: CLAMP(mediaInput?.alt, 120) } : {}),
        ...(dimension(mediaInput?.width) ? { width: dimension(mediaInput?.width) } : {}),
        ...(dimension(mediaInput?.height) ? { height: dimension(mediaInput?.height) } : {}),
        ...(focal(mediaInput?.focalX) !== undefined ? { focalX: focal(mediaInput?.focalX) } : {}),
        ...(focal(mediaInput?.focalY) !== undefined ? { focalY: focal(mediaInput?.focalY) } : {}),
        ...(mediaInput?.fit === 'cover' || mediaInput?.fit === 'contain' ? { fit: mediaInput.fit } : {}),
        ...(mediaInput?.aspect === 'auto' || mediaInput?.aspect === 'wide' || mediaInput?.aspect === 'square' || mediaInput?.aspect === 'portrait'
          ? { aspect: mediaInput.aspect }
          : {}),
      }
    : undefined
  return {
    id,
    kind,
    ...(variant ? { variant } : {}),
    ...(raw.layout === 'grid' || raw.layout === 'list' || raw.layout === 'strip' || raw.layout === 'split'
      ? { layout: raw.layout }
      : {}),
    ...(media ? { media } : {}),
    title: CLAMP(raw.title, 60) || undefined,
    text: CLAMP(raw.text, 600) || undefined,
    ...(ctaLabel && SCREEN_TARGET.test(screenTarget)
      ? { cta: { label: ctaLabel, screen: screenTarget } }
      : {}),
    ...(typeof raw.itemRef === 'string' && ITEM_REF.test(raw.itemRef) ? { itemRef: raw.itemRef } : {}),
    style: {
      ...(typeof styleInput.background === 'string'
        ? { background: sanitizeHex(styleInput.background, '') || undefined }
        : {}),
      ...(typeof styleInput.color === 'string'
        ? { color: sanitizeHex(styleInput.color, '') || undefined }
        : {}),
      ...(align ? { align } : {}),
      ...(paddingY !== undefined ? { paddingY } : {}),
      ...(radius !== undefined ? { radius } : {}),
    },
    responsive: { hideOn },
    hidden: raw.hidden === true,
    ...(raw.hiddenBecause === 'empty' ? { hiddenBecause: 'empty' as const } : {}),
    ...(typeof raw.componentId === 'string' && /^cmp_[a-z0-9_-]{1,40}$/.test(raw.componentId)
      ? { componentId: raw.componentId }
      : {}),
  }
}

const ELEMENT_KEY = /^[a-z0-9_]{2,40}~(?:h[1-6]|p|span|img|button|a|div|nav|svg)~\d{1,3}(?:~c[a-z0-9]{4,12})?$/
const ELEMENT_TARGET = /^[a-z][a-z0-9_-]{0,30}$/
const whole = (value: unknown, min: number, max: number): number | undefined =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.round(value)))
    : undefined

function sanitizeElementStyle(value: unknown): ElementStyle | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  const colour = (input: unknown) =>
    typeof input === 'string' ? sanitizeHex(input, '') || undefined : undefined
  const lineHeight =
    typeof raw.lineHeight === 'number' && Number.isFinite(raw.lineHeight)
      ? Math.max(0.8, Math.min(2.4, Math.round(raw.lineHeight * 100) / 100))
      : undefined
  const crop = (input: Record<string, unknown>): ElementStyle | undefined => {
    const top = whole(input.cropTop, 0, 45)
    const right = whole(input.cropRight, 0, 45)
    const bottom = whole(input.cropBottom, 0, 45)
    const left = whole(input.cropLeft, 0, 45)
    if (top === undefined && right === undefined && bottom === undefined && left === undefined) return undefined
    const clean = { cropTop: top ?? 0, cropRight: right ?? 0, cropBottom: bottom ?? 0, cropLeft: left ?? 0 }
    // An object-view-box is inset from each side; more than 90% in one axis
    // leaves no image, so that crop is dropped instead of rendered broken.
    if (clean.cropTop + clean.cropBottom >= 90 || clean.cropLeft + clean.cropRight >= 90) return undefined
    return clean
  }
  const style: ElementStyle = {
    ...(whole(raw.fontSize, 8, 96) ? { fontSize: whole(raw.fontSize, 8, 96) } : {}),
    ...(whole(raw.weight, 100, 900) ? { weight: whole(raw.weight, 100, 900) } : {}),
    ...(colour(raw.color) ? { color: colour(raw.color) } : {}),
    ...(raw.align === 'left' || raw.align === 'center' || raw.align === 'right'
      ? { align: raw.align }
      : {}),
    ...(lineHeight ? { lineHeight } : {}),
    ...(whole(raw.width, 10, 100) ? { width: whole(raw.width, 10, 100) } : {}),
    ...(whole(raw.height, 8, 800) ? { height: whole(raw.height, 8, 800) } : {}),
    ...(whole(raw.padding, 0, 64) !== undefined ? { padding: whole(raw.padding, 0, 64) } : {}),
    ...(whole(raw.margin, 0, 64) !== undefined ? { margin: whole(raw.margin, 0, 64) } : {}),
    ...(whole(raw.gap, 0, 64) !== undefined ? { gap: whole(raw.gap, 0, 64) } : {}),
    ...(colour(raw.background) ? { background: colour(raw.background) } : {}),
    ...(whole(raw.radius, 0, 64) !== undefined ? { radius: whole(raw.radius, 0, 64) } : {}),
    ...(raw.shadow === 'none' || raw.shadow === 'soft' || raw.shadow === 'strong'
      ? { shadow: raw.shadow }
      : {}),
    ...(whole(raw.border, 0, 8) !== undefined ? { border: whole(raw.border, 0, 8) } : {}),
    ...(raw.imageFit === 'cover' || raw.imageFit === 'contain' ? { imageFit: raw.imageFit } : {}),
    ...(whole(raw.focalX, 0, 100) !== undefined ? { focalX: whole(raw.focalX, 0, 100) } : {}),
    ...(whole(raw.focalY, 0, 100) !== undefined ? { focalY: whole(raw.focalY, 0, 100) } : {}),
    ...(raw.aspect === 'auto' || raw.aspect === 'wide' || raw.aspect === 'square' || raw.aspect === 'portrait'
      ? { aspect: raw.aspect }
      : {}),
    ...(raw.layout === 'stack' || raw.layout === 'row' || raw.layout === 'grid' ? { layout: raw.layout } : {}),
    ...(crop(raw) ? crop(raw) : {}),
  }
  return Object.keys(style).length ? style : undefined
}

function sanitizeElementMedia(value: unknown): MediaRef | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  const id =
    typeof raw.id === 'string' && /^med_[a-f0-9]{16,40}$/.test(raw.id) ? raw.id : ''
  if (!id) return undefined
  const dimension = (input: unknown) => whole(input, 1, 12_000)
  const focal = (input: unknown) => whole(input, 0, 100)
  return {
    id,
    ...(CLAMP(raw.alt, 120) ? { alt: CLAMP(raw.alt, 120) } : {}),
    ...(dimension(raw.width) ? { width: dimension(raw.width) } : {}),
    ...(dimension(raw.height) ? { height: dimension(raw.height) } : {}),
    ...(focal(raw.focalX) !== undefined ? { focalX: focal(raw.focalX) } : {}),
    ...(focal(raw.focalY) !== undefined ? { focalY: focal(raw.focalY) } : {}),
    ...(raw.fit === 'contain' || raw.fit === 'cover' ? { fit: raw.fit } : {}),
    ...(raw.aspect === 'auto' || raw.aspect === 'wide' || raw.aspect === 'square' || raw.aspect === 'portrait'
      ? { aspect: raw.aspect }
      : {}),
  }
}

/** Bounded element overrides. A key that is not a renderer slot is dropped. */
function sanitizeElements(value: unknown): Record<string, ElementConfig> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const out: Record<string, ElementConfig> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(0, 400)) {
    if (!ELEMENT_KEY.test(key) || !entry || typeof entry !== 'object') continue
    const raw = entry as Record<string, unknown>
    const action =
      raw.action && typeof raw.action === 'object'
        ? (raw.action as Record<string, unknown>)
        : null
    const screen = action && typeof action.screen === 'string' ? action.screen.trim() : ''
    const duplicateOf = CLAMP(raw.duplicateOf, 80)
    const canCopy =
      duplicateOf && duplicateOf !== key && ELEMENT_KEY.test(duplicateOf) && !/~c[a-z0-9]{4,12}$/.test(duplicateOf)
    const copyParent = CLAMP(raw.copyParent, 80)
    const canAttach =
      canCopy && copyParent && copyParent !== key && copyParent !== duplicateOf && ELEMENT_KEY.test(copyParent) && /~c[a-z0-9]{4,12}$/.test(copyParent)
    const copyTree: Record<string, string> = {}
    const copiedSlots = new Set<string>()
    if (canCopy && raw.copyTree && typeof raw.copyTree === 'object' && !Array.isArray(raw.copyTree)) {
      for (const [from, to] of Object.entries(raw.copyTree as Record<string, unknown>).slice(0, 100)) {
        const target = typeof to === 'string' ? to : ''
        if (!ELEMENT_KEY.test(from) || !ELEMENT_KEY.test(target) || from === target) continue
        if (from === key || /~c[a-z0-9]{4,12}$/.test(from) || !/~c[a-z0-9]{4,12}$/.test(target)) continue
        if (copiedSlots.has(target)) continue
        copyTree[from] = target
        copiedSlots.add(target)
      }
    }
    const navIcon = raw.navIcon as NavIconName | undefined
    const config: ElementConfig = {
      ...(CLAMP(raw.name, 40) ? { name: CLAMP(raw.name, 40) } : {}),
      ...(typeof raw.text === 'string' && raw.text.trim()
        ? { text: raw.text.trim().slice(0, 300) }
        : {}),
      ...(raw.hidden === true ? { hidden: true } : {}),
      ...(raw.removed === true ? { removed: true } : {}),
      ...(whole(raw.position, 0, 999) !== undefined ? { position: whole(raw.position, 0, 999) } : {}),
      ...(canCopy ? { duplicateOf } : {}),
      ...(canAttach ? { copyParent } : {}),
      ...(canCopy && Object.keys(copyTree).length ? { copyTree } : {}),
      ...(['home', 'catalog', 'bag', 'calendar', 'dots', 'plus', 'chevron', 'phone', 'search', 'heart', 'quote', 'none'].includes(String(navIcon))
        ? { navIcon }
        : {}),
      ...(sanitizeElementStyle(raw.style) ? { style: sanitizeElementStyle(raw.style) } : {}),
      ...(sanitizeElementMedia(raw.media) ? { media: sanitizeElementMedia(raw.media) } : {}),
      ...(screen && ELEMENT_TARGET.test(screen) ? { action: { screen } } : {}),
    }
    if (Object.keys(config).length) out[key] = config
  }
  return Object.keys(out).length ? out : undefined
}

const COMPONENT_ID = /^cmp_[a-z0-9_-]{1,30}$/

/** Reusable definitions, bounded and stripped of any nested link. */
function sanitizeLibrary(value: unknown): ComponentLibraryEntry[] {
  if (!Array.isArray(value)) return []
  const entries: ComponentLibraryEntry[] = []
  const ids = new Set<string>()
  for (const entry of value.slice(0, 40)) {
    if (!entry || typeof entry !== 'object') continue
    const raw = entry as Record<string, unknown>
    const id = typeof raw.id === 'string' && COMPONENT_ID.test(raw.id) ? raw.id : ''
    if (!id || ids.has(id)) continue
    const section = sanitizeSection(raw.section, `sec_${id}`)
    if (!section || section.kind === 'hero') continue
    delete section.componentId
    const elements = sanitizeElements(raw.elements)
    const scoped = elements
      ? Object.fromEntries(
          Object.entries(elements).filter(([key]) => key.startsWith(section.id + '~')),
        )
      : {}
    ids.add(id)
    entries.push({
      id,
      name: CLAMP(raw.name, 40) || KIND_LABEL[section.kind],
      section,
      ...(Object.keys(scoped).length ? { elements: scoped } : {}),
    })
  }
  return entries
}

function sanitizeSections(value: unknown): DocNode[] {
  if (!Array.isArray(value)) return []
  const sections: DocNode[] = []
  const seen = new Set<string>()
  for (const [index, entry] of value.slice(0, 20).entries()) {
    const clean = sanitizeSection(entry, `sec_${index}`)
    if (!clean || seen.has(clean.id)) continue
    seen.add(clean.id)
    sections.push(clean)
  }
  return sections
}

function sanitizeScreen(value: unknown, spec: AppSpec, index: number): ScreenNode | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const kind = SCREEN_KINDS.includes(raw.kind as ScreenKind) ? (raw.kind as ScreenKind) : null
  if (!kind) return null
  const id = typeof raw.id === 'string' && SCREEN_ID.test(raw.id) ? raw.id : `scr_${index}`
  const fallback = screen(kind)
  return {
    id,
    kind,
    name: CLAMP(raw.name, 24) || fallback.name,
    icon: (['home', 'catalog', 'bag', 'calendar', 'dots', 'plus', 'chevron', 'phone', 'search', 'heart', 'quote'] as ScreenIcon[]).includes(
      raw.icon as ScreenIcon,
    )
      ? (raw.icon as ScreenIcon)
      : SCREEN_ICON[kind],
    nav: raw.nav === true,
    hidden: raw.hidden === true,
    sections: sanitizeSections(raw.sections),
  }
}

/**
 * Accepts any browser input and returns a safe application document. Known
 * screen and section kinds only, unique stable ids, bounded text, sanitised
 * colours, a home screen and a valid initial screen. Version-1 section-only
 * documents are lifted into the home screen of a full app.
 */
export function normalizeDoc(value: unknown, spec: AppSpec): Doc {
  const fallback = docFromSpec(spec)
  if (!value || typeof value !== 'object') return fallback
  const raw = value as Record<string, unknown>
  const accent = typeof raw.accent === 'string' ? sanitizeHex(raw.accent, '') || undefined : fallback.accent

  if (Array.isArray(raw.screens)) {
    const screens: ScreenNode[] = []
    const ids = new Set<string>()
    for (const [index, entry] of raw.screens.slice(0, 14).entries()) {
      const clean = sanitizeScreen(entry, spec, index)
      if (!clean || ids.has(clean.id)) continue
      ids.add(clean.id)
      screens.push(clean)
    }
    const home = screens.find((entry) => entry.kind === 'home')
    if (!home) screens.unshift(fallback.screens.find((entry) => entry.kind === 'home')!)
    else home.hidden = false
    const initial =
      screens.find((entry) => entry.id === raw.initialScreen && !entry.hidden) ??
      screens.find((entry) => entry.kind === 'home') ??
      screens[0]!
    const library = sanitizeLibrary(raw.library)
    const linked = new Set(library.map((entry) => entry.id))
    for (const screen of screens) {
      for (const node of screen.sections) {
        if (node.componentId && !linked.has(node.componentId)) delete node.componentId
      }
    }
    return followCopies(
      bindItemRefs(
        {
          v: 2,
          accent,
          design: sanitizeDesign(raw.design, spec),
          initialScreen: initial.id,
          screens,
          elements: sanitizeElements(raw.elements),
          ...(library.length ? { library } : {}),
        },
        spec,
      ),
      spec,
    )
  }

  // Version 1: one implicit screen holding the saved sections.
  const legacySections = Array.isArray(raw.sections) ? sanitizeSections(raw.sections) : []
  const screens = fallback.screens.map((entry) =>
    entry.kind === 'home' && legacySections.length ? { ...entry, sections: legacySections } : entry,
  )
  const library = sanitizeLibrary(raw.library)
  return followCopies(
    bindItemRefs(
      {
        v: 2,
        accent,
        design: sanitizeDesign(raw.design, spec) ?? fallback.design,
        initialScreen: fallback.initialScreen,
        screens,
        elements: sanitizeElements(raw.elements),
        ...(library.length ? { library } : {}),
      },
      spec,
    ),
    spec,
  )
}

/** Variants whose content is one catalogue record. */
const ITEM_BOUND: FlagshipVariant[] = ['dine-feature']

/**
 * Binds feature components to the catalogue. A component keeps the item it
 * names; a reference to an item that no longer exists is dropped so the block
 * falls back to its own words rather than silently featuring a different
 * product. Documents written before references existed are matched once by
 * name, which is the only evidence they carry.
 */
const FOLLOW_FIELDS: CopiedField[] = ['name', 'tagline', 'hours', 'address']

/**
 * Records where a generated heading or paragraph came from. The rule is exact
 * equality with a specification value: a component that says exactly what the
 * business says is a copy and may follow it, and a component the owner has
 * rewritten no longer matches, so it is never touched again.
 */
function followCopies(doc: Doc, spec: AppSpec): Doc {
  const source = (value: string | undefined): CopiedField | undefined => {
    const text = value?.trim()
    if (!text) return undefined
    return FOLLOW_FIELDS.find((field) => {
      const candidate = spec[field]
      return typeof candidate === 'string' && candidate.trim() === text
    })
  }
  return {
    ...doc,
    screens: doc.screens.map((screen) => ({
      ...screen,
      sections: screen.sections.map((node) => {
        if (!node.follows) {
          const title = node.kind === 'flagship' && !node.itemRef ? source(node.title) : undefined
          const text = node.kind === 'flagship' ? source(node.text) : undefined
          if (!title && !text) return node
          return { ...node, follows: { ...(title ? { title } : {}), ...(text ? { text } : {}) } }
        }
        return node
      }),
    })),
  }
}

export function bindItemRefs(doc: Doc, spec: AppSpec): Doc {
  const items = spec.menu.flatMap((section) => section.items).filter((item) => item.id)
  if (!items.length) return doc
  const byId = new Map(items.map((item) => [item.id as string, item]))
  const byName = new Map(items.map((item) => [item.name.trim().toLowerCase(), item]))
  let changed = false
  const screens = doc.screens.map((screen) => ({
    ...screen,
    sections: screen.sections.map((node) => {
      if (!node.variant || !ITEM_BOUND.includes(node.variant)) return node
      if (node.itemRef) {
        if (byId.has(node.itemRef)) return node
        changed = true
        const { itemRef: _dropped, ...rest } = node
        return rest
      }
      const match = node.title ? byName.get(node.title.trim().toLowerCase()) : undefined
      if (!match?.id) return node
      changed = true
      // The title was a copy of the item name, which the reference now
      // supplies. Dropping it means the block follows the catalogue; leaving
      // it would keep the stale name it was written with.
      const { title: _copied, ...rest } = node
      return { ...rest, itemRef: match.id }
    }),
  }))
  return changed ? { ...doc, screens } : doc
}

/** A screen id that is not in use yet. */
function nextScreenId(doc: Doc, kind: ScreenKind): string {
  const base = `scr_${kind}`
  if (!doc.screens.some((entry) => entry.id === base)) return base
  let index = 2
  while (doc.screens.some((entry) => entry.id === `${base}_${index}`)) index += 1
  return `${base}_${index}`
}

const SCREEN_DEFAULT_SECTIONS: Partial<Record<ScreenKind, (spec: AppSpec) => DocNode[]>> = {
  contact: (spec) => [
    section('heading', { title: 'Get in touch' }),
    section('text', { text: spec.address || 'Find us at the address on your receipt.' }),
    section('visit', { title: 'Opening hours' }),
    section('form', { title: 'Send a message' }),
  ],
  about: (spec) => [
    section('heading', { title: `About ${spec.name}` }),
    section('text', { text: spec.story || spec.tagline }),
    section('image', { title: spec.name }),
  ],
  profile: (spec) => [
    section('heading', { title: 'Your account' }),
    section('text', { text: `Orders, bookings and saved items for ${spec.name}.` }),
    section('button', { title: 'Contact us', cta: { label: 'Contact us', screen: 'scr_contact' } }),
  ],
  custom: () => [
    section('heading', { title: 'New screen' }),
    section('text', { text: 'Add words, images or a button from the left panel.' }),
  ],
}

export function addScreen(doc: Doc, kind: ScreenKind, spec: AppSpec): Doc {
  if (screenFor(doc, kind)) return doc
  const screenId = nextScreenId(doc, kind)
  const used = new Set(doc.screens.flatMap((entry) => entry.sections.map((sectionNode) => sectionNode.id)))
  const defaults = (SCREEN_DEFAULT_SECTIONS[kind]?.(spec) ?? []).map((sectionNode) => {
    // Section ids are global keys for element overrides and must look like
    // `sec_…`; a screen id is not a valid prefix.
    let id = `sec_${sectionNode.kind}`
    let suffix = 2
    while (used.has(id)) {
      id = `sec_${sectionNode.kind}_${suffix}`
      suffix += 1
    }
    used.add(id)
    return { ...sectionNode, id }
  })
  const entry = screen(kind, {
    id: screenId,
    nav: kind === 'contact' || kind === 'profile' || kind === 'about',
    sections: defaults,
  })
  // New feature screens belong beside the catalogue, not after More, so they
  // actually fit in the five-item tab bar.
  const screens = [...doc.screens]
  const more = screens.findIndex((item) => item.kind === 'more')
  screens.splice(more < 0 ? screens.length : more, 0, entry)
  return { ...doc, screens }
}

export function removeScreen(doc: Doc, id: string): Doc {
  const target = screenById(doc, id)
  if (!target || target.kind === 'home') return doc
  const screens = doc.screens.filter((entry) => entry.id !== id)
  const initial = screens.some((entry) => entry.id === doc.initialScreen)
    ? doc.initialScreen
    : homeScreen({ ...doc, screens }).id
  // A legacy document can repeat a section id across screens. Only drop a
  // record when no remaining screen still owns that id.
  const remainingIds = new Set(screens.flatMap((entry) => entry.sections.map((section) => section.id)))
  const removed = target.sections.map((entry) => entry.id).filter((id) => !remainingIds.has(id))
  const elements = doc.elements
    ? Object.fromEntries(Object.entries(doc.elements).filter(([key]) => !removed.some((section) => key.startsWith(section + '~'))))
    : undefined
  return { ...doc, screens, initialScreen: initial, ...(elements ? { elements } : {}) }
}

export function duplicateScreen(doc: Doc, id: string): Doc {
  const index = doc.screens.findIndex((entry) => entry.id === id)
  if (index < 0 || doc.screens[index].kind === 'home') return doc
  const source = doc.screens[index]
  const used = new Set(doc.screens.flatMap((entry) => entry.sections.map((section) => section.id)))
  // An older document may share a section id with another screen. Its element
  // records are ambiguous, so copy the content without claiming either side.
  const shared = new Set(
    doc.screens
      .filter((entry) => entry !== source)
      .flatMap((entry) => entry.sections.map((section) => section.id)),
  )
  const sectionMap = new Map<string, string>()
  source.sections.forEach((entry) => {
    let next = `${entry.id}_copy`
    let suffix = 2
    while (used.has(next)) {
      next = `${entry.id}_copy_${suffix}`
      suffix += 1
    }
    used.add(next)
    sectionMap.set(entry.id, next)
  })
  const clone: ScreenNode = {
    ...source,
    id: nextScreenId(doc, 'custom'),
    kind: 'custom',
    name: `${source.name} copy`.slice(0, 24),
    nav: false,
    sections: source.sections.map((entry) => {
      const next = { ...entry, id: sectionMap.get(entry.id)! }
      delete next.componentId
      return next
    }),
  }
  const screens = [...doc.screens]
  screens.splice(index + 1, 0, clone)
  const elements = doc.elements ? { ...doc.elements } : undefined
  if (elements) {
    const remap = (key: string) => {
      for (const [from, to] of sectionMap) {
        if (key.startsWith(from + '~')) return to + key.slice(from.length)
      }
      return key
    }
    for (const [from, to] of sectionMap) {
      if (shared.has(from)) continue
      for (const [key, entry] of Object.entries(doc.elements ?? {})) {
        if (!key.startsWith(from + '~')) continue
        const next = { ...entry }
        if (next.duplicateOf) next.duplicateOf = remap(next.duplicateOf)
        if (next.copyParent) next.copyParent = remap(next.copyParent)
        if (next.copyTree) {
          next.copyTree = Object.fromEntries(
            Object.entries(next.copyTree).map(([sourceKey, targetKey]) => [remap(sourceKey), remap(targetKey)]),
          )
        }
        elements[to + key.slice(from.length)] = next
      }
    }
  }
  return { ...doc, screens, ...(elements ? { elements } : {}) }
}

export function renameScreen(doc: Doc, id: string, name: string): Doc {
  return {
    ...doc,
    screens: doc.screens.map((entry) =>
      entry.id === id ? { ...entry, name: CLAMP(name, 24) || entry.name } : entry,
    ),
  }
}

export function moveScreen(doc: Doc, id: string, beforeId: string | null): Doc {
  const from = doc.screens.findIndex((entry) => entry.id === id)
  if (from < 0) return doc
  const moving = doc.screens[from]
  if (moving.kind === 'home') return doc
  const rest = doc.screens.filter((entry) => entry.id !== id)
  const at = beforeId ? rest.findIndex((entry) => entry.id === beforeId) : rest.length
  if (at < 0) return doc
  const first = rest[0]?.kind === 'home' ? 1 : 0
  rest.splice(Math.max(at, first), 0, moving)
  return { ...doc, screens: rest }
}

export function setScreenNav(doc: Doc, id: string, nav: boolean): Doc {
  const target = screenById(doc, id)
  if (!target || target.kind === 'detail') return doc
  return {
    ...doc,
    screens: doc.screens.map((entry) => (entry.id === id ? { ...entry, nav } : entry)),
  }
}

export function setInitialScreen(doc: Doc, id: string): Doc {
  const target = screenById(doc, id)
  if (!target) return doc
  return {
    ...doc,
    initialScreen: id,
    screens: doc.screens.map((entry) =>
      entry.id === id ? { ...entry, hidden: false } : entry,
    ),
  }
}

/** Content screens share their DOM id, so changing type never breaks a link. */
const CONTENT_SCREENS: ScreenKind[] = ['custom', 'contact', 'profile', 'about']

export function setScreenKind(doc: Doc, id: string, kind: ScreenKind): Doc {
  const target = screenById(doc, id)
  if (!target || !CONTENT_SCREENS.includes(kind) || target.kind === kind) return doc
  if (!CONTENT_SCREENS.includes(target.kind)) return doc
  if (kind !== 'custom' && doc.screens.some((entry) => entry.id !== id && entry.kind === kind)) return doc
  const defaultIcon = screenIconFor(target.kind)
  const icon = target.icon === defaultIcon ? screenIconFor(kind) : target.icon
  return {
    ...doc,
    screens: doc.screens.map((entry) => (entry.id === id ? { ...entry, kind, icon } : entry)),
  }
}

/** A hidden screen is kept, undoable and still editable, but never rendered. */
export function setScreenHidden(doc: Doc, id: string, hidden: boolean): Doc {
  const target = screenById(doc, id)
  // Only screens the document renderer owns can be withdrawn; built-in app
  // screens are part of the shell and would still be rendered.
  if (!target || !CONTENT_SCREENS.includes(target.kind)) return doc
  if (hidden && doc.initialScreen === id) return doc
  return {
    ...doc,
    screens: doc.screens.map((entry) => (entry.id === id ? { ...entry, hidden } : entry)),
  }
}

export function addSection(doc: Doc, screenId: string, kind: SectionKind, spec: AppSpec): Doc {
  const target = screenById(doc, screenId)
  if (!target || target.sections.some((entry) => entry.kind === kind)) return doc
  const defaults: Partial<Record<SectionKind, Partial<DocNode>>> = {
    testimonials: { title: 'Kind words', text: 'Loved by regulars. Add a review to show it here.' },
    cta: { title: 'Ready when you are', text: 'Start with a message, and we will take it from there.' },
    heading: { title: 'A new heading' },
    text: { text: 'A short paragraph that explains this screen.' },
    button: { title: 'Continue', cta: { label: 'Continue', screen: 'scr_home' } },
    image: { title: spec.name },
    banner: { title: spec.tagline },
    gallery: { title: 'Gallery' },
    form: { title: 'Send a message' },
  }
  return {
    ...doc,
    screens: doc.screens.map((entry) =>
      entry.id === screenId
        ? {
            ...entry,
            sections: [
              ...entry.sections,
              section(kind, { id: uniqueDocSectionId(doc, `sec_${kind}`), ...defaults[kind] }),
            ],
          }
        : entry,
    ),
  }
}

export function removeSection(doc: Doc, screenId: string, id: string): Doc {
  return {
    ...doc,
    screens: doc.screens.map((entry) =>
      entry.id === screenId
        ? { ...entry, sections: entry.sections.filter((node) => node.id !== id) }
        : entry,
    ),
  }
}

export function moveSection(doc: Doc, screenId: string, id: string, beforeId: string | null): Doc {
  const target = screenById(doc, screenId)
  if (!target) return doc
  const from = target.sections.findIndex((node) => node.id === id)
  if (from < 0) return doc
  const moving = target.sections[from]
  const rest = target.sections.filter((node) => node.id !== id)
  const at = beforeId ? rest.findIndex((node) => node.id === beforeId) : rest.length
  if (at < 0) return doc
  const first = rest[0]?.kind === 'hero' ? 1 : 0
  rest.splice(Math.max(at, first), 0, moving)
  return {
    ...doc,
    screens: doc.screens.map((entry) => (entry.id === screenId ? { ...entry, sections: rest } : entry)),
  }
}

/** Moves a component to another screen, keeping ids unique on the target. */
export function moveComponentToScreen(
  doc: Doc,
  fromScreenId: string,
  id: string,
  toScreenId: string,
): Doc {
  if (fromScreenId === toScreenId) return doc
  const from = screenById(doc, fromScreenId)
  const to = screenById(doc, toScreenId)
  if (!from || !to) return doc
  const node = from.sections.find((entry) => entry.id === id)
  if (!node || node.kind === 'hero') return doc
  let nextId = node.id
  let index = 2
  while (to.sections.some((entry) => entry.id === nextId)) {
    nextId = `${node.id}_${index}`
    index += 1
  }
  let elements = doc.elements
  if (nextId !== node.id && elements) {
    elements = { ...elements }
    for (const key of Object.keys(elements)) {
      if (key.startsWith(node.id + '~')) delete elements[key]
    }
    Object.assign(elements, remapElementRecords(doc.elements, node.id, nextId))
  }
  return {
    ...doc,
    // A moved component keeps its element overrides and its component link.
    ...(elements ? { elements } : {}),
    screens: doc.screens.map((entry) => {
      if (entry.id === fromScreenId)
        return { ...entry, sections: entry.sections.filter((section) => section.id !== id) }
      if (entry.id === toScreenId)
        return { ...entry, sections: [...entry.sections, { ...node, id: nextId }] }
      return entry
    }),
  }
}

const cloneJSON = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

/** Copy a section's element overrides under a new section id. */
function remapElementRecords(
  source: Record<string, ElementConfig> | undefined,
  fromId: string,
  toId: string,
): Record<string, ElementConfig> {
  const out: Record<string, ElementConfig> = {}
  if (!source) return out
  const move = (key: string) =>
    key.startsWith(fromId + '~') ? toId + key.slice(fromId.length) : key
  for (const [key, entry] of Object.entries(source)) {
    if (!key.startsWith(fromId + '~')) continue
    const next = cloneJSON(entry)
    if (next.duplicateOf) next.duplicateOf = move(next.duplicateOf)
    if (next.copyParent) next.copyParent = move(next.copyParent)
    if (next.copyTree) {
      next.copyTree = Object.fromEntries(
        Object.entries(next.copyTree).map(([from, to]) => [move(from), move(to)]),
      )
    }
    out[move(key)] = next
  }
  return out
}

function uniqueDocSectionId(doc: Doc, base: string): string {
  const used = new Set([
    ...doc.screens.flatMap((entry) => entry.sections.map((section) => section.id)),
    ...(doc.library ?? []).map((entry) => entry.section.id),
  ])
  let id = base
  let index = 2
  while (used.has(id)) {
    id = `${base}_${index}`
    index += 1
  }
  return id
}

/**
 * Saves the selected section as a reusable definition and links the source as
 * its first instance. Product refs, media ids and actions are copied verbatim;
 * a reusable section never creates a second catalogue item.
 */
export function saveSectionAsComponent(
  doc: Doc,
  screenId: string,
  sectionId: string,
  name?: string,
): Doc {
  const screen = screenById(doc, screenId)
  const source = screen?.sections.find((entry) => entry.id === sectionId)
  if (!source || source.kind === 'hero' || source.componentId) return doc
  const library = [...(doc.library ?? [])]
  const slug = source.kind.toLowerCase()
  let componentId = `cmp_${slug}`
  let suffix = 2
  while (library.some((entry) => entry.id === componentId)) {
    componentId = `cmp_${slug}_${suffix}`
    suffix += 1
  }
  const definitionId = uniqueDocSectionId(doc, `sec_${componentId}`)
  const definition = { ...cloneJSON(source), id: definitionId }
  delete definition.componentId
  const definitionElements = remapElementRecords(doc.elements, source.id, definitionId)
  const elements = { ...(doc.elements ?? {}), ...definitionElements }
  library.push({
    id: componentId,
    name: CLAMP(name, 40) || source.title || KIND_LABEL[source.kind],
    section: definition,
    ...(Object.keys(definitionElements).length ? { elements: definitionElements } : {}),
  })
  return {
    ...doc,
    library,
    elements,
    screens: doc.screens.map((entry) =>
      entry.id === screenId
        ? {
            ...entry,
            sections: entry.sections.map((section) =>
              section.id === sectionId ? { ...section, componentId } : section,
            ),
          }
        : entry,
    ),
  }
}

/** Inserts a linked instance of a saved component on another screen. */
export function insertComponent(
  doc: Doc,
  screenId: string,
  componentId: string,
  beforeId?: string,
): Doc {
  const target = screenById(doc, screenId)
  const entry = doc.library?.find((component) => component.id === componentId)
  if (!target || !entry) return doc
  const id = uniqueDocSectionId(doc, `sec_${entry.id}`)
  const instance = { ...cloneJSON(entry.section), id, componentId: entry.id }
  const sections = [...target.sections]
  const at = beforeId ? sections.findIndex((section) => section.id === beforeId) : -1
  sections.splice(at < 0 ? sections.length : at, 0, instance)
  const elements = {
    ...(doc.elements ?? {}),
    ...remapElementRecords(entry.elements, entry.section.id, id),
  }
  return {
    ...doc,
    elements,
    screens: doc.screens.map((screen) =>
      screen.id === screenId ? { ...screen, sections } : screen,
    ),
  }
}

/**
 * Applies the selected instance to the saved definition and to every linked
 * instance. Each instance keeps its own section id and element slots.
 */
export function syncComponentInstances(doc: Doc, screenId: string, sectionId: string): Doc {
  const source = screenById(doc, screenId)?.sections.find((section) => section.id === sectionId)
  const componentId = source?.componentId
  const entry = componentId
    ? doc.library?.find((component) => component.id === componentId)
    : undefined
  if (!source || !entry) return doc
  const linked = doc.screens.flatMap((screen) =>
    screen.sections.filter((section) => section.componentId === entry.id).map((section) => section.id),
  )
  const elements = { ...(doc.elements ?? {}) }
  for (const id of linked) {
    for (const key of Object.keys(elements)) {
      if (key.startsWith(id + '~')) delete elements[key]
    }
    Object.assign(elements, remapElementRecords(doc.elements, source.id, id))
  }
  const definitionId = entry.section.id
  const definitionElements = remapElementRecords(doc.elements, source.id, definitionId)
  for (const key of Object.keys(elements)) {
    if (key.startsWith(definitionId + '~')) delete elements[key]
  }
  Object.assign(elements, definitionElements)
  const definition = { ...cloneJSON(source), id: definitionId }
  delete definition.componentId
  return {
    ...doc,
    elements,
    library: (doc.library ?? []).map((component) =>
      component.id === entry.id
        ? {
            ...component,
            section: definition,
            ...(Object.keys(definitionElements).length ? { elements: definitionElements } : {}),
          }
        : component,
    ),
    screens: doc.screens.map((screen) => ({
      ...screen,
      sections: screen.sections.map((section) =>
        section.componentId === entry.id
          ? { ...cloneJSON(source), id: section.id, componentId: entry.id }
          : section,
      ),
    })),
  }
}

/** Keeps this copy's content and overrides, but stops it following the shared one. */
export function detachComponent(doc: Doc, screenId: string, sectionId: string): Doc {
  const target = screenById(doc, screenId)?.sections.find((section) => section.id === sectionId)
  if (!target?.componentId) return doc
  return {
    ...doc,
    screens: doc.screens.map((screen) =>
      screen.id === screenId
        ? {
            ...screen,
            sections: screen.sections.map((section) => {
              if (section.id !== sectionId) return section
              const next = { ...section }
              delete next.componentId
              return next
            }),
          }
        : screen,
    ),
  }
}

export function duplicateSection(doc: Doc, screenId: string, id: string): Doc {
  const target = screenById(doc, screenId)
  if (!target) return doc
  const index = target.sections.findIndex((node) => node.id === id)
  if (index < 0) return doc
  const source = target.sections[index]
  if (source.kind === 'hero') return doc
  const nextId = uniqueDocSectionId(doc, `sec_${source.kind}`)
  const copy: DocNode = {
    ...source,
    id: nextId,
    title: source.title ? `${source.title} (copy)` : source.title,
  }
  // A duplicate is independent: it must not silently follow the original.
  delete copy.componentId
  const sections = [...target.sections]
  sections.splice(index + 1, 0, copy)
  return {
    ...doc,
    elements: {
      ...(doc.elements ?? {}),
      ...remapElementRecords(doc.elements, source.id, nextId),
    },
    screens: doc.screens.map((entry) => (entry.id === screenId ? { ...entry, sections } : entry)),
  }
}

export function updateSection(
  doc: Doc,
  screenId: string,
  id: string,
  patch: Partial<Pick<DocNode, 'title' | 'text' | 'hidden' | 'style' | 'responsive' | 'cta' | 'media'>>,
): Doc {
  return {
    ...doc,
    screens: doc.screens.map((entry) =>
      entry.id === screenId
        ? {
            ...entry,
            sections: entry.sections.map((node) =>
              node.id === id
                ? {
                    ...node,
                    ...(patch.title !== undefined ? { title: CLAMP(patch.title, 60) || undefined } : {}),
                    ...(patch.text !== undefined ? { text: CLAMP(patch.text, 600) || undefined } : {}),
                    ...(patch.hidden !== undefined
                      ? { hidden: Boolean(patch.hidden), hiddenBecause: patch.hidden ? node.hiddenBecause : undefined }
                      : {}),
                    ...(patch.media !== undefined ? { media: patch.media } : {}),
                    ...(patch.cta
                      ? {
                          cta: {
                            label: CLAMP(patch.cta.label, 28) || 'Continue',
                            screen: SCREEN_TARGET.test(patch.cta.screen) ? patch.cta.screen : 'scr_home',
                          },
                        }
                      : {}),
                    ...(patch.style ? { style: { ...node.style, ...patch.style } } : {}),
                    ...(patch.responsive
                      ? {
                          responsive: {
                            hideOn: (['desktop', 'tablet', 'mobile'] as Breakpoint[]).filter((point) =>
                              patch.responsive?.hideOn?.includes(point),
                            ),
                          },
                        }
                      : {}),
                  }
                : node,
            ),
          }
        : entry,
    ),
  }
}

export type AiResult = { doc: Doc; summary: string }

/**
 * The on-device assistant. It understands a small, honest vocabulary of mobile
 * application instructions and edits the same document the editor and renderer
 * use. It costs nothing and cannot invent customer content; a hosted model can
 * replace this function behind the same signature later.
 */
export function applyCommand(doc: Doc, command: string, spec: AppSpec): AiResult {
  const text = command.trim().toLowerCase()
  if (!text) return { doc, summary: 'Type an instruction first.' }

  const palette: [RegExp, string, string][] = [
    [/\bpremium|luxur|elegant\b/, '#9a7b4f', 'A quieter, premium palette with warm gold.'],
    [/\bmodern|contemporary\b/, '#1f2937', 'A modern charcoal accent.'],
    [/\bwarm|cosy|cozy\b/, '#c05a33', 'A warmer terracotta accent.'],
    [/\bminimal|clean\b/, '#2f3a34', 'A restrained, minimal accent.'],
    [/\bbold|vibrant\b/, '#c22f5e', 'A bolder accent for the primary actions.'],
  ]
  for (const [pattern, accent, summary] of palette) {
    if (pattern.test(text)) return { doc: { ...doc, accent }, summary }
  }

  if (/testimonial|review/.test(text)) {
    return {
      doc: addSection(doc, homeScreen(doc).id, 'testimonials', spec),
      summary: 'Added a testimonials section to Home.',
    }
  }
  if (/contact screen|contact page|get in touch/.test(text)) {
    return { doc: addScreen(doc, 'contact', spec), summary: 'Added a Contact screen with navigation.' }
  }
  if (/profile|account screen/.test(text)) {
    return { doc: addScreen(doc, 'profile', spec), summary: 'Added a Profile screen.' }
  }
  if (/about screen|about page/.test(text)) {
    return { doc: addScreen(doc, 'about', spec), summary: 'Added an About screen.' }
  }
  if (/new screen|add a screen|add screen/.test(text)) {
    return { doc: addScreen(doc, 'custom', spec), summary: 'Added a blank screen to the app.' }
  }
  if (/bottom nav|tab bar|navigation/.test(text)) {
    const visible = doc.screens.filter((entry) => !entry.hidden && entry.kind !== 'detail')
    const screens = visible.map((entry, index) => ({
      ...entry,
      nav: index < 4 ? true : entry.nav,
    }))
    return {
      doc: { ...doc, screens: doc.screens.map((entry) => screens.find((next) => next.id === entry.id) ?? entry) },
      summary: 'Put the app’s main screens into the bottom navigation.',
    }
  }
  if (/booking flow|appointment/.test(text)) {
    const book = screenFor(doc, 'book')
    if (!book) return { doc, summary: 'This build does not have booking switched on.' }
    return {
      doc: { ...doc, screens: doc.screens.map((entry) => (entry.id === book.id ? { ...entry, nav: true, hidden: false } : entry)) },
      summary: 'Added Booking to the app navigation.',
    }
  }
  if (/product listing|catalogue|catalog/.test(text)) {
    const catalog = screenFor(doc, 'catalog')
    if (!catalog) return { doc, summary: 'This build has no catalogue screen.' }
    return {
      doc: setScreenNav(renameScreen(doc, catalog.id, verticalFor(spec.vertical).vocab.catalog), catalog.id, true),
      summary: 'Brought the catalogue screen into the navigation.',
    }
  }
  if (/hero/.test(text)) {
    const hero = homeSections(doc).find((node) => node.kind === 'hero')
    if (!hero) return { doc, summary: 'This build has no hero to change.' }
    return {
      doc: updateSection(doc, homeScreen(doc).id, hero.id, {
        style: { align: 'center', paddingY: 2 },
        text: hero.text ? `${hero.text.replace(/[.\s]+$/, '')}. Book or order in a few taps.` : hero.text,
      }),
      summary: 'Made the hero more direct and centred.',
    }
  }
  if (/rearrange|reorder|order/.test(text)) {
    const home = homeScreen(doc)
    const movable = home.sections.filter((node) => node.kind !== 'hero')
    if (movable.length < 2) return { doc, summary: 'There is only one section to arrange.' }
    const [first, ...rest] = movable
    return {
      doc: {
        ...doc,
        screens: doc.screens.map((entry) =>
          entry.id === home.id ? { ...entry, sections: [home.sections[0], ...rest, first] } : entry,
        ),
      },
      summary: 'Moved the first section to the end of Home.',
    }
  }
  if (/mobile|responsive/.test(text)) {
    return {
      doc: {
        ...doc,
        screens: doc.screens.map((entry) => ({
          ...entry,
          sections: entry.sections.map((node) => ({ ...node, responsive: { hideOn: [] } })),
        })),
      },
      summary: 'Cleared every section’s device hiding, so the full app shows on mobile.',
    }
  }
  const colour = /#([0-9a-f]{3}|[0-9a-f]{6})\b/i.exec(text)
  if (colour) {
    const accent = sanitizeHex(colour[0], '')
    if (accent) return { doc: { ...doc, accent }, summary: `Set the accent to ${accent.toUpperCase()}.` }
  }
  return {
    doc,
    summary: 'I did not catch that one. Try “add a contact screen”, “make it premium” or “add testimonials”.',
  }
}
