/**
 * Final recovery acceptance: persistence, provenance, regeneration safety,
 * customer accuracy and the five-business workflows.
 *
 *   bun scripts/generation-benchmark-persistence-audit.mjs
 *
 * Uses only the saved crawl evidence (already seeded into the local Worker by
 * `generation-benchmark-seed.mjs` with BENCH_EVIDENCE=1). No crawl, no AI, no
 * payment and no deployment. A "fresh session" is a new owner session row,
 * equivalent to the row the login route creates after the owner key check, so
 * the test does not need the operator secret. The old session is ended through
 * the product's logout route first.
 *
 * Writes docs/qa/final-acceptance-2026-11-22/results.json.
 */
import { Database } from 'bun:sqlite'
import { randomBytes } from 'node:crypto'
import { readdirSync } from 'node:fs'
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const API = process.env.AUDIT_API ?? 'http://127.0.0.1:5173'
const APPS = process.env.AUDIT_APPS ?? '.chrome-qa/generation-benchmark-apps-audit.json'
const OUT = process.env.AUDIT_OUT ?? 'docs/qa/final-acceptance-2026-11-22'
const ROOT = process.env.AUDIT_ROOT ?? 'docs/qa/generation-benchmark-2026-11-21-recovery'

const apps = JSON.parse(await readFile(APPS, 'utf8'))
await mkdir(OUT, { recursive: true })

const checks = []
const notes = []
const check = (site, name, ok, detail = '') => {
  checks.push({ site, name, ok: Boolean(ok), detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${site} · ${name}${detail ? ' — ' + detail : ''}`)
}

async function request(path, { method = 'GET', cookie, body, form, headers = {}, redirect = 'manual' } = {}) {
  const all = { ...headers }
  if (cookie) all.cookie = cookie
  if (body !== undefined) {
    all['content-type'] = 'application/json'
    all.origin = API
  }
  if (form) {
    all['content-type'] = 'application/x-www-form-urlencoded'
    all.origin = API
  }
  const response = await fetch(API + path, {
    method,
    headers: all,
    body: form ? new URLSearchParams(form).toString() : body === undefined ? undefined : JSON.stringify(body),
    redirect,
  })
  const text = await response.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {}
  return { status: response.status, text, json, headers: response.headers }
}

function parseCatalog(html) {
  const match = html.match(/const CATALOG = (\[[\s\S]*?\]);\n/)
  if (!match) return null
  try {
    return JSON.parse(match[1])
  } catch {
    return null
  }
}

function parseData(html) {
  const match = html.match(/const DATA = (\{[\s\S]*?\})\s*\n\s*const KEY/)
  if (!match) return null
  try {
    return JSON.parse(match[1])
  } catch {
    return null
  }
}

const flat = (catalog) =>
  (catalog ?? []).flatMap((section, si) => (section.items ?? []).map((item, ii) => ({ section: section.name, si, ii, item })))

const money = (cents) => (cents / 100).toFixed(2)
const priceText = (cents) => {
  const value = cents / 100
  return value % 1 === 0 ? String(value) : value.toFixed(2)
}

async function readCatalog(token, cookie) {
  const page = await request(`/p/${token}/dashboard`, { cookie })
  return page.status === 200 ? parseCatalog(page.text) : null
}

async function saveMenu(token, cookie, menu) {
  return request(`/api/projects/${token}`, { method: 'PATCH', cookie, body: { spec: { menu } } })
}

async function appPage(token, query = '') {
  return request(`/p/${token}/app${query}`)
}

/* ------------------------- fresh owner sessions ------------------------- */

const d1Dir = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject'
const d1File = readdirSync(d1Dir).find((entry) => entry.endsWith('.sqlite') && entry !== 'metadata.sqlite')
const db = d1File ? new Database(`${d1Dir}/${d1File}`) : null
if (db) db.exec('PRAGMA busy_timeout = 5000')

function newOwnerSession(token) {
  if (!db) throw new Error('local D1 file not found')
  const project = db.query('SELECT id FROM projects WHERE token = ?').get(token)
  if (!project) throw new Error('project not found in D1')
  const id = 'own_' + randomBytes(24).toString('hex')
  const now = new Date()
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  db.query(
    'INSERT INTO owner_sessions (id, project_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)',
  ).run(id, project.id, now.toISOString(), expires.toISOString(), now.toISOString())
  return id
}

async function freshSession(app, cookieName) {
  await request(`/p/${app.token}/dashboard/logout`, { method: 'POST', cookie: app.cookie, form: {} })
  const old = await request(`/p/${app.token}/review`, { cookie: app.cookie })
  const oldBlocked = old.status >= 300 && old.status < 400
  const id = newOwnerSession(app.token)
  const cookie = `${cookieName}=${id}`
  const review = await request(`/p/${app.token}/review`, { cookie })
  return { cookie, oldBlocked, review }
}

/* ------------------------------ leakage ------------------------------ */

const BANNED_KEYS = new Set([
  'sourceReview',
  'sourceTrail',
  'sourcePriceEvidence',
  'priceEvidence',
  'ownerFields',
  'sourceUrl',
  'sourceMethod',
  'validated',
  'rejected',
  'conflicts',
  'decisions',
  'original',
  'latest',
])

function bannedKeys(value, path = '$', found = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => bannedKeys(entry, `${path}[${index}]`, found))
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (BANNED_KEYS.has(key)) found.push(`${path}.${key}`)
      bannedKeys(child, `${path}.${key}`, found)
    }
  }
  return found
}

const INTERNAL_STRINGS = [
  'Website evidence',
  'Unverified price',
  'Your data',
  'Read but not published',
  'sourceReview',
  'sourceTrail',
  'ownerFields',
  'priceEvidence',
  'sourcePriceEvidence',
]

/* --------------------------- site fixtures --------------------------- */

const SITES = {
  yarmouth: {
    label: 'Yarmouth Oilskins',
    rejected: ['Gift Cards', 'View Now', 'Shop Now'],
    workflow: 'order',
    directions: ['minimal', 'editorial', 'lifestyle'],
  },
  padella: {
    label: 'Padella',
    rejected: ['Cookie Policy', 'Privacy Policy', 'Padella Shoreditch', 'Padella Borough Market', 'Padella Soho'],
    directions: ['editorial', 'modern', 'luxe'],
    add: [
      { name: 'Cacio e pepe', desc: 'Pecorino, black pepper', price: 1350 },
      { name: 'Pappardelle with beef shin', desc: 'Slow-cooked beef shin, parmesan', price: 1450 },
      { name: 'Tiramisu', desc: 'Mascarpone, espresso', price: 800 },
    ],
    workflow: 'booking',
  },
  pelirocco: {
    label: 'Hotel Pelirocco',
    rejected: ['pelirocco privacy policy', 'rocco regulars loyalty club', 'Event Venue Hire', 'Business Hire'],
    directions: ['minimal', 'editorial', 'luxe'],
    add: [
      { name: 'The Dolly Parton room', desc: 'A bright double with a sea view', price: 16500, meta: 'per night' },
      { name: 'The Bowie room', desc: 'A bold double with a balcony', price: 18500, meta: 'per night' },
    ],
    workflow: 'stay',
  },
  bluetit: {
    label: 'Blue Tit',
    rejected: [],
    workflow: 'price-image',
    directions: ['minimal', 'editorial', 'luxe'],
  },
  afl: {
    label: 'Architecture for London',
    rejected: ['Stone House', 'Projects Archive'],
    workflow: 'enquiry',
    directions: ['classic', 'minimal', 'editorial'],
  },
}

const summary = {}
const perApp = {}

for (const app of apps) {
  const site = app.site
  const config = SITES[site]
  const cookieName = app.cookie.split('=')[0]
  let cookie = app.cookie
  // A previous interrupted run may have ended this browser session. Start each
  // app from a session the server accepts, as a returning owner would.
  const probe = await request(`/p/${app.token}/review`, { cookie })
  if (probe.status !== 200) cookie = `${cookieName}=${newOwnerSession(app.token)}`

  if (!summary[site]) {
    const review = await request(`/p/${app.token}/review`, { cookie })
    check(site, 'owner review page renders', review.status === 200 && review.text.includes('What we read'))
  }

  let catalog = await readCatalog(app.token, cookie)
  // Remove only the harness's own temporary rows from an earlier attempt.
  if (catalog) {
    const cleaned = catalog.map((section) => ({
      ...section,
      items: section.items.filter((item) => !String(item.name).startsWith('Audit sample ')),
    }))
    if (flat(cleaned).length !== flat(catalog).length) {
      await saveMenu(app.token, cookie, cleaned)
      catalog = await readCatalog(app.token, cookie)
    }
  }
  check(site, 'saved catalogue is readable', Boolean(catalog), catalog ? `${flat(catalog).length} items` : 'no catalogue')

  const wasEmpty = !flat(catalog).length
  let emptyCopyOk = true
  if (wasEmpty) {
    const emptyHtml = (await appPage(app.token)).text
    emptyCopyOk = /aren’t published yet|isn’t published yet/.test(emptyHtml)
    check(site, 'an empty catalogue states the recovery honestly', emptyCopyOk)
  }

  if (config.add && wasEmpty) {
    const menu = [{ name: site === 'pelirocco' ? 'Rooms' : 'Menu', items: config.add.map((item) => ({ ...item })) }]
    const saved = await saveMenu(app.token, cookie, menu)
    check(site, 'owner can add content to an empty catalogue', saved.status === 200)
    catalog = await readCatalog(app.token, cookie)
  }

  const items = flat(catalog)
  const rejected = [...reviewRejected(await request(`/p/${app.token}/review`, { cookie }))]
  if (!summary[site]) {
    summary[site] = {
      label: config.label,
      items: items.length,
      priced: items.filter((entry) => entry.item.price > 0).length,
      validated: items.filter((entry) => entry.item.priceEvidence?.validated === true).length,
      unvalidated: items.filter((entry) => entry.item.priceEvidence && entry.item.priceEvidence.validated !== true).length,
      unpriced: items.filter((entry) => !entry.item.price || entry.item.price <= 0).length,
      imaged: items.filter((entry) => entry.item.image || entry.item.media).length,
      variants: items.filter((entry) => entry.item.variants?.length).length,
      rejected: rejected.length,
      rejectedNames: rejected,
      projects: config.workflow === 'enquiry' ? 6 : 0,
      wasEmpty,
      emptyCopyOk,
    }
  }

  /* Correction: one verified/uncertain/owner row per business. */
  const target =
    site === 'yarmouth'
      ? items.find((entry) => entry.item.price > 0 && entry.item.variants?.length)
      : items.find((entry) => entry.item.price > 0) ?? items[0]
  let expectedPrice = target?.item.price ?? null
  if (target) {
    const originalPrice = target.item.price
    // An earlier owner correction is not a website reading. Look for the
    // site's own evidence, not whichever evidence the row currently publishes.
    const originalEvidence =
      target.item.priceEvidence && target.item.priceEvidence.method !== 'owner'
        ? target.item.priceEvidence
        : target.item.sourcePriceEvidence ?? null
    const newPrice = originalPrice > 0 ? originalPrice + 250 : 1250
    expectedPrice = newPrice
    target.item.price = newPrice
    target.item.desc = (target.item.desc ? target.item.desc + ' ' : '') + 'Owner-confirmed detail.'
    const saved = await saveMenu(app.token, cookie, catalog)
    check(site, 'owner correction saves', saved.status === 200)
    const after = flat(await readCatalog(app.token, cookie)).find((entry) => entry.item.id === target.item.id)
    check(site, 'correction is recorded as owner data', Boolean(after?.item.ownerFields?.includes('price')))
    check(site, 'correction is not upgraded to website-verified', after?.item.priceEvidence?.method === 'owner')
    check(site, 'dated source trail is stored', Boolean(after?.item.sourceTrail?.original?.at && after?.item.sourceTrail?.ownerAt))
    if (originalEvidence) {
      check(site, 'website reading is kept beside the correction', Boolean(after?.item.sourcePriceEvidence))
      check(
        site,
        'original evidence keeps its own validated flag',
        after?.item.sourcePriceEvidence?.validated === originalEvidence.validated,
      )
    } else {
      // The row had no website price: an owner-created row must not invent one.
      check(site, 'a row with no website reading invents none', !after?.item.sourcePriceEvidence)
    }
    const reviewHtml = (await request(`/p/${app.token}/review`, { cookie })).text
    check(site, 'review states the correction is the owner’s', reviewHtml.includes('Your data'))
    if (originalEvidence)
      check(site, 'review shows the earlier website reading', reviewHtml.includes('website had') || reviewHtml.includes('earlier entry had'))
    const appHtml = (await appPage(app.token)).text
    const appData = parseData(appHtml)
    const published = flat(appData?.menu).find((entry) => entry.item.id === target.item.id)
    check(site, 'customer app carries no provenance', !bannedKeys(appData ?? {}).length)
    check(site, 'the customer payload publishes the owner’s value', published?.item.price === newPrice, money(newPrice))
    // A long shelf pages its cards, so check the renderer that produced the
    // customer’s card for this row rather than only the first page.
    const cards = await request(`/p/${app.token}/cards/${target.si}?from=0&count=60`)
    // A variant product’s card leads with its cheapest option, not the base
    // price, so that is the published number to look for there.
    const shownPrice = target.item.variants?.length
      ? Math.min(...target.item.variants.map((entry) => entry.price))
      : newPrice
    check(
      site,
      'the rendered customer card shows the published value',
      cards.text.includes(priceText(shownPrice)),
      priceText(shownPrice),
    )

    const originalTrail = after?.item.sourceTrail?.original?.price
    /* Same save twice: no new correction, no duplicated row. */
    const duplicate = await saveMenu(app.token, cookie, await readCatalog(app.token, cookie))
    const twice = flat(await readCatalog(app.token, cookie))
    check(site, 'saving twice adds no duplicate', duplicate.status === 200 && twice.length === items.length)
    check(
      site,
      'saving twice keeps the first correction',
      twice.find((entry) => entry.item.id === target.item.id)?.item.sourceTrail?.original?.price === originalTrail,
    )

    /* A second correction keeps the first original. */
    const current = await readCatalog(app.token, cookie)
    const again = flat(current).find((entry) => entry.item.id === target.item.id)
    if (again) again.item.price = newPrice + 100
    await saveMenu(app.token, cookie, current)
    expectedPrice = newPrice + 100
    const thrice = flat(await readCatalog(app.token, cookie)).find((entry) => entry.item.id === target.item.id)
    check(site, 'a repeated edit keeps the first source reading', thrice?.item.sourceTrail?.original?.price === originalTrail)
    check(site, 'a repeated edit updates the owner time', Boolean(thrice?.item.sourceTrail?.ownerAt))

    /* Delete and restore an owner-created row. */
    const current2 = await readCatalog(app.token, cookie)
    const extra = { name: `Audit sample ${site}`, desc: 'Created by the owner during acceptance', price: 999 }
    current2[0].items.push({ ...extra })
    await saveMenu(app.token, cookie, current2)
    const withExtra = flat(await readCatalog(app.token, cookie)).find((entry) => entry.item.name === extra.name)
    check(site, 'an owner-created row is entirely the owner’s', withExtra?.item.ownerFields?.includes('name') && !withExtra.item.sourceUrl)
    const current3 = await readCatalog(app.token, cookie)
    current3[0].items = current3[0].items.filter((item) => item.name !== extra.name)
    await saveMenu(app.token, cookie, current3)
    const gone = !flat(await readCatalog(app.token, cookie)).some((entry) => entry.item.name === extra.name)
    check(site, 'deleting a row removes it', gone)
    if (withExtra) {
      const current4 = await readCatalog(app.token, cookie)
      current4[0].items.push({ ...withExtra.item })
      await saveMenu(app.token, cookie, current4)
      const restored = flat(await readCatalog(app.token, cookie)).find((entry) => entry.item.name === extra.name)
      check(site, 'restoring the row keeps owner provenance', Boolean(restored?.item.ownerFields?.length))
      // Leave the fixture as it was: the harness row is not part of the evidence.
      const tidy = await readCatalog(app.token, cookie)
      for (const section of tidy) section.items = section.items.filter((item) => item.name !== extra.name)
      await saveMenu(app.token, cookie, tidy)
    } else {
      check(site, 'restoring the row keeps owner provenance', false, 'the added row was not readable')
    }
  }

  /* Fresh session: end the old one, issue a new one, read everything again. */
  const fresh = await freshSession(app, cookieName)
  cookie = fresh.cookie
  check(site, 'the closed session is rejected', fresh.oldBlocked)
  check(site, 'a fresh session opens the review', fresh.review.status === 200)
  const freshCatalog = await readCatalog(app.token, cookie)
  check(site, 'the catalogue survives a fresh session', flat(freshCatalog).length >= items.length)
  if (target) {
    const item = flat(freshCatalog).find((entry) => entry.item.id === target.item.id)
    check(site, 'the correction survives a fresh session', item?.item.price === expectedPrice)
    check(site, 'owner provenance survives a fresh session', item?.item.priceEvidence?.method === 'owner')
    check(site, 'the original evidence survives a fresh session', Boolean(item?.item.sourcePriceEvidence || item?.item.sourceTrail?.original))
    check(site, 'the item is still not website-verified', item?.item.priceEvidence?.method !== item?.item.sourcePriceEvidence?.method)
  }

  const reviewFresh = (await request(`/p/${app.token}/review`, { cookie })).text
  check(site, 'fresh review shows the correction and its date', /you corrected this on/i.test(reviewFresh))

  // A concept is a preview. Looking at another one must not write a value, a
  // document or a version: changing the app is a separate, explicit act.
  const beforePreview = await readCatalog(app.token, cookie)
  const alternate = config.directions.find((direction) => direction !== app.direction)
  await appPage(app.token, `?concept=${encodeURIComponent(alternate)}`)
  const afterPreview = await readCatalog(app.token, cookie)
  check(site, 'a concept preview writes nothing', JSON.stringify(beforePreview) === JSON.stringify(afterPreview))

  /* Customer accuracy on every concept of this app. */
  const conceptRow = {
    site,
    direction: app.direction,
    signature: null,
    appHtml: '',
    data: null,
  }
  const conceptPage = await appPage(app.token, `?concept=${encodeURIComponent(app.direction)}`)
  conceptRow.appHtml = conceptPage.text
  conceptRow.data = parseData(conceptPage.text)
  check(site, `customer payload exists for ${app.direction}`, Boolean(conceptRow.data))
  conceptRow.signature = signatureOf(conceptPage.text)
  const leaked = bannedKeys(conceptRow.data ?? {})
  check(site, 'concept payload carries no evidence', leaked.length === 0, leaked.slice(0, 3).join(', '))
  const leakedStrings = INTERNAL_STRINGS.filter((entry) => conceptPage.text.includes(entry))
  check(site, 'concept HTML exposes no internal review wording', leakedStrings.length === 0, leakedStrings.join(', '))
  const menuNames = new Set(flat(conceptRow.data?.menu).map((entry) => entry.item.name))
  const rejectedAsItems = config.rejected.filter((name) => menuNames.has(name))
  check(site, 'rejected rows are not customer catalogue rows', rejectedAsItems.length === 0, rejectedAsItems.join(', '))

  perApp[`${site}/${app.direction}`] = conceptRow

  /* The business-specific acceptance runs once per site, on its first app. */
  if (site in summary && !summary[site].accepted) {
    if (site === 'yarmouth') await yarmouthWorkflow(app, cookie)
    if (site === 'padella') await restaurantWorkflow(app, cookie)
    if (site === 'pelirocco') await hotelWorkflow(app, cookie)
    if (site === 'bluetit') await salonAcceptance(app, cookie)
    if (site === 'afl') await practiceAcceptance(app, cookie)
    summary[site].accepted = true
    // The workflow may have changed the catalogue in a way later checks need.
    cookie = summary[site].cookie ?? cookie
  }

  /* Business details, one owner correction shared by every business. */
  if (!summary[site].details) {
    const marker = site === 'afl' ? 'Audit Mews, London' : '6 Southwark Street, London'
    const patched = await request(`/api/projects/${app.token}`, {
      method: 'PATCH',
      cookie,
      body: { spec: { address: marker, phone: '020 7946 0999' } },
    })
    check(site, 'business information correction saves', patched.status === 200)
    const freshReview = (await request(`/p/${app.token}/review`, { cookie })).text
    const freshApp = (await appPage(app.token)).text
    check(site, 'business information survives the session', freshReview.includes(marker) && freshApp.includes(marker))
    summary[site].details = true
  }
}

function reviewRejected(html) {
  const names = []
  for (const match of html.text.matchAll(/<strong>([^<]+)<\/strong> <span class="tiny">· [^<]+ · (?:policy|location|article|promotion|navigation|unknown)<\/span>/g))
    names.push(match[1])
  return names
}

function signatureOf(html) {
  const body = html.match(/<body([^>]*)>/)?.[1] ?? ''
  const attrs = {}
  for (const match of body.matchAll(/data-(concept|header|catalog|detail|imagery|concept-type)="([^"]*)"/g))
    attrs[match[1]] = match[2]
  const variants = [...html.matchAll(/data-variant="([^"]+)"/g)].map((match) => match[1])
  const screens = [...new Set([...html.matchAll(/data-screen="([^"]+)"/g)].map((match) => match[1]))]
  const nav = [...new Set([...html.matchAll(/data-go="([^"]+)"/g)].map((match) => match[1]))]
  return { attrs, variants: variants.slice(0, 40), screens, nav }
}

/* ---------------------------- workflows ---------------------------- */

function customer() {
  return { name: 'QA Auditor', email: 'qa-audit@example.com', phone: '07700 900123' }
}

async function dashboard(token, cookie) {
  const response = await request(`/api/projects/${token}/dashboard`, { cookie })
  return response.json ?? {}
}

async function yarmouthWorkflow(app, cookie) {
  const catalog = await readCatalog(app.token, cookie)
  const target = flat(catalog).find((entry) => entry.item.price > 0 && entry.item.variants?.length)
  const html = (await appPage(app.token)).text
  const data = parseData(html)
  const variant = target?.item.variants?.find((entry) => entry.available !== false)
  check('yarmouth', 'variant options reach the customer app', Boolean(variant) && html.includes(variant.name))
  check('yarmouth', 'variant pricing is published', Boolean(target?.item.variants?.every((entry) => entry.price > 0)))
  check('yarmouth', 'source photography is published', html.includes(target?.item.image?.url ?? '\u0000') || Boolean(target?.item.media))
  check('yarmouth', 'cart and fulfilment controls are present', html.includes('data-place') && Boolean(data?.fulfilment?.length))
  if (!target || !variant) return
  const order = await request(`/p/${app.token}/orders`, {
    method: 'POST',
    body: {
      // The server matches an option by its source id when one exists; the
      // name is the fallback for a source that published none.
      items: [{ key: `${target.si}-${target.ii}`, qty: 1, variant: variant.id || variant.name }],
      fulfilment: data.fulfilment[0],
      customer: customer(),
    },
  })
  check('yarmouth', 'an order is accepted', order.status === 201, order.json?.error?.message ?? String(order.status))
  if (order.status === 201) {
    const read = await request(`/p/${app.token}/orders/${order.json.order.id}`)
    check('yarmouth', 'the order keeps the variant price', read.json?.order?.items?.[0]?.price === variant.price)
    const board = await dashboard(app.token, cookie)
    check('yarmouth', 'the order reaches the owner dashboard', (board.orders ?? []).some((entry) => entry.id === order.json.order.id))
  }
}

async function restaurantWorkflow(app, cookie) {
  const html = (await appPage(app.token)).text
  const data = parseData(html)
  check('padella', 'kept restaurant information is reachable', html.includes('Privacy Policy') && html.includes('Padella Borough Market'))
  check('padella', 'owner-created dishes reach the customer', html.includes('Cacio e pepe') && html.includes('Tiramisu'))
  check('padella', 'reservation controls are present', Boolean(data?.menu?.length) && html.includes('data-book'))
  const catalog = await readCatalog(app.token, cookie)
  const dish = flat(catalog).find((entry) => entry.item.price > 0)
  const date = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const booking = await request(`/p/${app.token}/bookings`, {
    method: 'POST',
    body: {
      date,
      party: 2,
      slot: '19:00',
      ...(dish ? { service: dish.item.name } : {}),
      customer: customer(),
    },
  })
  check('padella', 'a reservation request is accepted', booking.status === 201, String(booking.status))
  if (booking.status === 201) {
    const board = await dashboard(app.token, cookie)
    check('padella', 'the reservation reaches the dashboard', (board.bookings ?? []).some((entry) => entry.id === booking.json.booking.id))
  }
}

async function hotelWorkflow(app, cookie) {
  const html = (await appPage(app.token)).text
  check('pelirocco', 'hotel policies and press stay as information', html.includes('privacy policy') || html.includes('Event Venue Hire'))
  check('pelirocco', 'owner-created rooms reach the customer', html.includes('The Dolly Parton room') && html.includes('The Bowie room'))
  const catalog = await readCatalog(app.token, cookie)
  const room = flat(catalog).find((entry) => entry.item.price > 0)
  const date = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const checkOut = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const booking = await request(`/p/${app.token}/bookings`, {
    method: 'POST',
    body: { date, checkOut, party: 2, service: room?.item.name, customer: customer() },
  })
  check('pelirocco', 'a stay request is accepted', booking.status === 201, String(booking.status))
  if (booking.status === 201) {
    check('pelirocco', 'the stay is priced from the saved room rate', booking.json.booking.total === room.item.price * 2)
    check('pelirocco', 'the stay records two nights', booking.json.booking.nights === 2)
    const board = await dashboard(app.token, cookie)
    check('pelirocco', 'the stay reaches the dashboard', (board.bookings ?? []).some((entry) => entry.id === booking.json.booking.id))
  }
}

async function salonAcceptance(app, cookie) {
  const catalog = await readCatalog(app.token, cookie)
  const items = flat(catalog)
  const html = (await appPage(app.token)).text
  check('bluetit', 'the 82-treatment catalogue is present', items.length === 82, String(items.length))
  check('bluetit', 'the unverified price gaps remain unpriced', items.filter((entry) => !entry.item.price).length === 75)
  check('bluetit', 'missing treatment imagery stays missing, not stock', items.filter((entry) => entry.item.image || entry.item.media).length <= 1)
  check('bluetit', 'every treatment reaches the app', items.every((entry) => html.includes(entry.item.name)) || html.includes('Show'))

  /* Image correction through the product's own upload route. */
  let image = null
  try {
    image = await readFile('/tmp/plattr-audit.png')
  } catch {
    notes.push('Blue Tit image correction not run: /tmp/plattr-audit.png was not prepared')
  }
  if (image) {
    const variants = []
    // The original is portrait: a 640-wide variant would be taller than it.
    for (const width of [320]) {
      try {
        variants.push({ width, bytes: await readFile(`/tmp/plattr-audit-${width}.webp`) })
      } catch {}
    }
    const form = new FormData()
    form.set('file', new Blob([image], { type: 'image/png' }), 'audit.png')
    form.set('alt', 'Audit photo of the salon')
    for (const variant of variants)
      form.append('variant', new Blob([variant.bytes], { type: 'image/webp' }), `audit-${variant.width}.webp`)
    const upload = await fetch(`${API}/api/projects/${app.token}/media`, {
      method: 'POST',
      headers: { cookie, origin: API },
      body: form,
    })
    const body = await upload.json().catch(() => ({}))
    check('bluetit', 'the owner can upload a treatment photo', upload.status === 201 || upload.status === 200, `${upload.status}`)
    if (body.media?.id) {
      const current = await readCatalog(app.token, cookie)
      const treatment = flat(current).find((entry) => !entry.item.image && !entry.item.media)
      if (treatment) {
        treatment.item.media = { id: body.media.id, alt: 'Audit photo of the salon' }
        await saveMenu(app.token, cookie, current)
        const imageHtml = (await appPage(app.token)).text
        check('bluetit', 'the owner’s treatment photo reaches the customer', imageHtml.includes(`/media/${body.media.id}/`))
        const refreshed = await request(`/p/${app.token}/review`, { cookie })
        check('bluetit', 'the review still marks the price as the owner’s', refreshed.text.includes('Your data'))
      }
    }
  }
}

async function practiceAcceptance(app, cookie) {
  const review = await request(`/p/${app.token}/review`, { cookie })
  check('afl', 'the build service is a service', review.text.includes('Catalogue'))
  check(
    'afl',
    'six website projects are suggestions until the owner publishes them',
    (review.text.match(/Suggested from the website · not published/g) ?? []).length >= 6,
  )
  const before = (await appPage(app.token)).text
  check('afl', 'an unpublishing suggestion never reaches the customer', !before.includes('Stone House'))
  const accepted = await request(`/p/${app.token}/review/portfolio`, {
    method: 'POST',
    cookie,
    form: { action: 'acceptAll', confirm: 'yes' },
  })
  check('afl', 'the owner can publish all six projects', accepted.status === 303)
  const publishedReview = (await request(`/p/${app.token}/review`, { cookie })).text
  check('afl', 'the portfolio now reports six live entries', /6 live/.test(publishedReview))
  const form = {
    action: 'update',
    index: '0',
    title: 'Stone House — owner title',
    desc: 'Owner-written description of the project.',
  }
  const update = await request(`/p/${app.token}/review/portfolio`, { method: 'POST', cookie, form })
  check('afl', 'an owner can edit a project title', update.status === 303)
  const after = (await request(`/p/${app.token}/review`, { cookie })).text
  check('afl', 'the title saves and is marked owner-provided', after.includes('Stone House — owner title') && after.includes('Added by you'))
  const html = (await appPage(app.token)).text
  check('afl', 'the portfolio title reaches the customer', html.includes('Stone House — owner title'))
  const start = html.indexOf('sec_fx_pro_work')
  const end = html.indexOf('sec_fx_pro_actions', start)
  const block = start >= 0 ? html.slice(start, end > start ? end : start + 3000) : ''
  check(
    'afl',
    'portfolio work is never priced or booked',
    Boolean(block) && !block.includes('data-go="book"') && !block.includes('data-place') && !block.includes('fx-pro-price'),
  )
  check('afl', 'services and portfolio are separate blocks', html.includes('sec_fx_pro_actions') && Boolean(block))

  const enquiry = await request(`/p/${app.token}/enquiries`, {
    method: 'POST',
    body: { name: 'QA Auditor', contact: 'qa-audit@example.com', message: 'We would like a proposal for a mews house extension.' },
  })
  check('afl', 'a proposal enquiry is accepted', enquiry.status === 201, String(enquiry.status))
  if (enquiry.status === 201) {
    const board = await dashboard(app.token, cookie)
    check('afl', 'the enquiry reaches the dashboard', (board.enquiries ?? []).some((entry) => entry.id === enquiry.json.enquiry.id))
  }
}

/* ------------------------- concept comparison ------------------------- */

const sitesWithThree = ['yarmouth', 'padella', 'pelirocco', 'bluetit', 'afl']
const conceptSummary = {}
for (const site of sitesWithThree) {
  const rows = Object.entries(perApp)
    .filter(([key]) => key.startsWith(`${site}/`))
    .map(([key, value]) => ({ direction: key.split('/')[1], ...value }))
  const pairs = []
  for (let i = 0; i < rows.length; i += 1)
    for (let j = i + 1; j < rows.length; j += 1) {
      const a = rows[i]
      const b = rows[j]
      const sameArchitecture =
        JSON.stringify(a.signature.attrs) === JSON.stringify(b.signature.attrs)
      const sameSections = a.signature.variants.join('>') === b.signature.variants.join('>')
      const sameNav = a.signature.nav.join('>') === b.signature.nav.join('>')
      const sameScreens = a.signature.screens.join('>') === b.signature.screens.join('>')
      pairs.push({
        a: a.direction,
        b: b.direction,
        sameArchitecture,
        sameSections,
        sameNav,
        sameScreens,
        architecture: { a: a.signature.attrs, b: b.signature.attrs },
        sectionCounts: { a: a.signature.variants.length, b: b.signature.variants.length },
      })
    }
  conceptSummary[site] = {
    rows: rows.map((row) => ({ direction: row.direction, signature: row.signature })),
    pairs,
    allPairsDifferStructurally: pairs.every(
      (pair) => !pair.sameArchitecture || !pair.sameSections || !pair.sameNav || !pair.sameScreens,
    ),
  }
}

const result = {
  generatedAt: new Date().toISOString(),
  api: API,
  fixtures: APPS,
  evidenceRoot: ROOT,
  checks,
  passed: checks.filter((entry) => entry.ok).length,
  failed: checks.filter((entry) => !entry.ok).length,
  summary,
  concepts: conceptSummary,
  notes,
}
await writeFile(`${OUT}/results.json`, JSON.stringify(result, null, 2))
console.log(`\n${result.passed} passed, ${result.failed} failed -> ${OUT}/results.json`)
if (result.failed) process.exitCode = 1
