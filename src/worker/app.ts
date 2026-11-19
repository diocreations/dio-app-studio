import { appCss } from './appCss'
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
import { CURRENCY_SYMBOLS, inkFor, moneyIn } from './pricing'
import type { AppSpec, FeatureId, MenuItem, Vocab } from './types'
import { ctaFor, verticalFor, type Vertical } from './verticals'
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

function priceOf(item: MenuItem, currency?: string): string {
  return item.price > 0 ? moneyIn(item.price, currency) : 'On request'
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
  return `<img class="photo" src="${esc(url)}"${srcset} alt="${esc(alt)}" loading="lazy" decoding="async" onerror="this.remove()" />`
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
  return `<img class="photo" src="${esc(base)}/640.webp" srcset="${esc(base)}/320.webp 320w, ${esc(base)}/640.webp 640w, ${esc(base)}/1280.webp 1280w" sizes="${kind === 'wide' ? '100vw' : '(max-width: 620px) 38vw, 200px'}" alt="${esc(media.alt || alt || '')}" loading="lazy" decoding="async" style="object-fit:${media.fit === 'contain' ? 'contain' : 'cover'};object-position:${media.focalX ?? 50}% ${media.focalY ?? 50}%" onerror="this.remove()" />`
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
      <p>${esc(copy.tagline)}</p>
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
      <p>${esc(copy.tagline)}</p>
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
      <h2>${esc((ctx.spec.hours || '').split('·')[0].trim() || 'Open today')}</h2>
      ${rows
        .map(
          (row) =>
            `<div class="sess-row"><b>${esc(row.name)}</b><span>${esc(row.when)}</span><em>${esc(row.coach)}</em></div>`,
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
            `<div class="session"><div><b>${esc(session.name)}</b><span>${esc(session.when)} · ${esc(session.coach)}</span></div>
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
    </div>
    <div class="right">
      <div class="price">${priceOf(item, ctx.spec.currency)}</div>
      <div class="row-tools">
        ${saveButton(key, item.name)}
        ${ctx.ordering && item.price > 0 ? `<button class="add" type="button" data-add="${key}" aria-label="Add ${esc(item.name)}">${icon('plus')}</button>` : ''}
      </div>
    </div>
  </div>`
}

function itemRowCompact(ctx: Ctx, item: MenuItem, key: string): string {
  return `<div class="r-row" data-item="${key}" role="button" tabindex="0">
    ${artThumb(ctx, item.name.slice(0, 1).toUpperCase(), key, 'r-art', 'thumb', item.name, item.media)}
    <div class="lead">
      <div class="name">${esc(item.name)}${item.tag ? ` <span class="tag">${esc(item.tag)}</span>` : ''}</div>
      ${item.desc ? `<div class="desc">${esc(item.desc)}</div>` : ''}
      ${item.meta ? `<div class="desc">${esc(item.meta)}</div>` : ''}
    </div>
    <div class="tail">
      <span class="price">${priceOf(item, ctx.spec.currency)}</span>
      ${saveButton(key, item.name)}
      ${ctx.ordering && item.price > 0 ? `<button class="add" type="button" data-add="${key}" aria-label="Add ${esc(item.name)}">${icon('plus')}</button>` : icon('chevron')}
    </div>
  </div>`
}

/** The same thumb, with a photo on top when this build uses photography. */
function artThumb(
  ctx: Ctx,
  label: string,
  seed: string,
  extra = '',
  kind: 'wide' | 'thumb' = 'thumb',
  alt = '',
  media?: MenuItem['media'],
): string {
  const shot = media
    ? itemPhoto(ctx, media, kind, alt)
    : showsPhoto(ctx, 'tile')
      ? photo(ctx, seed, kind, alt)
      : ''
  return `<span class="thumb ${extra} m-${ctx.theme.motif}">${shot}<span class="mono">${esc(label)}</span></span>`
}

function itemTile(ctx: Ctx, item: MenuItem, key: string, wide = false): string {
  return `<div class="tile${wide ? ' wide' : ''}" data-item="${key}" role="button" tabindex="0">
    ${artThumb(ctx, item.name.slice(0, 1), key, '', 'thumb', item.name, item.media)}
    ${saveButton(key, item.name, ' on-art')}
    <div class="body">
      <div class="name">${esc(item.name)}</div>
      ${item.vendor || item.meta ? `<div class="tiny dim">${esc([item.vendor, item.meta].filter(Boolean).join(' · '))}</div>` : ''}
      <div class="price">${priceOf(item, ctx.spec.currency)}</div>
    </div>
    <span class="go" aria-hidden="true">${icon('chevron')}</span>
  </div>`
}

function itemStackCard(ctx: Ctx, item: MenuItem, key: string): string {
  return `<div class="stack-card" data-item="${key}" role="button" tabindex="0">
    ${artThumb(ctx, ctx.spec.logo, key, 'band', 'wide', item.name, item.media)}
    <div class="body">
      <div class="top">
        <span class="name">${esc(item.name)}</span>
        <span class="price">${priceOf(item, ctx.spec.currency)}</span>
      </div>
      ${item.desc ? `<p>${esc(item.desc)}</p>` : ''}
      <div class="specs">
        ${item.meta ? `<span>${esc(item.meta)}</span>` : ''}
        ${item.tag ? `<span>${esc(item.tag)}</span>` : ''}
        <span>${esc(ctx.vocab.item)}</span>
      </div>
      <div class="foot">
        <span class="tiny dim">Tap for details</span>
        <span class="foot-tools">${saveButton(key, item.name)}<span class="btn small ghost" style="padding:9px 14px;font-size:12px">View</span></span>
      </div>
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

function catalogBlock(ctx: Ctx): string {
  const { theme, spec } = ctx
  if (!spec.menu.length) return `<div class="empty">The catalogue is being written.</div>`

  if (theme.layout === 'grid') {
    const all = spec.menu.flatMap((section, sectionIndex) =>
      section.items.map((item, itemIndex) => ({ item, key: `${sectionIndex}-${itemIndex}` })),
    )
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
          <div class="tiles">
            ${section.items
              .map((item, itemIndex) => itemTile(ctx, item, `${sectionIndex}-${itemIndex}`, all.length === 1))
              .join('')}
          </div>
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
          ${section.items.map((item, itemIndex) => itemStackCard(ctx, item, `${sectionIndex}-${itemIndex}`)).join('')}
        </div>`,
      )
      .join('')}`
  }

  const row = theme.layout === 'editorial' ? itemRowEditorial : itemRowCompact
  return `${filters}${spec.menu
    .map(
      (section, sectionIndex) => `
      <div class="section-block" data-section="${sectionIndex}" id="sec-${sectionIndex}">
        <div class="sect"><span class="label">${esc(section.name)}</span><span class="count">${section.items.length}</span></div>
        <div>${section.items.map((item, itemIndex) => row(ctx, item, `${sectionIndex}-${itemIndex}`)).join('')}</div>
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
  const story = (homeSections(ctx.doc).find((node) => node.kind === 'story')?.text ?? ctx.spec.story ?? '').trim()
  if (!story) return ''
  return `<p class="home-story">${esc(story)}</p>`
}

/** A section the editor added, rendered as a real mobile component. */
function addedBlock(ctx: Ctx, node: DocNode): string {
  const title = node.title || ''
  switch (node.kind) {
    case 'testimonials':
      return `<div class="sect"><span class="label">${esc(title || 'Kind words')}</span></div>
        <div class="card" style="padding:18px">
          <p style="font-family:var(--display);font-size:16px;line-height:1.5">“${esc(node.text || 'A line from a happy customer belongs here.')}”</p>
          <p class="tiny dim" style="margin-top:10px">— A regular, ${esc(ctx.spec.name)}</p>
        </div>`
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
      if (!entries.length) return `<div class="empty">The catalogue is being written.</div>`
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
  return `<section class="screen${active ? ' on' : ''}" data-screen="${esc(screen.id)}" data-title="${esc(screen.name)}">
    <div class="detail-body" style="padding:16px 16px 110px">
      <span class="eyebrow">${esc(screen.name)}</span>
      <h1 class="display" style="font-size:28px;margin:4px 0 12px">${esc(screen.name)}</h1>
      ${sections || `<p class="empty">This screen is ready for its first component.</p>`}
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
  return `<div class="doc-section${hides ? ` ${hides}` : ''}" data-sec="${node.id}"${style ? ` style="${style}"` : ''}>${html}</div>`
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
    const sections = `<div class="sect"><span class="label">${esc(sectionTitle(ctx, 'featured', ctx.vocab.catalog))}</span><span class="count">${spec.menu.length} sections</span></div>
      <div>
        ${spec.menu
          .map(
            (section, index) => `<button class="r-row" type="button" data-jump="${index}">
              <div class="lead"><div class="name">${esc(section.name)}</div><div class="desc">${section.items.length} ${section.items.length === 1 ? 'item' : 'items'} · from ${priceOf(section.items[0], ctx.spec.currency)}</div></div>
              <div class="tail">${icon('chevron')}</div>
            </button>`,
          )
          .join('')}
      </div>`
    return `${heroSection(ctx, cover(ctx, [spec.hours.split('·')[0], spec.address]))}
      ${actions(ctx)}
      ${showcaseBlock(ctx)}
      <div class="status-card" style="margin-top:16px">
        <span class="dot"></span>
        <div><b>Open now</b><span>${esc(spec.hours)}</span></div>
      </div>
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
  const services = ctx.spec.menu.flatMap((section) => section.items).filter((item) => item.name)
  const staff = ctx.spec.staff ?? []
  return `<div class="sect" style="margin-top:4px"><span class="label">${esc(ctx.vocab.partyLabel)}</span></div>
    <div class="card" style="padding:16px;margin-bottom:10px">
      <div class="stepper">
        <button type="button" data-party="-1" aria-label="Fewer">${icon('minus')}</button>
        <b data-party-value>2</b>
        <button type="button" data-party="1" aria-label="More">${icon('plus')}</button>
      </div>
    </div>
    <div class="sect"><span class="label">Choose a day</span></div>
    <div class="chips" data-days></div>
    ${
      ctx.vocab.slots.length
        ? `<div class="sect"><span class="label">Choose a time</span></div>
           <div class="slots" data-slots></div>`
        : ''
    }
    ${
      ctx.spec.vertical !== 'restaurant' && ctx.spec.vertical !== 'cafe' && services.length
        ? `<div class="field"><label for="book-service">Service</label><select id="book-service" data-book-service>${services
            .map((item) => `<option value="${esc(item.name)}">${esc(item.name)}</option>`)
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
    <button class="btn accent block" type="button" data-book style="margin-top:18px">Request booking</button>
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
  return `<div class="sect" style="margin-top:4px"><span class="label">About</span></div>
    <p style="font-family:var(--display);font-size:16px;line-height:1.5;letter-spacing:var(--tracking)">${esc(story)}</p>
    ${hoursBlock(ctx)}
    ${
      spec.features.includes('gallery')
        ? `<div class="sect"><span class="label">${esc(ctx.vocab.galleryTitle ?? 'The work')}</span></div>
           <div class="gallery">${[0, 1, 2, 3]
             .map((index) =>
               motif(
                 ctx.theme,
                 '✳',
                 '',
                 ctx.media === 'photo' ? photo(ctx, `gallery-${index}`, 'thumb') : '',
               ),
             )
             .join('')}</div>`
        : ''
    }
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
      send({ type: 'select', id: section.dataset.sec })
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
  document.addEventListener('click', (event) => {
    const go = event.target.closest('[data-go]')
    if (go) setTimeout(() => send({ type: 'screen', id: go.dataset.go }), 60)
  }, true)
  addEventListener('message', (event) => {
    const message = event.data
    if (!message || message.source !== 'plattr-editor') return
    if (message.type === 'select') {
      for (const section of sections) section.classList.toggle('doc-selected', section.dataset.sec === message.id)
      const target = sections.find((section) => section.dataset.sec === message.id)
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  })
  send({ type: 'ready' })
})()
</script>`

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
  },
): string {
  // A description-built app carries the trade's sample phone, address and hours.
  // They stay editable in the studio, but the customer never sees them as if the
  // owner had confirmed them: a value equal to the trade's seed is sample, while
  // anything the owner or their site supplied is kept.
  const seed = verticalFor(inputSpec.vertical)
  const contact = (value: string | undefined, sample: string | undefined): string => {
    const text = (value ?? '').trim()
    if (!text) return ''
    return sample && text === sample.trim() ? '' : text
  }
  const spec: AppSpec =
    options.editor || !inputSpec.sampleContent?.contact
      ? inputSpec
      : {
          ...inputSpec,
          phone: contact(inputSpec.phone, seed.phone),
          address: contact(inputSpec.address, seed.address),
          hours: contact(inputSpec.hours, seed.hours),
        }
  const live = options.live !== false
  const vertical = verticalFor(spec.vertical)
  const vocab: Vocab = vertical.vocab
  const doc = options.doc ? normalizeDoc(options.doc, spec) : null
  const preview = { ...(spec.layout ?? {}), ...suppliedPreview(options.preview) }
  // A direction is opt-in through the document, so untouched legacy builds keep
  // their seeded rendering. New documents carry one from birth; the demo route
  // may request one explicitly for quality review.
  const requestedDirection =
    doc?.design?.direction ?? (typeof preview.direction === 'string' ? preview.direction : undefined)
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
  const ordering = has('ordering')
  const booking = has('booking') || has('classes')
  const timetable = has('classes') && (vertical.timetable?.length ?? 0) > 0 ? vertical.timetable! : []
  const quoting = has('quote')
  const goal = Math.max(2, Math.min(12, spec.loyalty.goal || 6))

  const cta = ctaFor(vertical.id)
  const primary =
    cta === 'order' && ordering
      ? { label: vocab.homeCta, screen: 'cart' }
      : cta === 'quote' && quoting
        ? { label: vocab.homeCta, screen: 'quote' }
        : cta === 'book' && booking
          ? { label: vocab.homeCta, screen: 'book' }
          : cta === 'catalog'
            // The trade opens on its list, so its own phrasing names the button.
            ? { label: vocab.homeCta, screen: 'catalog' }
            : { label: `See the ${vocab.catalog.toLowerCase()}`, screen: 'catalog' }
  const secondary =
    primary.screen !== 'book' && booking
      ? { label: vocab.bookTitle, screen: 'book' }
      : primary.screen !== 'quote' && quoting
        ? { label: vocab.quoteTitle, screen: 'quote' }
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
  }

  const tabs = doc ? tabsFromDoc(doc) : tabsFor(ctx, shell)
  // The chrome names the screen the way its tab does, so a restored heading
  // reads "Visit" rather than the generic "More".
  const moreTitle = tabs.find((tab) => tab.id === 'more')?.label ?? 'More'

  const data = {
    token: options.token,
    shell,
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
    fulfilment: vocab.fulfilment,
    deliveryFee: ordering && vocab.fulfilment.includes('Delivery') ? 299 : 0,
    // Course checkouts still create orders; the wording follows the trade.
    isCourse: spec.vertical === 'courses',
    addLabel: spec.vertical === 'courses' ? 'Enrol on this course' : 'Add to order',
    placeLabel: spec.vertical === 'courses' ? 'Confirm enrolment' : 'Place order',
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
    listingSpecLabel: vocab.listingSpecLabel || 'Included',
    bookTitle: vocab.bookTitle,
    quoteTitle: vocab.quoteTitle,
    motif: theme.motif,
    media,
    // Only ship the sets this build can actually use.
    photoWide: media === 'art' ? [] : ctx.photos.wide,
    photoThumb: media === 'photo' ? ctx.photos.thumb : [],
    menu: spec.menu,
    currencySymbol: CURRENCY_SYMBOLS[(spec.currency ?? '').toUpperCase()] ?? '$',
  }

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
<body data-trade="${vertical.id}" data-layout="${theme.layout}" data-shell="${shell}" data-variant="${variant}" data-density="${density}" data-corners="${corners}" data-media="${media}" data-nav="${drawer ? 'drawer' : theme.nav}" data-hero="${hero}" data-order="${order}" data-hero-scale="${heroScale}" data-accent-style="${theme.accentStyle}" data-theme="${theme.dark ? 'dark' : 'light'}"${look ? ` data-direction="${look.id}"` : ''}${doc?.design?.typography ? ` data-type="${doc.design.typography}"` : ''}${buttons ? ` data-buttons="${buttons}"` : ''}${cards ? ` data-cards="${cards}"` : ''}${preset ? ` data-preset="${preset}"` : ''}${flagship ? ' data-flagship="1"' : ''}${options.editor ? ' data-editor="1"' : ''}>
  <div class="app">
    <div class="grain" aria-hidden="true"></div>
    <div class="offline" data-offline hidden>Offline — showing what is already stored</div>

    <div class="splash" data-splash>
      <div class="s-mark">${esc(spec.logo)}</div>
      <b>${esc(spec.name)}</b>
      <span>${esc(ctx.label)}</span>
    </div>

    <header class="appbar${shell === 'menu' ? ' is-brand' : ''}${shell === 'session' ? ' is-session' : ''}${shell === 'care' ? ' is-care' : ''}${shell === 'listing' ? ' is-listing' : ''}">
      <button class="iconbtn" type="button" data-back hidden aria-label="Back">${icon('chevron')}</button>
      ${shell === 'menu' ? '' : `<span class="mark">${esc(spec.logo)}</span>`}
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
        ${flagship
          ? flagshipHome(ctx)
          : `<div>
               ${shellOpener(ctx, shell)}
               ${homeBlock(ctx)}
             </div>`}
      </section>

      <section class="screen${initial === 'catalog' ? ' on' : ''}" data-screen="catalog" data-title="${esc(vocab.catalog)}">
        ${flagship ? flagshipCatalogLead(spec) : ''}
        ${shell === 'menu' ? menuMasthead(ctx) : ''}
        <div class="sect" style="margin-top:4px"><span class="label">${esc(vocab.catalog)}</span><span class="count">${spec.menu.reduce((total, section) => total + section.items.length, 0)}</span></div>
        ${storesBlock(ctx)}
        ${catalogBlock(ctx)}
      </section>

      <section class="screen" data-screen="search" data-title="Search">
        <div class="search-field">
          <span class="search-ico">${icon('search')}</span>
          <input id="search" type="text" inputmode="search" autocomplete="off" data-search-input placeholder="Search the ${esc(vocab.catalog.toLowerCase())}" aria-label="Search" />
          <button class="search-clear" type="button" data-search-clear aria-label="Clear">${icon('close')}</button>
        </div>
        <div class="chips" data-search-recent></div>
        <div data-search-results></div>
      </section>

      <section class="screen" data-screen="saved" data-title="Saved">
        <div class="sect" style="margin-top:4px"><span class="label">Saved</span><span class="count" data-saved-count>0</span></div>
        <div data-saved-list></div>
      </section>

      ${
        booking
          ? `<section class="screen is-booking${initial === 'book' ? ' on' : ''}" data-screen="book" data-title="${esc(vocab.bookTitle)}">
               ${timetableBlock(ctx)}
               ${bookingBlock(ctx)}
             </section>`
          : ''
      }

      ${
        quoting
          ? `<section class="screen${initial === 'quote' ? ' on' : ''}" data-screen="quote" data-title="${esc(vocab.quoteTitle)}">
               ${quoteBlock(ctx)}
             </section>`
          : ''
      }

      <section class="screen${initial === 'more' ? ' on' : ''}" data-screen="more" data-title="${esc(moreTitle)}">
        <div class="detail-body" style="padding-top:6px">
          <h1 class="display">${esc(spec.name)}</h1>
          <p class="dim" style="margin-top:6px;font-size:13px">${esc(spec.tagline)}</p>
        </div>
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
      { cart: {}, stamps: 0, orderType: DATA.fulfilment[0], party: 2, day: 0, slot: null, stars: 0, saved: {}, recent: [], orders: [], bookings: [], customerName: '', customerContact: '' },
      stored,
    )
    if (!state.saved || typeof state.saved !== 'object') state.saved = {}
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
    const buzz = (ms) => { try { if (navigator.vibrate) navigator.vibrate(ms) } catch (error) {} }
    const appbar = document.querySelector('.appbar')
    const titleEl = document.querySelector('[data-title]')
    const backBtn = document.querySelector('[data-back]')

    const itemFor = (key) => {
      const parts = key.split('-').map(Number)
      const section = DATA.menu[parts[0]]
      return section && section.items[parts[1]] ? section.items[parts[1]] : null
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
        return '<img class="photo" src="' + base + '/640.webp" srcset="' + base + '/320.webp 320w, ' + base + '/640.webp 640w, ' + base + '/1280.webp 1280w" sizes="' + (list === 'photoWide' ? '100vw' : '(max-width: 620px) 38vw, 200px') + '" alt="' + esc(media.alt || alt || '') + '" loading="lazy" decoding="async" style="object-fit:' + (media.fit === 'contain' ? 'contain' : 'cover') + ';object-position:' + (media.focalX ?? 50) + '% ' + (media.focalY ?? 50) + '%" onerror="this.remove()" />'
      }
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
      return '<img class="photo" src="' + url + '"' + srcset + ' alt="' + esc(alt || '') + '" loading="lazy" decoding="async" onerror="this.remove()" />'
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
          return '<button class="rec" type="button" data-item="' + pick.key + '">' +
            '<span class="thumb m-' + DATA.motif + ' rec-art">' + pickShot(pick.key, 'photoThumb', pick.item.name, pick.item) + '<span class="mono">' + esc(pick.item.name.slice(0, 1).toUpperCase()) + '</span></span>' +
            '<span class="rec-copy"><b>' + esc(pick.item.name) + '</b><span class="rec-price">' + (pick.item.price > 0 ? money(pick.item.price) : 'On request') + '</span></span></button>'
        }).join('') + '</div></div>'
    }

    // Each shell opens an item its own way: a menu line, a class card, a
    // treatment sheet or a property listing — not one shared detail page.
    function detailHtml(item, key, price) {
      const save = '<button class="save on-art detail-save' + (state.saved[key] ? ' on' : '') + '" type="button" data-save="' + key + '" aria-label="Save">' + HEART + '</button>'
      // Photography only where the build asked for it; removing the node on
      // failure reveals the generated artwork underneath, which is why the
      // app still looks complete offline.
      const shot = function (seed, list, alt, useItem) {
        return pickShot(seed, list, alt, useItem ? item : null)
      }
      const band = '<div class="thumb m-' + DATA.motif + ' detail-band">' + shot(key, 'photoWide', item.name, true) + '<span class="mono">' + esc(item.name.slice(0, 1).toUpperCase()) + '</span>' + save + '</div>'
      if (DATA.shell === 'menu')
        return '<div class="thumb m-' + DATA.motif + ' menu-band">' + shot(key, 'photoWide', item.name, true) + '<span class="mono">' + esc(item.name.slice(0, 1).toUpperCase()) + '</span>' + save + '</div>' +
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
        return '<div class="listing-gallery">' +
          '<div class="thumb m-' + DATA.motif + ' listing-shot wide">' + shot(item.name + '-wide', 'photoWide', item.name, true) + '<span class="mono">' + esc(item.name.slice(0, 1).toUpperCase()) + '</span></div>' +
          '<div class="thumb m-' + DATA.motif + ' listing-shot">' + shot(item.name + '-b', 'photoThumb') + '</div>' +
          '<div class="thumb m-' + DATA.motif + ' listing-shot">' + shot(item.name + '-c', 'photoThumb') + '</div>' + save + '</div>' +
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

    function openDetail(key, record) {
      const item = itemFor(key)
      if (!item) return
      const host = document.querySelector('[data-detail-body]')
      const screen = document.querySelector('[data-screen="detail"]')
      const price = item.price > 0 ? money(item.price) : 'On request'
      const footer = DATA.ordering && item.price > 0
        ? '<div class="detail-cta"><div class="detail-cta-line"><span class="tiny dim">' + esc(item.meta || DATA.catalogWord) + '</span>' +
          '<b class="price">' + price + '</b></div>' +
          '<button class="btn accent" type="button" data-add="' + key + '">' + DATA.addLabel + '</button></div>'
        : DATA.booking
          ? '<div class="detail-cta"><button class="btn accent block" type="button" data-go="book">' + DATA.bookTitle + '</button></div>'
          : DATA.quoting
            ? '<div class="detail-cta"><button class="btn accent block" type="button" data-go="quote">' + DATA.quoteTitle + '</button></div>'
            : ''
      const shellDetail = detailHtml(item, key, price)
      host.innerHTML = shellDetail ||
        '<div class="thumb m-' + DATA.motif + ' detail-band">' +
        '<span class="mono">' + esc(item.name.slice(0, 1).toUpperCase()) + '</span>' +
        '<span class="cap"><span>' + esc(item.tag || DATA.catalogWord) + '</span><span>' + price + '</span></span>' +
        '<button class="save on-art detail-save' + (state.saved[key] ? ' on' : '') + '" type="button" data-save="' + key + '" aria-label="Save">' + HEART + '</button></div>' +
        '<div class="detail-body">' +
        (item.tag ? '<span class="tag">' + esc(item.tag) + '</span>' : '') +
        '<h1 style="margin-top:10px">' + esc(item.name) + '</h1>' +
        (item.desc ? '<p class="lede">' + esc(item.desc) + '</p>' : '') +
        '<div class="detail-line"><span class="tiny dim">' + esc(item.meta || DATA.catalogWord) + '</span><span class="price">' + price + '</span></div>' +
        '<p class="tiny dim" style="margin-top:16px">Prices include tax. Ask the team about allergies or access needs — they would rather know.</p>' +
        '<div class="detail-gap" aria-hidden="true"></div>' +
        footer +
        '</div>'
      applyHearts()
      all('.screen').forEach((s) => s.classList.toggle('on', s === screen))
      all('.tab').forEach((tab) => tab.classList.remove('on'))
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
      const price = item.price > 0 ? money(item.price) : 'On request'
      return '<div class="r-row" data-item="' + key + '" role="button" tabindex="0">' +
        '<span class="thumb r-art m-' + DATA.motif + '">' + pickShot(key, 'photoThumb', item.name, item) +
        '<span class="mono">' + esc(item.name.slice(0, 1).toUpperCase()) + '</span></span>' +
        '<div class="lead"><div class="name">' + esc(item.name) + '</div>' +
        '<div class="desc">' + esc(item.meta || item.desc || DATA.catalogWord) + '</div></div>' +
        '<div class="tail"><span class="price">' + price + '</span>' +
        '<button class="save' + (state.saved[key] ? ' on' : '') + '" type="button" data-save="' + key + '" aria-label="Save">' + HEART + '</button>' +
        (DATA.ordering && item.price > 0 ? '<button class="add" type="button" data-add="' + key + '" aria-label="Add">' + PLUS + '</button>' : '') +
        '</div></div>'
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
        ...state.bookings.map((booking) => ({ kind: 'Booking', number: booking.number, detail: booking.status + (booking.date ? ' · ' + booking.date + (booking.slot ? ' ' + booking.slot : '') : ''), date: booking.date, total: null })),
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
        results.innerHTML = '<div class="empty">Search the ' + DATA.catalogWord + ' by name, ingredient or brand.</div>'
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
      if (!silent) buzz(6)
    }

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
      const lines = Object.entries(state.cart).filter((entry) => entry[1] > 0)
      const subtotal = lines.reduce((total, entry) => total + (itemFor(entry[0])?.price || 0) * entry[1], 0)
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
          const item = itemFor(entry[0])
          if (!item) return ''
          return '<div class="cart-line"><div><div class="name">' + esc(item.name) + '</div><div class="price">' + money(item.price * entry[1]) + '</div></div>' +
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
      state.cart[key] = (state.cart[key] || 0) + 1
      save()
      renderCart()
      const item = itemFor(key)
      buzz(12)
      toast((item ? item.name : 'Added') + ' added')
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
        const payload = await postJson('/p/' + DATA.token + '/orders', {
          customer: Object.assign({ name }, contactFields(contact)),
          fulfilment: state.orderType,
          items: totals.lines.map(([key, qty]) => ({ key, qty })),
        })
        const order = payload.order
        state.orders = [{ id: order.id, number: order.number, status: order.status, total: order.total, createdAt: order.createdAt }, ...state.orders].slice(0, 12)
        state.customerName = name
        state.customerContact = contact
        if (DATA.loyalty) state.stamps = Math.min(DATA.goal, state.stamps + 1)
        state.cart = {}
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

    function buildBooking() {
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
      const chip = $('[data-days] .chip.on')
      const dayLabel = chip ? chip.textContent : 'Today'
      const date = new Date()
      date.setDate(date.getDate() + Number(state.day || 0))
      const iso = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0')
      const name = ($('[data-book-name]')?.value || '').trim()
      const contact = ($('[data-book-contact]')?.value || '').trim()
      if (name.length < 2) return toast('Add your name so the business can confirm')
      if (contact.length < 5) return toast('Add a phone number or email address')
      const button = $('[data-book]')
      if (button) button.disabled = true
      try {
        const payload = await postJson('/p/' + DATA.token + '/bookings', {
          customer: Object.assign({ name }, contactFields(contact)),
          date: iso,
          slot: state.slot || '',
          party: state.party,
          service: ($('[data-book-service]')?.value || ''),
          staff: ($('[data-book-staff]')?.value || ''),
        })
        const booking = payload.booking
        state.bookings = [{ id: booking.id, number: booking.number, status: booking.status, date: booking.date, slot: booking.slot }, ...state.bookings].slice(0, 12)
        state.customerName = name
        state.customerContact = contact
        save()
        renderHistory()
        const service = ($('[data-book-service]')?.value || '')
        note('<div class="done"><div class="tick">✓</div><h2>Request sent</h2>' +
          '<p>' + esc(dayLabel) + (state.slot ? ' at ' + esc(state.slot) : '') + ' · ' + state.party + ' ' + DATA.partyLabel.toLowerCase() + '<br />The business will confirm this request. You can check its status in More.</p>' +
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
        '[data-add],[data-inc],[data-pay],[data-go],[data-jump],[data-place],[data-type],[data-party],[data-book],[data-reserve],[data-quote-send],[data-send-review],[data-cart-open],[data-nav-open],[data-save],[data-search-open],[data-saved-open],[data-search-clear],[data-filter],[data-property-filter],[data-recent],[data-install],[data-close-sheet],[data-back],[data-store],.stars span,[data-item]',
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
      if (target.dataset.add) return addItem(target.dataset.add)
      if (target.dataset.inc) {
        const key = target.dataset.inc
        state.cart[key] = Math.max(0, (state.cart[key] || 0) + Number(target.dataset.delta))
        if (!state.cart[key]) delete state.cart[key]
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
  </script>${options.editor ? EDITOR_BRIDGE : ''}
</body>
</html>`
}

export function renderManifest(spec: AppSpec): string {
  const theme = themeFor(verticalFor(spec.vertical).id)
  return JSON.stringify(
    {
      name: `${spec.name} — ${spec.kind}`,
      short_name: spec.name.slice(0, 12),
      description: spec.tagline,
      start_url: './',
      scope: './',
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

export function renderServiceWorker(version: number): string {
  return `/* Generated by Plattr — version ${version} */
const CACHE = 'plattr-v${version}'
const SHELL = ['./', './manifest.webmanifest', './icon.svg']

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
// document. Everything else (icons, assets) is cache-first for offline use.
self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  if (new URL(request.url).origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy))
          return response
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match('./'))),
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
