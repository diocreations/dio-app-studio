import type { AppSpec, FeatureId } from './types'
import type { Project } from './db'
import { verticalFor } from './verticals'

/**
 * The operating layer behind a generated app. Orders, bookings and enquiries
 * are real D1 rows; the customer app is only a client of this module. Prices
 * always come from the owner's current catalogue, never from the browser.
 */

export type OrderStatus = 'new' | 'preparing' | 'ready' | 'completed' | 'cancelled'
export type BookingStatus = 'requested' | 'confirmed' | 'completed' | 'cancelled'
export type EnquiryStatus = 'new' | 'replied' | 'closed'

export type CustomerInput = { name?: unknown; phone?: unknown; email?: unknown }
export type OrderInput = {
  customer?: CustomerInput
  fulfilment?: unknown
  note?: unknown
  items?: unknown
  /** The checkout attempt this came from; a retry of the same attempt returns
   *  the order it already made rather than a second one. */
  requestId?: unknown
}
export type BookingInput = {
  customer?: CustomerInput
  date?: unknown
  /** Hotels only: the day the stay ends. */
  checkOut?: unknown
  slot?: unknown
  party?: unknown
  service?: unknown
  staff?: unknown
  note?: unknown
}
export type EnquiryInput = { name?: unknown; contact?: unknown; message?: unknown }

export type OrderItem = {
  id: string
  menuKey: string
  name: string
  /** The option bought, when the product has variants. */
  variant: string
  variantId: string
  price: number
  qty: number
}
export type Order = {
  id: string
  number: string
  status: OrderStatus
  fulfilment: string
  note: string
  subtotal: number
  deliveryFee: number
  total: number
  paymentStatus: string
  customer: { id: string; name: string; phone: string; email: string }
  items: OrderItem[]
  createdAt: string
  updatedAt: string
}
export type Booking = {
  id: string
  number: string
  status: BookingStatus
  /** Check-in day, or the appointment day for trades without stays. */
  date: string
  /** Check-out day for a hotel stay; empty for an appointment. */
  checkOut: string
  /** Derived from check-in and check-out, never typed by the customer. */
  nights: number
  /** The room rate times the nights, in the build's minor unit. */
  total: number
  slot: string
  party: number
  service: string
  staff: string
  note: string
  customer: { id: string; name: string; phone: string; email: string }
  createdAt: string
  updatedAt: string
}
export type Enquiry = {
  id: string
  name: string
  contact: string
  message: string
  status: EnquiryStatus
  customerId: string
  createdAt: string
  updatedAt: string
}
export type Customer = {
  id: string
  name: string
  phone: string
  email: string
  createdAt: string
  orders: number
  bookings: number
  enquiries: number
}
export type Notification = {
  id: string
  kind: string
  recipient: string
  channel: string
  status: string
  createdAt: string
}
export type DashboardData = {
  modules: Record<
    'overview' | 'orders' | 'bookings' | 'products' | 'categories' | 'customers' | 'enquiries' | 'offers' | 'analytics' | 'payments' | 'settings',
    boolean
  >
  summary: {
    orderValue: number
    openOrders: number
    upcomingBookings: number
    newEnquiries: number
    customers: number
    orders: number
    bookings: number
    notificationsQueued: number
  }
  orders: Order[]
  bookings: Booking[]
  enquiries: Enquiry[]
  customers: Customer[]
  notifications: Notification[]
  topItems: { name: string; qty: number; value: number }[]
}

export class BusinessError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 400 | 404 | 409 | 422 = 400,
  ) {
    super(message)
  }
}

const ORDER_FLOW: Record<OrderStatus, OrderStatus[]> = {
  new: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}
const BOOKING_FLOW: Record<BookingStatus, BookingStatus[]> = {
  requested: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}
const ENQUIRY_FLOW: Record<EnquiryStatus, EnquiryStatus[]> = {
  new: ['replied', 'closed'],
  replied: ['closed'],
  closed: [],
}

export function nextOrderStatuses(status: OrderStatus): OrderStatus[] {
  return ORDER_FLOW[status] ?? []
}
export function nextBookingStatuses(status: BookingStatus): BookingStatus[] {
  return BOOKING_FLOW[status] ?? []
}
export function nextEnquiryStatuses(status: EnquiryStatus): EnquiryStatus[] {
  return ENQUIRY_FLOW[status] ?? []
}

type OrderRow = {
  id: string
  number: string
  status: string
  fulfilment: string
  note: string
  subtotal: number
  delivery_fee: number
  total: number
  payment_status: string
  created_at: string
  updated_at: string
  customer_id: string
  customer_name: string
  customer_phone: string
  customer_email: string
}
type ItemRow = {
  id: string
  order_id: string
  menu_key: string
  name: string
  price: number
  qty: number
  variant: string
  variant_id: string
}
type BookingRow = {
  id: string
  number: string
  status: string
  date: string
  check_out: string
  nights: number
  total: number
  slot: string
  party: number
  service: string
  staff: string
  note: string
  created_at: string
  updated_at: string
  customer_id: string
  customer_name: string
  customer_phone: string
  customer_email: string
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function makeId(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9))
  return prefix + '_' + [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function number(): string {
  return String(1000 + crypto.getRandomValues(new Uint32Array(1))[0] % 9000)
}

function contactKey(email: string, phone: string): string {
  return email ? 'e:' + email : 'p:' + phone.replace(/[^\d+]/g, '')
}

export function isEnabled(project: Project, feature: FeatureId): boolean {
  return project.features.includes(feature) || project.spec.features.includes(feature)
}

function readCustomer(input: CustomerInput | undefined): { name: string; email: string; phone: string; key: string } {
  const name = text(input?.name, 60)
  const email = text(input?.email, 120).toLowerCase()
  const phone = text(input?.phone, 40)
  if (name.length < 2) throw new BusinessError('name_required', 'Add a name so the business knows who ordered.', 422)
  if (!email && !phone) throw new BusinessError('contact_required', 'Add a phone number or email address.', 422)
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    throw new BusinessError('email_invalid', 'That email address does not look right.', 422)
  if (phone && phone.replace(/\D/g, '').length < 7)
    throw new BusinessError('phone_invalid', 'Add a phone number the business can reach.', 422)
  return { name, email, phone, key: contactKey(email, phone) }
}

async function upsertCustomer(
  db: D1Database,
  projectId: string,
  input: CustomerInput | undefined,
): Promise<{ id: string; name: string; email: string; phone: string }> {
  const customer = readCustomer(input)
  const now = new Date().toISOString()
  const existing = await db
    .prepare('SELECT id, name, email, phone FROM customers WHERE project_id = ? AND contact_key = ?')
    .bind(projectId, customer.key)
    .first<{ id: string; name: string; email: string; phone: string }>()
  if (existing) {
    await db
      .prepare('UPDATE customers SET name = ?, email = ?, phone = ?, updated_at = ? WHERE id = ?')
      .bind(customer.name, customer.email, customer.phone, now, existing.id)
      .run()
    return { id: existing.id, name: customer.name, email: customer.email, phone: customer.phone }
  }
  const id = makeId('cus')
  await db
    .prepare(
      'INSERT INTO customers (id, project_id, contact_key, name, email, phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(id, projectId, customer.key, customer.name, customer.email, customer.phone, now, now)
    .run()
  return { id, name: customer.name, email: customer.email, phone: customer.phone }
}

async function queue(
  db: D1Database,
  projectId: string,
  kind: string,
  recipient: 'owner' | 'customer',
  channel: 'email' | 'whatsapp' | 'push',
  payload: Record<string, unknown>,
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO notifications (id, project_id, kind, recipient, channel, status, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(makeId('ntf'), projectId, kind, recipient, channel, 'queued', JSON.stringify(payload), new Date().toISOString())
    .run()
}

function publicOrder(row: OrderRow, items: ItemRow[]): Order {
  return {
    id: row.id,
    number: row.number,
    status: row.status as OrderStatus,
    fulfilment: row.fulfilment,
    note: row.note,
    subtotal: Number(row.subtotal),
    deliveryFee: Number(row.delivery_fee),
    total: Number(row.total),
    paymentStatus: row.payment_status,
    customer: {
      id: row.customer_id,
      name: row.customer_name,
      phone: row.customer_phone,
      email: row.customer_email,
    },
    items: items.map((item) => ({
      id: item.id,
      menuKey: item.menu_key,
      name: item.name,
      variant: item.variant ?? '',
      variantId: item.variant_id ?? '',
      price: Number(item.price),
      qty: Number(item.qty),
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function createOrder(db: D1Database, project: Project, input: OrderInput): Promise<Order> {
  if (!isEnabled(project, 'ordering')) throw new BusinessError('ordering_off', 'This app does not take orders.', 422)
  const items = Array.isArray(input.items) ? input.items : []
  if (!items.length) throw new BusinessError('items_required', 'Add something to the order first.', 422)
  if (items.length > 40) throw new BusinessError('too_many_items', 'That order has too many lines.', 422)

  const parsed: {
    key: string
    item: AppSpec['menu'][number]['items'][number]
    qty: number
    variant: string
    variantId: string
    price: number
  }[] = []
  for (const raw of items) {
    const entry = raw as Record<string, unknown>
    const key = text(entry?.key, 20)
    const match = /^(\d{1,2})-(\d{1,3})$/.exec(key)
    if (!match) throw new BusinessError('item_unknown', 'One of those items is not on the catalogue.', 422)
    const section = project.spec.menu[Number(match[1])]
    const item = section?.items[Number(match[2])]
    if (!item || !item.price || item.price <= 0)
      throw new BusinessError('item_unknown', 'One of those items is no longer available.', 422)
    const qty = Math.floor(Number(entry?.qty))
    if (!Number.isFinite(qty) || qty < 1 || qty > 20)
      throw new BusinessError('qty_invalid', 'Choose between 1 and 20 of each item.', 422)
    // A variant is priced from the owner's catalogue, never from the request:
    // the browser may only name which option it wants, and the server decides
    // what that option costs. An unknown or unavailable option is refused
    // rather than falling back to the lowest price.
    const wanted = text(entry?.variant, 60)
    let variant = ''
    let variantId = ''
    let price = item.price
    if (wanted && Array.isArray(item.variants) && item.variants.length) {
      const matchVariant = item.variants.find(
        (option) => (option.id ? option.id === wanted : option.name === wanted),
      )
      if (!matchVariant)
        throw new BusinessError('variant_unknown', 'That option is not available for this item.', 422)
      if (matchVariant.available === false)
        throw new BusinessError('variant_unavailable', 'That option is marked unavailable.', 422)
      variant = matchVariant.name
      variantId = matchVariant.id ?? ''
      price = matchVariant.price
    } else if (wanted && (!item.variants || !item.variants.length)) {
      throw new BusinessError('variant_unknown', 'That item has no options to choose from.', 422)
    }
    parsed.push({ key, item, qty, variant, variantId, price })
  }

  // One checkout attempt makes one order. The browser names the attempt, so a
  // retried send (a double click, a lost response, a reload mid-send) finds the
  // order it already made instead of ordering again.
  const attempt = /^[A-Za-z0-9_-]{8,64}$/.test(text(input.requestId, 64)) ? text(input.requestId, 64) : ''
  if (attempt) {
    const existing = await db
      .prepare('SELECT id FROM orders WHERE project_id = ? AND client_ref = ?')
      .bind(project.id, attempt)
      .first<{ id: string }>()
    if (existing) {
      const order = await getOrder(db, project.id, existing.id)
      if (order) return order
    }
  }

  const fulfilmentOptions = verticalFor(project.spec.vertical).vocab.fulfilment
  const fulfilment = text(input.fulfilment, 30) || fulfilmentOptions[0] || 'Pickup'
  if (!fulfilmentOptions.includes(fulfilment))
    throw new BusinessError('fulfilment_invalid', 'Choose how you would like to receive this order.', 422)
  const deliveryFee = fulfilment === 'Delivery' ? 299 : 0
  const subtotal = parsed.reduce((sum, line) => sum + line.price * line.qty, 0)
  const total = subtotal + deliveryFee
  const customer = await upsertCustomer(db, project.id, input.customer)
  const now = new Date().toISOString()
  const order: OrderRow = {
    id: makeId('ord'),
    number: number(),
    status: 'new',
    fulfilment,
    note: text(input.note, 400),
    subtotal,
    delivery_fee: deliveryFee,
    total,
    payment_status: 'unpaid',
    created_at: now,
    updated_at: now,
    customer_id: customer.id,
    customer_name: customer.name,
    customer_phone: customer.phone,
    customer_email: customer.email,
  }
  try {
    await db
      .prepare(
        `INSERT INTO orders (id, project_id, customer_id, number, status, fulfilment, note, subtotal, delivery_fee, total, payment_status, created_at, updated_at, client_ref)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        order.id,
        project.id,
        order.customer_id,
        order.number,
        order.status,
        order.fulfilment,
        order.note,
        order.subtotal,
        order.delivery_fee,
        order.total,
        order.payment_status,
        order.created_at,
        order.updated_at,
        attempt,
      )
      .run()
  } catch (error) {
    // Two sends of one attempt can pass the read together; the unique index
    // refuses the second write, and the winner is the order the caller gets.
    const race = attempt
      ? await db
          .prepare('SELECT id FROM orders WHERE project_id = ? AND client_ref = ?')
          .bind(project.id, attempt)
          .first<{ id: string }>()
      : null
    const found = race ? await getOrder(db, project.id, race.id) : null
    if (found) return found
    throw error
  }
  const stored: ItemRow[] = []
  for (const line of parsed) {
    const item: ItemRow = {
      id: makeId('itm'),
      order_id: order.id,
      menu_key: line.key,
      name: line.item.name,
      price: line.price,
      qty: line.qty,
      variant: line.variant,
      variant_id: line.variantId,
    }
    await db
      .prepare(
        'INSERT INTO order_items (id, order_id, menu_key, name, price, qty, variant, variant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(item.id, item.order_id, item.menu_key, item.name, item.price, item.qty, item.variant, item.variant_id)
      .run()
    stored.push(item)
  }
  await queue(db, project.id, 'order.created', 'owner', 'email', {
    orderId: order.id,
    number: order.number,
    total,
  })
  if (customer.email)
    await queue(db, project.id, 'order.confirmation', 'customer', 'email', {
      orderId: order.id,
      number: order.number,
    })
  return publicOrder(order, stored)
}

export async function getOrder(db: D1Database, projectId: string, id: string): Promise<Order | null> {
  if (!/^ord_[a-f0-9]{18}$/.test(id)) return null
  const row = await db
    .prepare(
      `SELECT o.*, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email
         FROM orders o JOIN customers c ON c.id = o.customer_id
        WHERE o.id = ? AND o.project_id = ?`,
    )
    .bind(id, projectId)
    .first<OrderRow>()
  if (!row) return null
  const items = await db.prepare('SELECT * FROM order_items WHERE order_id = ?').bind(id).all<ItemRow>()
  return publicOrder(row, items.results ?? [])
}

export async function createBooking(db: D1Database, project: Project, input: BookingInput): Promise<Booking> {
  if (!isEnabled(project, 'booking')) throw new BusinessError('booking_off', 'This app does not take bookings.', 422)
  const date = text(input.date, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + 'T12:00:00Z')))
    throw new BusinessError('date_invalid', 'Choose a valid day.', 422)
  const day = Date.parse(date + 'T12:00:00Z')
  const today = Date.now() - 24 * 60 * 60 * 1000
  if (day < today || day > Date.now() + 120 * 24 * 60 * 60 * 1000)
    throw new BusinessError('date_invalid', 'Choose a day in the next four months.', 422)
  const slot = text(input.slot, 20)
  const configured = verticalFor(project.spec.vertical).vocab.slots
  if (slot && !configured.includes(slot) && !/^\d{1,2}:\d{2}$/.test(slot))
    throw new BusinessError('slot_invalid', 'Choose one of the available times.', 422)
  const party = Math.floor(Number(input.party ?? 1))
  if (!Number.isFinite(party) || party < 1 || party > 20)
    throw new BusinessError('party_invalid', 'Choose between 1 and 20 people.', 422)
  const service = text(input.service, 80)
  const staff = text(input.staff, 80)
  const serviceItem = service
    ? project.spec.menu.flatMap((section) => section.items).find((item) => item.name === service)
    : undefined
  if (service && !serviceItem)
    throw new BusinessError('service_unknown', 'Choose a service from the catalogue.', 422)
  // Capacity is enforced only when the saved room record states it. A room
  // without a stated capacity keeps the general 1–20 request limit rather
  // than inheriting a number the business never published.
  if (project.spec.vertical === 'hotel' && serviceItem?.capacity && party > serviceItem.capacity)
    throw new BusinessError(
      'party_exceeds_room',
      `That room sleeps ${serviceItem.capacity}. Choose fewer guests or another room.`,
      422,
    )
  if (staff && project.spec.staff?.length && !project.spec.staff.includes(staff))
    throw new BusinessError('staff_unknown', 'Choose a team member from the list.', 422)
  // A hotel sells nights. The customer picks a check-out day and the server
  // derives the length and the room total from the saved rate, so a request
  // cannot name its own price or a stay that ends before it starts.
  let checkOut = ''
  let nights = 0
  let total = 0
  if (project.spec.vertical === 'hotel' && text(input.checkOut, 10)) {
    checkOut = text(input.checkOut, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(checkOut) || Number.isNaN(Date.parse(checkOut + 'T12:00:00Z')))
      throw new BusinessError('date_invalid', 'Choose a valid check-out day.', 422)
    const out = Date.parse(checkOut + 'T12:00:00Z')
    if (out > Date.now() + 120 * 24 * 60 * 60 * 1000)
      throw new BusinessError('date_invalid', 'Choose a check-out in the next four months.', 422)
    nights = Math.round((out - day) / (24 * 60 * 60 * 1000))
    if (nights < 1) throw new BusinessError('date_invalid', 'Check-out must be after check-in.', 422)
    if (nights > 28) throw new BusinessError('date_invalid', 'Stays are limited to 28 nights.', 422)
    if (serviceItem && serviceItem.price > 0 && /night/i.test(serviceItem.meta ?? ''))
      total = serviceItem.price * nights
  }
  const customer = await upsertCustomer(db, project.id, input.customer)
  const now = new Date().toISOString()
  const booking: BookingRow = {
    id: makeId('bkg'),
    number: number(),
    status: 'requested',
    date,
    check_out: checkOut,
    nights,
    total,
    slot,
    party,
    service,
    staff,
    note: text(input.note, 400),
    created_at: now,
    updated_at: now,
    customer_id: customer.id,
    customer_name: customer.name,
    customer_phone: customer.phone,
    customer_email: customer.email,
  }
  await db
    .prepare(
      `INSERT INTO bookings (id, project_id, customer_id, number, status, date, check_out, nights, total, slot, party, service, staff, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      booking.id,
      project.id,
      booking.customer_id,
      booking.number,
      booking.status,
      booking.date,
      booking.check_out,
      booking.nights,
      booking.total,
      booking.slot,
      booking.party,
      booking.service,
      booking.staff,
      booking.note,
      booking.created_at,
      booking.updated_at,
    )
    .run()
  await queue(db, project.id, 'booking.created', 'owner', 'email', {
    bookingId: booking.id,
    number: booking.number,
    date,
    slot,
  })
  if (customer.email)
    await queue(db, project.id, 'booking.confirmation', 'customer', 'email', {
      bookingId: booking.id,
      number: booking.number,
    })
  return {
    id: booking.id,
    number: booking.number,
    status: 'requested',
    date,
    checkOut,
    nights,
    total,
    slot,
    party,
    service,
    staff,
    note: booking.note,
    customer: { id: customer.id, name: customer.name, phone: customer.phone, email: customer.email },
    createdAt: now,
    updatedAt: now,
  }
}

export async function getBooking(db: D1Database, projectId: string, id: string): Promise<Booking | null> {
  if (!/^bkg_[a-f0-9]{18}$/.test(id)) return null
  const row = await db
    .prepare(
      `SELECT b.*, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email
         FROM bookings b JOIN customers c ON c.id = b.customer_id
        WHERE b.id = ? AND b.project_id = ?`,
    )
    .bind(id, projectId)
    .first<BookingRow>()
  if (!row) return null
  return {
    id: row.id,
    number: row.number,
    status: row.status as BookingStatus,
    date: row.date,
    checkOut: row.check_out ?? '',
    nights: Number(row.nights ?? 0),
    total: Number(row.total ?? 0),
    slot: row.slot,
    party: Number(row.party),
    service: row.service,
    staff: row.staff,
    note: row.note,
    customer: { id: row.customer_id, name: row.customer_name, phone: row.customer_phone, email: row.customer_email },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function createEnquiry(db: D1Database, project: Project, input: EnquiryInput): Promise<Enquiry> {
  const name = text(input.name, 60)
  const contact = text(input.contact, 160)
  const message = text(input.message, 1000)
  if (name.length < 2) throw new BusinessError('name_required', 'Add your name.', 422)
  if (contact.length < 5) throw new BusinessError('contact_required', 'Add a phone number or email address.', 422)
  if (message.length < 5) throw new BusinessError('message_required', 'Add a sentence about what you need.', 422)
  const isEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact)
  const customer = await upsertCustomer(db, project.id, {
    name,
    email: isEmail ? contact : undefined,
    phone: isEmail ? undefined : contact,
  })
  const now = new Date().toISOString()
  const id = makeId('enq')
  await db
    .prepare(
      'INSERT INTO enquiries (id, project_id, customer_id, name, contact, message, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(id, project.id, customer.id, name, contact, message, 'new', now, now)
    .run()
  await queue(db, project.id, 'enquiry.created', 'owner', 'email', { enquiryId: id, name })
  return { id, name, contact, message, status: 'new', customerId: customer.id, createdAt: now, updatedAt: now }
}

export async function updateOrderStatus(
  db: D1Database,
  projectId: string,
  id: string,
  status: string,
): Promise<Order> {
  const order = await getOrder(db, projectId, id)
  if (!order) throw new BusinessError('not_found', 'That order no longer exists.', 404)
  const next = status as OrderStatus
  if (!ORDER_FLOW[order.status]?.includes(next))
    throw new BusinessError('bad_transition', `An order cannot move from ${order.status} to ${status}.`, 409)
  const now = new Date().toISOString()
  await db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND project_id = ?').bind(next, now, id, projectId).run()
  if (order.customer.email) await queue(db, projectId, 'order.' + next, 'customer', 'email', { orderId: id })
  return { ...order, status: next, updatedAt: now }
}

export async function updateBookingStatus(
  db: D1Database,
  projectId: string,
  id: string,
  status: string,
): Promise<Booking> {
  const booking = await getBooking(db, projectId, id)
  if (!booking) throw new BusinessError('not_found', 'That booking no longer exists.', 404)
  const next = status as BookingStatus
  if (!BOOKING_FLOW[booking.status]?.includes(next))
    throw new BusinessError('bad_transition', `A booking cannot move from ${booking.status} to ${status}.`, 409)
  const now = new Date().toISOString()
  await db
    .prepare('UPDATE bookings SET status = ?, updated_at = ? WHERE id = ? AND project_id = ?')
    .bind(next, now, id, projectId)
    .run()
  if (booking.customer.email)
    await queue(db, projectId, 'booking.' + next, 'customer', 'email', { bookingId: id })
  return { ...booking, status: next, updatedAt: now }
}

export async function updateEnquiryStatus(
  db: D1Database,
  projectId: string,
  id: string,
  status: string,
): Promise<Enquiry> {
  const row = await db
    .prepare('SELECT * FROM enquiries WHERE id = ? AND project_id = ?')
    .bind(id, projectId)
    .first<{
      id: string
      name: string
      contact: string
      message: string
      status: string
      customer_id: string
      created_at: string
      updated_at: string
    }>()
  if (!row) throw new BusinessError('not_found', 'That enquiry no longer exists.', 404)
  const next = status as EnquiryStatus
  if (!ENQUIRY_FLOW[row.status as EnquiryStatus]?.includes(next))
    throw new BusinessError('bad_transition', `An enquiry cannot move from ${row.status} to ${status}.`, 409)
  const now = new Date().toISOString()
  await db.prepare('UPDATE enquiries SET status = ?, updated_at = ? WHERE id = ? AND project_id = ?').bind(next, now, id, projectId).run()
  return {
    id: row.id,
    name: row.name,
    contact: row.contact,
    message: row.message,
    status: next,
    customerId: row.customer_id,
    createdAt: row.created_at,
    updatedAt: now,
  }
}

export function modulesFor(project: Project) {
  const ordering = isEnabled(project, 'ordering')
  const booking = isEnabled(project, 'booking')
  return {
    overview: true,
    orders: ordering,
    bookings: booking,
    products: true,
    categories: true,
    customers: true,
    enquiries: true,
    offers: isEnabled(project, 'offers'),
    analytics: ordering || booking,
    // Gateway settings are optional for every trade; the tab is always present
    // so an owner can connect or disconnect without changing the build.
    payments: true,
    settings: true,
  }
}

export async function dashboardData(db: D1Database, project: Project): Promise<DashboardData> {
  const orderRows = await db
    .prepare(
      `SELECT o.*, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email
         FROM orders o JOIN customers c ON c.id = o.customer_id
        WHERE o.project_id = ? ORDER BY o.created_at DESC LIMIT 100`,
    )
    .bind(project.id)
    .all<OrderRow>()
  const itemRows = await db
    .prepare(
      `SELECT i.* FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.project_id = ?`,
    )
    .bind(project.id)
    .all<ItemRow>()
  const byOrder = new Map<string, ItemRow[]>()
  for (const item of itemRows.results ?? []) {
    const list = byOrder.get(item.order_id) ?? []
    list.push(item)
    byOrder.set(item.order_id, list)
  }
  const orders = (orderRows.results ?? []).map((row) => publicOrder(row, byOrder.get(row.id) ?? []))

  const bookingRows = await db
    .prepare(
      `SELECT b.*, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email
         FROM bookings b JOIN customers c ON c.id = b.customer_id
        WHERE b.project_id = ? ORDER BY b.date ASC, b.slot ASC LIMIT 100`,
    )
    .bind(project.id)
    .all<BookingRow>()
  const bookings = (bookingRows.results ?? []).map((row) => ({
    id: row.id,
    number: row.number,
    status: row.status as BookingStatus,
    date: row.date,
    checkOut: row.check_out ?? '',
    nights: Number(row.nights ?? 0),
    total: Number(row.total ?? 0),
    slot: row.slot,
    party: Number(row.party),
    service: row.service,
    staff: row.staff,
    note: row.note,
    customer: { id: row.customer_id, name: row.customer_name, phone: row.customer_phone, email: row.customer_email },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))

  const enquiryRows = await db
    .prepare('SELECT * FROM enquiries WHERE project_id = ? ORDER BY created_at DESC LIMIT 100')
    .bind(project.id)
    .all<{
      id: string
      name: string
      contact: string
      message: string
      status: string
      customer_id: string
      created_at: string
      updated_at: string
    }>()
  const enquiries: Enquiry[] = (enquiryRows.results ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    contact: row.contact,
    message: row.message,
    status: row.status as EnquiryStatus,
    customerId: row.customer_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))

  const customerRows = await db
    .prepare(
      `SELECT c.*,
        (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS orders,
        (SELECT COUNT(*) FROM bookings b WHERE b.customer_id = c.id) AS bookings,
        (SELECT COUNT(*) FROM enquiries e WHERE e.customer_id = c.id) AS enquiries
       FROM customers c WHERE c.project_id = ? ORDER BY c.created_at DESC LIMIT 200`,
    )
    .bind(project.id)
    .all<{
      id: string
      name: string
      phone: string
      email: string
      created_at: string
      orders: number
      bookings: number
      enquiries: number
    }>()
  const customers: Customer[] = (customerRows.results ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    createdAt: row.created_at,
    orders: Number(row.orders),
    bookings: Number(row.bookings),
    enquiries: Number(row.enquiries),
  }))

  const notifications = await db
    .prepare('SELECT * FROM notifications WHERE project_id = ? ORDER BY created_at DESC LIMIT 20')
    .bind(project.id)
    .all<{
      id: string
      kind: string
      recipient: string
      channel: string
      status: string
      created_at: string
    }>()
  const notificationRows: Notification[] = (notifications.results ?? []).map((row) => ({
    id: row.id,
    kind: row.kind,
    recipient: row.recipient,
    channel: row.channel,
    status: row.status,
    createdAt: row.created_at,
  }))

  const liveOrders = orders.filter((order) => order.status !== 'cancelled')
  const today = new Date().toISOString().slice(0, 10)
  return {
    modules: modulesFor(project),
    summary: {
      orderValue: liveOrders.reduce((sum, order) => sum + order.total, 0),
      openOrders: orders.filter((order) => ['new', 'preparing', 'ready'].includes(order.status)).length,
      upcomingBookings: bookings.filter(
        (booking) => ['requested', 'confirmed'].includes(booking.status) && booking.date >= today,
      ).length,
      newEnquiries: enquiries.filter((enquiry) => enquiry.status === 'new').length,
      customers: customers.length,
      orders: orders.length,
      bookings: bookings.length,
      notificationsQueued: notificationRows.filter((entry) => entry.status === 'queued').length,
    },
    orders,
    bookings,
    enquiries,
    customers,
    notifications: notificationRows,
    topItems: (() => {
      const map = new Map<string, { name: string; qty: number; value: number }>()
      for (const order of liveOrders) {
        for (const item of order.items) {
          const entry = map.get(item.name) ?? { name: item.name, qty: 0, value: 0 }
          entry.qty += item.qty
          entry.value += item.price * item.qty
          map.set(item.name, entry)
        }
      }
      return [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, 8)
    })(),
  }
}
