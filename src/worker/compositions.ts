import { stockImageTag } from './flagshipImages'
import { moneyForSpec } from './pricing'
import type { AppSpec, MenuItem } from './types'
import { verticalFor } from './verticals'

/**
 * Trade compositions for the twelve trades that used to fall through to the
 * generic stack. The block components are shared on purpose; each trade's
 * document, order, words, primary action and data emphasis are its own. An
 * image here is the item's own photograph, the trade's curated library, or an
 * honest initial tile — never someone else's stock photo.
 */

export type CompositionContext = {
  spec: AppSpec
  token: string
  booking: boolean
  doc: { screens: { id: string; kind: string }[] } | null
}

export const COMPOSITION_TRADES = new Set<AppSpec['vertical']>([
  'hospital',
  'plants-indoor',
  'plants-outdoor',
  'tuition',
  'school',
  'kindergarten',
  'agency',
  'influencer',
  'portfolio',
  'film',
  'gallery',
  'marketplace',
])

export function isCompositionVariant(variant: string | undefined): boolean {
  return Boolean(variant?.startsWith('c-'))
}

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

type Entry = { section: string; item: MenuItem; index: number }

function entries(spec: AppSpec): Entry[] {
  const out: Entry[] = []
  for (const section of spec.menu) for (const item of section.items) out.push({ section: section.name, item, index: out.length })
  return out
}

function price(item: MenuItem, spec: AppSpec): string {
  return item.price > 0 ? moneyForSpec(item.price, spec) : item.meta || 'On request'
}

function screen(ctx: CompositionContext, kind: string, fallback: string): string {
  return ctx.doc?.screens.find((entry) => entry.kind === kind)?.id ?? fallback
}

const ACTIONS: Record<string, { primary: string; secondary?: string }> = {
  hospital: { primary: 'Book a clinic', secondary: 'Find a department' },
  'plants-indoor': { primary: 'Shop the plants', secondary: 'Care notes' },
  'plants-outdoor': { primary: 'See what is ready', secondary: 'Plan a visit' },
  tuition: { primary: 'Book a trial lesson', secondary: 'Ask about a place' },
  school: { primary: 'Book a parents’ evening', secondary: 'Ask the office' },
  kindergarten: { primary: 'Book a visit', secondary: 'Ask about a place' },
  agency: { primary: 'Request a proposal', secondary: 'See the work' },
  influencer: { primary: 'Request the rate card', secondary: 'Book a shoot day' },
  portfolio: { primary: 'Start a project', secondary: 'See the work' },
  film: { primary: 'Book a screening', secondary: 'Press materials' },
  gallery: { primary: 'Plan your visit', secondary: 'Ask about a work' },
  marketplace: { primary: 'Shop the market', secondary: 'List your store' },
}

function actionTargets(ctx: CompositionContext): { primary: string; secondary?: string } {
  const { spec } = ctx
  const has = (feature: string) => spec.features.includes(feature as never)
  const catalog = screen(ctx, 'catalog', 'catalog')
  const book = screen(ctx, 'book', 'book')
  const quote = screen(ctx, 'quote', 'quote')
  switch (spec.vertical) {
    case 'hospital':
    case 'film':
    case 'gallery':
      return { primary: book, secondary: catalog }
    case 'portfolio':
    case 'agency':
    case 'influencer':
      return { primary: has('quote') ? quote : catalog, secondary: catalog }
    case 'marketplace':
      return { primary: catalog, secondary: has('quote') ? quote : catalog }
    default:
      return {
        primary: has('book') || has('classes') ? book : catalog,
        secondary: has('quote') ? quote : undefined,
      }
  }
}

function itemVisual(ctx: CompositionContext, item: MenuItem, index: number, wide = false): string {
  if (item.media)
    return `<img class="cx-photo" src="/p/${esc(ctx.token)}/media/${esc(item.media.id)}/640.webp" srcset="/p/${esc(ctx.token)}/media/${esc(item.media.id)}/320.webp 320w, /p/${esc(ctx.token)}/media/${esc(item.media.id)}/640.webp 640w" sizes="${wide ? '100vw' : '(max-width: 620px) 45vw, 220px'}" alt="${esc(item.media.alt || item.name)}" loading="lazy" decoding="async" />`
  if (item.image)
    return `<img class="cx-photo is-source" src="${esc(item.image.url)}" alt="${esc(item.image.alt || item.name)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" style="object-fit:${item.image.fit === 'cover' ? 'cover' : 'contain'};object-position:${item.image.positionX ?? 50}% ${item.image.positionY ?? 50}%" onerror="this.remove()" />`
  if (!ctx.spec.website) {
    const shot = stockImageTag(ctx.spec.vertical, index, { sizes: wide ? '100vw' : '(max-width: 620px) 45vw, 220px' })
    if (shot) return shot
  }
  // No photograph, no photograph-shaped hole. A trade with no imagery yet keeps
  // its words and its type; it does not show a grey box pretending to be a shot.
  return ''
}

function hero(ctx: CompositionContext, node: { title?: string; text?: string }): string {
  const { spec } = ctx
  const vertical = verticalFor(spec.vertical)
  const first = entries(spec)[0]
  const action = actionTargets(ctx)
  const kicker = [spec.hours, spec.address].filter(Boolean).map(esc).join(' · ')
  const lead = first ? itemVisual(ctx, first.item, 0, true) : ''
  return `<div class="cx-hero">
    ${kicker ? `<div class="cx-kicker"><span>${esc(vertical.label)}</span><span>${kicker}</span></div>` : ''}
    <div class="cx-hero-body">
      <span class="cx-eyebrow">${esc(vertical.kind)}</span>
      <h1>${esc(node.title || spec.name)}</h1>
      <p>${esc(node.text || spec.tagline)}</p>
      ${lead ? `<div class="cx-hero-thumb">${lead}</div>` : ''}
      <div class="cx-hero-actions"><button type="button" class="cx-primary" data-go="${esc(action.primary)}">${esc(ACTIONS[spec.vertical]?.primary || vertical.vocab.homeCta)}</button></div>
    </div>
  </div>`
}

function indexBlock(ctx: CompositionContext, node: { title?: string; text?: string }): string {
  const { spec } = ctx
  const counts = new Map<string, { count: number; from: number }>()
  for (const entry of entries(spec)) {
    const found = counts.get(entry.section) || { count: 0, from: 0 }
    found.count += 1
    if (entry.item.price > 0 && (!found.from || entry.item.price < found.from)) found.from = entry.item.price
    counts.set(entry.section, found)
  }
  const rows = [...counts.entries()].slice(0, 6)
  if (!rows.length) return ''
  return `<div class="cx-index">
    ${node.title ? `<div class="cx-head"><span>${esc(node.title)}</span><span>${rows.length} ${rows.length === 1 ? 'group' : 'groups'}</span></div>` : ''}
    ${node.text ? `<p class="cx-note">${esc(node.text)}</p>` : ''}
    ${rows
      .map(
        ([name, info]) =>
          `<button type="button" class="cx-row" data-go="${esc(screen(ctx, 'catalog', 'catalog'))}"><span><b>${esc(name)}</b><em>${info.count} ${info.count === 1 ? 'entry' : 'entries'}${info.from ? ` · from ${moneyForSpec(info.from, spec)}` : ''}</em></span><span aria-hidden="true">→</span></button>`,
      )
      .join('')}
  </div>`
}

function listBlock(ctx: CompositionContext, node: { title?: string; text?: string }, count = 4): string {
  const all = entries(ctx.spec)
  const list = all.slice(0, count)
  if (!list.length) return ''
  return `<div class="cx-list">
    ${node.title ? `<div class="cx-head"><span>${esc(node.title)}</span><button type="button" data-go="${esc(screen(ctx, 'catalog', 'catalog'))}">All ${all.length}</button></div>` : ''}
    ${node.text ? `<p class="cx-note">${esc(node.text)}</p>` : ''}
    <div class="cx-grid">
      ${list
        .map(
          (entry) =>
            `<button type="button" class="cx-card" data-item="${esc(entry.item.id || '')}" data-go="${esc(screen(ctx, 'detail', 'detail'))}"><span class="cx-thumb">${itemVisual(ctx, entry.item, entry.index)}</span><b>${esc(entry.item.name)}</b><em>${esc(price(entry.item, ctx.spec))}</em></button>`,
        )
        .join('')}
    </div>
  </div>`
}

function scheduleBlock(ctx: CompositionContext, node: { title?: string; text?: string }): string {
  const { spec } = ctx
  // A real date first: what the trade says is on (an exhibition, a screening, a
  // term), then a dated item line, then the next few days.
  const events = verticalFor(spec.vertical).events ?? []
  const dated = entries(spec)
    .map((entry) => entry.item.meta)
    .filter((meta): meta is string => Boolean(meta) && /\d/.test(meta as string))
  const dates = (events.length ? events.map((event) => event.when) : dated).slice(0, 4)
  const target = actionTargets(ctx).primary
  const chips = dates.length
    ? dates
    : Array.from({ length: 4 }, (_, index) => {
        const date = new Date()
        date.setDate(date.getDate() + index)
        return index === 0 ? 'Today' : index === 1 ? 'Tomorrow' : date.toLocaleDateString('en-US', { weekday: 'short' })
      })
  return `<div class="cx-schedule">
    ${node.title ? `<div class="cx-head"><span>${esc(node.title)}</span></div>` : ''}
    ${node.text ? `<p class="cx-note">${esc(node.text)}</p>` : ''}
    <div class="cx-chips">${chips.map((chip, index) => `<button type="button" class="cx-chip${index === 0 ? ' on' : ''}" data-go="${esc(target)}">${esc(chip)}</button>`).join('')}</div>
  </div>`
}

function factsBlock(ctx: CompositionContext, node: { title?: string; text?: string }): string {
  const { spec } = ctx
  const facts = [node.title || 'When we are open', spec.hours, spec.address, spec.phone, node.text || '']
  const unique = [...new Set(facts.map((fact) => String(fact).trim()).filter(Boolean))]
  return unique.length ? `<div class="cx-facts">${unique.map((fact) => `<span>${esc(fact)}</span>`).join('')}</div>` : ''
}

function vendorsBlock(ctx: CompositionContext, node: { title?: string; text?: string }): string {
  const vendors = new Map<string, number>()
  for (const entry of entries(ctx.spec)) {
    if (!entry.item.vendor) continue
    vendors.set(entry.item.vendor, (vendors.get(entry.item.vendor) || 0) + 1)
  }
  if (!vendors.size) return ''
  return `<div class="cx-vendors">
    ${node.title ? `<div class="cx-head"><span>${esc(node.title)}</span><span>${vendors.size} stores</span></div>` : ''}
    <div class="cx-vendor-row">${[...vendors.entries()]
      .slice(0, 6)
      .map(([name, count]) => `<button type="button" class="cx-vendor" data-go="${esc(screen(ctx, 'catalog', 'catalog'))}"><b>${esc(name)}</b><em>${count} ${count === 1 ? 'item' : 'items'}</em></button>`)
      .join('')}</div>
  </div>`
}

function actionBlock(ctx: CompositionContext, node: { title?: string; text?: string; cta?: { label: string; screen: string } }): string {
  const targets = actionTargets(ctx)
  const label = node.cta?.label || node.title || ACTIONS[ctx.spec.vertical]?.primary || 'Get in touch'
  return `<div class="cx-action">
    ${node.title ? `<b>${esc(node.title)}</b>` : ''}
    ${node.text ? `<p>${esc(node.text)}</p>` : ''}
    <button type="button" class="cx-primary" data-go="${esc(targets.primary)}">${esc(label)}</button>
    ${targets.secondary ? `<button type="button" class="cx-secondary" data-go="${esc(targets.secondary)}">${esc(ACTIONS[ctx.spec.vertical]?.secondary || 'More')}</button>` : ''}
  </div>`
}

const HEADINGS: Record<string, Record<string, string>> = {
  hospital: { index: 'Departments & clinics', schedule: 'Clinics and visiting', facts: 'Before you come' },
  'plants-indoor': { list: 'Easy care, in stock', facts: 'Light and water', action: 'Not sure which plant?' },
  'plants-outdoor': { list: 'Ready to plant', schedule: 'Bare-root season', facts: 'At the nursery' },
  tuition: { index: 'Subjects and groups', schedule: 'Trial lessons', action: 'Ask about a place' },
  school: { schedule: 'Term dates', index: 'Clubs', facts: 'The school day', action: 'Ask the office' },
  kindergarten: { facts: 'A day here', index: 'Sessions and fees', schedule: 'Settling visits' },
  agency: { list: 'Selected work', index: 'What we do', action: 'Start with a conversation' },
  influencer: { index: 'Formats and rates', facts: 'Reach and turnaround', action: 'Request the rate card' },
  portfolio: { list: 'Selected work', facts: 'About the studio', action: 'Start a project' },
  film: { schedule: 'Screenings', index: 'Cast and crew', list: 'Stills & posters', action: 'Book a screening' },
  gallery: { schedule: 'On view', list: 'Works on view', facts: 'Plan your visit', action: 'Ask about a work' },
  marketplace: { vendors: 'The shops', index: 'Categories', facts: 'Delivery and collection', action: 'One basket, any store' },
}

/** `c-<trade>-<block>`: trade ids contain hyphens, so strip the exact id. */
function suffixOf(variant: string, trade: string): string {
  const prefix = `c-${trade}-`
  return variant.startsWith(prefix) ? variant.slice(prefix.length) : variant.replace(/^c-/, '')
}

export function compositionBlock(
  ctx: CompositionContext,
  node: { variant?: string; title?: string; text?: string; cta?: { label: string; screen: string } },
): string {
  const variant = node.variant || ''
  if (!isCompositionVariant(variant)) return ''
  const suffix = suffixOf(variant, ctx.spec.vertical)
  const block = { ...node, title: node.title || HEADINGS[ctx.spec.vertical]?.[suffix] || '' }
  switch (suffix) {
    case 'hero':
      return hero(ctx, block)
    case 'departments':
    case 'subjects':
    case 'sessions':
    case 'clubs':
    case 'formats':
    case 'services':
    case 'categories':
    case 'cast':
      return indexBlock(ctx, block)
    case 'shelf':
    case 'stock':
    case 'works':
    case 'work':
    case 'stills':
      return listBlock(ctx, block)
    case 'term':
    case 'screenings':
    case 'show':
    case 'trial':
    case 'season':
      return scheduleBlock(ctx, block)
    case 'visiting':
    case 'day':
    case 'reach':
    case 'about':
    case 'delivery':
    case 'care':
    case 'facts':
      return factsBlock(ctx, block)
    case 'vendors':
      return vendorsBlock(ctx, block)
    case 'urgent':
    case 'help':
    case 'visit':
    case 'enquire':
    case 'contact':
    case 'brief':
    case 'book':
    case 'shop':
    case 'events':
      return actionBlock(ctx, block)
    default:
      return ''
  }
}

/** Shared spacing, with a distinct signature per trade. */
export function compositionCss(): string {
  return `
.cx-hero { padding: 4px 0 2px; }
.cx-kicker { display: flex; justify-content: space-between; gap: 10px; font-size: 9.5px; letter-spacing: .09em; text-transform: uppercase; opacity: .6; padding-bottom: 12px; }
.cx-hero-body { display: flex; flex-direction: column; gap: 10px; }
.cx-eyebrow { font-size: 9.5px; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
.cx-hero h1 { margin: 0; font-size: clamp(30px, 9.4vw, 44px); line-height: .98; letter-spacing: -.03em; }
.cx-hero p { margin: 0; font-size: 14px; line-height: 1.45; color: var(--muted); max-width: 34ch; }
.cx-hero-thumb { margin-top: 4px; border-radius: 18px; overflow: hidden; aspect-ratio: 4 / 3; background: var(--surface-2); }
.cx-hero-thumb .cx-photo, .cx-hero-thumb svg { width: 100%; height: 100%; object-fit: cover; display: block; }
.cx-hero-thumb .cx-glyph { display: flex; align-items: center; justify-content: center; height: 100%; font-size: 44px; font-weight: 650; opacity: .32; }
.cx-hero-actions, .cx-action { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.cx-primary, .cx-secondary { min-height: 48px; padding: 0 18px; border-radius: calc(var(--radius) * .7); font: inherit; font-weight: 650; font-size: 13.5px; border: 1px solid transparent; }
.cx-primary { background: var(--accent); color: var(--on-accent); flex: 1 1 58%; }
.cx-secondary { background: transparent; color: var(--ink); border-color: var(--line); flex: 1 1 34%; }
.cx-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 22px 0 10px; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
.cx-head span:last-child, .cx-head button { font-size: 11px; letter-spacing: 0; text-transform: none; color: var(--muted); background: none; border: 0; }
.cx-note { margin: 0 0 10px; font-size: 13px; line-height: 1.5; color: var(--muted); }
.cx-index { display: flex; flex-direction: column; }
.cx-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 15px 0; background: none; border: 0; border-top: 1px solid var(--line); color: inherit; font: inherit; text-align: left; min-height: 56px; }
.cx-row b { display: block; font-size: 15px; font-weight: 600; }
.cx-row em { display: block; font-style: normal; font-size: 12px; color: var(--muted); margin-top: 2px; }
.cx-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.cx-card { display: flex; flex-direction: column; gap: 5px; padding: 0 0 10px; background: none; border: 0; color: inherit; font: inherit; text-align: left; min-height: 56px; }
.cx-thumb { display: block; aspect-ratio: 1 / 1; border-radius: 14px; overflow: hidden; background: var(--surface-2); }
.cx-thumb .cx-photo, .cx-thumb svg { width: 100%; height: 100%; object-fit: cover; display: block; }
.cx-thumb:empty { display: none; }
.cx-hero-thumb:empty { display: none; }
.cx-card b { font-size: 13.5px; font-weight: 600; }
.cx-card em { font-style: normal; font-size: 12px; color: var(--muted); }
.cx-chips { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; }
.cx-chip { flex: 0 0 auto; min-height: 44px; padding: 0 15px; border-radius: 999px; border: 1px solid var(--line); background: transparent; color: inherit; font: inherit; font-size: 12.5px; }
.cx-chip.on { background: var(--ink); color: var(--bg); border-color: transparent; }
.cx-facts { display: flex; flex-direction: column; padding-top: 6px; }
.cx-facts span { padding: 12px 0; border-top: 1px solid var(--line); font-size: 13px; color: var(--ink); }
.cx-vendor-row { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 6px; }
.cx-vendor { flex: 0 0 auto; min-width: 132px; display: flex; flex-direction: column; gap: 3px; align-items: flex-start; padding: 13px 14px; border-radius: 14px; background: var(--surface); border: 1px solid var(--line); color: inherit; font: inherit; text-align: left; }
.cx-vendor b { font-size: 13.5px; }
.cx-vendor em { font-style: normal; font-size: 11.5px; color: var(--muted); }
.cx-action { flex-direction: column; gap: 8px; padding-top: 22px; border-top: 1px solid var(--line); }
.cx-action b { font-size: 19px; letter-spacing: -.02em; }
.cx-action p { margin: 0; font-size: 13px; color: var(--muted); }
.cx-action .cx-primary, .cx-action .cx-secondary { flex: 0 0 auto; width: 100%; }
body[data-trade="hospital"][data-flagship="1"] .cx-hero-thumb { aspect-ratio: 16 / 9; border-radius: 10px; }
body[data-trade="kindergarten"][data-flagship="1"] .cx-thumb { border-radius: 20px; }
body[data-trade="school"][data-flagship="1"] .cx-row { padding: 13px 0; }
body[data-trade="school"][data-flagship="1"] .cx-chips { flex-wrap: wrap; }
body[data-trade="gallery"][data-flagship="1"] .cx-grid, body[data-trade="film"][data-flagship="1"] .cx-grid { grid-template-columns: 1fr; }
body[data-trade="gallery"][data-flagship="1"] .cx-thumb { aspect-ratio: 4 / 3; border-radius: 2px; }
body[data-trade="film"][data-flagship="1"] .cx-thumb { aspect-ratio: 16 / 9; border-radius: 4px; }
body[data-trade="portfolio"][data-flagship="1"] .cx-thumb, body[data-trade="agency"][data-flagship="1"] .cx-thumb { border-radius: 2px; }
body[data-trade="marketplace"][data-flagship="1"] .cx-hero-thumb { aspect-ratio: 21 / 9; }
body[data-trade="plants-indoor"][data-flagship="1"] .cx-thumb, body[data-trade="plants-outdoor"][data-flagship="1"] .cx-thumb { border-radius: 26px; }
`
}
