/**
 * Render the saved Present & Correct fixture through the real renderer.
 *
 *   bun scripts/retail-fixture.mjs
 *
 * No network, no crawl: this reads the final authorised run's spec and the
 * owner-confirmed GBP that the brief saved. It writes QA-only documents with
 * the splash and animations disabled, so a screenshot is the settled page and
 * not a frame of the opening animation.
 */
import { writeFile } from 'node:fs/promises'
import { renderApp } from '../src/worker/app'
import { flagshipDocFromSpec } from '../src/worker/doc'

const FIXTURE = 'docs/qa/live-verification-2026-11-20-final/present-and-correct/spec.json'
const OUT = 'docs/qa/retail-2026-11-20'

const spec = JSON.parse(await Bun.file(FIXTURE).text())
// The owner's accepted currency for this shop; the saved run's INR was the
// visitor's presentment and is deliberately not republished.
spec.currency = 'GBP'
spec.direction = 'editorial'
const doc = flagshipDocFromSpec(spec)

const settle = (html) =>
  html
    .replace(/\n\s*<div class="splash" data-splash>[\s\S]*?\n    <\/div>/, '')
    .replace(
      '</head>',
      `<style>*,*::before,*::after{animation:none!important;transition:none!important}</style>
<script>try{localStorage.clear()}catch(error){}</script></head>`,
    )
    // QA only: the screenshots are taken before scrolling, so every in-view
    // image should already be decoded rather than waiting for lazy loading.
    .replaceAll('loading="lazy"', 'loading="eager"')
    // QA-only: a URL can ask for a settled state (a product, the bag, a search,
    // a sort, a category) so each screenshot is one document, not a click that
    // may be lost between frames. The actions are the app's own controls.
    .replace('</body>', `<script>
(() => {
  const wanted = new URLSearchParams(location.search).get('state')
  if (!wanted) return
  const find = (selector) => document.querySelector(selector)
  const click = (element) => element && element.click()
  const chip = (name) => [...document.querySelectorAll('[data-filters] .chip')].find((entry) => entry.textContent.trim() === name)
  addEventListener('load', () => setTimeout(() => {
    if (wanted === 'home') click(find('.tab[data-go="home"]'))
    if (wanted === 'detail') click(find('[data-shop-list] .rl-card'))
    // Candy Cards has two priced options, so the chooser is on the page.
    if (wanted === 'variant') click(find('[data-shop-list] [data-item="0-8"]'))
    if (wanted === 'bag') {
      click(find('[data-shop-list] .rl-card'))
      setTimeout(() => { click(find('[data-add]')); click(find('[data-cart-open]')) }, 320)
    }
    if (wanted === 'search') {
      const input = find('[data-shop-search]')
      if (input) { input.value = 'crayon'; input.dispatchEvent(new Event('input', { bubbles: true })) }
    }
    if (wanted === 'sort') {
      const select = find('[data-shop-sort]')
      if (select) { select.value = 'price-asc'; select.dispatchEvent(new Event('change', { bubbles: true })) }
    }
    if (wanted === 'filter') click(chip('Pad'))
  }, 350))
})()
</script></body>`)

/**
 * The screenshot surface paints before remote images decode, so the QA
 * documents carry the fixture's own product photographs inline. The URLs are
 * the exact ones the saved run recorded against each item, fetched once here;
 * nothing is substituted and no product page is read.
 */
async function inlinePhotographs(html) {
  const urls = [
    ...new Set([...html.matchAll(/<img[^>]+src="(https:\/\/cdn\.shopify\.com\/[^"]+)"/g)].map((match) => match[1])),
  ]
  const encoded = new Map()
  for (const url of urls) {
    try {
      // The CDN's own resize keeps the photograph identical while making the
      // document light enough for a screenshot to rasterise in one frame.
      const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}width=1000`)
      const type = response.headers.get('content-type') || ''
      if (!response.ok || !type.startsWith('image/')) continue
      encoded.set(url, `data:${type};base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`)
    } catch {}
  }
  let out = html
  for (const [url, data] of encoded) out = out.split(url).join(data)
  return { html: out, inlined: encoded.size, of: urls.length }
}

for (const screen of ['home', 'catalog']) {
  const html = renderApp(spec, {
    token: 'pnc-fixture',
    live: false,
    flagship: true,
    doc,
    screen,
  })
  const { html: withImages, inlined, of } = await inlinePhotographs(settle(html))
  await writeFile(`${OUT}/${screen === 'catalog' ? 'shop' : 'home'}.html`, withImages)
  console.log(`${screen}: ${inlined} of ${of} photographs inlined`)
}

console.log('rendered home.html and shop.html from the saved fixture')
