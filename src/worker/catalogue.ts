import type { MenuItem, VerticalId } from './types'

/**
 * What a page is, what a business sells, and what evidence an item needs.
 *
 * The crawler can read a heading, an image and a price-like number from almost
 * any page. That is not the same as understanding that a privacy policy is not
 * a dish, a location page is not a room, or a journal caption is not a service.
 * This module is the single place where that judgement is made, so discovery,
 * the catalogue cleaner and the preview all agree on what counts as inventory.
 *
 * Nothing here invents. A rule can only refuse an item or record why it was
 * accepted; a missing price stays missing, and an unverifiable date or rate is
 * never filled in.
 */

/** The commercial thing an entry claims to be. */
export type Payload =
  | 'product'
  | 'dish'
  | 'room'
  | 'treatment'
  | 'service'
  | 'listing'
  | 'article'
  | 'policy'
  | 'location'
  | 'promotion'
  | 'navigation'
  | 'unknown'

/** What a crawled page is for, before any of its text is read as inventory. */
export type PageRole =
  | 'inventory'
  | 'policy'
  | 'article'
  | 'location'
  | 'contact'
  | 'about'
  | 'navigation'
  | 'promotion'
  | 'unknown'

export type ItemStatus = 'verified' | 'incomplete' | 'rejected'

/** What an item is missing, in the source's own terms. */
export type Requirement = 'price' | 'description' | 'image' | 'variant' | 'duration' | 'occupancy' | 'category'

export type ItemAssessment = {
  accept: boolean
  payload: Payload
  status: ItemStatus
  /** Why it was refused, or which requirements it met. */
  reason: string
  /** Requirements this trade needs that the item does not carry. */
  missing: Requirement[]
  /** What the source did provide, for the evidence record. */
  evidence: Requirement[]
}

type Rule = {
  payload: Payload
  label: string
  /** Any one of these makes an entry a real thing to sell. */
  substantive: Requirement[]
  /** Requirements worth telling the owner about when absent. */
  advises: Requirement[]
}

const PRODUCT: Rule = {
  payload: 'product',
  label: 'product',
  substantive: ['price', 'image', 'variant', 'description'],
  advises: ['price', 'image', 'variant'],
}

const DISH: Rule = {
  payload: 'dish',
  label: 'dish',
  substantive: ['price', 'description'],
  advises: ['price', 'image'],
}

const ROOM: Rule = {
  payload: 'room',
  label: 'room',
  substantive: ['description', 'image', 'occupancy', 'price'],
  advises: ['price', 'image', 'occupancy'],
}

const TREATMENT: Rule = {
  payload: 'treatment',
  label: 'treatment or service',
  substantive: ['price', 'description', 'duration'],
  advises: ['price', 'duration'],
}

const SERVICE: Rule = {
  payload: 'service',
  label: 'service',
  substantive: ['description', 'price'],
  advises: ['price'],
}

const LISTING: Rule = {
  payload: 'listing',
  label: 'listing',
  substantive: ['price', 'description', 'image'],
  advises: ['price', 'image'],
}

/** The trade's own word for what it sells, and the evidence that word needs. */
export function ruleFor(vertical: VerticalId): Rule {
  switch (vertical) {
    case 'restaurant':
    case 'cafe':
      return DISH
    case 'hotel':
      return ROOM
    case 'salon':
    case 'clinic':
    case 'gym':
    case 'trades':
    case 'auto':
    case 'hospital':
    case 'courses':
    case 'tuition':
    case 'school':
    case 'kindergarten':
      return TREATMENT
    case 'professional':
    case 'agency':
    case 'finance':
    case 'studio':
    case 'film':
    case 'portfolio':
    case 'influencer':
      return SERVICE
    case 'property':
      return LISTING
    default:
      return PRODUCT
  }
}

export function payloadFor(vertical: VerticalId): Payload {
  return ruleFor(vertical).payload
}

/* ------------------------------------------------------------------ */
/* Page roles                                                          */
/* ------------------------------------------------------------------ */

const POLICY_PATH =
  /\/(?:privacy|cookies?|terms|conditions|legal|polic(?:y|ies)|gdpr|refunds?|returns?|shipping|delivery-info|faqs?|accessibility|complaints?|modern-slavery)\b/i
const ARTICLE_PATH = /\/(?:blog|news|journal|press|insights?|instagram|stories|articles?|posts?)\b/i
const CONTACT_PATH = /\/(?:contact|contact-us|enquiries|enquiry)\b/i
const ABOUT_PATH = /\/(?:about|about-us|our-story|our-team|team|careers|jobs|vacancies|meet-the)\b/i
const NAV_PATH = /\/(?:cart|basket|checkout|account|login|signin|signup|register|search|wishlist)\b/i
const LOCATION_PATH = /\/(?:locations?|find-us|visit|our-shops?|stores?|branches)\b/i
/** Work a professional practice has completed is proof, not a service. */
const WORK_PATH = /\/(?:projects?|portfolio|case-studies?|our-work|selected-work|work)\b/i
const PROMO_PATH = /\/(?:offers?|deals?|promotions?|packages?|vouchers?|gift-cards?|loyalty|membership|events?|hire)\b/i

/** The pages a trade actually sells from. Used only once the vertical is known. */
const INVENTORY_PATH: Partial<Record<Payload, RegExp>> = {
  product: /\/(?:products?|collections?|shop|store|category|categories|catalogue|catalog|range|new-in)\b/i,
  dish: /\/(?:menus?|food|drinks?|dinner|lunch|breakfast|brunch|order|kitchen|pasta|pizza|dishes)\b/i,
  room: /\/(?:rooms?|suites?|stay|stays|accommodation|sleep)\b/i,
  treatment: /\/(?:services?|treatments?|service-type|prices?|price-list|menu|therapies|classes)\b/i,
  service: /\/(?:services?|what-we-do|expertise|capabilities|offerings?|work-with-us)\b/i,
  listing: /\/(?:propert(?:y|ies)|listings?|sales|lettings|rentals)\b/i,
}

/** A page title that names a role rather than a thing for sale. */
const POLICY_TITLE = /\b(?:privacy|cookie|terms|conditions|legal|policy|refund|returns?|shipping|faq|accessibility)\b/i
const ARTICLE_TITLE = /\b(?:blog|journal|newsletter|press (?:release|coverage|quotes?)|articles?|insights?|archive|stories|instagram)\b/i
const ABOUT_TITLE = /^(?:about(?: us)?|our story|our team|meet the team|careers|jobs|contact(?: us)?)\b/i
const PROMO_TITLE = /\b(?:venue hire|private hire|party|packages?|offers?|loyalty club|gift vouchers?)\b/i

/**
 * Which role a page plays for this trade. A path is the strongest signal — it
 * is the site's own filing — then its title, then the trade's own conventions
 * (`/projects` is a service page for nobody, a case-study shelf for a practice).
 */
export function pageRoleOf(input: {
  url?: string
  title?: string
  vertical?: VerticalId
}): PageRole {
  let path = ''
  try {
    path = input.url ? new URL(input.url, 'https://example.invalid').pathname : ''
  } catch {
    path = ''
  }
  if (path && POLICY_PATH.test(path)) return 'policy'
  if (path && ARTICLE_PATH.test(path)) return 'article'
  if (path && CONTACT_PATH.test(path)) return 'contact'
  if (path && ABOUT_PATH.test(path)) return 'about'
  if (path && NAV_PATH.test(path)) return 'navigation'
  if (path && LOCATION_PATH.test(path)) return 'location'
  if (path && PROMO_PATH.test(path)) return 'promotion'
  if (path && WORK_PATH.test(path) && ruleFor(input.vertical ?? 'shop').payload === 'service') return 'article'

  // Trade-specific entry points. A restaurant sells from its menu, a hotel from
  // its rooms, a salon from its treatments. Another page on the same site — a
  // branch page, a “visit us”, a landing page for one neighbourhood — is not
  // that trade's inventory, however much product-like copy it carries.
  // Hospitality is the trade where this matters: a restaurant's branch page
  // and a hotel's destination page carry prices and photographs but are not
  // their menu or their rooms. Retail, services and practices use root-level
  // product and project paths, so the same rule would swallow their inventory.
  if (path && input.vertical) {
    const payload = payloadFor(input.vertical)
    if (payload === 'dish' || payload === 'room') {
      const depth = path.split('/').filter(Boolean).length
      const shelf = INVENTORY_PATH[payload]
      if (depth >= 1 && shelf && !shelf.test(path)) return 'location'
    }
  }

  const title = (input.title ?? '').trim()
  if (title && POLICY_TITLE.test(title)) return 'policy'
  if (title && ARTICLE_TITLE.test(title)) return 'article'
  if (title && ABOUT_TITLE.test(title)) return 'about'
  if (title && PROMO_TITLE.test(title)) return 'promotion'
  return path ? 'inventory' : 'unknown'
}

/** A page that can supply catalogue entries at all. */
export function isInventoryPage(role: PageRole): boolean {
  return role === 'inventory' || role === 'unknown'
}

/* ------------------------------------------------------------------ */
/* Names that are not inventory                                        */
/* ------------------------------------------------------------------ */

/**
 * Legal and policy pages, whatever trade the business is in. These are phrases,
 * not words: “Shipping Tags (x20)” is a product a stationer sells, and only
 * “shipping policy” names a page about the rules.
 */
const POLICY_NAME =
  /\b(?:privacy (?:policy|notice)|cookie (?:policy|notice)|terms(?: (?:and|&) conditions| of (?:service|use))?|legal (?:notice|terms)|gdpr|refund policy|returns policy|shipping (?:policy|info|information)|delivery (?:policy|information)|faqs?|accessibility (?:statement|policy)|modern slavery|complaints? (?:policy|procedure))\b/i
/** Editorial: a post, a caption, a press quote, an archive index. */
const ARTICLE_NAME =
  /\b(?:blog|journal|newsletter|press (?:release|coverage|quotes?)|articles?|insights?|instagram|archive|read more)\b/i
/** Site chrome, including a page that lists things rather than being one. */
const NAV_NAME =
  /^(?:home|shop|store|stores|menu|services|treatments|products|catalogue|catalog|collections?|categories|about(?: us)?|contact(?: us)?|blog|news|journal|more|next|previous|back|view now|shop now|book now|learn more|read more|see all|view all|discover|explore|projects archive|our work|gallery|find us|opening hours)(?:\s*(?:›|»|>|→).*)?$/i
/** A trade's own name for its inventory is a heading, not an entry. */
const HEADING_NAME =
  /^(?:our )?(?:products?|services?|treatments?|menu|price list|rooms?|accommodation|packages?|collections?|shop all|new in|featured|signature|all (?:products|services|treatments|rooms))$/i
/** Hire, packages and loyalty are real offers, but not this trade's inventory. */
const PROMO_NAME = /\b(?:venue hire|private hire|party|hire|packages?|loyalty club|rewards? club|gift vouchers?|newsletter)\b/i
/** Copy a location page uses and a dish description never does. */
const LOCATION_COPY =
  /\b(?:book a table|reserve a table|walk[- ]ins?|find us|opening hours|our restaurant in|our (?:shop|salon|hotel) in|directions|getting here)\b/i

/** A heading shouted in capitals, as printed menus set a course name. */
const SECTION_HEADING = /^[A-Z0-9][A-Z0-9 '’&/+.,-]{2,}$/
/** Instructions to the shopper, not things to buy. */
const OPTION_LABEL = /^(?:choose|select|customi[sz]e|pick)\b/i

/** A name that is a sentence is an article or a caption, not a catalogue line. */
function sentenceLike(name: string): boolean {
  const words = name.trim().split(/\s+/)
  if (words.length >= 12) return true
  return words.length >= 7 && /[.!?]/.test(name) && !/^[A-Z0-9]/.test(name.split(/\s+/)[1] ?? '')
}

/** A section label that says its rows are editorial, not commercial. */
export function sectionPayload(section: string, vertical: VerticalId): Payload | null {
  const name = section.trim()
  if (!name) return null
  if (POLICY_NAME.test(name)) return 'policy'
  if (ARTICLE_NAME.test(name)) return 'article'
  if (/\b(?:locations?|where to find us|visit us)\b/i.test(name)) return 'location'
  if (/\b(?:venue hire|private hire|packages?|offers?|promotions?)\b/i.test(name)) return 'promotion'
  // A section named after the trade holds whatever the trade sells.
  if (HEADING_NAME.test(name)) return payloadFor(vertical)
  return null
}

/**
 * The verdict on one candidate entry.
 *
 * Rules are applied in the order a reader would: is this even a commercial
 * entry, does its page belong to inventory, does the trade sell this kind of
 * thing, and does the entry carry enough evidence to publish.
 */
export function assessItem(input: {
  name: string
  desc?: string
  price?: number
  image?: boolean
  variants?: number
  meta?: string
  capacity?: number
  section?: string
  vertical: VerticalId
  /** The page the entry was read from, when the crawler knows it. */
  source?: string
  /** What the page was, when it has already been classified. */
  role?: PageRole
  /** A price that sat inside this item's own record, not the page's. */
  priceVerified?: boolean
  /** True when the entry came from a product/service record the source itself
   *  declared (JSON-LD, a product feed, embedded data), not from a heading. A
   *  record is evidence of an item even before its price or photograph. */
  fromRecord?: boolean
}): ItemAssessment {
  const rule = ruleFor(input.vertical)
  const name = input.name.trim()
  const desc = (input.desc ?? '').trim()
  const price = input.price ?? 0
  const has = {
    price: price > 0,
    description: desc.length > 0,
    image: Boolean(input.image),
    variant: (input.variants ?? 0) > 0,
    duration: /\b\d+\s*(?:min|mins|minutes|hr|hrs|hour|hours)\b/i.test(`${input.meta ?? ''} ${desc} ${name}`),
    occupancy: /\bsleeps\s+\d|\b\d+\s*(?:guests?|people|persons?)\b/i.test(`${input.meta ?? ''} ${desc}`) || Boolean(input.capacity),
    category: Boolean(input.section?.trim()),
  }
  const evidence = (Object.keys(has) as Requirement[]).filter((key) => has[key])
  const missing = rule.advises.filter((key) => !has[key])

  const refuse = (reason: string, payload: Payload = rule.payload): ItemAssessment => ({
    accept: false,
    payload,
    status: 'rejected',
    reason,
    missing,
    evidence,
  })

  if (!name) return refuse('empty-name')
  if (POLICY_NAME.test(name) || POLICY_NAME.test(desc.slice(0, 120))) return refuse('policy-page', 'policy')
  // A hotel sells rooms. Venue hire and packages are real offers, but they are
  // not rooms and must not be presented as accommodation. Checked before the
  // heading rules, because “Packages” is also a heading.
  if (rule.payload === 'room' && PROMO_NAME.test(name)) return refuse('not-a-room', 'promotion')
  if (sentenceLike(name)) return refuse('article-caption', 'article')
  if (NAV_NAME.test(name) || HEADING_NAME.test(name)) return refuse('navigation', 'navigation')
  if (ARTICLE_NAME.test(name) && rule.payload !== 'product') return refuse('article-page', 'article')
  if (OPTION_LABEL.test(name) && !desc) return refuse('option-label', 'navigation')
  if (/[›»→]|&[a-z#0-9]+;/i.test(name)) return refuse('markup-in-name', 'navigation')

  // A page's own role is evidence about its rows. A privacy policy's headings
  // are not services because they appear on a page with a price elsewhere.
  const role = input.role ?? (input.source ? pageRoleOf({ url: input.source, vertical: input.vertical }) : 'unknown')
  if (role === 'policy') return refuse('policy-page', 'policy')
  if (role === 'article') return refuse('article-page', 'article')
  if (role === 'navigation') return refuse('navigation', 'navigation')
  if (role === 'about') return refuse('about-page', 'navigation')
  if (role === 'contact') return refuse('contact-page', 'navigation')
  if (role === 'location') return refuse('location-page', 'location')
  if (role === 'promotion') return refuse('promotion-page', 'promotion')

  const section = input.section ? sectionPayload(input.section, input.vertical) : null
  if (section === 'policy') return refuse('policy-section', 'policy')
  if (section === 'article') return refuse('article-section', 'article')
  if (section === 'promotion' && rule.payload !== 'product' && rule.payload !== 'dish') {
    return refuse('not-inventory', 'promotion')
  }

  // A restaurant's dish does not tell the reader to book a table or find the
  // nearest branch; a location page does.
  if (rule.payload === 'dish' && !has.price && LOCATION_COPY.test(desc)) return refuse('location-page', 'location')

  if (SECTION_HEADING.test(name) && !has.price && !desc) return refuse('section-heading', 'navigation')

  // Nothing but a name: no price, no words, no picture, no options, no stated
  // capacity or duration. Unless the source declared it in its own product or
  // service record, that is a label or a teaser, not something to sell.
  const substantive = rule.substantive.filter((key) => has[key])
  if (!substantive.length && !input.fromRecord) return refuse('no-commercial-evidence', 'unknown')

  // A price only counts when the source tied it to this item. A figure that
  // happened to sit on the page is cleared by the cleaner, not trusted here.
  const verified = input.priceVerified === true && has.price
  const status: ItemStatus =
    verified || (rule.payload === 'room' && has.occupancy && has.description) || has.description && has.category
      ? 'verified'
      : 'incomplete'
  const reason = missing.length ? `missing ${missing.join(', ')}` : 'evidence complete'
  return { accept: true, payload: rule.payload, status, reason, missing, evidence }
}

/* ------------------------------------------------------------------ */
/* Sections                                                            */
/* ------------------------------------------------------------------ */

export type CatalogueAudit = {
  sections: { name: string; items: MenuItem[] }[]
  rejected: { name: string; section: string; payload: Payload; reason: string }[]
  counts: { accepted: number; verified: number; incomplete: number; rejected: number }
}

/**
 * Filters a catalogue down to the trade's own inventory, recording why every
 * other row was left out. This is deliberately a filter, not a repair: it
 * never edits an item's words, price or photograph to make it qualify.
 */
export function auditCatalogue(
  sections: { name: string; items: MenuItem[] }[],
  vertical: VerticalId,
): CatalogueAudit {
  const out: CatalogueAudit['sections'] = []
  const rejected: CatalogueAudit['rejected'] = []
  let accepted = 0
  let verified = 0
  let incomplete = 0

  for (const section of sections) {
    const items: MenuItem[] = []
    for (const item of section.items) {
      const verdict = assessItem({
        name: item.name,
        desc: item.desc,
        price: item.price,
        image: Boolean(item.image || item.media),
        variants: item.variants?.length ?? 0,
        meta: item.meta,
        capacity: item.capacity,
        section: section.name,
        vertical,
        source: item.sourceUrl,
        priceVerified: item.priceEvidence?.validated,
        fromRecord: item.sourceMethod === 'structured-data' || item.sourceMethod === 'embedded-json',
      })
      if (!verdict.accept) {
        rejected.push({ name: item.name, section: section.name, payload: verdict.payload, reason: verdict.reason })
        continue
      }
      accepted += 1
      if (verdict.status === 'verified') verified += 1
      else incomplete += 1
      items.push(item)
    }
    if (items.length) out.push({ name: section.name, items })
  }

  return {
    sections: out,
    rejected,
    counts: { accepted, verified, incomplete, rejected: rejected.length },
  }
}
