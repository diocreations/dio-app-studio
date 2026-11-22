import type { VerticalId } from './types'

/**
 * Curated, locally hosted photography for the five flagship trades. The files
 * live in `public/images/flagship` at 320/640/1280 widths so the same image can
 * serve a 54px service thumb or a full-width hotel cover without shipping a
 * desktop file to a phone.
 *
 * These are sample photographs, not claims about a customer's premises. Owner
 * uploads remain the override and are stored privately in R2.
 */
export type StockPhoto = { name: string; alt: string }

export const FLAGSHIP_PHOTOS: Partial<Record<VerticalId, StockPhoto[]>> = {
  restaurant: [
    { name: 'restaurant-burrata', alt: 'Burrata with heirloom tomatoes and basil' },
    { name: 'restaurant-bread', alt: 'Fresh sourdough and seeded bread' },
    { name: 'restaurant-grill', alt: 'A grilled plate with seasonal vegetables' },
    { name: 'restaurant-pasta', alt: 'Fresh pasta with a slow-cooked sauce' },
    { name: 'restaurant-dining', alt: 'A candlelit restaurant table' },
    { name: 'restaurant-dessert', alt: 'A plated dessert with caramel' },
    { name: 'restaurant-cocktail', alt: 'A garnished cocktail on a bar top' },
    { name: 'restaurant-room', alt: 'A warm, low-lit dining room' },
    { name: 'restaurant-table', alt: 'A table spread of sharing plates' },
  ],
  shop: [
    { name: 'shop-ceramics', alt: 'Stacked ceramic vessels in cream and sand' },
    { name: 'shop-plates', alt: 'Hand-thrown plates on a timber table' },
    { name: 'shop-vase', alt: 'A tall green ceramic vase' },
    { name: 'shop-linen', alt: 'A linen sofa with textured cushions' },
    { name: 'shop-sofa', alt: 'A deep green velvet sofa in daylight' },
    { name: 'shop-chair', alt: 'A sculptural white chair against a pale wall' },
    { name: 'shop-stool', alt: 'A pale wooden stool on a soft blue backdrop' },
  ],
  salon: [
    { name: 'salon-stylist', alt: 'A stylist working with a client in the salon' },
    { name: 'salon-colour', alt: 'Hair being coloured and styled' },
    { name: 'salon-styling', alt: 'Long hair being finished by a stylist' },
    { name: 'salon-room', alt: 'A calm salon with black styling chairs' },
    { name: 'salon-interior', alt: 'A bright modern salon interior' },
    { name: 'salon-makeup', alt: 'A make-up palette and brushes ready for a treatment' },
    { name: 'salon-nails', alt: 'A finished gel manicure' },
    { name: 'salon-tools', alt: 'Professional brushes and styling tools' },
  ],
  hotel: [
    { name: 'hotel-terrace', alt: 'A pool terrace at a hillside hotel' },
    { name: 'hotel-palms', alt: 'Palm trees beside a pool at dusk' },
    { name: 'hotel-beach', alt: 'Loungers beside a beachfront pool' },
    { name: 'hotel-courtyard', alt: 'A courtyard pool surrounded by guest rooms' },
    { name: 'hotel-pool', alt: 'An ocean-view pool deck' },
    { name: 'hotel-breakfast', alt: 'Breakfast laid out in a hotel dining room' },
    { name: 'hotel-exterior', alt: 'A hotel exterior and pool in the evening' },
  ],
  professional: [
    { name: 'pro-office', alt: 'A quiet office lounge with timber tables' },
    { name: 'pro-team', alt: 'A team working together at a shared desk' },
    { name: 'pro-adviser', alt: 'A professional portrait in a grey blazer' },
    { name: 'pro-portrait', alt: 'A professional portrait in a dark suit' },
    { name: 'pro-meeting', alt: 'A team meeting in a glass-walled office' },
    { name: 'pro-desk', alt: 'A desk with a laptop and notes' },
  ],
  cafe: [
    { name: 'cafe-espresso', alt: 'A flat white with latte art beside a cafetière' },
    { name: 'cafe-counter', alt: 'Coffee cups on the counter among café plants' },
    { name: 'cafe-interior', alt: 'A plant-filled neighbourhood café with timber tables' },
    { name: 'cafe-pour', alt: 'A neon café sign above a counter at dusk' },
    { name: 'cafe-croissant', alt: 'Fresh croissants cooling on a bakery tray' },
  ],
  gym: [
    { name: 'gym-floor', alt: 'A training floor with racks and free weights' },
    { name: 'gym-barbell', alt: 'A loaded barbell on a gym platform' },
    { name: 'gym-coach', alt: 'A coach demonstrating a barbell movement' },
    { name: 'gym-class', alt: 'A small group training session' },
    { name: 'gym-rack', alt: 'A squat rack in a strength gym' },
    { name: 'gym-coach2', alt: 'A strength coach in the gym' },
    { name: 'gym-coach3', alt: 'A conditioning coach ready to train' },
  ],
  clinic: [
    { name: 'clinic-reception', alt: 'A calm dental surgery with modern equipment' },
    { name: 'clinic-surgery', alt: 'A clinician reviewing a dental scan' },
    { name: 'clinic-doctor', alt: 'A dentist talking with a patient' },
    { name: 'clinic-consult', alt: 'A doctor reviewing notes in a consultation' },
    { name: 'clinic-detail', alt: 'A bright, uncluttered clinic reception' },
    { name: 'clinic-doctor2', alt: 'A clinician in a light-coloured consulting room' },
    { name: 'clinic-doctor3', alt: 'A doctor in a dark suit against a plain wall' },
  ],
  property: [
    { name: 'property-exterior', alt: 'A modern house with a lawn and glazed frontage' },
    { name: 'property-living', alt: 'A bright living room opening onto a garden' },
    { name: 'property-kitchen', alt: 'An open-plan kitchen and living space' },
    { name: 'property-bedroom', alt: 'A calm bedroom with soft neutral linen' },
    { name: 'property-garden', alt: 'A landscaped garden beside a modern home' },
  ],
  studio: [
    { name: 'studio-portrait', alt: 'A film camera and prints on a studio table' },
    { name: 'studio-shoot', alt: 'A photographer at work during a shoot' },
    { name: 'studio-set', alt: 'A portrait taken in natural studio light' },
    { name: 'studio-detail', alt: 'A close portrait from an editorial commission' },
    { name: 'studio-camera', alt: 'A camera body and lens ready for a shoot' },
  ],
  trades: [
    { name: 'trades-van', alt: 'A plumber’s van parked outside a terraced house' },
    { name: 'trades-boiler', alt: 'An engineer servicing a wall-mounted boiler' },
    { name: 'trades-tools', alt: 'Hand tools laid out on a workbench' },
    { name: 'trades-engineer', alt: 'A heating engineer in work clothes' },
    { name: 'trades-engineer2', alt: 'A plumber holding a pipe wrench' },
    { name: 'trades-bathroom', alt: 'A newly fitted bathroom with pale tiles' },
  ],
  auto: [
    { name: 'auto-bay', alt: 'A car raised on a lift inside a garage workshop' },
    { name: 'auto-lift', alt: 'A mechanic working beneath a raised car' },
    { name: 'auto-diagnostics', alt: 'A diagnostic tablet connected to an engine bay' },
    { name: 'auto-technician', alt: 'A vehicle technician in overalls' },
    { name: 'auto-tools', alt: 'Hand tools laid out on a workbench' },
  ],
  ecommerce: [
    { name: 'ecom-tote', alt: 'A floral tote bag photographed against a dark background' },
    { name: 'ecom-ceramics', alt: 'Stacked ceramic vessels in cream and sand' },
    { name: 'ecom-pillow', alt: 'A white pillow on a yellow background' },
    { name: 'ecom-linen', alt: 'A pale wooden stool on a soft blue backdrop' },
    { name: 'ecom-warehouse', alt: 'Pallets of stock in a warehouse aisle' },
    { name: 'ecom-sale', alt: 'Red sale tags on a dark background' },
  ],
  courses: [
    { name: 'courses-workshop', alt: 'A small group working together with laptops' },
    { name: 'courses-notes', alt: 'A learner writing notes beside a coffee cup' },
    { name: 'courses-online', alt: 'Two people reviewing a lesson on a laptop' },
    { name: 'courses-review', alt: 'Two people going through notes at a desk' },
    { name: 'courses-guide', alt: 'A desk with a laptop and notes' },
  ],
  finance: [
    { name: 'finance-meeting', alt: 'A team meeting in a glass-walled office' },
    { name: 'finance-desk', alt: 'Printed statements, a calculator and a pen on a desk' },
    { name: 'finance-adviser', alt: 'A professional portrait in a grey blazer' },
    { name: 'finance-adviser2', alt: 'A professional portrait in a dark suit' },
    { name: 'finance-office', alt: 'A quiet office lounge with timber tables' },
    { name: 'finance-consult', alt: 'A team working together at a shared desk' },
  ],
}

export function stockPhotos(vertical: VerticalId): StockPhoto[] {
  return FLAGSHIP_PHOTOS[vertical] ?? []
}

/** Launch-scope trades keep the full 1280px hero; the rest use the 640px file
 *  so the static bundle stays inside the hosting upload budget. */
const WIDE_VERTICALS = new Set<VerticalId>(['restaurant', 'shop', 'salon', 'professional'])

export function hasWidePhotos(vertical: VerticalId): boolean {
  return WIDE_VERTICALS.has(vertical)
}

export function stockImageUrl(vertical: VerticalId, index: number, width: 320 | 640 | 1280 = 640): string {
  const photos = stockPhotos(vertical)
  if (!photos.length) return ''
  const photo = photos[index % photos.length]
  const size = width === 1280 && !hasWidePhotos(vertical) ? 640 : width
  return `/images/flagship/${photo.name}-${size}.webp`
}

export function stockImageAlt(vertical: VerticalId, index: number): string {
  const photos = stockPhotos(vertical)
  return photos.length ? photos[index % photos.length].alt : ''
}

export function stockImageTag(
  vertical: VerticalId,
  index: number,
  options: {
    alt?: string
    className?: string
    sizes?: string
    priority?: boolean
  } = {},
): string {
  const photos = stockPhotos(vertical)
  if (!photos.length) return ''
  const photo = photos[index % photos.length]
  const alt = options.alt ?? photo.alt
  const className = options.className ?? 'fx-photo'
  const sizes = options.sizes ?? '(max-width: 620px) 45vw, 320px'
  const loading = options.priority ? 'eager' : 'lazy'
  const fetchPriority = options.priority ? ' fetchpriority="high"' : ''
  const wide = hasWidePhotos(vertical)
    ? `, /images/flagship/${photo.name}-1280.webp 1280w`
    : ''
  return `<img class="${className}" src="/images/flagship/${photo.name}-640.webp" srcset="/images/flagship/${photo.name}-320.webp 320w, /images/flagship/${photo.name}-640.webp 640w${wide}" sizes="${sizes}" width="1280" height="960" alt="${escapeHtml(alt)}" loading="${loading}"${fetchPriority} decoding="async" />`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
