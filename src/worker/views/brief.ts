import { BUNDLES, FEATURES, PLATFORMS, usd } from '../pricing'
import { SAMPLE_IMPORT, sampleTotals } from '../proof'
import { VERTICALS, VERTICAL_GROUPS } from '../verticals'
import type { VerticalId } from '../types'
import { esc, page } from './shell'

const ACCENTS = ['#c8452b', '#e2522d', '#1f6b52', '#2a5a8f', '#8a5a2b', '#5b3f8f', '#17110d']

const GROUPS: { name: 'Selling' | 'Customers' | 'Growth' | 'Brand'; note: string }[] = [
  { name: 'Selling', note: 'How they take money or bookings' },
  { name: 'Customers', note: 'What a customer can do' },
  { name: 'Growth', note: 'Reasons to come back' },
  { name: 'Brand', note: 'The finish' },
]

function featureChecks(): string {
  return GROUPS.map(
    (group) => `
    <div style="margin-bottom:18px">
      <div class="card-head" style="margin-bottom:9px">
        <span class="label">${group.name}</span>
        <span class="tiny">${group.note}</span>
      </div>
      <div class="checks">
        ${FEATURES.filter((feature) => feature.group === group.name)
          .map(
            (feature) => `
          <label class="check">
            <input type="checkbox" data-feature="${feature.id}" ${feature.core ? 'checked disabled' : ''} />
            <span>
              <b>${esc(feature.label)}${feature.core ? ' <span class="tiny">included</span>' : ''}<span class="fee">${feature.price ? `+${usd(feature.price)}` : ''}</span></b>
              <span>${esc(feature.blurb)}</span>
            </span>
          </label>`,
          )
          .join('')}
      </div>
    </div>`,
  ).join('')
}

function verticalPicker(): string {
  return VERTICAL_GROUPS.map(
    (group) => `
    <div style="margin-bottom:14px">
      <div class="label" style="margin-bottom:7px">${esc(group.label)}</div>
      <div class="checks">
        ${group.ids
          .map(
            (id, index) => `
          <label class="check" style="align-items:center;padding:10px 11px">
            <input type="radio" name="vertical" value="${id}" ${group.ids === VERTICAL_GROUPS[0].ids && index === 0 ? 'checked' : ''} />
            <span>
              <b style="font-size:13px">${VERTICALS[id].glyph} ${esc(VERTICALS[id].label)}</b>
              <span>${esc(VERTICALS[id].blurb)}</span>
            </span>
          </label>`,
          )
          .join('')}
      </div>
    </div>`,
  ).join('')
}

function elementRow(key: string, label: string, options: [string, string][]): string {
  return `
    <div class="field" style="margin:0">
      <span class="label">${label}</span>
      <div class="seg" data-el="${key}">
        ${options
          .map(
            ([value, text]) =>
              `<button type="button" data-value="${value}" aria-pressed="false">${text}</button>`,
          )
          .join('')}
      </div>
    </div>`
}

function verticalData(): string {
  const map: Record<string, { label: string; features: string[]; seed: string; kind: string }> = {}
  for (const id of Object.keys(VERTICALS) as VerticalId[]) {
    const vertical = VERTICALS[id]
    map[id] = {
      label: vertical.label,
      features: vertical.features,
      kind: vertical.kind,
      seed: vertical.menu
        .flatMap((section) => section.items)
        .slice(0, 3)
        .map((item) => item.name)
        .join(' · '),
    }
  }
  return JSON.stringify(map).replace(/</g, '\\u003c')
}

export function briefPage(): string {
  const bundle = BUNDLES[0]
  const body = `
  <div class="wrap" style="padding:40px 0 20px">
    <a href="/" class="tiny" style="text-decoration:none">&larr; Back to Plattr</a>
    <div class="grid-2" style="gap:34px;align-items:start;margin-top:14px">
      <div>
        <span class="eyebrow">New brief</span>
        <h1 class="display" style="font-size:clamp(32px,4vw,46px);margin-top:14px">What kind of business is it?</h1>
        <p class="small" style="margin-top:10px;font-size:15px">A restaurant, a salon, a garage, a clinic, a shop — the same generator reshapes itself. Pick the closest type; the app's words, sections and features follow. Anything unusual goes in the last box.</p>
      </div>
      <div class="card flat" style="background:var(--paper-2);border-style:dashed">
        <p class="small"><strong>What happens on submit</strong></p>
        <ul class="ticks" style="margin-top:10px">
          <li>A private build link, unguessable, no account needed</li>
          <li>A working app seeded for that trade, editable in place</li>
          <li>A price for the build, one-time or monthly</li>
        </ul>
      </div>
    </div>
  </div>

  <form class="wrap" id="brief" style="padding-bottom:40px" novalidate>
    <div class="grid-2" style="gap:26px;align-items:start">
      <div class="card">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;flex-wrap:wrap">
          <span class="pill dark" data-step-dot="0">1 Design</span>
          <span class="pill" data-step-dot="1">2 Trade &amp; brand</span>
          <span class="pill" data-step-dot="2">3 Features</span>
          <span class="pill" data-step-dot="3">4 Delivery</span>
        </div>

        <section data-step="0">
          <div class="field">
            <label for="wish">What do you need?</label>
            <textarea id="wish" rows="3" maxlength="240" placeholder="I need an app for my salon — bookings, prices and a loyalty card."></textarea>
            <span class="hint">One sentence is enough. Plain words, typos and all: we read the trade, pick the features that fit and show three designs.</span>
          </div>
          <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
            <button class="btn accent" type="button" data-wish>Show me three designs &rarr;</button>
            <span class="tiny" data-wish-status></span>
          </div>
          <div data-wish-read hidden style="margin-top:16px"></div>
          <p class="tiny" style="margin-top:14px">Already have a website? <a href="#site-url" data-go-import>Paste the link</a> instead — Plattr reads the trade, brand colour and prices off it.</p>
        </section>

        <section data-step="1" hidden>
          <div class="card flat" style="background:var(--paper-2);border-style:dashed;padding:14px;margin-bottom:20px">
            <div class="card-head" style="margin-bottom:8px">
              <span class="label">Start from their website</span>
              <span class="pill">Optional</span>
            </div>
            <p class="small" style="margin-bottom:10px">Paste the shop or site link. Plattr reads the name, brand colour, catalogue, prices and contact details, then fills this brief. Everything stays editable.</p>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <input id="site-url" type="url" maxlength="300" placeholder="https://their-site.com" autocomplete="url" aria-label="Their website address" style="flex:1;min-width:180px" />
              <button type="button" class="btn primary" data-import>Read the site</button>
            </div>
            <div class="tiny" data-import-status style="margin-top:8px"></div>
            <div data-import-report hidden style="margin-top:10px"></div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px">
              <button type="button" class="btn small ghost" data-import-sample="${esc(SAMPLE_IMPORT.source)}">Try it on ${esc(SAMPLE_IMPORT.host)}</button>
              <span class="tiny">A real shop: ${sampleTotals().items} items in ${sampleTotals().sections} sections, read from ${SAMPLE_IMPORT.pages} pages.</span>
            </div>
            <p class="tiny" style="margin-top:8px">Not sure yet? <a href="/#proof">See that URL and the app it produced &rarr;</a></p>
          </div>
          <div class="field">
            <label for="category">Category, in their words <span class="tiny">optional</span></label>
            <input id="category" name="category" type="text" maxlength="40" list="category-options" placeholder="Bookshop, mobile dog grooming, ceramicist…" />
            <datalist id="category-options">
              ${Object.values(VERTICALS).map((vertical) => `<option value="${esc(vertical.label)}"></option>`).join('')}
            </datalist>
            <span class="hint" data-category-hint>What the app calls them — shown in the header, splash and home screen. Empty uses the trade's name.</span>
          </div>
          <div class="field">
            <span class="label">App shape</span>
            ${verticalPicker()}
            <span class="hint" data-seed-hint></span>
            <span class="hint">The layout and screens. Any category above renders in its trade’s own shape.</span>
          </div>
          <div class="field">
            <label for="tagline">One-line promise <span class="tiny">optional</span></label>
            <input id="tagline" name="tagline" type="text" maxlength="90" data-tagline placeholder="Seasonal plates, cooked to order." />
          </div>
          <div class="grid-2" style="gap:14px">
            <div class="field">
              <span class="label">Brand colour</span>
              <div class="swatches" data-swatches>
                ${ACCENTS.map(
                  (color, index) =>
                    `<button class="swatch" type="button" data-color="${color}" aria-label="${color}" aria-pressed="${index === 0}" style="background:${color}"></button>`,
                ).join('')}
                <input id="accent" name="accent" type="color" value="${ACCENTS[0]}" style="width:34px;height:30px;padding:0;border-radius:9px;border:1px solid var(--line);background:none" />
              </div>
            </div>
            <div class="field">
              <label for="logo">App icon text</label>
              <input id="logo" name="logo" type="text" maxlength="2" placeholder="TV" style="text-transform:uppercase" />
              <span class="hint">Two letters, or one emoji.</span>
            </div>
          </div>
          <div style="display:flex;justify-content:flex-end;margin-top:8px">
            <button class="btn primary" type="button" data-next="2">Features &rarr;</button>
          </div>
        </section>

        <section data-step="2" hidden>
          <div class="notice" data-design-pick hidden style="margin-bottom:14px">
            <strong>Design kept: <span data-design-pick-name></span>.</strong> The finished build keeps this layout.
            <button type="button" class="linkish" data-back="0">Change design</button>
          </div>
          <div class="card flat" data-elements hidden style="background:var(--paper-2);margin-bottom:18px">
            <div class="card-head" style="margin-bottom:12px">
              <span class="label">Element style</span>
              <span class="tiny">The design starts you off; change any of these.</span>
            </div>
            <div style="display:grid;gap:12px">
              ${elementRow('buttons', 'Buttons &amp; nav', [['square', 'Rectangle'], ['soft', 'Little curve'], ['round', 'Curved']])}
              ${elementRow('cards', 'Cards', [['square', 'Rectangle'], ['soft', 'Little curve'], ['round', 'Curved']])}
              ${elementRow('density', 'Spacing', [['cozy', 'Tight'], ['standard', 'Standard'], ['roomy', 'Roomy']])}
            </div>
          </div>
          ${featureChecks()}
          <div class="field">
            <span class="label">Platform bundle</span>
            <label class="check">
              <input type="checkbox" data-bundle="${bundle.id}" data-monthly="${bundle.monthly}" />
              <span>
                <b>${esc(bundle.label)}<span class="fee">+${usd(bundle.price)} · ${usd(bundle.monthly)}/mo</span></b>
                <span>${esc(bundle.blurb)} It replaces the base build; the storefront still comes from this brief.</span>
              </span>
            </label>
          </div>
          <div class="field">
            <label for="custom">Anything else it must do?</label>
            <textarea id="custom" name="custom" rows="3" maxlength="600" placeholder="Stock levels for 200 products, staff rota, dog grooming appointments, ticket sales, a loyalty card shared with the sister shop…"></textarea>
            <span class="hint">Write it in the customer's words. It lands on the build page so nothing gets lost, and anything no field covers is scoped by hand.</span>
          </div>
          <div class="field">
            <label for="trailer">Trailer and behind-the-scenes links</label>
            <input id="trailer" name="trailer" type="text" maxlength="200" placeholder="https://vimeo.com/… — the trailer" />
            <input id="bts" name="bts" type="text" maxlength="200" aria-label="Behind-the-scenes link" placeholder="https://youtube.com/… — behind the scenes" style="margin-top:8px" />
            <span class="hint">Optional, mostly for films. Each link becomes a button on the app's about screen; leave them blank and the app shows none.</span>
          </div>
          <div style="display:flex;justify-content:space-between;gap:10px;margin-top:8px">
            <button class="btn ghost" type="button" data-back="1">&larr; Trade &amp; brand</button>
            <button class="btn primary" type="button" data-next="3">Delivery &rarr;</button>
          </div>
        </section>

        <section data-step="3" hidden>
          <div class="field">
            <span class="label">Where it ships</span>
            <div class="checks" style="grid-template-columns:1fr">
              ${PLATFORMS.map(
                (platform) => `
                <label class="check">
                  <input type="checkbox" data-platform="${platform.id}" ${platform.id === 'pwa' ? 'checked disabled' : ''} />
                  <span>
                    <b>${esc(platform.label)}${platform.price ? `<span class="fee">+${usd(platform.price)}</span>` : '<span class="fee">included</span>'}</b>
                    <span>${esc(platform.note)}</span>
                  </span>
                </label>`,
              ).join('')}
            </div>
          </div>
          <div class="field">
            <span class="label">How they pay</span>
            <div class="seg" data-plan>
              <button type="button" data-plan-value="onetime" aria-pressed="true">One-time</button>
              <button type="button" data-plan-value="monthly" aria-pressed="false">Monthly care</button>
            </div>
            <span class="hint" data-plan-hint>One invoice for the whole build. Best for owners who want to own it outright.</span>
          </div>
          <div class="field">
            <label for="name">Business name</label>
            <input id="name" name="name" type="text" maxlength="60" placeholder="Trattoria Vela" autocomplete="organization" required />
            <span class="hint">Only needed to build. It appears in the app header and on the home screen.</span>
          </div>
          <div class="grid-2" style="gap:14px">
            <div class="field">
              <label for="contact">Owner / contact name</label>
              <input id="contact" name="contact" type="text" maxlength="80" placeholder="Marta Ruiz" />
            </div>
            <div class="field">
              <label for="email">Email</label>
              <input id="email" name="email" type="email" maxlength="120" placeholder="marta@example.com" />
              <span class="hint">Used to send the build link and reply. <a href="/privacy">Privacy &amp; terms</a>.</span>
            </div>
          </div>
          <div class="notice" style="margin-bottom:14px">
            The build link is private to whoever holds it. Send it to the owner; no password, nothing to install.
          </div>
          <div style="display:flex;justify-content:space-between;gap:10px">
            <button class="btn ghost" type="button" data-back="2">&larr; Back</button>
            <button class="btn accent" type="submit" data-submit>Build it &rarr;</button>
          </div>
        </section>
      </div>

      <div class="card" style="position:sticky;top:84px">
        <div class="card-head"><h3>Their quote</h3><span class="pill" data-quote-plan>One-time</span></div>
        <div data-quote class="rows"><p class="small">Fill in the brief to see the price.</p></div>
        <hr class="hr" />
        <div class="row total"><span>Total</span><strong data-quote-total>&mdash;</strong></div>
        <p class="tiny" style="margin-top:12px" data-quote-terms>Select the features the owner actually asked for. Everything here is the cost of production; set your own retail price on top.</p>
        <hr class="hr" />
        <p class="tiny"><strong style="color:var(--ink)">In every build:</strong> catalogue, offline shell, installable manifest, private review link, version history, store packaging after approval.</p>
      </div>
    </div>

    <section data-designs hidden style="margin-top:26px">
      <div class="card" style="padding:20px">
        <div class="card-head" style="align-items:flex-start">
          <div>
            <span class="eyebrow">Choose a design</span>
            <h3 style="margin-top:8px;font-size:24px">Three ways this app could look</h3>
          </div>
          <span class="pill" data-design-trade></span>
        </div>
        <p class="small" style="margin-top:4px">Pick the structure that fits the business. The content is the same in all three.</p>
        <div class="grid-3" data-design-grid style="margin-top:16px"></div>
        <p class="tiny" style="margin-top:12px">Same app, same price — only the layout, rhythm and first screen change. The trade and brand colour sit in Trade &amp; brand, one step back from the features.</p>
      </div>
    </section>
  </form>

  <div class="toast" data-toast></div>
`
  return page({
    title: 'New brief · Plattr',
    description: 'A four-minute brief that produces a working app for any local business.',
    body,
    script: briefScript(verticalData()),
  })
}

function briefScript(verticals: string): string {
  return `
(() => {
  const VERTICALS = ${verticals}
  const form = document.getElementById('brief')
  const accent = document.getElementById('accent')
  const totalEl = document.querySelector('[data-quote-total]')
  const rowsEl = document.querySelector('[data-quote]')
  const termsEl = document.querySelector('[data-quote-terms]')
  const planPill = document.querySelector('[data-quote-plan]')
  const seedHint = document.querySelector('[data-seed-hint]')
  const tagline = document.querySelector('[data-tagline]')
  const toastEl = document.querySelector('[data-toast]')
  let currentPlan = 'onetime'
  const importUrl = document.getElementById('site-url')
  const importStatus = document.querySelector('[data-import-status]')
  const importReport = document.querySelector('[data-import-report]')
  const importButton = document.querySelector('[data-import]')
  let imported = null
  const money = (cents) => '$' + (cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  // A structured receipt, not a log line: the owner has to be able to check
  // what was read, what was not, and what still needs their confirmation before
  // any of it becomes their app.
  function report(data) {
    const site = data.site || {}
    const menu = Array.isArray(site.menu) ? site.menu : []
    const items = menu.reduce((total, section) => total + (section.items || []).length, 0)
    const pricey = menu.flatMap((section) => section.items || []).filter((item) => item.price > 0)
    const sample = menu
      .flatMap((section) => (section.items || []).slice(0, 3).map((item) => ({ section: section.name, item })))
      .slice(0, 6)
    const money = (cents) => (cents > 0 ? esc(site.currency || '') + ' ' + (cents / 100).toFixed(2) : 'price not listed')
    const rows = (label, value) =>
      value ? '<div class="row"><span>' + label + '</span><strong style="text-align:right">' + value + '</strong></div>' : ''

    const catalogue = menu.length
      ? '<div style="margin-top:10px">' +
          '<div class="label">Catalogue read</div>' +
          '<p class="small" style="margin-top:4px"><b>' + items + '</b> ' + (items === 1 ? 'item' : 'items') + ' across <b>' + menu.length + '</b> ' + (menu.length === 1 ? 'section' : 'sections') +
          (pricey.length ? ' · ' + pricey.length + ' with a listed price' : ' · no prices listed') + '</p>' +
          '<ul class="ticks" style="margin-top:6px">' +
            sample.map((entry) => '<li>' + esc(entry.item.name) + ' <span class="tiny">' + esc(entry.section) + ' · ' + money(entry.item.price) + '</span></li>').join('') +
          '</ul>' +
          (items > sample.length ? '<p class="tiny" style="margin-top:4px">…and ' + (items - sample.length) + ' more. All of them go into the app and stay editable.</p>' : '') +
        '</div>'
      : '<p class="tiny" style="margin-top:10px"><strong>No catalogue found.</strong> Nothing was invented — the app starts from the trade’s sample menu, clearly marked as sample, until you add their items.</p>'

    const contact = [site.phone, site.email, site.address, site.hours].filter(Boolean).map(esc).join(' · ')
    const pagesRead = (data.pagesRead || []).map(function (path) { return '<li><span class="mono">' + esc(path) + '</span></li>' }).join('')
    const pagesFailed = (data.pagesFailed || []).map(function (entry) { return '<li><span class="mono">' + esc(entry.url) + '</span> — ' + esc(entry.reason) + '</li>' }).join('')
    const notes = (data.notes || []).map(function (line) { return '<p class="tiny" style="margin-top:6px">' + esc(line) + '</p>' }).join('')
    const missing = (data.missing || [])

    return '<div class="notice accent">' +
      '<strong>Read ' + esc(data.host) + '</strong> <span class="tiny">— ' + (data.pages || 1) + ' ' + (data.pages === 1 ? 'page' : 'pages') + (data.usedSitemap ? ', via their sitemap' : '') + '</span>' +
      '<p class="small" style="margin-top:6px">' + esc(site.name || '') + (site.tagline ? ' — ' + esc(site.tagline) : '') + '</p>' +
      '<div class="rows" style="margin-top:8px">' +
        rows('Category', site.category ? esc(site.category) : '') +
        rows('Brand colour', site.accent ? '<span style="display:inline-block;width:11px;height:11px;border-radius:3px;border:1px solid #0002;vertical-align:-1px;background:' + esc(site.accent) + '"></span> ' + esc(site.accent) : '') +
        rows('Contact', contact) +
        rows('Currency', site.currency ? esc(site.currency) : '') +
      '</div>' +
      catalogue +
      (pagesRead ? '<details style="margin-top:10px"><summary class="tiny" style="cursor:pointer">Pages inspected (' + (data.pagesRead || []).length + ')</summary><ul class="ticks" style="margin-top:6px">' + pagesRead + '</ul></details>' : '') +
      (pagesFailed ? '<details style="margin-top:6px"><summary class="tiny" style="cursor:pointer">Could not be read (' + (data.pagesFailed || []).length + ')</summary><ul class="ticks" style="margin-top:6px">' + pagesFailed + '</ul></details>' : '') +
      (missing.length ? '<p class="tiny" style="margin-top:8px"><strong>Not found — please confirm:</strong> ' + esc(missing.join(', ')) + '</p>' : '') +
      notes +
      '<p class="tiny" style="margin-top:8px"><a href="' + esc(data.source) + '" target="_blank" rel="noopener">Open the source site</a> · check the name, catalogue and contact details below before building</p>' +
      '</div>'
  }

  function applyImport(data) {
    const site = data.site || {}
    imported = site
    document.getElementById('name').value = site.name || ''
    document.getElementById('tagline').value = site.tagline || ''
    document.getElementById('category').value = site.category || ''
    if (site.category) {
      document.querySelector('[data-category-hint]').textContent =
        'Read as “' + site.category + '” — from ' + (site.categoryBasis || 'the page') +
        '. Edit it if the app should call them something else.'
    } else if (site.categoryBasis) {
      document.querySelector('[data-category-hint]').textContent =
        'Nothing on the page named their trade — type the category they use.'
    }
    const radio = document.querySelector('[name=vertical][value="' + (site.vertical || '') + '"]')
    if (radio) radio.checked = true
    applyVertical()
    if (site.accent) {
      accent.value = site.accent
      document.querySelectorAll('[data-color]').forEach((swatch) =>
        swatch.setAttribute('aria-pressed', String(swatch.dataset.color === site.accent)))
    }
    const words = String(site.name || '').trim().split(/\\s+/).filter(Boolean)
    const logoField = document.getElementById('logo')
    logoField.value = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || '').slice(0, 2)).toUpperCase()
    logoField.dataset.touched = '1'
    const chosen = site.features || []
    document.querySelectorAll('[data-feature]').forEach((input) => {
      input.checked = input.disabled || chosen.indexOf(input.dataset.feature) >= 0
    })
    const readItems = (site.menu || []).reduce(function (total, section) { return total + (section.items || []).length }, 0)
    importStatus.textContent = readItems
      ? 'Filled from ' + data.host + ' — ' + readItems + ' ' + (readItems === 1 ? 'item' : 'items') + ' read. Check them below.'
      : 'Read ' + data.host + ' — no catalogue was found. Nothing was invented; check what is missing below.'
    importReport.hidden = false
    importReport.innerHTML = report(data)
    refresh()
    // The three concepts must show *their* business, not the demo shop.
    syncElementPreviews()
    // A read site has already answered the trade, the brand and the feature
    // questions. Walking the customer through them again is asking them to
    // retype what Plattr just read. The design step is the one question the
    // site cannot answer, so the three concepts are built for the trade that
    // was read and shown straight away.
    if (site.name && site.vertical && readItems > 0) {
      document.querySelectorAll('[data-step-dot]').forEach((dot) => {
        const step = Number(dot.dataset.stepDot)
        if (step === 1 || step === 2) {
          dot.setAttribute('data-answered', '1')
          dot.title = 'Read from your site'
        }
      })
      show(0)
      if (wishInput.value.trim().length < 3)
        wishInput.value =
          'An app for ' + (site.category || site.name) + ' — ' +
          (chosen.length ? chosen.slice(0, 3).join(', ') : 'their catalogue and enquiries')
      readWish()
    }
  }

  async function runImport(rawUrl) {
    const url = String(rawUrl || '').trim()
    if (!url) return toast('Paste the website address first')
    importButton.disabled = true
    importButton.textContent = 'Reading…'
    importStatus.textContent = 'Reading ' + url + ' and its shop pages — up to 20 seconds.'
    importReport.hidden = true
    try {
      const response = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error((data.error && data.error.message) || 'That site could not be read.')
      importUrl.value = data.source || url
      applyImport(data)
      toast('Brief filled from ' + data.host)
    } catch (error) {
      imported = null
      importStatus.textContent = ''
      importReport.hidden = false
      importReport.innerHTML = '<div class="notice"><strong>Nothing was filled in.</strong><br />' + esc(error.message) +
        ' Fill the brief in by hand — it works exactly the same.</div>'
    } finally {
      importButton.disabled = false
      importButton.textContent = 'Read the site'
    }
  }

  importButton.addEventListener('click', () => runImport(importUrl.value))
  document.querySelectorAll('[data-import-sample]').forEach((button) => {
    button.addEventListener('click', () => {
      importUrl.value = button.dataset.importSample
      runImport(button.dataset.importSample)
    })
  })
  importUrl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      runImport(importUrl.value)
    }
  })

  const wishInput = document.getElementById('wish')
  const wishButton = document.querySelector('[data-wish]')
  const wishStatus = document.querySelector('[data-wish-status]')
  const wishRead = document.querySelector('[data-wish-read]')
  const designsEl = document.querySelector('[data-designs]')
  const designGrid = document.querySelector('[data-design-grid]')
  const designTrade = document.querySelector('[data-design-trade]')
  const designPick = document.querySelector('[data-design-pick]')
  const designPickName = document.querySelector('[data-design-pick-name]')
  const elementsEl = document.querySelector('[data-elements]')
  const elementRows = Array.from(document.querySelectorAll('[data-el]'))
  // One value per row, starting from the design and overridden by a click.
  const elementChoice = {}
  const elementTouched = new Set()
  let read = null
  let chosenDesign = null

  function paintElements(axes) {
    elementRows.forEach((row) => {
      const value = (axes || {})[row.dataset.el] || ''
      elementChoice[row.dataset.el] = value || null
      row.querySelectorAll('[data-value]').forEach((button) =>
        button.setAttribute('aria-pressed', String(button.dataset.value === value)),
      )
    })
  }

  /** The first few real catalogue rows, in the preview's compact name~price
   *  form. A preview is capped so the URL stays short; the built app has all. */
  function previewItems() {
    const menu = (imported && imported.menu) || []
    const out = []
    for (const section of menu) {
      for (const item of section.items || []) {
        if (out.length >= 8) return out.join(';')
        if (!item || !item.name) continue
        out.push(item.name + '~' + (item.price > 0 ? item.price / 100 : ''))
      }
    }
    return out.join(';')
  }

  /** The owner's own identity, appended to a design preview URL. */
  function identityPreview(base) {
    const url = new URL(base, window.location.origin)
    const set = (key, value) => {
      if (value) url.searchParams.set(key, value)
      else url.searchParams.delete(key)
    }
    set('name', document.getElementById('name').value.trim())
    set('tag', tagline.value.trim())
    set('cat', document.getElementById('category').value.trim())
    set('accent', accent.value)
    set('logo', document.getElementById('logo').value.trim())
    set('items', previewItems())
    set('feat', Array.from(document.querySelectorAll('[data-feature]:checked')).map((input) => input.dataset.feature).join(','))
    return url.pathname + url.search
  }

  // The three previews are the same app with their own axes in the query, plus
  // this owner's name, colour, category and first catalogue rows, so the
  // element rows can re-point them and the choice is visible before the build.
  function syncElementPreviews() {
    document.querySelectorAll('[data-design-grid] iframe').forEach((frame) => {
      const base = frame.dataset.base || frame.getAttribute('src')
      if (!base) return
      const url = new URL(identityPreview(base), window.location.origin)
      // Only what was actually chosen travels; the rest stays as each design
      // asked for it, so the three previews keep their own rhythm.
      elementTouched.forEach((key) => {
        if (elementChoice[key]) url.searchParams.set(key, elementChoice[key])
      })
      frame.setAttribute('src', url.pathname + url.search)
    })
  }

  ;['name', 'tagline', 'category', 'accent', 'logo'].forEach((id) => {
    const field = document.getElementById(id)
    if (field) field.addEventListener('input', syncElementPreviews)
  })

  elementRows.forEach((row) =>
    row.addEventListener('click', (event) => {
      const button = event.target.closest('[data-value]')
      if (!button) return
      elementChoice[row.dataset.el] = button.dataset.value
      elementTouched.add(row.dataset.el)
      row.querySelectorAll('[data-value]').forEach((other) =>
        other.setAttribute('aria-pressed', String(other === button)),
      )
      syncElementPreviews()
    }),
  )

  // The sentence already names the trade, so the rest of the form follows it
  // straight away — before a design is picked.
  function applyReadFeatures(data) {
    const radio = document.querySelector('[name=vertical][value="' + data.vertical + '"]')
    if (radio) radio.checked = true
    applyVertical()
    document.querySelectorAll('[data-feature]').forEach((input) => {
      input.checked = input.disabled || data.features.indexOf(input.dataset.feature) >= 0
    })
    refresh()
  }

  function useRead(data) {
    read = data
    applyReadFeatures(data)
    // Concepts are the trade's own directions, each previewed on the real
    // application document. The old designs stay as an advanced override.
    const designs = data.concepts || data.designs || []
    const features = (data.suggestions || []).map((entry) =>
      '<li><b>' + esc(entry.label) + '</b> <span class="tiny">— ' + esc(entry.why) + '</span></li>'
    ).join('')
    wishStatus.textContent = ''
    wishRead.hidden = false
    wishRead.innerHTML = '<div class="notice accent">' +
      '<strong>Read as ' + esc(data.label) + '</strong>' +
      (data.confidence === 'guessed'
        ? '<span class="tiny"> — that is a guess, so change the trade in the next step if it is wrong.</span>'
        : '<span class="tiny"> — from “' + esc((data.evidence || []).join('”, “')) + '”.</span>') +
      '<ul class="ticks" style="margin-top:8px">' + features + '</ul>' +
      '<p class="tiny" style="margin-top:8px">These are ticked for you in the features step; every one can be changed.</p>' +
      '</div>'
    designTrade.textContent = data.label
    designGrid.innerHTML = designs.map((design) =>
      '<article class="card flat" style="padding:10px;display:flex;flex-direction:column;gap:8px;background:#fffdf9">' +
        '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:6px">' +
          '<b>' + esc(design.name) + '</b><span class="tiny">' + esc(design.axes.buttons) + ' buttons</span>' +
        '</div>' +
        '<iframe data-base="' + esc(design.preview) + '" src="' + esc(identityPreview(design.preview)) + '" title="' + esc(design.name) + ' design" loading="lazy" style="width:100%;height:430px;border:1px solid var(--line);border-radius:12px;background:#fff"></iframe>' +
        '<p class="tiny" style="flex:1">' + esc(design.note) + '</p>' +
        '<button class="btn primary small" type="button" data-pick="' + esc(design.id) + '">Use this design</button>' +
      '</article>'
    ).join('')
    designsEl.hidden = false
    designsEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function readWish() {
    const prompt = wishInput.value.trim()
    if (prompt.length < 3) return toast('Say what the business needs first')
    wishButton.disabled = true
    wishButton.textContent = 'Reading…'
    wishStatus.textContent = 'Reading “' + prompt + '”.'
    try {
      const response = await fetch('/api/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error((data.error && data.error.message) || 'That could not be read.')
      useRead(data)
    } catch (error) {
      wishStatus.textContent = error.message
      wishRead.hidden = true
    } finally {
      wishButton.disabled = false
      wishButton.textContent = 'Show me three designs →'
    }
  }

  wishButton.addEventListener('click', readWish)
  wishInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey || !event.shiftKey)) {
      event.preventDefault()
      readWish()
    }
  })

  designGrid.addEventListener('click', (event) => {
    const button = event.target.closest('[data-pick]')
    if (!button || !read) return
    const design = (read.designs || []).find((one) => one.id === button.dataset.pick)
    if (!design) return
    chosenDesign = design
    designPick.hidden = false
    designPickName.textContent = design.name
    elementsEl.hidden = false
    paintElements(design.axes)
    // The design is the only question this step asks: go straight on to the
    // features. The trade, the brand colour and the name stay in the steps
    // either side of it, reachable from the buttons there.
    designsEl.hidden = true
    show(2)
  })

  document.querySelectorAll('[data-go-import]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault()
      show(1)
      document.getElementById('site-url').focus()
    })
  })

  function toast(message) {
    toastEl.textContent = message
    toastEl.classList.add('on')
    setTimeout(() => toastEl.classList.remove('on'), 2600)
  }

  function vertical() {
    return (document.querySelector('[name=vertical]:checked') || {}).value || 'restaurant'
  }
  function features() {
    return Array.from(document.querySelectorAll('[data-feature]'))
      .filter((input) => input.checked)
      .map((input) => input.dataset.feature)
  }
  function platforms() {
    return Array.from(document.querySelectorAll('[data-platform]'))
      .filter((input) => input.checked)
      .map((input) => input.dataset.platform)
  }

  function applyVertical() {
    const data = VERTICALS[vertical()]
    if (!data) return
    document.querySelectorAll('[data-feature]').forEach((input) => {
      input.checked = data.features.indexOf(input.dataset.feature) >= 0 || input.disabled
    })
    seedHint.textContent = 'Seeds a ' + data.label.toLowerCase() + ' build: ' + data.seed + '. Every item is editable later.'
    tagline.placeholder = data.kind
    refresh()
  }

  function payload() {
    return {
      name: document.getElementById('name').value,
      tagline: document.getElementById('tagline').value,
      vertical: vertical(),
      custom: document.getElementById('custom').value,
      videos: videoLinks(),
      bundle: bundleId(),
      category: document.getElementById('category').value,
      accent: accent.value,
      logo: document.getElementById('logo').value,
      contact: document.getElementById('contact').value,
      email: document.getElementById('email').value,
      features: features(),
      platforms: platforms(),
      plan: currentPlan,
      layout: chosenDesign ? { ...chosenDesign.axes, ...chosenElements() } : null,
      direction: chosenDesign ? chosenDesign.id : undefined,
      site: imported,
    }
  }

  function selectedBundle() {
    return document.querySelector('[data-bundle]:checked')
  }

  function bundleId() {
    const box = selectedBundle()
    return box ? box.dataset.bundle : undefined
  }

  function bundleFee() {
    const box = selectedBundle()
    return box ? Number(box.dataset.monthly || 0) : 0
  }

  function videoLinks() {
    return [
      ['trailer', 'Watch the trailer'],
      ['bts', 'Behind the scenes'],
    ]
      .map(([id, label]) => ({ label, url: document.getElementById(id).value.trim() }))
      .filter((video) => video.url)
  }

  function chosenElements() {
    const chosen = {}
    Object.keys(elementChoice).forEach((key) => {
      if (elementChoice[key]) chosen[key] = elementChoice[key]
    })
    return chosen
  }

  function paintQuote(quote) {
    const rows = quote.lines.map((line) => '<div class="row"><span>' + line.label + '</span><strong>' + money(line.amount) + '</strong></div>').join('')
    rowsEl.innerHTML = rows || '<p class="small">No features selected yet.</p>'
    planPill.textContent = quote.plan === 'monthly' ? 'Monthly' : 'One-time'
    const fee = bundleFee()
    if (quote.plan === 'monthly') {
      totalEl.textContent = money(quote.setupFee) + ' + ' + money(quote.monthly) + '/mo'
      termsEl.textContent =
        'Setup fee now, then ' + money(quote.monthly) + ' a month for rebuilds, catalogue changes and store admin' +
        (fee ? ' — including the ' + money(fee) + ' platform fee' : '') +
        '. First year: ' + money(quote.firstYear) + '.'
    } else {
      totalEl.textContent = money(quote.oneTime)
      termsEl.textContent = fee
        ? 'One invoice for the build, then ' + money(fee) + ' a month for platform hosting, payouts and support.'
        : 'One invoice for the whole build. Owner keeps the download; changes are quoted separately.'
    }
  }

  async function refresh() {
    try {
      const response = await fetch('/api/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          features: features(),
          platforms: platforms(),
          plan: currentPlan,
          bundle: bundleId(),
        }),
      })
      if (!response.ok) return
      paintQuote((await response.json()).quote)
    } catch {}
  }

  function show(step) {
    document.querySelectorAll('[data-step]').forEach((panel) => {
      panel.hidden = panel.dataset.step !== String(step)
    })
    document.querySelectorAll('[data-step-dot]').forEach((dot) => {
      dot.className = 'pill' + (Number(dot.dataset.stepDot) === step ? ' dark' : '')
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  document.querySelectorAll('[data-next]').forEach((button) => {
    button.addEventListener('click', () => show(Number(button.dataset.next)))
  })
  document.querySelectorAll('[data-back]').forEach((button) => {
    button.addEventListener('click', () => {
      const step = Number(button.dataset.back)
      // Changing the design means showing the three again, not a blank step.
      if (step === 0) designsEl.hidden = false
      show(step)
    })
  })

  document.querySelectorAll('[name=vertical]').forEach((input) => input.addEventListener('change', applyVertical))

  document.querySelectorAll('[data-swatches] [data-color]').forEach((swatch) => {
    swatch.addEventListener('click', () => {
      accent.value = swatch.dataset.color
      document.querySelectorAll('[data-color]').forEach((other) => other.setAttribute('aria-pressed', String(other === swatch)))
    })
  })
  accent.addEventListener('input', () => {
    document.querySelectorAll('[data-color]').forEach((swatch) => swatch.setAttribute('aria-pressed', 'false'))
  })

  document.querySelectorAll('[data-feature]').forEach((input) => input.addEventListener('change', refresh))
  document.querySelectorAll('[data-platform]').forEach((input) => input.addEventListener('change', refresh))
  document.querySelectorAll('[data-bundle]').forEach((input) => input.addEventListener('change', refresh))

  document.querySelectorAll('[data-plan-value]').forEach((button) => {
    button.addEventListener('click', () => {
      currentPlan = button.dataset.planValue
      document.querySelectorAll('[data-plan-value]').forEach((other) => other.setAttribute('aria-pressed', String(other === button)))
      document.querySelector('[data-plan-hint]').textContent = currentPlan === 'monthly'
        ? 'Smaller start, steady monthly. Covers rebuilds, season changes and store admin.'
        : 'One invoice for the whole build. Best for owners who want to own it outright.'
      refresh()
    })
  })

  const logo = document.getElementById('logo')
  document.getElementById('name').addEventListener('input', (event) => {
    if (logo.dataset.touched) return
    const words = event.target.value.trim().split(/\\s+/).filter(Boolean)
    logo.value = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || '').slice(0, 2)).toUpperCase()
  })
  logo.addEventListener('input', () => { logo.dataset.touched = '1' })

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const data = payload()
    if (data.name.trim().length < 2) {
      show(3)
      toast('Add the business name to build')
      document.getElementById('name').focus()
      return
    }
    const button = document.querySelector('[data-submit]')
    button.disabled = true
    button.textContent = 'Generating build…'
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (response.status === 429) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error?.message || 'The studio is full for today. Try again tomorrow.')
      }
      if (!response.ok) throw new Error('failed')
      const result = await response.json()
      button.textContent = 'Opening the build…'
      window.location.href = '/p/' + result.token
    } catch (error) {
      button.disabled = false
      button.textContent = 'Build it →'
      toast(
        error && error.message && error.message !== 'failed'
          ? error.message
          : 'Could not generate the build. Try again.',
      )
    }
  })

  const query = new URLSearchParams(window.location.search)
  const wantedBundle = query.get('bundle')
  if (wantedBundle) {
    const box = Array.from(document.querySelectorAll('[data-bundle]')).find(
      (input) => input.dataset.bundle === wantedBundle,
    )
    if (box) {
      box.checked = true
      // A bundle link lands on the step that holds it, not on the trade picker.
      show(2)
    }
  }
  // Seeds the trade's features, then paints the first quote — bundle included,
  // so a bundle link does not fetch the price twice.
  applyVertical()
  const preset = query.get('url')
  if (preset) {
    importUrl.value = preset
    runImport(preset)
  }
  const wish = query.get('prompt')
  if (wish) {
    wishInput.value = wish
    show(0)
    readWish()
  }
})()
`
}
