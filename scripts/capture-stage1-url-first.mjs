/**
 * Stage 1 acceptance evidence: URL -> extracted profile -> three concepts.
 *
 *   bun scripts/capture-stage1-url-first.mjs
 *
 * Uses the running local Worker (PLATTR_ORIGIN, default :5173) and a Chrome
 * CDP endpoint (CDP_ORIGIN, default :9223), at a 390px viewport.
 *
 * The source site is a real business site, not a fixture. The run stores the
 * extracted facts it actually received and the three concept previews it
 * rendered; no business data is typed into this script.
 */
import { mkdir, writeFile } from 'node:fs/promises'

const ORIGIN = process.env.PLATTR_ORIGIN || 'http://127.0.0.1:5173'
const CDP = process.env.CDP_ORIGIN || 'http://127.0.0.1:9223'
const SOURCE = process.env.STAGE1_SOURCE || 'https://geestores.com/'
const OUT = process.env.STAGE1_OUT || 'docs/qa/stage1-url-first-2026-11-23'

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
    networkFailures.push({ url: message.params?.requestId, error: message.params?.errorText })
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

async function waitFor(expression, label, timeout = 120000) {
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
await sleep(350)
const before = await capture('before-390.png')

await call('Page.navigate', { url: `${ORIGIN}/start?url=${encodeURIComponent(SOURCE)}` })
await waitFor(
  "!document.querySelector('#discovery')?.hidden && document.querySelectorAll('[data-concept]').length === 3",
  'profile and three concepts',
  150000,
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

// The product requirement is to show the extracted facts before the choice.
// Read the landing position after the page's own smooth scroll has settled.
const landing = await evaluate(`(() => {
  const discovery = document.querySelector('#discovery');
  const rect = discovery.getBoundingClientRect();
  return { scrollY: Math.round(scrollY), discoveryTop: Math.round(rect.top), conceptsTop: Math.round(document.querySelector('#concepts').getBoundingClientRect().top) };
})()`)

await sleep(350)
// Capture the page at the position its own discovery transition chose. Do not
// scroll it under the sticky nav before taking the evidence shot.
const profileShot = await capture('after-profile-390.png')

const journey = await evaluate(`(() => {
  const cards = [...document.querySelectorAll('[data-concept]')];
  const profile = {
    name: document.querySelector('#profile-name')?.value || '',
    category: document.querySelector('#profile-category')?.value || '',
    tagline: document.querySelector('#profile-tagline')?.value || '',
    facts: [...document.querySelectorAll('#profile-facts div')].map((row) => row.innerText.replace(/\\n+/g, ': ')),
    sourceLine: document.querySelector('#discovery-source')?.textContent || '',
    title: document.querySelector('#discovery-title')?.textContent || '',
  };
  const concepts = cards.map((card) => {
    const frame = card.querySelector('iframe');
    const doc = frame?.contentDocument;
    const images = [...(doc?.images || [])];
    return {
      id: card.dataset.concept,
      name: card.querySelector('header b')?.textContent || '',
      note: card.querySelector('header span')?.textContent || '',
      kind: card.querySelector('p')?.textContent || '',
      preview: frame?.getAttribute('src') || '',
      iframeTitle: doc?.title || '',
      screens: doc ? doc.querySelectorAll('.screen').length : 0,
      images: images.length,
      failedImages: images.filter((img) => img.complete && img.naturalWidth === 0).length,
      imagesMissingAlt: images.filter((img) => !img.getAttribute('alt')).length,
    };
  });
  return { profile, concepts };
})()`)

const conceptShots = []
for (let index = 0; index < journey.concepts.length; index += 1) {
  await evaluate(`(() => {
    const card = document.querySelectorAll('[data-concept]')[${index}];
    window.scrollTo({ top: card.getBoundingClientRect().top + scrollY - 74, behavior: 'instant' });
  })()`)
  await sleep(300)
  conceptShots.push(await capture(`concept-${index + 1}-390.png`))
}

// Choosing is part of the URL journey: it must open the owner workspace for
// the same private draft, not create a second project.
const chosen = await evaluate(`(() => {
  const card = document.querySelector('[data-concept]');
  card?.querySelector('[data-pick]')?.click();
  const button = document.querySelector('#choose-button');
  return { pressed: card?.getAttribute('aria-pressed'), disabled: button?.disabled, label: button?.textContent };
})()`)
await evaluate("document.querySelector('#choose-button')?.click()")
await waitFor("location.pathname.startsWith('/p/')", 'owner workspace after choosing', 60000)
await sleep(900)
const workspace = await evaluate(`({ path: location.pathname, title: document.title, h1: document.querySelector('h1')?.textContent || '' })`)
const chosenShot = await capture('chosen-workspace-390.png')

await writeFile(
  `${OUT}/journey.json`,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: SOURCE,
      origin: ORIGIN,
      before,
      profileShot,
      conceptShots,
      chosenShot,
      landing,
      journey,
      chosen,
      workspace,
      networkFailures,
    },
    null,
    2,
  ),
)

socket.close()
await fetch(`${CDP}/json/close/${target.id}`)
console.log(JSON.stringify({ before, profileShot, conceptShots, chosenShot, landing, profile: journey.profile, concepts: journey.concepts, chosen, workspace, failures: networkFailures.length }, null, 2))
