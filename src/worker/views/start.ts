import { esc, page } from './shell'

/**
 * The URL-first front door.
 *
 * The homepage only asks for one thing: the business's website. This page shows
 * what the live read established, what is genuinely missing, and the three
 * complete concept applications built from that same profile. It never asks the
 * owner to retype a fact the site already provided.
 */
export function startPage(): string {
  const body = `
  <style>
    .start-hero { padding: 64px 0 34px; }
    .start-hero h1 { font-size: clamp(42px, 6vw, 76px); max-width: 14ch; line-height: .98; }
    .start-hero .lede { margin-top: 18px; max-width: 56ch; }
    .url-form { display: flex; gap: 9px; flex-wrap: wrap; margin-top: 26px; max-width: 710px; }
    .url-form input { flex: 1 1 420px; min-height: 54px; font-size: 16px; border-radius: 14px; background: #fff; }
    .url-form button { min-height: 54px; border-radius: 14px; padding-inline: 22px; }
    .start-strip { display: flex; flex-wrap: wrap; gap: 10px 20px; margin-top: 14px; color: var(--muted); font-size: 12px; }
    .start-strip span { display: inline-flex; gap: 6px; align-items: center; }
    .start-strip span::before { content: "✓"; color: var(--basil); font-weight: 800; }
    .start-panel { border: 1px solid var(--line); background: #fff; border-radius: 22px; padding: 22px; box-shadow: var(--shadow); }
    .start-status { margin-top: 18px; min-height: 24px; font-size: 13px; color: var(--muted); }
    .start-status[data-busy="1"]::before { content: ""; display: inline-block; width: 12px; height: 12px; border: 2px solid var(--line); border-top-color: var(--accent); border-radius: 50%; animation: spin .7s linear infinite; vertical-align: -2px; margin-right: 7px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .discovery { margin-top: 28px; scroll-margin-top: 90px; }
    .discovery-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; flex-wrap: wrap; }
    .discovery-head h2 { font-size: clamp(28px, 3.4vw, 42px); max-width: 18ch; }
    .source-line { margin-top: 8px; font-size: 12px; color: var(--muted); overflow-wrap: anywhere; word-break: normal; }
    .profile { display: grid; grid-template-columns: 1.35fr .9fr; gap: 18px; margin-top: 18px; }
    .profile-main, .profile-side { border: 1px solid var(--line); border-radius: 16px; background: #fff; padding: 18px; }
    .profile-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px; margin-top: 14px; }
    .profile-grid .field { margin: 0; }
    .profile-facts { display: grid; gap: 8px; margin-top: 12px; }
    .profile-facts div { display: flex; justify-content: space-between; gap: 14px; border-bottom: 1px dashed var(--line-soft); padding-bottom: 8px; font-size: 13px; }
    .profile-facts span { color: var(--muted); }
    .profile-facts strong { text-align: right; }
    .catalogue-mini { display: grid; gap: 8px; margin-top: 12px; max-height: 305px; overflow: auto; padding-right: 3px; }
    .catalogue-mini div { display: grid; grid-template-columns: 42px 1fr auto; align-items: center; gap: 10px; font-size: 12.5px; border-bottom: 1px solid var(--line-soft); padding-bottom: 8px; }
    .catalogue-mini img { width: 42px; height: 42px; object-fit: cover; border-radius: 8px; background: var(--paper-2); }
    .catalogue-mini b { font-weight: 600; line-height: 1.3; }
    .catalogue-mini em { font-style: normal; color: var(--muted); white-space: nowrap; }
    .catalogue-mini .noimg { display: grid; place-items: center; color: var(--muted); font-size: 10px; }
    .questions { margin-top: 14px; border-top: 1px solid var(--line-soft); padding-top: 14px; }
    .questions h3 { font-size: 15px; }
    .questions ul { margin: 8px 0 0; padding: 0; list-style: none; display: grid; gap: 7px; }
    .questions li { font-size: 12.5px; color: var(--muted); padding-left: 18px; position: relative; }
    .questions li::before { content: "?"; position: absolute; left: 0; top: 0; color: var(--accent); font-weight: 800; }
    .concept-section { margin-top: 42px; scroll-margin-top: 90px; }
    .concept-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 14px; margin-top: 18px; }
    .concept-card { border: 1px solid var(--line); background: #fff; border-radius: 18px; padding: 10px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
    .concept-card header { padding: 6px 4px 0; }
    .concept-card header b { display: block; font-family: var(--serif); font-size: 19px; line-height: 1.15; }
    .concept-card header span { display: block; margin-top: 4px; font-size: 11.5px; color: var(--muted); }
    .concept-card iframe { width: 100%; height: 520px; border: 1px solid var(--line); border-radius: 12px; background: #f4f4f1; }
    .concept-card p { min-height: 36px; margin: 0 4px; font-size: 11.5px; line-height: 1.45; color: var(--muted); }
    .concept-card button { width: 100%; }
    .concept-card[aria-pressed="true"] { border-color: var(--ink); box-shadow: 0 0 0 2px rgba(27,20,16,.1); }
    .start-actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-top: 20px; }
    .start-error { border: 1px solid #f0cfc7; background: #fff3ef; color: #7e2f1e; border-radius: 14px; padding: 14px 16px; font-size: 13px; margin-top: 16px; }
    .start-empty { margin-top: 18px; color: var(--muted); font-size: 13px; }
    @media (max-width: 900px) {
      .start-hero { padding-top: 38px; }
      .profile { grid-template-columns: 1fr; }
      .concept-grid { grid-template-columns: 1fr; }
      .concept-card iframe { height: 560px; }
    }
    @media (max-width: 560px) {
      .profile-grid { grid-template-columns: 1fr; }
      .url-form { display: grid; }
      .url-form button { width: 100%; }
    }
  </style>

  <main class="wrap">
    <section class="start-hero">
      <span class="eyebrow">URL-first application builder</span>
      <h1>Your website is the brief.</h1>
      <p class="lede">Paste the address. Plattr reads the business, its products and its design language, then builds three complete application concepts from what it found — not from a template and not from a form you have to fill in again.</p>
      <form class="url-form" id="start-form" novalidate>
        <input id="start-url" type="url" maxlength="300" placeholder="https://yourbusiness.com" aria-label="Business website address" autocomplete="url" required />
        <button class="btn accent" type="submit" id="start-button">Build my three concepts →</button>
      </form>
      <div class="start-strip">
        <span>No brief to retype</span>
        <span>Real products, prices and images</span>
        <span>Three different applications</span>
        <span>You approve before anything is public</span>
      </div>
      <div class="start-status" id="start-status" role="status" aria-live="polite"></div>
      <div class="start-error" id="start-error" hidden></div>
    </section>

    <section class="discovery" id="discovery" hidden>
      <div class="discovery-head">
        <div>
          <span class="eyebrow">What the site established</span>
          <h2 id="discovery-title">Reading the business…</h2>
          <p class="source-line" id="discovery-source"></p>
        </div>
        <span class="pill" id="discovery-pages"></span>
      </div>

      <div class="profile">
        <div class="profile-main">
          <div class="card-head" style="margin-bottom:4px">
            <strong>Business profile</strong>
            <span class="pill green">From the source</span>
          </div>
          <p class="small" style="margin-top:0">This is what the app will use. Correct anything that is wrong before choosing a concept; the extracted facts stay attached throughout.</p>
          <div class="profile-grid">
            <div class="field"><label for="profile-name">Name</label><input id="profile-name" type="text" maxlength="60" /></div>
            <div class="field"><label for="profile-category">Category</label><input id="profile-category" type="text" maxlength="40" /></div>
            <div class="field"><label for="profile-tagline">One-line description</label><input id="profile-tagline" type="text" maxlength="90" /></div>
            <div class="field"><label for="profile-accent">Brand colour</label><input id="profile-accent" type="color" style="width:100%;height:43px;padding:3px" /></div>
          </div>
          <div class="profile-facts" id="profile-facts"></div>
          <div class="questions" id="questions" hidden><h3>Only what the source could not settle</h3><ul></ul></div>
        </div>
        <div class="profile-side">
          <div class="card-head" style="margin-bottom:4px"><strong>Catalogue read</strong><span class="pill" id="catalogue-count"></span></div>
          <p class="small" style="margin-top:0">The source's own rows, names, prices and photographs. Missing prices stay missing rather than becoming invented ones.</p>
          <div class="catalogue-mini" id="catalogue-mini"></div>
          <a class="tiny" id="source-link" href="#" target="_blank" rel="noopener" style="display:inline-block;margin-top:12px">Open the source site ↗</a>
        </div>
      </div>
    </section>

    <section class="concept-section" id="concepts" hidden>
      <span class="eyebrow">The choice</span>
      <h2 class="section" style="margin-top:10px">Three different applications. One verified business.</h2>
      <p class="lede" style="margin-top:10px">These are not recoloured versions of one template. Each concept changes the home screen, navigation, catalogue presentation, detail page and customer journey. Browse each one before choosing.</p>
      <div class="concept-grid" id="concept-grid"></div>
      <div class="start-actions">
        <button class="btn primary" type="button" id="choose-button" disabled>Choose a concept</button>
        <span class="tiny">Choosing creates the owner workspace. Nothing is published until you approve it.</span>
      </div>
      <div class="start-actions">
        <a class="small" href="/brief">Business without a usable website? Use the text brief →</a>
      </div>
    </section>
  </main>
  <div class="toast" id="start-toast"></div>
  `

  return page({
    title: 'Build from your website · Plattr',
    description:
      'Plattr reads your business website and creates three real, working application concepts from your own products, prices, images and brand.',
    body,
    script: START_SCRIPT,
  })
}

const START_SCRIPT = `
(() => {
  const form = document.getElementById('start-form')
  const input = document.getElementById('start-url')
  const button = document.getElementById('start-button')
  const status = document.getElementById('start-status')
  const errorBox = document.getElementById('start-error')
  const discovery = document.getElementById('discovery')
  const concepts = document.getElementById('concepts')
  const conceptGrid = document.getElementById('concept-grid')
  const chooseButton = document.getElementById('choose-button')
  const toast = document.getElementById('start-toast')
  let result = null
  let selected = null
  let selectedCard = null

  const esc = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const money = (cents, currency) => cents > 0
    ? (currency ? currency + ' ' : '') + (cents / 100).toFixed(2)
    : 'Price not listed'
  const fact = (label, value) => value
    ? '<div><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong></div>'
    : ''

  function say(message, busy) {
    status.textContent = message || ''
    status.dataset.busy = busy ? '1' : '0'
  }
  function fail(message) {
    errorBox.hidden = false
    errorBox.textContent = message
  }
  function reset() {
    errorBox.hidden = true
    discovery.hidden = true
    concepts.hidden = true
    conceptGrid.innerHTML = ''
    selected = null
    selectedCard = null
    chooseButton.disabled = true
  }

  function render(data) {
    result = data
    const d = data.discovery || {}
    const business = d.business || {}
    const commerce = d.commerce || {}
    const items = (commerce.sections || []).flatMap((section) => (section.items || []).map((item) => ({ ...item, section: section.name })))
    const priced = items.filter((item) => item.price > 0).length
    const withImage = items.filter((item) => item.image).length
    const currency = commerce.currency && commerce.currency.value
    document.getElementById('discovery-title').textContent = business.name && business.name.value
      ? business.name.value + ' — ' + (business.category && business.category.value || 'business')
      : 'The business read'
    document.getElementById('discovery-source').textContent = 'Read from ' + data.source + ' · ' + (data.pages || 1) + ' pages · ' + items.length + ' catalogue entries · ' + withImage + ' photographs'
    document.getElementById('discovery-pages').textContent = (withImage ? withImage + ' with images' : 'No images read')
    document.getElementById('profile-name').value = business.name && business.name.value || ''
    document.getElementById('profile-category').value = business.category && business.category.value || ''
    // Show the line the app actually uses, after the source's search snippet has
    // been cleaned. The raw metadata is still visible in the evidence summary.
    const conceptSpec = data.concepts && data.concepts[0] && data.concepts[0].spec
    document.getElementById('profile-tagline').value = conceptSpec && typeof conceptSpec.tagline === 'string'
      ? conceptSpec.tagline
      : business.tagline && business.tagline.value || ''
    const accent = business.accent && business.accent.value
    document.getElementById('profile-accent').value = /^#[0-9a-f]{6}$/i.test(accent || '') ? accent : '#1f6b52'

    document.getElementById('profile-facts').innerHTML = [
      fact('Website', data.host),
      fact('Category source', business.category && business.category.method),
      fact('Pages read', String(data.pages || 1)),
      fact('Products', String(items.length)),
      fact('Priced', priced + ' of ' + items.length),
      fact('Currency', currency || 'Not stated — amounts stay unlabelled'),
      fact('Phone', business.phone && business.phone.value),
      fact('Email', business.email && business.email.value),
      fact('Address', business.address && business.address.value),
    ].join('')

    const questions = (data.blockers || []).concat(data.confirmations || [])
    const questionBox = document.getElementById('questions')
    questionBox.hidden = !questions.length
    if (questions.length) {
      questionBox.querySelector('ul').innerHTML = questions.map((question) =>
        '<li>' + esc(question.why) + '</li>'
      ).join('')
    }

    const sample = items.slice(0, 12)
    document.getElementById('catalogue-mini').innerHTML = sample.length
      ? sample.map((item) =>
          '<div>' +
            (item.image
              ? '<img src="' + esc(item.image) + '" alt="" loading="lazy" referrerpolicy="no-referrer" />'
              : '<span class="noimg">no image</span>') +
            '<b>' + esc(item.name) + '</b>' +
            '<em>' + esc(money(item.price, currency)) + '</em>' +
          '</div>'
        ).join('')
      : '<p class="small" style="margin:0">No commercial catalogue was read. Nothing was invented; the owner can add products in the editor or use the text brief.</p>'
    document.getElementById('catalogue-count').textContent = items.length + ' items'
    const link = document.getElementById('source-link')
    link.href = data.source
    document.getElementById('discovery-title').setAttribute('title', business.name && business.name.value || '')
    discovery.hidden = false

    conceptGrid.innerHTML = (data.concepts || []).map((concept) =>
      '<article class="concept-card" data-concept="' + esc(concept.id) + '" aria-pressed="false">' +
        '<header><b>' + esc(concept.name) + '</b><span>' + esc(concept.note || '') + '</span></header>' +
        '<iframe src="' + esc(concept.preview || ((data.draft && data.draft.preview) ? data.draft.preview + '?concept=' + encodeURIComponent(concept.id) : '')) + '" title="' + esc(concept.name) + ' concept" loading="eager"></iframe>' +
        '<p>' + esc((concept.spec && concept.spec.kind) || '') + ' · ' + esc(concept.id) + ' composition</p>' +
        '<button class="btn primary small" type="button" data-pick="' + esc(concept.id) + '">Choose this concept</button>' +
      '</article>'
    ).join('')
    concepts.hidden = !(data.concepts || []).length
    chooseButton.disabled = true
    if (!data.draft || !data.draft.token) fail('The site was read, but the owner workspace could not be created. Use the text brief instead.')
  }

  async function read(raw) {
    const url = String(raw || '').trim()
    if (!url) return
    reset()
    input.value = url
    button.disabled = true
    button.textContent = 'Reading the website…'
    say('Opening ' + url + ' and its catalogue pages. This can take up to 30 seconds.', true)
    try {
      const response = await fetch('/api/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error((data.error && data.error.message) || 'That website could not be read.')
      say('Read ' + (data.host || url) + '. Checking the business profile and building three concepts.', true)
      render(data)
      say('Read ' + (data.host || url) + '. Review the facts, browse all three, then choose.', false)
      // Show the extracted facts before the concepts they inform. The profile
      // is what the owner is being asked to approve; jumping past it to the
      // cards makes the three concepts look like a template choice.
      document.getElementById('discovery').scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch (error) {
      say('', false)
      fail(error.message + ' No brief was filled in and nothing was invented. You can try another URL or use the text brief.')
    } finally {
      button.disabled = false
      button.textContent = 'Build my three concepts →'
    }
  }

  function corrections() {
    return {
      name: document.getElementById('profile-name').value.trim(),
      direction: selected,
      spec: {
        category: document.getElementById('profile-category').value.trim(),
        tagline: document.getElementById('profile-tagline').value.trim(),
        accent: document.getElementById('profile-accent').value,
      },
    }
  }

  conceptGrid.addEventListener('click', (event) => {
    const pick = event.target.closest('[data-pick]')
    if (!pick) return
    selected = pick.dataset.pick
    selectedCard = pick.closest('[data-concept]')
    conceptGrid.querySelectorAll('[data-concept]').forEach((card) =>
      card.setAttribute('aria-pressed', String(card === selectedCard))
    )
    chooseButton.disabled = false
    chooseButton.textContent = 'Open ' + (result.concepts.find((concept) => concept.id === selected) || {}).name
    chooseButton.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })

  chooseButton.addEventListener('click', async () => {
    if (!selected || !result || !result.draft || !result.draft.token) return
    chooseButton.disabled = true
    const original = chooseButton.textContent
    chooseButton.textContent = 'Opening the owner workspace…'
    try {
      const response = await fetch('/api/projects/' + result.draft.token, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corrections()),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error((data.error && data.error.message) || 'The concept could not be saved.')
      window.location.href = '/p/' + result.draft.token
    } catch (error) {
      chooseButton.disabled = false
      chooseButton.textContent = original
      fail(error.message)
    }
  })

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    read(input.value)
  })

  const initial = new URLSearchParams(window.location.search).get('url')
  if (initial) read(initial)
})()
`
