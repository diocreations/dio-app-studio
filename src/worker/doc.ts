import { sanitizeHex } from './pricing'
import type { AppSpec } from './types'
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
]

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

export type DocNode = {
  id: string
  kind: SectionKind
  title?: string
  text?: string
  cta?: { label: string; screen: string }
  style: SectionStyle
  responsive: Responsive
  hidden: boolean
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

export type Doc = {
  v: 2
  accent?: string
  /** Screen id the app opens on. */
  initialScreen: string
  screens: ScreenNode[]
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
    initialScreen: initial?.id ?? 'scr_home',
    screens,
  }
}

/** The home screen, which always exists. */
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
  return {
    id,
    kind,
    title: CLAMP(raw.title, 60) || undefined,
    text: CLAMP(raw.text, 600) || undefined,
    ...(ctaLabel && SCREEN_TARGET.test(screenTarget)
      ? { cta: { label: ctaLabel, screen: screenTarget } }
      : {}),
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
  }
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
    const initial = screens.find((entry) => entry.id === raw.initialScreen) ?? screens[0]!
    return { v: 2, accent, initialScreen: initial.id, screens }
  }

  // Version 1: one implicit screen holding the saved sections.
  const legacySections = Array.isArray(raw.sections) ? sanitizeSections(raw.sections) : []
  const screens = fallback.screens.map((entry) =>
    entry.kind === 'home' && legacySections.length ? { ...entry, sections: legacySections } : entry,
  )
  return {
    v: 2,
    accent,
    initialScreen: fallback.initialScreen,
    screens,
  }
}

/** A screen id that is not in use yet. */
function nextScreenId(doc: Doc, kind: ScreenKind): string {
  const base = `scr_${kind}`
  if (!doc.screens.some((entry) => entry.id === base)) return base
  let index = 2
  while (doc.screens.some((entry) => entry.id === `${base}_${index}`)) index += 1
  return `${base}_${index}`
}

/** A node id that is not in use on a screen, so additions stay addressable. */
function nextSectionId(screenNode: ScreenNode, kind: SectionKind): string {
  const base = `sec_${kind}`
  if (!screenNode.sections.some((entry) => entry.id === base)) return base
  let index = 2
  while (screenNode.sections.some((entry) => entry.id === `${base}_${index}`)) index += 1
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
  const defaults = SCREEN_DEFAULT_SECTIONS[kind]?.(spec) ?? []
  const entry = screen(kind, {
    id: nextScreenId(doc, kind),
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
  return { ...doc, screens, initialScreen: initial }
}

export function duplicateScreen(doc: Doc, id: string): Doc {
  const index = doc.screens.findIndex((entry) => entry.id === id)
  if (index < 0 || doc.screens[index].kind === 'home') return doc
  const source = doc.screens[index]
  const clone: ScreenNode = {
    ...source,
    id: nextScreenId(doc, source.kind === 'custom' ? 'custom' : 'custom'),
    kind: 'custom',
    name: `${source.name} copy`.slice(0, 24),
    nav: false,
    sections: source.sections.map((entry) => ({ ...entry, id: `${entry.id}_copy` })),
  }
  const screens = [...doc.screens]
  screens.splice(index + 1, 0, clone)
  return { ...doc, screens }
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
  if (!screenById(doc, id)) return doc
  return { ...doc, initialScreen: id }
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
              section(kind, { id: nextSectionId(entry, kind), ...defaults[kind] }),
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
  return {
    ...doc,
    screens: doc.screens.map((entry) => {
      if (entry.id === fromScreenId)
        return { ...entry, sections: entry.sections.filter((section) => section.id !== id) }
      if (entry.id === toScreenId)
        return { ...entry, sections: [...entry.sections, { ...node, id: nextId }] }
      return entry
    }),
  }
}

export function duplicateSection(doc: Doc, screenId: string, id: string): Doc {
  const target = screenById(doc, screenId)
  if (!target) return doc
  const index = target.sections.findIndex((node) => node.id === id)
  if (index < 0) return doc
  const source = target.sections[index]
  if (source.kind === 'hero') return doc
  const clone: DocNode = {
    ...source,
    id: nextSectionId(target, source.kind),
    title: source.title ? `${source.title} (copy)` : source.title,
  }
  const sections = [...target.sections]
  sections.splice(index + 1, 0, clone)
  return {
    ...doc,
    screens: doc.screens.map((entry) => (entry.id === screenId ? { ...entry, sections } : entry)),
  }
}

export function updateSection(
  doc: Doc,
  screenId: string,
  id: string,
  patch: Partial<Pick<DocNode, 'title' | 'text' | 'hidden' | 'style' | 'responsive' | 'cta'>>,
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
                    ...(patch.hidden !== undefined ? { hidden: Boolean(patch.hidden) } : {}),
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
