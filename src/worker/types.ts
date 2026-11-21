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

/** A product the page and the store's product feed price differently. */
export type PriceConflict = {
  name: string
  /** What the page said, in cents. */
  page: number
  /** What the feed said, in cents. */
  feed: number
  pageSource: string
  feedSource: string
}

/** The owner's answer to one conflict. `defer` means they have not chosen, so
 *  the price is not published: an unresolved conflict is never guessed. */
export type PriceDecision = {
  name: string
  choice: 'page' | 'feed' | 'custom' | 'defer'
  /** The chosen price in cents; 0 for `defer`. */
  value: number
  decidedAt: string
  /** The two readings and where each came from, kept so the build can say why
   *  this price won even after the draft is gone. */
  page?: number
  feed?: number
  pageSource?: string
  feedSource?: string
}

/** Where a price came from, so a published price carries its proof. */
export type PriceEvidence = {
  /** The mechanism that read this exact value. */
  method: 'json-ld' | 'shopify-variant' | 'microdata' | 'meta' | 'text' | 'owner'
  /** The page or endpoint the value was read from. */
  source: string
  /** The value exactly as the source wrote it. */
  raw: string
  currency: string
  /** True only when the number sat inside this item's own record or card. A
   *  figure read from the page as a whole proves nothing about this item. */
  validated: boolean
  /** The variant this price belongs to, when the source lists several. */
  variant?: string
}

export type MenuItem = {
  /** Stable identity derived from the section and name, not from position, so
   *  a document can reference this item across re-imports and reorderings. */
  id?: string
  /** The source's own product id (for example a Shopify product id). Preserved
   *  so a variant can always be traced back to the product it belongs to. */
  sourceId?: string
  name: string
  desc: string
  /** In cents. 0 means "priced on request". */
  price: number
  tag?: string
  /** Secondary line: duration, bed count, "per night", "from". */
  meta?: string
  /** Most guests this room sleeps, only when the source stated it ("Sleeps 2").
   *  Never inferred from a photograph or from the trade's sample copy. */
  capacity?: number
  /** Where this price was read, when the source made it verifiable. */
  priceEvidence?: PriceEvidence
  /** Every option the source lists for one product, at its own price and in its
   *  own currency. `selected` marks the one whose price this item publishes, so
   *  a cheapest-variant "from" price is never mistaken for the only option. */
  variants?: {
    /** The source's own variant id, when the feed gives one. */
    id?: string
    name: string
    price: number
    currency?: string
    selected?: boolean
    /** One value per option group, for example { Size: 'Medium', Colour: 'Black' }.
     *  Empty or partial values are never completed by the editor. */
    values?: Record<string, string>
    /** False only when the owner has marked this combination unavailable. */
    available?: boolean
    /** A photograph of this option, when the owner has one. */
    media?: ItemMedia
  }[]
  /** Option groups such as Size, Colour or Material. Variants keep their own
   *  names and prices; groups describe the choices the owner offers. */
  optionGroups?: { name: string; options: string[] }[]
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
    /** How the source photograph sits in its frame. A whole-product fit is the
     *  default: cropping a tall illustration to a card can show its empty
     *  background and read as no photograph at all. */
    fit?: 'cover' | 'contain'
    /** Crop centre, when the owner has moved it. */
    positionX?: number
    positionY?: number
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
  /** The action the detail page leads with. Defaults to booking when offered,
   *  otherwise the enquiry form. A trade whose real workflow is a proposal can
   *  declare `quote` even when a booking screen also exists. */
  detailAction?: 'quote' | 'book'
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
  /** The public statement the shop's currency came from, kept on the build so a
   *  price can always explain its currency as well as its amount. */
  currencySource?: { code: string; method: string; source: string; raw: string }
  /** Every currency code the source declared, with its source. Retained when a
   *  conflict was resolved by the owner. */
  currencyCandidates?: { code: string; method: string; source: string; raw: string }[]
  importSummary?: {
    source: string
    importedAt: string
    products: number
    withImage: number
    priced: number
    currency: string
    categories: string[]
  }
  /** The price review behind this build: both readings, both sources and the
   *  owner's decision with its timestamp. Private working data; no renderer
   *  reads it and no public route returns the spec. */
  review?: { conflicts: PriceConflict[]; decisions: PriceDecision[] }
  /** The design they chose on the brief, so the build matches the preview. */
  layout?: LayoutChoice
  /** The look read from their own site: palette, type, corners, light or dark. */
  design?: DesignKit
  /** The design direction chosen as a concept on the brief. It seeds the new
   *  document's direction; after birth the document is the source of truth. */
  direction?: string
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
