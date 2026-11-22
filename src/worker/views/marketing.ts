import { SAMPLE_IMPORT, sampleTotals } from '../proof'
import { BUNDLES, usd } from '../pricing'
import { page, esc } from './shell'

/**
 * The public product page.
 *
 * One promise, one input: a business website. The page shows real, running
 * Plattr applications rather than decorative phone art, and makes no claim
 * about native store packages or capabilities that are not live.
 */
export function marketingPage(): string {
  const proof = sampleTotals()
  const bundle = BUNDLES[0]
  const body = `
  <style>
    .mkt { --mkt-ink: #101312; --mkt-muted: #69706c; --mkt-line: #e3e6e2; --mkt-soft: #f4f6f3; }
    body:has(.mkt-hero) .nav { background: rgba(16,19,18,.88); border-bottom-color: rgba(255,255,255,.10); }
    body:has(.mkt-hero) .nav .brand { color: #f7f8f5; }
    body:has(.mkt-hero) .nav .brand .glyph { background: #f7f8f5; color: #101312; }
    body:has(.mkt-hero) .nav-links a:not(.btn) { color: #aab4ac; }
    body:has(.mkt-hero) .nav-links a:not(.btn):hover { color: #f7f8f5; }
    body:has(.mkt-hero) .nav-links a.btn { background: #f7f8f5; color: #101312; border-color: #f7f8f5; }
    .mkt-hero { background: #101312; color: #f7f8f5; padding: 72px 0 62px; overflow: hidden; position: relative; }
    .mkt-hero::after { content: ""; position: absolute; width: 680px; height: 680px; right: -240px; top: -260px; border-radius: 50%; background: radial-gradient(circle, rgba(226,82,45,.28), transparent 66%); pointer-events: none; }
    .mkt-hero .wrap { position: relative; z-index: 1; display: grid; grid-template-columns: 1.04fr .96fr; gap: 56px; align-items: center; }
    .mkt-badge { display: inline-flex; align-items: center; gap: 8px; border: 1px solid rgba(255,255,255,.18); border-radius: 999px; padding: 6px 11px; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #c8cec8; }
    .mkt-badge i { width: 6px; height: 6px; border-radius: 50%; background: #8dd8a8; box-shadow: 0 0 0 4px rgba(141,216,168,.12); }
    .mkt-hero h1 { margin-top: 22px; color: #f7f8f5; font-family: var(--sans); font-size: clamp(48px, 6.25vw, 86px); font-weight: 650; line-height: .96; letter-spacing: -.065em; }
    .mkt-hero p { margin-top: 20px; max-width: 58ch; color: #b8c0ba; font-size: clamp(15px, 1.4vw, 18px); line-height: 1.6; }
    .mkt-url { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 28px; max-width: 620px; }
    .mkt-url input { flex: 1 1 330px; min-height: 56px; border: 1px solid rgba(255,255,255,.18); background: rgba(255,255,255,.07); color: #fff; border-radius: 12px; padding: 0 16px; font-size: 15px; }
    .mkt-url input::placeholder { color: #7f8a82; }
    .mkt-url input:focus { border-color: #8dd8a8; box-shadow: 0 0 0 3px rgba(141,216,168,.14); }
    .mkt-url button { min-height: 56px; border-radius: 12px; background: #e2522d; border-color: #e2522d; color: #fff; padding-inline: 22px; font-size: 14px; }
    .mkt-proofline { margin-top: 14px; display: flex; flex-wrap: wrap; gap: 8px 18px; color: #8e9991; font-size: 11.5px; }
    .mkt-proofline span::before { content: "✓"; color: #8dd8a8; margin-right: 5px; font-weight: 800; }
    .mkt-visual { position: relative; min-height: 560px; display: grid; place-items: center; }
    .mkt-window { width: min(100%, 430px); background: #f7f7f3; border-radius: 26px; padding: 9px; box-shadow: 0 40px 100px -38px rgba(0,0,0,.9), 0 0 0 1px rgba(255,255,255,.12); transform: rotate(1.4deg); }
    .mkt-window .bar { height: 26px; display: flex; align-items: center; gap: 5px; padding: 0 7px; }
    .mkt-window .bar i { width: 6px; height: 6px; border-radius: 50%; background: #c8ccc7; }
    .mkt-window iframe { display: block; width: 100%; height: 570px; border: 0; border-radius: 19px; background: #fff; }
    .mkt-caption { position: absolute; bottom: -34px; left: 50%; transform: translateX(-50%); color: #8e9991; font-size: 10.5px; white-space: nowrap; }
    .mkt-band { padding: 16px 0; border-bottom: 1px solid var(--mkt-line); background: #fff; }
    .mkt-band .wrap { display: flex; flex-wrap: wrap; gap: 9px 28px; align-items: center; justify-content: center; color: var(--mkt-muted); font-size: 11.5px; }
    .mkt-band b { color: var(--mkt-ink); font-weight: 650; }
    .mkt-section { padding: 78px 0 10px; }
    .mkt-eyebrow { display: inline-flex; align-items: center; gap: 8px; color: #c24a2a; font-size: 10.5px; font-weight: 750; letter-spacing: .12em; text-transform: uppercase; }
    .mkt-eyebrow::before { content: ""; width: 18px; height: 1px; background: currentColor; }
    .mkt-section h2 { margin-top: 14px; max-width: 22ch; font-family: var(--sans); font-size: clamp(31px, 4vw, 52px); font-weight: 650; line-height: 1.02; letter-spacing: -.05em; }
    .mkt-section .lede { margin-top: 15px; max-width: 62ch; color: var(--mkt-muted); }
    .mkt-steps { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 0; margin-top: 34px; border-top: 1px solid var(--mkt-line); }
    .mkt-step { padding: 22px 24px 26px 0; border-right: 1px solid var(--mkt-line); }
    .mkt-step + .mkt-step { padding-left: 24px; }
    .mkt-step:last-child { border-right: 0; }
    .mkt-step b { display: block; color: #aeb5b0; font-family: ui-monospace, monospace; font-size: 10px; letter-spacing: .12em; }
    .mkt-step h3 { margin-top: 20px; font-family: var(--sans); font-size: 16px; font-weight: 650; letter-spacing: -.02em; }
    .mkt-step p { margin-top: 7px; color: var(--mkt-muted); font-size: 12.5px; line-height: 1.6; }
    .mkt-read { display: grid; grid-template-columns: .9fr 1.1fr; gap: 28px; align-items: stretch; margin-top: 34px; }
    .mkt-read-list { display: grid; grid-template-columns: 1fr 1fr; gap: 0 24px; border-top: 1px solid var(--mkt-line); }
    .mkt-read-list div { padding: 15px 0; border-bottom: 1px solid var(--mkt-line); }
    .mkt-read-list b { display: block; font-size: 13px; font-weight: 650; }
    .mkt-read-list span { display: block; margin-top: 3px; color: var(--mkt-muted); font-size: 11.5px; line-height: 1.5; }
    .mkt-proofcard { background: #101312; color: #f7f8f5; border-radius: 20px; padding: 22px; display: flex; flex-direction: column; justify-content: space-between; }
    .mkt-proofcard h3 { font-family: var(--sans); font-size: 20px; font-weight: 650; letter-spacing: -.03em; }
    .mkt-proofcard p { color: #aeb8b1; font-size: 12.5px; line-height: 1.65; margin-top: 8px; }
    .mkt-proofcard .stat { display: flex; gap: 24px; margin-top: 20px; }
    .mkt-proofcard .stat b { display: block; color: #f7f8f5; font-family: var(--sans); font-size: 26px; font-weight: 650; letter-spacing: -.04em; }
    .mkt-proofcard .stat span { color: #87928a; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; }
    .mkt-proofcard a { color: #f7f8f5; font-size: 12px; margin-top: 20px; text-decoration: underline; text-underline-offset: 3px; }
    .mkt-concepts { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 14px; margin-top: 30px; }
    .mkt-concept { border: 1px solid var(--mkt-line); border-radius: 17px; background: #fff; padding: 10px; }
    .mkt-concept header { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; padding: 5px 4px 9px; }
    .mkt-concept b { font-family: var(--sans); font-size: 14px; font-weight: 650; letter-spacing: -.02em; }
    .mkt-concept span { color: var(--mkt-muted); font-size: 10px; }
    .mkt-concept iframe { display: block; width: 100%; height: 390px; border: 1px solid var(--mkt-line); border-radius: 11px; background: #f4f6f3; }
    .mkt-concept p { margin: 8px 4px 2px; color: var(--mkt-muted); font-size: 11px; line-height: 1.5; }
    .mkt-truth { display: grid; grid-template-columns: 1fr 1fr; gap: 44px; align-items: start; margin-top: 34px; }
    .mkt-truth h3 { font-family: var(--sans); font-size: 25px; font-weight: 650; letter-spacing: -.04em; line-height: 1.15; }
    .mkt-truth p { margin-top: 12px; color: var(--mkt-muted); font-size: 13.5px; line-height: 1.7; }
    .mkt-compare { border-top: 1px solid var(--mkt-line); }
    .mkt-compare div { display: grid; grid-template-columns: 145px 1fr; gap: 16px; padding: 13px 0; border-bottom: 1px solid var(--mkt-line); font-size: 12.5px; }
    .mkt-compare b { color: var(--mkt-ink); font-weight: 650; }
    .mkt-compare span { color: var(--mkt-muted); }
    .mkt-cta { margin: 74px 0 0; background: #101312; border-radius: 24px; color: #f7f8f5; padding: 44px 36px; display: flex; justify-content: space-between; align-items: center; gap: 28px; flex-wrap: wrap; }
    .mkt-cta h2 { color: #f7f8f5; font-family: var(--sans); font-size: clamp(30px, 4vw, 48px); font-weight: 650; letter-spacing: -.055em; max-width: 18ch; }
    .mkt-cta p { color: #aeb8b1; font-size: 13px; margin-top: 8px; max-width: 44ch; }
    .mkt-cta .btn { background: #f7f8f5; color: #101312; border-color: #f7f8f5; }
    .mkt-small { color: #8e9991; font-size: 11px; margin-top: 8px; }
    .mkt-link { color: var(--mkt-ink); text-decoration: underline; text-underline-offset: 3px; }
    .mkt-price { margin-top: 18px; color: var(--mkt-muted); font-size: 12px; }
    @media (max-width: 940px) {
      .mkt-hero .wrap { grid-template-columns: 1fr; gap: 36px; }
      .mkt-hero { padding-top: 48px; }
      .mkt-visual { min-height: 0; }
      .mkt-steps { grid-template-columns: 1fr 1fr; }
      .mkt-step:nth-child(2) { border-right: 0; }
      .mkt-step:nth-child(3), .mkt-step:nth-child(4) { border-top: 1px solid var(--mkt-line); }
      .mkt-read, .mkt-truth { grid-template-columns: 1fr; gap: 24px; }
      .mkt-concepts { grid-template-columns: 1fr; }
      .mkt-concept iframe { height: 500px; }
    }
    @media (max-width: 560px) {
      .mkt-steps { grid-template-columns: 1fr; }
      .mkt-step, .mkt-step + .mkt-step { border-right: 0; padding-left: 0; border-top: 1px solid var(--mkt-line); }
      .mkt-step:first-child { border-top: 0; }
      .mkt-read-list { grid-template-columns: 1fr; }
      .mkt-cta { padding: 30px 22px; }
      .mkt-url { display: grid; }
      .mkt-url button { width: 100%; }
    }
  </style>

  <main class="mkt">
    <section class="mkt-hero">
      <div class="wrap">
        <div>
          <span class="mkt-badge"><i></i> URL-first app generation</span>
          <h1>Your website<br />is the brief.</h1>
          <p>Enter a business address. Plattr reads the real brand, products, prices, images and contact details, then builds three complete application concepts from that evidence. No generic brief. No trade-template content.</p>
          <form class="mkt-url" action="/start" method="get">
            <input name="url" type="url" maxlength="300" placeholder="https://yourbusiness.com" aria-label="Business website address" autocomplete="url" required />
            <button class="btn" type="submit">Build three concepts →</button>
          </form>
          <div class="mkt-proofline">
            <span>Real discovery, not a mockup</span>
            <span>Owner approval before publishing</span>
            <span>PWA-ready</span>
          </div>
          <p class="mkt-small">Already have a text brief? <a class="mkt-link" href="/brief" style="color:#c8cec8">Use the brief instead</a>.</p>
        </div>
        <div class="mkt-visual">
          <div class="mkt-window">
            <div class="bar"><i></i><i></i><i></i></div>
            <iframe title="A live Plattr shop application" src="/demo/app?biz=shop&direction=editorial&media=photo" loading="lazy"></iframe>
          </div>
          <span class="mkt-caption">A live Plattr shop build. Explore it before you enter your URL.</span>
        </div>
      </div>
    </section>

    <div class="mkt-band">
      <div class="wrap">
        <span><b>Reads</b> names, products, prices, categories</span>
        <span><b>Uses</b> the business's own images and brand</span>
        <span><b>Builds</b> three structurally different apps</span>
        <span><b>Keeps</b> every extracted fact traceable</span>
      </div>
    </div>

    <section class="mkt-section wrap" id="how">
      <span class="mkt-eyebrow">How it works</span>
      <h2>From a live website to a working application.</h2>
      <p class="lede">The site is the source of truth. Plattr only asks a question when the source leaves something genuinely unresolved.</p>
      <div class="mkt-steps">
        <div class="mkt-step"><b>01 / READ</b><h3>Open the real pages</h3><p>Home, category and product pages. Structured data, visible prices, product photos, navigation and brand tokens.</p></div>
        <div class="mkt-step"><b>02 / UNDERSTAND</b><h3>Build the profile</h3><p>Name, category, contact details, currency, catalogue and provenance. Missing information is reported, never invented.</p></div>
        <div class="mkt-step"><b>03 / COMPOSE</b><h3>Three real applications</h3><p>Different home screens, navigation, catalogue rhythm, detail pages and journeys — all using the same verified facts.</p></div>
        <div class="mkt-step"><b>04 / OWN</b><h3>Choose, edit, publish</h3><p>Open the owner workspace, correct any detail, edit visually, approve, then publish on a stable customer link.</p></div>
      </div>
    </section>

    <section class="mkt-section wrap" id="proof">
      <span class="mkt-eyebrow">What it actually reads</span>
      <h2>Not a preset wearing the business's name.</h2>
      <p class="lede">A trade preset may decide which capabilities make sense. It never gets to decide what the business sells, what it charges or what it looks like.</p>
      <div class="mkt-read">
        <div class="mkt-read-list">
          <div><b>Identity</b><span>Business name, category, logo and brand colour from the site's own declarations.</span></div>
          <div><b>Catalogue</b><span>Real product names, descriptions, prices and categories, with their source page.</span></div>
          <div><b>Photography</b><span>Each product's own image when the markup ties it to that row. No stock substitutes.</span></div>
          <div><b>Contact</b><span>Phone, email, address and opening hours when published.</span></div>
          <div><b>Money</b><span>Currency only when the page proves it; otherwise the owner confirms it.</span></div>
          <div><b>Provenance</b><span>Every extracted field keeps its method and source URL. Failures are shown as failures.</span></div>
        </div>
        <div class="mkt-proofcard">
          <div>
            <span class="mkt-badge" style="border-color:rgba(255,255,255,.16)">Live evidence</span>
            <h3 style="margin-top:16px">A real import, running beside its source.</h3>
            <p>The shop in the hero is a live Plattr build. Below it is a separate build from a captured read of <span class="mono" style="color:#dbe3dc">${esc(SAMPLE_IMPORT.source)}</span>: ${SAMPLE_IMPORT.pages} pages, read ${proof.items} items with ${proof.priced} listed prices. Nothing in that capture was hand-typed.</p>
          </div>
          <div>
            <div class="stat">
              <div><b>${proof.items}</b><span>products read</span></div>
              <div><b>${proof.priced}</b><span>priced</span></div>
              <div><b>${SAMPLE_IMPORT.pages}</b><span>pages opened</span></div>
            </div>
            <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:18px">
              <a href="/proof/app" style="margin-top:0">Open the proof build →</a>
              <a href="/start?url=${encodeURIComponent(SAMPLE_IMPORT.source)}" style="margin-top:0">Re-run this URL live →</a>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="mkt-section wrap" id="concepts">
      <span class="mkt-eyebrow">Three concepts, not three skins</span>
      <h2>The same business, composed three ways.</h2>
      <p class="lede">A concept changes what opens, how the catalogue is read, how a product detail works and how a customer moves through the app. These are live applications, not static cards.</p>
      <div class="mkt-concepts">
        <div class="mkt-concept">
          <header><b>Catalogue first</b><span>compact · index</span></header>
          <iframe title="Catalogue-first application structure" src="/demo/app?biz=shop&direction=minimal&media=photo" loading="lazy"></iframe>
          <p>Search and browse lead. Dense product rows, direct comparison, a short path to the bag.</p>
        </div>
        <div class="mkt-concept">
          <header><b>Narrative lead</b><span>editorial · story</span></header>
          <iframe title="Narrative-led application structure" src="/demo/app?biz=shop&direction=editorial&media=photo" loading="lazy"></iframe>
          <p>A brand statement, one strong piece, then the collection. Product pages read like features.</p>
        </div>
        <div class="mkt-concept">
          <header><b>Image first</b><span>campaign · immersive</span></header>
          <iframe title="Image-first application structure" src="/demo/app?biz=shop&direction=lifestyle&media=photo" loading="lazy"></iframe>
          <p>Photography before words, a swipeable catalogue and a more immersive browse.</p>
        </div>
      </div>
      <p class="mkt-small">These three use a demonstration shop to show the structures. When you enter your URL, every concept uses your own products and imagery instead.</p>
    </section>

    <section class="mkt-section wrap">
      <div class="mkt-truth">
        <div>
          <span class="mkt-eyebrow">An honest boundary</span>
          <h3>A trade preset is a capability map, not a content generator.</h3>
          <p>Plattr uses trade shapes to decide which screens make sense — a shop needs a catalogue and a bag, a salon needs treatments and appointments. Everything the customer sees inside those screens comes from the business, or is clearly marked as missing until the owner supplies it.</p>
          <p>If a product has no price, it says so. If an image could not be tied to the right product, it is not borrowed from another one. If a site cannot be read, the import fails instead of inventing a result.</p>
          <a class="btn ghost" style="margin-top:18px" href="/start">Try your own URL →</a>
        </div>
        <div class="mkt-compare">
          <div><b>Trade shape</b><span>Which functional screens and flows exist</span></div>
          <div><b>Business facts</b><span>Names, products, prices, images and contact details from the site</span></div>
          <div><b>Owner decisions</b><span>Corrections, missing policies and approval to publish</span></div>
          <div><b>Never substituted</b><span>A different shop's catalogue, stock photography or invented prices</span></div>
          <div><b>Generated today</b><span>A working web app, installable as a PWA</span></div>
        </div>
      </div>
    </section>

    <section class="wrap">
      <div class="mkt-cta">
        <div>
          <h2>Start with the website you already have.</h2>
          <p>No lengthy brief. No re-typing your catalogue. Three working concepts from the real business, then you decide.</p>
          <p class="mkt-small" style="color:#a9b1ab;margin-top:10px">Running a marketplace? ${esc(bundle.label)} — ${usd(bundle.price)}, ${usd(bundle.monthly)}/mo. <a href="/brief?bundle=marketplace" style="color:#f7f8f5;text-decoration:underline">Start the marketplace brief →</a></p>
        </div>
        <a class="btn" href="/start">Build my three concepts →</a>
      </div>
    </section>
  </main>
  `

  return page({
    title: 'Plattr — your website becomes three working apps',
    description:
      'Enter a business website. Plattr reads its real products, prices, images and brand, then builds three complete application concepts. Choose, customise and publish.',
    body,
  })
}
