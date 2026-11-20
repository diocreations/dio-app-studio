import { appScreenId, flagshipDocFromSpec, homeSections, type Doc, type DocNode } from './doc'
import { stockImageTag } from './flagshipImages'
import { moneyIn } from './pricing'
import type { AppSpec, MenuItem, VerticalId } from './types'
import { verticalFor } from './verticals'

/**
 * The flagship layer. These five trades are not rendered as a generic website
 * with different colours: each one gets its own front page, content order,
 * navigation emphasis and primary action. The catalogue, cart, booking and
 * dashboard underneath remain the same tested business engine.
 */

export const FLAGSHIP_TRADES = new Set<VerticalId>([
  'restaurant',
  'shop',
  'salon',
  'hotel',
  'professional',
  'cafe',
  'gym',
  'clinic',
  'property',
  'studio',
  'trades',
  'auto',
  'ecommerce',
  'courses',
  'finance',
])

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function price(item: MenuItem, currency?: string): string {
  return item.price > 0 ? moneyIn(item.price, currency) : ''
}

/** A job with no fixed price shows its own "from" line, never a blank quote. */
function rate(item: MenuItem, currency?: string): string {
  if (item.price > 0) return moneyIn(item.price, currency)
  const meta = (item.meta || '').trim()
  return /^(from|fee|quoted|free|by referral)/i.test(meta) ? meta : 'On request'
}

type Entry = { item: MenuItem; key: string; section: string; sectionIndex: number }

function entries(spec: AppSpec): Entry[] {
  return spec.menu.flatMap((section, sectionIndex) =>
    section.items.map((item, itemIndex) => ({
      item,
      key: `${sectionIndex}-${itemIndex}`,
      section: section.name,
      sectionIndex,
    })),
  )
}

/** Deliberate artwork: decorative geometry, never an initial pretending to be a photo. */
function art(index: number, shape: 'plate' | 'arch' | 'card' | 'room' | 'quiet' = 'card'): string {
  return `<span class="fx-art is-${shape}" style="--fx-i:${index % 6}" aria-hidden="true"><i></i><i></i><i></i></span>`
}

/** Real photography where the trade has a local set, artwork otherwise. */
function still(spec: AppSpec, index: number, shape: 'plate' | 'arch' | 'card' | 'room' | 'quiet' = 'card'): string {
  // Imported businesses get artwork, not this trade's stock photography.
  if (spec.website) return art(index, shape)
  const sizes =
    shape === 'room' ? '100vw' : shape === 'plate' ? '(max-width: 620px) 30vw, 140px' : shape === 'quiet' ? '54px' : '(max-width: 620px) 45vw, 220px'
  const photo = stockImageTag(spec.vertical, index, { sizes })
  return photo
    ? `<span class="fx-art is-${shape} has-photo">${photo}</span>`
    : art(index, shape)
}

function entryPhotoIndex(spec: AppSpec, key: string): number {
  return entries(spec).findIndex((entry) => entry.key === key)
}

/** One resolved identity: the owner's category when they have one, else the
 *  trade's name for itself. Headers, eyebrows and metadata all read this. */
function businessLabel(spec: AppSpec): string {
  return (spec.category || '').trim() || verticalFor(spec.vertical).label
}

/** The trade's sample people: named coaches, clinicians or a staff line must
 *  not reach a customer as if the owner had confirmed them. */
function samplePeople(ctx: FlagshipContext): boolean {
  return Boolean(!ctx.editor && (ctx.spec.sampleContent?.team || ctx.spec.sampleContent?.staff))
}

function hoursLine(spec: AppSpec): string {
  return (spec.hours || '').split('·')[0].trim()
}

function factline(spec: AppSpec): string {
  const parts = [hoursLine(spec), spec.address].filter(Boolean)
  const sample = spec.sampleContent?.contact ? '<span class="fx-sample">Sample details</span>' : ''
  return parts.length ? `<div class="fx-facts">${parts.map((part) => `<span>${esc(part)}</span>`).join('')}${sample}</div>` : ''
}

function restaurantHome(spec: AppSpec): string {
  const all = entries(spec)
  const feature = all[0]
  const sections = spec.menu.slice(0, 4)
  return `<div class="fx-home fx-dine">
    <div class="fx-kicker"><span>${esc(spec.hours ? hoursLine(spec) : 'Kitchen')}</span><span>${esc(spec.address || '')}</span></div>
    <div class="fx-title">
      <span class="fx-eyebrow">${esc(verticalFor(spec.vertical).vocab.catalog)} · ${esc(businessLabel(spec))}</span>
      <h1>${esc(spec.name)}<i>.</i></h1>
      <p>${esc(spec.tagline)}</p>
    </div>
    ${
      sections.length
        ? `<div class="fx-rail" aria-label="Menu sections">${sections
            .map(
              (section, index) =>
                `<button type="button" class="fx-rail-link" data-go="catalog"><span>0${index + 1}</span>${esc(section.name)}</button>`,
            )
            .join('')}</div>`
        : ''
    }
    ${
      feature
        ? `<div class="fx-feature" data-item="${feature.key}" role="button" tabindex="0">
            ${still(spec, 0, 'plate')}
            <div class="fx-feature-copy">
              <span class="fx-eyebrow">From the kitchen</span>
              <b>${esc(feature.item.name)}</b>
              ${feature.item.desc ? `<p>${esc(feature.item.desc)}</p>` : ''}
              <span class="fx-price">${price(feature.item, spec.currency)}</span>
            </div>
          </div>`
        : `<div class="fx-feature is-empty">${art(0, 'plate')}<div class="fx-feature-copy"><span class="fx-eyebrow">The menu</span><b>Being written</b><p>The kitchen has not published its first dishes yet.</p></div></div>`
    }
    <div class="fx-actions">
      <button class="fx-primary" type="button" data-go="catalog">See the menu</button>
      ${spec.features.includes('booking') ? `<button class="fx-secondary" type="button" data-go="book">Reserve</button>` : ''}
    </div>
    ${factline(spec)}
  </div>`
}

function shopHome(spec: AppSpec): string {
  const all = entries(spec)
  const selected = all.slice(0, 4)
  return `<div class="fx-home fx-shop">
    <button class="fx-search" type="button" data-search-open>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16.2 16.2 20.5 20.5"/></svg>
      <span>Search the collection</span><kbd>${all.length}</kbd>
    </button>
    <div class="fx-shop-title">
      <span class="fx-eyebrow">${esc(businessLabel(spec))}</span>
      <h1>${esc(spec.tagline)}</h1>
    </div>
    ${
      spec.menu.length
        ? `<div class="fx-rail" aria-label="Collections">${spec.menu
            .slice(0, 4)
            .map((section, index) => `<button type="button" class="fx-rail-link" data-go="catalog"><span>0${index + 1}</span>${esc(section.name)}</button>`)
            .join('')}</div>`
        : ''
    }
    ${
      selected.length
        ? `<div class="fx-shop-head"><span>New in</span><button type="button" data-go="catalog">All ${all.length} pieces</button></div>
           <div class="fx-products">${selected
             .map(
               (entry, index) => `<div class="fx-product" data-item="${entry.key}" role="button" tabindex="0">
                 ${still(spec, index)}
                 <div class="fx-product-copy"><b>${esc(entry.item.name)}</b><span>${price(entry.item, spec.currency)}</span></div>
               </div>`,
             )
             .join('')}</div>`
        : `<div class="fx-empty">${art(0)}<b>The collection is being prepared.</b><p>Pieces will appear here as the owner publishes them.</p></div>`
    }
    <button class="fx-wide-link" type="button" data-go="catalog">Browse everything <span>→</span></button>
  </div>`
}

function salonHome(spec: AppSpec): string {
  const all = entries(spec)
  const services = all.slice(0, 4)
  const days = ['Today', 'Tomorrow']
  const dates = Array.from({ length: 4 }, (_, index) => {
    if (index < days.length) return { label: days[index], date: dayLabel(index) }
    const date = new Date()
    date.setDate(date.getDate() + index)
    return { label: date.toLocaleDateString('en-US', { weekday: 'short' }), date: String(date.getDate()).padStart(2, '0') }
  })
  return `<div class="fx-home fx-salon">
    <div class="fx-salon-head">
      <span class="fx-eyebrow">${esc(businessLabel(spec))}</span>
      <h1>${esc(spec.tagline)}</h1>
      <p>${esc(spec.name)}${spec.address ? ` · ${esc(spec.address)}` : ''}</p>
    </div>
    <div class="fx-dates" aria-label="Choose a day">
      ${dates.map((day, index) => `<button type="button" data-go="book" class="${index === 0 ? 'on' : ''}"><span>${day.label}</span><b>${day.date}</b></button>`).join('')}
    </div>
    <div class="fx-salon-title"><span>Choose a treatment</span><button type="button" data-go="catalog">All services</button></div>
    ${
      services.length
        ? `<div class="fx-services">${services
            .map(
              (entry, index) => `<div class="fx-service" data-item="${entry.key}" role="button" tabindex="0">
                ${still(spec, index, 'quiet')}
                <div><b>${esc(entry.item.name)}</b><span>${esc(entry.item.meta || entry.item.desc)}</span></div>
                <div class="fx-service-tail"><b>${price(entry.item, spec.currency)}</b><span>${esc(entry.section)}</span></div>
              </div>`,
            )
            .join('')}</div>`
        : `<div class="fx-empty">${art(0, 'quiet')}<b>Services are being added.</b><p>The owner can publish treatments from the dashboard.</p></div>`
    }
    ${spec.staff?.length ? `<div class="fx-staff"><span>With</span>${spec.staff.slice(0, 4).map((name) => `<b>${esc(name)}</b>`).join('')}</div>` : ''}
    <div class="fx-sticky"><button type="button" data-go="book">Book an appointment <span>→</span></button></div>
  </div>`
}

function hotelHome(spec: AppSpec): string {
  const rooms = entries(spec).slice(0, 3)
  return `<div class="fx-home fx-hotel">
    <div class="fx-hotel-image">${still(spec, 6, 'room')}<span class="fx-eyebrow">${esc(spec.address || verticalFor(spec.vertical).label)}</span>${rooms[0] ? `<div class="fx-stay-tag"><span>${esc(rooms[0].section)}</span><b>${esc(rooms[0].item.name)}</b><em>${price(rooms[0].item, spec.currency)}${rooms[0].item.meta ? ` · ${esc(rooms[0].item.meta)}` : ''}</em></div>` : ''}</div>
    <div class="fx-hotel-title"><span class="fx-eyebrow">Stay</span><h1>${esc(spec.name)}</h1><p>${esc(spec.tagline)}</p></div>
    <div class="fx-stay-card">
      <div class="fx-stay-dates"><label>Arrive<input type="date" aria-label="Arrival date" /></label><span></span><label>Leave<input type="date" aria-label="Departure date" /></label></div>
      <button type="button" data-go="catalog">View rooms <span>→</span></button>
    </div>
    <div class="fx-rooms-head"><span>Rooms</span><button type="button" data-go="catalog">All rooms</button></div>
    ${
      rooms.length
        ? `<div class="fx-room-stack">${rooms
            .map(
              (entry, index) => `<div class="fx-room" data-item="${entry.key}" role="button" tabindex="0">
                ${still(spec, index, 'room')}
                <div class="fx-room-copy"><span class="fx-eyebrow">${esc(entry.section)}</span><b>${esc(entry.item.name)}</b><p>${esc(entry.item.desc)}</p><span class="fx-price">${price(entry.item, spec.currency)}${entry.item.meta ? ` · ${esc(entry.item.meta)}` : ''}</span></div>
              </div>`,
            )
            .join('')}</div>`
        : `<div class="fx-empty">${art(0, 'room')}<b>Rooms are being prepared.</b><p>Availability will appear once the owner publishes rooms.</p></div>`
    }
    ${factline(spec)}
  </div>`
}

function professionalHome(spec: AppSpec): string {
  const all = entries(spec)
  return `<div class="fx-home fx-pro">
    <div class="fx-pro-head">
      <span class="fx-eyebrow">${esc(businessLabel(spec))}</span>
      <h1>${esc(spec.name)}</h1>
      <p>${esc(spec.tagline)}</p>
    </div>
    <div class="fx-pro-rule"></div>
    <figure class="fx-pro-photo">${stockImageTag('professional', 0, { sizes: '100vw' })}</figure>
    <div class="fx-pro-intro"><span>How we can help</span><p>${esc(spec.story)}</p></div>
    ${
      all.length
        ? `<div class="fx-pro-index">${all
            .slice(0, 5)
            .map(
              (entry, index) => `<div class="fx-pro-row" data-item="${entry.key}" role="button" tabindex="0">
                <span class="fx-pro-num">${String(index + 1).padStart(2, '0')}</span>
                <div><b>${esc(entry.item.name)}</b><span>${esc(entry.item.desc)}</span></div>
                <span class="fx-pro-price">${price(entry.item, spec.currency)}</span>
              </div>`,
            )
            .join('')}</div>`
        : `<div class="fx-empty"><b>Services are being added.</b><p>The owner can publish services from the dashboard.</p></div>`
    }
    <div class="fx-pro-actions">
      <button class="fx-primary" type="button" data-go="${spec.features.includes('booking') ? 'book' : 'quote'}">${spec.features.includes('booking') ? 'Book a consultation' : 'Send an enquiry'}</button>
      ${spec.phone ? `<a class="fx-secondary" href="tel:${esc(spec.phone.replace(/\s/g, ''))}">Call</a>` : ''}
    </div>
    ${factline(spec)}
  </div>`
}

export type FlagshipContext = {
  spec: AppSpec
  token: string
  booking: boolean
  doc: Doc | null
  /** The owner's own view keeps the trade's sample people visible so they
   *  stay replaceable; a customer render never names them. */
  editor?: boolean
}

function targetFor(ctx: FlagshipContext, target: string): string {
  const screen = ctx.doc?.screens.find((entry) => entry.id === target)
  return screen ? appScreenId(screen) : target
}

function photoFor(
  ctx: FlagshipContext,
  media: NonNullable<DocNode['media']>,
  alt: string,
  sizes = '(max-width: 620px) 45vw, 220px',
  priority = false,
): string {
  const position = `${media.focalX ?? 50}% ${media.focalY ?? 50}%`
  const fit = media.fit === 'contain' ? 'contain' : 'cover'
  const base = `/p/${esc(ctx.token)}/media/${esc(media.id)}`
  return `<img class="fx-photo" src="${base}/640.webp" srcset="${base}/320.webp 320w, ${base}/640.webp 640w, ${base}/1280.webp 1280w" sizes="${esc(sizes)}" alt="${esc(media.alt || alt)}" loading="${priority ? 'eager' : 'lazy'}"${priority ? ' fetchpriority="high"' : ''} decoding="async" style="object-fit:${fit};object-position:${position}" />`
}

function visual(
  ctx: FlagshipContext,
  node: DocNode,
  index: number,
  shape: Parameters<typeof art>[1] = 'card',
  useMedia = true,
  photoIndex: number = index,
  itemMedia?: MenuItem['media'],
  priority = false,
  /** The exact image the source site published for this item. */
  itemImage?: MenuItem['image'],
): string {
  if (itemMedia)
    return `<span class="fx-art is-${shape} has-photo">${photoFor(ctx, itemMedia, node.title || '', undefined, priority)}</span>`
  if (itemImage)
    // The source photograph is framed by its art box like every other image:
    // without the shared class it renders at its own pixel size and the box
    // shows one arbitrary slice of it. It fits whole by default, because a
    // tall product shot cropped to a card can show nothing but background.
    return `<span class="fx-art is-${shape} has-photo"><img class="fx-photo is-source" src="${esc(itemImage.url)}" alt="${esc(itemImage.alt || '')}" loading="${priority ? 'eager' : 'lazy'}" decoding="async" referrerpolicy="no-referrer" style="object-fit:${itemImage.fit === 'cover' ? 'cover' : 'contain'};object-position:${itemImage.positionX ?? 50}% ${itemImage.positionY ?? 50}%" onerror="this.style.display='none'" /></span>`
  if (useMedia && node.media)
    return `<span class="fx-art is-${shape} has-photo">${photoFor(ctx, node.media, node.title || '', undefined, priority)}</span>`
  // An imported business never gets this trade's stock photography as if it
  // were its own. Only artwork, unless the owner uploads or the site supplies
  // the exact image above.
  if (ctx.spec.website) return art(index, shape)
  const sizes =
    shape === 'room' ? '100vw' : shape === 'plate' ? '(max-width: 620px) 30vw, 140px' : shape === 'quiet' ? '54px' : '(max-width: 620px) 45vw, 220px'
  const shot = stockImageTag(ctx.spec.vertical, photoIndex, { sizes, priority })
  if (shot) return `<span class="fx-art is-${shape} has-photo">${shot}</span>`
  return art(index, shape)
}

function fxWrap(ctx: FlagshipContext, node: DocNode, html: string): string {
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
  return `<div class="doc-section fx-block${hides ? ` ${hides}` : ''}" data-sec="${node.id}" data-variant="${node.variant || ''}"${style ? ` style="${style}"` : ''}>${html}</div>`
}

const MEDIA_BLOCKS = new Set([
  'dine-feature',
  'shop-products',
  'salon-services',
  'hotel-cover',
  'hotel-rooms',
  'pro-intro',
  'cafe-hero',
  'cafe-menu',
  'gym-hero',
  'gym-trainers',
  'clinic-hero',
  'clinic-doctors',
  'property-hero',
  'property-listings',
  'studio-hero',
  'studio-work',
  'studio-team',
  'trades-hero',
  'trades-jobs',
  'auto-hero',
  'auto-jobs',
  'ecom-hero',
  'ecom-drop',
  'ecom-products',
  'courses-hero',
  'courses-list',
  'finance-hero',
  'finance-advisers',
])

/** Four day chips used by café reservations and clinic appointments. */
function nextDays(count = 4): { label: string; date: string }[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date()
    date.setDate(date.getDate() + index)
    return {
      label: index === 0 ? 'Today' : index === 1 ? 'Tomorrow' : date.toLocaleDateString('en-US', { weekday: 'short' }),
      date: String(date.getDate()).padStart(2, '0'),
    }
  })
}

function dayRow(count = 4): string {
  return `<div class="fx-dayrow">${nextDays(count)
    .map(
      (day, index) =>
        `<button type="button" data-go="book" class="${index === 0 ? 'on' : ''}"><span>${day.label}</span><b>${day.date}</b></button>`,
    )
    .join('')}</div>`
}

function flagshipBody(ctx: FlagshipContext, node: DocNode): string {
  const { spec } = ctx
  const all = entries(spec)
  const first = all[0]
  const heading = node.title || ''
  const words = node.text || ''
  switch (node.variant) {
    case 'dine-title':
      return `<div class="fx-kicker"><span>${esc(spec.hours ? hoursLine(spec) : 'Kitchen')}</span><span>${esc(spec.address || '')}</span></div>
        <div class="fx-title">
          <span class="fx-eyebrow">${esc(verticalFor(spec.vertical).vocab.catalog)} · ${esc(businessLabel(spec))}</span>
          <h1>${esc(heading || spec.name)}<i>.</i></h1>
          <p>${esc(words || spec.tagline)}</p>
        </div>`
    case 'dine-feature': {
      // The featured dish follows its catalogue reference. A component that
      // named a dish which no longer exists keeps its own words instead of
      // quietly featuring whatever now happens to sit first in the menu.
      const bound = node.itemRef ? all.find((entry) => entry.item.id === node.itemRef) : undefined
      const feature = bound ?? (node.itemRef ? undefined : first)
      const label = heading || feature?.item.name || 'The menu'
      // A dish without a description keeps none, rather than borrowing a line
      // the kitchen never wrote.
      const description = words || feature?.item.desc || ''
      return `<div class="fx-feature${feature ? '' : ' is-empty'}"${feature ? ` data-item="${feature.key}" role="button" tabindex="0"` : ''}>
        ${visual(ctx, node, 0, 'plate', true, 0, feature?.item.media, false, feature?.item.image)}
        <div class="fx-feature-copy">
          <span class="fx-eyebrow">From the kitchen</span>
          <b>${esc(label)}</b>
          ${description ? `<p>${esc(description)}</p>` : ''}
          ${feature ? `<span class="fx-price">${price(feature.item, spec.currency)}</span>` : ''}
        </div>
      </div>`
    }
    case 'dine-actions': {
      const action = node.cta || { label: heading || 'See the menu', screen: 'scr_catalog' }
      return `<div class="fx-actions">
        <button class="fx-primary" type="button" data-go="${esc(targetFor(ctx, action.screen))}">${esc(action.label)}</button>
        ${ctx.booking ? `<button class="fx-secondary" type="button" data-go="book">Reserve</button>` : ''}
      </div>`
    }
    case 'dine-facts': {
      // Nothing worth saying is better than the single word "Kitchen".
      const facts = [heading || hoursLine(spec), words || spec.address].filter(Boolean)
      return facts.length
        ? `<div class="fx-facts">${facts.map((fact) => `<span>${esc(fact)}</span>`).join('')}</div>`
        : ''
    }
    case 'dine-note':
      return `<div class="fx-note"><span class="fx-rule"></span><span>${esc(words || 'Seasonal · cooked to order')}</span></div>`
    case 'shop-search':
      return `<button class="fx-search" type="button" data-search-open>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16.2 16.2 20.5 20.5"/></svg>
        <span>${esc(heading || 'Search the collection')}</span><kbd>${all.length}</kbd>
      </button>`
    case 'shop-title':
      return `<div class="fx-shop-title"><span class="fx-eyebrow">${esc(businessLabel(spec))}</span><h1>${esc(heading || spec.tagline)}</h1>${words ? `<p class="fx-block-note">${esc(words)}</p>` : ''}</div>`
    case 'shop-products': {
      const selected = all.slice(0, 4)
      return `${heading ? `<div class="fx-shop-head"><span>${esc(heading)}</span><button type="button" data-go="catalog">All ${all.length} pieces</button></div>` : ''}
        ${words ? `<p class="fx-block-note">${esc(words)}</p>` : ''}
        ${selected.length
          ? `<div class="fx-products">${selected
              .map(
                (entry, index) => `<div class="fx-product" data-item="${entry.key}" role="button" tabindex="0">
                  ${visual(ctx, node, index, 'card', index === 0, entryPhotoIndex(spec, entry.key), entry.item.media, false, entry.item.image)}
                  <div class="fx-product-copy"><b>${esc(entry.item.name)}</b><span>${price(entry.item, spec.currency)}</span></div>
                </div>`,
              )
              .join('')}</div>`
          : `<div class="fx-empty"><b>The collection is being prepared.</b><p>Pieces will appear here as the owner publishes them.</p></div>`}`
    }
    case 'shop-all': {
      const action = node.cta || { label: heading || 'Browse everything', screen: 'scr_catalog' }
      return `<button class="fx-wide-link" type="button" data-go="${esc(targetFor(ctx, action.screen))}">${esc(action.label)} <span>→</span></button>`
    }
    case 'salon-title':
      return `<div class="fx-salon-head">
        <span class="fx-eyebrow">${esc(businessLabel(spec))}</span>
        <h1>${esc(heading || spec.tagline)}</h1>
        <p>${esc(words || [spec.name, spec.address].filter(Boolean).join(' · '))}</p>
      </div>`
    case 'salon-dates': {
      const dates = Array.from({ length: 4 }, (_, index) => {
        const date = new Date()
        date.setDate(date.getDate() + index)
        return {
          label: index === 0 ? 'Today' : index === 1 ? 'Tomorrow' : date.toLocaleDateString('en-US', { weekday: 'short' }),
          date: String(date.getDate()).padStart(2, '0'),
        }
      })
      return `${heading ? `<div class="fx-mini-label">${esc(heading)}</div>` : ''}<div class="fx-dates" aria-label="Choose a day">
        ${dates.map((day, index) => `<button type="button" data-go="book" class="${index === 0 ? 'on' : ''}"><span>${day.label}</span><b>${day.date}</b></button>`).join('')}
      </div>`
    }
    case 'salon-services': {
      const services = all.slice(0, 4)
      return `${heading ? `<div class="fx-salon-title"><span>${esc(heading)}</span><button type="button" data-go="catalog">All services</button></div>` : ''}
        ${services.length
          ? `<div class="fx-services">${services
              .map(
                (entry, index) => `<div class="fx-service" data-item="${entry.key}" role="button" tabindex="0">
                  ${visual(ctx, node, index, 'quiet', index === 0, entryPhotoIndex(spec, entry.key), entry.item.media, false, entry.item.image)}
                  <div><b>${esc(entry.item.name)}</b><span>${esc(entry.item.meta || entry.item.desc)}</span></div>
                  <div class="fx-service-tail"><b>${price(entry.item, spec.currency)}</b><span>${esc(entry.section)}</span></div>
                </div>`,
              )
              .join('')}</div>`
          : `<div class="fx-empty"><b>Services are being added.</b><p>The owner can publish treatments from the dashboard.</p></div>`}`
    }
    case 'salon-staff':
      return `<div class="fx-staff"><span>With</span><b>${esc(words.replace('With ', '') || spec.staff?.slice(0, 4).join(', ') || 'the team')}</b></div>`
    case 'salon-action': {
      const action = node.cta || { label: heading || 'Book an appointment', screen: 'scr_book' }
      return `<div class="fx-sticky"><button type="button" data-go="${esc(targetFor(ctx, action.screen))}">${esc(action.label)} <span>→</span></button></div>`
    }
    case 'hotel-cover': {
      const room = all[0]
      return `<div class="fx-hotel-image">
        ${visual(ctx, node, 6, 'room', true, 6, room?.item.media, true)}
        <span class="fx-eyebrow">${esc(spec.address || verticalFor(spec.vertical).label)}</span>
        ${room ? `<div class="fx-stay-tag"><span>${esc(room.section)}</span><b>${esc(room.item.name)}</b><em>${price(room.item, spec.currency)}${room.item.meta ? ` · ${esc(room.item.meta)}` : ''}</em></div>` : ''}
      </div>
      <div class="fx-hotel-title"><span class="fx-eyebrow">Stay</span><h1>${esc(heading || spec.name)}</h1><p>${esc(words || spec.tagline)}</p></div>`
    }
    case 'hotel-stay':
      return `<div class="fx-stay-card">
        ${words ? `<p class="fx-block-note">${esc(words)}</p>` : ''}
        <div class="fx-stay-dates"><label>Arrive<input type="date" aria-label="Arrival date" /></label><span></span><label>Leave<input type="date" aria-label="Departure date" /></label></div>
        <button type="button" data-go="catalog">${esc(heading || 'View rooms')} <span>→</span></button>
      </div>`
    case 'hotel-rooms': {
      const rooms = all.slice(0, 3)
      return `${heading ? `<div class="fx-rooms-head"><span>${esc(heading)}</span><button type="button" data-go="catalog">All rooms</button></div>` : ''}
        ${rooms.length
          ? `<div class="fx-room-stack">${rooms
              .map(
                (entry, index) => `<div class="fx-room" data-item="${entry.key}" role="button" tabindex="0">
                  ${visual(ctx, node, index, 'room', index === 0, entryPhotoIndex(spec, entry.key), entry.item.media, index === 0)}
                  <div class="fx-room-copy"><span class="fx-eyebrow">${esc(entry.section)}</span><b>${esc(entry.item.name)}</b><p>${esc(entry.item.desc)}</p><span class="fx-price">${price(entry.item, spec.currency)}${entry.item.meta ? ` · ${esc(entry.item.meta)}` : ''}</span></div>
                </div>`,
              )
              .join('')}</div>`
          : `<div class="fx-empty"><b>Rooms are being prepared.</b><p>Availability will appear once the owner publishes rooms.</p></div>`}`
    }
    case 'hotel-facts':
    case 'pro-facts':
      return `<div class="fx-facts"><span>${esc(heading || hoursLine(spec) || 'Hours')}</span><span>${esc(words || spec.address || '')}</span></div>`
    case 'pro-title':
      return `<div class="fx-pro-head"><span class="fx-eyebrow">${esc(businessLabel(spec))}</span><h1>${esc(heading || spec.name)}</h1><p>${esc(words || spec.tagline)}</p></div>`
    case 'pro-intro':
      return `<div class="fx-pro-rule"></div>
        <figure class="fx-pro-photo">${node.media ? photoFor(ctx, node.media, heading) : stockImageTag('professional', 0, { sizes: '100vw' })}</figure>
        <div class="fx-pro-intro"><span>${esc(heading || 'How we can help')}</span><p>${esc(words || spec.story)}</p></div>`
    case 'pro-team': {
      const team = spec.team?.slice(0, 2) ?? []
      if (!team.length) return ''
      return `<div class="fx-pro-team-head"><span>${esc(heading || "The people you'll work with")}</span></div>
        <div class="fx-pro-people">${team
          .map(
            (person, index) => `<article class="fx-pro-person">
              <figure class="fx-pro-portrait">${stockImageTag('professional', 2 + index, { sizes: '(max-width: 620px) 42vw, 200px' })}</figure>
              <b>${esc(person.name)}</b><span>${esc(person.role)}${person.credential ? ` · ${esc(person.credential)}` : ''}</span>
            </article>`,
          )
          .join('')}</div>`
    }
    case 'pro-index':
      return `${heading ? `<div class="fx-mini-label">${esc(heading)}</div>` : ''}
        ${all.length
          ? `<div class="fx-pro-index">${all
              .slice(0, 5)
              .map(
                (entry, index) => `<div class="fx-pro-row${entry.item.media ? ' has-photo' : ''}" data-item="${entry.key}" role="button" tabindex="0">
                  ${entry.item.media ? `<span class="fx-pro-thumb">${photoFor(ctx, entry.item.media, entry.item.name)}</span>` : `<span class="fx-pro-num">${String(index + 1).padStart(2, '0')}</span>`}
                  <div><b>${esc(entry.item.name)}</b><span>${esc(entry.item.desc)}</span></div>
                  <span class="fx-pro-price">${price(entry.item, spec.currency)}</span>
                </div>`,
              )
              .join('')}</div>`
          : `<div class="fx-empty"><b>Services are being added.</b><p>The owner can publish services from the dashboard.</p></div>`}`
    case 'offers':
      return `${heading ? `<div class="fx-mini-label">${esc(heading)}</div>` : ''}
        <div class="fx-offer-list">${spec.offers
          .slice(0, 2)
          .map(
            (offer) => `<div class="fx-offer"><b>${esc(offer.title)}</b><span>${esc(offer.body)}</span></div>`,
          )
          .join('')}</div>`
    case 'pro-actions': {
      const action = node.cta || {
        label: spec.features.includes('booking') ? 'Book a consultation' : 'Send an enquiry',
        screen: spec.features.includes('booking') ? 'scr_book' : 'scr_quote',
      }
      return `<div class="fx-pro-actions">
        <button class="fx-primary" type="button" data-go="${esc(targetFor(ctx, action.screen))}">${esc(action.label)}</button>
        ${spec.phone ? `<a class="fx-secondary" href="tel:${esc(spec.phone.replace(/\s/g, ''))}">Call</a>` : ''}
      </div>`
    }
    case 'cafe-hero':
      return `<div class="fx-cafe-head">
        <div class="fx-cafe-meta"><span>${esc(spec.address || businessLabel(spec))}</span>${spec.sampleContent?.contact ? '<span class="fx-sample">Sample details</span>' : ''}${hoursLine(spec) ? `<span>${esc(hoursLine(spec))}</span>` : ''}</div>
        <h1>${esc(heading || spec.name)}</h1>
        <p>${esc(words || spec.tagline)}</p>
        <div class="fx-cafe-window">
          ${visual(ctx, node, 2, 'arch', true, 2, first?.item.media, true)}
          <span class="fx-cafe-stamp">Baked<br />here<br /><i>daily</i></span>
        </div>
        <div class="fx-cafe-strip"><span>Coffee</span><span>Bakery</span><span>All day</span></div>
      </div>`
    case 'cafe-menu': {
      const picks = all.slice(0, 4)
      return `<div class="fx-cafe-menu-head"><span>${esc(heading || 'From the counter')}</span><button type="button" data-go="catalog">Full menu</button></div>
        ${spec.menu.length ? `<div class="fx-cafe-cats">${spec.menu.map((section) => `<span>${esc(section.name)}</span>`).join('')}</div>` : ''}
        ${picks.length
          ? `<div class="fx-cafe-menu">${picks
              .map(
                (entry, index) => `<div class="fx-cafe-item" data-item="${entry.key}" role="button" tabindex="0">
                  ${visual(ctx, node, index, 'card', index === 0, entryPhotoIndex(spec, entry.key), entry.item.media)}
                  <div><span>${esc(entry.section)}</span><b>${esc(entry.item.name)}</b><em>${price(entry.item, spec.currency)}</em></div>
                </div>`,
              )
              .join('')}</div>`
          : `<div class="fx-empty"><b>The menu is being written.</b><p>Items will appear as the owner publishes them.</p></div>`}`
    }
    case 'cafe-order': {
      const action = node.cta || { label: 'Start an order', screen: 'scr_catalog' }
      return `<div class="fx-cafe-order">
        <span class="fx-eyebrow">Takeaway</span>
        <b>${esc(heading || 'Takeaway, ready when you are')}</b>
        <p>${esc(words || 'Order ahead and collect at the bar.')}</p>
        <div class="fx-cafe-steps"><span>01 Choose</span><span>02 Pay</span><span>03 Collect</span></div>
        <button type="button" data-go="${esc(targetFor(ctx, action.screen))}">${esc(action.label)} <span>→</span></button>
      </div>`
    }
    case 'cafe-reserve': {
      const action = node.cta || { label: 'Reserve a table', screen: 'scr_book' }
      return `<div class="fx-cafe-reserve">
        <div class="fx-cafe-reserve-head"><span class="fx-eyebrow">Tables</span><b>${esc(heading || 'A table, held for you')}</b><p>${esc(words || 'Walk-ins always welcome.')}</p></div>
        ${dayRow()}
        <div class="fx-cafe-reserve-foot"><span>Parties of 1–8</span><button type="button" data-go="${esc(targetFor(ctx, action.screen))}">${esc(action.label)}</button></div>
      </div>`
    }
    case 'gym-hero':
      return `<div class="fx-gym-hero">
        <div class="fx-gym-meta"><span>${esc(businessLabel(spec))}</span>${hoursLine(spec) ? `<span>${esc(hoursLine(spec))}</span>` : ''}</div>
        <h1>${esc(heading || spec.name)}<span>${esc(words || spec.tagline)}</span></h1>
        <div class="fx-gym-strip">
          ${[0, 1, 3].map((index, position) => visual(ctx, node, index, 'card', position === 0, index, all[position]?.item.media, position === 0)).join('')}
        </div>
        <div class="fx-gym-stats">
          <div><b>${spec.menu[0]?.items.length ?? all.length}</b><span>Memberships</span></div>
          <div><b>${verticalFor(spec.vertical).timetable?.length ?? 0}</b><span>Weekly classes</span></div>
          ${spec.team?.length ? `<div><b>${spec.team.length}</b><span>Coaches</span></div>` : ''}
        </div>
      </div>`
    case 'gym-plans': {
      const plans = all.slice(0, 3)
      return `<div class="fx-gym-head"><span>${esc(heading || 'Memberships')}</span><button type="button" data-go="catalog">All plans</button></div>
        ${plans.length
          ? `<div class="fx-gym-plans">${plans
              .map(
                (entry, index) => `<div class="fx-gym-plan${index === 0 ? ' is-feature' : ''}" data-item="${entry.key}" role="button" tabindex="0">
                  <span class="fx-gym-num">0${index + 1}</span>
                  <div><b>${esc(entry.item.name)}</b><span>${esc(entry.item.desc)}</span></div>
                  <div class="fx-gym-price"><b>${price(entry.item, spec.currency)}</b><span>${esc(entry.item.meta || 'one off')}</span></div>
                </div>`,
              )
              .join('')}</div>`
          : `<div class="fx-empty"><b>Plans are being finalised.</b><p>The owner can publish memberships from the dashboard.</p></div>`}
        ${spec.hours ? `<p class="fx-gym-smallprint">${esc(spec.hours)}</p>` : ''}`
    }
    case 'gym-timetable': {
      const classes = verticalFor(spec.vertical).timetable ?? []
      return `<div class="fx-gym-head"><span>${esc(heading || 'This week')}</span><button type="button" data-go="book">Book a class</button></div>
        ${classes.length
          ? `<div class="fx-gym-sessions">${classes
              .map(
                (session, index) => `<div class="fx-gym-session">
                  <span class="fx-gym-num">0${index + 1}</span>
                  <div><b>${esc(session.name)}</b><span>${esc(session.when)}</span></div>
                  ${samplePeople(ctx) ? '' : `<em>${esc(session.coach)}</em>`}
                  <button type="button" data-go="book" aria-label="Book ${esc(session.name)}">+</button>
                </div>`,
              )
              .join('')}</div>`
          : `<div class="fx-empty"><b>The timetable is being written.</b><p>Classes appear here when published.</p></div>`}`
    }
    case 'gym-trainers': {
      const coaches = spec.team?.slice(0, 3) ?? []
      if (!coaches.length) return ''
      const portraits = [2, 5, 6]
      return `<div class="fx-gym-head"><span>${esc(heading || 'Your coaches')}</span><span class="fx-gym-count">${coaches.length}</span></div>
        <div class="fx-gym-coaches">${coaches
          .map(
            (person, index) => `<article class="fx-gym-coach">
              <figure>${stockImageTag('gym', portraits[index] ?? 2, { sizes: '(max-width: 620px) 30vw, 140px', className: 'fx-photo' })}</figure>
              <b>${esc(person.name)}</b><span>${esc(person.role)}</span><em>${esc(person.credential || '')}</em>
            </article>`,
          )
          .join('')}</div>`
    }
    case 'gym-join': {
      const action = node.cta || { label: 'Ask about membership', screen: 'scr_quote' }
      return `<div class="fx-gym-join">
        <span class="fx-eyebrow">Start here</span>
        <b>${esc(heading || 'Not sure where to start?')}</b>
        <p>${esc(words || 'Tell us your goal and we will suggest the right plan.')}</p>
        <button type="button" data-go="${esc(targetFor(ctx, action.screen))}">${esc(action.label)} <span>→</span></button>
        ${spec.phone ? `<a href="tel:${esc(spec.phone.replace(/\s/g, ''))}">Or call ${esc(spec.phone)}</a>` : ''}
      </div>`
    }
    case 'clinic-hero':
      return `<div class="fx-clinic-hero">
        <div class="fx-clinic-top"><span class="fx-clinic-badge">${esc(businessLabel(spec))}</span>${hoursLine(spec) ? `<span>${esc(hoursLine(spec))}</span>` : ''}</div>
        <h1>${esc(heading || spec.name)}</h1>
        <p>${esc(words || spec.tagline)}</p>
        <div class="fx-clinic-photo">${visual(ctx, node, 4, 'room', true, 4, first?.item.media, true)}<span class="fx-clinic-addr">${esc(spec.address || '')}</span></div>
        <div class="fx-clinic-trust"><span>Clear pricing</span><span>Appointments online</span></div>
      </div>`
    case 'clinic-specialities':
      return `<div class="fx-clinic-head"><span>${esc(heading || 'Specialities')}</span><button type="button" data-go="catalog">All treatments</button></div>
        ${spec.menu.length
          ? `<div class="fx-clinic-specs">${spec.menu
              .map(
                (section, index) => `<button type="button" class="fx-clinic-spec" data-go="catalog">
                  <span class="fx-clinic-num">0${index + 1}</span>
                  <b>${esc(section.name)}</b>
                  <em>${section.items.length} ${section.items.length === 1 ? 'treatment' : 'treatments'}</em>
                  <span class="fx-clinic-go">→</span>
                </button>`,
              )
              .join('')}</div>`
          : `<div class="fx-empty"><b>Treatments are being added.</b><p>The owner can publish services from the dashboard.</p></div>`}`
    case 'clinic-doctors': {
      const doctors = spec.team?.slice(0, 3) ?? []
      if (!doctors.length || samplePeople(ctx)) return ''
      const portraits = [2, 5, 6]
      return `<div class="fx-clinic-head"><span>${esc(heading || 'The clinical team')}</span><span class="fx-clinic-count">${doctors.length}</span></div>
        <div class="fx-clinic-doctors">${doctors
          .map(
            (person, index) => `<article class="fx-clinic-doctor">
              <figure>${stockImageTag('clinic', portraits[index] ?? 2, { sizes: '78px', className: 'fx-photo' })}</figure>
              <div><b>${esc(person.name)}</b><span>${esc(person.role)}</span><em>${esc(person.credential || '')}</em></div>
            </article>`,
          )
          .join('')}</div>`
    }
    case 'clinic-care': {
      const steps = [
        ['Choose a treatment', 'Prices and appointment lengths are shown before you book.'],
        ['Pick a time', 'Morning, afternoon and evening slots, subject to availability.'],
        ['Meet your clinician', 'We confirm by phone or email before the appointment.'],
      ]
      return `<div class="fx-clinic-head"><span>${esc(heading || 'How a visit works')}</span></div>
        ${words ? `<p class="fx-block-note">${esc(words)}</p>` : ''}
        <ol class="fx-clinic-steps">${steps
          .map(([title, text], index) => `<li><span>0${index + 1}</span><div><b>${esc(title)}</b><p>${esc(text)}</p></div></li>`)
          .join('')}</ol>`
    }
    case 'clinic-privacy':
      return `<div class="fx-clinic-privacy">
        <span class="fx-eyebrow">Privacy</span>
        <b>${esc(heading || 'Your information stays yours')}</b>
        <p>${esc(words || 'We only ask for what we need to arrange your appointment.')}</p>
        <ul><li>Name and contact details only</li><li>No medical history in this form</li><li>Clinical notes kept in the practice record</li></ul>
      </div>`
    case 'clinic-appointments': {
      const action = node.cta || { label: 'Book an appointment', screen: 'scr_book' }
      return `<div class="fx-clinic-book">
        <div><span class="fx-eyebrow">Appointments</span><b>${esc(heading || 'Book an appointment')}</b><p>${esc(words || 'Choose a treatment and a time that suits you.')}</p></div>
        ${dayRow(3)}
        <div class="fx-clinic-book-foot"><button type="button" data-go="${esc(targetFor(ctx, action.screen))}">${esc(action.label)}</button>${spec.phone ? `<a href="tel:${esc(spec.phone.replace(/\s/g, ''))}">Call</a>` : ''}</div>
      </div>`
    }
    case 'property-hero':
      return `<div class="fx-prop-hero">
        <div class="fx-prop-meta"><span>Sales &amp; lettings</span><span>${esc(spec.address || '')}</span></div>
        <h1>${esc(heading || spec.name)}</h1>
        <p>${esc(words || spec.tagline)}</p>
        <button class="fx-prop-search" type="button" data-search-open>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16.2 16.2 20.5 20.5"/></svg>
          <span>Search by area, price or bedrooms</span><kbd>${all.length}</kbd>
        </button>
        <figure class="fx-prop-cover">${visual(ctx, node, 0, 'room', true, 0, first?.item.media, true)}<figcaption><span>Just listed</span><b>${esc(first?.item.name || 'New homes')}</b><em>${first ? price(first.item, spec.currency) : ''}</em></figcaption></figure>
      </div>`
    case 'property-search':
      return `<div class="fx-prop-filters">
        <div class="fx-prop-filter-head"><span>${esc(heading || 'Search homes')}</span><button type="button" data-search-open>Search</button></div>
        <div class="fx-prop-chips">
          <button type="button" data-property-filter="all">All homes</button>
          ${spec.menu.map((section, index) => `<button type="button" data-property-filter="${index}">${esc(section.name)}</button>`).join('')}
        </div>
        <p>Filter the live listings by collection, then open a home for the full gallery.</p>
      </div>`
    case 'property-listings': {
      const homes = all.slice(0, 4)
      return `<div class="fx-prop-head"><span>${esc(heading || 'On the market')}</span><button type="button" data-go="catalog">All ${all.length} homes</button></div>
        ${homes.length
          ? `<div class="fx-prop-rail">${homes
              .map(
                (entry, index) => `<article class="fx-prop-card" data-item="${entry.key}" role="button" tabindex="0">
                  ${visual(ctx, node, index + 1, 'room', index === 0, entryPhotoIndex(spec, entry.key), entry.item.media)}
                  <div class="fx-prop-card-copy"><span>${esc(entry.section)}${entry.item.tag ? ` · ${esc(entry.item.tag)}` : ''}</span><b>${esc(entry.item.name)}</b><em>${esc(entry.item.meta || '')}</em><strong>${price(entry.item, spec.currency)}</strong></div>
                </article>`,
              )
              .join('')}</div>`
          : `<div class="fx-empty"><b>No homes are published yet.</b><p>Listings appear here as the owner adds them.</p></div>`}`
    }
    case 'property-viewing': {
      const action = node.cta || { label: 'Book a viewing', screen: 'scr_book' }
      return `<div class="fx-prop-viewing">
        <div><span class="fx-eyebrow">Viewings</span><b>${esc(heading || 'See it for yourself')}</b><p>${esc(words || 'Viewings run Monday to Saturday, at the property.')}</p></div>
        ${dayRow(3)}
        <button type="button" data-go="${esc(targetFor(ctx, action.screen))}">${esc(action.label)} <span>→</span></button>
      </div>`
    }
    case 'property-enquire': {
      const action = node.cta || { label: 'Request a valuation', screen: 'scr_quote' }
      return `<div class="fx-prop-enquire">
        <span class="fx-eyebrow">Selling</span>
        <b>${esc(heading || 'Thinking of selling?')}</b>
        <p>${esc(words || 'A measured valuation, with the numbers explained in person.')}</p>
        <div><button type="button" data-go="${esc(targetFor(ctx, action.screen))}">${esc(action.label)}</button>${spec.phone ? `<a href="tel:${esc(spec.phone.replace(/\s/g, ''))}">Call the office</a>` : ''}</div>
      </div>`
    }
    case 'studio-hero':
      return `<div class="fx-studio-hero">
        <div class="fx-studio-meta"><span>Photography studio</span><span>${esc(spec.address || '')}</span></div>
        <h1>${esc(heading || spec.name)}<span>${esc(words || spec.tagline)}</span></h1>
        <div class="fx-studio-grid">
          ${[0, 1, 2].map((index, position) => visual(ctx, node, index, 'card', position === 0, index, all[position]?.item.media, position === 0)).join('')}
          <div class="fx-studio-grid-copy"><span>Selected commissions</span><b>${all.length} packages</b></div>
        </div>
      </div>`
    case 'studio-work': {
      const projects = spec.menu.slice(0, 3)
      return `<div class="fx-studio-head"><span>${esc(heading || 'Selected work')}</span><button type="button" data-go="catalog">All services</button></div>
        ${projects.length
          ? `<div class="fx-studio-work">${projects
              .map(
                (section, index) => `<article class="fx-studio-project">
                  ${visual(ctx, node, index, 'card', index === 0, index, section.items[0]?.media, index === 0)}
                  <div><span>0${index + 1} / ${esc(section.name)}</span><b>${esc(section.items[0]?.name || section.name)}</b></div>
                </article>`,
              )
              .join('')}</div>`
          : `<div class="fx-empty"><b>Work is being added.</b><p>Projects will appear as the studio publishes them.</p></div>`}`
    }
    case 'studio-services':
      return `<div class="fx-studio-head"><span>${esc(heading || 'Ways to work together')}</span><span>${all.length}</span></div>
        <div class="fx-studio-services">${all
          .slice(0, 6)
          .map(
            (entry, index) => `<div class="fx-studio-service" data-item="${entry.key}" role="button" tabindex="0">
              <span>${String(index + 1).padStart(2, '0')}</span>
              <div><b>${esc(entry.item.name)}</b><em>${esc(entry.item.desc)}</em></div>
              <strong>${price(entry.item, spec.currency)}</strong>
            </div>`,
          )
          .join('')}</div>`
    case 'studio-team': {
      const team = spec.team?.slice(0, 2) ?? []
      if (!team.length) return ''
      return `<div class="fx-studio-head"><span>${esc(heading || 'The studio')}</span></div>
        <div class="fx-studio-team">${team
          .map(
            (person, index) => `<article class="fx-studio-person">
              <figure>${stockImageTag('studio', index + 1, { sizes: '(max-width: 620px) 42vw, 200px', className: 'fx-photo' })}</figure>
              <div><b>${esc(person.name)}</b><span>${esc(person.role)}</span><em>${esc(person.credential || '')}</em></div>
            </article>`,
          )
          .join('')}</div>`
    }
    case 'studio-book': {
      const action = node.cta || { label: 'Request a shoot brief', screen: 'scr_quote' }
      return `<div class="fx-studio-book">
        <span class="fx-eyebrow">Commissions</span>
        <b>${esc(heading || 'Start a project')}</b>
        <p>${esc(words || 'Tell us what you are making. We will reply with availability and a clear quote.')}</p>
        <div>
          <button type="button" data-go="${esc(targetFor(ctx, action.screen))}">${esc(action.label)} <span>→</span></button>
          ${ctx.booking ? `<button type="button" class="is-quiet" data-go="book">Book a call</button>` : ''}
        </div>
      </div>`
    }
    case 'trades-hero': {
      const phone = spec.phone ? spec.phone.replace(/\s/g, '') : ''
      return `<div class="fx-trade-hero">
        <figure class="fx-trade-cover">
          ${visual(ctx, node, 0, 'room', true, 0)}
          <figcaption><span>24/7 emergency</span>${phone ? `<a href="tel:${esc(phone)}">Call ${esc(spec.phone)}</a>` : ''}</figcaption>
        </figure>
        <div class="fx-trade-head">
          <span class="fx-eyebrow">${esc(businessLabel(spec))}</span>
          <h1>${esc(heading || spec.name)}</h1>
          <p>${esc(words || spec.tagline)}</p>
        </div>
        <div class="fx-trade-strip">${hoursLine(spec) ? `<span>${esc(hoursLine(spec))}</span>` : ''}<span>${esc(spec.address || '')}</span></div>
      </div>`
    }
    case 'trades-jobs': {
      const jobs = all.slice(0, 5)
      return `<div class="fx-trade-row-head"><span>${esc(heading || 'What we fix')}</span><button type="button" data-go="catalog">All services</button></div>
        ${jobs.length
          ? `<div class="fx-trade-jobs">${jobs
              .map(
                (entry, index) => `<div class="fx-trade-job" data-item="${entry.key}" role="button" tabindex="0">
                  <span class="fx-trade-num">${String(index + 1).padStart(2, '0')}</span>
                  <div><b>${esc(entry.item.name)}</b><span>${esc(entry.item.desc)}</span></div>
                  <em>${esc(rate(entry.item, spec.currency))}</em>
                </div>`,
              )
              .join('')}</div>`
          : `<div class="fx-empty"><b>Services are being added.</b><p>The owner can publish them from the dashboard.</p></div>`}`
    }
    case 'trades-proof':
      return `<div class="fx-trade-proof">
        <span class="fx-eyebrow">Our promise</span>
        <b>${esc(heading || 'The promise')}</b>
        ${words ? `<p>${esc(words)}</p>` : ''}
        <ul>
          <li>Written quote before any work</li>
          <li>Twelve-month guarantee on labour</li>
          <li>Public liability insurance</li>
          <li>Floors covered, rubbish removed</li>
        </ul>
      </div>`
    case 'trades-quote': {
      const action = node.cta || { label: 'Request a quote', screen: 'scr_quote' }
      return `<div class="fx-trade-quote">
        <span class="fx-eyebrow">Quote</span>
        <b>${esc(heading || 'Send a photo, get a price')}</b>
        <p>${esc(words || 'Tell us what has gone wrong.')}</p>
        <ol class="fx-trade-steps"><li><span>01</span>Photo</li><li><span>02</span>Fixed price</li><li><span>03</span>Booked in</li></ol>
        <div class="fx-trade-quote-foot">
          <button type="button" data-go="${esc(targetFor(ctx, action.screen))}">${esc(action.label)} <span>→</span></button>
          ${spec.phone ? `<a href="tel:${esc(spec.phone.replace(/\s/g, ''))}">Call</a>` : ''}
        </div>
      </div>`
    }
    case 'trades-area':
      return `<div class="fx-trade-area">
        <span class="fx-eyebrow">Coverage</span>
        <b>${esc(heading || 'Where we work')}</b>
        <p>${esc(words || spec.address || 'Covering the whole city')}</p>
        <div class="fx-trade-response">
          <div><b>2h</b><span>emergency</span></div>
          <div><b>24h</b><span>quote reply</span></div>
          <div><b>1 wk</b><span>standard visit</span></div>
        </div>
        <div class="fx-trade-shots">
          <figure>${visual(ctx, node, 2, 'card', true, 2, first?.item.media)}</figure>
          <figure>${visual(ctx, node, 5, 'card', false, 5)}</figure>
          <figure>${visual(ctx, node, 3, 'card', false, 3)}</figure>
        </div>
      </div>`
    case 'trades-book': {
      const action = node.cta || { label: 'Book a call-out', screen: 'scr_book' }
      const slots = verticalFor(spec.vertical).vocab.slots.slice(0, 3)
      const target = ctx.booking ? targetFor(ctx, action.screen) : 'catalog'
      return `<div class="fx-trade-book">
        <div class="fx-trade-book-head"><span class="fx-eyebrow">Call-out</span><b>${esc(heading || 'Book a call-out')}</b><p>${esc(words || 'Morning and afternoon visits.')}</p></div>
        ${dayRow(3)}
        <div class="fx-trade-slots">${slots.map((slot) => `<button type="button" data-go="${esc(target)}">${esc(slot)}</button>`).join('')}</div>
        <button class="fx-trade-book-cta" type="button" data-go="${esc(target)}">${esc(action.label)} <span>→</span></button>
      </div>`
    }
    case 'auto-hero':
      return `<div class="fx-auto-hero">
        <div class="fx-auto-top"><span>${esc(businessLabel(spec))}</span>${hoursLine(spec) ? `<span>${esc(hoursLine(spec))}</span>` : ''}</div>
        <h1>${esc(heading || spec.name)}</h1>
        <p>${esc(words || spec.tagline)}</p>
        <div class="fx-auto-plate" aria-hidden="true"><i>GB</i><b>${esc((spec.logo || 'PL').slice(0, 4).toUpperCase())}</b></div>
        <figure class="fx-auto-cover">${visual(ctx, node, 0, 'room', true, 0)}</figure>
        <div class="fx-auto-cta">
          <button type="button" data-go="${ctx.booking ? 'book' : 'catalog'}">${ctx.booking ? 'Book a slot' : 'See the work'}</button>
          ${spec.features.includes('quote') ? `<button type="button" class="is-quiet" data-go="quote">Get a quote</button>` : ''}
        </div>
      </div>`
    case 'auto-vehicle': {
      const types = ['Petrol', 'Diesel', 'Hybrid', 'Electric']
      return `<div class="fx-auto-vehicle">
        <div class="fx-auto-block-head"><span>${esc(heading || 'What we look after')}</span><span class="fx-auto-count">${all.length} jobs</span></div>
        <div class="fx-auto-types">${types.map((type) => `<span>${type}</span>`).join('')}</div>
        <p>${esc(words || 'Cars and light vans.')}</p>
        ${spec.features.includes('quote')
          ? `<button type="button" data-go="${esc(targetFor(ctx, 'scr_quote'))}">Ask about your vehicle</button>`
          : spec.phone
            ? `<a class="fx-auto-ask" href="tel:${esc(spec.phone.replace(/\s/g, ''))}">Ask about your vehicle</a>`
            : ''}
      </div>`
    }
    case 'auto-jobs': {
      const jobs = all.slice(0, 5)
      return `<div class="fx-auto-block-head"><span>${esc(heading || 'Work & prices')}</span><button type="button" data-go="catalog">All work</button></div>
        ${jobs.length
          ? `<div class="fx-auto-jobs">${jobs
              .map(
                (entry) => `<div class="fx-auto-job" data-item="${entry.key}" role="button" tabindex="0">
                  <div><b>${esc(entry.item.name)}</b><span>${esc(entry.item.desc)}</span></div>
                  <em>${esc(entry.item.price > 0 ? entry.item.meta || '' : '')}</em>
                  <strong>${esc(rate(entry.item, spec.currency))}</strong>
                </div>`,
              )
              .join('')}</div>`
          : `<div class="fx-empty"><b>Work is being added.</b><p>The owner can publish jobs from the dashboard.</p></div>`}`
    }
    case 'auto-slots': {
      const action = node.cta || { label: 'Book a slot', screen: 'scr_book' }
      const target = ctx.booking ? targetFor(ctx, action.screen) : 'catalog'
      const slots = verticalFor(spec.vertical).vocab.slots.slice(0, 4)
      return `<div class="fx-auto-slots">
        <div class="fx-auto-slots-head"><span class="fx-eyebrow">Workshop diary</span><b>${esc(heading || 'Next available')}</b><p>${esc(words || '')}</p></div>
        ${dayRow(3)}
        <div class="fx-auto-times">${slots.map((slot, index) => `<button type="button" data-go="${esc(target)}" class="${index === 0 ? 'on' : ''}">${esc(slot)}</button>`).join('')}</div>
        <button class="fx-auto-book" type="button" data-go="${esc(target)}">${esc(action.label)} <span>→</span></button>
      </div>`
    }
    case 'auto-promise':
      return `<div class="fx-auto-promise">
        <span class="fx-eyebrow">Included</span>
        <b>${esc(heading || 'What a service includes')}</b>
        ${words ? `<p>${esc(words)}</p>` : ''}
        <ul>
          <li><span>01</span>Oil and filter change</li>
          <li><span>02</span>Brakes, tyres and suspension checked</li>
          <li><span>03</span>Fluids topped and battery tested</li>
          <li><span>04</span>Written report, old parts kept</li>
        </ul>
        <div class="fx-auto-shots">
          <figure>${visual(ctx, node, 1, 'card', true, 1, first?.item.media)}</figure>
          <figure>${visual(ctx, node, 2, 'card', false, 2)}</figure>
          <figure>${visual(ctx, node, 4, 'card', false, 4)}</figure>
        </div>
      </div>`
    case 'auto-quote': {
      const action = node.cta || { label: 'Get a quote', screen: 'scr_quote' }
      return `<div class="fx-auto-quote">
        <span class="fx-eyebrow">Diagnosis</span>
        <b>${esc(heading || 'Not sure what it needs?')}</b>
        <p>${esc(words || 'Describe the noise, the light or the warning.')}</p>
        ${spec.features.includes('quote')
          ? `<button type="button" data-go="${esc(targetFor(ctx, action.screen))}">${esc(action.label)} <span>→</span></button>`
          : spec.phone
            ? `<a href="tel:${esc(spec.phone.replace(/\s/g, ''))}">Call the workshop</a>`
            : ''}
      </div>`
    }
    case 'ecom-hero':
      return `<div class="fx-ecom-hero">
        <div class="fx-ecom-top"><span>${esc(businessLabel(spec))}</span>${hoursLine(spec) ? `<span>${esc(hoursLine(spec))}</span>` : ''}</div>
        <h1>${esc(heading || spec.name)}<span>${esc(words || spec.tagline)}</span></h1>
        <div class="fx-ecom-collage">${[0, 1, 2, 3].map((index) => `<figure>${visual(ctx, node, index, 'card', index === 0, index)}</figure>`).join('')}</div>
        <div class="fx-ecom-strip"><span>${all.length} pieces</span><span>${esc(spec.offers[0]?.title || '')}</span></div>
      </div>`
    case 'ecom-drop': {
      const picks = all.slice(0, 3)
      return `<div class="fx-ecom-head"><span>${esc(heading || 'New this week')}</span><button type="button" data-go="catalog">All ${all.length}</button></div>
        ${picks.length
          ? `<div class="fx-ecom-rail">${picks
              .map(
                (entry, index) => `<article class="fx-ecom-pick" data-item="${entry.key}" role="button" tabindex="0">
                  <figure>${visual(ctx, node, index, 'card', index === 0, index, entry.item.media)}</figure>
                  <b>${esc(entry.item.name)}</b><span>${price(entry.item, spec.currency)}</span>
                </article>`,
              )
              .join('')}</div>`
          : `<div class="fx-empty"><b>The shelves are being stocked.</b><p>Pieces appear here as the owner publishes them.</p></div>`}`
    }
    case 'ecom-products': {
      const picks = all.slice(0, 4)
      return `<div class="fx-ecom-head"><span>${esc(heading || 'The shelf')}</span><span class="fx-ecom-count">${all.length} pieces</span></div>
        ${picks.length
          ? `<div class="fx-ecom-grid">${picks
              .map(
                (entry, index) => `<article class="fx-ecom-card">
                  <button class="fx-ecom-shot" type="button" data-item="${entry.key}" aria-label="Open ${esc(entry.item.name)}">${visual(ctx, node, index, 'card', index < 2, index, entry.item.media)}</button>
                  <div class="fx-ecom-copy"><b>${esc(entry.item.name)}</b><span>${price(entry.item, spec.currency)}</span>
                  ${spec.features.includes('ordering') && entry.item.price > 0 ? `<button type="button" data-add="${entry.key}" aria-label="Add ${esc(entry.item.name)}">+</button>` : ''}</div>
                </article>`,
              )
              .join('')}</div>`
          : `<div class="fx-empty"><b>The shelves are being stocked.</b><p>Pieces appear here as the owner publishes them.</p></div>`}`
    }
    case 'ecom-delivery': {
      const ways = verticalFor(spec.vertical).vocab.fulfilment
      return `<div class="fx-ecom-delivery">
        <figure class="fx-ecom-delivery-shot">${visual(ctx, node, 4, 'room', true, 4)}</figure>
        <div class="fx-ecom-delivery-copy"><span class="fx-eyebrow">Delivery</span><b>${esc(heading || 'Packed and posted')}</b><p>${esc(words || '')}</p></div>
        <div class="fx-ecom-ways">
          <div><b>${esc(ways[0] || 'Delivery')}</b><span>Tracked, two to three working days</span></div>
          <div><b>${esc(ways[1] || 'Pickup')}</b><span>Ready at the workshop, usually next day</span></div>
        </div>
        ${node.cta ? `<button type="button" data-go="${esc(targetFor(ctx, node.cta.screen))}">${esc(node.cta.label)}</button>` : `<button type="button" data-cart-open>View your ${esc(verticalFor(spec.vertical).vocab.order.toLowerCase())}</button>`}
      </div>`
    }
    case 'ecom-rewards': {
      if (!spec.features.includes('loyalty') || !spec.loyalty) return ''
      const stamps = Array.from({ length: Math.min(spec.loyalty.goal, 6) }, () => '<i></i>').join('')
      return `<div class="fx-ecom-rewards">
        <div class="fx-ecom-rewards-head"><span class="fx-eyebrow">Rewards</span><b>${esc(heading || 'Keep coming back')}</b></div>
        <div class="fx-ecom-stamps">${stamps}</div>
        <p>${esc(spec.loyalty.reward)}</p>
        <span class="fx-ecom-goal">${spec.loyalty.goal} orders</span>
      </div>`
    }
    case 'courses-hero':
      return `<div class="fx-course-hero">
        <div class="fx-course-top"><span>${esc(businessLabel(spec))}</span>${hoursLine(spec) ? `<span>${esc(hoursLine(spec))}</span>` : ''}</div>
        <h1>${esc(heading || spec.name)}<span>${esc(words || spec.tagline)}</span></h1>
        <figure class="fx-course-cover">${visual(ctx, node, 0, 'room', true, 0)}<figcaption>${all.length} courses · lessons on demand</figcaption></figure>
        <div class="fx-course-strip"><span>${all.length} courses</span><span>Project feedback</span><span>Lifetime access</span></div>
        <button class="fx-course-start" type="button" data-go="catalog">Browse the courses <span>→</span></button>
      </div>`
    case 'courses-path': {
      const steps = [
        ['Watch', 'Short lessons, one idea at a time.'],
        ['Build', 'One project per course, using your own work.'],
        ['Review', 'Send it in and get written feedback.'],
      ]
      return `<div class="fx-course-block-head"><span>${esc(heading || 'How a course runs')}</span></div>
        <ol class="fx-course-path">${steps
          .map(
            ([title, text], index) => `<li><span class="fx-course-node">${String(index + 1).padStart(2, '0')}</span><div><b>${esc(title)}</b><p>${esc(text)}</p></div></li>`,
          )
          .join('')}</ol>`
    }
    case 'courses-list': {
      const picks = all.slice(0, 3)
      return `<div class="fx-course-block-head"><span>${esc(heading || 'Courses open now')}</span><button type="button" data-go="catalog">All courses</button></div>
        ${picks.length
          ? `<div class="fx-course-list">${picks
              .map(
                (entry, index) => `<article class="fx-course-card">
                  <figure>${visual(ctx, node, index + 1, 'card', index === 0, index + 1, entry.item.media)}</figure>
                  <div class="fx-course-copy"><span>${esc(entry.section)}</span><b>${esc(entry.item.name)}</b><p>${esc(entry.item.desc)}</p>
                  <div class="fx-course-foot"><strong>${price(entry.item, spec.currency)}</strong><button type="button" data-item="${entry.key}">View course</button></div></div>
                </article>`,
              )
              .join('')}</div>`
          : `<div class="fx-empty"><b>Courses are being written.</b><p>They appear here as the owner publishes them.</p></div>`}`
    }
    case 'courses-included':
      return `<div class="fx-course-included">
        <span class="fx-eyebrow">Included</span>
        <b>${esc(heading || "What's included")}</b>
        <ul><li>Every lesson, on demand</li><li>Templates and worksheets</li><li>One project with written feedback</li><li>Lifetime access and updates</li></ul>
        ${words ? `<p>${esc(words)}</p>` : ''}
      </div>`
    case 'courses-enrol': {
      const action = node.cta || { label: 'Choose a course', screen: 'scr_catalog' }
      return `<div class="fx-course-enrol">
        <span class="fx-eyebrow">Start here</span>
        <b>${esc(heading || 'Start with the free lesson')}</b>
        <p>${esc(words || 'Every course opens with a full lesson before you pay.')}</p>
        <button type="button" data-go="${esc(targetFor(ctx, action.screen))}">${esc(action.label)} <span>→</span></button>
        ${spec.phone ? `<a href="tel:${esc(spec.phone.replace(/\s/g, ''))}">Questions? Call the team</a>` : ''}
      </div>`
    }
    case 'finance-hero':
      return `<div class="fx-fin-hero">
        <div class="fx-fin-top"><span>${esc(businessLabel(spec))}</span>${hoursLine(spec) ? `<span>${esc(hoursLine(spec))}</span>` : ''}</div>
        <h1>${esc(heading || spec.name)}</h1>
        <p>${esc(words || spec.tagline)}</p>
        <figure class="fx-fin-cover">${visual(ctx, node, 0, 'room', true, 0)}</figure>
        <div class="fx-fin-actions">
          <button type="button" data-go="${ctx.booking ? 'book' : 'quote'}">${ctx.booking ? 'Book a first meeting' : 'Request a review'}</button>
          ${spec.phone ? `<a href="tel:${esc(spec.phone.replace(/\s/g, ''))}">Call</a>` : ''}
        </div>
      </div>`
    case 'finance-disclosure':
      return `<div class="fx-fin-disclosure">
        <span class="fx-fin-label">Important</span>
        <b>${esc(heading || 'Before you commit')}</b>
        <p>${esc(words || '')}</p>
        <ul>
          <li>Ask for the fees in writing before you commit</li>
          <li>A written recommendation before you commit</li>
          <li>Capital at risk. Investments can fall as well as rise.</li>
        </ul>
      </div>`
    case 'finance-services': {
      const services = all.slice(0, 5)
      return `<div class="fx-fin-block-head"><span>${esc(heading || 'Services & fees')}</span><button type="button" data-go="catalog">All services</button></div>
        ${services.length
          ? `<div class="fx-fin-table">${services
              .map(
                (entry, index) => `<div class="fx-fin-row" data-item="${entry.key}" role="button" tabindex="0">
                  <span class="fx-fin-thumb">${visual(ctx, node, index, 'quiet', index === 0, index, entry.item.media)}</span>
                  <div><b>${esc(entry.item.name)}</b><span>${esc(entry.item.desc)}</span></div>
                  <em>${esc(entry.item.price > 0 ? entry.item.meta || '' : '')}</em>
                  <strong>${esc(rate(entry.item, spec.currency))}</strong>
                </div>`,
              )
              .join('')}</div>`
          : `<div class="fx-empty"><b>Services are being added.</b><p>The owner can publish them from the dashboard.</p></div>`}`
    }
    case 'finance-process': {
      const steps = [
        ['First meeting', 'Thirty minutes to understand what you need and whether advice helps.'],
        ['Written plan', 'Numbers, options and costs, sent before you decide anything.'],
        ['Review', 'One check-in a year, or sooner if something changes.'],
      ]
      return `<div class="fx-fin-block-head"><span>${esc(heading || 'What a review looks like')}</span></div>
        <ol class="fx-fin-process">${steps
          .map(
            ([title, text], index) => `<li><span>${String(index + 1).padStart(2, '0')}</span><div><b>${esc(title)}</b><p>${esc(text)}</p></div></li>`,
          )
          .join('')}</ol>`
    }
    case 'finance-advisers': {
      const advisers = spec.team?.slice(0, 2) ?? []
      if (!advisers.length) return ''
      return `<div class="fx-fin-block-head"><span>${esc(heading || 'Your advisers')}</span></div>
        <div class="fx-fin-advisers">${advisers
          .map(
            (person, index) => `<article class="fx-fin-adviser">
              <figure>${stockImageTag('finance', index + 2, { sizes: '84px', className: 'fx-photo' })}</figure>
              <div><b>${esc(person.name)}</b><span>${esc(person.role)}</span><em>${esc(person.credential || '')}</em></div>
            </article>`,
          )
          .join('')}</div>`
    }
    case 'finance-review': {
      const action = node.cta || { label: 'Book a meeting', screen: 'scr_book' }
      const target = ctx.booking ? targetFor(ctx, action.screen) : spec.features.includes('quote') ? 'quote' : 'catalog'
      return `<div class="fx-fin-review">
        <div><span class="fx-eyebrow">Next step</span><b>${esc(heading || 'Book a first meeting')}</b><p>${esc(words || 'Thirty minutes, no paperwork, no obligation.')}</p></div>
        ${dayRow(3)}
        <div class="fx-fin-review-foot"><button type="button" data-go="${esc(target)}">${esc(action.label)} <span>→</span></button>${spec.features.includes('quote') ? `<button type="button" class="is-quiet" data-go="quote">Send an enquiry</button>` : ''}</div>
      </div>`
    }
    default:
      return ''
  }
}

function tradeClass(spec: AppSpec): string {
  switch (spec.vertical) {
    case 'restaurant':
      return 'fx-dine'
    case 'shop':
      return 'fx-shop'
    case 'salon':
      return 'fx-salon'
    case 'hotel':
      return 'fx-hotel'
    case 'cafe':
      return 'fx-cafe'
    case 'gym':
      return 'fx-gym'
    case 'clinic':
      return 'fx-clinic'
    case 'property':
      return 'fx-property'
    case 'studio':
      return 'fx-studio'
    case 'trades':
      return 'fx-trades'
    case 'auto':
      return 'fx-auto'
    case 'ecommerce':
      return 'fx-ecom'
    case 'courses':
      return 'fx-courses'
    case 'finance':
      return 'fx-finance'
    default:
      return 'fx-pro'
  }
}

function flagshipNode(ctx: FlagshipContext, node: DocNode, standalone = false): string {
  if (node.kind !== 'flagship') return ''
  const body = flagshipBody(ctx, node)
  if (!body) return ''
  // An editorial photo keeps the shape it was published in: the frame takes the
  // file's own ratio, so a 4:3 photograph is not cropped to a 16:10 band.
  const ratio =
    node.media?.width && node.media?.height ? ` style="aspect-ratio:${node.media.width}/${node.media.height}"` : ''
  const attachment =
    node.media && node.variant && !MEDIA_BLOCKS.has(node.variant)
      ? `<figure class="fx-attachment"${ratio}>${photoFor(ctx, node.media, node.title || '')}</figure>`
      : ''
  const wrapped = fxWrap(ctx, node, `${attachment}${body}`)
  return standalone ? `<div class="fx-home ${tradeClass(ctx.spec)} is-single">${wrapped}</div>` : wrapped
}

/** A component moved to another screen keeps its flagship presentation. */
export function flagshipSection(ctx: FlagshipContext, node: DocNode): string {
  return flagshipNode(ctx, node, true)
}

/**
 * The flagship home is the saved document, in document order. The old static
 * compositions remain only as a fallback for direct renderer calls without a
 * document; the application route always supplies one, so two editing models
 * cannot drift apart in production.
 */
export function flagshipHome(input: AppSpec | FlagshipContext): string {
  const ctx: FlagshipContext =
    'spec' in input
      ? input
      : {
          spec: input,
          token: '',
          booking: input.features.includes('booking') || input.features.includes('classes'),
          doc: null,
        }
  const generated = ctx.doc ? null : flagshipDocFromSpec(ctx.spec)
  const activeDoc = ctx.doc ?? generated
  const renderCtx: FlagshipContext = activeDoc === ctx.doc ? ctx : { ...ctx, doc: activeDoc }
  const nodes = activeDoc
    ? homeSections(activeDoc).filter((node) => node.kind === 'flagship' && !node.hidden)
    : []
  if (nodes.length)
    return `<div class="fx-home ${tradeClass(ctx.spec)}">${nodes.map((node) => flagshipNode(renderCtx, node)).join('')}</div>`
  switch (ctx.spec.vertical) {
    case 'restaurant':
      return restaurantHome(ctx.spec)
    case 'shop':
      return shopHome(ctx.spec)
    case 'salon':
      return salonHome(ctx.spec)
    case 'hotel':
      return hotelHome(ctx.spec)
    case 'professional':
      return professionalHome(ctx.spec)
    default:
      return ''
  }
}

function dayLabel(offset: number): string {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return String(date.getDate()).padStart(2, '0')
}

/** A compact lead that sits above the real catalogue, never a second hero. */
export function flagshipCatalogLead(spec: AppSpec): string {
  if (spec.vertical === 'restaurant') {
    return `<div class="fx-cat-lead fx-dine-lead">
      <span class="fx-eyebrow">The menu</span>
      <h1>${esc(spec.tagline)}</h1>
      <p>${[hoursLine(spec), spec.address].filter(Boolean).map(esc).join(' · ')}</p>
    </div>`
  }
  if (spec.vertical === 'shop') {
    return `<div class="fx-cat-lead fx-shop-lead">
      <div><span class="fx-eyebrow">The collection</span><h1>${esc(spec.tagline)}</h1></div>
      <span class="fx-count">${entries(spec).length} pieces</span>
    </div>`
  }
  if (spec.vertical === 'hotel') {
    return `<div class="fx-cat-lead fx-hotel-lead">
      <span class="fx-eyebrow">Rooms &amp; suites</span>
      <h1>${esc(spec.tagline)}</h1>
      <div class="fx-availability"><span>${esc(hoursLine(spec) || 'Reception')}</span><b>${entries(spec).length} room types</b><button type="button" data-go="book">Check dates</button></div>
    </div>`
  }
  if (spec.vertical === 'cafe') {
    return `<div class="fx-cat-lead fx-cafe-lead">
      <span class="fx-eyebrow">Counter menu</span>
      <h1>${esc(spec.tagline)}</h1>
      <p>${[hoursLine(spec), spec.address].filter(Boolean).map(esc).join(' · ')}</p>
      <div class="fx-cafe-lead-actions"><button type="button" data-cart-open>Order takeaway</button><button type="button" data-go="book">Reserve a table</button></div>
    </div>`
  }
  if (spec.vertical === 'gym') {
    return `<div class="fx-cat-lead fx-gym-lead">
      <span class="fx-eyebrow">Memberships</span>
      <h1>${esc(spec.tagline)}</h1>
      <p>${[hoursLine(spec), spec.address].filter(Boolean).map(esc).join(' · ')}</p>
      <button type="button" data-go="book">See the class timetable</button>
    </div>`
  }
  if (spec.vertical === 'clinic') {
    return `<div class="fx-cat-lead fx-clinic-lead">
      <span class="fx-eyebrow">Treatments</span>
      <h1>${esc(spec.tagline)}</h1>
      <p>Prices shown before you book. No referral needed.</p>
      <button type="button" data-go="book">Book an appointment</button>
    </div>`
  }
  if (spec.vertical === 'property') {
    return `<div class="fx-cat-lead fx-prop-lead">
      <div><span class="fx-eyebrow">Listings</span><h1>${esc(spec.tagline)}</h1></div>
      <button type="button" data-search-open>Search homes</button>
    </div>`
  }
  if (spec.vertical === 'studio') {
    return `<div class="fx-cat-lead fx-studio-lead">
      <span class="fx-eyebrow">Services</span>
      <h1>${esc(spec.tagline)}</h1>
      <p>${entries(spec).length} ways to work with the studio</p>
    </div>`
  }
  if (spec.vertical === 'trades') {
    return `<div class="fx-cat-lead fx-trade-lead">
      <span class="fx-eyebrow">Work order</span>
      <h1>${esc(spec.tagline)}</h1>
      <p>${[hoursLine(spec), spec.address].filter(Boolean).map(esc).join(' · ')}</p>
      <div class="fx-trade-lead-actions"><button type="button" data-go="quote">Request a quote</button><button type="button" data-go="book">Book a call-out</button></div>
    </div>`
  }
  if (spec.vertical === 'auto') {
    return `<div class="fx-cat-lead fx-auto-lead">
      <div><span class="fx-eyebrow">Job sheet</span><h1>${esc(spec.tagline)}</h1></div>
      <span class="fx-auto-count">${entries(spec).length} jobs</span>
      <button type="button" data-go="book">Book a slot</button>
    </div>`
  }
  if (spec.vertical === 'ecommerce') {
    return `<div class="fx-cat-lead fx-ecom-lead">
      <div><span class="fx-eyebrow">Direct from the workshop</span><h1>${esc(spec.tagline)}</h1></div>
      <span class="fx-ecom-count">${entries(spec).length} pieces</span>
    </div>`
  }
  if (spec.vertical === 'courses') {
    return `<div class="fx-cat-lead fx-course-lead">
      <span class="fx-eyebrow">Course catalogue</span>
      <h1>${esc(spec.tagline)}</h1>
      <p>${entries(spec).length} courses · every one opens with a free lesson</p>
    </div>`
  }
  if (spec.vertical === 'finance') {
    return `<div class="fx-cat-lead fx-fin-lead">
      <span class="fx-eyebrow">Services &amp; fees</span>
      <h1>${esc(spec.tagline)}</h1>
      <p>Fees shown before any work starts. First meeting is free.</p>
    </div>`
  }
  return ''
}

export function flagshipCss(): string {
  return `
/* ---- flagship base -------------------------------------------------- */
body[data-flagship="1"] { background: var(--bg); }
body[data-flagship="1"] .app { max-width: 520px; margin-inline: auto; box-shadow: 0 0 0 1px color-mix(in srgb, var(--ink) 5%, transparent); }
body[data-flagship="1"] .screens { scroll-behavior: smooth; }
body[data-flagship="1"] .screen { padding-left: 18px; padding-right: 18px; }
body[data-flagship="1"] .appbar { min-height: 54px; padding-top: max(10px, env(safe-area-inset-top)); border-bottom: 1px solid color-mix(in srgb, var(--ink) 7%, transparent); backdrop-filter: blur(20px) saturate(1.2); background: color-mix(in srgb, var(--bg) 86%, transparent); }
body[data-flagship="1"] .appbar .title { font-size: 14px; font-weight: 650; letter-spacing: -.01em; }
body[data-flagship="1"] .appbar .title { max-width: 100%; }
body[data-flagship="1"] .appbar .kicker { font-size: 9px; letter-spacing: .12em; opacity: .5; }
body[data-flagship="1"] .iconbtn { width: 44px; height: 44px; border: 0; border-radius: 50%; background: color-mix(in srgb, var(--ink) 5%, transparent); }
@media (max-width: 360px) {
  body[data-flagship="1"] .appbar { gap: 4px; padding-inline: 12px; }
  body[data-flagship="1"] .iconbtn { width: 38px; height: 38px; }
  body[data-flagship="1"] .appbar .title { font-size: 13px; }
}
body[data-flagship="1"] .iconbtn svg { width: 18px; height: 18px; }
body[data-flagship="1"] .tabbar { left: 0 !important; right: 0 !important; width: auto !important; border-radius: 0 !important; height: calc(58px + env(safe-area-inset-bottom)); padding: 7px 18px env(safe-area-inset-bottom); background: color-mix(in srgb, var(--bg) 96%, transparent); border-top: 1px solid color-mix(in srgb, var(--ink) 7%, transparent); backdrop-filter: blur(24px); }
body[data-flagship="1"] .tab { min-width: 44px; min-height: 48px; gap: 2px; }
body[data-flagship="1"] .tab svg { width: 21px; height: 21px; }
body[data-flagship="1"] .tab span { max-width: 100%; padding: 0 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 8.5px; letter-spacing: 0; }
body[data-flagship="1"] .legacy-home { display: none !important; }
body[data-flagship="1"] .chip { min-height: 44px; padding: 8px 13px; border: 0; background: color-mix(in srgb, var(--ink) 5%, transparent); }
body[data-flagship="1"] .fx-shop-head button, body[data-flagship="1"] .fx-salon-title button, body[data-flagship="1"] .fx-rooms-head button { display: inline-flex; align-items: center; min-height: 44px; padding: 0 4px; margin-right: -4px; }
body[data-flagship="1"] :is(.fx-trade-row-head, .fx-auto-block-head, .fx-ecom-head, .fx-course-block-head, .fx-fin-block-head) button { display: inline-flex; align-items: center; justify-content: flex-end; min-width: 44px; min-height: 44px; padding: 0 3px; margin-right: -3px; }
body[data-flagship="1"] .chip.on { background: var(--ink); color: var(--bg); }
body[data-flagship="1"] .btn, body[data-flagship="1"] button, body[data-flagship="1"] a.iconbtn { -webkit-tap-highlight-color: transparent; }
body[data-flagship="1"] .btn:active, body[data-flagship="1"] .fx-home button:active, body[data-flagship="1"] [data-item]:active { transform: scale(.985); }
body[data-flagship="1"] .thumb { border-radius: 14px; overflow: hidden; border: 0; }
body[data-flagship="1"] .thumb .mono { display: none; }
body[data-flagship="1"] .thumb .photo { width: 100%; height: 100%; object-fit: cover; }
body[data-flagship="1"] .sect { border: 0; padding-bottom: 2px; }
body[data-flagship="1"] .sect .label { font-size: 11px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; }
body[data-flagship="1"] .doc-section { margin-top: 18px; }

.fx-home { display: flex; flex-direction: column; padding: 18px 0 94px; }
/* Small caps are the smallest text in the app; at half strength they measured
   2.6:1 on the café's cream ground. 0.68 still reads as a quiet label. */
.fx-eyebrow { font-size: 9.5px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; opacity: .68; }
.fx-kicker { display: flex; justify-content: space-between; gap: 12px; font-size: 9.5px; letter-spacing: .08em; text-transform: uppercase; opacity: .52; margin-bottom: 28px; }
.fx-facts { display: flex; flex-wrap: wrap; gap: 5px 14px; font-size: 10.5px; opacity: .52; margin-top: 22px; line-height: 1.5; }
.fx-rail { display: flex; gap: 8px; overflow-x: auto; margin: 0 -18px; padding: 2px 18px 4px; scrollbar-width: none; }
.fx-rail::-webkit-scrollbar { display: none; }
.fx-rail-link { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 7px; min-height: 44px; padding: 0 14px 0 8px; border: 1px solid color-mix(in srgb, var(--ink) 10%, transparent); border-radius: 999px; background: transparent; color: var(--ink); font: inherit; font-size: 11.5px; font-weight: 600; }
.fx-rail-link span { display: grid; place-items: center; width: 23px; height: 23px; border-radius: 50%; background: color-mix(in srgb, var(--ink) 6%, transparent); font-size: 8px; font-weight: 700; opacity: .65; }
.fx-actions { display: flex; gap: 8px; margin-top: 20px; }
.fx-primary, .fx-secondary { min-height: 48px; border-radius: 12px; font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; }
.fx-primary { flex: 1; border: 0; background: var(--ink); color: var(--bg); }
.fx-secondary { padding: 0 18px; border: 1px solid color-mix(in srgb, var(--ink) 14%, transparent); background: transparent; color: var(--ink); }
.fx-price { font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; }
.fx-empty { padding: 24px 18px; border-radius: 16px; background: color-mix(in srgb, var(--ink) 4%, transparent); }
.fx-empty b { display: block; font-size: 14px; margin-top: 14px; }
.fx-empty p { font-size: 11.5px; opacity: .55; margin: 5px 0 0; line-height: 1.5; }
.fx-home > .fx-block { margin-top: 0; }
.fx-art > img.fx-photo { position: absolute; inset: 0; width: 100%; height: 100%; display: block; object-fit: cover; }
.fx-art.has-photo { background: color-mix(in srgb, var(--ink) 6%, var(--bg)); }
.fx-art.has-photo::after { content: none; }
.fx-attachment { position: relative; margin: 0 0 14px; overflow: hidden; border-radius: 14px; aspect-ratio: 16 / 10; max-height: min(58vh, 430px); background: color-mix(in srgb, var(--ink) 5%, transparent); }
.fx-attachment .fx-photo, .fx-pro-photo .fx-photo { width: 100%; height: 100%; object-fit: cover; display: block; }
.fx-block-note { font-size: 11px; line-height: 1.45; opacity: .52; margin: 7px 0 0; max-width: 34ch; }
.fx-mini-label { font-size: 9px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; opacity: .66; margin: 0 0 9px; }
.fx-pro-photo { margin: 18px 0 0; overflow: hidden; border-radius: 16px; aspect-ratio: 16 / 9; background: color-mix(in srgb, var(--ink) 5%, transparent); }
.fx-offer-list { display: grid; gap: 8px; }
.fx-offer { display: grid; gap: 2px; padding: 13px 14px; border-radius: 12px; background: color-mix(in srgb, var(--accent) 7%, transparent); }
.fx-offer b { font-size: 12px; font-weight: 650; }
.fx-offer span { font-size: 10.5px; line-height: 1.45; opacity: .56; }

/* Decorative artwork, clearly not a product photograph. */
.fx-art { position: relative; display: block; overflow: hidden; flex: 0 0 auto; background: radial-gradient(115% 95% at 78% 12%, color-mix(in srgb, var(--accent) 38%, transparent), transparent 58%), linear-gradient(148deg, color-mix(in srgb, var(--accent) 24%, var(--bg)) 0%, color-mix(in srgb, var(--ink) 9%, var(--bg)) 100%); isolation: isolate; }
.fx-art::after { content: ""; position: absolute; inset: 0; opacity: .18; background-image: repeating-linear-gradient(115deg, rgba(255,255,255,.24) 0 1px, transparent 1px 5px); mix-blend-mode: soft-light; }
.fx-art i { position: absolute; display: block; border: 1px solid color-mix(in srgb, var(--accent) 42%, transparent); border-radius: 50%; }
.fx-art i:nth-child(1) { width: 78%; height: 78%; left: -16%; top: -22%; background: color-mix(in srgb, var(--bg) 12%, transparent); }
.fx-art i:nth-child(2) { width: 48%; height: 48%; right: -6%; bottom: -10%; background: color-mix(in srgb, var(--accent) 19%, transparent); }
.fx-art i:nth-child(3) { width: 24%; height: 24%; right: 23%; top: 21%; border-radius: 3px; transform: rotate(calc(18deg + var(--fx-i) * 7deg)); background: color-mix(in srgb, var(--bg) 28%, transparent); }
.fx-art.is-plate { border-radius: 50%; }
.fx-art.is-plate i:nth-child(1) { width: 88%; height: 88%; left: 6%; top: 6%; }
.fx-art.is-plate i:nth-child(2) { width: 42%; height: 42%; right: 29%; bottom: 29%; border-radius: 50%; }
.fx-art.is-arch { border-radius: 999px 999px 14px 14px; }
.fx-art.is-quiet { border-radius: 14px; background: color-mix(in srgb, var(--accent) 7%, var(--bg)); }
.fx-art.is-room { border-radius: 16px; }
.fx-art.is-room i:nth-child(1) { width: 70%; height: 70%; border-radius: 12px; left: 14%; top: 20%; transform: rotate(-4deg); }
.fx-art.is-room i:nth-child(2) { width: 44%; height: 34%; right: 10%; bottom: 8%; border-radius: 8px 8px 0 0; }
.fx-art.is-card { border-radius: 14px; }

/* ---- restaurant: an editorial menu book ----------------------------- */
body[data-trade="restaurant"][data-flagship="1"] .appbar { background: color-mix(in srgb, var(--bg) 92%, transparent); }
body[data-trade="restaurant"][data-flagship="1"] [data-screen="catalog"] .menu-masthead { display: none; }
body[data-trade="restaurant"][data-flagship="1"] [data-screen="catalog"] { padding-top: 10px; }
body[data-trade="restaurant"][data-flagship="1"] .menu-masthead { display: none; }
body[data-trade="restaurant"][data-flagship="1"] .fx-dine .fx-title h1 { font-family: var(--display); font-size: clamp(38px, 11vw, 58px); line-height: .92; letter-spacing: -.055em; font-weight: 500; margin: 9px 0 0; }
body[data-trade="restaurant"][data-flagship="1"] .fx-dine .fx-title h1 i { font-style: normal; color: var(--accent-text); }
body[data-trade="restaurant"][data-flagship="1"] .fx-dine .fx-title p { font-family: var(--display); font-size: 16px; line-height: 1.45; margin: 15px 0 0; max-width: 30ch; opacity: .72; }
body[data-trade="restaurant"][data-flagship="1"] .fx-rail { margin-top: 26px; }
body[data-trade="restaurant"][data-flagship="1"] .fx-feature { display: grid; grid-template-columns: 118px 1fr; gap: 15px; align-items: center; margin-top: 22px; padding: 12px; border-radius: 18px; background: color-mix(in srgb, var(--ink) 4%, transparent); cursor: pointer; }
body[data-trade="restaurant"][data-flagship="1"] .fx-feature .fx-art { width: 118px; height: 132px; }
body[data-trade="restaurant"][data-flagship="1"] .fx-feature-copy { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; min-width: 0; }
body[data-trade="restaurant"][data-flagship="1"] .fx-feature-copy b { font-family: var(--display); font-size: 20px; line-height: 1.12; letter-spacing: -.02em; font-weight: 500; }
body[data-trade="restaurant"][data-flagship="1"] .fx-feature-copy p { font-size: 11.5px; line-height: 1.45; opacity: .58; margin: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
body[data-trade="restaurant"][data-flagship="1"] .fx-feature-copy .fx-price { margin-top: 7px; }
body[data-trade="restaurant"][data-flagship="1"] .fx-dine .fx-actions { margin-top: 16px; }
body[data-trade="restaurant"][data-flagship="1"] .fx-note { display: flex; align-items: center; gap: 12px; margin-top: 26px; font-size: 9px; letter-spacing: .12em; text-transform: uppercase; opacity: .42; }
body[data-trade="restaurant"][data-flagship="1"] .fx-rule { width: 34px; height: 1px; background: currentColor; }
body[data-trade="restaurant"][data-flagship="1"] .fx-dine-lead { padding: 20px 0 14px; border-bottom: 1px solid color-mix(in srgb, var(--ink) 8%, transparent); margin-bottom: 8px; }
body[data-trade="restaurant"][data-flagship="1"] .fx-dine-lead h1 { font-family: var(--display); font-size: 25px; font-weight: 500; line-height: 1.1; letter-spacing: -.035em; margin: 7px 0 0; }
body[data-trade="restaurant"][data-flagship="1"] .fx-dine-lead p { font-size: 10px; letter-spacing: .05em; text-transform: uppercase; opacity: .48; margin: 9px 0 0; }
body[data-trade="restaurant"][data-flagship="1"] .h-row { padding: 15px 0; align-items: center; gap: 12px; }
body[data-trade="restaurant"][data-flagship="1"] .h-row::before { content: ""; flex: 0 0 56px; width: 56px; height: 56px; order: -1; border-radius: 50%; border: 1px solid color-mix(in srgb, var(--accent) 26%, transparent); background: radial-gradient(circle at 68% 25%, color-mix(in srgb, var(--accent) 38%, transparent), transparent 48%), linear-gradient(145deg, color-mix(in srgb, var(--accent) 20%, var(--bg)), color-mix(in srgb, var(--ink) 6%, var(--bg))); box-shadow: inset 0 0 0 6px color-mix(in srgb, var(--bg) 42%, transparent); }
body[data-trade="restaurant"][data-flagship="1"] .h-row > div:first-of-type { flex: 1; min-width: 0; }
body[data-trade="restaurant"][data-flagship="1"] .h-row .name { font-family: var(--display); font-size: 19px; font-weight: 500; letter-spacing: -.02em; }
body[data-trade="restaurant"][data-flagship="1"] .h-row .desc { font-size: 11.5px; opacity: .55; line-height: 1.45; margin-top: 3px; max-width: 32ch; }
body[data-trade="restaurant"][data-flagship="1"] .h-row .add { width: 44px; height: 44px; border-radius: 50%; border: 1px solid color-mix(in srgb, var(--ink) 14%, transparent); background: transparent; }
body[data-trade="restaurant"][data-flagship="1"] .h-row .save { display: none; }
body[data-trade="restaurant"][data-flagship="1"] .section-block .sect { margin-top: 20px; }

/* ---- retail: a contemporary commerce feed --------------------------- */
body[data-trade="shop"][data-flagship="1"] .appbar { border-bottom: 0; }
body[data-trade="shop"][data-flagship="1"] [data-screen="catalog"] > .sect { display: none; }
body[data-trade="shop"][data-flagship="1"] .bar-pill { display: none; }
body[data-trade="shop"][data-flagship="1"] .fx-search { display: flex; align-items: center; gap: 9px; width: 100%; min-height: 46px; padding: 0 13px; border: 0; border-radius: 12px; background: color-mix(in srgb, var(--ink) 5%, transparent); color: var(--ink); font: inherit; font-size: 11.5px; text-align: left; }
body[data-trade="shop"][data-flagship="1"] .fx-search svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 1.7; opacity: .55; }
body[data-trade="shop"][data-flagship="1"] .fx-search span { flex: 1; opacity: .5; }
body[data-trade="shop"][data-flagship="1"] .fx-search kbd { font: inherit; font-size: 9px; padding: 3px 6px; border-radius: 999px; background: color-mix(in srgb, var(--ink) 7%, transparent); opacity: .55; }
body[data-trade="shop"][data-flagship="1"] .fx-shop-title { padding: 30px 0 22px; }
body[data-trade="shop"][data-flagship="1"] .fx-shop-title h1 { font-family: var(--display); font-size: clamp(30px, 8.5vw, 40px); font-weight: 500; line-height: 1.02; letter-spacing: -.045em; margin: 9px 0 0; max-width: 17ch; }
body[data-trade="shop"][data-flagship="1"] .fx-rail { margin-bottom: 25px; }
body[data-trade="shop"][data-flagship="1"] .fx-shop-head { display: flex; align-items: baseline; justify-content: space-between; padding-bottom: 12px; }
body[data-trade="shop"][data-flagship="1"] .fx-shop-head span { font-size: 10px; text-transform: uppercase; letter-spacing: .1em; font-weight: 700; }
body[data-trade="shop"][data-flagship="1"] .fx-shop-head button { border: 0; background: none; color: inherit; font: inherit; font-size: 10px; opacity: .5; text-decoration: underline; text-underline-offset: 3px; }
body[data-trade="shop"][data-flagship="1"] .fx-products { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 10px; }
body[data-trade="shop"][data-flagship="1"] .fx-product { min-width: 0; cursor: pointer; }
body[data-trade="shop"][data-flagship="1"] .fx-product .fx-art { width: 100%; aspect-ratio: .78; border-radius: 10px; }
body[data-trade="shop"][data-flagship="1"] .fx-product:nth-child(2n) .fx-art { background: radial-gradient(115% 95% at 20% 16%, color-mix(in srgb, var(--accent) 40%, transparent), transparent 60%), linear-gradient(165deg, color-mix(in srgb, var(--ink) 14%, var(--bg)), color-mix(in srgb, var(--accent) 22%, var(--bg))); }
body[data-trade="shop"][data-flagship="1"] .fx-product:nth-child(3n) .fx-art { background: radial-gradient(100% 80% at 84% 78%, color-mix(in srgb, var(--accent) 42%, transparent), transparent 60%), linear-gradient(130deg, color-mix(in srgb, var(--accent) 12%, var(--bg)), color-mix(in srgb, var(--ink) 16%, var(--bg))); }
body[data-trade="shop"][data-flagship="1"] .fx-product:nth-child(4n) .fx-art { background: linear-gradient(160deg, color-mix(in srgb, var(--ink) 18%, var(--bg)), color-mix(in srgb, var(--accent) 27%, var(--bg)) 58%, color-mix(in srgb, var(--bg) 84%, #fff)); }
body[data-trade="shop"][data-flagship="1"] .fx-product:nth-child(2n) .fx-art i:nth-child(1) { width: 52%; height: 52%; left: 34%; top: 8%; }
body[data-trade="shop"][data-flagship="1"] .fx-product:nth-child(3n) .fx-art i:nth-child(2) { width: 64%; height: 64%; right: -18%; bottom: 4%; }
body[data-trade="shop"][data-flagship="1"] .fx-product:nth-child(4n) .fx-art i:nth-child(3) { width: 38%; height: 38%; right: 18%; top: 28%; transform: rotate(-24deg); border-radius: 50%; }
body[data-trade="shop"][data-flagship="1"] .fx-product-copy { display: flex; flex-direction: column; gap: 2px; padding: 8px 2px 0; }
body[data-trade="shop"][data-flagship="1"] .fx-product-copy b { font-size: 11.5px; font-weight: 600; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
body[data-trade="shop"][data-flagship="1"] .fx-product-copy span { font-size: 10.5px; opacity: .5; font-variant-numeric: tabular-nums; }
body[data-trade="shop"][data-flagship="1"] .fx-wide-link { display: flex; justify-content: space-between; width: 100%; margin-top: 22px; padding: 16px 2px; border: 0; border-top: 1px solid color-mix(in srgb, var(--ink) 10%, transparent); background: none; color: inherit; font: inherit; font-size: 11.5px; font-weight: 600; }
body[data-trade="shop"][data-flagship="1"] .fx-shop-lead { display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; padding: 22px 0 18px; }
body[data-trade="shop"][data-flagship="1"] .fx-shop-lead h1 { font-family: var(--display); font-size: 27px; line-height: 1.05; letter-spacing: -.035em; font-weight: 500; margin: 6px 0 0; max-width: 19ch; }
body[data-trade="shop"][data-flagship="1"] .fx-count { flex: 0 0 auto; font-size: 9px; opacity: .45; padding-bottom: 3px; }
body[data-trade="shop"][data-flagship="1"] .tiles { grid-template-columns: 1fr 1fr; gap: 16px 10px; }
body[data-trade="shop"][data-flagship="1"] .tile { border: 0; background: transparent; padding: 0; }
body[data-trade="shop"][data-flagship="1"] .tile .thumb { width: 100%; height: auto; aspect-ratio: .78; }
body[data-trade="shop"][data-flagship="1"] .tile .body { padding: 8px 2px 0; }
body[data-trade="shop"][data-flagship="1"] .tile .go, body[data-trade="shop"][data-flagship="1"] .tile .save { display: none; }
body[data-trade="shop"][data-flagship="1"] .tile .name { font-size: 11.5px; font-weight: 600; }
body[data-trade="shop"][data-flagship="1"] .tile .price { font-size: 10.5px; opacity: .55; }

/* ---- salon: appointment-first calm ---------------------------------- */
body[data-trade="salon"][data-flagship="1"] { --el-card-r: 16px; }
body[data-trade="salon"][data-flagship="1"] .appbar { background: color-mix(in srgb, var(--bg) 82%, transparent); }
body[data-trade="salon"][data-flagship="1"] .fx-salon { padding-top: 16px; }
body[data-trade="salon"][data-flagship="1"] .fx-salon-head { padding: 18px 0 22px; }
body[data-trade="salon"][data-flagship="1"] .fx-salon-head h1 { font-family: var(--display); font-size: clamp(34px, 10vw, 48px); line-height: 1.02; letter-spacing: -.05em; font-weight: 400; margin: 10px 0 0; max-width: 15ch; }
body[data-trade="salon"][data-flagship="1"] .fx-salon-head p { font-size: 10.5px; opacity: .48; margin: 14px 0 0; letter-spacing: .02em; }
body[data-trade="salon"][data-flagship="1"] .fx-dates { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; padding: 9px; border-radius: 18px; background: color-mix(in srgb, var(--ink) 4%, transparent); }
body[data-trade="salon"][data-flagship="1"] .fx-dates button { display: flex; flex-direction: column; align-items: center; gap: 2px; min-height: 58px; padding: 8px 2px; border: 0; border-radius: 11px; background: transparent; color: inherit; font: inherit; }
body[data-trade="salon"][data-flagship="1"] .fx-dates button.on { background: var(--bg); box-shadow: 0 1px 6px color-mix(in srgb, var(--ink) 8%, transparent); }
body[data-trade="salon"][data-flagship="1"] .fx-dates span { font-size: 8.5px; text-transform: uppercase; letter-spacing: .06em; opacity: .52; }
body[data-trade="salon"][data-flagship="1"] .fx-dates b { font-family: var(--display); font-size: 19px; font-weight: 500; }
body[data-trade="salon"][data-flagship="1"] .fx-salon-title { display: flex; justify-content: space-between; align-items: baseline; padding: 28px 0 10px; }
body[data-trade="salon"][data-flagship="1"] .fx-salon-title span { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; }
body[data-trade="salon"][data-flagship="1"] .fx-salon-title button { border: 0; background: none; color: inherit; font: inherit; font-size: 10px; opacity: .48; text-decoration: underline; text-underline-offset: 3px; }
body[data-trade="salon"][data-flagship="1"] .fx-services { display: flex; flex-direction: column; }
body[data-trade="salon"][data-flagship="1"] .fx-service { display: grid; grid-template-columns: 54px 1fr auto; align-items: center; gap: 12px; min-height: 70px; padding: 8px 0; border-bottom: 1px solid color-mix(in srgb, var(--ink) 7%, transparent); cursor: pointer; }
body[data-trade="salon"][data-flagship="1"] .fx-service .fx-art { width: 54px; height: 54px; border-radius: 50%; }
body[data-trade="salon"][data-flagship="1"] .fx-service > div:nth-child(2) { min-width: 0; }
body[data-trade="salon"][data-flagship="1"] .fx-service b { display: block; font-size: 12.5px; font-weight: 600; letter-spacing: -.01em; }
body[data-trade="salon"][data-flagship="1"] .fx-service span { display: block; font-size: 10px; opacity: .48; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 24ch; }
body[data-trade="salon"][data-flagship="1"] .fx-service-tail { text-align: right; }
body[data-trade="salon"][data-flagship="1"] .fx-service-tail b { font-size: 11.5px; font-variant-numeric: tabular-nums; }
body[data-trade="salon"][data-flagship="1"] .fx-service-tail span { font-size: 8px; text-transform: uppercase; letter-spacing: .05em; opacity: .38; }
body[data-trade="salon"][data-flagship="1"] .fx-staff { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 18px; font-size: 9px; opacity: .55; }
body[data-trade="salon"][data-flagship="1"] .fx-staff b { padding: 5px 9px; border: 1px solid color-mix(in srgb, var(--ink) 12%, transparent); border-radius: 999px; font-weight: 500; }
body[data-trade="salon"][data-flagship="1"] .fx-sticky { position: relative; z-index: 4; margin-top: 20px; padding-bottom: 8px; }
body[data-trade="salon"][data-flagship="1"] .fx-sticky button { display: flex; justify-content: space-between; align-items: center; width: 100%; min-height: 50px; padding: 0 18px; border: 0; border-radius: 999px; background: var(--ink); color: var(--bg); font: inherit; font-size: 12px; font-weight: 650; box-shadow: 0 12px 26px -12px color-mix(in srgb, var(--ink) 55%, transparent); }
body[data-trade="salon"][data-flagship="1"] .fx-sticky button span { font-size: 16px; }
body[data-trade="salon"][data-flagship="1"] [data-screen="catalog"] .sect { margin-top: 8px; }

/* ---- hotel: a quiet, visual stay ------------------------------------ */
body[data-trade="hotel"][data-flagship="1"] .appbar { position: absolute; top: 0; left: 0; right: 0; z-index: 6; background: transparent; border: 0; color: #fff; mix-blend-mode: normal; text-shadow: 0 1px 12px rgba(0,0,0,.25); }
body[data-trade="hotel"][data-flagship="1"] .appbar .iconbtn { background: rgba(255,255,255,.14); color: #fff; backdrop-filter: blur(12px); }
body[data-trade="hotel"][data-flagship="1"] .fx-hotel { margin: -18px -18px 0; }
body[data-trade="hotel"][data-flagship="1"] .fx-hotel-image { position: relative; height: 40vh; max-height: 350px; min-height: 270px; border-radius: 0 0 24px 24px; overflow: hidden; }
body[data-trade="hotel"][data-flagship="1"] .fx-hotel-image .fx-art { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: 0 0 24px 24px; background: radial-gradient(90% 70% at 74% 20%, color-mix(in srgb, var(--accent) 70%, #7d9d96), transparent 64%), linear-gradient(165deg, #35443f 0%, #1c2724 62%, #121917 100%); }
body[data-trade="hotel"][data-flagship="1"] .fx-hotel-image .fx-art::after { opacity: .1; }
body[data-trade="hotel"][data-flagship="1"] .fx-hotel-image .fx-art i { border-color: rgba(255,255,255,.16); }
body[data-trade="hotel"][data-flagship="1"] .fx-hotel-image .fx-art i:nth-child(1) { width: 110%; height: 52%; left: -5%; top: 58%; border-radius: 50% 50% 0 0; background: rgba(255,255,255,.045); }
body[data-trade="hotel"][data-flagship="1"] .fx-hotel-image .fx-art i:nth-child(2) { width: 46%; height: 46%; right: 12%; bottom: 20%; border-radius: 50%; background: rgba(255,255,255,.06); }
body[data-trade="hotel"][data-flagship="1"] .fx-hotel-image .fx-art i:nth-child(3) { display: none; }
body[data-trade="hotel"][data-flagship="1"] .fx-hotel-image > .fx-eyebrow { position: absolute; left: 18px; top: 82px; color: #fff; opacity: .72; }
body[data-trade="hotel"][data-flagship="1"] .fx-stay-tag { position: absolute; left: 14px; right: 14px; bottom: 14px; display: grid; grid-template-columns: 1fr auto; gap: 2px 12px; padding: 13px 14px; border-radius: 12px; background: rgba(18,24,22,.52); border: 1px solid rgba(255,255,255,.14); backdrop-filter: blur(14px); color: #fff; }
body[data-trade="hotel"][data-flagship="1"] .fx-stay-tag span { grid-column: 1 / -1; font-size: 7.5px; letter-spacing: .12em; text-transform: uppercase; opacity: .6; }
body[data-trade="hotel"][data-flagship="1"] .fx-stay-tag b { font-family: var(--display); font-size: 16px; font-weight: 500; letter-spacing: -.015em; }
body[data-trade="hotel"][data-flagship="1"] .fx-stay-tag em { align-self: end; font-style: normal; font-size: 10px; opacity: .72; }
body[data-trade="hotel"][data-flagship="1"] .fx-hotel-title { padding: 26px 18px 0; }
body[data-trade="hotel"][data-flagship="1"] .fx-hotel-title h1 { font-family: var(--display); font-size: clamp(38px, 11vw, 56px); line-height: .95; letter-spacing: -.05em; font-weight: 400; margin: 8px 0 0; }
body[data-trade="hotel"][data-flagship="1"] .fx-hotel-title p { font-size: 13px; line-height: 1.5; opacity: .6; margin: 12px 0 0; max-width: 32ch; }
body[data-trade="hotel"][data-flagship="1"] .fx-stay-card { margin: 24px 18px 0; padding: 12px; border-radius: 16px; background: var(--bg); box-shadow: 0 16px 40px -24px rgba(0,0,0,.35); border: 1px solid color-mix(in srgb, var(--ink) 8%, transparent); }
body[data-trade="hotel"][data-flagship="1"] .fx-stay-dates { display: grid; grid-template-columns: 1fr auto 1fr; align-items: end; gap: 8px; }
body[data-trade="hotel"][data-flagship="1"] .fx-stay-dates label { display: flex; flex-direction: column; gap: 4px; font-size: 8px; text-transform: uppercase; letter-spacing: .1em; opacity: .5; }
body[data-trade="hotel"][data-flagship="1"] .fx-stay-dates input { width: 100%; min-height: 44px; border: 0; background: transparent; color: var(--ink); font: inherit; font-size: 12px; padding: 0; }
body[data-trade="hotel"][data-flagship="1"] .fx-stay-dates > span { width: 12px; height: 1px; background: color-mix(in srgb, var(--ink) 20%, transparent); margin-bottom: 18px; }
body[data-trade="hotel"][data-flagship="1"] .fx-stay-card > button { display: flex; justify-content: space-between; align-items: center; width: 100%; min-height: 46px; margin-top: 10px; padding: 0 15px; border: 0; border-radius: 10px; background: var(--ink); color: var(--bg); font: inherit; font-size: 11.5px; font-weight: 650; }
body[data-trade="hotel"][data-flagship="1"] .fx-rooms-head { display: flex; justify-content: space-between; align-items: baseline; padding: 31px 18px 12px; }
body[data-trade="hotel"][data-flagship="1"] .fx-rooms-head span { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; }
body[data-trade="hotel"][data-flagship="1"] .fx-rooms-head button { border: 0; background: none; color: inherit; font: inherit; font-size: 10px; opacity: .48; text-decoration: underline; text-underline-offset: 3px; }
body[data-trade="hotel"][data-flagship="1"] .fx-room-stack { display: flex; flex-direction: column; gap: 22px; padding: 0 18px; }
body[data-trade="hotel"][data-flagship="1"] .fx-room { cursor: pointer; }
body[data-trade="hotel"][data-flagship="1"] .fx-room .fx-art { width: 100%; aspect-ratio: 1.35; border-radius: 16px; }
body[data-trade="hotel"][data-flagship="1"] .fx-room-copy { padding: 11px 2px 0; }
body[data-trade="hotel"][data-flagship="1"] .fx-room-copy b { display: block; font-family: var(--display); font-size: 21px; font-weight: 500; letter-spacing: -.025em; margin-top: 3px; }
body[data-trade="hotel"][data-flagship="1"] .fx-room-copy p { font-size: 11px; opacity: .5; margin: 4px 0 7px; line-height: 1.45; }
body[data-trade="hotel"][data-flagship="1"] .fx-hotel .fx-facts { padding: 0 18px; }
body[data-trade="hotel"][data-flagship="1"] .fx-hotel-lead { padding: 22px 0 16px; }
body[data-trade="hotel"][data-flagship="1"] .fx-hotel-lead h1 { font-family: var(--display); font-size: 29px; line-height: 1.04; letter-spacing: -.04em; font-weight: 500; margin: 7px 0 0; max-width: 21ch; }
body[data-trade="hotel"][data-flagship="1"] .fx-availability { display: flex; align-items: center; gap: 12px; margin-top: 15px; font-size: 9px; text-transform: uppercase; letter-spacing: .06em; opacity: .55; }
body[data-trade="hotel"][data-flagship="1"] .fx-availability b { font-weight: 600; }
body[data-trade="hotel"][data-flagship="1"] .fx-availability button { margin-left: auto; min-height: 38px; padding: 0 14px; border: 0; border-radius: 999px; background: var(--ink); color: var(--bg); font: inherit; font-size: 9px; font-weight: 650; text-transform: uppercase; letter-spacing: .05em; }
body[data-trade="hotel"][data-flagship="1"] [data-screen="catalog"] .section-block .sect { margin-top: 16px; }
body[data-trade="hotel"][data-flagship="1"] .tile .thumb { height: 160px; }
body[data-trade="hotel"][data-flagship="1"] .tile { border: 0; background: transparent; padding: 0 0 12px; }

/* ---- professional: precise, content-led ----------------------------- */
body[data-trade="professional"][data-flagship="1"] .appbar { background: color-mix(in srgb, var(--bg) 90%, transparent); }
body[data-trade="professional"][data-flagship="1"] .fx-pro { padding-top: 18px; }
body[data-trade="professional"][data-flagship="1"] .fx-pro-head { padding: 20px 0 0; }
body[data-trade="professional"][data-flagship="1"] .fx-pro-head h1 { font-family: var(--display); font-size: clamp(34px, 9.5vw, 46px); line-height: 1.02; letter-spacing: -.045em; font-weight: 500; margin: 10px 0 0; }
body[data-trade="professional"][data-flagship="1"] .fx-pro-head p { font-size: 15px; line-height: 1.42; margin: 13px 0 0; opacity: .62; max-width: 30ch; }
body[data-trade="professional"][data-flagship="1"] .fx-pro-rule { height: 1px; background: color-mix(in srgb, var(--ink) 12%, transparent); margin: 24px 0 0; }
body[data-trade="professional"][data-flagship="1"] .fx-pro-intro { display: grid; grid-template-columns: 88px 1fr; gap: 14px; padding: 20px 0 24px; border-bottom: 1px solid color-mix(in srgb, var(--ink) 8%, transparent); }
body[data-trade="professional"][data-flagship="1"] .fx-pro-intro span { font-size: 8.5px; text-transform: uppercase; letter-spacing: .1em; opacity: .45; padding-top: 2px; }
body[data-trade="professional"][data-flagship="1"] .fx-pro-intro p { font-family: var(--display); font-size: 14px; line-height: 1.5; margin: 0; }
body[data-trade="professional"][data-flagship="1"] .fx-pro-team-head { display: flex; justify-content: space-between; padding: 22px 0 12px; }
body[data-trade="professional"][data-flagship="1"] .fx-pro-team-head span { font-size: 9px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; opacity: .48; }
body[data-trade="professional"][data-flagship="1"] .fx-pro-people { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding-bottom: 24px; border-bottom: 1px solid color-mix(in srgb, var(--ink) 8%, transparent); }
body[data-trade="professional"][data-flagship="1"] .fx-pro-person { min-width: 0; }
body[data-trade="professional"][data-flagship="1"] .fx-pro-portrait { margin: 0 0 9px; overflow: hidden; border-radius: 12px; aspect-ratio: 4 / 3; background: color-mix(in srgb, var(--ink) 5%, transparent); }
body[data-trade="professional"][data-flagship="1"] .fx-pro-portrait img { width: 100%; height: 100%; object-fit: cover; display: block; }
body[data-trade="professional"][data-flagship="1"] .fx-pro-person b { display: block; font-family: var(--display); font-size: 15px; font-weight: 500; letter-spacing: -.015em; }
body[data-trade="professional"][data-flagship="1"] .fx-pro-person span { display: block; margin-top: 3px; font-size: 9.5px; line-height: 1.35; opacity: .5; }
body[data-trade="professional"][data-flagship="1"] .fx-pro-index { display: flex; flex-direction: column; }
body[data-trade="professional"][data-flagship="1"] .fx-pro-row { display: grid; grid-template-columns: 28px 1fr auto; gap: 12px; align-items: start; min-height: 72px; padding: 17px 0; border-bottom: 1px solid color-mix(in srgb, var(--ink) 7%, transparent); cursor: pointer; }
body[data-trade="professional"][data-flagship="1"] .fx-pro-row.has-photo { grid-template-columns: 46px 1fr auto; align-items: center; }
body[data-trade="professional"][data-flagship="1"] .fx-pro-thumb { width: 46px; height: 46px; border-radius: 10px; overflow: hidden; display: block; background: color-mix(in srgb, var(--ink) 5%, transparent); }
body[data-trade="professional"][data-flagship="1"] .fx-pro-thumb .fx-photo { width: 100%; height: 100%; object-fit: cover; display: block; }
body[data-trade="professional"][data-flagship="1"] .fx-pro-num { font-size: 8px; letter-spacing: .08em; opacity: .35; padding-top: 3px; }
body[data-trade="professional"][data-flagship="1"] .fx-pro-row b { display: block; font-size: 13px; font-weight: 600; letter-spacing: -.01em; }
body[data-trade="professional"][data-flagship="1"] .fx-pro-row div span { display: block; font-size: 10.5px; line-height: 1.45; opacity: .5; margin-top: 3px; max-width: 31ch; }
body[data-trade="professional"][data-flagship="1"] .fx-pro-price { font-size: 10px; font-weight: 500; opacity: .6; font-variant-numeric: tabular-nums; padding-top: 2px; white-space: nowrap; }
body[data-trade="professional"][data-flagship="1"] .fx-pro-actions { display: flex; gap: 8px; margin-top: 22px; }
body[data-trade="professional"][data-flagship="1"] .fx-pro-actions .fx-primary { font-size: 11.5px; }
body[data-trade="professional"][data-flagship="1"] .fx-pro-actions .fx-secondary { display: flex; align-items: center; text-decoration: none; font-size: 11.5px; }
body[data-trade="professional"][data-flagship="1"] .fx-empty { margin-top: 20px; }

/* ---- café: a warm counter window ------------------------------------ */
body[data-trade="cafe"][data-flagship="1"] .appbar { background: color-mix(in srgb, var(--bg) 90%, transparent); }
body[data-trade="cafe"][data-flagship="1"] .fx-cafe { padding-top: 6px; }
body[data-trade="cafe"][data-flagship="1"] .fx-cafe-meta { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0 0; font-size: 8.5px; font-weight: 700; letter-spacing: .13em; text-transform: uppercase; opacity: .5; }
.fx-sample { display: inline-flex; align-items: center; padding: 1px 6px; border-radius: 999px; border: 1px dashed currentColor; font-size: 8px; letter-spacing: .1em; text-transform: uppercase; opacity: .8; }
body[data-trade="cafe"][data-flagship="1"] .fx-cafe-head h1 { font-family: var(--display); font-size: clamp(46px, 14vw, 66px); font-weight: 500; line-height: .9; letter-spacing: -.06em; margin: 18px 0 0; max-width: 10ch; }
body[data-trade="cafe"][data-flagship="1"] .fx-cafe-head > p { font-family: var(--display); font-size: 16px; line-height: 1.45; margin: 13px 0 0; max-width: 28ch; opacity: .7; }
body[data-trade="cafe"][data-flagship="1"] .fx-cafe-window { position: relative; margin-top: 24px; }
body[data-trade="cafe"][data-flagship="1"] .fx-cafe-window .fx-art { width: 100%; height: 278px; border-radius: 150px 150px 16px 16px; }
body[data-trade="cafe"][data-flagship="1"] .fx-cafe-stamp { position: absolute; right: 12px; bottom: 16px; display: grid; place-items: center; width: 84px; height: 84px; border-radius: 50%; background: var(--accent); color: #fff7ec; font-family: var(--display); font-size: 12px; line-height: 1.05; text-align: center; transform: rotate(7deg); box-shadow: 0 8px 20px -10px rgba(0,0,0,.55); }
body[data-trade="cafe"][data-flagship="1"] .fx-cafe-stamp i { font-size: 9px; letter-spacing: .1em; text-transform: uppercase; font-style: normal; opacity: .8; }
body[data-trade="cafe"][data-flagship="1"] .fx-cafe-strip { display: flex; justify-content: space-between; gap: 10px; margin-top: 18px; padding: 11px 0; border-top: 1px solid color-mix(in srgb, var(--ink) 12%, transparent); border-bottom: 1px solid color-mix(in srgb, var(--ink) 12%, transparent); font-size: 8.5px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; opacity: .55; }
body[data-trade="cafe"][data-flagship="1"] .fx-cafe-menu-head { display: flex; align-items: baseline; justify-content: space-between; padding: 27px 0 9px; }
body[data-trade="cafe"][data-flagship="1"] .fx-cafe-menu-head > span { font-family: var(--display); font-size: 21px; font-weight: 500; letter-spacing: -.03em; }
body[data-trade="cafe"][data-flagship="1"] .fx-cafe-menu-head button { border: 0; background: none; color: inherit; font: inherit; font-size: 9.5px; opacity: .55; text-decoration: underline; text-underline-offset: 3px; }
body[data-trade="cafe"][data-flagship="1"] .fx-cafe-cats { display: flex; gap: 14px; overflow-x: auto; padding: 0 0 13px; font-size: 9px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; opacity: .66; scrollbar-width: none; }
body[data-trade="cafe"][data-flagship="1"] .fx-cafe-cats::-webkit-scrollbar { display: none; }
body[data-trade="cafe"][data-flagship="1"] .fx-cafe-cats span { flex: 0 0 auto; }
body[data-trade="cafe"][data-flagship="1"] .fx-cafe-menu { display: grid; grid-template-columns: 1fr 1fr; gap: 18px 11px; }
body[data-trade="cafe"][data-flagship="1"] .fx-cafe-item { min-width: 0; cursor: pointer; }
body[data-trade="cafe"][data-flagship="1"] .fx-cafe-item .fx-art { width: 100%; aspect-ratio: 1; border-radius: 999px 999px 10px 10px; }
body[data-trade="cafe"][data-flagship="1"] .fx-cafe-item > div { display: grid; grid-template-columns: 1fr auto; gap: 1px 8px; padding: 8px 2px 0; }
body[data-trade="cafe"][data-flagship="1"] .fx-cafe-item span { grid-column: 1 / -1; font-size: 7.5px; text-transform: uppercase; letter-spacing: .08em; opacity: .62; }
body[data-trade="cafe"][data-flagship="1"] .fx-cafe-item b { font-size: 11.5px; font-weight: 600; line-height: 1.25; }
body[data-trade="cafe"][data-flagship="1"] .fx-cafe-item em { font-style: normal; font-size: 10.5px; opacity: .6; font-variant-numeric: tabular-nums; }
body[data-trade="cafe"][data-flagship="1"] .fx-cafe-order { margin: 26px -18px 0; padding: 24px 18px; background: var(--ink); color: var(--bg); }
body[data-trade="cafe"][data-flagship="1"] .fx-cafe-order .fx-eyebrow { color: var(--bg); opacity: .5; }
body[data-trade="cafe"][data-flagship="1"] .fx-cafe-order > b { display: block; font-family: var(--display); font-size: 27px; line-height: 1.02; letter-spacing: -.04em; font-weight: 500; margin-top: 8px; max-width: 14ch; }
body[data-trade="cafe"][data-flagship="1"] .fx-cafe-order > p { font-size: 11px; line-height: 1.5; opacity: .62; margin: 8px 0 0; max-width: 29ch; }
body[data-trade="cafe"][data-flagship="1"] .fx-cafe-steps { display: flex; justify-content: space-between; gap: 8px; margin: 18px 0 16px; padding: 9px 0; border-top: 1px solid rgba(255,255,255,.18); border-bottom: 1px solid rgba(255,255,255,.18); font-size: 8px; letter-spacing: .11em; text-transform: uppercase; opacity: .55; }
body[data-trade="cafe"][data-flagship="1"] .fx-cafe-order > button { display: flex; justify-content: space-between; align-items: center; width: 100%; min-height: 47px; padding: 0 15px; border: 0; border-radius: 9px; background: var(--accent); color: #fff8ee; font: inherit; font-size: 11.5px; font-weight: 700; }
body[data-trade="cafe"][data-flagship="1"] .fx-cafe-reserve { margin-top: 24px; padding: 18px; border-radius: 18px; background: color-mix(in srgb, var(--accent) 6%, var(--surface)); border: 1px solid color-mix(in srgb, var(--ink) 8%, transparent); }
body[data-trade="cafe"][data-flagship="1"] .fx-cafe-reserve-head > b { display: block; font-family: var(--display); font-size: 23px; line-height: 1.05; letter-spacing: -.03em; font-weight: 500; margin-top: 6px; }
body[data-trade="cafe"][data-flagship="1"] .fx-cafe-reserve-head > p { font-size: 10px; opacity: .52; margin: 5px 0 0; }
body[data-trade="cafe"][data-flagship="1"] .fx-dayrow { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; margin-top: 14px; }
body[data-trade="cafe"][data-flagship="1"] .fx-dayrow button { display: flex; flex-direction: column; align-items: center; gap: 2px; min-height: 54px; padding: 7px 2px; border: 1px solid color-mix(in srgb, var(--ink) 10%, transparent); border-radius: 9px; background: transparent; color: inherit; font: inherit; }
body[data-trade="cafe"][data-flagship="1"] .fx-dayrow button.on { background: var(--ink); color: var(--bg); border-color: var(--ink); }
body[data-trade="cafe"][data-flagship="1"] .fx-dayrow span { font-size: 7px; text-transform: uppercase; letter-spacing: .05em; opacity: .55; }
body[data-trade="cafe"][data-flagship="1"] .fx-dayrow b { font-family: var(--display); font-size: 17px; font-weight: 500; }
body[data-trade="cafe"][data-flagship="1"] .fx-cafe-reserve-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 12px; }
body[data-trade="cafe"][data-flagship="1"] .fx-cafe-reserve-foot > span { font-size: 9px; opacity: .48; }
body[data-trade="cafe"][data-flagship="1"] .fx-cafe-reserve-foot > button { min-height: 40px; padding: 0 14px; border: 0; border-radius: 999px; background: var(--ink); color: var(--bg); font: inherit; font-size: 9.5px; font-weight: 650; }
body[data-trade="cafe"][data-flagship="1"] .fx-cafe-lead { padding: 20px 0 16px; }
body[data-trade="cafe"][data-flagship="1"] .fx-cafe-lead h1 { font-family: var(--display); font-size: 29px; line-height: 1.02; letter-spacing: -.04em; font-weight: 500; margin: 7px 0 0; max-width: 20ch; }
body[data-trade="cafe"][data-flagship="1"] .fx-cafe-lead > p { font-size: 9px; letter-spacing: .05em; text-transform: uppercase; opacity: .48; margin: 9px 0 0; }
body[data-trade="cafe"][data-flagship="1"] .fx-cafe-lead-actions { display: flex; gap: 7px; margin-top: 14px; }
body[data-trade="cafe"][data-flagship="1"] .fx-cafe-lead-actions button { flex: 1; min-height: 40px; border: 0; border-radius: 8px; background: color-mix(in srgb, var(--ink) 6%, transparent); color: inherit; font: inherit; font-size: 9.5px; font-weight: 650; }
body[data-trade="cafe"][data-flagship="1"] .fx-cafe-lead-actions button:last-child { background: var(--ink); color: var(--bg); }

/* ---- gym: a scoreboard built for training --------------------------- */
body[data-trade="gym"][data-flagship="1"] .appbar { border-bottom: 1px solid rgba(255,255,255,.1); }
body[data-trade="gym"][data-flagship="1"] .tab span { display: block; }
body[data-trade="gym"][data-flagship="1"] .fx-gym { padding-top: 0; }
body[data-trade="gym"][data-flagship="1"] .fx-gym-meta { display: flex; justify-content: space-between; gap: 10px; padding-top: 9px; font-family: var(--body); font-size: 8px; font-weight: 700; letter-spacing: .13em; text-transform: uppercase; color: var(--accent-text); }
body[data-trade="gym"][data-flagship="1"] .fx-gym-meta span:last-child { color: var(--muted); }
body[data-trade="gym"][data-flagship="1"] .fx-gym-hero h1 { font-family: var(--display); font-size: clamp(58px, 18vw, 92px); font-weight: 800; line-height: .8; letter-spacing: -.035em; text-transform: uppercase; margin: 22px 0 0; max-width: 8ch; }
body[data-trade="gym"][data-flagship="1"] .fx-gym-hero h1 span { display: block; margin-top: 15px; font-family: var(--body); font-size: 11px; font-weight: 500; line-height: 1.4; letter-spacing: .01em; text-transform: none; color: var(--muted); max-width: 31ch; }
body[data-trade="gym"][data-flagship="1"] .fx-gym-strip { display: grid; grid-template-columns: 1.4fr .8fr; grid-template-rows: 94px 94px; gap: 6px; margin-top: 23px; }
body[data-trade="gym"][data-flagship="1"] .fx-gym-strip .fx-art { width: 100%; height: 100%; border-radius: 3px; }
body[data-trade="gym"][data-flagship="1"] .fx-gym-strip .fx-art:first-child { grid-row: span 2; }
body[data-trade="gym"][data-flagship="1"] .fx-gym-stats { display: grid; grid-template-columns: repeat(3, 1fr); margin-top: 18px; border-top: 1px solid rgba(255,255,255,.16); border-bottom: 1px solid rgba(255,255,255,.16); }
body[data-trade="gym"][data-flagship="1"] .fx-gym-stats div { padding: 12px 8px; border-right: 1px solid rgba(255,255,255,.12); }
body[data-trade="gym"][data-flagship="1"] .fx-gym-stats div:last-child { border-right: 0; }
body[data-trade="gym"][data-flagship="1"] .fx-gym-stats b { display: block; font-family: var(--display); font-size: 25px; line-height: 1; color: var(--paper); }
body[data-trade="gym"][data-flagship="1"] .fx-gym-stats span { display: block; margin-top: 4px; font-size: 7px; letter-spacing: .09em; text-transform: uppercase; color: var(--muted); }
body[data-trade="gym"][data-flagship="1"] .fx-gym-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 28px 0 11px; }
body[data-trade="gym"][data-flagship="1"] .fx-gym-head > span:first-child { font-family: var(--display); font-size: 13px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
body[data-trade="gym"][data-flagship="1"] .fx-gym-head button { border: 0; background: none; color: var(--accent-text); font: inherit; font-size: 8.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; padding: 0; }
body[data-trade="gym"][data-flagship="1"] .fx-gym-plans { display: flex; flex-direction: column; gap: 6px; }
body[data-trade="gym"][data-flagship="1"] .fx-gym-plan { display: grid; grid-template-columns: 27px 1fr auto; align-items: center; gap: 11px; min-height: 76px; padding: 14px 13px; background: var(--surface); cursor: pointer; }
body[data-trade="gym"][data-flagship="1"] .fx-gym-plan.is-feature { background: var(--accent); color: var(--on-accent); }
body[data-trade="gym"][data-flagship="1"] .fx-gym-num { font-family: var(--body); font-size: 8px; font-weight: 700; letter-spacing: .06em; opacity: .48; }
body[data-trade="gym"][data-flagship="1"] .fx-gym-plan > div:nth-child(2) b { display: block; font-family: var(--display); font-size: 17px; font-weight: 800; line-height: 1.05; text-transform: uppercase; letter-spacing: -.01em; }
body[data-trade="gym"][data-flagship="1"] .fx-gym-plan > div:nth-child(2) span { display: block; margin-top: 4px; font-size: 9px; line-height: 1.35; opacity: .6; }
body[data-trade="gym"][data-flagship="1"] .fx-gym-plan.is-feature > div:nth-child(2) span { opacity: .68; }
body[data-trade="gym"][data-flagship="1"] .fx-gym-price { text-align: right; }
body[data-trade="gym"][data-flagship="1"] .fx-gym-price b { display: block; font-family: var(--body); font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; }
body[data-trade="gym"][data-flagship="1"] .fx-gym-price span { display: block; margin-top: 2px; font-size: 7px; letter-spacing: .07em; text-transform: uppercase; opacity: .55; }
body[data-trade="gym"][data-flagship="1"] .fx-gym-smallprint { margin: 8px 0 0; font-size: 7.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
body[data-trade="gym"][data-flagship="1"] .fx-gym-sessions { border-top: 1px solid rgba(255,255,255,.15); }
body[data-trade="gym"][data-flagship="1"] .fx-gym-session { display: grid; grid-template-columns: 22px 1fr auto 31px; align-items: center; gap: 8px; min-height: 62px; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,.12); }
body[data-trade="gym"][data-flagship="1"] .fx-gym-session b { display: block; font-size: 11.5px; font-weight: 700; }
body[data-trade="gym"][data-flagship="1"] .fx-gym-session div span { display: block; margin-top: 2px; font-size: 8.5px; color: var(--muted); }
body[data-trade="gym"][data-flagship="1"] .fx-gym-session em { font-style: normal; font-size: 7.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--accent-text); }
body[data-trade="gym"][data-flagship="1"] .fx-gym-session button { width: 31px; height: 31px; border: 1px solid var(--accent); border-radius: 50%; background: transparent; color: var(--accent-text); font: inherit; font-size: 14px; line-height: 1; }
body[data-trade="gym"][data-flagship="1"] .fx-gym-coaches { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
body[data-trade="gym"][data-flagship="1"] .fx-gym-coach figure { margin: 0 0 7px; aspect-ratio: .8; overflow: hidden; background: var(--surface); }
body[data-trade="gym"][data-flagship="1"] .fx-gym-coach figure img { width: 100%; height: 100%; object-fit: cover; filter: grayscale(1) contrast(1.08); }
body[data-trade="gym"][data-flagship="1"] .fx-gym-coach b { display: block; font-family: var(--display); font-size: 11px; font-weight: 800; line-height: 1.1; text-transform: uppercase; }
body[data-trade="gym"][data-flagship="1"] .fx-gym-coach span { display: block; margin-top: 3px; font-size: 7.5px; color: var(--muted); line-height: 1.3; }
body[data-trade="gym"][data-flagship="1"] .fx-gym-coach em { display: block; margin-top: 2px; font-style: normal; font-size: 6.5px; letter-spacing: .05em; text-transform: uppercase; color: var(--accent-text); }
body[data-trade="gym"][data-flagship="1"] .fx-gym-join { margin-top: 27px; padding: 20px 16px; border: 1px solid rgba(255,255,255,.16); border-left: 3px solid var(--accent); background: var(--surface); }
body[data-trade="gym"][data-flagship="1"] .fx-gym-join > b { display: block; font-family: var(--display); font-size: 24px; font-weight: 800; line-height: .98; letter-spacing: -.01em; text-transform: uppercase; margin-top: 6px; }
body[data-trade="gym"][data-flagship="1"] .fx-gym-join > p { font-size: 10px; line-height: 1.45; color: var(--muted); margin: 7px 0 0; max-width: 30ch; }
body[data-trade="gym"][data-flagship="1"] .fx-gym-join > button { display: flex; justify-content: space-between; align-items: center; width: 100%; min-height: 44px; margin-top: 15px; padding: 0 14px; border: 0; background: var(--accent); color: var(--on-accent); font: inherit; font-size: 9px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
body[data-trade="gym"][data-flagship="1"] .fx-gym-join > a { display: inline-block; margin-top: 12px; font-size: 8px; color: var(--muted); text-decoration: none; }
body[data-trade="gym"][data-flagship="1"] .fx-gym-lead { padding: 20px 0 17px; }
body[data-trade="gym"][data-flagship="1"] .fx-gym-lead h1 { font-family: var(--display); font-size: 34px; font-weight: 800; line-height: .94; letter-spacing: -.02em; text-transform: uppercase; margin: 7px 0 0; max-width: 15ch; }
body[data-trade="gym"][data-flagship="1"] .fx-gym-lead p { font-size: 8px; letter-spacing: .07em; text-transform: uppercase; color: var(--muted); margin: 9px 0 0; }
body[data-trade="gym"][data-flagship="1"] .fx-gym-lead button { min-height: 38px; margin-top: 12px; padding: 0 14px; border: 0; background: var(--accent); color: var(--on-accent); font: inherit; font-size: 8px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }

/* ---- clinic: a calm, numbered care pathway ------------------------- */
body[data-trade="clinic"][data-flagship="1"] .appbar { background: color-mix(in srgb, var(--bg) 88%, transparent); }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic { padding-top: 6px; }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 8px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-badge { padding: 5px 9px; border-radius: 999px; background: color-mix(in srgb, var(--accent) 9%, transparent); color: var(--accent-text); font-weight: 700; }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-hero h1 { font-family: var(--display); font-size: clamp(39px, 11.5vw, 52px); font-weight: 650; line-height: .98; letter-spacing: -.045em; margin: 17px 0 0; max-width: 13ch; }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-hero > p { font-size: 14px; line-height: 1.5; color: var(--muted); margin: 10px 0 0; max-width: 30ch; }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-photo { position: relative; margin-top: 20px; }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-photo .fx-art { width: 100%; aspect-ratio: 1.35; border-radius: 16px; }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-photo > .fx-clinic-addr { position: absolute; left: 10px; bottom: 10px; padding: 6px 9px; border-radius: 6px; background: color-mix(in srgb, var(--bg) 90%, transparent); color: var(--ink); font-size: 7.5px; letter-spacing: .06em; text-transform: uppercase; }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-trust { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-trust span { padding: 5px 8px; border: 1px solid color-mix(in srgb, var(--accent) 16%, transparent); border-radius: 4px; font-size: 7.5px; font-weight: 600; color: var(--accent-text); }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 27px 0 10px; }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-head > span:first-child { font-size: 10px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-head button { border: 0; background: none; color: var(--accent-text); font: inherit; font-size: 8px; font-weight: 650; padding: 0; }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-count { font-size: 8px; color: var(--muted); }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-specs { display: flex; flex-direction: column; border-top: 1px solid var(--line); }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-spec { display: grid; grid-template-columns: 25px 1fr auto 18px; align-items: center; gap: 9px; min-height: 55px; padding: 10px 2px; border: 0; border-bottom: 1px solid var(--line); background: transparent; color: inherit; font: inherit; text-align: left; }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-num { font-size: 7px; font-weight: 700; color: var(--accent-text); opacity: .7; }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-spec b { font-size: 12px; font-weight: 650; }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-spec em { font-style: normal; font-size: 8px; color: var(--muted); }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-go { color: var(--accent-text); font-size: 13px; }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-doctors { display: flex; flex-direction: column; }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-doctor { display: grid; grid-template-columns: 78px 1fr; align-items: center; gap: 14px; padding: 12px 0; border-bottom: 1px solid var(--line); }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-doctor figure { margin: 0; width: 78px; height: 78px; overflow: hidden; border-radius: 50%; background: var(--surface2); }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-doctor figure img { width: 100%; height: 100%; object-fit: cover; }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-doctor b { display: block; font-size: 12.5px; font-weight: 650; }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-doctor span { display: block; margin-top: 2px; font-size: 9px; color: var(--muted); }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-doctor em { display: block; margin-top: 3px; font-style: normal; font-size: 7.5px; letter-spacing: .05em; text-transform: uppercase; color: var(--accent-text); }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-steps { list-style: none; margin: 4px 0 0; padding: 0; }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-steps li { position: relative; display: grid; grid-template-columns: 27px 1fr; gap: 12px; padding-bottom: 18px; }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-steps li::before { content: ""; position: absolute; left: 12px; top: 26px; bottom: 0; width: 1px; background: color-mix(in srgb, var(--accent) 25%, transparent); }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-steps li:last-child::before { display: none; }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-steps li > span { display: grid; place-items: center; width: 27px; height: 27px; border-radius: 50%; background: color-mix(in srgb, var(--accent) 9%, transparent); color: var(--accent-text); font-size: 7.5px; font-weight: 700; }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-steps b { display: block; font-size: 11.5px; font-weight: 650; }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-steps p { font-size: 9.5px; line-height: 1.5; color: var(--muted); margin: 3px 0 0; max-width: 32ch; }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-privacy { margin-top: 8px; padding: 17px 16px; border-radius: 13px; background: color-mix(in srgb, var(--accent) 5%, var(--surface)); border-left: 3px solid var(--accent); }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-privacy > b { display: block; font-size: 15px; font-weight: 650; letter-spacing: -.02em; margin-top: 5px; }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-privacy > p { font-size: 9.5px; line-height: 1.5; color: var(--muted); margin: 6px 0 0; }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-privacy ul { list-style: none; margin: 12px 0 0; padding: 0; display: grid; gap: 6px; }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-privacy li { display: flex; gap: 7px; align-items: flex-start; font-size: 8.5px; line-height: 1.4; color: var(--ink); }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-privacy li::before { content: "✓"; color: var(--accent-text); font-size: 8px; font-weight: 700; }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-book { margin-top: 24px; padding: 18px; border-radius: 15px; background: var(--surface); border: 1px solid var(--line); box-shadow: 0 14px 30px -26px color-mix(in srgb, var(--ink) 55%, transparent); }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-book > div:first-child > b { display: block; font-size: 19px; line-height: 1.1; letter-spacing: -.03em; font-weight: 650; margin-top: 5px; }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-book > div:first-child > p { font-size: 9px; line-height: 1.45; color: var(--muted); margin: 5px 0 0; }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-book .fx-dayrow { grid-template-columns: repeat(3, 1fr); }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-book .fx-dayrow button { border-color: var(--line); }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-book .fx-dayrow button.on { background: var(--accent); border-color: var(--accent); }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-book-foot { display: flex; gap: 7px; margin-top: 12px; }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-book-foot button { flex: 1; min-height: 43px; border: 0; border-radius: 7px; background: var(--accent); color: #fff; font: inherit; font-size: 9.5px; font-weight: 650; }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-book-foot a { display: grid; place-items: center; min-width: 76px; min-height: 43px; border: 1px solid var(--line); border-radius: 7px; color: inherit; text-decoration: none; font-size: 9.5px; }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-lead { padding: 21px 0 16px; }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-lead h1 { font-size: 28px; line-height: 1.02; letter-spacing: -.04em; font-weight: 650; margin: 7px 0 0; max-width: 18ch; }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-lead p { font-size: 9px; color: var(--muted); margin: 8px 0 0; }
body[data-trade="clinic"][data-flagship="1"] .fx-clinic-lead button { min-height: 38px; margin-top: 12px; padding: 0 13px; border: 0; border-radius: 6px; background: var(--accent); color: #fff; font: inherit; font-size: 8.5px; font-weight: 650; }

/* ---- property: a printed listing sheet ----------------------------- */
body[data-trade="property"][data-flagship="1"] .appbar { background: color-mix(in srgb, var(--bg) 92%, transparent); }
body[data-trade="property"][data-flagship="1"] .fx-property { padding-top: 5px; }
body[data-trade="property"][data-flagship="1"] .fx-prop-meta { display: flex; justify-content: space-between; gap: 12px; font-size: 7.5px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
body[data-trade="property"][data-flagship="1"] .fx-prop-hero h1 { font-family: var(--display); font-size: clamp(40px, 12vw, 56px); font-weight: 500; line-height: .95; letter-spacing: -.05em; margin: 16px 0 0; }
body[data-trade="property"][data-flagship="1"] .fx-prop-hero > p { font-family: var(--display); font-size: 15px; line-height: 1.45; margin: 10px 0 0; max-width: 31ch; color: var(--muted); }
body[data-trade="property"][data-flagship="1"] .fx-prop-search { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 46px; margin-top: 17px; padding: 0 12px; border: 1px solid var(--ink); background: transparent; color: var(--ink); font: inherit; font-size: 10px; text-align: left; }
body[data-trade="property"][data-flagship="1"] .fx-prop-search svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.6; }
body[data-trade="property"][data-flagship="1"] .fx-prop-search span { flex: 1; opacity: .55; }
body[data-trade="property"][data-flagship="1"] .fx-prop-search kbd { font: inherit; font-size: 8px; padding: 3px 5px; border: 1px solid var(--line); }
body[data-trade="property"][data-flagship="1"] .fx-prop-cover { margin: 17px 0 0; }
body[data-trade="property"][data-flagship="1"] .fx-prop-cover .fx-art { width: 100%; aspect-ratio: 1.45; border-radius: 2px; }
body[data-trade="property"][data-flagship="1"] .fx-prop-cover figcaption { display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; margin-top: 8px; }
body[data-trade="property"][data-flagship="1"] .fx-prop-cover figcaption span { grid-column: 1 / -1; font-size: 7px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
body[data-trade="property"][data-flagship="1"] .fx-prop-cover figcaption b { font-family: var(--display); font-size: 16px; font-weight: 500; }
body[data-trade="property"][data-flagship="1"] .fx-prop-cover figcaption em { font-style: normal; font-family: var(--display); font-size: 14px; align-self: end; }
body[data-trade="property"][data-flagship="1"] .fx-prop-filters { margin-top: 24px; padding: 14px 0; border-top: 2px solid var(--ink); border-bottom: 1px solid var(--line); }
body[data-trade="property"][data-flagship="1"] .fx-prop-filter-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
body[data-trade="property"][data-flagship="1"] .fx-prop-filter-head span { font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
body[data-trade="property"][data-flagship="1"] .fx-prop-filter-head button { border: 0; background: none; color: inherit; font: inherit; font-size: 8px; text-decoration: underline; text-underline-offset: 2px; }
body[data-trade="property"][data-flagship="1"] .fx-prop-chips { display: flex; gap: 5px; overflow-x: auto; scrollbar-width: none; }
body[data-trade="property"][data-flagship="1"] .fx-prop-chips::-webkit-scrollbar { display: none; }
body[data-trade="property"][data-flagship="1"] .fx-prop-chips button { flex: 0 0 auto; min-height: 35px; padding: 0 10px; border: 1px solid var(--line); background: transparent; color: inherit; font: inherit; font-size: 8.5px; }
body[data-trade="property"][data-flagship="1"] .fx-prop-chips button:first-child { background: var(--ink); border-color: var(--ink); color: var(--bg); }
body[data-trade="property"][data-flagship="1"] .fx-prop-filters > p { margin: 9px 0 0; font-size: 8px; line-height: 1.45; color: var(--muted); }
body[data-trade="property"][data-flagship="1"] .fx-prop-head { display: flex; align-items: baseline; justify-content: space-between; padding: 27px 0 11px; }
body[data-trade="property"][data-flagship="1"] .fx-prop-head span { font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
body[data-trade="property"][data-flagship="1"] .fx-prop-head button { border: 0; background: none; color: inherit; font: inherit; font-size: 8px; text-decoration: underline; text-underline-offset: 2px; }
body[data-trade="property"][data-flagship="1"] .fx-prop-rail { display: flex; gap: 11px; overflow-x: auto; margin: 0 -18px; padding: 0 18px 5px; scroll-snap-type: x mandatory; scrollbar-width: none; }
body[data-trade="property"][data-flagship="1"] .fx-prop-rail::-webkit-scrollbar { display: none; }
body[data-trade="property"][data-flagship="1"] .fx-prop-card { flex: 0 0 78%; min-width: 0; scroll-snap-align: start; cursor: pointer; }
body[data-trade="property"][data-flagship="1"] .fx-prop-card .fx-art { width: 100%; aspect-ratio: 1.25; border-radius: 1px; }
body[data-trade="property"][data-flagship="1"] .fx-prop-card-copy { display: grid; grid-template-columns: 1fr auto; gap: 3px 8px; padding: 8px 1px 0; }
body[data-trade="property"][data-flagship="1"] .fx-prop-card-copy > span { grid-column: 1 / -1; font-size: 7px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
body[data-trade="property"][data-flagship="1"] .fx-prop-card-copy b { font-family: var(--display); font-size: 15px; font-weight: 500; line-height: 1.1; }
body[data-trade="property"][data-flagship="1"] .fx-prop-card-copy em { grid-column: 1 / -1; font-style: normal; font-size: 8px; color: var(--muted); }
body[data-trade="property"][data-flagship="1"] .fx-prop-card-copy strong { grid-column: 1 / -1; margin-top: 2px; font-family: var(--display); font-size: 13px; font-weight: 500; }
body[data-trade="property"][data-flagship="1"] .fx-prop-viewing { margin-top: 24px; padding: 16px; border: 1px solid var(--line); }
body[data-trade="property"][data-flagship="1"] .fx-prop-viewing b { display: block; font-family: var(--display); font-size: 20px; font-weight: 500; letter-spacing: -.03em; margin-top: 5px; }
body[data-trade="property"][data-flagship="1"] .fx-prop-viewing > div:first-child > p { font-size: 8.5px; line-height: 1.4; color: var(--muted); margin: 4px 0 0; }
body[data-trade="property"][data-flagship="1"] .fx-prop-viewing .fx-dayrow { grid-template-columns: repeat(3, 1fr); }
body[data-trade="property"][data-flagship="1"] .fx-prop-viewing .fx-dayrow button.on { background: var(--ink); }
body[data-trade="property"][data-flagship="1"] .fx-prop-viewing > button { display: flex; justify-content: space-between; align-items: center; width: 100%; min-height: 41px; margin-top: 9px; padding: 0 12px; border: 0; background: var(--ink); color: var(--bg); font: inherit; font-size: 9px; font-weight: 650; }
body[data-trade="property"][data-flagship="1"] .fx-prop-enquire { margin-top: 22px; padding: 20px 17px; background: var(--accent); color: #fff; }
body[data-trade="property"][data-flagship="1"] .fx-prop-enquire .fx-eyebrow { color: #fff; opacity: .6; }
body[data-trade="property"][data-flagship="1"] .fx-prop-enquire > b { display: block; font-family: var(--display); font-size: 24px; line-height: 1.02; font-weight: 500; letter-spacing: -.03em; margin-top: 5px; }
body[data-trade="property"][data-flagship="1"] .fx-prop-enquire > p { font-size: 9.5px; line-height: 1.5; opacity: .7; margin: 6px 0 0; max-width: 29ch; }
body[data-trade="property"][data-flagship="1"] .fx-prop-enquire > div { display: flex; gap: 8px; margin-top: 14px; }
body[data-trade="property"][data-flagship="1"] .fx-prop-enquire button { min-height: 39px; padding: 0 12px; border: 0; background: #fff; color: var(--accent-text); font: inherit; font-size: 8.5px; font-weight: 700; }
body[data-trade="property"][data-flagship="1"] .fx-prop-enquire a { display: grid; place-items: center; min-height: 39px; color: #fff; font-size: 8.5px; text-decoration: none; opacity: .8; }
body[data-trade="property"][data-flagship="1"] .fx-prop-lead { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; padding: 20px 0 16px; border-bottom: 1px solid var(--line); }
body[data-trade="property"][data-flagship="1"] .fx-prop-lead h1 { font-family: var(--display); font-size: 26px; line-height: 1.05; letter-spacing: -.04em; font-weight: 500; margin: 6px 0 0; max-width: 18ch; }
body[data-trade="property"][data-flagship="1"] .fx-prop-lead button { flex: 0 0 auto; min-height: 35px; padding: 0 10px; border: 1px solid var(--ink); background: transparent; color: inherit; font: inherit; font-size: 8px; }

/* ---- studio: a poster wall of selected work ------------------------- */
body[data-trade="studio"][data-flagship="1"] .appbar { border-bottom: 1px solid rgba(255,255,255,.12); }
body[data-trade="studio"][data-flagship="1"] .fx-studio { padding-top: 5px; }
body[data-trade="studio"][data-flagship="1"] .fx-studio-meta { display: flex; justify-content: space-between; gap: 10px; padding-top: 9px; font-size: 7.5px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
body[data-trade="studio"][data-flagship="1"] .fx-studio-hero h1 { font-family: var(--display); font-size: clamp(40px, 13.5vw, 70px); font-weight: 600; line-height: .84; letter-spacing: -.06em; text-transform: uppercase; margin: 22px 0 0; max-width: 10ch; }
body[data-trade="studio"][data-flagship="1"] .fx-studio-hero h1 span { display: block; margin-top: 16px; font-size: 11px; font-weight: 400; line-height: 1.4; letter-spacing: .01em; text-transform: none; color: var(--muted); }
body[data-trade="studio"][data-flagship="1"] .fx-studio-grid { display: grid; grid-template-columns: 1.35fr .8fr; grid-template-rows: 130px 130px; gap: 5px; margin-top: 22px; }
body[data-trade="studio"][data-flagship="1"] .fx-studio-grid .fx-art { width: 100%; height: 100%; border-radius: 0; }
body[data-trade="studio"][data-flagship="1"] .fx-studio-grid .fx-art:first-child { grid-row: span 2; }
body[data-trade="studio"][data-flagship="1"] .fx-studio-grid-copy { grid-column: 1 / -1; display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding-top: 7px; border-top: 1px solid rgba(255,255,255,.16); }
body[data-trade="studio"][data-flagship="1"] .fx-studio-grid-copy span { font-size: 7px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
body[data-trade="studio"][data-flagship="1"] .fx-studio-grid-copy b { margin-left: auto; font-size: 8px; font-weight: 500; }
body[data-trade="studio"][data-flagship="1"] .fx-studio-grid-copy em { font-style: normal; font-size: 7px; color: var(--muted); }
body[data-trade="studio"][data-flagship="1"] .fx-studio-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 30px 0 12px; }
body[data-trade="studio"][data-flagship="1"] .fx-studio-head > span:first-child { font-size: 9px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
body[data-trade="studio"][data-flagship="1"] .fx-studio-head > span:last-child { font-size: 8px; color: var(--muted); }
body[data-trade="studio"][data-flagship="1"] .fx-studio-head button { border: 0; background: none; color: var(--muted); font: inherit; font-size: 8px; padding: 0; text-decoration: underline; text-underline-offset: 2px; }
body[data-trade="studio"][data-flagship="1"] .fx-studio-work { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 8px; }
body[data-trade="studio"][data-flagship="1"] .fx-studio-project:nth-child(2) { margin-top: 34px; }
body[data-trade="studio"][data-flagship="1"] .fx-studio-project .fx-art { width: 100%; aspect-ratio: .82; border-radius: 0; }
body[data-trade="studio"][data-flagship="1"] .fx-studio-project:nth-child(2) .fx-art { aspect-ratio: 1; }
body[data-trade="studio"][data-flagship="1"] .fx-studio-project > div:last-child { display: flex; flex-direction: column; gap: 2px; padding-top: 7px; }
body[data-trade="studio"][data-flagship="1"] .fx-studio-project span { font-size: 6.5px; letter-spacing: .09em; text-transform: uppercase; color: var(--muted); }
body[data-trade="studio"][data-flagship="1"] .fx-studio-project b { font-size: 10px; font-weight: 500; }
body[data-trade="studio"][data-flagship="1"] .fx-studio-services { display: flex; flex-direction: column; border-top: 1px solid rgba(255,255,255,.18); }
body[data-trade="studio"][data-flagship="1"] .fx-studio-service { display: grid; grid-template-columns: 24px 1fr auto; align-items: start; gap: 9px; padding: 14px 0; border-bottom: 1px solid rgba(255,255,255,.13); cursor: pointer; }
body[data-trade="studio"][data-flagship="1"] .fx-studio-service > span { font-size: 7px; color: var(--muted); padding-top: 2px; }
body[data-trade="studio"][data-flagship="1"] .fx-studio-service b { display: block; font-size: 12px; font-weight: 500; letter-spacing: -.01em; }
body[data-trade="studio"][data-flagship="1"] .fx-studio-service em { display: block; margin-top: 3px; font-style: normal; font-size: 8.5px; line-height: 1.4; color: var(--muted); max-width: 28ch; }
body[data-trade="studio"][data-flagship="1"] .fx-studio-service strong { font-size: 9px; font-weight: 500; font-variant-numeric: tabular-nums; }
body[data-trade="studio"][data-flagship="1"] .fx-studio-team { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
body[data-trade="studio"][data-flagship="1"] .fx-studio-person figure { margin: 0 0 7px; aspect-ratio: .88; overflow: hidden; background: var(--surface); }
body[data-trade="studio"][data-flagship="1"] .fx-studio-person figure img { width: 100%; height: 100%; object-fit: cover; filter: grayscale(1); }
body[data-trade="studio"][data-flagship="1"] .fx-studio-person b { display: block; font-size: 10.5px; font-weight: 500; }
body[data-trade="studio"][data-flagship="1"] .fx-studio-person span { display: block; margin-top: 2px; font-size: 7.5px; color: var(--muted); }
body[data-trade="studio"][data-flagship="1"] .fx-studio-person em { display: block; margin-top: 3px; font-style: normal; font-size: 6.5px; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); }
body[data-trade="studio"][data-flagship="1"] .fx-studio-book { margin-top: 27px; padding: 21px 0 7px; border-top: 1px solid rgba(255,255,255,.22); border-bottom: 1px solid rgba(255,255,255,.14); }
body[data-trade="studio"][data-flagship="1"] .fx-studio-book > b { display: block; font-family: var(--display); font-size: 31px; font-weight: 600; line-height: .92; letter-spacing: -.045em; text-transform: uppercase; margin-top: 6px; max-width: 10ch; }
body[data-trade="studio"][data-flagship="1"] .fx-studio-book > p { font-size: 9.5px; line-height: 1.5; color: var(--muted); margin: 8px 0 0; max-width: 31ch; }
body[data-trade="studio"][data-flagship="1"] .fx-studio-book > div { display: flex; gap: 6px; margin-top: 15px; }
body[data-trade="studio"][data-flagship="1"] .fx-studio-book button { flex: 1; display: flex; justify-content: space-between; align-items: center; min-height: 44px; padding: 0 12px; border: 0; background: #f6f6f6; color: #0a0a0a; font: inherit; font-size: 8.5px; font-weight: 600; }
body[data-trade="studio"][data-flagship="1"] .fx-studio-book button.is-quiet { flex: 0 0 auto; justify-content: center; background: transparent; border: 1px solid rgba(255,255,255,.3); color: #f6f6f6; }
body[data-trade="studio"][data-flagship="1"] .fx-studio-lead { padding: 20px 0 15px; border-bottom: 1px solid rgba(255,255,255,.13); }
body[data-trade="studio"][data-flagship="1"] .fx-studio-lead h1 { font-family: var(--display); font-size: 31px; font-weight: 600; line-height: .94; letter-spacing: -.045em; text-transform: uppercase; margin: 7px 0 0; max-width: 13ch; }
body[data-trade="studio"][data-flagship="1"] .fx-studio-lead p { font-size: 8px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); margin: 8px 0 0; }

/* ---- trades: a work-order ticket ------------------------------------ */
body[data-trade="trades"][data-flagship="1"] .appbar { border-bottom: 2px solid var(--ink); }
body[data-trade="trades"][data-flagship="1"] .fx-trades { padding-top: 0; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-cover { position: relative; margin: 0 -18px 20px; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-cover .fx-art { width: 100%; aspect-ratio: 1.12; border-radius: 0; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-cover::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, transparent 46%, rgba(10,9,7,.62)); }
body[data-trade="trades"][data-flagship="1"] .fx-trade-cover figcaption { position: absolute; left: 18px; right: 18px; bottom: 14px; z-index: 2; display: flex; align-items: center; justify-content: space-between; gap: 10px; color: #fff; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-cover figcaption span { padding: 5px 8px; background: #f0b429; color: #191307; font-size: 7.5px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-cover figcaption a { font-size: 9.5px; font-weight: 700; letter-spacing: .02em; color: #fff; text-decoration: none; border-bottom: 1px solid rgba(255,255,255,.55); padding-bottom: 2px; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-head { padding-bottom: 16px; border-bottom: 2px solid var(--ink); }
body[data-trade="trades"][data-flagship="1"] .fx-trade-head h1 { font-family: var(--display); font-size: clamp(40px, 12vw, 58px); font-weight: 800; line-height: .9; letter-spacing: -.02em; text-transform: uppercase; margin: 9px 0 0; max-width: 12ch; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-head p { font-size: 12.5px; line-height: 1.5; margin: 11px 0 0; opacity: .68; max-width: 31ch; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-strip { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 12px; padding: 9px 0; border-bottom: 1px solid var(--line); font-size: 8px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
body[data-trade="trades"][data-flagship="1"] .fx-trade-row-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 27px 0 10px; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-row-head > span { font-family: var(--display); font-size: 15px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-row-head button { border: 0; background: none; color: var(--accent-text); font: inherit; font-size: 8.5px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; padding: 0; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-jobs { border-top: 2px solid var(--ink); }
body[data-trade="trades"][data-flagship="1"] .fx-trade-job { display: grid; grid-template-columns: 24px minmax(0, 1fr) auto; align-items: start; gap: 10px; min-height: 66px; padding: 14px 0; border-bottom: 1px dashed color-mix(in srgb, var(--ink) 28%, transparent); cursor: pointer; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-shots { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; margin-top: 14px; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-shots figure { margin: 0; min-width: 0; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-shots .fx-art { width: 100%; aspect-ratio: 1; border-radius: 3px; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-job b { display: block; font-size: 13px; font-weight: 700; letter-spacing: -.01em; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-job div span { display: block; margin-top: 3px; font-size: 10px; line-height: 1.45; color: var(--muted); max-width: 30ch; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-job em { font-style: normal; font-family: var(--mono, var(--body)); font-size: 10px; font-weight: 700; white-space: nowrap; padding-top: 2px; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-proof { margin-top: 22px; padding: 20px 18px; background: var(--ink); color: var(--bg); border-left: 6px solid var(--accent); }
body[data-trade="trades"][data-flagship="1"] .fx-trade-proof .fx-eyebrow { color: var(--accent-text); opacity: 1; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-proof > b { display: block; font-family: var(--display); font-size: 27px; font-weight: 800; line-height: .95; letter-spacing: -.01em; text-transform: uppercase; margin-top: 6px; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-proof > p { font-size: 10px; line-height: 1.5; opacity: .66; margin: 7px 0 0; max-width: 34ch; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-proof ul { list-style: none; margin: 14px 0 0; padding: 0; display: grid; gap: 7px; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-proof li { display: flex; gap: 8px; font-size: 9.5px; line-height: 1.4; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-proof li::before { content: "✓"; color: var(--accent-text); font-size: 9px; font-weight: 800; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-quote { margin-top: 24px; padding: 18px; border: 2px solid var(--ink); background: color-mix(in srgb, var(--accent) 5%, var(--bg)); }
body[data-trade="trades"][data-flagship="1"] .fx-trade-quote > b { display: block; font-family: var(--display); font-size: 25px; font-weight: 800; line-height: .96; letter-spacing: -.01em; text-transform: uppercase; margin-top: 6px; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-quote > p { font-size: 10px; line-height: 1.5; margin: 7px 0 0; opacity: .64; max-width: 33ch; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-steps { list-style: none; display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin: 14px 0 0; padding: 10px 0; border-top: 1px dashed color-mix(in srgb, var(--ink) 30%, transparent); border-bottom: 1px dashed color-mix(in srgb, var(--ink) 30%, transparent); }
body[data-trade="trades"][data-flagship="1"] .fx-trade-steps li { font-size: 8px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-steps li span { display: block; margin-bottom: 2px; font-family: var(--mono, var(--body)); color: var(--accent-text); font-size: 8px; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-quote-foot { display: flex; align-items: center; gap: 10px; margin-top: 14px; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-quote-foot button { flex: 1; display: flex; justify-content: space-between; align-items: center; min-height: 44px; padding: 0 13px; border: 0; background: var(--ink); color: var(--bg); font: inherit; font-size: 9px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-quote-foot a { font-size: 9px; font-weight: 700; color: var(--ink); text-decoration: none; border-bottom: 1px solid var(--ink); padding-bottom: 2px; white-space: nowrap; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-area { margin-top: 24px; padding: 18px; border: 1px solid var(--line); border-top: 2px solid var(--ink); }
body[data-trade="trades"][data-flagship="1"] .fx-trade-area > b { display: block; font-family: var(--display); font-size: 22px; font-weight: 800; text-transform: uppercase; margin-top: 5px; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-area > p { font-size: 10px; line-height: 1.5; margin: 5px 0 0; color: var(--muted); }
body[data-trade="trades"][data-flagship="1"] .fx-trade-response { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 14px; padding-top: 12px; border-top: 1px dashed color-mix(in srgb, var(--ink) 30%, transparent); }
body[data-trade="trades"][data-flagship="1"] .fx-trade-response div { min-width: 0; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-response b { display: block; font-family: var(--display); font-size: 19px; font-weight: 800; color: var(--accent-text); }
body[data-trade="trades"][data-flagship="1"] .fx-trade-response span { display: block; margin-top: 2px; font-size: 7px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
body[data-trade="trades"][data-flagship="1"] .fx-trade-book { margin-top: 24px; padding: 18px; background: var(--surface); border: 1px solid var(--line); }
body[data-trade="trades"][data-flagship="1"] .fx-trade-book-head > b { display: block; font-family: var(--display); font-size: 23px; font-weight: 800; line-height: .98; text-transform: uppercase; margin-top: 5px; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-book-head > p { font-size: 9.5px; color: var(--muted); margin: 5px 0 0; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-book .fx-dayrow { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; margin-top: 13px; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-book .fx-dayrow button { display: flex; flex-direction: column; align-items: center; gap: 1px; min-height: 52px; padding: 7px 2px; border: 1px solid var(--line); border-radius: 0; background: transparent; color: inherit; font: inherit; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-book .fx-dayrow button.on { background: var(--ink); color: var(--bg); border-color: var(--ink); }
body[data-trade="trades"][data-flagship="1"] .fx-trade-book .fx-dayrow span { font-size: 6.5px; letter-spacing: .06em; text-transform: uppercase; opacity: .6; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-book .fx-dayrow b { font-family: var(--display); font-size: 16px; font-weight: 800; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-slots { display: flex; gap: 5px; margin-top: 7px; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-slots button { flex: 1; min-height: 36px; border: 1px solid var(--line); background: transparent; color: inherit; font: inherit; font-size: 9px; font-weight: 700; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-book-cta { display: flex; justify-content: space-between; align-items: center; width: 100%; min-height: 44px; margin-top: 10px; padding: 0 13px; border: 0; background: var(--accent); color: #fff; font: inherit; font-size: 9.5px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-lead { padding: 20px 0 16px; border-bottom: 2px solid var(--ink); }
body[data-trade="trades"][data-flagship="1"] .fx-trade-lead h1 { font-family: var(--display); font-size: 30px; font-weight: 800; line-height: .92; letter-spacing: -.01em; text-transform: uppercase; margin: 7px 0 0; max-width: 15ch; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-lead p { font-size: 8px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); margin: 8px 0 0; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-lead-actions { display: flex; gap: 6px; margin-top: 12px; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-lead-actions button { flex: 1; min-height: 38px; border: 1px solid var(--ink); background: transparent; color: inherit; font: inherit; font-size: 8px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
body[data-trade="trades"][data-flagship="1"] .fx-trade-lead-actions button:first-child { background: var(--ink); color: var(--bg); }

/* ---- auto: a workshop job card -------------------------------------- */
body[data-trade="auto"][data-flagship="1"] .appbar { border-bottom: 3px solid var(--accent); }
body[data-trade="auto"][data-flagship="1"] .fx-auto { padding-top: 4px; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-top { display: flex; justify-content: space-between; gap: 10px; padding-top: 8px; font-size: 7.5px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
body[data-trade="auto"][data-flagship="1"] .fx-auto-hero h1 { font-family: var(--display); font-size: clamp(46px, 14vw, 66px); font-weight: 800; line-height: .82; letter-spacing: -.01em; text-transform: uppercase; margin: 16px 0 0; max-width: 9ch; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-hero > p { font-size: 12px; line-height: 1.5; color: var(--muted); margin: 10px 0 0; max-width: 32ch; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-plate { display: inline-flex; align-items: center; gap: 0; margin-top: 14px; border: 2px solid #171b1f; border-radius: 4px; overflow: hidden; background: #f3c531; box-shadow: 0 3px 0 rgba(23,27,31,.18); }
body[data-trade="auto"][data-flagship="1"] .fx-auto-plate i { display: grid; place-items: center; width: 20px; align-self: stretch; background: #1d3f8f; color: #fff; font-style: normal; font-size: 6px; font-weight: 800; letter-spacing: .04em; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-plate b { padding: 4px 12px 3px; font-family: var(--display); font-size: 21px; font-weight: 800; letter-spacing: .06em; color: #171b1f; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-cover { margin: 16px 0 0; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-cover .fx-art { width: 100%; aspect-ratio: 1.5; border-radius: 6px; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-cta { display: flex; gap: 6px; margin-top: 10px; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-cta button { flex: 1; min-height: 44px; border: 0; border-radius: 4px; background: var(--accent); color: #fff; font: inherit; font-size: 9px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-cta button.is-quiet { flex: 0 0 40%; background: transparent; border: 1px solid var(--line); color: var(--ink); }
body[data-trade="auto"][data-flagship="1"] .fx-auto-block-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 26px 0 10px; border-bottom: 2px solid var(--ink); }
body[data-trade="auto"][data-flagship="1"] .fx-auto-block-head > span:first-child { font-family: var(--display); font-size: 16px; font-weight: 800; letter-spacing: .02em; text-transform: uppercase; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-block-head button { border: 0; background: none; color: var(--accent-text); font: inherit; font-size: 8px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; padding: 0; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-count { font-size: 8px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); }
body[data-trade="auto"][data-flagship="1"] .fx-auto-vehicle { margin-top: 22px; padding: 16px; background: var(--surface); border: 1px solid var(--line); border-radius: 6px; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-vehicle .fx-auto-block-head { padding: 0 0 10px; border-bottom-width: 1px; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-types { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-top: 11px; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-types span { padding: 9px 10px; border: 1px solid var(--line); border-radius: 3px; font-size: 8.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-vehicle > p { font-size: 9px; line-height: 1.45; color: var(--muted); margin: 9px 0 0; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-vehicle > button, body[data-trade="auto"][data-flagship="1"] .fx-auto-ask { display: flex; align-items: center; justify-content: center; width: 100%; min-height: 38px; margin-top: 10px; border: 0; border-radius: 3px; background: var(--ink); color: var(--bg); font: inherit; font-size: 8.5px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; text-decoration: none; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-jobs { display: flex; flex-direction: column; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-job { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 9px; min-height: 58px; padding: 12px 2px; border-bottom: 1px solid var(--line); cursor: pointer; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-shots { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; margin-top: 14px; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-shots figure { margin: 0; min-width: 0; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-shots .fx-art { width: 100%; aspect-ratio: 1; border-radius: 4px; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-job b { display: block; font-size: 11.5px; font-weight: 700; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-job div span { display: block; margin-top: 2px; font-size: 8.5px; color: var(--muted); }
body[data-trade="auto"][data-flagship="1"] .fx-auto-job em { font-style: normal; font-size: 7.5px; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); white-space: nowrap; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-job strong { font-family: var(--mono, var(--body)); font-size: 10.5px; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-slots { margin-top: 22px; padding: 17px 16px; background: var(--surface2); border-top: 4px solid var(--accent); border-radius: 4px; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-slots-head > b { display: block; font-family: var(--display); font-size: 24px; font-weight: 800; line-height: .92; text-transform: uppercase; margin-top: 5px; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-slots-head > p { font-size: 9px; line-height: 1.45; color: var(--muted); margin: 5px 0 0; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-slots .fx-dayrow { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; margin-top: 12px; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-slots .fx-dayrow button { display: flex; flex-direction: column; align-items: center; gap: 1px; min-height: 50px; padding: 6px 2px; border: 1px solid var(--line); border-radius: 3px; background: var(--surface); color: inherit; font: inherit; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-slots .fx-dayrow button.on { background: var(--accent); color: #fff; border-color: var(--accent); }
body[data-trade="auto"][data-flagship="1"] .fx-auto-slots .fx-dayrow span { font-size: 6px; letter-spacing: .05em; text-transform: uppercase; opacity: .65; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-slots .fx-dayrow b { font-family: var(--display); font-size: 15px; font-weight: 800; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-times { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin-top: 6px; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-times button { min-height: 32px; border: 1px solid var(--line); border-radius: 3px; background: transparent; color: inherit; font: inherit; font-size: 8px; font-weight: 700; font-variant-numeric: tabular-nums; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-times button.on { background: var(--ink); color: var(--bg); border-color: var(--ink); }
body[data-trade="auto"][data-flagship="1"] .fx-auto-book { display: flex; justify-content: space-between; align-items: center; width: 100%; min-height: 42px; margin-top: 8px; padding: 0 12px; border: 0; border-radius: 3px; background: var(--ink); color: var(--bg); font: inherit; font-size: 8.5px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-promise { margin-top: 24px; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-promise > b { display: block; font-family: var(--display); font-size: 23px; font-weight: 800; text-transform: uppercase; margin-top: 5px; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-promise > p { font-size: 9px; color: var(--muted); margin: 5px 0 0; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-promise ul { list-style: none; margin: 12px 0 0; padding: 0; border-top: 1px solid var(--line); }
body[data-trade="auto"][data-flagship="1"] .fx-auto-promise li { display: grid; grid-template-columns: 26px 1fr; gap: 9px; align-items: center; padding: 9px 0; border-bottom: 1px solid var(--line); font-size: 9.5px; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-promise li span { font-family: var(--mono, var(--body)); font-size: 7.5px; color: var(--accent-text); font-weight: 700; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-quote { margin-top: 22px; padding: 18px 16px; background: var(--ink); color: var(--bg); border-radius: 4px; position: relative; overflow: hidden; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-quote::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 6px; background: repeating-linear-gradient(135deg, var(--accent) 0 8px, #f3c531 8px 16px); }
body[data-trade="auto"][data-flagship="1"] .fx-auto-quote .fx-eyebrow { color: var(--accent-text); opacity: 1; margin-top: 6px; display: block; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-quote > b { display: block; font-family: var(--display); font-size: 25px; font-weight: 800; line-height: .94; text-transform: uppercase; margin-top: 5px; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-quote > p { font-size: 9.5px; line-height: 1.5; opacity: .66; margin: 6px 0 0; max-width: 31ch; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-quote > button { display: flex; justify-content: space-between; align-items: center; width: 100%; min-height: 42px; margin-top: 12px; padding: 0 12px; border: 0; border-radius: 3px; background: var(--accent); color: #fff; font: inherit; font-size: 8.5px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-quote > a { display: inline-block; margin-top: 12px; color: var(--bg); font-size: 9px; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-lead { display: grid; grid-template-columns: 1fr auto; align-items: end; gap: 8px; padding: 20px 0 15px; border-bottom: 2px solid var(--ink); }
body[data-trade="auto"][data-flagship="1"] .fx-auto-lead h1 { font-family: var(--display); font-size: 27px; font-weight: 800; line-height: .94; text-transform: uppercase; margin: 6px 0 0; max-width: 17ch; }
body[data-trade="auto"][data-flagship="1"] .fx-auto-lead button { grid-column: 1 / -1; min-height: 36px; border: 0; border-radius: 3px; background: var(--accent); color: #fff; font: inherit; font-size: 8px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; }

/* ---- ecommerce: a small-batch drop feed ----------------------------- */
body[data-trade="ecommerce"][data-flagship="1"] .appbar { border-bottom: 0; }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom { padding-top: 4px; }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-top { display: flex; justify-content: space-between; gap: 10px; padding-top: 8px; font-size: 8px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-hero h1 { font-family: var(--display); font-size: clamp(36px, 10.5vw, 48px); font-weight: 700; line-height: .96; letter-spacing: -.045em; margin: 12px 0 0; max-width: 15ch; }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-hero h1 span { display: block; margin-top: 9px; font-family: var(--body); font-size: 11.5px; font-weight: 400; line-height: 1.45; letter-spacing: 0; color: var(--muted); max-width: 33ch; }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-collage { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin-top: 16px; }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-collage figure { margin: 0; min-width: 0; }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-collage .fx-art { width: 100%; aspect-ratio: 1; border-radius: 10px; }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-collage figure:nth-child(2) .fx-art, body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-collage figure:nth-child(4) .fx-art { margin-top: 14px; }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-strip { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 14px; }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-strip span { max-width: 100%; padding: 5px 9px; border-radius: 999px; background: color-mix(in srgb, var(--accent) 8%, transparent); color: var(--accent-text); font-size: 7.5px; font-weight: 700; letter-spacing: .02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 28px 0 10px; }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-head span:first-child { font-family: var(--display); font-size: 19px; font-weight: 700; letter-spacing: -.03em; }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-head button { border: 0; background: none; color: var(--accent-text); font: inherit; font-size: 9px; font-weight: 600; padding: 0; }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-count { font-size: 8px; color: var(--muted); }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-rail { display: flex; gap: 9px; overflow-x: auto; margin: 0 -18px; padding: 0 18px 6px; scroll-snap-type: x mandatory; scrollbar-width: none; }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-rail::-webkit-scrollbar { display: none; }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-pick { flex: 0 0 58%; min-width: 0; scroll-snap-align: start; cursor: pointer; }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-pick figure { margin: 0; }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-pick .fx-art { width: 100%; aspect-ratio: .82; border-radius: 14px; }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-pick b { display: block; margin-top: 7px; font-size: 11px; font-weight: 600; }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-pick > span { display: block; margin-top: 1px; font-size: 10px; color: var(--muted); font-variant-numeric: tabular-nums; }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-card { min-width: 0; padding: 6px 6px 8px; border-radius: 16px; background: var(--surface); }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-shot { display: block; width: 100%; padding: 0; border: 0; background: transparent; }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-shot .fx-art { width: 100%; aspect-ratio: 1; border-radius: 11px; }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-copy { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 1px 6px; padding: 7px 3px 0; }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-copy b { font-size: 10.5px; font-weight: 600; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-copy > span { grid-column: 1; font-size: 9.5px; color: var(--muted); font-variant-numeric: tabular-nums; }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-copy button { grid-column: 2; grid-row: 1 / span 2; display: grid; place-items: center; width: 30px; height: 30px; border: 0; border-radius: 50%; background: var(--ink); color: var(--bg); font: inherit; font-size: 15px; line-height: 1; }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-delivery { margin-top: 26px; padding: 12px 12px 18px; border-radius: 18px; background: var(--accent); color: #fff; }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-delivery-shot { position: relative; margin: 0 0 14px; overflow: hidden; border-radius: 12px; }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-delivery-shot .fx-art { width: 100%; aspect-ratio: 1.9; border-radius: 12px; }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-delivery > button { margin-left: 5px; margin-right: 5px; width: calc(100% - 10px); }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-delivery .fx-eyebrow { color: #fff; opacity: .62; }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-delivery-copy { padding: 0 5px; }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-delivery-copy > b { display: block; font-family: var(--display); font-size: 25px; font-weight: 700; line-height: 1; letter-spacing: -.04em; margin-top: 5px; }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-delivery-copy > p { font-size: 9.5px; line-height: 1.5; opacity: .74; margin: 6px 0 0; max-width: 32ch; }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-ways { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 14px 5px 0; }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-ways > div { padding: 10px 11px; border-radius: 11px; background: rgba(255,255,255,.13); }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-ways b { display: block; font-size: 9.5px; font-weight: 700; }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-ways span { display: block; margin-top: 3px; font-size: 8px; line-height: 1.4; opacity: .74; }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-delivery > button { display: flex; justify-content: space-between; align-items: center; width: 100%; min-height: 43px; margin-top: 12px; padding: 0 13px; border: 0; border-radius: 10px; background: #fff; color: var(--accent-text); font: inherit; font-size: 9px; font-weight: 700; letter-spacing: .02em; }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-rewards { margin-top: 24px; padding: 17px 16px; border-radius: 16px; border: 1px dashed color-mix(in srgb, var(--ink) 24%, transparent); }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-rewards-head b { display: block; font-family: var(--display); font-size: 19px; font-weight: 700; letter-spacing: -.03em; margin-top: 4px; }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-stamps { display: flex; gap: 6px; margin-top: 11px; }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-stamps i { width: 22px; height: 22px; border-radius: 50%; border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent); background: color-mix(in srgb, var(--accent) 8%, transparent); }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-rewards > p { font-size: 9.5px; line-height: 1.45; margin: 10px 0 0; }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-rewards > span { display: block; margin-top: 3px; font-size: 7.5px; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-lead { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; padding: 20px 0 15px; }
body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-lead h1 { font-family: var(--display); font-size: 27px; font-weight: 700; line-height: 1; letter-spacing: -.04em; margin: 6px 0 0; max-width: 17ch; }

/* ---- courses: a learning path -------------------------------------- */
body[data-trade="courses"][data-flagship="1"] .appbar { border-bottom: 1px solid rgba(255,255,255,.1); }
body[data-trade="courses"][data-flagship="1"] .fx-courses { padding-top: 4px; }
body[data-trade="courses"][data-flagship="1"] .fx-course-top { display: flex; justify-content: space-between; gap: 10px; padding-top: 8px; font-size: 7.5px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
body[data-trade="courses"][data-flagship="1"] .fx-course-hero h1 { font-family: var(--display); font-size: clamp(37px, 11vw, 50px); font-weight: 700; line-height: .94; letter-spacing: -.05em; margin: 15px 0 0; max-width: 13ch; }
body[data-trade="courses"][data-flagship="1"] .fx-course-hero h1 span { display: block; margin-top: 11px; font-family: var(--body); font-size: 11.5px; font-weight: 400; line-height: 1.45; letter-spacing: 0; color: var(--muted); max-width: 32ch; }
body[data-trade="courses"][data-flagship="1"] .fx-course-cover { position: relative; margin: 18px 0 0; }
body[data-trade="courses"][data-flagship="1"] .fx-course-cover .fx-art { width: 100%; aspect-ratio: 1.55; border-radius: 16px; }
body[data-trade="courses"][data-flagship="1"] .fx-course-cover figcaption { position: absolute; left: 12px; bottom: 12px; padding: 5px 9px; border-radius: 999px; background: rgba(9,14,26,.72); backdrop-filter: blur(10px); font-size: 7.5px; letter-spacing: .04em; color: #eef2fb; }
body[data-trade="courses"][data-flagship="1"] .fx-course-strip { display: flex; justify-content: space-between; gap: 8px; margin-top: 12px; padding: 9px 0; border-top: 1px solid rgba(255,255,255,.12); border-bottom: 1px solid rgba(255,255,255,.12); font-size: 7.5px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); }
body[data-trade="courses"][data-flagship="1"] .fx-course-start { display: flex; justify-content: space-between; align-items: center; width: 100%; min-height: 46px; margin-top: 12px; padding: 0 15px; border: 0; border-radius: 12px; background: var(--accent); color: #fff; font: inherit; font-size: 10.5px; font-weight: 700; }
body[data-trade="courses"][data-flagship="1"] .fx-course-block-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 28px 0 12px; }
body[data-trade="courses"][data-flagship="1"] .fx-course-block-head > span:first-child { font-family: var(--display); font-size: 17px; font-weight: 700; letter-spacing: -.02em; }
body[data-trade="courses"][data-flagship="1"] .fx-course-block-head button { border: 0; background: none; color: var(--accent-text); font: inherit; font-size: 8.5px; font-weight: 600; padding: 0; }
body[data-trade="courses"][data-flagship="1"] .fx-course-path { list-style: none; margin: 0; padding: 0; }
body[data-trade="courses"][data-flagship="1"] .fx-course-path li { position: relative; display: grid; grid-template-columns: 34px 1fr; gap: 13px; padding-bottom: 16px; }
body[data-trade="courses"][data-flagship="1"] .fx-course-path li::before { content: ""; position: absolute; left: 16px; top: 34px; bottom: 0; width: 2px; background: linear-gradient(180deg, var(--accent), color-mix(in srgb, var(--accent) 15%, transparent)); }
body[data-trade="courses"][data-flagship="1"] .fx-course-path li:last-child::before { display: none; }
body[data-trade="courses"][data-flagship="1"] .fx-course-node { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; border: 1px solid var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); font-size: 9px; font-weight: 700; color: var(--accent-text); }
body[data-trade="courses"][data-flagship="1"] .fx-course-path b { display: block; font-size: 12px; font-weight: 600; padding-top: 2px; }
body[data-trade="courses"][data-flagship="1"] .fx-course-path p { font-size: 9.5px; line-height: 1.5; color: var(--muted); margin: 3px 0 0; max-width: 30ch; }
body[data-trade="courses"][data-flagship="1"] .fx-course-list { display: flex; flex-direction: column; gap: 10px; }
body[data-trade="courses"][data-flagship="1"] .fx-course-card { display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 12px; padding: 8px; border-radius: 14px; background: var(--surface); }
body[data-trade="courses"][data-flagship="1"] .fx-course-card figure { margin: 0; }
body[data-trade="courses"][data-flagship="1"] .fx-course-card .fx-art { width: 100%; height: 100%; min-height: 104px; border-radius: 9px; }
body[data-trade="courses"][data-flagship="1"] .fx-course-copy { min-width: 0; padding: 3px 2px 2px 0; }
body[data-trade="courses"][data-flagship="1"] .fx-course-copy > span { font-size: 6.5px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--accent-text); }
body[data-trade="courses"][data-flagship="1"] .fx-course-copy > b { display: block; margin-top: 3px; font-size: 12px; font-weight: 600; line-height: 1.2; }
body[data-trade="courses"][data-flagship="1"] .fx-course-copy > p { font-size: 8.5px; line-height: 1.4; color: var(--muted); margin: 3px 0 0; }
body[data-trade="courses"][data-flagship="1"] .fx-course-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; }
body[data-trade="courses"][data-flagship="1"] .fx-course-foot strong { font-family: var(--mono, var(--body)); font-size: 10px; font-weight: 600; }
body[data-trade="courses"][data-flagship="1"] .fx-course-foot button { min-height: 38px; padding: 0 11px; border: 1px solid rgba(255,255,255,.22); border-radius: 6px; background: transparent; color: var(--ink); font: inherit; font-size: 7.5px; font-weight: 600; }
body[data-trade="courses"][data-flagship="1"] .fx-course-included { margin-top: 6px; padding: 17px 16px; border-radius: 14px; border: 1px solid rgba(255,255,255,.14); background: color-mix(in srgb, var(--accent) 6%, transparent); }
body[data-trade="courses"][data-flagship="1"] .fx-course-included > b { display: block; font-family: var(--display); font-size: 22px; font-weight: 700; letter-spacing: -.03em; margin-top: 5px; }
body[data-trade="courses"][data-flagship="1"] .fx-course-included ul { list-style: none; margin: 11px 0 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
body[data-trade="courses"][data-flagship="1"] .fx-course-included li { display: flex; gap: 6px; align-items: flex-start; font-size: 8.5px; line-height: 1.4; }
body[data-trade="courses"][data-flagship="1"] .fx-course-included li::before { content: "✓"; color: var(--accent-text); font-size: 8px; font-weight: 700; }
body[data-trade="courses"][data-flagship="1"] .fx-course-included > p { font-size: 8.5px; line-height: 1.5; color: var(--muted); margin: 11px 0 0; }
body[data-trade="courses"][data-flagship="1"] .fx-course-enrol { margin-top: 24px; padding: 20px 17px; border-radius: 16px; background: linear-gradient(150deg, color-mix(in srgb, var(--accent) 88%, #000) 0%, #222a63 100%); color: #fff; }
body[data-trade="courses"][data-flagship="1"] .fx-course-enrol .fx-eyebrow { color: #fff; opacity: .6; }
body[data-trade="courses"][data-flagship="1"] .fx-course-enrol > b { display: block; font-family: var(--display); font-size: 26px; font-weight: 700; line-height: .98; letter-spacing: -.04em; margin-top: 5px; max-width: 13ch; }
body[data-trade="courses"][data-flagship="1"] .fx-course-enrol > p { font-size: 9.5px; line-height: 1.5; opacity: .76; margin: 7px 0 0; max-width: 32ch; }
body[data-trade="courses"][data-flagship="1"] .fx-course-enrol > button { display: flex; justify-content: space-between; align-items: center; width: 100%; min-height: 43px; margin-top: 13px; padding: 0 13px; border: 0; border-radius: 9px; background: #fff; color: #1b2350; font: inherit; font-size: 9px; font-weight: 700; }
body[data-trade="courses"][data-flagship="1"] .fx-course-enrol > a { display: inline-block; margin-top: 11px; font-size: 8.5px; color: #fff; opacity: .7; text-decoration: none; }
body[data-trade="courses"][data-flagship="1"] .fx-course-lead { padding: 21px 0 15px; border-bottom: 1px solid rgba(255,255,255,.13); }
body[data-trade="courses"][data-flagship="1"] .fx-course-lead h1 { font-family: var(--display); font-size: 28px; font-weight: 700; line-height: .98; letter-spacing: -.04em; margin: 6px 0 0; max-width: 17ch; }
body[data-trade="courses"][data-flagship="1"] .fx-course-lead p { font-size: 8px; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); margin: 8px 0 0; }

/* ---- finance: an advisory note ------------------------------------- */
body[data-trade="finance"][data-flagship="1"] .appbar { border-bottom: 1px solid var(--line); background: color-mix(in srgb, var(--bg) 94%, transparent); }
body[data-trade="finance"][data-flagship="1"] .fx-finance { padding-top: 4px; }
body[data-trade="finance"][data-flagship="1"] .fx-fin-top { display: flex; justify-content: space-between; gap: 10px; padding: 10px 0 9px; border-bottom: 1px solid var(--ink); font-size: 7px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
body[data-trade="finance"][data-flagship="1"] .fx-fin-hero h1 { font-family: var(--display); font-size: clamp(38px, 11vw, 54px); font-weight: 500; line-height: .94; letter-spacing: -.045em; margin: 15px 0 0; max-width: 14ch; }
body[data-trade="finance"][data-flagship="1"] .fx-fin-hero > p { font-family: var(--display); font-size: 15px; line-height: 1.42; margin: 11px 0 0; max-width: 31ch; color: var(--muted); }
body[data-trade="finance"][data-flagship="1"] .fx-fin-cover { margin: 16px 0 0; padding: 5px; border: 1px solid var(--ink); background: var(--surface); }
body[data-trade="finance"][data-flagship="1"] .fx-fin-cover .fx-art { width: 100%; aspect-ratio: 1.85; border-radius: 0; }
body[data-trade="finance"][data-flagship="1"] .fx-fin-actions { display: flex; align-items: center; gap: 14px; margin-top: 13px; }
body[data-trade="finance"][data-flagship="1"] .fx-fin-actions button { flex: 1; min-height: 43px; border: 0; background: var(--ink); color: var(--bg); font: inherit; font-size: 9px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
body[data-trade="finance"][data-flagship="1"] .fx-fin-actions a { font-size: 9px; font-weight: 600; color: var(--ink); text-decoration: none; border-bottom: 1px solid var(--ink); padding-bottom: 2px; }
body[data-trade="finance"][data-flagship="1"] .fx-fin-disclosure { margin-top: 24px; padding: 16px 15px; border: 1px solid var(--line); border-left: 4px solid var(--accent); background: color-mix(in srgb, var(--accent) 4%, var(--surface)); }
body[data-trade="finance"][data-flagship="1"] .fx-fin-label { display: inline-block; font-size: 6.5px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--accent-text); }
body[data-trade="finance"][data-flagship="1"] .fx-fin-disclosure > b { display: block; font-family: var(--display); font-size: 20px; font-weight: 500; letter-spacing: -.025em; margin-top: 4px; }
body[data-trade="finance"][data-flagship="1"] .fx-fin-disclosure > p { font-size: 9.5px; line-height: 1.55; margin: 6px 0 0; color: var(--muted); }
body[data-trade="finance"][data-flagship="1"] .fx-fin-disclosure ul { list-style: none; margin: 10px 0 0; padding: 9px 0 0; border-top: 1px solid var(--line); display: grid; gap: 5px; }
body[data-trade="finance"][data-flagship="1"] .fx-fin-disclosure li { display: flex; gap: 7px; font-size: 8px; line-height: 1.4; }
body[data-trade="finance"][data-flagship="1"] .fx-fin-disclosure li::before { content: "—"; color: var(--accent-text); font-size: 8px; }
body[data-trade="finance"][data-flagship="1"] .fx-fin-block-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 26px 0 9px; border-bottom: 1px solid var(--ink); }
body[data-trade="finance"][data-flagship="1"] .fx-fin-block-head > span:first-child { font-family: var(--display); font-size: 19px; font-weight: 500; letter-spacing: -.02em; }
body[data-trade="finance"][data-flagship="1"] .fx-fin-block-head button { border: 0; background: none; color: var(--muted); font: inherit; font-size: 7.5px; letter-spacing: .04em; text-transform: uppercase; padding: 0; }
body[data-trade="finance"][data-flagship="1"] .fx-fin-table { display: flex; flex-direction: column; }
body[data-trade="finance"][data-flagship="1"] .fx-fin-row { display: grid; grid-template-columns: 38px minmax(0, 1fr) auto; gap: 2px 10px; align-items: center; padding: 11px 0; border-bottom: 1px solid var(--line); cursor: pointer; }
body[data-trade="finance"][data-flagship="1"] .fx-fin-thumb { grid-row: 1 / span 2; display: block; width: 38px; height: 38px; overflow: hidden; border-radius: 50%; background: var(--surface2); }
body[data-trade="finance"][data-flagship="1"] .fx-fin-thumb .fx-art { width: 38px; height: 38px; border-radius: 50%; }
body[data-trade="finance"][data-flagship="1"] .fx-fin-thumb .fx-photo { width: 100%; height: 100%; object-fit: cover; display: block; }
body[data-trade="finance"][data-flagship="1"] .fx-fin-row b { font-size: 11.5px; font-weight: 600; }
body[data-trade="finance"][data-flagship="1"] .fx-fin-row div span { display: block; margin-top: 2px; font-size: 8.5px; line-height: 1.4; color: var(--muted); }
body[data-trade="finance"][data-flagship="1"] .fx-fin-row em { grid-column: 2; font-style: normal; font-size: 7px; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); }
body[data-trade="finance"][data-flagship="1"] .fx-fin-row strong { grid-column: 3; grid-row: 1 / span 2; align-self: center; font-family: var(--mono, var(--body)); font-size: 10px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
body[data-trade="finance"][data-flagship="1"] .fx-fin-process { list-style: none; margin: 0; padding: 0; }
body[data-trade="finance"][data-flagship="1"] .fx-fin-process li { display: grid; grid-template-columns: 26px 1fr; gap: 11px; padding: 13px 0; border-bottom: 1px solid var(--line); }
body[data-trade="finance"][data-flagship="1"] .fx-fin-process li > span { font-family: var(--display); font-size: 15px; color: var(--accent-text); }
body[data-trade="finance"][data-flagship="1"] .fx-fin-process b { display: block; font-family: var(--display); font-size: 13.5px; font-weight: 500; }
body[data-trade="finance"][data-flagship="1"] .fx-fin-process p { font-size: 8.5px; line-height: 1.5; color: var(--muted); margin: 3px 0 0; max-width: 33ch; }
body[data-trade="finance"][data-flagship="1"] .fx-fin-advisers { display: flex; flex-direction: column; }
body[data-trade="finance"][data-flagship="1"] .fx-fin-adviser { display: grid; grid-template-columns: 62px 1fr; gap: 13px; align-items: center; padding: 11px 0; border-bottom: 1px solid var(--line); }
body[data-trade="finance"][data-flagship="1"] .fx-fin-adviser figure { margin: 0; width: 62px; height: 62px; overflow: hidden; border-radius: 50%; background: var(--surface2); }
body[data-trade="finance"][data-flagship="1"] .fx-fin-adviser figure img { width: 100%; height: 100%; object-fit: cover; filter: grayscale(1); }
body[data-trade="finance"][data-flagship="1"] .fx-fin-adviser b { display: block; font-family: var(--display); font-size: 14px; font-weight: 500; }
body[data-trade="finance"][data-flagship="1"] .fx-fin-adviser span { display: block; margin-top: 2px; font-size: 8.5px; color: var(--muted); }
body[data-trade="finance"][data-flagship="1"] .fx-fin-adviser em { display: block; margin-top: 3px; font-style: normal; font-size: 6.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--accent-text); }
body[data-trade="finance"][data-flagship="1"] .fx-fin-review { margin-top: 24px; padding: 16px; border: 1px solid var(--ink); background: var(--surface); }
body[data-trade="finance"][data-flagship="1"] .fx-fin-review > div:first-child > b { display: block; font-family: var(--display); font-size: 23px; font-weight: 500; letter-spacing: -.03em; margin-top: 5px; }
body[data-trade="finance"][data-flagship="1"] .fx-fin-review > div:first-child > p { font-size: 9px; line-height: 1.45; color: var(--muted); margin: 5px 0 0; }
body[data-trade="finance"][data-flagship="1"] .fx-fin-review .fx-dayrow { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; margin-top: 12px; }
body[data-trade="finance"][data-flagship="1"] .fx-fin-review .fx-dayrow button { display: flex; flex-direction: column; align-items: center; gap: 1px; min-height: 49px; padding: 6px 2px; border: 1px solid var(--line); background: transparent; color: inherit; font: inherit; }
body[data-trade="finance"][data-flagship="1"] .fx-fin-review .fx-dayrow button.on { background: var(--accent); border-color: var(--accent); color: #fff; }
body[data-trade="finance"][data-flagship="1"] .fx-fin-review .fx-dayrow span { font-size: 6px; letter-spacing: .05em; text-transform: uppercase; opacity: .65; }
body[data-trade="finance"][data-flagship="1"] .fx-fin-review .fx-dayrow b { font-family: var(--display); font-size: 15px; font-weight: 500; }
body[data-trade="finance"][data-flagship="1"] .fx-fin-review-foot { display: flex; gap: 6px; margin-top: 10px; }
body[data-trade="finance"][data-flagship="1"] .fx-fin-review-foot button { flex: 1; min-height: 41px; border: 0; background: var(--ink); color: var(--bg); font: inherit; font-size: 8px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; }
body[data-trade="finance"][data-flagship="1"] .fx-fin-review-foot button.is-quiet { background: transparent; border: 1px solid var(--line); color: var(--ink); }
body[data-trade="finance"][data-flagship="1"] .fx-fin-lead { padding: 21px 0 15px; border-bottom: 1px solid var(--ink); }
body[data-trade="finance"][data-flagship="1"] .fx-fin-lead h1 { font-family: var(--display); font-size: 28px; font-weight: 500; line-height: .98; letter-spacing: -.04em; margin: 6px 0 0; max-width: 17ch; }
body[data-trade="finance"][data-flagship="1"] .fx-fin-lead p { font-size: 8.5px; color: var(--muted); margin: 8px 0 0; }

/* ---- shared detail and sheets --------------------------------------- */
body[data-flagship="1"] .sheet { border-radius: 22px 22px 0 0; box-shadow: 0 -24px 60px -24px rgba(0,0,0,.28); }
body[data-flagship="1"] .sheet .handle { width: 34px; height: 4px; opacity: .3; }
body[data-flagship="1"] .sheet-head h2 { font-family: var(--display); font-weight: 500; letter-spacing: -.02em; }
body[data-flagship="1"] .field input, body[data-flagship="1"] .field select, body[data-flagship="1"] .field textarea { min-height: 46px; border-radius: 10px; border-color: color-mix(in srgb, var(--ink) 12%, transparent); background: color-mix(in srgb, var(--ink) 3%, transparent); }
body[data-flagship="1"] .btn.accent, body[data-flagship="1"] [data-place] { min-height: 48px; border-radius: 10px; }
body[data-flagship="1"] .detail-body h1 { letter-spacing: -.04em; }
body[data-flagship="1"] .detail-art { border-radius: 18px; overflow: hidden; }

@media (prefers-reduced-motion: reduce) {
  body[data-flagship="1"] *, body[data-flagship="1"] *::before, body[data-flagship="1"] *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; scroll-behavior: auto !important; }
}

@media (max-width: 374px) {
  body[data-flagship="1"] .screen { padding-left: 15px; padding-right: 15px; }
  body[data-flagship="1"] .tab { padding-left: 3px; padding-right: 3px; }
  body[data-flagship="1"] .fx-rail { margin-left: -15px; margin-right: -15px; padding-left: 15px; padding-right: 15px; }
  body[data-flagship="1"] .fx-dine .fx-feature { grid-template-columns: 96px 1fr; }
  body[data-flagship="1"] .fx-dine .fx-feature .fx-art { width: 96px; height: 116px; }
  body[data-flagship="1"] .fx-products { gap: 12px 8px; }
  body[data-trade="hotel"][data-flagship="1"] .fx-hotel { margin-left: -15px; margin-right: -15px; }
  body[data-trade="cafe"][data-flagship="1"] .fx-cafe-window .fx-art { height: 232px; }
  body[data-trade="cafe"][data-flagship="1"] .fx-cafe-order { margin-left: -15px; margin-right: -15px; padding-left: 15px; padding-right: 15px; }
  body[data-trade="gym"][data-flagship="1"] .fx-gym-hero h1 { font-size: 54px; }
  body[data-trade="gym"][data-flagship="1"] .fx-gym-strip { grid-template-rows: 82px 82px; }
  body[data-trade="property"][data-flagship="1"] .fx-prop-rail { margin-left: -15px; margin-right: -15px; padding-left: 15px; padding-right: 15px; }
  body[data-trade="property"][data-flagship="1"] .fx-prop-card { flex-basis: 84%; }
  body[data-trade="studio"][data-flagship="1"] .fx-studio-hero h1 { font-size: 42px; }
  body[data-trade="studio"][data-flagship="1"] .fx-studio-grid { grid-template-rows: 114px 114px; }
  body[data-trade="trades"][data-flagship="1"] .fx-trade-cover { margin-left: -15px; margin-right: -15px; }
  body[data-trade="trades"][data-flagship="1"] .fx-trade-head h1 { font-size: 38px; }
  body[data-trade="auto"][data-flagship="1"] .fx-auto-hero h1 { font-size: 44px; }
  body[data-trade="auto"][data-flagship="1"] .fx-auto-job { grid-template-columns: minmax(0, 1fr) auto; }
  body[data-trade="auto"][data-flagship="1"] .fx-auto-job em { display: none; }
  body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-hero h1 { font-size: 34px; }
  body[data-trade="ecommerce"][data-flagship="1"] .fx-ecom-rail { margin-left: -15px; margin-right: -15px; padding-left: 15px; padding-right: 15px; }
  body[data-trade="courses"][data-flagship="1"] .fx-course-hero h1 { font-size: 35px; }
  body[data-trade="courses"][data-flagship="1"] .fx-course-card { grid-template-columns: 78px minmax(0, 1fr); gap: 9px; }
  body[data-trade="finance"][data-flagship="1"] .fx-fin-hero h1 { font-size: 36px; }
}
`
}
