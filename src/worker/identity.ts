import type { VerticalId } from './types'
import { VERTICALS } from './verticals'

/**
 * Business identity consistency.
 *
 * A build is a single claim: this business, in this trade, with this
 * catalogue, navigation and workflow. When those disagree — a florist's
 * category over a café's table-reservation flow, or a jeweller's catalogue
 * under a café's navigation — the app is wrong even if every individual piece
 * rendered. This check runs before a build is created or a category is changed;
 * it refuses the contradiction instead of rendering it.
 */

export type IdentityFailure = {
  code: 'trade_mismatch' | 'category_mismatch'
  message: string
}

type Group =
  | 'food'
  | 'retail'
  | 'beauty'
  | 'fitness'
  | 'health'
  | 'home'
  | 'professional'
  | 'property'
  | 'hospitality'
  | 'education'
  | 'media'

const VERTICAL_GROUP: Record<VerticalId, Group> = {
  restaurant: 'food',
  cafe: 'food',
  shop: 'retail',
  ecommerce: 'retail',
  marketplace: 'retail',
  'plants-indoor': 'retail',
  'plants-outdoor': 'retail',
  gallery: 'retail',
  salon: 'beauty',
  gym: 'fitness',
  clinic: 'health',
  hospital: 'health',
  trades: 'home',
  auto: 'home',
  professional: 'professional',
  finance: 'professional',
  agency: 'professional',
  studio: 'professional',
  portfolio: 'professional',
  property: 'property',
  hotel: 'hospitality',
  courses: 'education',
  tuition: 'education',
  school: 'education',
  kindergarten: 'education',
  influencer: 'media',
  film: 'media',
}

/** The words a business uses for itself, mapped to the group they belong to.
 *  Only unambiguous nouns are listed: "studio" is deliberately absent because
 *  a design studio, a fitness studio and a photo studio are different trades. */
const CATEGORY_GROUP: { group: Group; words: string[] }[] = [
  {
    group: 'food',
    words: [
      'cafe',
      'café',
      'coffee',
      'coffee shop',
      'bakery',
      'patisserie',
      'restaurant',
      'bistro',
      'trattoria',
      'pizzeria',
      'diner',
      'kitchen',
      'eatery',
      'food truck',
      'juice bar',
      'tea room',
      'brunch',
    ],
  },
  {
    group: 'retail',
    words: [
      'shop',
      'store',
      'boutique',
      'retail',
      'jeweller',
      'jewellery',
      'jewelry',
      'florist',
      'flowers',
      'ceramics',
      'homeware',
      'fashion',
      'saree',
      'sari',
      'clothing',
      'bookshop',
      'bookstore',
      'garden centre',
      'garden center',
      'plant shop',
      'art gallery',
    ],
  },
  { group: 'beauty', words: ['salon', 'hair salon', 'barber', 'barbershop', 'beauty salon', 'spa', 'nail bar', 'nails'] },
  { group: 'fitness', words: ['gym', 'fitness studio', 'fitness', 'yoga studio', 'pilates studio', 'boxing gym', 'climbing gym'] },
  { group: 'health', words: ['clinic', 'dental', 'dentist', 'hospital', 'medical centre', 'medical center', 'physio', 'physiotherapy', 'veterinary'] },
  { group: 'home', words: ['plumber', 'plumbing', 'electrician', 'builder', 'roofer', 'garage', 'mechanic', 'cleaning', 'landscaper'] },
  {
    group: 'professional',
    words: ['accountant', 'accounting', 'solicitor', 'law firm', 'consultant', 'consultancy', 'architect', 'marketing agency', 'design agency'],
  },
  { group: 'property', words: ['estate agent', 'estate agency', 'lettings', 'property agency', 'realtor'] },
  { group: 'hospitality', words: ['hotel', 'guesthouse', 'guest house', 'b&b', 'bed and breakfast', 'hostel'] },
  { group: 'education', words: ['school', 'primary school', 'secondary school', 'nursery', 'kindergarten', 'preschool', 'tuition centre', 'tutoring'] },
  { group: 'media', words: ['film production', 'production company', 'video production', 'influencer', 'content creator'] },
]

function categoryGroup(category: string): Group | null {
  const value = category.trim().toLowerCase()
  if (!value) return null
  // Longest phrase first so "garden centre" is not read as the word "centre",
  // and "coffee shop" is food before it is a shop.
  const matches = CATEGORY_GROUP.flatMap((entry) =>
    entry.words
      .filter((word) => new RegExp(`(?:^|[^\\p{L}])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^\\p{L}])`, 'iu').test(value))
      .map((word) => ({ group: entry.group, length: word.length })),
  ).sort((a, b) => b.length - a.length)
  return matches[0]?.group ?? null
}

function verticalGroup(vertical: string): Group | null {
  return VERTICAL_GROUP[vertical as VerticalId] ?? null
}

function labelOf(vertical: string): string {
  return VERTICALS[vertical as VerticalId]?.label ?? vertical
}

/**
 * What must agree for one build:
 * - the trade the website was read as and the trade the build will render;
 * - the business's own category wording and that trade's family.
 *
 * A category the lexicon does not know is not a contradiction: the owner may
 * describe the business in words no list contains.
 */
export function identityIssues(input: {
  vertical: string
  category?: string
  /** The trade the source site established, when the build came from a read. */
  siteVertical?: string | null
}): IdentityFailure[] {
  const failures: IdentityFailure[] = []
  const vertical = input.vertical
  if (!verticalGroup(vertical)) return failures

  if (input.siteVertical && input.siteVertical !== vertical) {
    failures.push({
      code: 'trade_mismatch',
      message:
        `The website was read as ${labelOf(input.siteVertical)} but this build is set to ${labelOf(vertical)}. ` +
        `A build cannot use one trade's navigation and workflows around another trade's catalogue. ` +
        `Keep the trade the site established, or start a separate brief for the other business.`,
    })
  }

  const fromCategory = categoryGroup(input.category ?? '')
  const fromTrade = verticalGroup(vertical)
  if (fromCategory && fromTrade && fromCategory !== fromTrade) {
    failures.push({
      code: 'category_mismatch',
      message:
        `“${(input.category ?? '').trim()}” describes a ${fromCategory} business, but the app is being built as ` +
        `${labelOf(vertical)} (${fromTrade}). Its navigation, actions and catalogue would contradict the business. ` +
        `Change the trade, or use the category that matches it.`,
    })
  }
  return failures
}
