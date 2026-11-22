import { appCss } from './appCss'
import { blueprintFor } from './blueprints'
import {
  appScreenId,
  homeSections,
  initialAppScreen,
  navScreens,
  normalizeDoc,
  screenFor,
  type Doc,
  type DocNode,
  type ScreenKind,
  type ScreenNode,
  type SectionKind,
} from './doc'
import { directionFor, themeForDirection, typographyTheme } from './directions'
import { FLAGSHIP_TRADES, flagshipCatalogLead, flagshipCss, flagshipHome, flagshipSection } from './flagship'
import { presetCss, presetFor } from './presets'
import { CURRENCY_SYMBOLS, inkFor, moneyForSpec } from './pricing'
import type { AppSpec, FeatureId, MenuItem, MenuSection, Vocab } from './types'
import { actionLabelsFor, ctaFor, verticalFor, type Vertical } from './verticals'
import { themeFor, type ShellId, type Theme } from './themes'

/*
 * The artefact: a generated app that behaves like an installed application —
 * splash, fixed chrome, pushed detail screens, bottom sheets, haptics — and
 * looks like the trade it was built for, because the theme, type pairing,
 * layout archetype and navigation style all change with the vertical.
 */

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export const NAV_ICON_NAMES = [
  'home',
  'catalog',
  'bag',
  'calendar',
  'dots',
  'plus',
  'chevron',
  'phone',
  'search',
  'heart',
  'quote',
] as const

function icon(
  name:
    | 'home'
    | 'catalog'
    | 'bag'
    | 'calendar'
    | 'dots'
    | 'plus'
    | 'minus'
    | 'chevron'
    | 'phone'
    | 'close'
    | 'check'
    | 'quote'
    | 'arrow'
    | 'search'
    | 'heart'
    | 'heartFilled',
): string {
  const paths: Record<string, string> = {
    home: '<path d="M4 11.2 12 4l8 7.2V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/>',
    catalog: '<path d="M4 7h16M4 12h16M4 17h10"/>',
    bag: '<path d="M6 8h12l-1 12H7zM9.5 8V6.5a2.5 2.5 0 0 1 5 0V8"/>',
    calendar: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M9 19v-4"/>',
    dots: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    chevron: '<path d="M9 6l6 6-6 6"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    phone: '<path d="M6 3h3l2 5-2.5 1.5a12 12 0 0 0 6 6L16 13l5 2v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4 5.2 2 2 0 0 1 6 3z"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    check: '<path d="M4 12.5 9.5 18 20 6.5"/>',
    quote: '<path d="M4 6h16M4 11h10M4 16h7"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16.2 16.2 20.5 20.5"/>',
    heart: '<path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9z"/>',
    heartFilled:
      '<path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9z" fill="currentColor" stroke="none"/>',
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`
}

/** Blend two hex colours, so a brand accent never disappears into a dark theme. */
function mixHex(from: string, to: string, amount: number): string {
  const parse = (hex: string) => {
    const value = hex.replace('#', '')
    return [
      parseInt(value.slice(0, 2), 16),
      parseInt(value.slice(2, 4), 16),
      parseInt(value.slice(4, 6), 16),
    ]
  }
  const a = parse(from)
  const b = parse(to)
  const blend = a.map((channel, index) =>
    Math.round(channel + (b[index] - channel) * amount)
      .toString(16)
      .padStart(2, '0'),
  )
  return `#${blend.join('')}`
}

function luminance(hex: string): number {
  const value = hex.replace('#', '')
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

/** Keep a customer's brand colour legible on whatever background the theme uses. */
function legibleAccent(accent: string, dark: boolean): string {
  const value = luminance(accent)
  if (dark && value < 0.24) return mixHex(accent, '#ffffff', 0.5)
  if (!dark && value > 0.9) return mixHex(accent, '#000000', 0.35)
  return accent
}

/** No price means no price line. “On request” is only used when the business
 *  itself says so, never as a stand-in for a value the import failed to read. */
function priceOf(item: MenuItem, spec: AppSpec): string {
  return item.price > 0 ? moneyForSpec(item.price, spec) : ''
}

/** The options a product really has: more than one price to choose between. A
 *  single-variant product keeps the plain price it always had. */
function pricedVariants(item: MenuItem): { name: string; price: number }[] {
  return (item.variants ?? []).filter((variant) => variant.price > 0)
}

function hasChoices(item: MenuItem): boolean {
  const variants = pricedVariants(item)
  return variants.length > 1 && new Set(variants.map((variant) => variant.price)).size > 1
}

/** "From £42" only when the options actually differ in price. */
function priceFrom(item: MenuItem, spec: AppSpec): string {
  if (!hasChoices(item)) return priceOf(item, spec)
  const prices = pricedVariants(item).map((variant) => variant.price)
  return 'From ' + moneyForSpec(Math.min(...prices), spec)
}

function optionCount(item: MenuItem): string {
  const count = pricedVariants(item).length
  return count > 1 ? count + ' options' : ''
}

/**
 * FNV-1a plus an avalanche step, so one seed gives unrelated values for the
 * photo choice and the variation deck.
 */
function hashSeed(seed: string, salt: number): number {
  let hash = 2166136261 ^ salt
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  hash ^= hash >>> 15
  hash = Math.imul(hash, 2246822507)
  hash ^= hash >>> 13
  hash = Math.imul(hash, 3266489909)
  hash ^= hash >>> 16
  return hash >>> 0
}

function motif(theme: Theme, label: string, extra = '', inner = ''): string {
  return `<span class="thumb ${extra} m-${theme.motif}">${inner}<span class="mono">${esc(label)}</span></span>`
}

/** Two initials make an absent photograph read as a designed mark rather
 *  than a broken image. The full name stays in `data-label` for the editor. */
function mediaMark(label = ''): string {
  const words = String(label).replace(/[^\p{L}\p{N} ]+/gu, ' ').trim().split(/\s+/).filter(Boolean)
  const mark = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '').slice(0, 2)
  return mark.toUpperCase() || '·'
}

/** Product imagery has one quiet absence state everywhere: no trade artwork,
 *  no invented object, just a composed mark in the brand's own type. */
function missingMedia(label = ''): string {
  return `<span class="media-missing" data-label="${esc(label)}" data-mark="${esc(mediaMark(label))}" aria-hidden="true"><svg class="media-missing-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="m21 15-5-5L5 19"/></svg><span class="media-missing-note">Image not supplied</span><span class="media-missing-label">${esc(label)}</span></span>`
}

/** Item keys are `section-item`; walking them in order keeps every product or
 *  dish on a different photograph instead of letting a hash collide. */
function photoIndex(ctx: Ctx, seed: string): number {
  const key = /^(\d+)-(\d+)$/.exec(seed)
  if (!key) return hashSeed(`${ctx.spec.name}|${seed}`, 7)
  const sectionIndex = Number(key[1])
  const itemIndex = Number(key[2])
  let index = 0
  for (let i = 0; i < sectionIndex && i < ctx.spec.menu.length; i += 1) index += ctx.spec.menu[i].items.length
  return index + itemIndex
}

/**
 * A topic-matched photo. Flagship trades use their local, responsive library;
 * other trades use a Pexels pool when a key is configured. Without a usable
 * image the artwork still carries the page.
 */
function photo(ctx: Ctx, seed: string, kind: 'wide' | 'thumb', alt = ''): string {
  // An imported business is never dressed in this trade's stock photography.
  // Its own image, when it has one, travels on the item or the hero.
  if (ctx.spec.website) return ''
  const urls = ctx.photos[kind]
  if (!urls.length) return ''
  const url = urls[photoIndex(ctx, seed) % urls.length]
  const local = /^(.*)-\d+\.webp$/.exec(url)
  const srcset = local
    ? ` srcset="${esc(local[1])}-320.webp 320w, ${esc(local[1])}-640.webp 640w, ${esc(local[1])}-1280.webp 1280w" sizes="${kind === 'wide' ? '100vw' : '(max-width: 620px) 38vw, 200px'}"`
    : ''
  return `<img class="photo" src="${esc(url)}"${srcset} alt="${esc(alt)}" loading="lazy" decoding="async" onerror="this.parentElement.classList.add(&quot;is-empty&quot;);this.remove()" />`
}

/** An owner-assigned catalogue photograph. The media id, not a URL, is stored
 *  on the item; the token only lives in this rendered page. */
function itemPhoto(
  ctx: Ctx,
  media: MenuItem['media'],
  kind: 'wide' | 'thumb',
  alt = '',
): string {
  if (!media) return ''
  const base = `/p/${ctx.token}/media/${media.id}`
  return `<img class="photo" src="${esc(base)}/640.webp" srcset="${esc(base)}/320.webp 320w, ${esc(base)}/640.webp 640w, ${esc(base)}/1280.webp 1280w" sizes="${kind === 'wide' ? '100vw' : '(max-width: 620px) 38vw, 200px'}" alt="${esc(media.alt || alt || '')}" loading="lazy" decoding="async" style="object-fit:${media.fit === 'contain' ? 'contain' : 'cover'};object-position:${media.focalX ?? 50}% ${media.focalY ?? 50}%" onerror="this.parentElement.classList.add(&quot;is-empty&quot;);this.remove()" />`
}

/** Photography replaces the artwork where it does the most for the page. */
function showsPhoto(ctx: Ctx, where: 'hero' | 'detail' | 'tile'): boolean {
  return where === 'hero' ? ctx.media !== 'art' : ctx.media === 'photo'
}

type Ctx = {
  spec: AppSpec
  theme: Theme
  vertical: Vertical
  /** The business's own category when it has one, else the trade's label. */
  label: string
  vocab: Vocab
  accent: string
  onAccent: string
  ordering: boolean
  booking: boolean
  quoting: boolean
  /** Per-build corner language, applied to the trade's own radius. */
  radiusScale: number
  /** How much of the app uses photography instead of generated artwork. */
  media: 'photo' | 'mixed' | 'art'
  /** Seeded hero composition, home section order and hero scale. */
  hero: HeroComposition
  order: HomeOrder
  heroScale: HeroScale
  /** Trade-matched photos, resolved by the server; empty means artwork only. */
  photos: { wide: string[]; thumb: string[] }
  /** Token used by owner-uploaded media URLs. */
  token: string
  timetable: { name: string; when: string; coach: string }[]
  goal: number
  actions: { label: string; screen: string }[]
  /** The editable document, or null for a build that predates the editor. */
  doc: Doc | null
  /** Editor mode: sample content stays visible and labelled, never hidden. */
  editor: boolean
}

/** A section heading the customer renamed in the editor, else the design's. */
function sectionTitle(ctx: Ctx, kind: SectionKind, fallback: string): string {
  return homeSections(ctx.doc).find((node) => node.kind === kind)?.title || fallback
}

/** A document screen reference becomes the DOM id the app shell navigates to. */
function appTarget(ctx: Ctx, target: string): string {
  const screen = ctx.doc?.screens.find((entry) => entry.id === target)
  return screen ? appScreenId(screen) : target
}

/** The hero's words come from the document, so inline edits show everywhere. */
function heroCopy(ctx: Ctx): { name: string; tagline: string; cta?: { label: string; screen: string } } {
  const hero = homeSections(ctx.doc).find((node) => node.kind === 'hero')
  return {
    name: hero?.title || ctx.spec.name,
    tagline: hero?.text || ctx.spec.tagline,
    cta: hero?.cta,
  }
}

const CSS = (ctx: Ctx) => appCss(ctx)

type HeroComposition = 'image' | 'split' | 'centered' | 'none'
type HomeOrder = 'catalog' | 'offers' | 'visit' | 'rewards'
type HeroScale = 'compact' | 'regular' | 'tall' | 'immersive'

const HERO_COMPOSITIONS: readonly HeroComposition[] = ['image', 'split', 'centered', 'none']
const HOME_ORDERS: readonly HomeOrder[] = ['catalog', 'offers', 'visit', 'rewards']
const HERO_SCALES: readonly HeroScale[] = ['compact', 'regular', 'tall', 'immersive']

function choose<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

/** The seeded composition, unless their imported structure already owns it. */
function heroClass(ctx: Ctx, base: string): string {
  return `${base} is-${ctx.hero}`
}

function lHero(ctx: Ctx): string {
  const hours = (ctx.spec.hours ?? '').split('·')[0].trim()
  const primary = ctx.actions[0]
  const copy = heroCopy(ctx)
  return `<div class="${heroClass(ctx, 'l-hero')}">
    <span class="hero-art m-${ctx.theme.motif}" aria-hidden="true">${showsPhoto(ctx, 'hero') ? photo(ctx, 'hero', 'wide') : ''}<span class="mono">${esc(ctx.spec.logo)}</span></span>
    <div class="hero-in">
      <span class="eyebrow">${esc(ctx.label)}</span>
      <h1>${esc(copy.name)}</h1>
      ${copy.tagline ? `<p>${esc(copy.tagline)}</p>` : ''}
      <div class="hero-foot">
        ${primary ? `<button class="btn hero-cta" type="button" data-go="${primary.screen}">${esc(primary.label)}</button>` : ''}
        ${hours ? `<span class="hero-meta">${esc(hours)}</span>` : ''}
      </div>
    </div>
  </div>`
}

/** A magazine cover: the trade's artwork, its name set large. */
function cover(ctx: Ctx, meta: string[] = []): string {
  const copy = heroCopy(ctx)
  return `<div class="${heroClass(ctx, 'cover')}">
    <span class="cover-art m-${ctx.theme.motif}" aria-hidden="true">${showsPhoto(ctx, 'hero') ? photo(ctx, 'cover', 'wide') : ''}</span>
    <span class="mono" aria-hidden="true">${esc(ctx.spec.logo)}</span>
    <div class="cover-in">
      <span class="eyebrow">${esc(ctx.label)}</span>
      <h1>${esc(copy.name)}</h1>
      ${copy.tagline ? `<p>${esc(copy.tagline)}</p>` : ''}
      ${meta.filter(Boolean).length ? `<div class="cover-rule"></div><div class="cover-meta">${meta.filter(Boolean).map((line) => `<span>${esc(line)}</span>`).join('')}</div>` : ''}
    </div>
  </div>`
}

/** Everything except the action the hero already offers. */
function secondaryActions(ctx: Ctx): string {
  const rest = ctx.actions.slice(1)
  if (!rest.length) return ''
  return `<div class="actions">${rest
    .map((action) => `<button class="btn ghost" type="button" data-go="${action.screen}">${esc(action.label)}</button>`)
    .join('')}</div>`
}

function actions(ctx: Ctx): string {
  return `<div class="actions">
    ${ctx.actions
      .map(
        (action, index) =>
          `<button class="btn${index ? ' ghost' : ' accent'}" type="button" data-go="${action.screen}">${esc(action.label)}</button>`,
      )
      .join('')}
  </div>`
}

type Tab = { id: string; label: string; glyph: string; kind: 'screen' | 'cart' }

/** Tabs are part of the trade's identity, not a shared constant. */
function tabsFor(ctx: Ctx, shell: ShellId): Tab[] {
  const { vocab } = ctx
  const screen = (id: string, label: string, glyph: string): Tab => ({ id, label, glyph, kind: 'screen' })
  if (shell === 'menu')
    return [
      screen('catalog', 'Menu', icon('catalog')),
      ...(ctx.booking ? [screen('book', 'Book', icon('calendar'))] : []),
      ...(ctx.ordering ? [{ id: 'cart', label: vocab.order, glyph: icon('bag'), kind: 'cart' as const }] : []),
      screen('more', 'Visit', icon('dots')),
    ]
  if (shell === 'session')
    return [
      screen('home', 'Today', icon('home')),
      screen('catalog', 'Classes', icon('catalog')),
      ...(ctx.booking ? [screen('book', 'Plan', icon('calendar'))] : []),
      screen('more', 'You', icon('dots')),
    ]
  if (shell === 'care')
    return [
      screen('home', 'Visit', icon('home')),
      screen('catalog', 'Care', icon('catalog')),
      ...(ctx.booking ? [screen('book', 'Book', icon('calendar'))] : []),
      screen('more', 'Contact', icon('dots')),
    ]
  if (shell === 'listing')
    return [
      screen('catalog', 'Search', icon('search')),
      screen('saved', 'Saved', icon('heart')),
      ...(ctx.booking
        ? [screen('book', 'Viewings', icon('calendar'))]
        : ctx.quoting
          ? [screen('quote', 'Enquire', icon('quote'))]
          : []),
      screen('more', 'More', icon('dots')),
    ]
  return [
    screen('home', 'Home', icon('home')),
    screen('catalog', vocab.catalog, icon('catalog')),
    ...(ctx.ordering ? [{ id: 'cart', label: vocab.order, glyph: icon('bag'), kind: 'cart' as const }] : []),
    ...(ctx.booking ? [screen('book', vocab.book, icon('calendar'))] : []),
    ...(ctx.quoting && !ctx.booking ? [screen('quote', 'Quote', icon('quote'))] : []),
    screen('more', 'More', icon('dots')),
  ].slice(0, 5)
}

/** Navigation comes from the application document, not the seeded deck. */
function tabsFromDoc(doc: Doc): Tab[] {
  return navScreens(doc).map((entry) => ({
    id: appScreenId(entry),
    label: entry.name,
    glyph: icon(entry.icon),
    kind: 'screen' as const,
  }))
}

/** The first screen a trade opens on, and the strip above its home content. */
function shellOpener(ctx: Ctx, shell: ShellId): string {
  if (shell === 'session') {
    const rows = ctx.timetable.slice(0, 3)
    return `<div class="sess-today">
      <span class="eyebrow">Today</span>
      ${(ctx.spec.hours || '').split('·')[0].trim() ? `<h2>${esc((ctx.spec.hours || '').split('·')[0].trim())}</h2>` : ''}
      ${rows
        .map(
          (row) =>
            `<div class="sess-row"><b>${esc(row.name)}</b><span>${esc(row.when)}</span>${ctx.spec.sampleContent?.team ? '' : `<em>${esc(row.coach)}</em>`}</div>`,
        )
        .join('')}
      ${rows.length ? '' : `<p class="tiny dim">The timetable is being written for this week.</p>`}
    </div>`
  }
  if (shell === 'care')
    return `<div class="care-visit">
      <span class="eyebrow">${esc(ctx.label)}</span>
      <b>${esc(ctx.spec.hours)}</b>
      <span class="care-addr">${esc(ctx.spec.address)}</span>
      ${ctx.spec.phone ? `<a class="btn ghost" href="tel:${esc(ctx.spec.phone.replace(/\s/g, ''))}">Call the clinic</a>` : ''}
    </div>`
  if (shell === 'listing')
    return `<div class="listing-lead">
      <button class="search-pill" type="button" data-search-open>${icon('search')}<span>Search ${esc(ctx.vocab.catalog.toLowerCase())}</span></button>
      <div class="listing-count"><b>${ctx.spec.menu.reduce((total, section) => total + section.items.length, 0)}</b><span>live listings</span></div>
    </div>`
  return ''
}

/** The menu is the restaurant's front page: set the name and hours as a
 *  masthead before the bill of fare, the way a printed menu does. */
function menuMasthead(ctx: Ctx): string {
  const hours = (ctx.spec.hours ?? '').split('·')[0].trim()
  return `<div class="menu-masthead">
    <span class="eyebrow">${esc(ctx.label)}</span>
    <h1>${esc(ctx.spec.name)}</h1>
    <p>${esc(ctx.spec.tagline)}</p>
    <div class="menu-masthead-row">
      ${hours ? `<span>${esc(hours)}</span>` : ''}
      ${ctx.spec.address ? `<span>${esc(ctx.spec.address)}</span>` : ''}
    </div>
  </div>`
}

function offersBlock(ctx: Ctx, limit = 2): string {
  if (!ctx.spec.features.includes('offers') || !ctx.spec.offers.length) return ''
  return `<div class="sect"><span class="label">${esc(sectionTitle(ctx, 'offers', 'Right now'))}</span><span class="tiny dim">${ctx.spec.offers.length} live</span></div>
    ${ctx.spec.offers
      .slice(0, limit)
      .map(
        (offer) =>
          `<div class="offer"><div class="spark">✳</div><div><b>${esc(offer.title)}</b><p>${esc(offer.body)}</p></div></div>`,
      )
      .join('')}`
}

function loyaltyBlock(ctx: Ctx): string {
  if (!ctx.spec.features.includes('loyalty')) return ''
  return `<div class="loyalty">
    <b>${esc(ctx.spec.loyalty.reward)}</b>
    <p>Collect ${ctx.goal} visits.</p>
    <div class="stamps" data-stamps></div>
  </div>`
}

function hoursBlock(ctx: Ctx): string {
  const { spec } = ctx
  const phone = (spec.phone ?? '').trim()
  const email = (spec.email ?? '').trim()
  const address = (spec.address ?? '').trim()
  const pill =
    'display:inline-flex;align-items:center;gap:6px;padding:8px 13px;border-radius:999px;' +
    'border:1px solid color-mix(in srgb, currentColor 22%, transparent);font-size:12px;' +
    'text-decoration:none;color:inherit;letter-spacing:0.02em'
  const links: string[] = []
  if (address)
    links.push(
      `<a style="${pill}" href="https://maps.google.com/?q=${encodeURIComponent(address)}" target="_blank" rel="noopener">Directions</a>`,
    )
  if (spec.website)
    links.push(
      `<a style="${pill}" href="${esc(spec.website)}" target="_blank" rel="noopener">Website</a>`,
    )
  for (const social of (spec.socials ?? []).slice(0, 3))
    links.push(
      `<a style="${pill}" href="${esc(social.url)}" target="_blank" rel="noopener">${esc(social.label)}</a>`,
    )

  return `<div class="info">
    <h3>${esc(sectionTitle(ctx, 'visit', 'Find us'))}</h3>
    ${spec.hours ? `<p>${esc(spec.hours)}</p>` : ''}
    ${address ? `<p>${esc(address)}</p>` : ''}
    ${phone ? `<p><a href="tel:${esc(phone.replace(/[^\d+]/g, ''))}">${esc(phone)}</a></p>` : ''}
    ${email ? `<p><a href="mailto:${esc(email)}">${esc(email)}</a></p>` : ''}
    ${links.length ? `<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:12px">${links.join('')}</div>` : ''}
  </div>`
}

function timetableBlock(ctx: Ctx): string {
  if (!ctx.timetable.length) return ''
  return `<div class="sect"><span class="label">This week</span><span class="tiny dim">${ctx.timetable.length} classes</span></div>
    <div class="timetable">
      ${ctx.timetable
        .map(
          (session, index) =>
            `<div class="session"><div><b>${esc(session.name)}</b><span>${esc(session.when)}${ctx.spec.sampleContent?.team ? '' : ` · ${esc(session.coach)}`}</span></div>
             <button type="button" data-reserve="${index}">Reserve</button></div>`,
        )
        .join('')}
    </div>`
}

function saveButton(key: string, name: string, extra = ''): string {
  return `<button class="save${extra}" type="button" data-save="${key}" aria-label="Save ${esc(name)}" aria-pressed="false">${icon('heart')}</button>`
}

function itemRowEditorial(ctx: Ctx, item: MenuItem, key: string): string {
  return `<div class="h-row" data-item="${key}" role="button" tabindex="0">
    <div>
      <div class="name">${esc(item.name)}${item.tag ? ` <span class="tag">${esc(item.tag)}</span>` : ''}</div>
      ${item.desc ? `<div class="desc">${esc(item.desc)}</div>` : ''}
      ${item.meta ? `<div class="meta">${esc(item.meta)}</div>` : ''}
      ${optionCount(item) ? `<div class="meta">${esc(optionCount(item))}</div>` : ''}
    </div>
    <div class="right">
      <div class="price">${priceFrom(item, ctx.spec)}</div>
      <div class="row-tools">
        ${saveButton(key, item.name)}
        ${ctx.ordering && item.price > 0 ? `<button class="add" type="button" data-add="${key}" aria-label="Add ${esc(item.name)}">${icon('plus')}</button>` : ''}
      </div>
    </div>
  </div>`
}

function itemRowCompact(ctx: Ctx, item: MenuItem, key: string): string {
  return `<div class="r-row" data-item="${key}" role="button" tabindex="0">
    ${artThumb(ctx, key, 'r-art', 'thumb', item.name, item.media, item.image)}
    <div class="lead">
      <div class="name">${esc(item.name)}${item.tag ? ` <span class="tag">${esc(item.tag)}</span>` : ''}</div>
      ${item.desc ? `<div class="desc">${esc(item.desc)}</div>` : ''}
      ${item.meta ? `<div class="desc">${esc(item.meta)}</div>` : ''}
      ${optionCount(item) ? `<div class="desc">${esc(optionCount(item))}</div>` : ''}
    </div>
    <div class="tail">
      <span class="price">${priceFrom(item, ctx.spec)}</span>
      ${saveButton(key, item.name)}
      ${ctx.ordering && item.price > 0 ? `<button class="add" type="button" data-add="${key}" aria-label="Add ${esc(item.name)}">${icon('plus')}</button>` : icon('chevron')}
    </div>
  </div>`
}

/** A photograph the source site published for this exact item. Served from the
 *  source's own public URL, so nothing is copied without permission; if it
 *  fails, the generated artwork underneath stays visible. */
function sitePhoto(image: NonNullable<MenuItem['image']>, kind: 'wide' | 'thumb', alt = ''): string {
  const sizes = kind === 'wide' ? '100vw' : '(max-width: 620px) 38vw, 200px'
  const fit = image.fit === 'contain' ? 'contain' : 'cover'
  const position = `${image.positionX ?? 50}% ${image.positionY ?? 50}%`
  return `<img class="photo" src="${esc(image.url)}" sizes="${sizes}" alt="${esc(image.alt || alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" style="object-fit:${fit};object-position:${position}" onerror="this.parentElement.classList.add(&quot;is-empty&quot;);this.remove()" />`
}

/** The same thumb, with a photo on top when this build uses photography. An
 *  owner's own upload wins over the source site's photograph. */
function artThumb(
  ctx: Ctx,
  seed: string,
  extra = '',
  kind: 'wide' | 'thumb' = 'thumb',
  alt = '',
  media?: MenuItem['media'],
  image?: MenuItem['image'],
): string {
  const shot = media
    ? itemPhoto(ctx, media, kind, alt)
    : image
      ? sitePhoto(image, kind, alt)
      : showsPhoto(ctx, 'tile')
        ? photo(ctx, seed, kind, alt)
        : ''
  return `<span class="thumb ${extra}${shot ? '' : ' is-empty'} m-${ctx.theme.motif}">${missingMedia(alt)}${shot}</span>`
}

function itemTile(ctx: Ctx, item: MenuItem, key: string, wide = false): string {
  return `<div class="tile${wide ? ' wide' : ''}" data-item="${key}" role="button" tabindex="0">
    ${artThumb(ctx, key, '', 'thumb', item.name, item.media, item.image)}
    ${saveButton(key, item.name, ' on-art')}
    <div class="body">
      <div class="name">${esc(item.name)}</div>
      ${item.vendor || item.meta || optionCount(item) ? `<div class="tiny dim">${esc([item.vendor, item.meta, optionCount(item)].filter(Boolean).join(' · '))}</div>` : ''}
      <div class="price">${priceFrom(item, ctx.spec)}</div>
    </div>
    <span class="go" aria-hidden="true">${icon('chevron')}</span>
  </div>`
}

function itemStackCard(ctx: Ctx, item: MenuItem, key: string): string {
  return `<div class="stack-card" data-item="${key}" role="button" tabindex="0">
    ${artThumb(ctx, key, 'band', 'wide', item.name, item.media, item.image)}
    <div class="body">
      <div class="top">
        <span class="name">${esc(item.name)}</span>
        <span class="price">${priceFrom(item, ctx.spec)}</span>
      </div>
      ${item.desc ? `<p>${esc(item.desc)}</p>` : ''}
      <div class="specs">
        ${item.meta ? `<span>${esc(item.meta)}</span>` : ''}
        ${item.tag ? `<span>${esc(item.tag)}</span>` : ''}
        <span>${esc(ctx.vocab.item)}</span>
      </div>
      <div class="foot">
        <span class="tiny dim">Tap for details</span>
        <span class="foot-tools">${saveButton(key, item.name)}<span class="btn small ghost" style="padding:9px 14px;font-size:12px">${esc(ctx.spec.actions?.view || 'View')}</span></span>
      </div>
    </div>
  </div>`
}

/** The shop's own photograph for a product, shown at the photograph's own
 *  shape. Nothing stock and nothing borrowed: an item without a photograph
 *  gets a quiet blank frame, never decorative artwork that could be mistaken
 *  for the product. */
function retailShot(ctx: Ctx, item: MenuItem, alt: string): string {
  if (item.media) return itemPhoto(ctx, item.media, 'wide', alt)
  if (item.image) {
    const fit = item.image.fit === 'contain' ? 'contain' : 'cover'
    const position = `${item.image.positionX ?? 50}% ${item.image.positionY ?? 50}%`
    return `<img class="rl-photo" src="${esc(item.image.url)}" alt="${esc(item.image.alt || alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" style="object-fit:${fit};object-position:${position}" onerror="this.parentElement.classList.add(&quot;is-empty&quot;);this.remove()" />`
  }
  return ''
}

/** One product in the retail composition: the photograph leads, the name and
 *  price sit underneath without a card border or a boxed price tag. */
function retailCard(ctx: Ctx, sectionIndex: number, itemIndex: number): string {
  const section = ctx.spec.menu[sectionIndex]
  const item = section?.items[itemIndex]
  if (!item) return ''
  const key = `${sectionIndex}-${itemIndex}`
  const shot = retailShot(ctx, item, item.name)
  const options = optionCount(item)
  return `<article class="rl-card" data-item="${key}" role="button" tabindex="0" aria-label="${esc(item.name)}">
    <figure class="rl-media${shot ? '' : ' is-empty'}">${missingMedia(item.name)}${shot}${saveButton(key, item.name, ' rl-save')}</figure>
    <div class="rl-copy">
      <span class="rl-kicker">${esc(section.name)}</span>
      <div class="rl-title"><h3>${esc(item.name)}</h3><span class="rl-price">${priceFrom(item, ctx.spec)}</span></div>
      ${item.desc ? `<p class="rl-desc">${esc(item.desc)}</p>` : ''}
      ${options ? `<span class="rl-option">${esc(options)}</span>` : ''}
    </div>
  </article>`
}

/** The Shop destination: its own heading, live search, the trade's categories,
 *  a count and a sort, then the catalogue. Home keeps the curated shelf; this
 *  is the place to browse everything. */
function retailShop(ctx: Ctx): string {
  const { spec, vocab } = ctx
  const total = spec.menu.reduce((sum, section) => sum + section.items.length, 0)
  const sections = spec.menu.filter((section) => section.items.length)
  if (!sections.length) return `<div class="shop">${emptyCatalogue(ctx)}</div>`
  const words = pluralWord(vocab.item)
  return `<div class="shop">
    <header class="shop-head">
      <span class="eyebrow">The collection</span>
      <h1>${esc(vocab.catalog)}</h1>
      ${spec.tagline ? `<p class="shop-lede">${esc(spec.tagline)}</p>` : ''}
    </header>
    <div class="shop-tools">
      <div class="shop-search">
        ${icon('search')}
        <input type="text" inputmode="search" autocomplete="off" data-shop-search placeholder="Search ${total} ${esc(words)}" aria-label="Search the ${esc(vocab.catalog.toLowerCase())}" />
        <button type="button" class="shop-clear" data-shop-clear aria-label="Clear search" hidden>${icon('close')}</button>
      </div>
      <div class="shop-row">
        <span class="shop-count" data-shop-count>${total} ${esc(words)}</span>
        <label class="shop-sort"><span>Sort</span>
          <select data-shop-sort aria-label="Sort the ${esc(vocab.catalog.toLowerCase())}">
            <option value="featured">Featured</option>
            <option value="price-asc">Price, low to high</option>
            <option value="price-desc">Price, high to low</option>
            <option value="name">A–Z</option>
          </select>
        </label>
      </div>
      <div class="chips" data-filters>
        <button class="chip on" type="button" data-filter="all" aria-pressed="true">All</button>
        ${sections
          .map(
            (section, index) =>
              `<button class="chip" type="button" data-filter="${index}" aria-pressed="false">${esc(section.name)}</button>`,
          )
          .join('')}
      </div>
      <p class="shop-status" data-shop-status aria-live="polite"></p>
    </div>
    <div class="shop-list" data-shop-list>
      ${sections
        .map(
          (section, sectionIndex) => `
        <div class="section-block" data-section="${sectionIndex}" id="sec-${sectionIndex}">
          <div class="sect"><span class="label">${esc(section.name)}</span><span class="count">${section.items.length}</span></div>
          <div class="rl-grid" data-items="${sectionIndex}">${catalogCards(ctx, sectionIndex)}</div>
          ${moreControl(sectionIndex, section)}
        </div>`,
        )
        .join('')}
    </div>
    <div class="shop-empty" data-shop-empty hidden>
      <b>Nothing matches that search.</b>
      <p>Try another word, or clear the search to see the whole collection.</p>
      <button class="btn ghost small" type="button" data-shop-clear>Clear search</button>
    </div>
  </div>`
}

/** The sellers behind a marketplace catalogue, as a rail of stores. Trades
 *  whose items have no seller (everything but a marketplace) render nothing. */
function storesBlock(ctx: Ctx): string {
  const stores = new Map<string, { count: number; meta?: string }>()
  for (const section of ctx.spec.menu) {
    for (const item of section.items) {
      if (!item.vendor) continue
      const entry = stores.get(item.vendor) ?? { count: 0 }
      entry.count += 1
      entry.meta = entry.meta ?? item.meta
      stores.set(item.vendor, entry)
    }
  }
  if (!stores.size) return ''
  return `<div class="sect" style="margin-top:20px"><span class="label">Stores</span><span class="count">${stores.size}</span></div>
    <div class="store-rail">
      ${[...stores.entries()]
        .map(
          ([name, info]) => `<button class="store-card" type="button" data-store="${esc(name)}">
            <span class="thumb m-${ctx.theme.motif} store-art"><span class="mono">${esc(name.slice(0, 2).toUpperCase())}</span></span>
            <span class="store-name">${esc(name)}</span>
            <span class="store-meta">${info.count} ${info.count === 1 ? 'item' : 'items'}${info.meta ? ` · ${esc(info.meta)}` : ''}</span>
          </button>`,
        )
        .join('')}
    </div>`
}

/** How many products a catalogue screen renders up front. The rest stay in the
 *  shipped catalogue and are added a page at a time as the customer asks, so a
 *  shop with 706 products does not put 706 cards in the first paint. */
export const catalogFirst = 12

/** "piece" → "pieces", "dish" → "dishes": the trade's own plural, so a count
 *  line reads as the business would write it. */
function pluralWord(word: string): string {
  if (/(?:s|x|z|ch|sh)$/i.test(word)) return word + 'es'
  if (/[^aeiou]y$/i.test(word)) return word.slice(0, -1) + 'ies'
  return word + 's'
}
const catalogPage = 24

function moreControl(sectionIndex: number, section: { items: unknown[] }): string {
  const shown = Math.min(catalogFirst, section.items.length)
  const total = section.items.length
  if (total <= shown) return ''
  const next = Math.min(catalogPage, total - shown)
  return `<div class="more" data-more="${sectionIndex}" data-shown="${shown}" data-total="${total}">
    <button class="btn ghost small" type="button" data-more-go="${sectionIndex}">Show ${next} more</button>
    <span class="tiny dim" data-more-count>Showing ${shown} of ${total}</span>
  </div>`
}

/** One product's card, in whichever layout this build uses. The catalogue, the
 *  first page and every later page all come from here, so there is no second
 *  copy of the markup to keep in step. */
function catalogCard(ctx: Ctx, sectionIndex: number, itemIndex: number): string {
  const section = ctx.spec.menu[sectionIndex]
  const item = section?.items[itemIndex]
  if (!item) return ''
  const key = `${sectionIndex}-${itemIndex}`
  if (ctx.theme.layout === 'retail') return retailCard(ctx, sectionIndex, itemIndex)
  if (ctx.theme.layout === 'grid') {
    const onlyOne = ctx.spec.menu.reduce((total, one) => total + one.items.length, 0) === 1
    return itemTile(ctx, item, key, onlyOne)
  }
  if (ctx.theme.layout === 'stack') return itemStackCard(ctx, item, key)
  return (ctx.theme.layout === 'editorial' ? itemRowEditorial : itemRowCompact)(ctx, item, key)
}

/** The most cards one fragment may ask for. The app asks for a page; anything
 *  larger is a client mistake or a probe, and is not worth rendering. */
export const CATALOG_MAX_CARDS = 60

/** Strip provenance from catalogue rows before they reach the browser. */
function publicMenu(menu: MenuSection[]): MenuSection[] {
  return menu.map((section) => ({
    ...section,
    items: section.items.map((item) => {
      const {
        sourceUrl: _sourceUrl,
        sourceMethod: _sourceMethod,
        priceEvidence: _priceEvidence,
        sourcePriceEvidence: _sourcePriceEvidence,
        ownerFields: _ownerFields,
        sourceTrail: _sourceTrail,
        fieldProvenance: _fieldProvenance,
        variants,
        ...rest
      } = item
      return {
        ...rest,
        ...(variants
          ? { variants: variants.map(({ fieldProvenance: _variantProvenance, ...variant }) => variant) }
          : {}),
      }
    }),
  }))
}

/** A slice of one shelf, used for the shipped first page and for the pages the
 *  customer asks for later. The slice is clamped here as well as at the route,
 *  so no caller can ask for an unbounded render. */
function catalogCards(ctx: Ctx, sectionIndex: number, from = 0, count = catalogFirst): string {
  const items = ctx.spec.menu[sectionIndex]?.items ?? []
  const start = Number.isFinite(from) ? Math.max(0, Math.floor(from)) : 0
  const size = Number.isFinite(count) ? Math.max(1, Math.min(CATALOG_MAX_CARDS, Math.floor(count))) : catalogFirst
  const out: string[] = []
  for (let index = start; index < Math.min(items.length, start + size); index += 1) {
    out.push(catalogCard(ctx, sectionIndex, index))
  }
  return out.join('')
}

/**
 * An empty catalogue is a fact about the source, not a broken build. Say what
 * was read, what was kept instead, and that nothing was invented.
 */
function emptyHomeNote(ctx: Ctx): string {
  const review = ctx.spec.sourceReview
  const pages = review?.pages.read.length ?? 0
  return `<div class="sect" data-empty-home><div class="empty"><b>The menu isn’t published yet.</b><p>We read ${pages ? `${pages} page${pages === 1 ? '' : 's'}` : 'their site'}${review?.host ? ` from ${esc(review.host)}` : ''} and found no dish with the details needed to publish. Nothing has been invented; the menu appears once the business adds it.</p></div></div>`
}

function emptyCatalogue(ctx: Ctx): string {
  const review = ctx.spec.sourceReview
  const item = ctx.vocab.item.toLowerCase()
  const plural = pluralWord(item)
  if (review && review.status === 'empty') {
    const pages = review.pages.read.length
    const kept = review.rejected.filter((entry) => entry.destination === 'information')
    return `<div class="empty"><b>The ${esc(plural)} aren’t published yet.</b><p>We read ${pages ? `${pages} page${pages === 1 ? '' : 's'}` : 'their site'}${review.host ? ` from ${esc(review.host)}` : ''} and found no ${esc(item)} with the details needed to publish.${kept.length ? ` ${kept.length} other page${kept.length === 1 ? ' was' : 's were'} kept as business information.` : ''} Nothing has been invented; the ${esc(plural)} appear once the business adds them.</p></div>`
  }
  return `<div class="empty">Nothing has been added here yet. The business’s own ${esc(plural)} appear once they are in the app.</div>`
}

function catalogBlock(ctx: Ctx): string {
  const { theme, spec } = ctx
  if (!spec.menu.length) return emptyCatalogue(ctx)
  // Hitting an editor component called "featured" on a retail build shows the
  // first pieces, never a second copy of the Shop destination.
  if (theme.layout === 'retail') {
    const cards = spec.menu
      .flatMap((section, sectionIndex) => section.items.map((_, itemIndex) => ({ sectionIndex, itemIndex })))
      .slice(0, 4)
      .map((entry) => retailCard(ctx, entry.sectionIndex, entry.itemIndex))
      .join('')
    return `<div class="rl-grid is-home">${cards}</div>`
  }

  if (theme.layout === 'grid') {
        return `<div class="chips" data-filters>
        <button class="chip on" type="button" data-filter="all" aria-pressed="true">All</button>
        ${spec.menu
          .map(
            (section, index) =>
              `<button class="chip" type="button" data-filter="${index}" aria-pressed="false">${esc(section.name)}</button>`,
          )
          .join('')}
      </div>
      ${spec.menu
        .map(
          (section, sectionIndex) => `
        <div class="section-block" data-section="${sectionIndex}">
          <div class="sect" id="sec-${sectionIndex}"><span class="label">${esc(section.name)}</span><span class="count">${section.items.length}</span></div>
          <div class="tiles" data-items="${sectionIndex}">${catalogCards(ctx, sectionIndex)}</div>
          ${moreControl(sectionIndex, section)}
        </div>`,
        )
        .join('')}`
  }

    const filters = `<div class="chips" data-filters style="margin-bottom:6px">
      <button class="chip on" type="button" data-filter="all" aria-pressed="true">All</button>
      ${spec.menu
        .map(
          (section, index) =>
            `<button class="chip" type="button" data-filter="${index}" aria-pressed="false">${esc(section.name)}</button>`,
        )
        .join('')}
    </div>`

  if (theme.layout === 'stack') {
    return `${filters}${spec.menu
      .map(
        (section, sectionIndex) => `
        <div class="section-block" data-section="${sectionIndex}" id="sec-${sectionIndex}">
          <div class="sect"><span class="label">${esc(section.name)}</span><span class="count">${section.items.length}</span></div>
          <div data-items="${sectionIndex}">${catalogCards(ctx, sectionIndex)}</div>
          ${moreControl(sectionIndex, section)}
        </div>`,
      )
      .join('')}`
  }

  return `${filters}${spec.menu
    .map(
      (section, sectionIndex) => `
      <div class="section-block" data-section="${sectionIndex}" id="sec-${sectionIndex}">
        <div class="sect"><span class="label">${esc(section.name)}</span><span class="count">${section.items.length}</span></div>
        <div data-items="${sectionIndex}">${catalogCards(ctx, sectionIndex)}</div>
        ${moreControl(sectionIndex, section)}
      </div>`,
    )
    .join('')}`
}

type HomeBlocks = { featured: string; offers: string; loyalty: string; visit: string; story: string }

/** The four home compositions: which secondary section follows the hero. */
const HOME_ORDER: Record<HomeOrder, (keyof HomeBlocks)[]> = {
  catalog: ['featured', 'offers', 'loyalty', 'visit', 'story'],
  offers: ['offers', 'featured', 'loyalty', 'story', 'visit'],
  visit: ['visit', 'story', 'featured', 'offers', 'loyalty'],
  rewards: ['loyalty', 'story', 'featured', 'offers', 'visit'],
}

function storyBlock(ctx: Ctx): string {
  let story = (homeSections(ctx.doc).find((node) => node.kind === 'story')?.text ?? ctx.spec.story ?? '').trim()
  // An imported description becomes the tagline too; repeating it verbatim
  // right under the hero reads as a bug, not as an introduction.
  const tagline = ctx.spec.tagline.trim()
  if (tagline && story.startsWith(tagline)) story = story.slice(tagline.length).trim()
  if (!story) return ''
  return `<p class="home-story">${esc(story)}</p>`
}

/** A section the editor added, rendered as a real mobile component. */
function addedBlock(ctx: Ctx, node: DocNode): string {
  const title = node.title || ''
  switch (node.kind) {
    case 'testimonials': {
      // The seeded line is an instruction to the owner, not a review. A customer
      // sees a quote only once the owner has written one; the editor shows the
      // placeholder so it stays obvious that nothing has been claimed yet.
      const quote = (node.text || '').trim()
      const placeholder = !quote || quote === 'Loved by regulars. Add a review to show it here.'
      if (placeholder && !ctx.editor) return ''
      return `<div class="sect"><span class="label">${esc(title || 'Kind words')}</span></div>
        <div class="card" style="padding:18px">
          <p style="font-family:var(--display);font-size:16px;line-height:1.5">“${esc(quote || 'A line from a happy customer belongs here.')}”</p>
          <p class="tiny dim" style="margin-top:10px">— A regular, ${esc(ctx.spec.name)}</p>
        </div>`
    }
    case 'heading':
      return `<h2 class="display" style="font-size:24px;line-height:1.15;margin:10px 0 4px;${node.style.align === 'center' ? 'text-align:center' : ''}">${esc(title || 'Heading')}</h2>`
    case 'text':
      return `<p class="dim" style="font-size:14px;line-height:1.6;margin:6px 0 10px">${esc(node.text || 'Add a sentence about this screen.')}</p>`
    case 'button': {
      const action = node.cta ?? { label: title || 'Continue', screen: 'home' }
      return `<div style="margin:10px 0"><button class="btn accent block" type="button" data-go="${esc(appTarget(ctx, action.screen))}">${esc(action.label)}</button></div>`
    }
    case 'image': {
      if (node.media) {
        const media = node.media
        const aspect = media.aspect && media.aspect !== 'auto' ? ` is-${media.aspect}` : ''
        const ratio = media.width && media.height ? media.width / media.height : 1.6
        return `<figure class="media-frame${aspect}" style="--media-ratio:${ratio.toFixed(4)};margin:10px 0">
          <img class="photo media-photo"
            src="/p/${esc(ctx.token)}/media/${media.id}/640.webp"
            srcset="/p/${esc(ctx.token)}/media/${media.id}/320.webp 320w, /p/${esc(ctx.token)}/media/${media.id}/640.webp 640w, /p/${esc(ctx.token)}/media/${media.id}/1280.webp 1280w"
            sizes="(max-width: 620px) calc(100vw - 32px), 620px"
            alt="${esc(media.alt || title || '')}"
            ${media.width ? `width="${media.width}"` : ''} ${media.height ? `height="${media.height}"` : ''}
            loading="lazy" decoding="async"
            style="object-fit:${media.fit === 'contain' ? 'contain' : 'cover'};object-position:${media.focalX ?? 50}% ${media.focalY ?? 50}%" />
        </figure>`
      }
      const shot = showsPhoto(ctx, 'tile') ? photo(ctx, node.id, 'wide') : ''
      return `<div class="card" style="overflow:hidden;margin:10px 0">
        <span class="thumb m-${ctx.theme.motif}" style="height:170px;display:block">${shot}<span class="mono">${esc(title || ctx.spec.logo)}</span></span>
      </div>`
    }
    case 'gallery':
      return `<div class="sect"><span class="label">${esc(title || 'Gallery')}</span></div>
        <div class="gallery">${[0, 1, 2, 3]
          .map((index) => motif(ctx.theme, '✳', '', ctx.media === 'photo' ? photo(ctx, `gallery-${index}`, 'thumb') : ''))
          .join('')}</div>`
    case 'banner': {
      const action = node.cta
      return `<div class="card" style="padding:18px;margin:10px 0">
        <b style="font-family:var(--display);font-size:18px">${esc(title || ctx.spec.tagline)}</b>
        ${node.text ? `<p class="tiny dim" style="margin-top:5px">${esc(node.text)}</p>` : ''}
        ${action ? `<button class="btn accent" type="button" data-go="${esc(appTarget(ctx, action.screen))}" style="margin-top:12px">${esc(action.label)}</button>` : ''}
      </div>`
    }
    case 'productList': {
      const entries = ctx.spec.menu.flatMap((section) => section.items).slice(0, 4)
      if (!entries.length) return emptyCatalogue(ctx)
      return `<div class="sect"><span class="label">${esc(title || ctx.vocab.catalog)}</span></div>
        <div class="tiles">${entries.map((item, index) => itemTile(ctx, item, `0-${index}`)).join('')}</div>`
    }
    case 'search':
      return `<button class="search-pill" type="button" data-go="search" style="width:100%;margin:8px 0">${icon('search')}<span>${esc(title || `Search the ${ctx.vocab.catalog.toLowerCase()}`)}</span></button>`
    case 'form':
      if (ctx.quoting) return `${quoteBlock(ctx)}`
      return `<div class="card" style="padding:18px;margin:10px 0">
        <b>${esc(title || 'Send a message')}</b>
        <p class="tiny dim" style="margin:6px 0 12px">Goes straight to the business dashboard — no account needed.</p>
        <div class="field"><label for="contact-name">Your name</label><input id="contact-name" type="text" maxlength="60" data-quote-name placeholder="Name" autocomplete="name" /></div>
        <div class="field"><label for="contact-contact">Phone or email</label><input id="contact-contact" type="text" maxlength="120" data-quote-contact placeholder="How to reach you" autocomplete="tel" /></div>
        <div class="field"><label for="contact-message">Message</label><textarea id="contact-message" rows="3" data-quote-message placeholder="How can we help?"></textarea></div>
        <button class="btn accent block" type="button" data-quote-send>Send message</button>
        ${ctx.spec.phone ? `<a class="btn ghost block" href="tel:${esc(ctx.spec.phone.replace(/\s/g, ''))}" style="margin-top:8px">Call ${esc(ctx.spec.phone)}</a>` : ''}
        ${ctx.spec.email ? `<a class="btn ghost block" href="mailto:${esc(ctx.spec.email)}" style="margin-top:8px">Email us</a>` : ''}
      </div>`
    case 'story':
      return storyBlock(ctx)
    case 'visit':
      return hoursBlock(ctx)
    case 'offers':
      return offersBlock(ctx)
    case 'loyalty':
      return loyaltyBlock(ctx)
    case 'featured':
      return catalogBlock(ctx)
    default: {
      const action = node.cta ?? ctx.actions[0]
      return `<div class="card" style="padding:22px 18px;text-align:center">
        <h3 style="font-family:var(--display);font-size:20px">${esc(title || 'Ready when you are')}</h3>
        <p class="tiny dim" style="margin:8px 0 14px">${esc(node.text || '')}</p>
        ${action ? `<button class="btn accent" type="button" data-go="${esc(appTarget(ctx, action.screen))}">${esc(node.cta?.label || 'Get in touch')}</button>` : ''}
      </div>`
    }
  }
}

/** A screen the editor created, rendered inside the same app shell. */
function customScreen(ctx: Ctx, screen: ScreenNode, active = false): string {
  const sections = screen.sections
    .filter((node) => !node.hidden)
    .map((node) =>
      node.kind === 'flagship' ? flagshipSection(ctx, node) : docSection(ctx, node, {} as HomeBlocks),
    )
    .join('')
  const label =
    screen.kind === 'contact'
      ? 'Visit & contact'
      : screen.kind === 'profile'
        ? 'Your account'
        : screen.kind === 'about'
          ? 'About the business'
          : 'A closer look'
  return `<section class="screen screen-${esc(screen.kind)}${active ? ' on' : ''}" data-screen="${esc(screen.id)}" data-title="${esc(screen.name)}">
    <div class="custom-wrap">
      <header class="custom-lead">
        <span class="fx-eyebrow">${esc(label)}</span>
        <h1>${esc(screen.name)}</h1>
      </header>
      <div class="custom-body">${sections || `<p class="empty">This screen is ready for its first component.</p>`}</div>
    </div>
  </section>`
}

/** Wraps one section with its stable id and responsive rules. */
function wrapDoc(node: DocNode, html: string): string {
  if (!html) return ''
  const hides = node.responsive.hideOn.map((point) => `hide-${point}`).join(' ')
  const style = [
    node.style.background ? `background:${node.style.background}` : '',
    node.style.color ? `color:${node.style.color}` : '',
    node.style.align ? `text-align:${node.style.align}` : '',
    node.style.paddingY ? `padding-block:${node.style.paddingY === 2 ? 36 : 18}px` : '',
    node.style.radius ? `border-radius:${node.style.radius === 2 ? 22 : 12}px` : '',
  ]
    .filter(Boolean)
    .join(';')
  return `<div class="doc-section${hides ? ` ${hides}` : ''}" data-sec="${node.id}"${node.layout ? ` data-layout="${node.layout}"` : ''}${style ? ` style="${style}"` : ''}>${html}</div>`
}

function docSection(ctx: Ctx, node: DocNode, blocks: HomeBlocks): string {
  const html = blocks[node.kind as keyof HomeBlocks] || addedBlock(ctx, node)
  return wrapDoc(node, html)
}

/** The hero is composed by each layout, but is still a selectable section. */
function heroSection(ctx: Ctx, html: string): string {
  const hero = homeSections(ctx.doc).find((node) => node.kind === 'hero')
  return hero ? wrapDoc({ ...hero, hidden: false }, html) : html
}

function orderedHome(ctx: Ctx, blocks: HomeBlocks): string {
  // With a document, its order and visibility win over the seeded composition.
  if (ctx.doc) {
    return homeSections(ctx.doc)
      .filter((node) => !node.hidden && node.kind !== 'hero')
      .map((node) => docSection(ctx, node, blocks))
      .join('')
  }
  const sequence = HOME_ORDER[ctx.order].filter((key) => blocks[key])
  // A trade without offers (or rewards) would otherwise fall back to exactly
  // the catalog page, so two of the three designs would share a composition.
  // Leading with the next block it does have keeps them apart.
  if (!blocks[HOME_ORDER[ctx.order][0]] && sequence.length > 1)
    sequence.unshift(sequence.splice(1, 1)[0])
  return sequence.map((key) => blocks[key]).join('')
}

/** Trades whose work is looked at, so their home opens with a strip of it. */
const SHOWCASE_TRADES = new Set([
  'studio',
  'portfolio',
  'film',
  'gallery',
  'influencer',
  'shop',
  'ecommerce',
  'plants-indoor',
])

/** A side-scrolling strip of the trade's own work: photographs when the build
 *  has them, generated artwork otherwise. Tapping one opens its section. */
function showcaseBlock(ctx: Ctx): string {
  if (!SHOWCASE_TRADES.has(ctx.vertical.id)) return ''
  const slides = ctx.spec.menu
    .flatMap((section, sectionIndex) => section.items.slice(0, 2).map((item) => ({ item, sectionIndex })))
    .slice(0, 5)
  if (slides.length < 2) return ''
  return `<div class="showcase" data-showcase>${slides
    .map(
      ({ item, sectionIndex }, index) => `<button class="slide" type="button" data-jump="${sectionIndex}">
        ${motif(
          ctx.theme,
          item.name.trim().charAt(0).toUpperCase(),
          'showcase-art',
          ctx.media === 'photo' ? photo(ctx, `showcase-${index}`, 'thumb') : '',
        )}
        <span class="cap">${esc(item.name)}</span>
      </button>`,
    )
    .join('')}</div>`
}

function homeBlock(ctx: Ctx): string {
  const { theme, spec } = ctx
  const featured = spec.menu.flatMap((section, sectionIndex) =>
    section.items.map((item, itemIndex) => ({ item, key: `${sectionIndex}-${itemIndex}` })),
  )
  const coda = `<p class="tiny dim" style="text-align:center;margin-top:22px;letter-spacing:0.08em;text-transform:uppercase">Built with Plattr</p>`
  const blocks = (featuredMarkup: string, offersLimit = 2): HomeBlocks => ({
    featured: featuredMarkup,
    offers: offersBlock(ctx, offersLimit),
    loyalty: loyaltyBlock(ctx),
    visit: hoursBlock(ctx),
    story: storyBlock(ctx),
  })

  if (theme.layout === 'retail') {
    const newIn = featured.slice(0, 4)
    const categories = spec.menu.filter((section) => section.items.length)
    const shelf = newIn.length
      ? `<div class="sect"><span class="label">${esc(sectionTitle(ctx, 'featured', 'New in'))}</span><span class="tiny dim">${featured.length} ${esc(pluralWord(ctx.vocab.item))}</span></div>
         <div class="rl-grid is-home">${newIn
           .map((entry) => {
             const [sectionIndex, itemIndex] = entry.key.split('-').map(Number)
             return retailCard(ctx, sectionIndex, itemIndex)
           })
           .join('')}</div>
         <button class="shop-browse" type="button" data-go="catalog"><span>Browse the whole ${esc(ctx.vocab.catalog.toLowerCase())}</span>${icon('chevron')}</button>`
      : ''
    const collections = categories.length > 1
      ? `<div class="sect"><span class="label">Collections</span><span class="count">${categories.length}</span></div>
         <div class="rl-cats">${categories
           .slice(0, 8)
           .map(
             (section, index) =>
               `<button class="rl-cat" type="button" data-jump="${index}"><span>${esc(section.name)}</span><em>${section.items.length}</em></button>`,
           )
           .join('')}</div>`
      : ''
    return `${heroSection(ctx, cover(ctx, [spec.hours.split('·')[0], spec.address]))}
      ${actions(ctx)}
      ${orderedHome(ctx, blocks(shelf + collections))}
      ${coda}`
  }

  if (theme.layout === 'editorial') {
    const selected = `<div class="sect"><span class="label">${esc(sectionTitle(ctx, 'featured', 'Selected'))}</span><span class="tiny dim">${esc(ctx.vocab.catalog)}</span></div>
      <div>${featured.slice(0, 3).map((entry) => itemRowEditorial(ctx, entry.item, entry.key)).join('')}</div>`
    return `${heroSection(ctx, lHero(ctx))}
      ${secondaryActions(ctx)}
      ${showcaseBlock(ctx)}
      ${orderedHome(ctx, blocks(selected))}
      ${coda}`
  }

  if (theme.layout === 'grid') {
    const featuredTiles = `<div class="sect"><span class="label">${esc(sectionTitle(ctx, 'featured', 'Featured'))}</span><span class="count">${featured.length} items</span></div>
      <div class="tiles">${featured.slice(0, 4).map((entry) => itemTile(ctx, entry.item, entry.key)).join('')}</div>`
    return `${heroSection(ctx, cover(ctx, [spec.hours.split('·')[0], spec.address]))}
      ${actions(ctx)}
      ${showcaseBlock(ctx)}
      <div class="chips" style="margin-top:14px">
        ${spec.menu
          .map(
            (section, index) =>
              `<button class="chip" type="button" data-jump="${index}">${esc(section.name)}</button>`,
          )
          .join('')}
      </div>
      ${orderedHome(ctx, blocks(featuredTiles))}
      ${coda}`
  }

  if (theme.layout === 'rows') {
    const sections = `<div class="sect"><span class="label">${esc(sectionTitle(ctx, 'featured', ctx.vocab.catalog))}</span><span class="count">${spec.menu.length} ${spec.menu.length === 1 ? 'section' : 'sections'}</span></div>
      <div>
        ${spec.menu
          .map(
            (section, index) => `<button class="r-row" type="button" data-jump="${index}">
              <div class="lead"><div class="name">${esc(section.name)}</div><div class="desc">${section.items.length} ${section.items.length === 1 ? 'item' : 'items'} · from ${priceOf(section.items[0], ctx.spec)}</div></div>
              <div class="tail">${icon('chevron')}</div>
            </button>`,
          )
          .join('')}
      </div>`
    return `${heroSection(ctx, cover(ctx, [spec.hours.split('·')[0], spec.address]))}
      ${actions(ctx)}
      ${showcaseBlock(ctx)}
      ${spec.hours.trim()
        ? `<div class="status-card" style="margin-top:16px">
        <span class="dot"></span>
        <div><b>Open now</b><span>${esc(spec.hours)}</span></div>
      </div>`
        : ''}
      ${orderedHome(ctx, blocks(sections, 1))}
      ${coda}`
  }

  const stack = `<div class="sect"><span class="label">${esc(sectionTitle(ctx, 'featured', ctx.vocab.catalog))}</span><span class="count">${featured.length} items</span></div>
    ${featured.slice(0, 3).map((entry) => itemStackCard(ctx, entry.item, entry.key)).join('')}`
  return `${heroSection(ctx, cover(ctx, [spec.hours.split('·')[0], spec.address]))}
    ${actions(ctx)}
    ${showcaseBlock(ctx)}
    ${timetableBlock(ctx)}
    ${orderedHome(ctx, blocks(stack))}
    ${coda}`
}

function bookingBlock(ctx: Ctx): string {
  const hotel = ctx.spec.vertical === 'hotel'
  // A stay is booked against one published room, not an extra such as
  // breakfast or parking. Those items remain catalogue detail, never a price
  // that can be multiplied by the number of nights.
  const services = ctx.spec.menu
    .flatMap((section) => section.items)
    .filter((item) => item.name && (!hotel || (item.price > 0 && /night/i.test(item.meta ?? ''))))
  const staff = hotel ? [] : (ctx.spec.staff ?? [])
  return `<div class="sect" style="margin-top:4px"><span class="label">${esc(ctx.vocab.partyLabel)}</span></div>
    <div class="card" style="padding:16px;margin-bottom:10px">
      <div class="stepper">
        <button type="button" data-party="-1" aria-label="Fewer">${icon('minus')}</button>
        <b data-party-value>2</b>
        <button type="button" data-party="1" aria-label="More">${icon('plus')}</button>
      </div>
    </div>
    ${
      ctx.spec.vertical === 'hotel'
        ? `<div class="sect"><span class="label">Check in</span></div>
           <div class="field"><input id="book-checkin" type="date" data-checkin aria-label="Check-in" /></div>
           <div class="sect"><span class="label">Check out</span></div>
           <div class="field"><input id="book-checkout" type="date" data-checkout aria-label="Check-out" /></div>
           <p class="tiny dim" data-stay-summary role="status">Choose your dates.</p>
           <p class="tiny dim">No live availability is shown. This sends a request; the business confirms the room is free.</p>`
        : `<div class="sect"><span class="label">Choose a day</span></div>
           <div class="chips" data-days></div>
           ${
             ctx.vocab.slots.length
               ? `<div class="sect"><span class="label">Choose a time</span></div>
                  <div class="slots" data-slots></div>`
               : ''
           }`
    }
    ${
      ctx.spec.vertical !== 'restaurant' && ctx.spec.vertical !== 'cafe' && services.length
        ? `<div class="field"><label for="book-service">${hotel ? 'Room' : 'Service'}</label><select id="book-service" data-book-service>${services
            .map((item) => `<option value="${esc(item.name)}">${esc(item.name)}${hotel ? ` · ${moneyForSpec(item.price, ctx.spec)} a night` : ''}</option>`)
            .join('')}</select></div>`
        : ''
    }
    ${
      staff.length
        ? `<div class="field"><label for="book-staff">Team member</label><select id="book-staff" data-book-staff><option value="">No preference</option>${staff
            .map((person) => `<option value="${esc(person)}">${esc(person)}</option>`)
            .join('')}</select></div>`
        : ''
    }
    <div class="field"><label for="book-name">Your name</label><input id="book-name" type="text" maxlength="60" data-book-name placeholder="Name" autocomplete="name" /></div>
    <div class="field"><label for="book-contact">Phone or email</label><input id="book-contact" type="text" maxlength="120" data-book-contact placeholder="How to reach you" autocomplete="tel" /></div>
    <button class="btn accent block" type="button" data-book style="margin-top:18px">${esc(ctx.spec.actions?.book || (hotel ? 'Request a stay' : 'Request booking'))}</button>
    <p class="tiny dim" style="text-align:center;margin-top:10px">${esc(ctx.spec.hours)}</p>`
}

function quoteBlock(ctx: Ctx): string {
  const clinic = ctx.spec.vertical === 'clinic'
  return `<div class="sect" style="margin-top:4px"><span class="label">${esc(ctx.vocab.quoteTitle)}</span></div>
    <p class="tiny dim" style="margin-bottom:14px">${esc(ctx.vocab.quoteNote || 'A short description is enough. We reply within one working day.')}</p>
    <div class="field"><label for="q-name">Your name</label><input id="q-name" type="text" data-quote-name placeholder="Name" /></div>
    <div class="field"><label for="q-contact">Phone or email</label><input id="q-contact" type="text" data-quote-contact placeholder="How to reach you" /></div>
    <div class="field"><label for="q-msg">${clinic ? 'What would you like to arrange?' : 'What do you need?'}</label><textarea id="q-msg" rows="4" data-quote-message placeholder="${clinic ? 'Appointment, treatment or a general question' : 'A sentence is fine'}"></textarea></div>
    <button class="btn accent block" type="button" data-quote-send>Send request</button>
    <p class="tiny dim" style="text-align:center;margin-top:10px">Goes straight to the business dashboard. No account needed.</p>`
}

function moreBlock(ctx: Ctx): string {
  const { spec } = ctx
  // The owner edits the story in the home document. More must show that copy,
  // not the original seed that the edit replaced.
  const story =
    homeSections(ctx.doc).find((node) => node.kind === 'story')?.text?.trim() || spec.story
  // A gallery is only a gallery when there are photographs. The old fallback
  // repeated four large decorative tiles, which read as empty media on a screen
  // an owner is trying to judge. Without photographs, show the real collection
  // index instead — useful, compact and built from the business's own data.
  const galleryShots =
    spec.features.includes('gallery') && ctx.media === 'photo'
      ? [0, 1, 2, 3].map((index) => photo(ctx, `gallery-${index}`, 'thumb'))
      : []
  const gallery = galleryShots.some(Boolean)
    ? `<div class="sect"><span class="label">${esc(ctx.vocab.galleryTitle ?? 'The work')}</span></div>
       <div class="gallery">${galleryShots
         .map((shot, index) => (shot ? shot : motif(ctx.theme, '✳', '', '')))
         .join('')}</div>`
    : `<div class="more-work">
         <div class="sect"><span class="label">${esc(ctx.vocab.galleryTitle ?? 'The work')}</span><span class="count">${spec.menu.reduce((sum, section) => sum + section.items.length, 0)}</span></div>
         <p>Browse every ${esc(ctx.vocab.catalog.toLowerCase())} by group.</p>
         <div class="more-index">${spec.menu
           .filter((section) => section.items.length)
           .slice(0, 6)
           .map(
             (section) =>
               `<button type="button" data-go="catalog"><span>${esc(section.name)}</span><em>${section.items.length}</em></button>`,
           )
           .join('')}</div>
       </div>`
  return `<header class="more-lead">
      <span class="fx-eyebrow">${esc(ctx.label)}</span>
      <h1>${esc(spec.name)}</h1>
      <p>${esc(spec.tagline)}</p>
      <div class="more-facts">${[spec.address, spec.hours].filter(Boolean).map((fact) => `<span>${esc(fact)}</span>`).join('')}</div>
    </header>
    <div class="more-story">
      <span class="fx-eyebrow">About</span>
      <p>${esc(story)}</p>
    </div>
    ${hoursBlock(ctx)}
    ${spec.features.includes('gallery') ? gallery : ''}
    ${
      spec.videos?.length
        ? `<div class="sect"><span class="label">Watch</span></div>
           <div class="actions">${spec.videos
             .map(
               (video) =>
                 `<a class="btn ghost" href="${esc(video.url)}" target="_blank" rel="noopener">${esc(video.label)}</a>`,
             )
             .join('')}</div>`
        : ''
    }
    ${
      spec.features.includes('reviews')
        ? `<div class="sect"><span class="label">How was it?</span></div>
           <div class="card" style="padding:15px">
             <p class="tiny dim" style="margin-bottom:10px">Your rating goes straight to the team.</p>
             <div class="stars" data-stars><span>★</span><span>★</span><span>★</span><span>★</span><span>★</span></div>
             <textarea rows="2" data-review placeholder="Anything we should know?" style="margin-top:11px"></textarea>
             <button class="btn block" type="button" data-send-review style="margin-top:10px">Send feedback</button>
           </div>`
        : ''
    }
    ${
      spec.features.includes('events') && ctx.vertical.events?.length
        ? `<div class="sect"><span class="label">What’s on</span></div>
           <div class="info">${ctx.vertical.events
             .map((event) => `<p><b>${esc(event.when)}</b> · ${esc(event.title)}</p>`)
             .join('')}</div>`
        : ''
    }
    ${
      ctx.quoting
        ? `<div class="sect"><span class="label">${esc(ctx.vocab.quoteTitle)}</span></div>
           <button class="btn ghost block" type="button" data-go="quote">Open the form</button>`
        : ''
    }
    ${
      ctx.ordering || ctx.booking
        ? `<div class="sect"><span class="label">Your activity</span></div><div data-history></div>`
        : ''
    }
    ${(() => {
      // Policies, locations, press and other real pages that are not inventory.
      // They stay reachable instead of being silently dropped with the rows.
      const kept = (spec.sourceReview?.rejected ?? [])
        .filter((entry) => entry.destination === 'information')
        .slice(0, 8)
      if (!kept.length) return ''
      return `<div class="sect"><span class="label">From their site</span></div>
        <div class="info">${kept
          .map((entry) =>
            // The customer sees the page's own name and, when it has one, the
            // link. The review's internal classification stays in the review.
            entry.source
              ? `<p><a href="${esc(entry.source)}" target="_blank" rel="noopener">${esc(entry.name)}</a></p>`
              : `<p>${esc(entry.name)}</p>`,
          )
          .join('')}<p class="tiny dim">Read on their website and kept as information, not as ${esc(ctx.vocab.catalog.toLowerCase())}.</p></div>`
    })()}
    <div class="sect"><span class="label">Yours</span></div>
    <button class="r-row" type="button" data-go="saved">
      <div class="lead"><div class="name">Saved</div><div class="desc">Items you kept for later</div></div>
      <div class="tail"><span class="count" data-saved-more>0</span>${icon('chevron')}</div>
    </button>
    <div class="sect"><span class="label">Install</span></div>
    <div class="info" data-install-wrap hidden>
      <h3>Install ${esc(spec.name)}</h3>
      <p>Full screen, on your home screen, no address bar. This build is already installable.</p>
      <button class="btn accent block" type="button" data-install style="margin-top:12px">Install the app</button>
    </div>
    <div class="info"><h3>Add to your home screen</h3><p>Open your browser menu and choose “Add to Home Screen”. It runs full screen, without the address bar.</p></div>
    <p class="tiny dim" style="text-align:center;margin-top:18px;letter-spacing:0.08em;text-transform:uppercase">Built with Plattr</p>`
}

/**
 * The trade supplies the structure — layout, navigation, motif. The site the
 * business already has supplies the look: its palette, its typeface, its corner
 * radius, light or dark. That pairing is what makes a rebuilt app feel like
 * theirs without copying a byte of their markup.
 */
function resolveTheme(base: Theme, design: AppSpec['design']): Theme {
  if (!design) return base
  // Colours only when they are really the site's: a theme that fell back to the
  // trade's own pair must not be presented as the customer's palette.
  const colours = design.palette
    ? { bg: design.bg, surface: design.surface, surface2: design.surface2, ink: design.ink, muted: design.muted }
    : {}
  return {
    ...base,
    ...colours,
    radius: design.radius || base.radius,
    display: design.display || base.display,
    dark: design.palette ? design.dark : base.dark,
  }
}

type PreviewOverrides = {
  variant?: number
  density?: string
  corners?: string
  media?: string
  hero?: string
  order?: string
  heroScale?: string
  buttons?: string
  cards?: string
  preset?: string
  direction?: string
}

/**
 * A preview override only counts when a value was actually supplied. An empty
 * query parameter (`?density=`) or a missing key is not a choice, so it must
 * leave the design stored on the build alone.
 */
function suppliedPreview(preview: PreviewOverrides | undefined): PreviewOverrides {
  const clean: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(preview ?? {})) {
    if (typeof value === 'string' && value.trim() !== '') clean[key] = value
    else if (typeof value === 'number' && Number.isFinite(value)) clean[key] = value
  }
  return clean as PreviewOverrides
}

/** Rules the document layer adds without touching the trade's own CSS. */
const DOC_CSS = `
.doc-section { position: relative; }
.doc-section[data-layout="list"] :where(.fx-products, .fx-rooms, .fx-services, .fx-menu) { display: grid !important; grid-template-columns: 1fr !important; }
.doc-section[data-layout="grid"] :where(.fx-products, .fx-rooms, .fx-services, .fx-menu) { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
.doc-section[data-layout="strip"] :where(.fx-products, .fx-rooms, .fx-services, .fx-menu) { display: flex !important; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; padding-bottom: 4px; }
.doc-section[data-layout="strip"] :where(.fx-products, .fx-rooms, .fx-services, .fx-menu)::-webkit-scrollbar { display: none; }
.doc-section[data-layout="strip"] :where(.fx-products, .fx-rooms, .fx-services, .fx-menu) > * { flex: 0 0 76%; scroll-snap-align: start; min-width: 0; }
.doc-section[style*="padding-block"] { margin-inline: -2px; }
@media (max-width: 599px) { .hide-mobile { display: none !important; } }
@media (min-width: 600px) and (max-width: 1023px) { .hide-tablet { display: none !important; } }
@media (min-width: 1024px) { .hide-desktop { display: none !important; } }
body[data-editor="1"] .doc-section { outline: 1px dashed color-mix(in srgb, currentColor 22%, transparent); outline-offset: -3px; }
body[data-editor="1"] .doc-section:hover { outline: 1px solid var(--accent); }
body[data-editor="1"] .doc-section.doc-selected { outline: 2px solid var(--accent) !important; }
body[data-editor="1"] .doc-section.doc-drop { box-shadow: inset 0 3px 0 var(--accent); }
`

/**
 * Element layer. Every semantic element inside a section, and every tab, is
 * given a stable slot name (`section~tag~ordinal`) before any override is
 * applied. Overrides live on the document, so this runs in the published app
 * too; it is not editor-only styling. Catalogue-bound text and photographs are
 * marked `data-el-bound` and are never replaced here.
 */
const ELEMENT_LAYER = `
<style>
body[data-editor="1"] [data-el] { cursor: pointer; }
body[data-editor="1"] [data-el]:hover { outline: 1px dashed color-mix(in srgb, var(--accent) 55%, transparent); outline-offset: 2px; }
body[data-editor="1"] [data-el].el-selected { outline: 2px solid var(--accent) !important; outline-offset: 2px; }
body[data-editor="1"] [data-el-bound].el-selected { outline-style: dashed !important; }
.tabbar img.nav-custom-icon { width: 22px; height: 22px; object-fit: contain; border-radius: 4px; display: block; margin: 0 auto; }
</style>
<script>
(() => {
  const config = window.__PLATTR_ELEMENTS__ || { elements: {}, token: '', editor: false, icons: {} }
  const elements = config.elements || {}
  const icons = config.icons || {}
  const SELECTOR = 'h1,h2,h3,h4,h5,h6,p,span,img,button,a,svg,div[class*="fx-"]'
  const tagOf = (el) => (el.tagName.toLowerCase() === 'div' ? 'div' : el.tagName.toLowerCase())
  const bound = (el) => Boolean(el.closest('[data-item]') || el.closest('[data-el-bound]'))
  function annotate() {
    document.querySelectorAll('[data-sec]').forEach((section) => {
      const counts = {}
      section.querySelectorAll(SELECTOR).forEach((el) => {
        if (el.closest('[data-el-clone]')) return
        const tag = tagOf(el)
        const index = counts[tag] || 0
        counts[tag] = index + 1
        el.dataset.el = section.dataset.sec + '~' + tag + '~' + index
        if (el.closest('[data-item]')) el.dataset.elBound = '1'
      })
    })
    document.querySelectorAll('.tabbar .tab').forEach((tab, index) => {
      tab.dataset.el = 'chrome~nav~' + index
      tab.dataset.elNav = '1'
    })
  }
  function buildClones() {
    Object.keys(elements).sort().forEach((key) => {
      const entry = elements[key]
      // Child copies are part of a container copy; only root copies are built.
      if (!entry || !entry.duplicateOf || entry.copyParent) return
      if (document.querySelector('[data-el="' + key + '"]')) return
      const source = document.querySelector('[data-el="' + entry.duplicateOf + '"]')
      if (!source || source.closest('[data-el-clone]')) return
      // A catalogue-owned node or a node containing catalogue-bound children
      // must not be duplicated: the copy would carry a second product identity.
      if (source.dataset.elBound === '1' || source.querySelector('[data-el-bound]')) return
      const children = [...source.querySelectorAll('[data-el]')]
      const copyTree = entry.copyTree || {}
      if (children.length && !children.every((child) => copyTree[child.dataset.el])) return
      const node = source.cloneNode(true)
      node.querySelectorAll('[data-el]').forEach((child) => {
        child.dataset.el = copyTree[child.dataset.el]
        delete child.dataset.elBound
        delete child.dataset.elNav
      })
      delete node.dataset.elBound
      delete node.dataset.elNav
      node.dataset.el = key
      node.dataset.elClone = '1'
      node.setAttribute('data-el-clone', '1')
      source.parentNode.insertBefore(node, source.nextSibling)
    })
  }
  function orderElements() {
    const parents = new Set()
    document.querySelectorAll('[data-el]').forEach((el) => {
      if (elements[el.dataset.el] && elements[el.dataset.el].position !== undefined) parents.add(el.parentElement)
    })
    parents.forEach((parent) => {
      if (!parent) return
      const rows = Array.from(parent.children).filter((node) => node.dataset && node.dataset.el && elements[node.dataset.el])
      if (rows.length < 2) return
      rows.sort((a, b) => {
        const left = elements[a.dataset.el].position
        const right = elements[b.dataset.el].position
        return (left === undefined ? 9999 : left) - (right === undefined ? 9999 : right)
      })
      rows.forEach((node) => parent.appendChild(node))
    })
  }
  function apply() {
    document.querySelectorAll('[data-el]').forEach((el) => {
      const key = el.dataset.el
      const entry = elements[key]
      if (!entry) return
      const style = entry.style || {}
      const boundEl = bound(el)
      if (entry.hidden || entry.removed) el.style.display = 'none'
      if (entry.text && !boundEl) {
        if (el.dataset.elNav === '1') {
          const label = el.querySelector('span')
          if (label) label.textContent = entry.text
        } else if (el.tagName !== 'IMG' && el.tagName !== 'SVG') {
          // A button may keep an arrow or icon beside its words. Replace the
          // words where they live instead of deleting the icon with textContent.
          const textNode = [...el.childNodes].find((node) => node.nodeType === 3 && node.textContent.trim())
          const labels = [...el.children].filter(
            (child) => child.tagName !== 'svg' && !/^[→←↑↓✕×+]$/.test(child.textContent.trim()),
          )
          if (textNode) textNode.nodeValue = entry.text + ' '
          else if (!el.children.length) el.textContent = entry.text
          else if (labels.length === 1 && labels[0].children.length === 0) labels[0].textContent = entry.text
        }
      }
      if (entry.media && el.tagName === 'IMG' && !boundEl) {
        const media = entry.media
        el.src = '/p/' + config.token + '/media/' + media.id + '/640.webp'
        if (media.alt) el.alt = media.alt
      }
      if (el.dataset.elNav === '1') {
        // Keep the design's own glyph and hide it, so changing or removing a
        // custom icon can always return to the default instead of losing it.
        const glyph = el.querySelector(':scope > svg:not([data-nav-icon])')
        const custom = el.querySelector(':scope > img.nav-custom-icon')
        const injected = el.querySelector(':scope > svg[data-nav-icon]')
        if (injected) injected.remove()
        if (!entry.media && !entry.navIcon) {
          if (custom) custom.remove()
          if (glyph) glyph.style.removeProperty('display')
        } else {
          if (glyph) glyph.style.display = 'none'
          if (entry.media) {
            const image = custom || document.createElement('img')
            image.className = 'nav-custom-icon'
            image.src = '/p/' + config.token + '/media/' + entry.media.id + '/320.webp'
            image.alt = ''
            if (!custom) el.appendChild(image)
          } else {
            if (custom) custom.remove()
            if (entry.navIcon && entry.navIcon !== 'none') {
              if (glyph) glyph.insertAdjacentHTML('afterend', icons[entry.navIcon] || '')
              const next = glyph && glyph.nextElementSibling
              if (next && next.tagName.toLowerCase() === 'svg') next.dataset.navIcon = '1'
            }
          }
        }
      }
      const set = (name, value) => { if (value !== undefined && value !== null && value !== '') el.style.setProperty(name, String(value), 'important') }
      if (style.fontSize) set('font-size', style.fontSize + 'px')
      if (style.weight) set('font-weight', style.weight)
      if (style.color) set('color', style.color)
      if (style.align) set('text-align', style.align)
      if (style.lineHeight) set('line-height', style.lineHeight)
      if (style.width) set('width', style.width + '%')
      if (style.height) set('height', style.height + 'px')
      if (style.padding !== undefined) set('padding', style.padding + 'px')
      if (style.margin !== undefined) set('margin', style.margin + 'px')
      if (style.gap !== undefined) set('gap', style.gap + 'px')
      if (style.background) set('background', style.background)
      if (style.radius !== undefined) set('border-radius', style.radius + 'px')
      if (style.border !== undefined) set('border', style.border ? style.border + 'px solid currentColor' : 'none')
      if (style.shadow) set('box-shadow', style.shadow === 'none'
        ? 'none'
        : style.shadow === 'strong'
          ? '0 18px 40px -18px rgba(0,0,0,.55)'
          : '0 10px 24px -16px rgba(0,0,0,.4)')
      if (style.layout && (el.tagName === 'DIV' || el.tagName === 'A')) {
        if (style.layout === 'row') { set('display', 'flex'); set('flex-direction', 'row'); set('align-items', 'center') }
        else if (style.layout === 'grid') { set('display', 'grid'); set('grid-template-columns', 'repeat(2, minmax(0, 1fr))') }
        else { set('display', 'flex'); set('flex-direction', 'column') }
      }
      if (el.tagName === 'svg') {
        if (style.color) { set('fill', style.color); set('stroke', style.color) }
        if (entry.hidden) el.style.display = 'none'
      }
      if (el.tagName === 'IMG') {
        if (style.imageFit) set('object-fit', style.imageFit)
        const focalX = style.focalX ?? (entry.media && entry.media.focalX)
        const focalY = style.focalY ?? (entry.media && entry.media.focalY)
        if (focalX !== undefined || focalY !== undefined) set('object-position', (focalX ?? 50) + '% ' + (focalY ?? 50) + '%')
        const crop = [style.cropTop, style.cropRight, style.cropBottom, style.cropLeft]
        if (crop.some((value) => value !== undefined)) {
          set('object-view-box', 'inset(' + (style.cropTop || 0) + '% ' + (style.cropRight || 0) + '% ' + (style.cropBottom || 0) + '% ' + (style.cropLeft || 0) + '%)')
        } else el.style.removeProperty('object-view-box')
        if (style.aspect === 'square') set('aspect-ratio', '1')
        else if (style.aspect === 'portrait') set('aspect-ratio', '4 / 5')
        else if (style.aspect === 'wide') set('aspect-ratio', '16 / 9')
        else if (style.aspect === 'auto') set('aspect-ratio', 'auto')
      }
      if (entry.action && !boundEl && (el.hasAttribute('data-go') || el.tagName === 'A')) {
        el.setAttribute('data-go', entry.action.screen)
        if (el.tagName === 'A') el.setAttribute('href', '#')
      }
    })
  }
  annotate()
  buildClones()
  orderElements()
  apply()
  window.__plattrAnnotate = () => { annotate(); buildClones(); orderElements(); apply() }
})()
</script>`

/**
 * The bridge the editor's canvas needs: it selects a section on click and
 * reports drag-reorder as a message. It is only injected when the editor asks
 * for it, so a published app carries no editor code.
 */
const EDITOR_BRIDGE = `
<style>
body[data-editor="1"] .doc-section { cursor: pointer; }
</style>
<script>
(() => {
  const send = (message) => parent.postMessage({ source: 'plattr-canvas', ...message }, '*')
  const sections = Array.from(document.querySelectorAll('[data-sec]'))
  for (const section of sections) {
    section.draggable = true
    section.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      const hit = event.target.closest('[data-el]')
      if (hit) {
        document.querySelectorAll('.el-selected').forEach((el) => el.classList.remove('el-selected'))
        hit.classList.add('el-selected')
        send({ type: 'element', id: section.dataset.sec, key: hit.dataset.el, tag: hit.tagName.toLowerCase(), bound: hit.dataset.elBound === '1', nav: hit.dataset.elNav === '1', action: hit.hasAttribute('data-go') || hit.tagName === 'A' })
      } else {
        send({ type: 'select', id: section.dataset.sec })
      }
    }, true)
    section.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('text/plain', section.dataset.sec)
      event.dataTransfer.effectAllowed = 'move'
    })
    section.addEventListener('dragover', (event) => {
      event.preventDefault()
      section.classList.add('doc-drop')
    })
    section.addEventListener('dragleave', () => section.classList.remove('doc-drop'))
    section.addEventListener('drop', (event) => {
      event.preventDefault()
      section.classList.remove('doc-drop')
      const id = event.dataTransfer.getData('text/plain')
      if (id && id !== section.dataset.sec) send({ type: 'move', id, before: section.dataset.sec })
    })
  }
  document.querySelectorAll('.tabbar .tab').forEach((tab) => {
    tab.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      document.querySelectorAll('.el-selected').forEach((el) => el.classList.remove('el-selected'))
      tab.classList.add('el-selected')
      send({ type: 'element', id: null, key: tab.dataset.el, tag: 'button', bound: false, nav: true })
    }, true)
  })
  document.addEventListener('click', (event) => {
    const go = event.target.closest('[data-go]')
    if (go) setTimeout(() => send({ type: 'screen', id: go.dataset.go }), 60)
  }, true)
  addEventListener('message', (event) => {
    const message = event.data
    if (!message || message.source !== 'plattr-editor') return
    if (message.type === 'select') {
      for (const section of sections) section.classList.toggle('doc-selected', section.dataset.sec === message.id)
      document.querySelectorAll('.el-selected').forEach((el) => el.classList.remove('el-selected'))
      const target = sections.find((section) => section.dataset.sec === message.id)
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    if (message.type === 'element') {
      document.querySelectorAll('.el-selected').forEach((el) => el.classList.remove('el-selected'))
      const node = document.querySelector('[data-el="' + String(message.key).replace(/"/g, '') + '"]')
      if (node) {
        node.classList.add('el-selected')
        node.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  })
  send({ type: 'ready' })
})()
</script>`

/**
 * The specification as a customer may see it. A description-built app carries
 * the trade's sample phone, address, hours and team; they stay editable in the
 * studio, but the customer never sees them as if the owner had confirmed them.
 * A value equal to the trade's seed is sample, while anything the owner or
 * their site supplied is kept.
 *
 * The publishing guard uses this too, so deciding whether a component has
 * anything to show is made against exactly the data the customer receives.
 */
export function customerSpec(inputSpec: AppSpec): AppSpec {
  const seed = verticalFor(inputSpec.vertical)
  const contact = (value: string | undefined, sample: string | undefined): string => {
    const text = (value ?? '').trim()
    if (!text) return ''
    return sample && text === sample.trim() ? '' : text
  }
  const sampleTeam = inputSpec.sampleContent?.team === true || inputSpec.sampleContent?.staff === true
  // An explicitly unvalidated price was read from the page as a whole rather
  // than from this item's own record. Publishing it as this item's amount would
  // turn a guess into a fact, so the customer sees the item as unpriced. The
  // owner review still shows the reading, its page and its unverified flag.
  const menu = inputSpec.menu.map((section) => ({
    ...section,
    items: section.items.map((item) => ({
      ...item,
      price: item.price > 0 && item.priceEvidence && item.priceEvidence.validated !== true ? 0 : item.price,
    })),
  }))
  return {
    ...inputSpec,
    menu,
    ...(inputSpec.sampleContent?.contact
      ? {
          phone: contact(inputSpec.phone, seed.phone),
          address: contact(inputSpec.address, seed.address),
          hours: contact(inputSpec.hours, seed.hours),
        }
      : {}),
    ...(sampleTeam ? { team: [], staff: [] } : {}),
    // The customer never sees a sample ribbon on hidden details; the editor
    // keeps the flag so the owner still knows what is theirs to replace.
    ...(inputSpec.sampleContent ? { sampleContent: { ...inputSpec.sampleContent, contact: false } } : {}),
  }
}

export function renderApp(
  inputSpec: AppSpec,
  options: {
    token: string
    live?: boolean
    /** Allocated deck position. Omitted builds fall back to the token hash. */
    slot?: number
    /** Project version; used only when no allocated slot is supplied. */
    version?: number
    /** Preview-only overrides, used by the demo route to show one axis at a time. */
    preview?: PreviewOverrides
    /** Trade-matched photo URLs, resolved by the server. Omitted means artwork. */
    photos?: { wide?: string[]; thumb?: string[] }
    /** Customer builds stay out of search; demo builds remain indexable. */
    noindex?: boolean
    /** The editable document; absent keeps the seeded composition. */
    doc?: Doc
    /** Adds the editor bridge (selection and drag) to the rendered page. */
    editor?: boolean
    /** Editor-only: open on this screen instead of the document's initial one. */
    screen?: string
    /** The five flagship trades opt into the mobile-first composition layer. */
    flagship?: boolean
    /** Online payment is optional; absent keeps every existing workflow. */
    payments?: { payOrders: boolean; payBookings: boolean; provider?: string }
    /** Return only one shelf's cards, for a catalogue page past the first. */
    cards?: { section: number; from: number; count: number }
  },
): string {
  const spec: AppSpec = options.editor ? inputSpec : customerSpec(inputSpec)
  const live = options.live !== false
  const vertical = verticalFor(spec.vertical)
  const vocab: Vocab = vertical.vocab
  const doc = options.doc ? normalizeDoc(options.doc, spec) : null
  const preview = { ...(spec.layout ?? {}), ...suppliedPreview(options.preview) }
  // A direction is opt-in through the document, so untouched legacy builds keep
  // their seeded rendering. New documents carry one from birth; the demo route
  // may request one explicitly for quality review.
  const requestedDirection =
    (typeof preview.direction === 'string' ? preview.direction : undefined) ?? doc?.design?.direction
  const look = requestedDirection ? directionFor(vertical.id, requestedDirection) : null
  const themed = look ? themeForDirection(vertical.id, look.id) : themeFor(vertical.id)
  const withType = doc?.design?.typography
    ? { ...themed, ...typographyTheme(doc.design.typography) }
    : themed
  const theme = resolveTheme(
    doc?.design?.nav ? { ...withType, nav: doc.design.nav } : withType,
    spec.design,
  )
  const shell: ShellId = theme.shell ?? 'standard'
  // A saved document that predates the flagship composition stays on the
  // generic document renderer: never show static markup that ignores its edits.
  const flagship =
    options.flagship === true &&
    FLAGSHIP_TRADES.has(vertical.id) &&
    (!doc || homeSections(doc).some((node) => node.kind === 'flagship'))
  // The concept is structural, not a palette. Every screen reads these axes so
  // the catalogue, detail page and chrome belong to the concept the owner saw
  // before choosing it.
  const concept = flagship ? blueprintFor(spec) : null
  // A restaurant opens on its menu, a listings app on search. Home is optional.
  // With an application document, the owner chooses the initial screen.
  const initial = options.screen
    ? options.screen
    : doc
      ? initialAppScreen(doc)
      : shell === 'menu' || shell === 'listing'
        ? 'catalog'
        : 'home'
  // Only a catalogue with sellers needs a store screen to open on to.
  const hasVendors = spec.menu.some((section) => section.items.some((item) => item.vendor))
  // A design chosen on the brief is part of the spec, so every renderer — the
  // review link, the downloads, a preview iframe — lands on the same structure.
  // Explicit preview axes (the demo route) still win.
  const preset = presetFor(preview.preset)
  // Photography enters a build when the server resolves images for it. The
  // five flagship trades always bring their local library.
  const hasPhotos = (options.photos?.wide?.length ?? 0) > 0 && (options.photos?.thumb?.length ?? 0) > 0
  // Layouts are dealt from a deck keyed on the build's allocated slot (or its
  // token and version for unallocated builds). One pass holds 2,304 layouts:
  // 4 card layouts x 3 rhythms x 3 media treatments x 4 hero compositions x 4
  // section orders x 4 hero scales, or 768 without photos. Corners move with
  // every build, so the combined design cycle is 6,912 with photos (2,304
  // without). Slots are allocated per build in the database, so projects and
  // versions do not collide before the deck is exhausted. Changing the deck
  // order re-maps existing builds; nothing is migrated.
  const version = Math.max(1, Math.floor(options.version ?? 1))
  const baseLayouts = hasPhotos ? 36 : 12
  const layoutCount = baseLayouts * HERO_COMPOSITIONS.length * HOME_ORDERS.length * HERO_SCALES.length
  const allocated = Number.isFinite(options.slot) ? Math.max(0, Math.floor(options.slot!)) : null
  const cursor = allocated ?? hashSeed(options.token, 11) + version - 1
  const layoutIndex = cursor % layoutCount
  const variant = (preview.variant ?? look?.options.variant ?? layoutIndex % 4) as 0 | 1 | 2 | 3
  const density =
    preview.density ??
    doc?.design?.density ??
    look?.options.density ??
    ['cozy', 'standard', 'roomy'][Math.floor(layoutIndex / 4) % 3]
  // Corners move with every build, not only after a layout pass, so adjacent
  // projects also differ in radius. The combined cycle is 6,912 with photos.
  const corners =
    preview.corners ?? ['sharp', 'soft', 'round'][(cursor + Math.floor(cursor / layoutCount)) % 3]
  const media = (preview.media ??
    (flagship && hasPhotos ? 'photo' : hasPhotos ? ['photo', 'mixed', 'art'][Math.floor(layoutIndex / 12) % 3] : 'art')) as
    | 'photo'
    | 'mixed'
    | 'art'
  const hero = choose(
    preview.hero,
    HERO_COMPOSITIONS,
    choose(spec.structure?.hero, HERO_COMPOSITIONS, HERO_COMPOSITIONS[Math.floor(layoutIndex / baseLayouts) % 4]),
  )
  const order = choose(
    preview.order,
    HOME_ORDERS,
    HOME_ORDERS[Math.floor(layoutIndex / (baseLayouts * HERO_COMPOSITIONS.length)) % 4],
  )
  const heroScale = choose(
    preview.heroScale,
    HERO_SCALES,
    HERO_SCALES[Math.floor(layoutIndex / (baseLayouts * HERO_COMPOSITIONS.length * HOME_ORDERS.length)) % 4],
  )
  // An imported design owns its corner radius; the seed only shapes builds we
  // generated from a brief.
  const radiusScale = spec.design ? 1 : corners === 'sharp' ? 0.55 : corners === 'round' ? 1.45 : 1
  // The element shapes are the customer's, not the seed's: absent means the
  // trade's own geometry stays in charge.
  const shape = (value: unknown) =>
    value === 'square' || value === 'soft' || value === 'round' ? value : undefined
  const buttons = shape(preview.buttons) ?? doc?.design?.buttons ?? look?.options.buttons
  const cards = shape(preview.cards) ?? doc?.design?.cards ?? look?.options.cards
  const accent = legibleAccent(doc?.accent || spec.accent, theme.dark)
  const onAccent = inkFor(accent)
  const drawer = spec.structure?.nav === 'drawer'
  const has = (feature: FeatureId) => spec.features.includes(feature)
  // Hotels never enter the basket path. A stay is a room request with dates,
  // not a quantity of products, even if an imported brief advertised ordering.
  const ordering = has('ordering') && vertical.id !== 'hotel'
  const booking = has('booking') || has('classes')
  const timetable = has('classes') && (vertical.timetable?.length ?? 0) > 0 ? vertical.timetable! : []
  const quoting = has('quote')
  const goal = Math.max(2, Math.min(12, spec.loyalty.goal || 6))

  // A hotel's first step is choosing a room, not a blank availability form.
  // Its stay request remains the secondary action once a room is in view.
  const cta = vertical.id === 'hotel' ? 'catalog' : ctaFor(vertical.id)
  const actions = spec.actions ?? actionLabelsFor(vertical.id, vocab)
  const primary =
    vocab.detailAction === 'quote' && quoting
      ? { label: actions.home, screen: 'quote' }
      : cta === 'order' && ordering
      ? { label: actions.home, screen: 'cart' }
      : cta === 'quote' && quoting
        ? { label: actions.home, screen: 'quote' }
        : cta === 'book' && booking
          ? { label: actions.home, screen: 'book' }
          : cta === 'catalog'
            // The trade opens on its list, so its own phrasing names the button.
            ? { label: actions.home, screen: 'catalog' }
            : { label: `See the ${vocab.catalog.toLowerCase()}`, screen: 'catalog' }
  const secondary =
    primary.screen !== 'book' && booking
      ? { label: actions.book, screen: 'book' }
      : primary.screen !== 'quote' && quoting
        ? { label: actions.quote, screen: 'quote' }
        : null
  const ctx: Ctx = {
    spec,
    theme,
    vertical,
    label: (spec.category || '').trim() || vertical.label,
    vocab,
    accent,
    onAccent,
    ordering,
    booking,
    quoting,
    radiusScale,
    media,
    hero,
    order,
    heroScale,
    photos: { wide: options.photos?.wide ?? [], thumb: options.photos?.thumb ?? [] },
    token: options.token,
    timetable,
    goal,
    actions: [primary, ...(secondary ? [secondary] : [])],
    doc,
    editor: options.editor === true,
  }

  // A later catalogue page is the same cards as the first, rendered by the same
  // function; the shell, scripts and catalogue data are not shipped again.
  if (options.cards) return catalogCards(ctx, options.cards.section, options.cards.from, options.cards.count)

  const tabs = doc ? tabsFromDoc(doc) : tabsFor(ctx, shell)
  // The chrome names the screen the way its tab does, so a restored heading
  // reads "Visit" rather than the generic "More".
  const moreTitle = tabs.find((tab) => tab.id === 'more')?.label ?? 'More'

  const data = {
    token: options.token,
    shell,
    vertical: spec.vertical,
    initial,
    logo: spec.logo,
    brand: spec.name,
    phone: spec.phone.trim(),
    ordering,
    booking,
    quoting,
    loyalty: has('loyalty'),
    goal,
    reward: spec.loyalty.reward,
    fulfilment: spec.fulfilment?.options?.length ? spec.fulfilment.options : vocab.fulfilment,
    // A delivery fee is a business fact, not a capability. Plattr used to
    // publish 2.99 for every ordering app; a rate now exists only when the
    // source stated one or the owner set one, and otherwise the customer sees
    // no charge until the business confirms its terms.
    deliveryFee:
      ordering && (spec.fulfilment?.options?.length ? spec.fulfilment.options : vocab.fulfilment).includes('Delivery')
        ? Math.max(0, spec.fulfilment?.deliveryFee ?? 0)
        : 0,
    deliverySource: spec.fulfilment?.source ?? 'default',
    // Course checkouts still create orders; the wording follows the trade.
    isCourse: spec.vertical === 'courses',
    addLabel: actions.add,
    placeLabel: spec.vertical === 'courses' ? 'Confirm enrolment' : 'Place order',
    viewLabel: actions.view,
    payments: options.payments
      ? {
          enabled: true,
          orders: options.payments.payOrders,
          bookings: options.payments.payBookings,
          provider: options.payments.provider ?? '',
        }
      : { enabled: false, orders: false, bookings: false, provider: '' },
    partyLabel: vocab.partyLabel,
    slots: vocab.slots,
    catalogWord: vocab.catalog.toLowerCase(),
    itemWord: vocab.item,
    itemWords: pluralWord(vocab.item),
    // The retail composition asks the browser for its own search, sort and
    // paging; every other layout keeps the section controls it was built with.
    retail: theme.layout === 'retail',
    listingSpecLabel: vocab.listingSpecLabel || 'Included',
    bookTitle: actions.book,
    quoteTitle: actions.quote,
    // A trade may sell a proposal rather than an appointment even when it also
    // offers a booking screen. The detail page leads with the real first step.
    detailAction: vocab.detailAction ?? (booking ? 'book' : quoting ? 'quote' : ''),
    motif: theme.motif,
    media,
    // Only ship the sets this build can actually use.
    photoWide: media === 'art' ? [] : ctx.photos.wide,
    photoThumb: media === 'photo' ? ctx.photos.thumb : [],
    // The public payload carries what a customer needs to choose and buy. It
    // never carries the source URL, extraction method, validation flags or the
    // owner's correction record: those belong to the owner review, not to a
    // public app or its browser state.
    menu: publicMenu(spec.menu),
    // The shop's own currency, never a guessed dollar: an imported build with
    // no confirmed currency shows bare amounts until the owner confirms one.
    currencySymbol: spec.currency
      ? CURRENCY_SYMBOLS[spec.currency.toUpperCase()] ?? ''
      : spec.website
        ? ''
        : '$',
    currency: (spec.currency ?? '').toUpperCase(),
    imported: Boolean(spec.website),
    catalogPage,
  }

  // A real logo replaces the initials wherever the brand mark appears; the
  // monogram remains the fallback when no trustworthy image was found.
  // A failed remote logo falls back to initials, not to a long wordmark that
  // the 26px mark would clip to its first few letters.
  const initials = (spec.name.match(/[A-Za-z0-9]+/g) || [])
    .filter((word) => !['and', 'the', 'of', 'for'].includes(word.toLowerCase()))
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase() || spec.logo.slice(0, 2)
  // The logo sits beside the business name, so it is decorative. An empty alt
  // also stops a failed remote logo dumping its alt text across the title.
  const markHtml = spec.logoImage
    // No width/height attributes: they would impose a square ratio on a wide
    // wordmark and crop it to the first few letters at 26px tall.
    ? `<img src="${esc(spec.logoImage.url)}" alt="" aria-hidden="true" decoding="async" referrerpolicy="no-referrer" />`
    : esc(spec.logo)

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${esc(`${spec.name} · ${spec.kind}`)}</title>
<meta name="description" content="${esc(spec.tagline)}" />
<meta name="theme-color" content="${theme.bg}" />
${options.noindex ? '<meta name="robots" content="noindex, nofollow" />' : ''}
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="${theme.dark ? 'black-translucent' : 'default'}" />
${live ? '<link rel="manifest" href="./manifest.webmanifest" />' : ''}
${live ? '<link rel="icon" href="./icon.svg" type="image/svg+xml" />' : ''}
<style>${CSS(ctx)}${presetCss(preset)}${DOC_CSS}${flagship ? flagshipCss() : ''}</style>
</head>
<body data-trade="${vertical.id}" data-layout="${theme.layout}" data-shell="${shell}" data-variant="${variant}" data-density="${density}" data-corners="${corners}" data-media="${media}" data-nav="${drawer ? 'drawer' : theme.nav}" data-hero="${hero}" data-order="${order}" data-hero-scale="${heroScale}" data-accent-style="${theme.accentStyle}" data-theme="${theme.dark ? 'dark' : 'light'}"${look ? ` data-direction="${look.id}"` : ''}${doc?.design?.typography ? ` data-type="${doc.design.typography}"` : ''}${buttons ? ` data-buttons="${buttons}"` : ''}${cards ? ` data-cards="${cards}"` : ''}${preset ? ` data-preset="${preset}"` : ''}${flagship ? ' data-flagship="1"' : ''}${concept ? ` data-concept="${concept.id}" data-header="${concept.architecture.header}" data-catalog="${concept.architecture.catalog}" data-card="${concept.architecture.cards}" data-detail="${concept.architecture.detail}" data-imagery="${concept.architecture.imagery}" data-concept-type="${concept.architecture.type}"` : ''}${options.editor ? ' data-editor="1"' : ''}>
  <div class="app">
    <div class="grain" aria-hidden="true"></div>
    <div class="offline" data-offline hidden>Offline — showing what is already stored</div>

    <div class="splash" data-splash>
      <div class="s-mark${spec.logoImage ? ' is-logo' : ''}">${markHtml}</div>
      <b>${esc(spec.name)}</b>
      <span>${esc(ctx.label)}</span>
    </div>

    <header class="appbar${shell === 'menu' ? ' is-brand' : ''}${shell === 'session' ? ' is-session' : ''}${shell === 'care' ? ' is-care' : ''}${shell === 'listing' ? ' is-listing' : ''}">
      <button class="iconbtn" type="button" data-back hidden aria-label="Back">${icon('chevron')}</button>
      ${shell === 'menu' ? '' : `<span class="mark${spec.logoImage ? ' is-logo' : ''}"${spec.logoImage ? ` data-logo="${esc(initials)}"` : ''}>${markHtml}</span>`}
      ${
        shell === 'listing'
          ? `<button class="search-pill bar-pill" type="button" data-search-open>${icon('search')}<span>Search</span></button>
             <div class="titles bar-titles"><span class="kicker">${esc(ctx.label)}</span><span class="title" data-title>${esc(spec.name)}</span></div>`
          : `<div class="titles">
        <span class="kicker">${shell === 'care' ? esc((spec.hours || '').split('·')[0].trim()) : esc(ctx.label)}</span>
        <span class="title" data-title>${esc(spec.name)}</span>
      </div>`
      }
      ${shell === 'listing' ? '' : `<button class="iconbtn" type="button" data-search-open aria-label="Search">${icon('search')}</button>`}
      <button class="iconbtn" type="button" data-saved-open aria-label="Saved">${icon('heart')}<span class="count" data-saved-badge hidden>0</span></button>
      ${drawer ? `<button class="iconbtn" type="button" data-nav-open aria-label="Menu">${icon('dots')}</button>` : ''}
      ${spec.phone.trim() ? `<a class="iconbtn" href="tel:${esc(spec.phone.replace(/\s/g, ''))}" aria-label="Call">${icon('phone')}</a>` : ''}
      ${
        ordering
          ? `<button class="iconbtn" type="button" data-cart-open aria-label="Your ${esc(vocab.order.toLowerCase())}">${icon('bag')}<span class="count" data-badge hidden>0</span></button>`
          : ''
      }
    </header>

    <main class="screens">
      <section class="screen${initial === 'home' ? ' on' : ''}" data-screen="home" data-title="${esc(spec.name)}">
        ${
          flagship
            ? flagshipHome(ctx)
            : `<div>
               ${shellOpener(ctx, shell)}
               ${homeBlock(ctx)}
             </div>`
        }
        ${!spec.menu.length && spec.vertical === 'restaurant' ? emptyHomeNote(ctx) : ''}
      </section>

      <section class="screen${initial === 'catalog' ? ' on' : ''}" data-screen="catalog" data-title="${esc(vocab.catalog)}">
        ${
          theme.layout === 'retail'
            ? retailShop(ctx)
            : `${flagship ? flagshipCatalogLead(spec) : ''}
        ${shell === 'menu' ? menuMasthead(ctx) : ''}
        <div class="sect" style="margin-top:4px"><span class="label">${esc(vocab.catalog)}</span><span class="count">${spec.menu.reduce((total, section) => total + section.items.length, 0)}</span></div>
        <div class="tiny dim" data-catalog-count>Showing ${spec.menu.reduce((total, section) => total + Math.min(catalogFirst, section.items.length), 0)} of ${spec.menu.reduce((total, section) => total + section.items.length, 0)} ${esc(pluralWord(vocab.item))}</div>
        ${storesBlock(ctx)}
        ${catalogBlock(ctx)}`
        }
      </section>

      <section class="screen" data-screen="search" data-title="Search">
        <div class="search-field">
          <span class="search-ico">${icon('search')}</span>
          <input id="search" type="text" inputmode="search" autocomplete="off" data-search-input placeholder="Search the ${esc(vocab.catalog.toLowerCase())}" aria-label="Search" />
          <button class="search-clear" type="button" data-search-clear aria-label="Clear">${icon('close')}</button>
        </div>
        <div class="chips" data-search-recent></div>
        <div class="search-browse">
          <div class="sect"><span class="label">Browse by group</span></div>
          <div class="search-cats">${spec.menu
            .filter((section) => section.items.length)
            .slice(0, 6)
            .map(
              (section) =>
                `<button class="search-cat" type="button" data-go="catalog"><span>${esc(section.name)}</span><em>${section.items.length}</em></button>`,
            )
            .join('')}</div>
        </div>
        <div data-search-results></div>
      </section>

      <section class="screen" data-screen="saved" data-title="Saved">
        <div class="sect" style="margin-top:4px"><span class="label">Saved</span><span class="count" data-saved-count>0</span></div>
        <div data-saved-list></div>
      </section>

      ${
        booking
          ? `<section class="screen is-booking${initial === 'book' ? ' on' : ''}" data-screen="book" data-title="${esc(actions.book)}">
               ${timetableBlock(ctx)}
               ${bookingBlock(ctx)}
             </section>`
          : ''
      }

      ${
        quoting
          ? `<section class="screen${initial === 'quote' ? ' on' : ''}" data-screen="quote" data-title="${esc(actions.quote)}">
               ${quoteBlock(ctx)}
             </section>`
          : ''
      }

      <section class="screen${initial === 'more' ? ' on' : ''}" data-screen="more" data-title="${esc(moreTitle)}">
        ${moreBlock(ctx)}
      </section>

      ${
        hasVendors
          ? `<section class="screen" data-screen="store" data-title="Store">
               <div data-store-body></div>
             </section>`
          : ''
      }

      <section class="screen is-detail" data-screen="detail" data-title="Details" data-detail>
        <div data-detail-body></div>
      </section>

      ${doc
        ? doc.screens
            .filter(
              (entry) =>
                !entry.hidden &&
                (entry.kind === 'contact' || entry.kind === 'profile' || entry.kind === 'about' || entry.kind === 'custom'),
            )
            .map((entry) => customScreen(ctx, entry, initial === entry.id))
            .join('')
        : ''}
    </main>

    <nav class="tabbar">
      ${tabs
        .map(
          (tab, index) =>
            `<button class="tab${tab.id === initial ? ' on' : ''}" type="button" ${
              tab.kind === 'cart' ? 'data-cart-open' : `data-go="${tab.id}"`
            }>${tab.glyph}<span>${esc(tab.label)}</span></button>`,
        )
        .join('')}
    </nav>

    <div class="scrim" data-scrim></div>

    ${ordering ? `<div class="sheet" data-sheet="cart" role="dialog" aria-modal="true" aria-label="Your ${esc(vocab.order.toLowerCase())}">
      <div class="handle"></div>
      <div class="sheet-head">
        <h2>Your ${esc(vocab.order.toLowerCase())}</h2>
        <button class="iconbtn" type="button" data-close-sheet aria-label="Close">${icon('close')}</button>
      </div>
      <div class="sheet-body">
        <div data-cart></div>
        <div data-cart-foot hidden>
          <div class="seg" data-order-type>
            ${vocab.fulfilment
              .map(
                (option, index) =>
                  `<button type="button" class="${index === 0 ? 'on' : ''}" data-type="${esc(option)}">${esc(option)}</button>`,
              )
              .join('')}
          </div>
          <div class="totals" data-totals></div>
          <div class="field" style="margin-top:12px"><label for="checkout-name">Your name</label><input id="checkout-name" type="text" maxlength="60" data-checkout-name placeholder="Name" autocomplete="name" /></div>
          <div class="field"><label for="checkout-contact">Phone or email</label><input id="checkout-contact" type="text" maxlength="120" data-checkout-contact placeholder="How the business reaches you" autocomplete="tel" /></div>
          <button class="btn accent block" type="button" data-place style="margin-top:12px">${data.placeLabel || 'Place order'}</button>
          <p class="tiny dim" style="text-align:center;margin-top:9px">${data.payments.enabled ? 'You can pay online after ordering. Card details are entered on the business\'s connected gateway, never in this app.' : 'No payment is taken in the app. Pay the business on collection or delivery.'}</p>
        </div>
        <div data-cart-done hidden></div>
      </div>
    </div>` : ''}

    ${drawer ? `<div class="sheet" data-sheet="nav" role="dialog" aria-modal="true" aria-label="Menu">
      <div class="handle"></div>
      <div class="sheet-head">
        <h2>Where to</h2>
        <button class="iconbtn" type="button" data-close-sheet aria-label="Close">${icon('close')}</button>
      </div>
      <div class="sheet-body">
        <div class="nav-list">
          ${tabs
            .map(
              (tab) =>
                `<button type="button" ${tab.kind === 'cart' ? 'data-cart-open' : `data-go="${tab.id}"`}><span>${esc(tab.label)}</span>${tab.glyph}</button>`,
            )
            .join('')}
        </div>
        ${spec.hours ? `<p class="tiny dim" style="margin-top:14px">${esc(spec.hours)}</p>` : ''}
      </div>
    </div>` : ''}

    <div class="sheet" data-sheet="note" role="dialog" aria-modal="true" aria-label="Confirmation">
      <div class="handle"></div>
      <div class="sheet-body" data-note-body></div>
    </div>

    <div class="toast" data-toast></div>
  </div>

  <script>
  (() => {
    const DATA = ${JSON.stringify(data).replace(/</g, '\\u003c')}
    const KEY = 'plattr:v2:' + DATA.token
    const stored = JSON.parse(localStorage.getItem(KEY) || '{}')
    // The catalogue filter used to live in state; drop the leftover so dead data
    // is not copied back into every save.
    const hadDeadFilter = !!stored && typeof stored === 'object' && 'filter' in stored
    if (hadDeadFilter) delete stored.filter
    const state = Object.assign(
      { cart: {}, stamps: 0, orderType: DATA.fulfilment[0], party: 2, day: 0, slot: null, stars: 0, saved: {}, pick: {}, optionPicks: {}, recent: [], orders: [], bookings: [], customerName: '', customerContact: '' },
      stored,
    )
    if (!state.saved || typeof state.saved !== 'object') state.saved = {}
    if (!state.pick || typeof state.pick !== 'object') state.pick = {}
    if (!state.optionPicks || typeof state.optionPicks !== 'object') state.optionPicks = {}
    if (!Array.isArray(state.recent)) state.recent = []
    if (!Array.isArray(state.orders)) state.orders = []
    if (!Array.isArray(state.bookings)) state.bookings = []
    const save = () => localStorage.setItem(KEY, JSON.stringify(state))
    const postJson = async (path, body) => {
      const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error((payload.error && payload.error.message) || 'That could not be sent. Try again.')
      return payload
    }
    const contactFields = (contact) => ({ phone: contact.includes('@') ? '' : contact, email: contact.includes('@') ? contact : '' })
    if (hadDeadFilter) save()
    const $ = (sel) => document.querySelector(sel)
    const all = (sel) => Array.from(document.querySelectorAll(sel))
    // Same format as the server's money(): grouped thousands, pence only when
    // there are pence. One price on the tile and on the item page.
    const money = (cents) => {
      const abs = Math.abs(Math.round(cents))
      const whole = Math.floor(abs / 100).toLocaleString('en-US')
      const pence = abs % 100
      return (cents < 0 ? '−' : '') + DATA.currencySymbol + whole + (pence ? '.' + String(pence).padStart(2, '0') : '')
    }
    const esc = (value) => String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    // "1 people" was wrong on every confirmation. The trade decides the noun.
    const partyUnit = (count) => {
      const word = DATA.vertical === 'restaurant' || DATA.vertical === 'hotel' ? 'guest' : DATA.vertical === 'clinic' ? 'patient' : 'person'
      return count + ' ' + (count === 1 ? word : word === 'person' ? 'people' : word + 's')
    }
    const mediaMark = (label) => {
      const words = String(label || '').trim().replace(/\s+/g, ' ').split(' ')
        .filter((word) => word.length > 2 && !['the', 'and', 'for', 'with', 'from'].includes(word.toLowerCase()))
      return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || '').slice(0, 2) || '·').toUpperCase()
    }
    const missingMedia = (label) => '<span class="media-missing" data-label="' + esc(label) + '" data-mark="' + esc(mediaMark(label)) + '" aria-hidden="true"><svg class="media-missing-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="m21 15-5-5L5 19"/></svg><span class="media-missing-note">Image not supplied</span><span class="media-missing-label">' + esc(label) + '</span></span>'
    const buzz = (ms) => { try { if (navigator.vibrate) navigator.vibrate(ms) } catch (error) {} }
    // A remote logo that fails, or is a wordmark too wide to read at 26px
    // tall, falls back to the monogram instead of a clipped fragment.
    all('.mark.is-logo').forEach((mark) => {
      const logo = mark.querySelector('img')
      if (!logo) return
      const fallback = () => {
        if (!mark.querySelector('img')) return
        mark.textContent = mark.dataset.logo || ''
      }
      const fit = () => {
        if (!logo.naturalWidth || !logo.naturalHeight) return fallback()
        if (logo.naturalWidth / logo.naturalHeight > 4) return fallback()
      }
      if (logo.complete) fit()
      else logo.addEventListener('load', fit, { once: true })
      logo.addEventListener('error', fallback, { once: true })
    })
    const appbar = document.querySelector('.appbar')
    const titleEl = document.querySelector('[data-title]')
    const backBtn = document.querySelector('[data-back]')

    const itemFor = (key) => {
      const base = String(key).split('::')[0]
      const parts = base.split('-').map(Number)
      const section = DATA.menu[parts[0]]
      return section && section.items[parts[1]] ? section.items[parts[1]] : null
    }

    // Options are only real when a product has more than one priced variant.
    // The chosen one is remembered per item, and its price is what the cart and
    // the order use.
    function variantsOf(item) {
      return item && Array.isArray(item.variants) ? item.variants.filter((variant) => variant.price > 0) : []
    }
    function variantRef(variant) {
      return variant.id || variant.name
    }
    function chosenVariant(item, key) {
      const list = variantsOf(item)
      if (list.length < 2) return null
      const wanted = state.pick[key]
      const picked = list.find((variant) => variantRef(variant) === wanted)
      // A choice can go out of stock after it was saved in a bag. Move to the
      // default (or first) option still on sale; only show a sold-out choice
      // when the whole product is sold out.
      if (picked && picked.available !== false) return picked
      return list.find((variant) => variant.selected && variant.available !== false) || list.find((variant) => variant.available !== false) || picked || list[0]
    }
    /** The only option of a simple product. It is not a choice to show, but it
     *  is the Shopify identity the order and the shop share, so the bag and the
     *  order still name it. */
    function onlyVariant(item) {
      const list = variantsOf(item)
      return list.length === 1 ? list[0] : null
    }
    function cartParts(cartKey) {
      const raw = String(cartKey)
      const cut = raw.indexOf('::')
      const key = cut < 0 ? raw : raw.slice(0, cut)
      const ref = cut < 0 ? '' : decodeURIComponent(raw.slice(cut + 2))
      const item = itemFor(key)
      // A bag saved before single options were kept names the product alone; it
      // still resolves to that product's only option, so the order keeps the
      // Shopify variant it was added under.
      const variant = ref
        ? variantsOf(item).find((entry) => variantRef(entry) === ref) || null
        : onlyVariant(item)
      return { key: key, item: item, variant: variant }
    }
    function cartPrice(cartKey) {
      const parts = cartParts(cartKey)
      return parts.variant ? parts.variant.price : parts.item ? parts.item.price : 0
    }
    /** A rebuild can remove an option, or a whole product, while an older bag is
     *  still in storage. Reconcile before anything reads the bag: a line whose
     *  product is gone is dropped, and a line whose option is gone keeps its
     *  quantity at the product's own price — the price the server would charge
     *  when no option is named. A stored reference never leaves a line at zero. */
    function reconcileCart() {
      const next = {}
      let changed = false
      Object.keys(state.cart).forEach(function (cartKey) {
        const qty = Number(state.cart[cartKey])
        if (!(qty > 0)) {
          changed = true
          return
        }
        const parts = cartParts(cartKey)
        if (!parts.item || !(parts.item.price > 0)) {
          changed = true
          return
        }
        const settled = parts.variant ? cartKey : parts.key
        if (settled !== cartKey) changed = true
        next[settled] = (next[settled] || 0) + qty
      })
      if (changed) {
        state.cart = next
        save()
      }
      return changed
    }
    function variantHtml(item, key, chosen) {
      const list = variantsOf(item)
      if (list.length < 2) return ''
      return '<div class="variants" data-variants><span class="label">Choose an option · ' + list.length + '</span><div class="variant-row">' +
        list.map(function (variant) {
          const on = chosen && variantRef(chosen) === variantRef(variant)
          const soldOut = variant.available === false
          // A gift card or donation labels its option with the amount itself
          // ("£5.00"). Printing the name and then the price repeats the same
          // fact; the price alone still identifies the option.
          const priceOnly = /^[£$€₹¥][ ]?[0-9][0-9.,]*$/.test(String(variant.name).trim())
          return '<button class="variant' + (on ? ' on' : '') + (soldOut ? ' is-sold-out' : '') + '" type="button" data-variant="' + esc(variantRef(variant)) + '" data-variant-key="' + key + '" aria-pressed="' + (on ? 'true' : 'false') + '"' + (soldOut ? ' disabled' : '') + '>' +
            (variant.media ? '<img src="/p/' + esc(DATA.token) + '/media/' + esc(variant.media.id) + '/320.webp" alt="' + esc(item.name + (variant.name ? ' — ' + variant.name : '')) + '" style="width:18px;height:18px;object-fit:cover;border-radius:50%;margin-right:5px" />' : '') +
            (priceOnly
              ? '<b>' + (soldOut ? 'Unavailable' : money(variant.price)) + '</b>'
              : '<span>' + esc(variant.name) + '</span><b>' + (soldOut ? 'Unavailable' : money(variant.price)) + '</b>') +
            '</button>'
        }).join('') + '</div></div>'
    }

    /** A structured product is one whose variants carry a value for every
     *  group. Flat variant lists keep the old picker, so no saved catalogue
     *  gains combinations its owner never entered. */
    function structuredGroups(item) {
      const groups = Array.isArray(item && item.optionGroups) ? item.optionGroups.filter(function (group) { return group && group.name && Array.isArray(group.options) && group.options.length }) : []
      if (!groups.length) return []
      const list = variantsOf(item)
      // Only a complete set of values earns the grouped picker. A half-filled
      // catalogue keeps the flat, real variant list instead of inventing the
      // combinations its owner has not entered yet.
      const structured = list.length > 0 && list.every(function (variant) { return variant.values && groups.every(function (group) { return variant.values[group.name] }) })
      return structured ? groups : []
    }
    function optionPicks(item, key, chosen) {
      const groups = structuredGroups(item)
      if (!groups.length) return null
      const current = state.optionPicks[key]
      const match = current ? optionMatch(item, current) : null
      // An incomplete choice is kept while every value is a real option, so a
      // combination the owner never entered stays unpriced until the customer
      // changes a group. Only an impossible value resets the selection.
      const realValues = Boolean(current) && groups.every(function (group) {
        const value = current[group.name]
        return !value || variantsOf(item).some(function (variant) {
          return variant.values && variant.values[group.name] === value && variant.available !== false
        })
      })
      if (current && !match && realValues) return current
      if (!match || (match.available === false && chosen && chosen.available !== false)) delete state.optionPicks[key]
      if (!state.optionPicks[key]) {
        const from = chosen && chosen.values ? chosen.values : {}
        state.optionPicks[key] = {}
        structuredGroups(item).forEach(function (group) { if (from[group.name]) state.optionPicks[key][group.name] = from[group.name] })
      }
      return state.optionPicks[key]
    }
    function optionMatch(item, picks) {
      const groups = structuredGroups(item)
      if (!groups.length) return null
      if (!groups.every(function (group) { return picks && picks[group.name] })) return null
      return variantsOf(item).find(function (variant) {
        return variant.values && groups.every(function (group) { return variant.values[group.name] === picks[group.name] })
      }) || null
    }
    function optionGroupsHtml(item, key, chosen) {
      const groups = structuredGroups(item)
      if (!groups.length) return ''
      const list = variantsOf(item)
      const picks = optionPicks(item, key, chosen)
      return '<div class="option-groups" data-option-groups><span class="label">Choose your options</span>' +
        groups.map(function (group) {
          return '<div class="option-group"><span class="option-name">' + esc(group.name) + '</span><div class="variant-row" role="group" aria-label="' + esc(group.name) + '">' +
            group.options.map(function (option) {
              const candidates = list.filter(function (variant) { return variant.values && variant.values[group.name] === option })
              const found = candidates.find(function (variant) { return variant.available !== false })
              const on = picks[group.name] === option
              const soldOut = !found && candidates.length > 0
              return '<button class="variant' + (on ? ' on' : '') + (soldOut ? ' is-sold-out' : '') + '" type="button" data-option-group="' + esc(group.name) + '" data-option-value="' + esc(option) + '" data-option-key="' + key + '" aria-pressed="' + (on ? 'true' : 'false') + '"' + (!found || soldOut ? ' disabled' : '') + '>' + esc(option) + '</button>'
            }).join('') + '</div></div>'
        }).join('') + '</div>'
    }

    function toast(message) {
      const el = $('[data-toast]')
      el.textContent = message
      el.classList.add('on')
      clearTimeout(toast.timer)
      toast.timer = setTimeout(() => el.classList.remove('on'), 1900)
    }

    let current = DATA.initial || 'home'
    let detailOpen = false

    // A real navigation stack: the system back gesture walks our screens instead
    // of leaving the app.
    function push(entry) {
      try { history.pushState(entry, '') } catch (error) {}
    }

    /** The booking form opens on the service the customer was just reading,
     *  not on whichever entry happens to be first in the catalogue. */
    function applyBookingService() {
      const select = $('[data-book-service]')
      if (!select || !state.bookService) return
      const known = Array.prototype.some.call(select.options, function (option) {
        return option.value === state.bookService
      })
      if (known) select.value = state.bookService
      updateStay()
    }

    function go(id, record) {
      const screen = document.querySelector('[data-screen="' + id + '"]')
      if (!screen) return
      all('.screen').forEach((s) => s.classList.toggle('on', s === screen))
      all('.tab').forEach((tab) =>
        tab.classList.toggle('on', tab.dataset.go === id || (id === 'store' && tab.dataset.go === 'catalog')),
      )
      current = id
      detailOpen = false
      document.body.classList.remove('is-detail')
      // A store is a step off the catalogue, so it keeps the back affordance.
      if (backBtn) backBtn.hidden = id !== 'store'
      if (titleEl) titleEl.textContent = screen.dataset.title || DATA.catalogWord
      if (id === 'book') applyBookingService()
      screen.scrollTop = 0
      lastScroll = 0
      if (appbar) appbar.classList.remove('is-hidden')
      if (record !== false) push({ screen: id, detail: null })
      buzz(6)
    }

    // One seeded pick out of the trade's photo set, or nothing when the server
    // could not match any: the artwork then stands in without a broken tile.
    function pickShot(seed, list, alt, item) {
      if (item && item.media && item.media.id) {
        const media = item.media
        const base = '/p/' + DATA.token + '/media/' + media.id
        return '<img class="photo" src="' + base + '/640.webp" srcset="' + base + '/320.webp 320w, ' + base + '/640.webp 640w, ' + base + '/1280.webp 1280w" sizes="' + (list === 'photoWide' ? '100vw' : '(max-width: 620px) 38vw, 200px') + '" alt="' + esc(media.alt || alt || '') + '" loading="lazy" decoding="async" style="object-fit:' + (media.fit === 'contain' ? 'contain' : 'cover') + ';object-position:' + (media.focalX ?? 50) + '% ' + (media.focalY ?? 50) + '%" onerror="this.parentElement.classList.add(&quot;is-empty&quot;);this.remove()" />'
      }
      if (item && item.image && item.image.url) {
        return '<img class="photo" src="' + esc(item.image.url) + '" sizes="' + (list === 'photoWide' ? '100vw' : '(max-width: 620px) 38vw, 200px') + '" alt="' + esc((item.image.alt || alt || '')) + '" loading="lazy" decoding="async" referrerpolicy="no-referrer" style="object-fit:cover" onerror="this.parentElement.classList.add(&quot;is-empty&quot;);this.remove()" />'
      }
      // An imported business is never given this trade's stock photography as
      // if it were its own. Its upload or its source image is the only proof.
      if (DATA.imported) return ''
      const urls = DATA[list]
      if (DATA.media !== 'photo' || !urls || !urls.length) return ''
      let index = -1
      const key = /^(\d+)-(\d+)$/.exec(seed)
      if (key) {
        index = Number(key[2])
        for (let section = 0; section < Number(key[1]); section += 1) index += DATA.menu[section] ? DATA.menu[section].items.length : 0
      } else {
        index = 7
        for (let cursor = 0; cursor < seed.length; cursor += 1) index = (index * 31 + seed.charCodeAt(cursor)) % 99991
      }
      const url = urls[Math.max(0, index) % urls.length]
      const local = /^(.*)-\d+\.webp$/.exec(url)
      const srcset = local
        ? ' srcset="' + local[1] + '-320.webp 320w, ' + local[1] + '-640.webp 640w, ' + local[1] + '-1280.webp 1280w" sizes="100vw"'
        : ''
      return '<img class="photo" src="' + url + '"' + srcset + ' alt="' + esc(alt || '') + '" loading="lazy" decoding="async" onerror="this.parentElement.classList.add(&quot;is-empty&quot;);this.remove()" />'
    }

    // A short, real recommendation rail: other items from the same catalogue,
    // never invented content. It gives a sparse detail page a useful next step
    // instead of a screen of empty space above the action bar.
    function recsHtml(currentKey) {
      const picks = []
      DATA.menu.forEach(function (section, sectionIndex) {
        section.items.forEach(function (entry, itemIndex) {
          const key = sectionIndex + '-' + itemIndex
          if (key !== currentKey && picks.length < 4) picks.push({ item: entry, key: key })
        })
      })
      if (!picks.length) return ''
      return '<div class="recs"><div class="recs-head"><b>You might also like</b><span>' + esc(DATA.catalogWord) + '</span></div><div class="rec-row">' +
        picks.map(function (pick) {
          const shot = pickShot(pick.key, 'photoThumb', pick.item.name, pick.item)
          return '<button class="rec" type="button" data-item="' + pick.key + '">' +
            '<span class="thumb m-' + DATA.motif + ' rec-art' + (shot ? '' : ' is-empty') + '">' + missingMedia(pick.item.name) + shot + '</span>' +
            '<span class="rec-copy"><b>' + esc(pick.item.name) + '</b><span class="rec-price">' + (pick.item.price > 0 ? money(pick.item.price) : '') + '</span></span></button>'
        }).join('') + '</div></div>'
    }

    // The tax note belongs to the trade's way of selling, not one shared line.
    function detailNote() {
      const copy = DATA.vertical === 'restaurant' || DATA.vertical === 'cafe'
        ? 'Ask the kitchen about allergies when you order.'
        : DATA.vertical === 'hotel'
          ? 'Ask the team about access needs before you arrive.'
          : DATA.vertical === 'salon' || DATA.vertical === 'clinic'
            ? 'Ask us about allergies or access needs before your appointment.'
            : DATA.vertical === 'professional'
              ? 'Ask the team what this engagement includes before you book.'
              : 'Ask the team if you need help choosing.'
      return '<p class="tiny dim" style="margin-top:16px">' + copy + '</p>'
    }

    // Each shell opens an item its own way: a menu line, a class card, a
    // treatment sheet or a property listing — not one shared detail page.
    function detailHtml(item, key, price, chosen) {
      const section = DATA.menu[Number(String(key).split('-')[0])]
      const category = section ? section.name : ''
      const save = '<button class="save on-art detail-save' + (state.saved[key] ? ' on' : '') + '" type="button" data-save="' + key + '" aria-label="Save">' + HEART + '</button>'
      // A variant's own photograph replaces the product's without changing the
      // catalogue association; the fallback art keeps the app complete offline.
      const photo = chosen && chosen.media ? Object.assign({}, item, { media: chosen.media }) : item
      const shot = function (seed, list, alt, useItem) {
        return pickShot(seed, list, alt, useItem ? photo : null)
      }
      const image = shot(key, 'photoWide', item.name, true)
      const band = '<div class="thumb m-' + DATA.motif + ' detail-band' + (image ? '' : ' is-empty') + '">' + missingMedia(item.name) + image + save + '</div>'
      if (DATA.shell === 'menu')
        return '<div class="thumb m-' + DATA.motif + ' menu-band' + (image ? '' : ' is-empty') + '">' + missingMedia(item.name) + image + save + '</div>' +
          '<div class="detail-body menu-body">' +
          '<span class="eyebrow">' + esc(item.tag || DATA.catalogWord) + '</span>' +
          '<h1 class="menu-title">' + esc(item.name) + '</h1>' +
          (item.desc ? '<p class="lede">' + esc(item.desc) + '</p>' : '') +
          '<div class="menu-price"><span>' + esc(item.meta || 'House') + '</span><i></i><b class="price">' + price + '</b></div>' +
          recsHtml(key) +
          '<div class="detail-gap" aria-hidden="true"></div>' +
          '<div class="detail-cta">' + (DATA.ordering && item.price > 0
            ? '<button class="btn accent block" type="button" data-add="' + key + '">' + DATA.addLabel + '</button>'
            : '<button class="btn accent block" type="button" data-go="book">' + DATA.bookTitle + '</button>') + '</div>' +
          '</div>'
      if (DATA.shell === 'session') {
        return band + '<div class="detail-body session-body">' +
          '<span class="eyebrow">' + esc(item.tag || 'Class') + '</span>' +
          '<h1 class="session-title">' + esc(item.name) + '</h1>' +
          (item.desc ? '<p class="lede">' + esc(item.desc) + '</p>' : '') +
          '<div class="session-facts">' +
          '<div><b>' + esc(item.meta || '45 min') + '</b><span>Session</span></div>' +
          '<div><b class="price">' + price + '</b><span>Drop-in</span></div>' +
          '</div>' +
          recsHtml(key) +
          '<div class="detail-gap" aria-hidden="true"></div>' +
          '<div class="detail-cta"><button class="btn accent block" type="button" data-go="book">' + DATA.bookTitle + '</button></div>' +
          '</div>'
      }
      if (DATA.shell === 'care')
        return band + '<div class="detail-body care-body">' +
          '<span class="eyebrow">' + esc(item.tag || 'Appointment') + '</span>' +
          '<h1 class="care-title">' + esc(item.name) + '</h1>' +
          (item.desc ? '<p class="lede">' + esc(item.desc) + '</p>' : '') +
          '<div class="care-facts"><div><span>Time</span><b>' + esc(item.meta || '30 min') + '</b></div><div><span>Fee</span><b class="price">' + price + '</b></div></div>' +
          recsHtml(key) +
          '<div class="detail-gap" aria-hidden="true"></div>' +
          '<div class="detail-cta">' + (DATA.phone ? '<a class="btn ghost" href="tel:' + DATA.phone.replace(/\s/g, '') + '">Call</a>' : '') +
          '<button class="btn accent" type="button" data-go="book">' + DATA.bookTitle + '</button></div>' +
          '</div>'
      if (DATA.shell === 'listing') {
        const specs = String(item.meta || '').split('·').map(function (part) { return part.trim() }).filter(Boolean)
        const section = DATA.menu[Number(key.split('-')[0])]
        const category = section ? section.name : ''
        const wideShot = shot(item.name + '-wide', 'photoWide', item.name, true)
        const secondShot = shot(item.name + '-b', 'photoThumb')
        const thirdShot = shot(item.name + '-c', 'photoThumb')
        return '<div class="listing-gallery">' +
          '<div class="thumb m-' + DATA.motif + ' listing-shot wide' + (wideShot ? '' : ' is-empty') + '">' + missingMedia(item.name) + wideShot + '</div>' +
          '<div class="thumb m-' + DATA.motif + ' listing-shot' + (secondShot ? '' : ' is-empty') + '">' + missingMedia('') + secondShot + '</div>' +
          '<div class="thumb m-' + DATA.motif + ' listing-shot' + (thirdShot ? '' : ' is-empty') + '">' + missingMedia('') + thirdShot + '</div>' + save + '</div>' +
          '<div class="detail-body listing-body">' +
          '<span class="eyebrow">' + esc(item.tag || category || 'Listing') + '</span>' +
          '<h1 class="listing-title">' + esc(item.name) + '</h1>' +
          '<p class="listing-price">' + price + '</p>' +
          (specs.length ? '<div class="listing-specs">' + specs.map(function (part) { return '<div><b>' + esc(part) + '</b><span>' + esc(DATA.listingSpecLabel) + '</span></div>' }).join('') + '</div>' : '') +
          (item.desc ? '<p class="lede">' + esc(item.desc) + '</p>' : '') +
          // A marketplace item links to the store it came from; the viewing
          // agent block is property language and only appears without one.
          (item.vendor
            ? '<button class="agent store-link" type="button" data-store="' + esc(item.vendor) + '"><span class="thumb m-' + DATA.motif + ' agent-art"><span class="mono">' + esc(item.vendor.slice(0, 2).toUpperCase()) + '</span></span><div><b>' + esc(item.vendor) + '</b><span>Visit store</span></div></button>'
            : '<div class="agent"><span class="thumb m-' + DATA.motif + ' agent-art"><span class="mono">' + esc(DATA.logo) + '</span></span><div><b>' + esc(DATA.brand) + '</b><span>Your viewing agent</span></div></div>') +
          recsHtml(key) +
          '<div class="detail-gap" aria-hidden="true"></div>' +
          '<div class="detail-cta">' + (DATA.ordering && item.price > 0
            ? '<button class="btn accent block" type="button" data-add="' + key + '">' + DATA.addLabel + '</button>'
            : '<button class="btn accent block" type="button" data-go="book">Arrange viewing</button>') + '</div>' +
          '</div>'
      }
      return ''
    }

    // The retail product page: the photograph at its own shape, then the name,
    // price, words and options. No boxed card, no monogram over the product.
    function retailDetailHtml(item, key, price, chosen, picker, footer) {
      const shot = retailShotHtml(item, chosen)
      const section = DATA.menu[Number(String(key).split('-')[0])]
      const save = '<button class="save rl-save detail-save' + (state.saved[key] ? ' on' : '') + '" type="button" data-save="' + key + '" aria-label="Save">' + HEART + '</button>'
      const prices = variantsOf(item).map(function (variant) { return variant.price })
      const options = prices.length > 1 ? prices.length + ' options' : ''
      return '<figure class="rd-media' + (shot ? '' : ' is-empty') + '">' + missingMedia(item.name) + shot + save + '</figure>' +
        '<div class="rd-copy">' +
        '<span class="eyebrow">' + esc(section ? section.name : DATA.catalogWord) + '</span>' +
        '<h1>' + esc(item.name) + '</h1>' +
        '<div class="rd-line"><span class="rd-price price" data-unit-price>' + price + '</span>' + (options ? '<span class="tiny dim">' + esc(options) + '</span>' : '') + '</div>' +
        (item.desc ? '<p class="lede">' + esc(item.desc) + '</p>' : '') +
        (item.meta ? '<p class="rd-meta">' + esc(item.meta) + '</p>' : '') +
        picker +
        recsHtml(key) +
        '<div class="detail-gap" aria-hidden="true"></div>' +
        footer +
        '</div>'
    }

    function openDetail(key, record) {
      const item = itemFor(key)
      if (!item) return
      const host = document.querySelector('[data-detail-body]')
      const screen = document.querySelector('[data-screen="detail"]')
      const groups = structuredGroups(item)
      const section = DATA.menu[Number(String(key).split('-')[0])]
      const category = section ? section.name : ''
      // A grouped product may have only one real combination; the flat picker
      // hides that case, but its group values still describe the product.
      const chosen = groups.length ? chosenVariant(item, key) || variantsOf(item)[0] : chosenVariant(item, key)
      const picks = groups.length ? optionPicks(item, key, chosen) : null
      const structured = groups.length ? optionMatch(item, picks) : null
      const settled = groups.length ? structured : chosen
      const awaitingChoice = Boolean(groups.length && !structured)
      const unavailable = Boolean(settled && settled.available === false)
      const unitPrice = awaitingChoice ? 0 : settled ? settled.price : item.price
      const price = unitPrice > 0 ? money(unitPrice) : ''
      const picker = groups.length ? optionGroupsHtml(item, key, chosen) : variantHtml(item, key, chosen)
      const footer = DATA.ordering && (unitPrice > 0 || awaitingChoice)
        ? '<div class="detail-cta"><div class="detail-cta-line"><span class="tiny dim">' + esc(awaitingChoice ? 'Choose your options' : settled ? settled.name : item.meta || category || DATA.catalogWord) + '</span>' +
          '<b class="price" data-unit-price>' + price + '</b></div>' +
          (awaitingChoice
            ? '<button class="btn accent" type="button" disabled>Select options</button>'
            : '<button class="btn accent" type="button" data-add="' + key + '"' + (unavailable ? ' disabled' : '') + '>' + (unavailable ? 'Unavailable' : DATA.addLabel) + '</button>') + '</div>'
        : DATA.detailAction === 'quote' && DATA.quoting
          ? '<div class="detail-cta"><button class="btn accent block" type="button" data-go="quote">' + DATA.quoteTitle + '</button></div>'
          : DATA.detailAction === 'book' && DATA.booking
            ? '<div class="detail-cta"><button class="btn accent block" type="button" data-go="book">' + DATA.bookTitle + '</button></div>'
            : ''
      const shellDetail = DATA.retail
        ? retailDetailHtml(item, key, price, settled, picker, footer)
        : detailHtml(item, key, price, settled)
      const withPicker = shellDetail && picker && !DATA.retail
        ? shellDetail.replace('<div class="detail-gap"', picker + '<div class="detail-gap"')
        : shellDetail
      const photoItem = settled && settled.media ? Object.assign({}, item, { media: settled.media }) : item
      const fallbackImage = pickShot(key, 'photoWide', item.name, photoItem)
      host.innerHTML = withPicker ||
        '<div class="thumb m-' + DATA.motif + ' detail-band' + (fallbackImage ? '' : ' is-empty') + '">' +
        missingMedia(item.name) +
        fallbackImage +
        '<span class="cap"><span>' + esc(category || DATA.catalogWord) + '</span><span>' + price + '</span></span>' +
        '<button class="save on-art detail-save' + (state.saved[key] ? ' on' : '') + '" type="button" data-save="' + key + '" aria-label="Save">' + HEART + '</button></div>' +
        '<div class="detail-body">' +
        (item.tag ? '<span class="tag">' + esc(item.tag) + '</span>' : '') +
        '<h1 style="margin-top:10px">' + esc(item.name) + '</h1>' +
        (item.desc ? '<p class="lede">' + esc(item.desc) + '</p>' : '') +
        '<div class="detail-line"><span class="tiny dim">' + esc(item.meta || category || DATA.catalogWord) + '</span><span class="price">' + price + '</span></div>' +
        detailNote() +
        picker +
        '<div class="detail-gap" aria-hidden="true"></div>' +
        footer +
        '</div>'
      applyHearts()
      all('.screen').forEach((s) => s.classList.toggle('on', s === screen))
      all('.tab').forEach((tab) => tab.classList.remove('on'))
      screen.dataset.itemName = item.name
      if (backBtn) backBtn.hidden = false
      if (titleEl) titleEl.textContent = item.name
      detailOpen = true
      document.body.classList.add('is-detail')
      screen.scrollTop = 0
      if (record !== false) push({ screen: current, detail: key })
      buzz(8)
    }

    function back() {
      const entry = history.state
      if (entry && (entry.detail || entry.screen)) {
        history.back()
        return
      }
      go(current, false)
    }

    window.addEventListener('popstate', (event) => {
      const entry = event.state
      if (entry && entry.detail) openDetail(entry.detail, false)
      else if (entry && entry.screen) go(entry.screen, false)
    })
    try { history.replaceState({ screen: DATA.initial || 'home', detail: null }, '') } catch (error) {}

    function openSheet(name) {
      const sheet = document.querySelector('[data-sheet="' + name + '"]')
      if (!sheet) return
      all('.sheet').forEach((s) => s.classList.toggle('on', s === sheet))
      $('[data-scrim]').classList.add('on')
      buzz(8)
    }

    function closeSheets() {
      all('.sheet').forEach((s) => s.classList.remove('on'))
      $('[data-scrim]').classList.remove('on')
    }

    const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9z"/></svg>'
    const PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>'

    function savedKeys() {
      return Object.keys(state.saved).filter((key) => state.saved[key] && itemFor(key))
    }

    function applyHearts() {
      all('[data-save]').forEach((button) => {
        const on = Boolean(state.saved[button.dataset.save])
        button.classList.toggle('on', on)
        button.setAttribute('aria-pressed', on ? 'true' : 'false')
      })
      const count = savedKeys().length
      const badge = $('[data-saved-badge]')
      if (badge) {
        badge.hidden = count === 0
        badge.textContent = String(count)
      }
      const more = $('[data-saved-more]')
      if (more) more.textContent = String(count)
      const chip = $('[data-saved-count]')
      if (chip) chip.textContent = String(count)
    }

    function itemRow(item, key) {
      const prices = variantsOf(item).map(function (variant) { return variant.price })
      const differs = prices.length > 1 && new Set(prices).size > 1
      const price = differs ? 'From ' + money(Math.min.apply(null, prices)) : item.price > 0 ? money(item.price) : ''
      const note = [item.meta || item.desc || DATA.catalogWord, differs ? prices.length + ' options' : ''].filter(Boolean).join(' · ')
      const shot = pickShot(key, 'photoThumb', item.name, item)
      return '<div class="r-row" data-item="' + key + '" role="button" tabindex="0">' +
        '<span class="thumb r-art m-' + DATA.motif + (shot ? '' : ' is-empty') + '">' + missingMedia(item.name) + shot + '</span>' +
        '<div class="lead"><div class="name">' + esc(item.name) + '</div>' +
        '<div class="desc">' + esc(note) + '</div></div>' +
        '<div class="tail"><span class="price">' + price + '</span>' +
        '<button class="save' + (state.saved[key] ? ' on' : '') + '" type="button" data-save="' + key + '" aria-label="Save">' + HEART + '</button>' +
        (DATA.ordering && item.price > 0 ? '<button class="add" type="button" data-add="' + key + '" aria-label="Add">' + PLUS + '</button>' : '') +
        '</div></div>'
    }

    function updateCatalogCount() {
      const el = $('[data-catalog-count]')
      if (!el) return
      let shown = 0
      let total = 0
      // The total is the whole catalogue; what is shown is only what the chosen
      // shelf is displaying right now, so the two numbers never blur together.
      all('[data-screen="catalog"] .section-block').forEach(function (block) {
        const menu = DATA.menu[Number(block.dataset.section)]
        if (!menu) return
        total += menu.items.length
        if (block.hidden) return
        const host = block.querySelector('[data-items]')
        shown += host ? host.children.length : 0
      })
      el.textContent = 'Showing ' + shown + ' of ' + total + ' ' + (DATA.itemWords || 'items')
    }

    // The next page is the same server-rendered cards as the first, fetched as
    // a fragment: one renderer, no second copy of the markup in this script.
    async function loadMore(button) {
      const sectionIndex = Number(button.dataset.moreGo)
      const wrap = document.querySelector('[data-more="' + sectionIndex + '"]')
      const host = document.querySelector('[data-items="' + sectionIndex + '"]')
      const menu = DATA.menu[sectionIndex]
      if (!wrap || !host || !menu || button.disabled) return
      const shown = Number(wrap.dataset.shown || 0)
      const total = Number(wrap.dataset.total || menu.items.length)
      if (shown >= total) return wrap.remove()
      button.disabled = true
      try {
        const response = await fetch('/p/' + DATA.token + '/cards/' + sectionIndex + '?from=' + shown + '&count=' + DATA.catalogPage, { headers: { accept: 'text/html' } })
        if (!response.ok) throw new Error('page')
        const box = document.createElement('div')
        box.innerHTML = await response.text()
        const added = box.children.length
        while (box.firstElementChild) host.appendChild(box.firstElementChild)
        wrap.dataset.shown = String(shown + added)
        if (!added || shown + added >= total) wrap.remove()
        else {
          const label = wrap.querySelector('[data-more-count]')
          if (label) label.textContent = 'Showing ' + (shown + added) + ' of ' + total
          button.textContent = 'Show ' + Math.min(DATA.catalogPage, total - shown - added) + ' more'
        }
        updateCatalogCount()
        applyHearts()
        buzz(6)
      } catch (error) {
        toast('That page could not be loaded. Try again.')
      } finally {
        if (wrap.isConnected) button.disabled = false
      }
    }

    function storeKeys(vendor) {
      const keys = []
      DATA.menu.forEach((section, sectionIndex) => {
        section.items.forEach((item, itemIndex) => {
          if (item.vendor === vendor) keys.push(sectionIndex + '-' + itemIndex)
        })
      })
      return keys
    }

    // One seller's shelf: the same rows as search and saved, so a store browses
    // like the rest of the app and its items open the normal item page.
    function openStore(vendor) {
      const keys = storeKeys(vendor)
      const host = $('[data-store-body]')
      const screen = $('[data-screen="store"]')
      if (!keys.length || !host || !screen) return
      // The header carries the store; each row carries its own price and ETA.
      host.innerHTML =
        '<div class="store-head">' +
        '<span class="thumb m-' + DATA.motif + ' store-art"><span class="mono">' + esc(vendor.slice(0, 2).toUpperCase()) + '</span></span>' +
        '<div><span class="eyebrow">Store</span><h1 class="listing-title">' + esc(vendor) + '</h1>' +
        '<p class="tiny dim">' + keys.length + (keys.length === 1 ? ' item' : ' items') + '</p></div>' +
        '</div>' +
        keys.map((key) => itemRow(itemFor(key), key)).join('')
      screen.dataset.title = vendor
      go('store')
      applyHearts()
    }

    function renderSaved() {
      const host = $('[data-saved-list]')
      if (!host) return
      const keys = savedKeys()
      host.innerHTML = keys.length
        ? keys.map((key) => itemRow(itemFor(key), key)).join('')
        : '<div class="empty">Nothing saved yet.<br />Tap the heart on anything you like and it lives here — on this phone, offline.</div>'
    }

    function renderHistory() {
      const host = $('[data-history]')
      if (!host) return
      const entries = [
        ...state.orders.map((order) => ({ kind: 'Order', number: order.number, detail: order.status, date: order.createdAt, total: order.total })),
        ...state.bookings.map((booking) => ({ kind: 'Booking', number: booking.number, detail: booking.status + (booking.service ? ' · ' + booking.service : '') + (booking.date ? ' · ' + booking.date + (booking.checkOut ? ' → ' + booking.checkOut : booking.slot ? ' ' + booking.slot : '') : '') + (booking.nights ? ' · ' + booking.nights + (booking.nights === 1 ? ' night' : ' nights') : ''), date: booking.date, total: booking.total ?? null })),
      ]
      host.innerHTML = entries.length
        ? '<div class="info" style="display:grid;gap:8px">' + entries.slice(0, 6).map((entry) =>
            '<div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline"><span><b>' + esc(entry.kind) + ' #' + esc(entry.number) + '</b><br /><small class="tiny dim">' + esc(entry.detail) + '</small></span>' +
            (entry.total == null ? '' : '<b class="price">' + money(entry.total) + '</b>') + '</div>').join('') + '</div>'
        : '<p class="tiny dim">Orders and bookings you make on this device will be listed here. No account is needed to browse or order.</p>'
    }

    async function refreshHistory() {
      let changed = false
      for (const order of state.orders.slice(0, 5)) {
        try {
          const response = await fetch('/p/' + DATA.token + '/orders/' + encodeURIComponent(order.id))
          if (!response.ok) continue
          const payload = await response.json()
          if (payload.order && payload.order.status !== order.status) { order.status = payload.order.status; changed = true }
        } catch (error) {}
      }
      for (const booking of state.bookings.slice(0, 5)) {
        try {
          const response = await fetch('/p/' + DATA.token + '/bookings/' + encodeURIComponent(booking.id))
          if (!response.ok) continue
          const payload = await response.json()
          if (payload.booking && payload.booking.status !== booking.status) { booking.status = payload.booking.status; changed = true }
        } catch (error) {}
      }
      if (changed) { save(); renderHistory() }
    }

    function searchHits(query) {
      const term = query.trim().toLowerCase()
      if (!term) return []
      const hits = []
      DATA.menu.forEach((section, sectionIndex) => {
        section.items.forEach((item, itemIndex) => {
          const hay = [item.name, item.desc, item.tag, item.meta, section.name].join(' ').toLowerCase()
          if (hay.indexOf(term) >= 0) hits.push({ key: sectionIndex + '-' + itemIndex, item: item })
        })
      })
      return hits
    }

    function renderSearch() {
      const input = $('[data-search-input]')
      const results = $('[data-search-results]')
      const recent = $('[data-search-recent]')
      if (!input || !results || !recent) return
      const query = input.value
      if (!query.trim()) {
        // The group index below the field is the empty state; a second "search
        // by name" paragraph under it was only repeating the input placeholder.
        results.innerHTML = ''
        recent.innerHTML = state.recent
          .map((term) => '<button class="chip" type="button" data-recent="' + esc(term) + '">' + esc(term) + '</button>')
          .join('')
        return
      }
      recent.innerHTML = ''
      const hits = searchHits(query)
      results.innerHTML = hits.length
        ? '<div class="sect"><span class="label">Results</span><span class="count">' + hits.length + '</span></div>' +
          hits.map((hit) => itemRow(hit.item, hit.key)).join('')
        : '<div class="empty">Nothing matches “' + esc(query.trim()) + '”.<br />Try one word, or a broader term.</div>'
      applyHearts()
    }

    function rememberSearch(term) {
      const clean = term.trim().slice(0, 40)
      if (!clean) return
      state.recent = [clean].concat(state.recent.filter((entry) => entry !== clean)).slice(0, 5)
      save()
    }

    function setFilter(value, silent) {
      let next = String(value)
      const chips = all('[data-filters] .chip')
      if (next !== 'all' && !chips.some((chip) => chip.dataset.filter === next)) next = 'all'
      chips.forEach((chip) => {
        const on = chip.dataset.filter === next
        chip.classList.toggle('on', on)
        chip.setAttribute('aria-pressed', on ? 'true' : 'false')
      })
      all('[data-screen="catalog"] .section-block').forEach((block) => {
        block.hidden = next !== 'all' && block.dataset.section !== next
      })
      updateCatalogCount()
      // The retail shop keeps one list, so its filter is applied by rebuilding
      // that list rather than hiding a block the rebuild replaced.
      if (DATA.retail) renderRetail(true)
      if (!silent) buzz(6)
    }

    /* ------------------------------------------------------------ retail shop */
    // The Shop destination has its own search, sort and paging over the same
    // catalogue the server shipped. Everything is read from DATA.menu; nothing
    // is invented and no product is fetched from somewhere else.
    const retailHost = $('[data-shop-list]')
    const retailInitial = retailHost ? retailHost.innerHTML : ''
    const retailSearch = $('[data-shop-search]')
    const retailSortSelect = $('[data-shop-sort]')
    const retailEmpty = $('[data-shop-empty]')
    const retailStatus = $('[data-shop-status]')
    const retailCount = $('[data-shop-count]')
    const RETAIL_PAGE = 24
    let retailLimit = RETAIL_PAGE
    const pieces = (count) => count + ' ' + (count === 1 ? DATA.itemWord || 'item' : DATA.itemWords)

    function retailShotHtml(item, chosen) {
      const media = chosen && chosen.media ? chosen.media : item && item.media
      if (media && media.id) {
        const base = '/p/' + DATA.token + '/media/' + media.id
        return '<img class="rl-photo" src="' + base + '/640.webp" srcset="' + base + '/320.webp 320w, ' + base + '/640.webp 640w, ' + base + '/1280.webp 1280w" sizes="(max-width: 719px) 92vw, (max-width: 1099px) 44vw, 30vw" alt="' + esc((media.alt || item.name)) + '" loading="lazy" decoding="async" style="object-fit:' + (media.fit === 'contain' ? 'contain' : 'cover') + ';object-position:' + (media.focalX ?? 50) + '% ' + (media.focalY ?? 50) + '%" onerror="this.parentElement.classList.add(&quot;is-empty&quot;);this.remove()" />'
      }
      if (item && item.image && item.image.url) {
        return '<img class="rl-photo" src="' + esc(item.image.url) + '" alt="' + esc(item.image.alt || item.name) + '" loading="lazy" decoding="async" referrerpolicy="no-referrer" style="object-fit:' + (item.image.fit === 'contain' ? 'contain' : 'cover') + ';object-position:' + (item.image.positionX ?? 50) + '% ' + (item.image.positionY ?? 50) + '%" onerror="this.parentElement.classList.add(&quot;is-empty&quot;);this.remove()" />'
      }
      return ''
    }

    function retailPrice(item) {
      const prices = variantsOf(item).map(function (variant) { return variant.price })
      const differs = prices.length > 1 && new Set(prices).size > 1
      if (differs) return 'From ' + money(Math.min.apply(null, prices))
      return item.price > 0 ? money(item.price) : ''
    }

    // The browser's copy of the server's card. It exists because sorting and
    // searching have to redraw the list from the whole catalogue; the class
    // names and data hooks are the same, so every delegated action still works.
    function retailCardHtml(entry) {
      const item = entry.item
      const key = entry.key
      const section = DATA.menu[Number(key.split('-')[0])]
      const shot = retailShotHtml(item)
      const prices = variantsOf(item).map(function (variant) { return variant.price })
      const options = prices.length > 1 ? prices.length + ' options' : ''
      return '<article class="rl-card" data-item="' + key + '" role="button" tabindex="0" aria-label="' + esc(item.name) + '">' +
        '<figure class="rl-media' + (shot ? '' : ' is-empty') + '">' + missingMedia(item.name) + shot +
        '<button class="save rl-save' + (state.saved[key] ? ' on' : '') + '" type="button" data-save="' + key + '" aria-label="Save ' + esc(item.name) + '" aria-pressed="' + (state.saved[key] ? 'true' : 'false') + '">' + HEART + '</button></figure>' +
        '<div class="rl-copy"><span class="rl-kicker">' + esc(section ? section.name : DATA.catalogWord) + '</span>' +
        '<div class="rl-title"><h3>' + esc(item.name) + '</h3><span class="rl-price">' + retailPrice(item) + '</span></div>' +
        (item.desc ? '<p class="rl-desc">' + esc(item.desc) + '</p>' : '') +
        (options ? '<span class="rl-option">' + esc(options) + '</span>' : '') +
        '</div></article>'
    }

    function retailEntries() {
      const query = retailSearch ? retailSearch.value.trim().toLowerCase() : ''
      const chip = document.querySelector('[data-filters] .chip.on')
      const filter = chip ? chip.dataset.filter : 'all'
      const out = []
      DATA.menu.forEach(function (section, sectionIndex) {
        if (filter !== 'all' && String(sectionIndex) !== filter) return
        section.items.forEach(function (item, itemIndex) {
          if (query) {
            const hay = [item.name, item.desc, item.tag, item.meta, section.name].join(' ').toLowerCase()
            if (hay.indexOf(query) < 0) return
          }
          out.push({ item: item, key: sectionIndex + '-' + itemIndex })
        })
      })
      return out
    }

    function renderRetail(reset) {
      if (!DATA.retail || !retailHost) return
      if (reset) retailLimit = RETAIL_PAGE
      const query = retailSearch ? retailSearch.value.trim() : ''
      const sort = retailSortSelect ? retailSortSelect.value : 'featured'
      const chip = document.querySelector('[data-filters] .chip.on')
      const filter = chip ? chip.dataset.filter : 'all'
      const total = DATA.menu.reduce(function (sum, section) { return sum + section.items.length }, 0)
      const clearButton = document.querySelector('.shop-clear')
      if (clearButton) clearButton.hidden = !query
      if (retailStatus) retailStatus.textContent = ''
      if (!query && filter === 'all' && sort === 'featured') {
        retailHost.innerHTML = retailInitial
        retailHost.hidden = false
        if (retailEmpty) retailEmpty.hidden = true
        if (retailCount) retailCount.textContent = pieces(total)
        applyHearts()
        return
      }
      const entries = retailEntries()
      if (sort === 'price-asc' || sort === 'price-desc') {
        entries.sort(function (a, b) {
          return sort === 'price-asc' ? a.item.price - b.item.price : b.item.price - a.item.price
        })
      } else if (sort === 'name') {
        entries.sort(function (a, b) { return a.item.name.localeCompare(b.item.name) })
      }
      const slice = entries.slice(0, retailLimit)
      retailHost.innerHTML = slice.length
        ? '<div class="rl-grid">' + slice.map(retailCardHtml).join('') + '</div>' +
          (entries.length > slice.length
            ? '<div class="shop-more"><button class="btn ghost small" type="button" data-retail-more>Show ' + Math.min(RETAIL_PAGE, entries.length - slice.length) + ' more</button><span class="tiny dim">' + slice.length + ' of ' + entries.length + '</span></div>'
            : '')
        : ''
      retailHost.hidden = slice.length === 0
      if (retailEmpty) retailEmpty.hidden = slice.length > 0
      if (retailCount) retailCount.textContent = pieces(entries.length)
      if (retailStatus) {
        if (query) {
          retailStatus.textContent = entries.length
            ? entries.length + ' result' + (entries.length === 1 ? '' : 's') + ' for \u201c' + query + '\u201d'
            : 'No results for \u201c' + query + '\u201d'
        } else if (filter !== 'all') {
          const section = DATA.menu[Number(filter)]
          retailStatus.textContent = section ? section.name + ' \u00b7 ' + pieces(entries.length) : ''
        }
      }
      applyHearts()
    }

    if (retailSearch) retailSearch.addEventListener('input', function () { renderRetail(true) })
    if (retailSortSelect) retailSortSelect.addEventListener('change', function () { renderRetail(true) })
    document.addEventListener('click', function (event) {
      const clear = event.target.closest('[data-shop-clear]')
      if (clear) {
        if (retailSearch) retailSearch.value = ''
        renderRetail(true)
        if (retailSearch) retailSearch.focus()
        return
      }
      const more = event.target.closest('[data-retail-more]')
      if (more) {
        retailLimit += RETAIL_PAGE
        renderRetail()
      }
    })

    function renderStamps() {
      const host = $('[data-stamps]')
      if (!host) return
      host.innerHTML = ''
      for (let index = 0; index < DATA.goal; index++) {
        const stamp = document.createElement('div')
        stamp.className = 'stamp' + (index < state.stamps ? ' on' : '')
        stamp.textContent = index < state.stamps ? '✓' : String(index + 1)
        host.appendChild(stamp)
      }
    }

    function cartTotals() {
      reconcileCart()
      const lines = Object.entries(state.cart).filter((entry) => entry[1] > 0)
      const subtotal = lines.reduce((total, entry) => total + cartPrice(entry[0]) * entry[1], 0)
      const fee = state.orderType === 'Delivery' && subtotal > 0 ? DATA.deliveryFee : 0
      return { lines, subtotal, fee, total: subtotal + fee }
    }

    function renderCart() {
      const host = $('[data-cart]')
      if (!host) return
      const totals = cartTotals()
      const count = totals.lines.reduce((sum, entry) => sum + entry[1], 0)
      const badge = $('[data-badge]')
      if (badge) {
        badge.hidden = count === 0
        badge.textContent = String(count)
      }
      const foot = $('[data-cart-foot]')
      const done = $('[data-cart-done]')
      if (done) done.hidden = true
      host.hidden = false
      if (count === 0) {
        host.innerHTML = '<div class="empty">Nothing here yet.<br />Add something from the ' + DATA.catalogWord + '.</div>'
        if (foot) foot.hidden = true
        return
      }
      if (foot) foot.hidden = false
      host.innerHTML = totals.lines
        .map((entry) => {
          const parts = cartParts(entry[0])
          const item = parts.item
          if (!item) return ''
          const named = parts.variant && variantsOf(item).length > 1 ? parts.variant : null
          return '<div class="cart-line"><div><div class="name">' + esc(item.name) + (named ? ' — ' + esc(named.name) : '') + '</div><div class="price">' + money(cartPrice(entry[0]) * entry[1]) + '</div></div>' +
            '<div class="qty"><button type="button" data-inc="' + entry[0] + '" data-delta="-1" aria-label="Remove one">−</button><b>' + entry[1] + '</b>' +
            '<button type="button" data-inc="' + entry[0] + '" data-delta="1" aria-label="Add one">+</button></div></div>'
        })
        .join('')
      const host2 = $('[data-totals]')
      if (host2) {
        host2.innerHTML =
          '<div><span>Subtotal</span><span>' + money(totals.subtotal) + '</span></div>' +
          (totals.fee ? '<div><span>Delivery</span><span>' + money(totals.fee) + '</span></div>' : '') +
          '<div class="grand"><span>Total</span><span>' + money(totals.total) + '</span></div>'
      }
    }

    function addItem(key) {
      const item = itemFor(key)
      const chosen = item ? chosenVariant(item, key) : null
      const identity = chosen || (item ? onlyVariant(item) : null)
      // The option is part of the line's identity, so two sizes of one shirt are
      // two cart lines and each is ordered at its own price. A product with one
      // option still records that option, so the order names the Shopify
      // variant rather than guessing later.
      const cartKey = identity ? key + '::' + encodeURIComponent(variantRef(identity)) : key
      state.cart[cartKey] = (state.cart[cartKey] || 0) + 1
      // A changed bag is a different order; a retry must not be mistaken for the
      // attempt that was already sent.
      delete state.pendingOrder
      save()
      renderCart()
      buzz(12)
      const named = chosen && variantsOf(item).length > 1 ? chosen : null
      toast((item ? item.name : 'Added') + (named ? ' — ' + named.name : '') + ' added')
    }

    async function placeOrder() {
      const totals = cartTotals()
      if (!totals.lines.length) return
      const name = ($('[data-checkout-name]')?.value || '').trim()
      const contact = ($('[data-checkout-contact]')?.value || '').trim()
      if (name.length < 2) return toast('Add your name so the business knows who ordered')
      if (contact.length < 5) return toast('Add a phone number or email address')
      const button = $('[data-place]')
      if (button) button.disabled = true
      try {
        // One attempt, one order. The reference survives a failed send so that
        // asking again returns the order already made instead of making two.
        const attempt = state.pendingOrder && state.pendingOrder.ref
          ? state.pendingOrder.ref
          : 'ord-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
        state.pendingOrder = { ref: attempt, at: Date.now() }
        save()
        const payload = await postJson('/p/' + DATA.token + '/orders', {
          customer: Object.assign({ name }, contactFields(contact)),
          fulfilment: state.orderType,
          requestId: attempt,
          items: totals.lines.map(([cartKey, qty]) => {
            const parts = cartParts(cartKey)
            return Object.assign({ key: parts.key, qty: qty }, parts.variant ? { variant: variantRef(parts.variant) } : {})
          }),
        })
        const order = payload.order
        state.orders = [{ id: order.id, number: order.number, status: order.status, total: order.total, createdAt: order.createdAt }, ...state.orders].slice(0, 12)
        state.customerName = name
        state.customerContact = contact
        if (DATA.loyalty) state.stamps = Math.min(DATA.goal, state.stamps + 1)
        state.cart = {}
        delete state.pendingOrder
        save()
        renderCart()
        renderStamps()
        renderHistory()
        $('[data-cart]').hidden = true
        $('[data-cart-foot]').hidden = true
        const done = $('[data-cart-done]')
        done.hidden = false
        done.innerHTML =
          '<div class="done"><div class="tick">✓</div><h2>Order #' + esc(order.number) + '</h2>' +
          '<p>' + esc(state.orderType) + ' · ' + money(order.total) + '<br />Sent to ' + esc(DATA.brand) + '. They will confirm when it is ready.</p>' +
          (DATA.payments && DATA.payments.orders
            ? '<button class="btn accent block" type="button" data-pay="order" data-ref="' + esc(order.id) + '" style="margin-top:14px">Pay ' + money(order.total) + ' online</button>'
            : '') +
          '<button class="btn block" type="button" data-close-sheet style="margin-top:16px">Done</button></div>'
        buzz([10, 40, 16])
      } catch (error) {
        toast(error && error.message ? error.message : 'The order could not be sent.')
        if (button) button.disabled = false
      }
    }

    async function startPayment(kind, refId, button) {
      if (!refId) return
      if (button) button.disabled = true
      try {
        const payload = await postJson('/p/' + DATA.token + '/payments/start', { kind, refId })
        if (!payload.payment || !payload.payment.payUrl) throw new Error('The gateway did not return a checkout link.')
        location.href = payload.payment.payUrl
      } catch (error) {
        toast(error && error.message ? error.message : 'Online payment is not available right now.')
        if (button) button.disabled = false
      }
    }

    // A hotel stay is two dates, not a slot. The screen shows the nights and
    // the room total from the saved rate; the server checks both again.
    function stayDays(from, to) {
      const parse = (value) => {
        const parts = String(value).split('-').map(Number)
        return parts.length === 3 ? Date.UTC(parts[0], parts[1] - 1, parts[2]) : null
      }
      const a = parse(from)
      const b = parse(to)
      return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86400000) : 0
    }
    function isoDay(offset) {
      const date = new Date()
      date.setDate(date.getDate() + offset)
      return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0')
    }
    function stayRate() {
      const select = $('[data-book-service]')
      const item = (DATA.menu || [])
        .reduce(function (all, section) { return all.concat(section.items || []) }, [])
        .find(function (entry) { return entry.name === (select ? select.value : '') })
      return item && item.price > 0 && /night/i.test(item.meta || '') ? item.price : 0
    }
    function updateStay() {
      const inEl = $('[data-checkin]')
      const outEl = $('[data-checkout]')
      const summary = $('[data-stay-summary]')
      if (!inEl || !outEl) return
      const nights = stayDays(inEl.value, outEl.value)
      if (inEl.value) {
        const next = new Date(inEl.value + 'T12:00:00')
        next.setDate(next.getDate() + 1)
        outEl.min = next.getFullYear() + '-' + String(next.getMonth() + 1).padStart(2, '0') + '-' + String(next.getDate()).padStart(2, '0')
      }
      if (summary) {
        const rate = stayRate()
        const room = ($('[data-book-service]')?.value || '')
        summary.textContent = nights > 0
          ? (room ? room + ' \u00b7 ' : '') + nights + (nights === 1 ? ' night' : ' nights') +
            (rate ? ' \u00b7 ' + money(rate) + ' a night \u00b7 ' + money(rate * nights) + ' total' : '')
          : 'Check-out must be after check-in.'
      }
    }
    function buildStay() {
      const inEl = $('[data-checkin]')
      const outEl = $('[data-checkout]')
      if (!inEl || !outEl) return
      if (!inEl.value) inEl.value = isoDay(1)
      if (!outEl.value) outEl.value = isoDay(3)
      inEl.min = isoDay(0)
      inEl.addEventListener('change', updateStay)
      outEl.addEventListener('change', updateStay)
      const service = $('[data-book-service]')
      if (service) service.addEventListener('change', updateStay)
      updateStay()
    }

    function buildBooking() {
      buildStay()
      const days = $('[data-days]')
      if (!days) return
      const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      days.innerHTML = ''
      for (let offset = 0; offset < 5; offset++) {
        const date = new Date()
        date.setDate(date.getDate() + offset)
        const chip = document.createElement('button')
        chip.type = 'button'
        chip.className = 'chip' + (state.day === offset ? ' on' : '')
        chip.textContent = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : names[date.getDay()] + ' ' + date.getDate()
        chip.addEventListener('click', () => {
          state.day = offset
          save()
          all('[data-days] .chip').forEach((el, index) => el.classList.toggle('on', index === offset))
          buzz(6)
        })
        days.appendChild(chip)
      }
      const slotHost = $('[data-slots]')
      if (!slotHost) return
      slotHost.innerHTML = ''
      DATA.slots.forEach((slot, index) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'slot' + (index === 1 ? ' on' : '')
        button.textContent = slot
        if (index === 1) state.slot = slot
        button.addEventListener('click', () => {
          state.slot = slot
          save()
          all('[data-slots] .slot').forEach((el, i) => el.classList.toggle('on', i === index))
          buzz(6)
        })
        slotHost.appendChild(button)
      })
    }

    function note(html) {
      document.querySelector('[data-note-body]').innerHTML = html
      openSheet('note')
    }

    async function submitEnquiry() {
      const name = $('[data-quote-name]').value.trim()
      const contact = $('[data-quote-contact]').value.trim()
      const message = $('[data-quote-message]').value.trim()
      if (name.length < 2) return toast('Add your name')
      if (contact.length < 5) return toast('Add a phone number or email address')
      if (message.length < 5) return toast('Add a sentence about what you need')
      const button = $('[data-quote-send]')
      if (button) button.disabled = true
      try {
        await postJson('/p/' + DATA.token + '/enquiries', { name, contact, message })
        note('<div class="done"><div class="tick">✓</div><h2>Request sent</h2><p>Thanks ' + esc(name) +
          ' — the business will reply on ' + esc(contact) + '. Your request is now in their dashboard.</p>' +
          '<button class="btn block" type="button" data-close-sheet style="margin-top:16px">Done</button></div>')
        $('[data-quote-message]').value = ''
      } catch (error) {
        toast(error && error.message ? error.message : 'The request could not be sent.')
      } finally {
        if (button) button.disabled = false
      }
    }

    async function book() {
      const stayIn = $('[data-checkin]')
      const stayOut = $('[data-checkout]')
      const chip = $('[data-days] .chip.on')
      const dayLabel = chip ? chip.textContent : 'Today'
      let iso = ''
      if (stayIn) {
        iso = stayIn.value
        if (!iso) return toast('Choose a check-in day')
        if (!stayOut || !stayOut.value) return toast('Choose a check-out day')
        if (stayDays(iso, stayOut.value) < 1) return toast('Check-out must be after check-in')
      } else {
        const date = new Date()
        date.setDate(date.getDate() + Number(state.day || 0))
        iso = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0')
      }
      const name = ($('[data-book-name]')?.value || '').trim()
      const contact = ($('[data-book-contact]')?.value || '').trim()
      if (name.length < 2) return toast('Add your name so the business can confirm')
      if (contact.length < 5) return toast('Add a phone number or email address')
      const button = $('[data-book]')
      if (button) button.disabled = true
      try {
        const payload = await postJson('/p/' + DATA.token + '/bookings', Object.assign({
          customer: Object.assign({ name }, contactFields(contact)),
          date: iso,
          slot: stayIn ? '' : state.slot || '',
          party: state.party,
          service: ($('[data-book-service]')?.value || ''),
          staff: ($('[data-book-staff]')?.value || ''),
        }, stayOut && stayOut.value ? { checkOut: stayOut.value } : {}))
        const booking = payload.booking
        state.bookings = [{ id: booking.id, number: booking.number, status: booking.status, date: booking.date, checkOut: booking.checkOut, nights: booking.nights, nightlyRate: booking.nightlyRate, total: booking.total, party: booking.party, service: booking.service, slot: booking.slot }, ...state.bookings].slice(0, 12)
        state.customerName = name
        state.customerContact = contact
        save()
        renderHistory()
        const service = ($('[data-book-service]')?.value || '')
        const nights = Number(booking.nights) || 0
        const when = booking.checkOut
          ? esc(booking.date) + ' → ' + esc(booking.checkOut) + ' · ' + nights + (nights === 1 ? ' night' : ' nights')
          : esc(dayLabel) + (state.slot ? ' at ' + esc(state.slot) : '')
        const stay = booking.nightlyRate
          ? '<br /><b>' + esc(booking.service || service) + '</b> · ' + money(booking.nightlyRate) + ' a night × ' + nights + ' = ' + money(booking.total)
          : booking.total ? ' · ' + money(booking.total) : ''
        note('<div class="done"><div class="tick">✓</div><h2>Request sent</h2>' +
          '<p>' + when + ' · ' + partyUnit(booking.party || state.party) + stay + '<br />This is a request, not a confirmed reservation. The business will confirm it. You can check its status in More.</p>' +
          (DATA.payments && DATA.payments.bookings && service
            ? '<button class="btn accent block" type="button" data-pay="booking" data-ref="' + esc(booking.id) + '" style="margin-top:14px">Pay a deposit online</button>'
            : '') +
          '<button class="btn block" type="button" data-close-sheet style="margin-top:16px">Done</button></div>')
        buzz([10, 40, 16])
      } catch (error) {
        toast(error && error.message ? error.message : 'The booking could not be sent.')
        if (button) button.disabled = false
      }
    }

    // Cards are divs with role=button so the art layouts stay intact. Give
    // them the keyboard behaviour a native button would have.
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      const target = event.target.closest('[role="button"][tabindex]')
      if (!target || target.matches('button, a, input, select, textarea')) return
      event.preventDefault()
      target.click()
    })

    document.addEventListener('click', (event) => {
      const target = event.target.closest(
        '[data-add],[data-inc],[data-pay],[data-go],[data-jump],[data-place],[data-type],[data-party],[data-book],[data-reserve],[data-quote-send],[data-send-review],[data-cart-open],[data-nav-open],[data-save],[data-search-open],[data-saved-open],[data-search-clear],[data-filter],[data-property-filter],[data-recent],[data-install],[data-close-sheet],[data-back],[data-store],[data-variant],[data-option-value],[data-more-go],.stars span,[data-item]',
      )
      if (!target) return

      if (target.dataset.save) return toggleSave(target.dataset.save)
      if (target.dataset.searchOpen !== undefined) {
        go('search')
        const field = $('[data-search-input]')
        // Focus inside the tap itself, otherwise iOS refuses to open the keyboard.
        if (field) field.focus({ preventScroll: true })
        return
      }
      if (target.dataset.savedOpen !== undefined) return go('saved')
      if (target.dataset.searchClear !== undefined) {
        const field = $('[data-search-input]')
        if (field) {
          field.value = ''
          renderSearch()
          field.focus()
        }
        return
      }
      if (target.dataset.propertyFilter !== undefined) {
        setFilter(target.dataset.propertyFilter, true)
        return go('catalog')
      }
      if (target.dataset.filter !== undefined) return setFilter(target.dataset.filter)
      if (target.dataset.recent !== undefined) {
        const field = $('[data-search-input]')
        if (field) {
          field.value = target.dataset.recent
          renderSearch()
        }
        return
      }
      if (target.dataset.moreGo !== undefined) return loadMore(target)
      if (target.dataset.optionValue !== undefined) {
        const key = target.dataset.optionKey
        const item = itemFor(key)
        const group = target.dataset.optionGroup
        const value = target.dataset.optionValue
        const current = state.optionPicks[key] || {}
        const candidates = variantsOf(item).filter(function (variant) {
          return variant.values && variant.values[group] === value && variant.available !== false
        })
        // Changing one choice may only settle on a real combination. Keep the
        // other choices when one exists; with no match, leave the selection
        // incomplete and let the customer choose again rather than silently
        // switching a different group to a combination they did not ask for.
        const others = Object.keys(current).filter(function (name) { return name !== group })
        const match = candidates.find(function (variant) {
          return others.every(function (name) { return variant.values[name] === current[name] })
        }) || (others.length ? undefined : candidates[0])
        if (match) {
          state.optionPicks[key] = Object.assign({}, match.values)
          state.pick[key] = variantRef(match)
        } else {
          state.optionPicks[key] = Object.assign({}, current, { [group]: value })
          delete state.pick[key]
        }
        save()
        return openDetail(key, false)
      }
      if (target.dataset.variant) {
        state.pick[target.dataset.variantKey] = target.dataset.variant
        delete state.optionPicks[target.dataset.variantKey]
        save()
        return openDetail(target.dataset.variantKey, false)
      }
      if (target.dataset.add) return addItem(target.dataset.add)
      if (target.dataset.inc) {
        const key = target.dataset.inc
        state.cart[key] = Math.max(0, (state.cart[key] || 0) + Number(target.dataset.delta))
        if (!state.cart[key]) delete state.cart[key]
        delete state.pendingOrder
        save()
        return renderCart()
      }
      if (target.dataset.cartOpen !== undefined) {
        renderCart()
        return openSheet('cart')
      }
      if (target.dataset.closeSheet !== undefined) return closeSheets()
      if (target.dataset.navOpen !== undefined) return openSheet('nav')
      if (target.dataset.back !== undefined) return back()
      if (target.dataset.go) {
        if (target.dataset.go === 'cart') {
          renderCart()
          return openSheet('cart')
        }
        // Remember which service or room opened this booking, so the form does
        // not silently book the first catalogue entry instead.
        if (target.dataset.go === 'book' && detailOpen) {
          const openName = document.querySelector('[data-screen="detail"]')?.dataset.itemName
          if (openName) {
            state.bookService = openName
            save()
          }
        }
        if (document.querySelector('[data-sheet].on')) closeSheets()
        go(target.dataset.go)
        // The Shop tab is the catalogue itself, always whole. Only a category
        // jump from Home arrives pre-filtered.
        if (target.dataset.go === 'catalog') setFilter('all', true)
        return
      }
      if (target.dataset.store) return openStore(target.dataset.store)
      if (target.dataset.item) return openDetail(target.dataset.item)
      if (target.dataset.jump !== undefined) {
        go('catalog')
        setFilter(target.dataset.jump)
        return
      }
      if (target.dataset.place !== undefined) return placeOrder()
      if (target.dataset.pay) return startPayment(target.dataset.pay, target.dataset.ref, target)
      if (target.dataset.type) {
        state.orderType = target.dataset.type
        save()
        all('[data-type]').forEach((button) => button.classList.toggle('on', button === target))
        return renderCart()
      }
      if (target.dataset.party) {
        state.party = Math.max(1, Math.min(12, state.party + Number(target.dataset.party)))
        save()
        $('[data-party-value]').textContent = String(state.party)
        return buzz(6)
      }
      if (target.dataset.book !== undefined) return book()
      if (target.dataset.reserve !== undefined) {
        target.classList.add('on')
        target.textContent = 'Reserved ✓'
        target.disabled = true
        if (DATA.loyalty) {
          state.stamps = Math.min(DATA.goal, state.stamps + 1)
          save()
          renderStamps()
        }
        return toast('Spot reserved')
      }
      if (target.dataset.quoteSend !== undefined) return submitEnquiry()
      if (target.matches('.stars span')) {
        const stars = all('.stars span')
        const index = stars.indexOf(target)
        state.stars = index + 1
        save()
        stars.forEach((star, i) => star.classList.toggle('on', i <= index))
        return buzz(6)
      }
      if (target.dataset.sendReview !== undefined) {
        return toast(state.stars ? 'Thanks — feedback sent' : 'Tap a star first')
      }
    })

    $('[data-scrim]').addEventListener('click', closeSheets)

    function toggleSave(key) {
      if (state.saved[key]) delete state.saved[key]
      else state.saved[key] = true
      save()
      applyHearts()
      renderSaved()
      renderSearch()
      buzz(10)
      toast(state.saved[key] ? 'Saved' : 'Removed from saved')
    }

    // The header gets out of the way when the content is being read.
    let lastScroll = 0
    all('.screen').forEach((screen) => {
      screen.addEventListener('scroll', () => {
        const y = screen.scrollTop
        if (appbar) appbar.classList.toggle('is-hidden', y > 64 && y > lastScroll)
        lastScroll = y
      }, { passive: true })
    })

    // Offline is a state, not an error: say it once, at the top.
    function netState() {
      const banner = $('[data-offline]')
      if (banner) banner.hidden = navigator.onLine
    }
    window.addEventListener('online', netState)
    window.addEventListener('offline', netState)
    netState()

    // Sheets can be dragged down, the way people already try to close them.
    all('.sheet').forEach((sheet) => {
      const handle = sheet.querySelector('.handle')
      if (!handle) return
      let startY = 0
      let delta = 0
      let dragging = false
      handle.addEventListener('pointerdown', (event) => {
        dragging = true
        startY = event.clientY
        delta = 0
        sheet.style.transition = 'none'
        try { handle.setPointerCapture(event.pointerId) } catch (error) {}
      })
      handle.addEventListener('pointermove', (event) => {
        if (!dragging) return
        delta = Math.max(0, event.clientY - startY)
        sheet.style.transform = 'translateY(' + delta + 'px)'
      })
      const end = () => {
        if (!dragging) return
        dragging = false
        sheet.style.transition = ''
        sheet.style.transform = ''
        if (delta > 90) closeSheets()
      }
      handle.addEventListener('pointerup', end)
      handle.addEventListener('pointercancel', end)
    })

    // Swipe from the left edge to go back, like every native stack.
    const detailScreen = document.querySelector('[data-screen="detail"]')
    if (detailScreen) {
      let startX = 0
      let startY = 0
      detailScreen.addEventListener('touchstart', (event) => {
        const touch = event.touches[0]
        startX = touch.clientX
        startY = touch.clientY
      }, { passive: true })
      detailScreen.addEventListener('touchend', (event) => {
        const touch = event.changedTouches[0]
        if (startX < 44 && touch.clientX - startX > 70 && Math.abs(touch.clientY - startY) < 70) back()
      }, { passive: true })
    }

    // Install, offered inside the app rather than only in a browser menu.
    let installer = null
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault()
      installer = event
      const wrap = $('[data-install-wrap]')
      if (wrap) wrap.hidden = false
    })
    const installButton = $('[data-install]')
    if (installButton) {
      installButton.addEventListener('click', () => {
        const wrap = $('[data-install-wrap]')
        if (wrap) wrap.hidden = true
        if (installer) {
          installer.prompt()
          installer = null
        } else {
          toast('Use your browser menu → Add to Home Screen')
        }
      })
    }

    const searchInput = $('[data-search-input]')
    if (searchInput) {
      searchInput.addEventListener('input', renderSearch)
      searchInput.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return
        rememberSearch(searchInput.value)
        event.preventDefault()
        searchInput.blur()
      })
    }

    const checkoutName = $('[data-checkout-name]')
    const checkoutContact = $('[data-checkout-contact]')
    if (checkoutName) checkoutName.value = state.customerName || ''
    if (checkoutContact) checkoutContact.value = state.customerContact || ''
    const bookingName = $('[data-book-name]')
    const bookingContact = $('[data-book-contact]')
    if (bookingName) bookingName.value = state.customerName || ''
    if (bookingContact) bookingContact.value = state.customerContact || ''
    applyHearts()
    setFilter('all', true)
    renderSaved()
    renderHistory()
    refreshHistory()
    renderSearch()
    renderCart()
    renderStamps()
    buildBooking()
    all('.stars span').forEach((star, index) => star.classList.toggle('on', index < state.stars))
    if ($('[data-party-value]')) $('[data-party-value]').textContent = String(state.party)

    const splash = $('[data-splash]')
    if (splash) setTimeout(() => splash.classList.add('gone'), 520)

    if (${live} && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {})
    }
  })()
  </script><script>window.__PLATTR_ELEMENTS__=${JSON.stringify({ token: options.token, elements: doc?.elements ?? {}, editor: Boolean(options.editor), icons: Object.fromEntries(NAV_ICON_NAMES.map((name) => [name, icon(name)])) }).replace(/</g, '\\u003c')};</script>${ELEMENT_LAYER}${options.editor ? EDITOR_BRIDGE : ''}
</body>
</html>`
}

export function renderManifest(spec: AppSpec, options: { startUrl?: string; scope?: string } = {}): string {
  const theme = themeFor(verticalFor(spec.vertical).id)
  return JSON.stringify(
    {
      name: `${spec.name} — ${spec.kind}`,
      short_name: spec.name.slice(0, 12),
      description: spec.tagline,
      start_url: options.startUrl ?? './',
      scope: options.scope ?? './',
      display: 'standalone',
      orientation: 'portrait',
      background_color: theme.bg,
      theme_color: theme.bg,
      icons: [
        { src: './icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        { src: './icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
      ],
      lang: 'en',
      dir: 'ltr',
    },
    null,
    2,
  )
}

export function renderIcon(spec: AppSpec): string {
  const theme = themeFor(verticalFor(spec.vertical).id)
  const accent = legibleAccent(spec.accent, theme.dark)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="${esc(spec.name)}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${accent}" />
      <stop offset="1" stop-color="${mixHex(accent, '#000000', 0.28)}" />
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="${theme.radius === 0 ? 0 : 104}" fill="url(#g)" />
  <circle cx="392" cy="120" r="86" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="2" />
  <circle cx="392" cy="120" r="46" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="2" />
  <text x="256" y="266" text-anchor="middle" dominant-baseline="central"
    font-family="Georgia, 'Times New Roman', serif" font-size="${spec.logo.length > 2 ? 168 : 204}"
    font-weight="600" letter-spacing="-8" fill="${inkFor(accent)}">${esc(spec.logo)}</text>
</svg>`
}

export function renderServiceWorker(version: number, options: { startUrl?: string } = {}): string {
  const startUrl = options.startUrl ?? './'
  return `/* Generated by Plattr — version ${version} */
const CACHE = 'plattr-v${version}'
const SHELL = [${JSON.stringify(startUrl)}, './manifest.webmanifest', './icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

// Navigations are network-first so a rebuild is never masked by a cached
// document. Order and booking status are live reads, not assets: a cached
// "received" must not hide a later "ready" after the business updates it.
// Everything else (icons, assets) is cache-first for offline use.
self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  // Owner APIs are live reads and writes. A cached media list or document is
  // stale by definition and made the editor show the state from before a save.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request))
    return
  }
  if (/\\/(?:orders|bookings)\\/[^/]+$/.test(url.pathname)) {
    event.respondWith(fetch(request))
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy))
          return response
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match(SHELL[0]))),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit
      return fetch(request).then((response) => {
        const copy = response.clone()
        caches.open(CACHE).then((cache) => cache.put(request, copy))
        return response
      })
    }),
  )
})
`
}
