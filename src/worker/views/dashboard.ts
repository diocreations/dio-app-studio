import type { Project } from '../db'
import type { DashboardData } from '../business'
import { nextBookingStatuses, nextEnquiryStatuses, nextOrderStatuses } from '../business'
import { esc } from './shell'

/**
 * The business owner's operating surface. It is deliberately separate from the
 * visual editor: this page is for orders, bookings, customers and the day's
 * work, and it only shows modules the generated app can actually fulfil.
 */

const CURRENCY: Record<string, string> = {
  USD: '$',
  GBP: '£',
  EUR: '€',
  INR: '₹',
  AUD: 'A$',
  CAD: 'C$',
  AED: 'AED ',
  SGD: 'S$',
}

function money(cents: number, symbol: string): string {
  return symbol + (cents / 100).toFixed(2)
}

function when(value: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return esc(value)
  return date.toISOString().slice(0, 16).replace('T', ' ')
}

function label(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function pill(status: string): string {
  return `<span class="pill ${esc(status)}">${esc(label(status))}</span>`
}

function titleCaseStatus(status: string): string {
  return label(status)
}

export function ownerLoginPage(options: {
  project: Project
  configured: boolean
  wrong?: boolean
  blocked?: boolean
}): string {
  const { project, configured, wrong, blocked } = options
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Owner sign in · ${esc(project.name)}</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<style>
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #171512; color: #f7f1e7; font: 14px/1.5 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
.card { width: min(430px, 100%); background: #211d18; border: 1px solid rgba(255,255,255,.09); border-radius: 18px; padding: 26px; box-shadow: 0 30px 80px -40px #000; }
.mark { width: 42px; height: 42px; border-radius: 13px; background: ${esc(project.accent)}; display: grid; place-items: center; font-family: ui-serif, Georgia, serif; font-weight: 800; margin-bottom: 18px; }
.eyebrow { font-size: 10px; letter-spacing: .15em; text-transform: uppercase; color: rgba(247,241,231,.5); }
h1 { font-family: ui-serif, "Iowan Old Style", Georgia, serif; font-weight: 600; font-size: 29px; line-height: 1.1; margin: 7px 0 8px; }
p { color: rgba(247,241,231,.68); font-size: 12.5px; margin: 0 0 18px; }
label { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: rgba(247,241,231,.55); margin-bottom: 6px; }
input { width: 100%; border: 1px solid rgba(255,255,255,.14); background: #171512; color: #fff; border-radius: 10px; padding: 12px; font: inherit; letter-spacing: .08em; }
input:focus { outline: 2px solid ${esc(project.accent)}; outline-offset: 1px; }
button { width: 100%; margin-top: 12px; border: 0; border-radius: 10px; padding: 12px; background: ${esc(project.accent)}; color: #fff; font: inherit; font-weight: 650; cursor: pointer; }
.error { color: #ffb4a4; background: rgba(200,69,43,.14); border-radius: 8px; padding: 9px 10px; font-size: 12px; margin-top: 12px; }
.foot { margin-top: 18px; font-size: 11px; color: rgba(247,241,231,.42); }
.foot a { color: rgba(247,241,231,.72); }
</style>
</head>
<body>
<form class="card" method="post" action="/p/${esc(project.token)}/dashboard/login">
  <div class="mark">${esc(project.logo)}</div>
  <span class="eyebrow">Business dashboard</span>
  <h1>Owner sign in</h1>
  <p>This area holds customer contact details and live orders. Use the owner key issued with this build — the customer app link is not enough.</p>
  ${configured ? `<label for="owner-key">Owner key</label><input id="owner-key" name="key" type="password" autocomplete="current-password" autocapitalize="off" spellcheck="false" required autofocus />` : '<div class="error">Owner access is not configured on this deployment. Set <code>OWNER_SECRET</code> before sharing a dashboard.</div>'}
  ${blocked ? '<div class="error">Too many attempts. Try again later.</div>' : wrong ? '<div class="error">That key did not match.</div>' : ''}
  ${configured ? '<button type="submit">Open the dashboard</button>' : ''}
  <div class="foot"><a href="/p/${esc(project.token)}/app">Open the customer app</a> · Owner access is separate from the customer link.</div>
</form>
</body>
</html>`
}

export function dashboardPage(options: { project: Project; data: DashboardData; origin: string }): string {
  const { project, data, origin } = options
  const token = project.token
  const symbol = CURRENCY[(project.spec.currency ?? 'USD').toUpperCase()] ?? '$'
  const modules = data.modules
  const catalogJson = JSON.stringify(project.spec.menu).replace(/</g, '\\u003c')
  const offersJson = JSON.stringify(project.spec.offers).replace(/</g, '\\u003c')
  const hasCatalogue = project.spec.menu.length > 0
  const sample = project.spec.sampleContent
  const hasSample = Boolean(sample && Object.values(sample).some(Boolean))
  const sampleItems = project.spec.menu.reduce((sum, section) => sum + section.items.length, 0)
  const sampleLabels = [
    sample?.menu ? `${sampleItems} sample items` : '',
    sample?.offers ? `${project.spec.offers.length} sample offers` : '',
    sample?.story ? 'sample about text' : '',
    sample?.tagline ? 'sample tagline' : '',
    sample?.contact ? 'sample contact details' : '',
    sample?.team ? 'sample team' : '',
  ].filter(Boolean)

  const nav: [string, string, boolean][] = [
    ['overview', 'Overview', modules.overview],
    ['orders', 'Orders', modules.orders],
    ['bookings', 'Bookings', modules.bookings],
    ['products', 'Products & services', modules.products],
    ['categories', 'Categories', modules.categories],
    ['customers', 'Customers', modules.customers],
    ['enquiries', 'Enquiries', modules.enquiries],
    ['offers', 'Offers', modules.offers],
    ['analytics', 'Sales & analytics', modules.analytics],
    ['settings', 'Application settings', modules.settings],
  ]

  const recentOrders = data.orders.slice(0, 5)
  const nextBookings = data.bookings
    .filter((booking) => ['requested', 'confirmed'].includes(booking.status))
    .slice(0, 5)

  const orderRows = data.orders.length
    ? data.orders
        .map(
          (order) => `<article class="record">
        <div class="record-head">
          <div><b>#${esc(order.number)}</b><span>${esc(when(order.createdAt))} · ${esc(order.fulfilment)}</span></div>
          ${pill(order.status)}
        </div>
        <div class="record-body">
          <div class="who"><b>${esc(order.customer.name)}</b><span>${esc(order.customer.phone || order.customer.email)}</span></div>
          <ul class="lines">${order.items
            .map(
              (item) =>
                `<li><span>${esc(item.name)} × ${item.qty}</span><span>${money(item.price * item.qty, symbol)}</span></li>`,
            )
            .join('')}</ul>
          ${order.note ? `<p class="note">${esc(order.note)}</p>` : ''}
          <div class="record-foot"><b>${money(order.total, symbol)}</b><span>${order.paymentStatus === 'unpaid' ? 'Payment due to the business' : esc(label(order.paymentStatus))}</span></div>
          <div class="actions">${nextOrderStatuses(order.status)
            .map(
              (status) =>
                `<button type="button" class="btn small ${status === 'cancelled' ? 'danger' : ''}" data-status="${status}" data-kind="orders" data-id="${esc(order.id)}">${titleCaseStatus(status)}</button>`,
            )
            .join('') || '<span class="muted">Closed</span>'}</div>
        </div>
      </article>`,
        )
        .join('')
    : '<div class="empty"><b>No orders yet</b><span>Orders placed in the app will appear here with the customer and items.</span></div>'

  const bookingRows = data.bookings.length
    ? data.bookings
        .map(
          (booking) => `<article class="record">
        <div class="record-head">
          <div><b>${esc(booking.date)} ${esc(booking.slot)}</b><span>#${esc(booking.number)} · ${booking.party} ${esc(project.spec.vertical === 'restaurant' ? 'guests' : 'people')}</span></div>
          ${pill(booking.status)}
        </div>
        <div class="record-body">
          <div class="who"><b>${esc(booking.customer.name)}</b><span>${esc(booking.customer.phone || booking.customer.email)}</span></div>
          ${booking.service ? `<p class="note">${esc(booking.service)}${booking.staff ? ' · ' + esc(booking.staff) : ''}</p>` : ''}
          ${booking.note ? `<p class="note">${esc(booking.note)}</p>` : ''}
          <div class="actions">${nextBookingStatuses(booking.status)
            .map(
              (status) =>
                `<button type="button" class="btn small ${status === 'cancelled' ? 'danger' : ''}" data-status="${status}" data-kind="bookings" data-id="${esc(booking.id)}">${titleCaseStatus(status)}</button>`,
            )
            .join('') || '<span class="muted">Closed</span>'}</div>
        </div>
      </article>`,
        )
        .join('')
    : '<div class="empty"><b>No bookings yet</b><span>Requests from the app land here for confirmation.</span></div>'

  const enquiryRows = data.enquiries.length
    ? data.enquiries
        .map(
          (enquiry) => `<article class="record">
        <div class="record-head">
          <div><b>${esc(enquiry.name)}</b><span>${esc(when(enquiry.createdAt))}</span></div>
          ${pill(enquiry.status)}
        </div>
        <div class="record-body">
          <p class="note">${esc(enquiry.message)}</p>
          <div class="who"><b>${esc(enquiry.contact)}</b></div>
          <div class="actions">${nextEnquiryStatuses(enquiry.status)
            .map(
              (status) =>
                `<button type="button" class="btn small" data-status="${status}" data-kind="enquiries" data-id="${esc(enquiry.id)}">${titleCaseStatus(status)}</button>`,
            )
            .join('')}</div>
        </div>
      </article>`,
        )
        .join('')
    : '<div class="empty"><b>No enquiries yet</b><span>Quote and contact requests are stored here.</span></div>'

  const customerRows = data.customers.length
    ? data.customers
        .map(
          (customer) => `<tr>
        <td><b>${esc(customer.name)}</b></td>
        <td>${esc(customer.phone || '—')}</td>
        <td>${esc(customer.email || '—')}</td>
        <td>${customer.orders}</td>
        <td>${customer.bookings}</td>
        <td>${customer.enquiries}</td>
      </tr>`,
        )
        .join('')
    : '<tr><td colspan="6" class="muted">No customers yet. Guest checkout creates a customer record from the contact they provide.</td></tr>'

  const topItems = data.topItems.length
    ? data.topItems
        .map(
          (item) =>
            `<tr><td>${esc(item.name)}</td><td>${item.qty}</td><td>${money(item.value, symbol)}</td></tr>`,
        )
        .join('')
    : '<tr><td colspan="3" class="muted">No order lines yet.</td></tr>'

  const notificationRows = data.notifications.length
    ? data.notifications
        .slice(0, 8)
        .map(
          (entry) =>
            `<li><span>${esc(entry.kind)} → ${esc(entry.recipient)}</span><b>${esc(entry.status)}</b></li>`,
        )
        .join('')
    : '<li><span>No notifications yet.</span></li>'

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>${esc(project.name)} · Business dashboard</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<style>
:root {
  --ink: #171512; --paper: #f4f1ea; --panel: #fffdf8; --muted: #756d61;
  --line: rgba(23,21,18,.11); --accent: ${esc(project.accent)}; --green: #276749;
  --serif: ui-serif, "Iowan Old Style", "Palatino Linotype", Georgia, serif;
  --sans: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--paper); color: var(--ink); font: 14px/1.5 var(--sans); }
button, input, textarea, select { font: inherit; color: inherit; }
a { color: inherit; }
.shell { display: grid; grid-template-columns: 248px minmax(0, 1fr); min-height: 100vh; width: 100%; min-width: 0; }
.shell > * { min-width: 0; }
.side { background: #1d1a16; color: #f7f1e7; padding: 22px 16px; display: flex; flex-direction: column; gap: 22px; }
.brand { display: flex; align-items: center; gap: 10px; padding: 0 8px; }
.brand .mark { width: 36px; height: 36px; border-radius: 11px; background: var(--accent); display: grid; place-items: center; font-family: var(--serif); font-weight: 800; }
.brand div { display: grid; line-height: 1.2; }
.brand b { font-family: var(--serif); font-size: 17px; }
.brand span { font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: rgba(247,241,231,.55); }
.nav { display: grid; gap: 3px; }
.nav button { border: 0; background: none; color: rgba(247,241,231,.72); text-align: left; padding: 9px 10px; border-radius: 8px; cursor: pointer; font-size: 12.5px; }
.nav button:hover { background: rgba(255,255,255,.06); color: #fff; }
.nav button.on { background: var(--accent); color: #fff; }
.side-foot { margin-top: auto; display: grid; gap: 7px; padding: 0 8px; }
.side-foot a { color: rgba(247,241,231,.7); font-size: 11.5px; text-decoration: none; }
.side-foot a:hover { color: #fff; }
.main { padding: 26px clamp(18px, 4vw, 44px) 60px; min-width: 0; }
.top { display: flex; justify-content: space-between; align-items: flex-end; gap: 18px; margin-bottom: 24px; }
.top h1 { font-family: var(--serif); font-size: clamp(26px, 4vw, 36px); margin: 0; font-weight: 600; letter-spacing: -.02em; }
.top p { color: var(--muted); margin: 4px 0 0; font-size: 12.5px; }
.live { display: inline-flex; align-items: center; gap: 7px; font-size: 11px; color: var(--green); background: #eaf3ed; border-radius: 999px; padding: 5px 10px; }
.live::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.tab { display: none; }
.tab.on { display: block; animation: in .18s ease both; }
@keyframes in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
.cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 22px; }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 13px; padding: 16px; }
.card span { display: block; color: var(--muted); font-size: 10.5px; text-transform: uppercase; letter-spacing: .08em; font-weight: 650; }
.card b { display: block; font-family: var(--serif); font-size: 28px; margin-top: 5px; font-weight: 600; letter-spacing: -.02em; }
.card small { color: var(--muted); font-size: 10.5px; }
.panel { background: var(--panel); border: 1px solid var(--line); border-radius: 13px; padding: 18px; margin-bottom: 16px; }
.panel h2 { font-family: var(--serif); font-size: 19px; margin: 0 0 12px; font-weight: 600; }
.panel h2 .muted { font-family: var(--sans); font-size: 10.5px; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.record { border: 1px solid var(--line); border-radius: 10px; padding: 13px; margin-bottom: 9px; background: #fff; }
.record-head { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
.record-head div { display: grid; }
.record-head b { font-size: 13.5px; }
.record-head span { font-size: 10.5px; color: var(--muted); }
.record-body { margin-top: 9px; display: grid; gap: 8px; }
.who { display: flex; gap: 9px; flex-wrap: wrap; align-items: baseline; font-size: 11.5px; }
.who span { color: var(--muted); }
.lines { list-style: none; margin: 0; padding: 8px 0 0; border-top: 1px solid var(--line); display: grid; gap: 3px; }
.lines li { display: flex; justify-content: space-between; gap: 12px; font-size: 11.5px; }
.note { font-size: 11.5px; color: var(--muted); margin: 0; }
.record-foot { display: flex; justify-content: space-between; align-items: baseline; border-top: 1px solid var(--line); padding-top: 7px; }
.record-foot span { font-size: 10px; color: var(--muted); }
.actions { display: flex; gap: 6px; flex-wrap: wrap; }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: 1px solid var(--line); background: #fff; border-radius: 8px; padding: 7px 11px; cursor: pointer; text-decoration: none; font-size: 11.5px; }
.btn:hover { border-color: var(--accent); }
.btn.primary { background: var(--ink); color: #fff; border-color: var(--ink); }
.btn.small { padding: 5px 9px; font-size: 10.5px; }
.btn.danger { color: #9b2c2c; }
.pill { display: inline-flex; border-radius: 999px; padding: 3px 8px; font-size: 9.5px; font-weight: 700; background: #eee9df; color: #5d554a; white-space: nowrap; }
.pill.new, .pill.requested { background: #fdf0d8; color: #8a5a11; }
.pill.preparing, .pill.confirmed { background: #e5effb; color: #22558c; }
.pill.ready { background: #e5f3e8; color: #276749; }
.pill.completed, .pill.closed { background: #e8e6e1; color: #5c574f; }
.pill.cancelled { background: #fbe7e7; color: #9b2c2c; }
.empty { border: 1px dashed var(--line); border-radius: 10px; padding: 24px; display: grid; gap: 4px; text-align: center; color: var(--muted); }
.empty b { color: var(--ink); font-family: var(--serif); font-size: 17px; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th { text-align: left; font-size: 9.5px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); padding: 7px 8px; border-bottom: 1px solid var(--line); }
td { padding: 9px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
td b { font-weight: 600; }
.muted { color: var(--muted); }
.catalog-group { border: 1px solid var(--line); border-radius: 10px; padding: 11px; margin-bottom: 9px; background: #fff; }
.catalog-head { display: flex; gap: 7px; align-items: center; margin-bottom: 7px; }
.catalog-head input { flex: 1; font-weight: 600; }
.catalog-row { display: grid; grid-template-columns: 1.2fr 1.8fr 80px 26px; gap: 6px; margin-bottom: 6px; }
.catalog-row input, .catalog-head input, .field input, .field textarea, .field select { border: 1px solid var(--line); border-radius: 7px; padding: 8px; background: #fff; min-width: 0; }
.catalog-row input { font-size: 11px; }
.x { border: 0; background: none; color: #9b2c2c; cursor: pointer; }
.add { border: 1px dashed var(--line); background: none; border-radius: 7px; padding: 6px 9px; font-size: 10px; color: var(--muted); cursor: pointer; }
.add:hover { border-color: var(--accent); color: var(--ink); }
.field { display: grid; gap: 4px; margin-bottom: 10px; }
.field label { font-size: 10px; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); font-weight: 650; }
.field textarea { min-height: 70px; resize: vertical; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.settings { max-width: 680px; }
.sample-box { border: 1px solid #dfcba4; background: #fff8ec; border-radius: 9px; padding: 13px 14px; margin-bottom: 16px; display: grid; gap: 7px; }
.sample-box b { font-size: 12px; }
.sample-box p { margin: 0; font-size: 11.5px; line-height: 1.45; color: #6f5630; }
.sample-box .sample-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 2px; }
.sample-box .sample-actions span { font-size: 11px; color: #6f5630; }
.sample-box button { border: 1px solid #cdb384; background: #fffdf8; border-radius: 7px; padding: 7px 10px; font: inherit; font-size: 11px; font-weight: 600; color: #513d1f; cursor: pointer; }
.notifications { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
.notifications li { display: flex; justify-content: space-between; gap: 10px; font-size: 11.5px; border-bottom: 1px solid var(--line); padding: 7px 0; }
.notifications b { font-size: 9.5px; text-transform: uppercase; color: var(--muted); }
.links { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
.savebar { display: flex; align-items: center; gap: 10px; margin: 12px 0; }
.savebar span { font-size: 11px; color: var(--muted); }
@media (max-width: 900px) {
  .shell { grid-template-columns: 1fr; }
  .side { padding: 14px; gap: 12px; }
  .brand .mark { width: 30px; height: 30px; }
  .nav { display: flex; overflow-x: auto; gap: 5px; padding-bottom: 3px; }
  .nav button { white-space: nowrap; flex: 0 0 auto; }
  .side-foot { display: none; }
  .main { padding: 20px 14px 50px; }
  .cards { grid-template-columns: 1fr 1fr; }
  .grid2, .form-grid { grid-template-columns: 1fr; }
}
@media (max-width: 560px) { .cards { grid-template-columns: 1fr; } .catalog-row { grid-template-columns: 1fr 1fr 60px 26px; } }
</style>
</head>
<body>
<div class="shell">
  <aside class="side">
    <div class="brand"><span class="mark">${esc(project.logo)}</span><div><b>${esc(project.name)}</b><span>Business dashboard</span></div></div>
    <nav class="nav" aria-label="Dashboard">
      ${nav
        .filter((entry) => entry[2])
        .map(
          ([id, text], index) =>
            `<button type="button" data-tab="${id}" class="${index === 0 ? 'on' : ''}">${esc(text)}</button>`,
        )
        .join('')}
    </nav>
    <div class="side-foot">
      <a href="${esc(origin)}/p/${esc(token)}/app" target="_blank" rel="noreferrer">Open customer app ↗</a>
      <a href="${esc(origin)}/p/${esc(token)}/edit">Visual editor ↗</a>
      <a href="${esc(origin)}/p/${esc(token)}">Build &amp; publishing</a>
      <form method="post" action="/p/${esc(token)}/dashboard/logout" style="margin:0"><button type="submit" style="border:0;background:none;color:rgba(247,241,231,.7);font:inherit;font-size:11.5px;padding:0;cursor:pointer">Sign out</button></form>
      <form method="post" action="/p/${esc(token)}/dashboard/logout-all" style="margin:0"><button type="submit" style="border:0;background:none;color:rgba(247,241,231,.7);font:inherit;font-size:11.5px;padding:0;cursor:pointer" onclick="return confirm('Sign out every owner session for this business?')">Sign out everywhere</button></form>
      <span style="font-size:10px;color:rgba(247,241,231,.35)">Owner session · do not share with customers</span>
    </div>
  </aside>
  <main class="main">
    <div class="top">
      <div><h1>Today at ${esc(project.name)}</h1><p>Orders, bookings and customer requests from your app, in one place.</p></div>
      <span class="live">Live workspace</span>
    </div>

    <section class="tab on" id="tab-overview">
      <div class="cards">
        <div class="card"><span>Order value</span><b>${money(data.summary.orderValue, symbol)}</b><small>Not settled revenue — payments are not connected</small></div>
        <div class="card"><span>Open orders</span><b>${data.summary.openOrders}</b><small>${data.summary.orders} total</small></div>
        <div class="card"><span>Upcoming bookings</span><b>${data.summary.upcomingBookings}</b><small>${data.summary.bookings} total</small></div>
        <div class="card"><span>New enquiries</span><b>${data.summary.newEnquiries}</b><small>${data.summary.customers} customers</small></div>
      </div>
      <div class="grid2">
        <div class="panel">
          <h2>Latest orders</h2>
          ${modules.orders ? (recentOrders.length ? recentOrders.map((order) => `<div class="record"><div class="record-head"><div><b>#${esc(order.number)} · ${esc(order.customer.name)}</b><span>${esc(when(order.createdAt))} · ${esc(order.fulfilment)}</span></div><div style="display:grid;justify-items:end;gap:4px">${pill(order.status)}<b>${money(order.total, symbol)}</b></div></div></div>`).join('') : '<div class="empty"><b>No orders yet</b><span>Open the app and place a test order to see the full flow.</span></div>') : '<p class="muted">This app does not take orders.</p>'}
          ${modules.orders ? '<div class="links"><button class="btn" type="button" data-go-tab="orders">View all orders</button></div>' : ''}
        </div>
        <div class="panel">
          <h2>Next bookings</h2>
          ${modules.bookings ? (nextBookings.length ? nextBookings.map((booking) => `<div class="record"><div class="record-head"><div><b>${esc(booking.date)} ${esc(booking.slot)} · ${esc(booking.customer.name)}</b><span>${booking.party} people${booking.service ? ' · ' + esc(booking.service) : ''}</span></div>${pill(booking.status)}</div></div>`).join('') : '<div class="empty"><b>No bookings yet</b><span>Requests from the app land here for confirmation.</span></div>') : '<p class="muted">This app does not take bookings.</p>'}
          ${modules.bookings ? '<div class="links"><button class="btn" type="button" data-go-tab="bookings">View all bookings</button></div>' : ''}
        </div>
      </div>
      <div class="grid2">
        <div class="panel">
          <h2>Enquiries needing a reply</h2>
          ${data.enquiries.filter((enquiry) => enquiry.status === 'new').slice(0, 3).map((enquiry) => `<div class="record"><div class="record-head"><div><b>${esc(enquiry.name)}</b><span>${esc(when(enquiry.createdAt))}</span></div>${pill(enquiry.status)}</div><p class="note" style="margin-top:6px">${esc(enquiry.message)}</p></div>`).join('') || '<div class="empty"><b>Nothing waiting</b><span>New quotes and contact requests appear here.</span></div>'}
          <div class="links"><button class="btn" type="button" data-go-tab="enquiries">Open enquiries</button></div>
        </div>
        <div class="panel">
          <h2>Notification outbox</h2>
          <p class="note" style="margin-bottom:8px">Messages are queued with consent and recipient details. No email, WhatsApp or push provider is connected in this environment.</p>
          <ul class="notifications">${notificationRows}</ul>
        </div>
      </div>
    </section>

    ${modules.orders ? `<section class="tab" id="tab-orders"><div class="panel"><h2>Orders <span class="muted">${data.orders.length}</span></h2><div class="hint muted" style="font-size:11px;margin-bottom:10px">Status changes are saved to the customer's order and can be checked in the app.</div>${orderRows}</div></section>` : ''}

    ${modules.bookings ? `<section class="tab" id="tab-bookings"><div class="panel"><h2>Bookings <span class="muted">${data.bookings.length}</span></h2><div class="hint muted" style="font-size:11px;margin-bottom:10px">Confirm a request only when the time is actually held. Customers see the updated status.</div>${bookingRows}</div></section>` : ''}

    ${modules.products ? `<section class="tab" id="tab-products"><div class="panel"><h2>Products &amp; services</h2><p class="note" style="margin-bottom:10px">Prices are in ${esc(project.spec.currency ?? 'USD')}. Checkout always uses these server-side prices, never a browser-supplied total.</p><div id="productEditor"></div><button class="btn" type="button" data-add-category>+ Category</button><div class="savebar"><button class="btn primary" type="button" data-save-catalog>Save catalogue</button><span id="catalogStatus"></span></div></div></section>` : ''}

    ${modules.categories ? `<section class="tab" id="tab-categories"><div class="panel"><h2>Categories</h2><p class="note">Categories group the products and services shown in the app. Renaming one updates the catalogue navigation.</p><div id="categoryEditor"></div><button class="btn" type="button" data-add-category>+ Category</button><div class="savebar"><button class="btn primary" type="button" data-save-catalog>Save categories</button><span id="categoryStatus"></span></div></div></section>` : ''}

    ${modules.customers ? `<section class="tab" id="tab-customers"><div class="panel"><h2>Customers <span class="muted">${data.customers.length}</span></h2><p class="note" style="margin-bottom:10px">Customers are created from guest checkout, bookings and enquiries. They are not forced to create an account to browse.</p><table><thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Orders</th><th>Bookings</th><th>Enquiries</th></tr></thead><tbody>${customerRows}</tbody></table></div></section>` : ''}

    ${modules.enquiries ? `<section class="tab" id="tab-enquiries"><div class="panel"><h2>Enquiries <span class="muted">${data.enquiries.length}</span></h2>${enquiryRows}</div></section>` : ''}

    ${modules.offers ? `<section class="tab" id="tab-offers"><div class="panel"><h2>Offers</h2><p class="note" style="margin-bottom:10px">Only publish offers the business can honour. Offers appear in the app immediately after saving.</p><div id="offerEditor"></div><button class="btn" type="button" data-add-offer>+ Offer</button><div class="savebar"><button class="btn primary" type="button" data-save-catalog>Save offers</button><span id="offerStatus"></span></div></div></section>` : ''}

    ${modules.analytics ? `<section class="tab" id="tab-analytics"><div class="panel"><h2>Sales &amp; analytics</h2><div class="cards" style="grid-template-columns:repeat(3,minmax(0,1fr))"><div class="card"><span>Order value</span><b>${money(data.summary.orderValue, symbol)}</b><small>Committed order value</small></div><div class="card"><span>Orders</span><b>${data.summary.orders}</b><small>${data.summary.openOrders} open</small></div><div class="card"><span>Bookings</span><b>${data.summary.bookings}</b><small>${data.summary.upcomingBookings} upcoming</small></div></div><h2 style="margin-top:16px">Most ordered</h2><table><thead><tr><th>Item</th><th>Quantity</th><th>Value</th></tr></thead><tbody>${topItems}</tbody></table><p class="note" style="margin-top:12px">These figures describe orders taken in the app. They are not payment settlement figures, because no payment gateway is connected.</p></div></section>` : ''}

    ${modules.settings ? `<section class="tab" id="tab-settings"><div class="panel settings"><h2>Application settings</h2>${hasSample ? `<div class="sample-box" id="sampleBox"><b>Sample content remains</b><p>${esc(sampleLabels.join(' · '))}. Save the catalogue or these details to mark them as yours. Removing samples clears only the groups still marked as examples — your saved catalogue, photos and layout stay.</p><div class="sample-actions"><button type="button" id="clearSample">Remove sample content</button><span id="sampleStatus"></span></div></div>` : ''}<form id="settingsForm"><div class="form-grid"><div class="field"><label for="setName">Business name</label><input id="setName" name="name" maxlength="60" value="${esc(project.spec.name)}" /></div><div class="field"><label for="setCategory">Category</label><input id="setCategory" name="category" maxlength="40" value="${esc(project.spec.category ?? '')}" /></div></div><div class="field"><label for="setTagline">Tagline</label><input id="setTagline" name="tagline" maxlength="90" value="${esc(project.spec.tagline)}" /></div><div class="field"><input type="hidden" name="indexable" value="off" /><label for="setIndexable"><input id="setIndexable" name="indexable" type="checkbox" value="on"${project.spec.indexable ? ' checked' : ''} /> Allow search engines to index the customer app</label><span class="note">Off by default. The app and its previews stay out of search results until you deliberately opt in.</span></div><div class="field"><label for="setAccent">Brand colour</label><input id="setAccent" name="accent" type="color" value="${esc(project.accent)}" style="width:72px;height:36px;padding:3px" /></div><div class="form-grid"><div class="field"><label for="setPhone">Phone</label><input id="setPhone" name="phone" maxlength="24" value="${esc(project.spec.phone)}" /></div><div class="field"><label for="setEmail">Email</label><input id="setEmail" name="email" maxlength="80" value="${esc(project.spec.email ?? '')}" /></div></div><div class="field"><label for="setAddress">Address</label><input id="setAddress" name="address" maxlength="60" value="${esc(project.spec.address)}" /></div><div class="field"><label for="setHours">Opening hours</label><input id="setHours" name="hours" maxlength="90" value="${esc(project.spec.hours)}" /></div><div class="field"><label for="setStaff">Team members (comma separated)</label><input id="setStaff" name="staff" maxlength="500" value="${esc((project.spec.staff ?? []).join(', '))}" placeholder="e.g. Maya, Sam, Priya" /><span class="note">Named team members become an optional choice on service bookings.</span></div><div class="field"><label for="setTeam">Profile cards</label><textarea id="setTeam" name="team" rows="4" maxlength="2400" placeholder="Dr Amara Osei | Principal dentist | GDC 84210">${esc((project.spec.team ?? []).map((person) => [person.name, person.role, person.credential].filter(Boolean).join(' | ')).join('\n'))}</textarea><span class="note">One person per line: name | role | credential. These drive the doctor, coach and studio profile cards.</span></div><div class="field"><label for="setStory">About</label><textarea id="setStory" name="story" maxlength="600">${esc(project.spec.story)}</textarea></div><div class="savebar"><button class="btn primary" type="submit">Save settings</button><span id="settingsStatus"></span></div></form><p class="note">The visual editor remains the place for layout, photography and design direction.</p></div></section>` : ''}
  </main>
</div>
<script>
const TOKEN = ${JSON.stringify(token)};
const CATALOG = ${catalogJson};
const OFFERS = ${offersJson};
const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = (cents) => ${JSON.stringify(symbol)} + (Number(cents) / 100).toFixed(2);

function setTab(id) {
  document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('on', tab.id === 'tab-' + id));
  document.querySelectorAll('[data-tab]').forEach((button) => button.classList.toggle('on', button.dataset.tab === id));
  if (location.hash !== '#' + id) history.replaceState(null, '', '#' + id);
  window.scrollTo({ top: 0 });
}
document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => setTab(button.dataset.tab)));
document.querySelectorAll('[data-go-tab]').forEach((button) => button.addEventListener('click', () => setTab(button.dataset.goTab)));

function renderProducts() {
  const host = $('productEditor');
  if (!host) return;
  host.innerHTML = CATALOG.map((section, sectionIndex) => '<div class="catalog-group"><div class="catalog-head"><input data-section-name="' + sectionIndex + '" value="' + esc(section.name) + '" maxlength="40" aria-label="Category name" /><span class="muted" style="font-size:10px">' + section.items.length + ' items</span></div>' +
    (section.items.length ? section.items.map((item, itemIndex) => '<div class="catalog-row">' +
      '<input data-product="' + sectionIndex + ':' + itemIndex + '" data-field="name" value="' + esc(item.name) + '" maxlength="60" placeholder="Name" aria-label="Product name" />' +
      '<input data-product="' + sectionIndex + ':' + itemIndex + '" data-field="desc" value="' + esc(item.desc || '') + '" maxlength="120" placeholder="Description" aria-label="Product description" />' +
      '<input data-product="' + sectionIndex + ':' + itemIndex + '" data-field="price" type="number" min="0" step="0.01" value="' + ((item.price || 0) / 100).toFixed(2) + '" aria-label="Price" />' +
      '<button class="x" type="button" data-remove-product="' + sectionIndex + ':' + itemIndex + '" aria-label="Remove">✕</button></div>').join('') : '<p class="note">No items in this category yet.</p>') +
    '<button class="add" type="button" data-add-product="' + sectionIndex + '">+ Product or service</button></div>').join('');
}
function renderCategories() {
  const host = $('categoryEditor');
  if (!host) return;
  host.innerHTML = CATALOG.map((section, index) => '<div class="catalog-group"><div class="catalog-head"><input data-section-name="' + index + '" value="' + esc(section.name) + '" maxlength="40" aria-label="Category name" /><span class="muted" style="font-size:10px">' + section.items.length + ' items</span><button class="x" type="button" data-remove-category="' + index + '" aria-label="Remove category">✕</button></div></div>').join('');
}
function renderOffers() {
  const host = $('offerEditor');
  if (!host) return;
  host.innerHTML = OFFERS.length ? OFFERS.map((offer, index) => '<div class="catalog-row" style="grid-template-columns:1fr 2fr 26px"><input data-offer="' + index + '" data-field="title" value="' + esc(offer.title) + '" maxlength="60" placeholder="Offer title" /><input data-offer="' + index + '" data-field="body" value="' + esc(offer.body) + '" maxlength="160" placeholder="What the customer gets" /><button class="x" type="button" data-remove-offer="' + index + '" aria-label="Remove">✕</button></div>').join('') : '<p class="note">No offers. An empty offers list is better than an unhonoured promise.</p>';
}
renderProducts(); renderCategories(); renderOffers();

document.addEventListener('input', (event) => {
  const target = event.target;
  if (target.dataset.sectionName !== undefined) {
    CATALOG[Number(target.dataset.sectionName)].name = target.value;
    return;
  }
  if (target.dataset.product) {
    const [sectionIndex, itemIndex] = target.dataset.product.split(':').map(Number);
    const item = CATALOG[sectionIndex] && CATALOG[sectionIndex].items[itemIndex];
    if (!item) return;
    if (target.dataset.field === 'price') item.price = Math.max(0, Math.round(Number(target.value || 0) * 100));
    else item[target.dataset.field] = target.value;
    return;
  }
  if (target.dataset.offer !== undefined) {
    const offer = OFFERS[Number(target.dataset.offer)];
    if (offer) offer[target.dataset.field] = target.value;
  }
});

document.addEventListener('click', (event) => {
  const addProduct = event.target.closest('[data-add-product]');
  if (addProduct) { CATALOG[Number(addProduct.dataset.addProduct)].items.push({ name: 'New item', desc: '', price: 0 }); renderProducts(); return; }
  const removeProduct = event.target.closest('[data-remove-product]');
  if (removeProduct) { const [sectionIndex, itemIndex] = removeProduct.dataset.removeProduct.split(':').map(Number); CATALOG[sectionIndex].items.splice(itemIndex, 1); renderProducts(); renderCategories(); return; }
  const addCategory = event.target.closest('[data-add-category]');
  if (addCategory) { CATALOG.push({ name: 'New category', items: [] }); renderProducts(); renderCategories(); return; }
  const removeCategory = event.target.closest('[data-remove-category]');
  if (removeCategory) { if (confirm('Remove this category and its items?')) { CATALOG.splice(Number(removeCategory.dataset.removeCategory), 1); renderProducts(); renderCategories(); } return; }
  const addOffer = event.target.closest('[data-add-offer]');
  if (addOffer) { OFFERS.push({ title: '', body: '' }); renderOffers(); return; }
  const removeOffer = event.target.closest('[data-remove-offer]');
  if (removeOffer) { OFFERS.splice(Number(removeOffer.dataset.removeOffer), 1); renderOffers(); return; }
  const save = event.target.closest('[data-save-catalog]');
  if (save) { saveCatalog(save); return; }
  const status = event.target.closest('[data-status]');
  if (status) { updateStatus(status); }
});

async function saveCatalog(button) {
  const id = button.closest('#tab-offers') ? 'offerStatus' : button.closest('#tab-categories') ? 'categoryStatus' : 'catalogStatus';
  const holder = $(id);
  if (holder) holder.textContent = 'Saving…';
  const response = await fetch('/api/projects/' + TOKEN + '/dashboard/catalog', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ menu: CATALOG, offers: OFFERS }) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) { if (holder) holder.textContent = (body.error && body.error.message) || 'Could not save.'; return; }
  CATALOG.splice(0, CATALOG.length, ...body.menu); OFFERS.splice(0, OFFERS.length, ...body.offers);
  renderProducts(); renderCategories(); renderOffers();
  if (holder) holder.textContent = 'Saved. The app now uses this catalogue.';
}

async function updateStatus(button) {
  const kind = button.dataset.kind;
  button.disabled = true;
  const response = await fetch('/api/projects/' + TOKEN + '/' + kind + '/' + encodeURIComponent(button.dataset.id), {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: button.dataset.status }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    alert((body.error && body.error.message) || 'Could not update this status.');
    button.disabled = false;
    return;
  }
  location.reload();
}

const settingsForm = $('settingsForm');
if (settingsForm) settingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(settingsForm);
  const payload = Object.fromEntries(form.entries());
  $('settingsStatus').textContent = 'Saving…';
  const response = await fetch('/api/projects/' + TOKEN + '/app-settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  const body = await response.json().catch(() => ({}));
  $('settingsStatus').textContent = response.ok ? 'Saved. Customer app updated.' : ((body.error && body.error.message) || 'Could not save.');
  if (response.ok) setTimeout(() => location.reload(), 500);
});

const clearSample = $('clearSample');
if (clearSample) clearSample.addEventListener('click', async () => {
  const ok = confirm('Remove the sample catalogue, offers, story, team and contact details that are still marked as examples? Your saved catalogue, photos and layout are kept. This cannot be undone from here.');
  if (!ok) return;
  clearSample.disabled = true;
  $('sampleStatus').textContent = 'Removing…';
  const response = await fetch('/api/projects/' + TOKEN + '/personalise/clear-samples', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ confirm: 'remove-sample-content' }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    $('sampleStatus').textContent = (body.error && body.error.message) || 'Could not remove the samples.';
    clearSample.disabled = false;
    return;
  }
  location.reload();
});

const initial = location.hash.slice(1);
if (initial && document.getElementById('tab-' + initial)) setTab(initial);
</script>
</body>
</html>`
}
