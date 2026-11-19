import type { DesignKit, SiteStructure } from './design'

/** Shared shapes for the build spec. A spec is vertical-agnostic: the same
 *  document powers a restaurant menu, a salon price list or a property listing. */

export type Plan = 'onetime' | 'monthly'

export type Platform = 'pwa' | 'android' | 'ios'

export type FeatureId =
  | 'catalog'
  | 'ordering'
  | 'qr'
  | 'delivery'
  | 'booking'
  | 'classes'
  | 'quote'
  | 'loyalty'
  | 'offers'
  | 'events'
  | 'gallery'
  | 'reviews'
  | 'multilingual'
  | 'tablet'

export type MenuItem = {
  name: string
  desc: string
  /** In cents. 0 means "priced on request". */
  price: number
  tag?: string
  /** Secondary line: duration, bed count, "per night", "from". */
  meta?: string
  /** The seller on a marketplace: the store an item is bought from. */
  vendor?: string
  /** A photograph owned by this product, service or room. */
  media?: ItemMedia
  /** The image the source website published for this exact item. Kept as a
   *  URL with its provenance, so the app never presents another product's
   *  photograph — or a stock one — as this item's. */
  image?: {
    url: string
    /** The source URL exactly as published, when `url` is a CDN rendition. */
    sourceUrl?: string
    alt?: string
    source: 'website'
    /** How the source tied this photograph to this item. */
    method?: 'structured-data' | 'embedded-json' | 'og-image' | 'public-data'
  }
}

/** The same reference shape as a document image, kept flat so a catalogue item
 *  can be stored and rendered without a document. */
export type ItemMedia = {
  id: string
  alt?: string
  width?: number
  height?: number
  focalX?: number
  focalY?: number
  fit?: 'cover' | 'contain'
}

export type MenuSection = { name: string; items: MenuItem[] }

/** A social profile or other link taken from the customer's own site. */
export type SocialLink = { label: string; url: string }

/** A trailer or clip: the label is the button, the url opens the film itself. */
export type VideoLink = { label: string; url: string }

/** Platform products sold alongside the app, priced in `pricing.ts`. */
export type BundleId = 'marketplace'

/** The words this business uses. Drives every label in the generated app. */
export type Vocab = {
  catalog: string
  item: string
  order: string
  book: string
  bookTitle: string
  quoteTitle: string
  partyLabel: string
  fulfilment: string[]
  homeCta: string
  /** Heading over the gallery; "The work" when the trade has no better word. */
  galleryTitle?: string
  /** Reassurance shown above the enquiry form; clinic copy avoids medical details. */
  quoteNote?: string
  /** Empty means the booking screen is date-only (hotels, viewings). */
  slots: string[]
  /** What the listing's meta line means; property says "Included". */
  listingSpecLabel?: string
}

export type VerticalId =
  | 'restaurant'
  | 'cafe'
  | 'shop'
  | 'salon'
  | 'gym'
  | 'clinic'
  | 'trades'
  | 'professional'
  | 'property'
  | 'hotel'
  | 'studio'
  | 'auto'
  | 'hospital'
  | 'ecommerce'
  | 'plants-indoor'
  | 'plants-outdoor'
  | 'courses'
  | 'tuition'
  | 'school'
  | 'kindergarten'
  | 'finance'
  | 'agency'
  | 'influencer'
  | 'portfolio'
  | 'film'
  | 'gallery'
  | 'marketplace'

/** 4 card layouts x 3 rhythms x 3 media x 4 hero compositions x 4 section orders x 4 hero scales. */
export const LAYOUT_DECK_SIZE = 2304

/** The structure a customer kept from the three designs on the brief. */
export type LayoutChoice = {
  variant: number
  density: string
  corners: string
  hero: string
  order: string
  heroScale: string
  /** The shapes the customer picked for buttons and cards, if they picked any. */
  buttons?: ElementShape
  cards?: ElementShape
}

/** "Rectangle, little curve, curved" in the words the brief uses. */
export type ElementShape = 'square' | 'soft' | 'round'

export type AppSpec = {
  name: string
  kind: string
  tagline: string
  story: string
  accent: string
  logo: string
  /** Their own logo image, when a site declared one; initials are the fallback. */
  logoImage?: { url: string; alt?: string }
  hours: string
  phone: string
  address: string
  vertical: VerticalId
  /** What the business calls itself: "Bookshop", "Mobile dog grooming". Used
   *  verbatim in the app so a trade outside the catalogue still reads right. */
  category?: string
  features: FeatureId[]
  menu: MenuSection[]
  offers: { title: string; body: string }[]
  loyalty: { goal: number; reward: string }
  /** Free-text requirements that no generator field covered. */
  custom: string
  /** Named team members a customer may request for an appointment. */
  staff?: string[]
  /** Sample team profiles for trades that sell expertise, not just services. */
  team?: { name: string; role: string; credential?: string }[]
  /** What the import produced, kept so the owner can review it before
   *  publishing without re-reading the website. */
  importSummary?: {
    source: string
    importedAt: string
    products: number
    withImage: number
    priced: number
    currency: string
    categories: string[]
  }
  /** The design they chose on the brief, so the build matches the preview. */
  layout?: LayoutChoice
  /** The look read from their own site: palette, type, corners, light or dark. */
  design?: DesignKit
  /** Their nav and hero composition, so the app's structure matches. */
  structure?: SiteStructure
  /** Present when the brief was read off an existing website. */
  website?: string
  email?: string
  currency?: string
  socials?: SocialLink[]
  /** Off by default; an owner must deliberately allow search indexing. */
  indexable?: boolean
  /** Trailers and clips, shown on the about screen when the trade has them. */
  videos?: VideoLink[]
  /** The platform bundle bought with this build, if any. */
  bundle?: BundleId
  /** Which parts still came from Plattr's trade defaults rather than the
   *  owner's own menu, story or contact details. The editor uses this to say
   *  plainly what is sample content; it never makes the business's own copy
   *  look generated. */
  sampleContent?: {
    menu: boolean
    contact: boolean
    story: boolean
    offers: boolean
    team?: boolean
    staff?: boolean
    tagline?: boolean
  }
}
