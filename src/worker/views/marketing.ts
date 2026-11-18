import { BUNDLES, moneyIn, usd, type Quote } from '../pricing'
import { SAMPLE_IMPORT, sampleTotals } from '../proof'
import { VERTICALS, VERTICAL_GROUPS } from '../verticals'
import { esc, page } from './shell'

function sampleQuote(): Quote {
  return {
    plan: 'monthly',
    oneTime: 268000,
    setupFee: 80000,
    monthly: 14700,
    firstYear: 256400,
    lines: [],
  }
}

export function marketingPage(): string {
  const quote = sampleQuote()
  const proof = sampleTotals()
  const proofSite = SAMPLE_IMPORT.site
  const proofPreview = proofSite.menu[0]?.items.slice(0, 3) ?? []

  const verticalCards = VERTICAL_GROUPS.map(
    (group) => `
    <div style="margin-bottom:12px">
      <div class="tiny" style="margin-bottom:7px;letter-spacing:0.08em;text-transform:uppercase">${esc(group.label)}</div>
      <div class="feature-chips">
        ${group.ids
          .map(
            (id) =>
              `<span class="pill">${VERTICALS[id].glyph} ${esc(VERTICALS[id].label)}</span>`,
          )
          .join('')}
      </div>
    </div>`,
  ).join('')

  const bundle = BUNDLES[0]

  const body = `
  <header class="wrap" style="padding:64px 0 26px">
    <div class="grid-2" style="gap:44px;align-items:center">
      <div>
        <span class="eyebrow">App studio for local business</span>
        <h1 class="display" style="margin-top:16px">A customer says they need an app.<br />It&rsquo;s on their phone before the call ends.</h1>
        <p class="lede" style="margin-top:18px">Plattr takes a four-minute brief — restaurant, salon, gym, garage, clinic, shop, agency — and builds a working app with the right catalogue, bookings or quote form. The owner edits it live, approves it, and you package it for web, Android and iOS.</p>
        <form action="/brief" method="get" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:24px;max-width:560px">
          <input name="prompt" type="text" maxlength="240" placeholder="I need an app for my salon" aria-label="What does the business need?" style="flex:1;min-width:220px" />
          <button class="btn accent" type="submit">Show me three designs</button>
        </form>
        <p class="tiny" style="margin-top:8px">One sentence in plain words. We read the trade, tick the features that fit, and show three different designs to choose from.</p>
        <form action="/brief" method="get" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;max-width:560px">
          <input name="url" type="url" maxlength="300" placeholder="Or paste their website — we'll read it" aria-label="The customer's website address" autocomplete="url" style="flex:1;min-width:220px" />
          <button class="btn ghost" type="submit">Build from their site</button>
        </form>
        <p class="tiny" style="margin-top:8px">Name, brand colour, catalogue, prices and contact details are read from the page — then every field stays editable.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:22px">
          <a class="btn ghost" href="#proof">See a real URL &rarr; app</a>
          <a class="btn ghost" href="#trades">See the trades</a>
        </div>
        <p class="small" style="margin-top:16px">One generator, twenty-seven business types, fourteen capabilities. Bespoke logic is scoped by hand.</p>
      </div>
      <div>
        <div class="phone tall">
          <iframe id="demo-frame" title="A live Plattr build" src="/demo/app" loading="lazy"></iframe>
        </div>
        <div class="seg" data-demos style="margin:12px auto 0;justify-content:center;display:flex;flex-wrap:wrap;gap:4px">
          <button type="button" data-demo="restaurant" aria-pressed="true">Restaurant</button>
          <button type="button" data-demo="salon" aria-pressed="false">Salon</button>
          <button type="button" data-demo="gym" aria-pressed="false">Gym</button>
          <button type="button" data-demo="shop" aria-pressed="false">Shop</button>
          <button type="button" data-demo="trades" aria-pressed="false">Trades</button>
        </div>
        <p class="tiny" style="text-align:center;margin-top:8px">Real builds, running — switch trade, then tap around.</p>
      </div>
    </div>
  </header>

  <section class="wrap" id="proof" style="padding:54px 0 18px">
    <span class="eyebrow">A real run, not a mockup</span>
    <h2 class="section" style="margin-top:14px;max-width:27ch">One shop URL in. This is what came back out.</h2>
    <p class="lede" style="margin-top:14px">On ${esc(SAMPLE_IMPORT.capturedAt)} the importer was pointed at <span class="mono">${esc(SAMPLE_IMPORT.source)}</span> — a public demo bookshop. It followed ${SAMPLE_IMPORT.pages} pages, read ${proof.items} items at their listed prices and picked the brand colour out of the markup. The phone beside it is the app built from exactly that read, untouched.</p>

    <div class="grid-2" style="gap:32px;align-items:start;margin-top:28px">
      <div class="card">
        <div class="card-head"><h3>The input</h3><span class="pill">${esc(SAMPLE_IMPORT.host)}</span></div>
        <p class="mono small" style="word-break:break-all">${esc(SAMPLE_IMPORT.source)}</p>
        <div class="rows" style="margin-top:14px">
          <div class="row"><span>Pages opened</span><strong>${SAMPLE_IMPORT.pages}</strong></div>
          <div class="row"><span>Catalogue items</span><strong>${proof.items} in ${proof.sections} sections</strong></div>
          <div class="row"><span>Priced items</span><strong>${proof.priced} of ${proof.items}</strong></div>
          <div class="row"><span>Currency</span><strong>${esc(proofSite.currency || 'not stated')}</strong></div>
          <div class="row"><span>Brand colour</span><strong style="display:flex;align-items:center;gap:8px"><span style="width:18px;height:18px;border-radius:6px;background:${esc(proofSite.accent)};border:1px solid var(--line);display:inline-block"></span><span class="mono">${esc(proofSite.accent)}</span></strong></div>
        </div>
        <hr class="hr" />
        <div class="tiny" style="letter-spacing:0.06em;text-transform:uppercase">First entries read</div>
        <ul class="ticks" style="margin-top:8px">
          ${proofPreview
            .map(
              (item) =>
                `<li>${esc(item.name)} <span class="mono" style="opacity:.7">${moneyIn(item.price, proofSite.currency)}</span></li>`,
            )
            .join('')}
        </ul>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px">
          <button class="btn primary" type="button" data-proof-run="${esc(SAMPLE_IMPORT.source)}">Re-run this URL live</button>
          <a class="btn ghost" href="/brief?url=${encodeURIComponent(SAMPLE_IMPORT.source)}">Build from it &rarr;</a>
        </div>
        <p class="tiny" data-proof-result style="margin-top:10px">Captured ${esc(SAMPLE_IMPORT.capturedAt)}. Re-run it to get fresh numbers straight from the site.</p>
        <p class="tiny" style="margin-top:8px">Nothing here is hand-typed sample data: the app on the right is rendered from this capture, and the run above is the importer's own output.</p>
      </div>
      <div>
        <div class="phone tall">
          <iframe title="The app built from that shop URL" src="/proof/app" loading="lazy"></iframe>
        </div>
        <p class="tiny" style="text-align:center;margin-top:10px">${esc(proofSite.name)} — ${proof.items} items, ${esc(proofSite.currency || 'prices as listed')}, built from the read above.</p>
      </div>
    </div>
  </section>

  <section class="wrap" style="padding:26px 0 10px">
    <div class="grid-3">
      <div class="card flat">
        <span class="pill accent">1 · Brief</span>
        <h3 style="margin-top:12px;font-size:17px">Pick the trade, answer ten questions</h3>
        <p class="small" style="margin-top:6px">The catalogue, the words and the features change with the trade. Anything unusual goes in a free-text box.</p>
      </div>
      <div class="card flat">
        <span class="pill accent">2 · Build</span>
        <h3 style="margin-top:12px;font-size:17px">A working app, not a mockup</h3>
        <p class="small" style="margin-top:6px">Real screens with a real cart, diary, timetable or quote form, seeded from that trade — and an installable manifest.</p>
      </div>
      <div class="card flat">
        <span class="pill accent">3 · Ship</span>
        <h3 style="margin-top:12px;font-size:17px">One approval, three packages</h3>
        <p class="small" style="margin-top:6px">A PWA link today. Android and iOS projects with the signing commands you run once per client.</p>
      </div>
    </div>
  </section>

  <section class="wrap" id="loop" style="padding:64px 0 20px">
    <span class="eyebrow">The build loop</span>
    <h2 class="section" style="margin-top:14px;max-width:20ch">The customer sits in the room while it gets built.</h2>
    <div class="grid-2" style="margin-top:30px;gap:30px;align-items:start">
      <div class="stack">
        <div class="card">
          <div class="card-head"><h3>1. Send a brief link</h3><span class="pill">~4 min</span></div>
          <p class="small">The customer picks their trade, drops in their colours, ticks what they need. The quote builds itself as they go, so the price conversation happens before the build, not after.</p>
        </div>
        <div class="card">
          <div class="card-head"><h3>2. Hand over a live link</h3><span class="pill">instant</span></div>
          <p class="small">They open their app on their own phone. Real catalogue, real cart or diary, real confirmation screens. Nothing to install, no APK to email, no TestFlight invite to chase.</p>
        </div>
        <div class="card">
          <div class="card-head"><h3>3. They edit, or they ask</h3><span class="pill">v1 &rarr; v9</span></div>
          <p class="small">Two levers: edit the brand, catalogue and features themselves, or leave a note in plain English. Either way the build bumps a version and the change history is the audit trail.</p>
        </div>
        <div class="card">
          <div class="card-head"><h3>4. Approve, then package</h3><span class="pill green">signed off</span></div>
          <p class="small">Approval locks the version and unlocks the downloads: installable web app, Android TWA project, iOS Capacitor project, plus the store checklist for that launch.</p>
        </div>
      </div>
      <div class="card" style="position:sticky;top:88px">
        <span class="pill dark">What changes per trade</span>
        <h3 style="margin-top:14px">Same engine, different vocabulary</h3>
        <p class="small" style="margin-top:6px">A restaurant gets a menu and table bookings. A garage gets work items and service slots. A photographer gets packages and a shoot brief. One spec drives all of it.</p>
        <hr class="hr" />
        <div class="rows">
          <div class="row"><span>Restaurant</span><strong>Menu · table booking</strong></div>
          <div class="row"><span>Salon</span><strong>Services · appointments</strong></div>
          <div class="row"><span>Gym</span><strong>Memberships · timetable</strong></div>
          <div class="row"><span>Shop</span><strong>Catalogue · cart</strong></div>
          <div class="row"><span>Trades</span><strong>Jobs · quote request</strong></div>
          <div class="row"><span>Property</span><strong>Listings · viewings</strong></div>
          <div class="row"><span>Hotel</span><strong>Rooms · availability</strong></div>
          <div class="row"><span>Clinic</span><strong>Treatments · appointments</strong></div>
        </div>
        <hr class="hr" />
        <div class="row"><span>Sample build, one-time</span><strong>${usd(quote.oneTime)}</strong></div>
        <p class="tiny" style="margin-top:12px">Prices are the cost of production. You set the retail price you charge the business.</p>
      </div>
    </div>
  </section>

  <section class="wrap" id="trades" style="padding:58px 0 20px">
    <span class="eyebrow">Any trade</span>
    <h2 class="section" style="margin-top:14px;max-width:24ch">Restaurants are one row in the table.</h2>
    <p class="lede" style="margin-top:14px">Each type carries its own vocabulary, seeded content and sensible default features. Pick the closest one and the build takes shape immediately.</p>
    <div class="grid-2" style="margin-top:26px;gap:26px;align-items:start">
      <div class="card">${verticalCards}</div>
      <div class="stack">
        <div class="card">
          <div class="card-head"><h3>Not on the list?</h3><span class="pill accent">Free text</span></div>
          <p class="small">The brief has a box for the customer's own words: stock levels for 200 products, a staff rota, dog grooming appointments, ticket sales, a loyalty card shared with a sister shop.</p>
          <p class="small" style="margin-top:10px">That text is stored on the build, shown next to the app, and included in the exports — so the request never quietly disappears. Anything that needs real backend logic (POS sync, stock reservations, ticketing) is quoted as custom work, honestly and separately.</p>
        </div>
        <div class="card">
          <div class="card-head"><h3>What's always in the build</h3><span class="pill">Base</span></div>
          <ul class="ticks">
            <li>Installable app shell with an offline cache</li>
            <li>Catalogue with sections, prices, durations and notes</li>
            <li>Brand colour, icon and copy — all editable</li>
            <li>Private review link and a version history</li>
            <li>Packaging for web, Android and iOS on approval</li>
          </ul>
        </div>
      </div>
    </div>
  </section>

  <section class="wrap" id="formats" style="padding:58px 0 20px">
    <span class="eyebrow">Formats</span>
    <h2 class="section" style="margin-top:14px;max-width:22ch">Native, hybrid, PWA &mdash; what actually ships in minutes.</h2>
    <p class="lede" style="margin-top:14px">This is the honest line, because it decides what you can promise on a sales call.</p>
    <div class="grid-3" style="margin-top:26px">
      <div class="card">
        <div class="card-head"><h3>PWA</h3><span class="pill green">Same day</span></div>
        <p class="small">Installable from a link, works offline, updates the moment you rebuild. No store, no review, no cut. This is what closes most local-business deals.</p>
        <hr class="hr" />
        <p class="tiny">Delivered as: a complete zip you host anywhere with HTTPS.</p>
      </div>
      <div class="card">
        <div class="card-head"><h3>Hybrid &mdash; Android</h3><span class="pill amber">+ signing step</span></div>
        <p class="small">A Trusted Web Activity wrapping the same build. Plattr writes the manifest, the signing notes and the Bubblewrap commands; you run them once per client.</p>
        <hr class="hr" />
        <p class="tiny">Delivered as: project zip &rarr; .aab for Play, .apk for direct install.</p>
      </div>
      <div class="card">
        <div class="card-head"><h3>Hybrid &mdash; iOS</h3><span class="pill amber">+ Apple account</span></div>
        <p class="small">A Capacitor project pointed at the same build. An Apple Developer account ($99/yr), a certificate and a review queue stand between you and an .ipa; we generate everything else.</p>
        <hr class="hr" />
        <p class="tiny">Delivered as: Xcode project &rarr; TestFlight &rarr; App Store.</p>
      </div>
    </div>
    <div class="notice accent" style="margin-top:18px">
      <strong>Full native (Swift/Kotlin from scratch) is a different product.</strong> No generator produces a credible native app in minutes, and Apple rejects thin wrappers under Guideline 4.2. The hybrid route above is what ships fast <em>and</em> survives review, because every screen is in the app, not the browser chrome.
    </div>
  </section>

  <section class="wrap" id="pricing" style="padding:58px 0 20px">
    <span class="eyebrow">Pricing</span>
    <h2 class="section" style="margin-top:14px;max-width:24ch">Two ways your customer pays. One production line.</h2>
    <div class="grid-2" style="margin-top:26px">
      <div class="card">
        <div class="card-head"><h3>One-time build</h3><span class="pill">Project</span></div>
        <p class="small">The whole app, handed over, invoiced once. Best for the owner who wants to own it and call you when something changes.</p>
        <hr class="hr" />
        <div class="row"><span>Design + build</span><strong>$1,400</strong></div>
        <div class="row"><span>Capabilities</span><strong>+ per feature</strong></div>
        <div class="row"><span>Android + iOS packages</span><strong>+ $450 each</strong></div>
        <div class="row total"><span>Typical all-in</span><strong>${usd(quote.oneTime)}</strong></div>
        <p class="tiny" style="margin-top:10px">Quoted live in the brief, capability by capability, so nothing is a surprise.</p>
      </div>
      <div class="card" style="border-color:var(--ink)">
        <div class="card-head"><h3>Monthly care plan</h3><span class="pill dark">Recurring</span></div>
        <p class="small">A setup fee, then a monthly retainer that covers rebuilds, catalogue changes and store admin. This is the model that keeps the lights on between projects.</p>
        <hr class="hr" />
        <div class="row"><span>Setup (30% of build)</span><strong>${usd(quote.setupFee)}</strong></div>
        <div class="row"><span>Monthly care</span><strong>${usd(quote.monthly)}/mo</strong></div>
        <div class="row"><span>First year</span><strong>${usd(quote.firstYear)}</strong></div>
        <div class="row total"><span>Same build, spread</span><strong>${usd(quote.setupFee)} + ${usd(quote.monthly)}/mo</strong></div>
        <p class="tiny" style="margin-top:10px">Billing collection isn't wired up yet &mdash; the plan and the numbers are, so you can invoice from the build page.</p>
      </div>
    </div>
  </section>

  <section class="wrap" id="bundle" style="padding:10px 0 26px">
    <div class="card" style="border-color:var(--ink)">
      <div class="card-head"><h3>${esc(bundle.label)}</h3><span class="pill dark">Premium bundle</span></div>
      <p class="lede" style="margin-top:2px;max-width:62ch">${esc(bundle.blurb)}</p>
      <div class="grid-2" style="gap:26px;align-items:start;margin-top:20px">
        <ul class="ticks">${bundle.includes.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>
        <div>
          <div class="row"><span>Build</span><strong>${usd(bundle.price)}</strong></div>
          <div class="row"><span>Platform fee</span><strong>${usd(bundle.monthly)}/mo</strong></div>
          <div class="row total"><span>First year</span><strong>${usd(bundle.price + bundle.monthly * 12)}</strong></div>
          <p class="tiny" style="margin-top:10px">The storefront comes from the generator. The three apps and two back offices are a platform build — quoted line by line, not promised by a brief.</p>
          <a class="btn primary" style="margin-top:14px" href="/brief?bundle=${esc(bundle.id)}">Quote it on a brief &rarr;</a>
        </div>
      </div>
    </div>
  </section>

  <section class="wrap" style="padding:56px 0 10px">
    <div class="grid-2" style="gap:40px;align-items:start">
      <div>
        <span class="eyebrow">Questions a customer will ask</span>
        <h2 class="section" style="margin-top:14px">The answers, in plain language.</h2>
        <p class="lede" style="margin-top:12px">Every claim on this page maps to something you can download from a build, so you can show it rather than describe it.</p>
        <a class="btn primary" style="margin-top:22px" href="/brief">Build the first one &rarr;</a>
      </div>
      <div>
        <details class="faq" open>
          <summary>My customer runs something that isn't on the list.</summary>
          <p>Pick the closest trade and write the specifics in the brief's free-text box. The generated app takes the shape of that trade — catalogue, diary, timetable or quote form — and the custom text travels with the build. Logic that needs a real backend (stock reservations, POS sync, ticketing, payments) is scoped and quoted separately rather than pretended.</p>
        </details>
        <details class="faq">
          <summary>Can this put an app in the App Store?</summary>
          <p>Yes, with a human step. Plattr produces the iOS project and the store checklist; you archive it in Xcode under the business's Apple Developer account and submit. Review takes days, not minutes, and Apple rejects a store page that is just a website link — which is why this build carries real in-app screens.</p>
        </details>
        <details class="faq">
          <summary>And Google Play?</summary>
          <p>Yes. The Android download is a Bubblewrap project: run its build script with your upload key and you get the .aab. A brand-new Play developer account also needs a closed test with 12 testers for 14 days before production, so quote the launch date accordingly.</p>
        </details>
        <details class="faq">
          <summary>Does the customer need an account?</summary>
          <p>No. Every build has a private link with an unguessable token. That is deliberate: a shop owner never logs in to see their app. If you want named accounts and per-seat permissions for your own team, that's the next layer to add.</p>
        </details>
        <details class="faq">
          <summary>Who owns the build?</summary>
          <p>The download is the deliverable: a static site, a project folder and a spec. Nothing is locked to Plattr, and the PWA can be hosted on the business's own domain.</p>
        </details>
        <details class="faq">
          <summary>Where does the money come from?</summary>
          <p>The quote engine prices the production work (base build, each capability, each store format) and shows it in the customer's build page. Collection is your call — one invoice, or a monthly plan with the setup fee. Payment links are not part of this build yet.</p>
        </details>
        <details class="faq">
          <summary>What about a price list that changes every season?</summary>
          <p>That's why edits are self-serve. The owner rewrites prices, durations and items in the build page and the version bumps instantly. The monthly plan is what pays for that habit.</p>
        </details>
      </div>
    </div>
  </section>

  <section class="wrap" style="padding:40px 0 10px">
    <div class="card" style="background:var(--ink);color:var(--paper);border-color:var(--ink);text-align:center;padding:44px 24px">
      <h2 class="section" style="color:var(--paper);max-width:26ch;margin-inline:auto">Take the next brief on a call, not in a proposal.</h2>
      <p style="color:rgba(251,246,238,0.72);font-size:15px;max-width:52ch;margin:14px auto 0">Four minutes of questions, a live app in the customer's own trade, a real quote, and a version history you can point at when the scope creeps.</p>
      <div style="display:flex;gap:10px;justify-content:center;margin-top:24px;flex-wrap:wrap">
        <a class="btn accent" href="/brief">Start a customer brief</a>
        <a class="btn ghost" style="color:var(--paper);border-color:rgba(251,246,238,0.3)" href="/studio">Open the studio</a>
      </div>
    </div>
  </section>
`
  return page({
    title: 'Plattr — apps for any local business, from a conversation',
    description:
      'Turn a short customer brief into a working app for any trade: catalogue, orders, bookings, timetables, quotes — packaged for web, Android and iOS.',
    body,
    script: DEMO_SCRIPT,
  })
}

const DEMO_SCRIPT = `
(() => {
  const frame = document.getElementById('demo-frame')
  if (frame) {
    document.querySelectorAll('[data-demo]').forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelectorAll('[data-demo]').forEach((other) => other.setAttribute('aria-pressed', String(other === button)))
        frame.src = '/demo/app?biz=' + button.dataset.demo
      })
    })
  }

  const proofButton = document.querySelector('[data-proof-run]')
  const proofResult = document.querySelector('[data-proof-result]')
  if (proofButton && proofResult) {
    proofButton.addEventListener('click', async () => {
      const label = proofButton.textContent
      proofButton.disabled = true
      proofButton.textContent = 'Reading the shop…'
      proofResult.textContent = 'Crawling the site now — up to 20 seconds.'
      try {
        const response = await fetch('/api/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: proofButton.dataset.proofRun }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error((data.error && data.error.message) || 'That site could not be read just now.')
        const items = (data.site.menu || []).reduce((total, section) => total + section.items.length, 0)
        proofResult.textContent = 'Just now: ' + data.pages + ' pages, ' + items + ' items in ' +
          data.site.menu.length + ' sections, brand colour ' + (data.site.accent || 'not stated') + '.'
      } catch (error) {
        proofResult.textContent = error.message + ' The capture above still stands — the app is built from it.'
      } finally {
        proofButton.disabled = false
        proofButton.textContent = label
      }
    })
  }
})()
`
