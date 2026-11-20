import type { ElementShape, VerticalId } from './types'
import { themeFor, type NavStyle, type Theme } from './themes'

/**
 * A direction is a whole visual argument, not an accent swap: it changes the
 * type pairing, the layout archetype, the navigation, the surface treatment,
 * the corner language and the density together. Trades get the directions that
 * suit how their customers actually buy: a restaurant can be editorial, casual
 * or luxurious; a clinic can be calm, clinical or minimal.
 */

type Palette = Pick<Theme, 'bg' | 'surface' | 'surface2' | 'ink' | 'muted' | 'line'> & { dark: boolean }

const IVORY: Palette = {
  bg: '#f6f2ea',
  surface: '#fffdf9',
  surface2: '#ece5d9',
  ink: '#1b1712',
  muted: '#776c5e',
  line: 'rgba(27,23,18,0.12)',
  dark: false,
}

const NOIR: Palette = {
  bg: '#101110',
  surface: '#181a18',
  surface2: '#22251f',
  ink: '#f4f1e9',
  muted: '#a09b8f',
  line: 'rgba(244,241,233,0.14)',
  dark: true,
}

const PAPER: Palette = {
  bg: '#fbfaf7',
  surface: '#ffffff',
  surface2: '#f2f0ea',
  ink: '#151515',
  muted: '#6f6c65',
  line: 'rgba(21,21,21,0.1)',
  dark: false,
}

const SAND: Palette = {
  bg: '#f3ede2',
  surface: '#fdf9f1',
  surface2: '#e7dece',
  ink: '#241d15',
  muted: '#7c6d5b',
  line: 'rgba(36,29,21,0.12)',
  dark: false,
}

const MIST: Palette = {
  bg: '#f4f7f7',
  surface: '#ffffff',
  surface2: '#e8efef',
  ink: '#142021',
  muted: '#617072',
  line: 'rgba(20,32,33,0.1)',
  dark: false,
}

const SERIF = 'ui-serif, "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif'
const GROTESK = '"Helvetica Neue", Inter, ui-sans-serif, system-ui, "Segoe UI", Arial, sans-serif'
const HUMANIST = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, "Helvetica Neue", sans-serif'
const CONDENSED = '"Avenir Next Condensed", "Roboto Condensed", "Helvetica Neue Condensed", "Arial Narrow", Arial, sans-serif'

export type DirectionOptions = {
  /** The card layout the direction opens with. */
  variant: 0 | 1 | 2 | 3
  density: 'cozy' | 'standard' | 'roomy'
  cards: ElementShape
  buttons: ElementShape
  nav: NavStyle
}

export type Direction = {
  id: string
  label: string
  blurb: string
  theme: Partial<Theme>
  palette?: Palette
  options: DirectionOptions
}

type Archetype = Omit<Direction, 'id' | 'label' | 'blurb'>

const EDITORIAL: Archetype = {
  theme: {
    layout: 'editorial',
    nav: 'floating',
    display: SERIF,
    body: HUMANIST,
    priceFont: 'display',
    weight: 500,
    tracking: '-0.02em',
    radius: 22,
    accentStyle: 'underline',
    motif: 'arches',
  },
  palette: IVORY,
  options: { variant: 1, density: 'roomy', cards: 'soft', buttons: 'soft', nav: 'floating' },
}

/** Retail's editorial composition: the same typographic argument as EDITORIAL,
 *  with its own catalogue structure. It is offered to trades that sell objects
 *  (a shop, an online store), never forced on a menu or a price list. */
const RETAIL: Archetype = {
  ...EDITORIAL,
  theme: { ...EDITORIAL.theme, layout: 'retail', tracking: '-0.024em' },
  options: { ...EDITORIAL.options, density: 'roomy' },
}

const MODERN: Archetype = {
  theme: {
    layout: 'grid',
    nav: 'dock',
    display: GROTESK,
    body: GROTESK,
    priceFont: 'body',
    weight: 700,
    tracking: '-0.035em',
    radius: 14,
    accentStyle: 'solid',
    motif: 'grid',
  },
  palette: PAPER,
  options: { variant: 0, density: 'standard', cards: 'soft', buttons: 'square', nav: 'dock' },
}

const LUXE: Archetype = {
  theme: {
    layout: 'editorial',
    nav: 'floating',
    display: SERIF,
    body: HUMANIST,
    priceFont: 'display',
    weight: 500,
    tracking: '-0.012em',
    radius: 18,
    accentStyle: 'underline',
    motif: 'rings',
  },
  palette: NOIR,
  options: { variant: 3, density: 'roomy', cards: 'soft', buttons: 'round', nav: 'floating' },
}

const MINIMAL: Archetype = {
  theme: {
    layout: 'rows',
    nav: 'bar',
    display: HUMANIST,
    body: HUMANIST,
    priceFont: 'body',
    weight: 650,
    tracking: '-0.026em',
    radius: 8,
    accentStyle: 'solid',
    motif: 'grid',
  },
  palette: PAPER,
  options: { variant: 2, density: 'standard', cards: 'square', buttons: 'soft', nav: 'bar' },
}

const LIFESTYLE: Archetype = {
  theme: {
    layout: 'grid',
    nav: 'floating',
    display: GROTESK,
    body: HUMANIST,
    priceFont: 'body',
    weight: 700,
    tracking: '-0.03em',
    radius: 22,
    accentStyle: 'solid',
    motif: 'circle',
  },
  palette: SAND,
  options: { variant: 0, density: 'roomy', cards: 'round', buttons: 'round', nav: 'floating' },
}

const WARM: Archetype = {
  theme: {
    layout: 'rows',
    nav: 'floating',
    display: SERIF,
    body: HUMANIST,
    priceFont: 'display',
    weight: 600,
    tracking: '-0.018em',
    radius: 20,
    accentStyle: 'solid',
    motif: 'circle',
  },
  palette: SAND,
  options: { variant: 2, density: 'standard', cards: 'round', buttons: 'round', nav: 'floating' },
}

const CLINICAL: Archetype = {
  theme: {
    layout: 'rows',
    nav: 'bar',
    display: HUMANIST,
    body: HUMANIST,
    priceFont: 'body',
    weight: 620,
    tracking: '-0.022em',
    radius: 16,
    accentStyle: 'solid',
    motif: 'rings',
  },
  palette: MIST,
  options: { variant: 2, density: 'standard', cards: 'soft', buttons: 'soft', nav: 'bar' },
}

const TECHNICAL: Archetype = {
  theme: {
    layout: 'rows',
    nav: 'bar',
    display: CONDENSED,
    body: GROTESK,
    priceFont: 'mono',
    weight: 800,
    tracking: '0.005em',
    radius: 4,
    accentStyle: 'block',
    motif: 'stripes',
  },
  palette: PAPER,
  options: { variant: 2, density: 'cozy', cards: 'square', buttons: 'square', nav: 'bar' },
}

const PERFORMANCE: Archetype = {
  theme: {
    layout: 'stack',
    nav: 'bar',
    display: CONDENSED,
    body: HUMANIST,
    priceFont: 'mono',
    weight: 800,
    tracking: '-0.008em',
    radius: 8,
    accentStyle: 'block',
    motif: 'stripes',
  },
  palette: NOIR,
  options: { variant: 2, density: 'cozy', cards: 'square', buttons: 'square', nav: 'bar' },
}

const BOLD: Archetype = {
  theme: {
    layout: 'stack',
    nav: 'floating',
    display: GROTESK,
    body: GROTESK,
    priceFont: 'mono',
    weight: 800,
    tracking: '-0.045em',
    radius: 16,
    accentStyle: 'block',
    motif: 'letter',
  },
  palette: PAPER,
  options: { variant: 3, density: 'roomy', cards: 'soft', buttons: 'square', nav: 'floating' },
}

const PLAYFUL: Archetype = {
  theme: {
    layout: 'grid',
    nav: 'floating',
    display: HUMANIST,
    body: HUMANIST,
    priceFont: 'body',
    weight: 750,
    tracking: '-0.02em',
    radius: 26,
    accentStyle: 'solid',
    motif: 'circle',
  },
  palette: SAND,
  options: { variant: 0, density: 'roomy', cards: 'round', buttons: 'round', nav: 'floating' },
}

const CLASSIC: Archetype = {
  theme: {
    layout: 'editorial',
    nav: 'dock',
    display: SERIF,
    body: HUMANIST,
    priceFont: 'display',
    weight: 600,
    tracking: '-0.02em',
    radius: 3,
    accentStyle: 'underline',
    motif: 'letter',
  },
  palette: IVORY,
  options: { variant: 2, density: 'standard', cards: 'square', buttons: 'square', nav: 'dock' },
}

const GALLERY: Archetype = {
  theme: {
    layout: 'editorial',
    nav: 'dock',
    display: SERIF,
    body: GROTESK,
    priceFont: 'display',
    weight: 500,
    tracking: '-0.018em',
    radius: 0,
    accentStyle: 'underline',
    motif: 'grid',
  },
  palette: PAPER,
  options: { variant: 1, density: 'roomy', cards: 'square', buttons: 'square', nav: 'dock' },
}

const CINEMA: Archetype = {
  theme: {
    layout: 'stack',
    nav: 'bar',
    display: SERIF,
    body: HUMANIST,
    priceFont: 'display',
    weight: 500,
    tracking: '-0.02em',
    radius: 14,
    accentStyle: 'solid',
    motif: 'arches',
  },
  palette: NOIR,
  options: { variant: 3, density: 'roomy', cards: 'soft', buttons: 'soft', nav: 'bar' },
}

const direction = (id: string, label: string, blurb: string, archetype: Archetype): Direction => ({
  id,
  label,
  blurb,
  ...archetype,
})

/** Every trade has at least three genuinely different directions. */
export const DIRECTIONS: Record<VerticalId, Direction[]> = {
  restaurant: [
    direction('editorial', 'Editorial dining', 'Photo-led, generous, serif-led', EDITORIAL),
    direction('modern', 'Modern casual', 'Fast, friendly, two-column menu', MODERN),
    direction('luxe', 'Premium luxury', 'Dark, quiet, reservations first', LUXE),
  ],
  cafe: [
    direction('editorial', 'Daylight editorial', 'Airy, tactile, slow mornings', EDITORIAL),
    direction('modern', 'Counter service', 'Quick ordering, clean grid', MODERN),
    direction('warm', 'Neighbourhood bakery', 'Warm surfaces, rounded cards', WARM),
  ],
  shop: [
    direction('minimal', 'Minimal boutique', 'Hairlines, list rows, quiet type', MINIMAL),
    direction('editorial', 'Gallery retail', 'One piece per row, large imagery, editorial pacing', RETAIL),
    direction('lifestyle', 'Contemporary lifestyle', 'Soft, photographic, roomy', LIFESTYLE),
  ],
  salon: [
    direction('luxe', 'Luxury beauty', 'Dark, poised, appointment-led', LUXE),
    direction('minimal', 'Modern minimal', 'Calm list, no decoration', MINIMAL),
    direction('editorial', 'Editorial wellness', 'Warm serif, generous spacing', EDITORIAL),
  ],
  gym: [
    direction('performance', 'Performance', 'Dark, condensed, numbers first', PERFORMANCE),
    direction('minimal', 'Studio minimal', 'Light, direct, classe-focused', MINIMAL),
    direction('editorial', 'Editorial fitness', 'Coaching story told visually', EDITORIAL),
  ],
  clinic: [
    direction('clinical', 'Calm clinical', 'Soft mist palette, clear booking', CLINICAL),
    direction('minimal', 'Modern practice', 'Quiet rows, plain language', MINIMAL),
    direction('editorial', 'Considered care', 'Warm, human, editorial', EDITORIAL),
  ],
  trades: [
    direction('technical', 'Direct trades', 'Compact, priced, phone-first', TECHNICAL),
    direction('modern', 'Modern service', 'Clean grid, quote-led', MODERN),
    direction('warm', 'Trusted local', 'Warm, personal, proof-heavy', WARM),
  ],
  professional: [
    direction('classic', 'Classic counsel', 'Understated, serif, fixed fees', CLASSIC),
    direction('minimal', 'Modern advisory', 'Plain, precise, list-led', MINIMAL),
    direction('editorial', 'Editorial practice', 'Warm authority, long-form', EDITORIAL),
  ],
  property: [
    direction('editorial', 'Editorial property', 'Listings as stories, large media', EDITORIAL),
    direction('minimal', 'Modern agency', 'Dense list, fast scanning', MINIMAL),
    direction('luxe', 'Premium homes', 'Dark, cinematic, exclusive', LUXE),
  ],
  hotel: [
    direction('luxe', 'Coastal luxury', 'Dark, quiet, rooms first', LUXE),
    direction('editorial', 'Editorial stay', 'Warm serif, place-led', EDITORIAL),
    direction('minimal', 'Quiet modern', 'Light, restrained, direct booking', MINIMAL),
  ],
  studio: [
    direction('gallery', 'Gallery', 'Full-bleed work, minimal chrome', GALLERY),
    direction('minimal', 'Modern studio', 'Index-like, typographic', MINIMAL),
    direction('editorial', 'Editorial portfolio', 'Narrative, warm, spacious', EDITORIAL),
  ],
  auto: [
    direction('technical', 'Workshop technical', 'Condensed, job-first, compact', TECHNICAL),
    direction('minimal', 'Modern garage', 'Clean, trustworthy, list rows', MINIMAL),
    direction('performance', 'Performance garage', 'Dark, bold, enthusiast-led', PERFORMANCE),
  ],
  hospital: [
    direction('clinical', 'Clear care', 'Mist palette, wayfinding first', CLINICAL),
    direction('minimal', 'Modern hospital', 'Plain, fast, accessible rows', MINIMAL),
    direction('editorial', 'Human care', 'Warm, dignified, story-led', EDITORIAL),
  ],
  ecommerce: [
    direction('minimal', 'Minimal commerce', 'Product grid, no noise', MINIMAL),
    direction('editorial', 'Boutique commerce', 'Lookbook pacing, large media, one piece per row', RETAIL),
    direction('lifestyle', 'Contemporary lifestyle', 'Soft colour, rounded cards', LIFESTYLE),
  ],
  'plants-indoor': [
    direction('editorial', 'Botanical editorial', 'Lush, warm, roomy', EDITORIAL),
    direction('minimal', 'Modern plant shop', 'Clean grid, care notes', MINIMAL),
    direction('lifestyle', 'Green living', 'Soft surfaces, lifestyle imagery', LIFESTYLE),
  ],
  'plants-outdoor': [
    direction('technical', 'Grower technical', 'Compact, seasonal, practical', TECHNICAL),
    direction('editorial', 'Nursery editorial', 'Warm, outdoor, photo-led', EDITORIAL),
    direction('minimal', 'Modern garden', 'Clean rows, clear prices', MINIMAL),
  ],
  courses: [
    direction('modern', 'Modern learning', 'Structured grid, progress-led', MODERN),
    direction('editorial', 'Editorial academy', 'Serif, long-form, considered', EDITORIAL),
    direction('technical', 'Practical school', 'Dense, outcome-focused', TECHNICAL),
  ],
  tuition: [
    direction('editorial', 'Editorial tuition', 'Warm, academic, reassuring', EDITORIAL),
    direction('minimal', 'Modern tuition', 'Clear programmes, tidy rows', MINIMAL),
    direction('warm', 'Friendly centre', 'Rounded, personal, calm', WARM),
  ],
  school: [
    direction('warm', 'Friendly school', 'Open, warm, community-led', WARM),
    direction('minimal', 'Modern school', 'Clear information, quiet UI', MINIMAL),
    direction('editorial', 'Editorial school', 'Stories and term highlights', EDITORIAL),
  ],
  kindergarten: [
    direction('playful', 'Playful days', 'Rounded, bright, tactile', PLAYFUL),
    direction('warm', 'Gentle start', 'Soft, calm, parent-first', WARM),
    direction('minimal', 'Modern nursery', 'Clean sessions and fees', MINIMAL),
  ],
  finance: [
    direction('classic', 'Classic advice', 'Understated serif, fixed fees', CLASSIC),
    direction('minimal', 'Modern advisory', 'Plain numbers, quiet rows', MINIMAL),
    direction('editorial', 'Editorial finance', 'Warm authority, explainers', EDITORIAL),
  ],
  agency: [
    direction('bold', 'Bold studio', 'Large type, case studies first', BOLD),
    direction('minimal', 'Modern agency', 'Index-like, restrained', MINIMAL),
    direction('editorial', 'Editorial agency', 'Strategy told as stories', EDITORIAL),
  ],
  influencer: [
    direction('bold', 'Creator bold', 'High contrast, format-led', BOLD),
    direction('editorial', 'Editorial creator', 'Magazine pacing, warm', EDITORIAL),
    direction('minimal', 'Modern creator', 'Clean rate card, quiet', MINIMAL),
  ],
  portfolio: [
    direction('gallery', 'Gallery portfolio', 'Work first, chrome last', GALLERY),
    direction('minimal', 'Modern portfolio', 'Type-led index', MINIMAL),
    direction('editorial', 'Editorial portfolio', 'Narrative, warm, spacious', EDITORIAL),
  ],
  film: [
    direction('cinema', 'Cinematic', 'Dark, poster-led, widescreen', CINEMA),
    direction('editorial', 'Editorial film', 'Warm serif, story-first', EDITORIAL),
    direction('minimal', 'Modern film', 'Quiet type, screening details', MINIMAL),
  ],
  gallery: [
    direction('gallery', 'White cube', 'Minimal chrome, full-bleed art', GALLERY),
    direction('editorial', 'Editorial gallery', 'Warm, narrative, exhibition-led', EDITORIAL),
    direction('minimal', 'Modern gallery', 'List-led, practical visiting', MINIMAL),
  ],
  marketplace: [
    direction('minimal', 'Modern market', 'Dense grid, fast search', MINIMAL),
    direction('lifestyle', 'Weekend market', 'Warm, vendor-led, roomy', LIFESTYLE),
    direction('editorial', 'Editorial market', 'Stories behind the stalls', EDITORIAL),
  ],
}

export function directionsFor(vertical: VerticalId): Direction[] {
  return DIRECTIONS[vertical] ?? DIRECTIONS.restaurant
}

export function directionFor(vertical: VerticalId, id: string | undefined): Direction {
  const list = directionsFor(vertical)
  return list.find((entry) => entry.id === id) ?? list[0]
}

/** A typography override that still leaves the direction's palette intact. */
export function typographyTheme(value: 'editorial' | 'modern' | 'compact' | undefined): Partial<Theme> {
  if (value === 'editorial')
    return { display: SERIF, body: HUMANIST, priceFont: 'display', weight: 500, tracking: '-0.02em' }
  if (value === 'modern')
    return { display: GROTESK, body: GROTESK, priceFont: 'body', weight: 700, tracking: '-0.035em' }
  if (value === 'compact')
    return { display: CONDENSED, body: GROTESK, priceFont: 'mono', weight: 800, tracking: '0em' }
  return {}
}

/** The trade theme with the direction's palette and type system applied. */
export function themeForDirection(vertical: VerticalId, id: string | undefined): Theme {
  const base = themeFor(vertical)
  const direction = directionFor(vertical, id)
  return {
    ...base,
    ...(direction.palette ?? {}),
    ...direction.theme,
    nav: direction.options.nav,
    shell: base.shell,
  }
}
