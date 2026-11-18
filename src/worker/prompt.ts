import { detectVertical } from './importer'
import { FEATURES, normalizeFeatures } from './pricing'
import type { ElementShape, FeatureId, LayoutChoice, VerticalId } from './types'
import { VERTICALS } from './verticals'

/**
 * What a customer types, read back as a build: the trade, the features that
 * fit, and three structures to choose between. No model is called — the words
 * are matched, so the answer is instant, free and repeatable.
 */

/** Plain nouns as people write them, including the typos ("saloon"). */
const PROMPT_NOUNS: [VerticalId, string[]][] = [
  ['salon', ['salon', 'saloon', 'hairdresser', 'hairdressing', 'hair studio', 'barber', 'barbershop', 'barber shop', 'nails', 'nail bar', 'beauty', 'spa', 'massage', 'aesthetics', 'brows', 'lashes']],
  ['gym', ['gym', 'fitness', 'personal trainer', 'personal training', 'yoga', 'pilates', 'crossfit', 'boxing', 'martial arts', 'climbing', 'bootcamp', 'boot camp']],
  ['restaurant', ['restaurant', 'bistro', 'trattoria', 'diner', 'pizzeria', 'pizza', 'takeaway', 'food truck', 'steakhouse', 'sushi', 'kitchen', 'eatery']],
  ['cafe', ['cafe', 'café', 'coffee shop', 'coffee house', 'coffee', 'bakery', 'patisserie', 'brunch', 'tea room', 'juice bar']],
  ['shop', ['shop', 'store', 'boutique', 'retail', 'florist', 'flowers', 'bookshop', 'bookstore', 'jeweller', 'jewellery', 'ceramics', 'vintage']],
  ['clinic', ['clinic', 'dental', 'dentist', 'orthodontist', 'physio', 'physiotherapy', 'chiropractor', 'osteopath', 'doctor', 'gp surgery', 'medical', 'therapy', 'vet', 'veterinary']],
  ['trades', ['plumber', 'plumbing', 'electrician', 'electrical', 'builder', 'building', 'roofer', 'roofing', 'handyman', 'landscaper', 'gardener', 'cleaner', 'cleaning', 'locksmith', 'decorator', 'heating engineer']],
  ['professional', ['accountant', 'accounting', 'bookkeeper', 'solicitor', 'lawyer', 'law firm', 'consultant', 'consultancy', 'agency', 'coach', 'coaching', 'advisor', 'architect']],
  ['property', ['estate agent', 'estate agency', 'lettings', 'letting agent', 'property', 'real estate', 'realtor', 'landlord']],
  ['hotel', ['hotel', 'guesthouse', 'guest house', 'b&b', 'bed and breakfast', 'hostel', 'holiday let', 'holiday cottage', 'rooms to stay']],
  ['studio', ['photographer', 'photography', 'design studio', 'creative studio', 'wedding photographer', 'videographer', 'illustrator', 'artist']],
  ['auto', ['garage', 'mechanic', 'mot', 'car service', 'car wash', 'valeting', 'tyres', 'auto repair', 'dealership', 'body shop']],
  ['ecommerce', ['ecommerce', 'e-commerce', 'online store', 'online shop', 'online shopping', 'web store', 'dropshipping', 'marketplace', 'shopify']],
  ['plants-indoor', ['houseplants', 'houseplant', 'house plants', 'house plant', 'indoor plants', 'indoor plant', 'plant shop', 'terrariums']],
  ['plants-outdoor', ['garden centre', 'garden center', 'plant nursery', 'garden nursery', 'outdoor plants']],
  ['hospital', ['hospital', 'a&e', 'urgent care', 'medical centre', 'health centre', 'nhs trust']],
  ['courses', ['online course', 'online courses', 'online learning', 'e-learning', 'elearning', 'mooc', 'course platform']],
  ['tuition', ['tuition centre', 'tuition', 'tutoring', 'tutor', 'learning centre', 'exam prep', 'coaching centre']],
  ['school', ['primary school', 'secondary school', 'high school', 'school', 'academy', 'college', 'education', 'university']],
  ['kindergarten', ['kindergarten', 'kindergarden', 'nursery school', 'preschool', 'pre-school', 'childcare', 'montessori', 'daycare', 'creche', 'crèche']],
  ['finance', ['financial adviser', 'financial advisor', 'financial planning', 'financial services', 'insurance', 'mortgage', 'wealth management']],
  ['agency', ['marketing agency', 'advertising agency', 'branding agency', 'creative agency', 'digital agency', 'web agency', 'business agency']],
  ['influencer', ['influencer', 'influencers', 'content creator', 'instagrammer', 'tiktok creator', 'youtuber', 'ugc creator', 'brand ambassador']],
  ['portfolio', ['personal portfolio', 'portfolio website', 'design portfolio', 'designer portfolio', 'my portfolio', 'personal website', 'graphic designer', 'art director']],
  ['film', ['feature film', 'short film', 'documentary', 'film production', 'movie', 'film', 'screening', 'cinema', 'cast and crew']],
  ['gallery', ['art gallery', 'gallery', 'exhibitions', 'exhibition', 'art dealer', 'art space', 'fine art', 'museum']],
  ['marketplace', ['marketplace', 'multi-vendor', 'multi vendor', 'marketplace app', 'online marketplace', 'food delivery', 'delivery app', 'quick commerce', 'hyperlocal']],
]

/** Features people actually ask for, in their words. */
const FEATURE_WORDS: { id: FeatureId; words: string[] }[] = [
  { id: 'booking', words: ['book', 'booking', 'bookings', 'appointment', 'appointments', 'reserve', 'reservation', 'reservations', 'diary', 'schedule'] },
  { id: 'classes', words: ['class', 'classes', 'timetable', 'session', 'sessions', 'group training', 'schedule of classes'] },
  { id: 'ordering', words: ['order', 'orders', 'ordering', 'checkout', 'cart', 'buy online', 'click and collect', 'pre-order', 'preorder'] },
  { id: 'delivery', words: ['delivery', 'deliver', 'deliveries', 'shipping', 'drop off'] },
  { id: 'loyalty', words: ['loyalty', 'rewards', 'reward', 'points', 'membership', 'memberships', 'regulars', 'stamp card'] },
  { id: 'offers', words: ['offer', 'offers', 'discount', 'discounts', 'promo', 'promotion', 'deal', 'deals', 'sale'] },
  { id: 'events', words: ['event', 'events', 'what’s on', "what's on", 'quiz', 'gig', 'gigs', 'workshop', 'workshops'] },
  { id: 'gallery', words: ['gallery', 'portfolio', 'lookbook', 'photos of', 'before and after'] },
  { id: 'reviews', words: ['review', 'reviews', 'testimonial', 'testimonials', 'rating', 'ratings', 'feedback'] },
  { id: 'quote', words: ['quote', 'quotes', 'estimate', 'estimates', 'enquiry', 'enquiries', 'inquiry', 'consultation', 'free survey'] },
  { id: 'qr', words: ['qr', 'qr code', 'scan to order', 'table order', 'order at the table'] },
  { id: 'multilingual', words: ['second language', 'bilingual', 'spanish', 'french', 'arabic', 'welsh', 'translated'] },
  { id: 'tablet', words: ['kiosk', 'tablet', 'counter', 'till', 'in store'] },
]

function escapeWord(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Where a whole word or phrase appears, or -1. "class" does not match "classic". */
function mentions(text: string, word: string): number {
  const pattern = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeWord(word)}(?:$|[^\\p{L}\\p{N}])`, 'iu')
  const match = pattern.exec(text)
  if (!match) return -1
  return match.index
}

export function cleanPrompt(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240)
}

function tradeFromPrompt(prompt: string): { id: VerticalId; evidence: string[] } | null {
  let best: { id: VerticalId; score: number; at: number; hits: string[] } | null = null
  for (const [id, words] of PROMPT_NOUNS) {
    let score = 0
    let at = Number.POSITIVE_INFINITY
    const hits: string[] = []
    for (const word of words) {
      const index = mentions(prompt, word)
      if (index < 0) continue
      // A two-word phrase is a stronger signal than a single noun.
      score += word.split(/\s+/).length
      at = Math.min(at, index)
      hits.push(word)
    }
    if (!hits.length) continue
    if (!best || score > best.score || (score === best.score && at < best.at))
      best = { id, score, at, hits }
  }
  return best ? { id: best.id, evidence: best.hits.slice(0, 3) } : null
}

export type FeatureSuggestion = { id: FeatureId; label: string; why: string }

export type PromptRead = {
  prompt: string
  vertical: VerticalId
  label: string
  glyph: string
  confidence: 'detected' | 'guessed'
  evidence: string[]
  features: FeatureId[]
  suggestions: FeatureSuggestion[]
}

export function readPrompt(input: unknown): PromptRead {
  const prompt = cleanPrompt(input)
  const noun = tradeFromPrompt(prompt)
  let vertical: VerticalId
  let confidence: 'detected' | 'guessed'
  let evidence: string[]

  if (noun) {
    vertical = noun.id
    confidence = 'detected'
    evidence = noun.evidence
  } else {
    // Nothing plain named the trade: fall back to the site-copy detector, which
    // also says when it is only a guess.
    const guess = detectVertical({ strong: prompt, body: prompt, products: 0 })
    vertical = guess.id
    confidence = guess.confidence
    evidence = guess.evidence
  }

  const trade = VERTICALS[vertical]
  const defaults = normalizeFeatures(trade.features)
  const chosen = new Set<FeatureId>(defaults)
  const why = new Map<FeatureId, string>()
  const article = /^[aeiou]/i.test(trade.label) ? 'an' : 'a'
  for (const id of defaults) why.set(id, `Standard for ${article} ${trade.label.toLowerCase()}`)

  for (const entry of FEATURE_WORDS) {
    const hit = entry.words.find((word) => mentions(prompt, word) >= 0)
    if (!hit) continue
    chosen.add(entry.id)
    if (!why.has(entry.id)) why.set(entry.id, `Because you said “${hit}”`)
  }

  const features = normalizeFeatures([...chosen])
  return {
    prompt,
    vertical,
    label: trade.label,
    glyph: trade.glyph,
    confidence,
    evidence,
    features,
    suggestions: features.map((id) => ({
      id,
      label: FEATURES.find((feature) => feature.id === id)?.label ?? id,
      why: why.get(id) ?? 'Comes with the features you picked',
    })),
  }
}

export type DesignOption = { id: string; name: string; note: string; axes: LayoutChoice }
export type DesignPreview = DesignOption & { preview: string }

/**
 * Three structures that share no axis: card layout, rhythm, corners, first
 * screen and section order all differ, so the choice is a real one rather than
 * three tints of the same page. The brand colour is not part of a design; it
 * comes from the business.
 */
export const DESIGNS: DesignOption[] = [
  {
    id: 'editorial',
    name: 'Editorial',
    note: 'Big type, an image-led first screen and a tight list. Reads like a magazine page.',
    axes: {
      variant: 0, density: 'cozy', corners: 'sharp', hero: 'image', heroScale: 'immersive',
      order: 'catalog', buttons: 'square', cards: 'square',
    },
  },
  {
    id: 'calm',
    name: 'Calm',
    note: 'A centred welcome, generous spacing and rounder cards. Slower, more premium.',
    axes: {
      variant: 1, density: 'roomy', corners: 'round', hero: 'centered', heroScale: 'tall',
      order: 'visit', buttons: 'round', cards: 'round',
    },
  },
  {
    id: 'compact',
    name: 'Compact',
    note: 'A split first screen and a two-up grid: the whole catalogue with less scrolling.',
    axes: {
      variant: 2, density: 'standard', corners: 'soft', hero: 'split', heroScale: 'compact',
      order: 'offers', buttons: 'soft', cards: 'soft',
    },
  },
]

export function designsFor(vertical: VerticalId): DesignPreview[] {
  return DESIGNS.map((design) => {
    const query = new URLSearchParams({
      biz: vertical,
      variant: String(design.axes.variant),
      density: design.axes.density,
      corners: design.axes.corners,
      // Artwork only: a preview must not depend on a photo key being configured.
      media: 'art',
      hero: design.axes.hero,
      order: design.axes.order,
      heroScale: design.axes.heroScale,
      buttons: String(design.axes.buttons ?? ''),
      cards: String(design.axes.cards ?? ''),
    })
    return { ...design, preview: `/demo/app?${query.toString()}` }
  })
}

const VARIANTS = [0, 1, 2, 3]
const AXES = {
  density: ['cozy', 'standard', 'roomy'],
  corners: ['sharp', 'soft', 'round'],
  hero: ['image', 'split', 'centered', 'none'],
  order: ['catalog', 'offers', 'visit', 'rewards'],
  heroScale: ['compact', 'regular', 'tall', 'immersive'],
  buttons: ['square', 'soft', 'round'],
  cards: ['square', 'soft', 'round'],
} as const

/** The chosen design as stored on a build. Anything malformed is dropped whole. */
export function cleanLayout(input: unknown): LayoutChoice | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined
  const value = input as Record<string, unknown>
  const variant = Number(value.variant)
  if (!Number.isInteger(variant) || !VARIANTS.includes(variant)) return undefined
  const pick = (key: keyof typeof AXES): string | undefined => {
    const raw = value[key]
    return typeof raw === 'string' && (AXES[key] as readonly string[]).includes(raw)
      ? raw
      : undefined
  }
  const density = pick('density')
  const corners = pick('corners')
  const hero = pick('hero')
  const order = pick('order')
  const heroScale = pick('heroScale')
  if (!density || !corners || !hero || !order || !heroScale) return undefined
  // The element shapes are optional: a build made before they existed keeps
  // its stored layout, and an invalid one is dropped on its own.
  const buttons = pick('buttons')
  const cards = pick('cards')
  return {
    variant,
    density,
    corners,
    hero,
    order,
    heroScale,
    ...(buttons ? { buttons: buttons as ElementShape } : {}),
    ...(cards ? { cards: cards as ElementShape } : {}),
  }
}
