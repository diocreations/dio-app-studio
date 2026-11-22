/**
 * Stage 2 acceptance evidence: field-level provenance in the URL-first journey.
 *
 *   bun scripts/capture-stage2-provenance.mjs
 *
 * Uses the running local Worker (PLATTR_ORIGIN, default :5173) and a Chrome
 * CDP endpoint (CDP_ORIGIN, default :9223), at a 390px viewport.
 *
 * The business is the same approved live source as Stage 1. This script records
 * what the page actually shows for each field — value, source, method,
 * confidence, conflicts and whether the owner is asked — plus the catalogue's
 * own per-field evidence. It does not type any business data in.
 */
import { mkdir, writeFile } from 'node:fs/promises'

const ORIGIN = process.env.PLATTR_ORIGIN || 'http://127.0.0.1:5173'
const CDP = process.env.CDP_ORIGIN || 'http://127.0.0.1:9223'
const SOURCE = process.env.STAGE2_SOURCE || 'https://geestores.com/'
const OUT = process.env.STAGE2_OUT || 'docs/qa/stage2-provenance-2026-11-23'

await mkdir(OUT, { recursive: true })

const target = await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' }).then((response) => response.json())
const socket = new WebSocket(target.webSocketDebuggerUrl)
let sequence = 0
const pending = new Map()
const networkFailures = []

function call(method, params = {}) {
  const id = ++sequence
  socket.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.method === 'Network.loadingFailed' && !message.params?.canceled) {
    networkFailures.push({ request: message.params?.requestId, error: message.params?.errorText })
  }
  if (!message.id) return
  const entry = pending.get(message.id)
  if (!entry) return
  pending.delete(message.id)
  if (message.error) entry.reject(new Error(message.error.message))
  else entry.resolve(message.result)
})

await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }))
await call('Page.enable')
await call('Runtime.enable')
await call('Network.enable')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function evaluate(expression) {
  const answer = await call('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (answer.exceptionDetails) {
    throw new Error(answer.exceptionDetails.exception?.description || answer.exceptionDetails.text)
  }
  return answer.result?.value
}

async function waitFor(expression, label, timeout = 150000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return
    await sleep(500)
  }
  throw new Error(`Timed out waiting for ${label}`)
}

async function capture(name) {
  const shot = await call('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(`${OUT}/${name}`, Buffer.from(shot.data, 'base64'))
  return `${OUT}/${name}`
}

await call('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: true,
  screenWidth: 390,
  screenHeight: 844,
})

await call('Page.navigate', { url: `${ORIGIN}/start` })
await waitFor("document.querySelector('h1')?.textContent.includes('Your website')", 'the URL-first start page')
await call('Page.navigate', { url: `${ORIGIN}/start?url=${encodeURIComponent(SOURCE)}` })
await waitFor(
  "!document.querySelector('#discovery')?.hidden && document.querySelectorAll('[data-concept]').length === 3",
  'profile and three concepts',
)
await waitFor(
  `(() => {
    const frames = [...document.querySelectorAll('[data-concept] iframe')];
    return frames.length === 3 && frames.every((frame) => frame.contentDocument?.readyState === 'complete');
  })()`,
  'concept iframes',
  60000,
)
await sleep(1200)

// The evidence is a disclosure, so the evidence run opens it rather than
// claiming a hidden panel was shown.
const evidence = await evaluate(`(() => {
  for (const id of ['field-evidence', 'catalogue-evidence']) {
    const panel = document.getElementById(id);
    if (panel) panel.open = true;
  }
  const text = (node) => (node?.innerText || '').replace(/\\s+/g, ' ').trim();
  const rows = [...document.querySelectorAll('#field-evidence-body .evidence-row')].map((row) => text(row));
  const products = [...document.querySelectorAll('#catalogue-evidence-body .item-evidence')].map((row) => text(row));
  const itemImages = [...document.querySelectorAll('[data-concept] iframe')].map((frame) => {
    const doc = frame.contentDocument;
    if (!doc) return null;
    const images = [...doc.images];
    return {
      concept: frame.closest('[data-concept]')?.dataset.concept || '',
      images: images.length,
      missingAlt: images.filter((img) => !img.getAttribute('alt')).map((img) => ({ src: img.getAttribute('src'), ariaHidden: img.getAttribute('aria-hidden') })),
      failed: images.filter((img) => img.complete && img.naturalWidth === 0).length,
    };
  });
  return {
    rows,
    products,
    counts: text(document.getElementById('catalogue-evidence-counts')),
    questions: [...document.querySelectorAll('#questions li')].map(text),
    sourceLine: text(document.getElementById('discovery-source')),
    profileFacts: [...document.querySelectorAll('#profile-facts > div')].map(text),
    itemImages,
  };
})()`)

// Scroll the profile evidence to the top of the viewport, under the sticky nav,
// and capture the panel the owner is meant to read.
await evaluate(`(() => {
  const panel = document.getElementById('field-evidence');
  window.scrollTo({ top: panel.getBoundingClientRect().top + scrollY - 76, behavior: 'instant' });
})()`)
await sleep(300)
const profileShot = await capture('provenance-profile-390.png')

await evaluate(`(() => {
  const panel = document.getElementById('catalogue-evidence');
  window.scrollTo({ top: panel.getBoundingClientRect().top + scrollY - 76, behavior: 'instant' });
})()`)
await sleep(300)
const catalogueShot = await capture('provenance-catalogue-390.png')

// The profile itself, for before/after comparison with Stage 1.
await evaluate(`(() => {
  document.getElementById('discovery').scrollIntoView({ behavior: 'instant', block: 'start' });
})()`)
await sleep(300)
const journeyShot = await capture('provenance-journey-390.png')

const record = {
  generatedAt: new Date().toISOString(),
  source: SOURCE,
  origin: ORIGIN,
  shots: { profileShot, catalogueShot, journeyShot },
  landing: await evaluate(`({
    scrollY: Math.round(scrollY),
    discoveryTop: Math.round(document.getElementById('discovery').getBoundingClientRect().top),
    fieldEvidenceOpen: document.getElementById('field-evidence').open,
    catalogueEvidenceOpen: document.getElementById('catalogue-evidence').open,
  })`),
  evidence,
  networkFailures,
}
await writeFile(`${OUT}/provenance.json`, JSON.stringify(record, null, 1))
console.log(JSON.stringify(record, null, 1))
socket.close()
