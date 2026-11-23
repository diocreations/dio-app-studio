#!/usr/bin/env bun
/**
 * The zero-cost customer journey, driven in a real browser.
 *
 *   bun scripts/zero-cost-journey.mjs
 *
 * The shipping Worker runs in this process, over a disposable local SQLite
 * database, with one `fetch`: the business site is a fixture and both free
 * providers answer from the reviewed GeeStores design set. No key is real, no
 * provider is contacted, and nothing is deployed or written anywhere but
 * `docs/qa/zero-cost-journey-2026-11-23`.
 *
 * Everything after the read is the real page: the URL form, the profile, the
 * three concepts rendered in iframes on the real app, selection, the owner
 * workspace, editing, save, reload, approval, publication and the public
 * preview. The script only types, clicks and reads what the page shows.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Database } from 'bun:sqlite'

import app from '../src/worker/index.ts'
import {
  JEWELLERY_URL,
  briefFrom,
  crawlSpec,
  freeEnv,
  freeProviderFetch,
  sampleDesignSet,
} from '../tests/freeAiMock.ts'

const OUT = process.env.ZERO_COST_OUT ?? 'docs/qa/zero-cost-journey-2026-11-23'
const MOCKED_HOSTS = new Set(['geestores.example', 'api.groq.com', 'api.cloudflare.com'])
const TAGLINE = 'Pieces kept for a lifetime'

/**
 * A D1-shaped adapter over bun:sqlite. Unlike the test shim it does not
 * auto-publish fixtures, because this run exercises the real approval and
 * publication gates.
 */
class LocalD1 {
  #db = new Database(':memory:')

  prepare(sql) {
    const run = (params) => {
      const result = this.#db.prepare(sql).run(...params)
      return { success: true, meta: { changes: Number(result.changes) } }
    }
    const bound = (params) => ({
      __run: () => run(params),
      run: async () => run(params),
      first: async () => this.#db.prepare(sql).get(...params) ?? null,
      all: async () => ({ results: this.#db.prepare(sql).all(...params) }),
    })
    return {
      bind: (...params) => bound(params),
      __run: () => run([]),
      run: async () => run([]),
      first: async () => this.#db.prepare(sql).get() ?? null,
      all: async () => ({ results: this.#db.prepare(sql).all() }),
    }
  }

  async batch(statements) {
    this.#db.exec('BEGIN')
    try {
      const results = statements.map((statement) =>
        statement.__run ? statement.__run() : statement.run(),
      )
      this.#db.exec('COMMIT')
      return results
    } catch (error) {
      this.#db.exec('ROLLBACK')
      throw error
    }
  }
}

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ]
  const found = candidates.find((entry) => entry && existsSync(entry))
  if (!found) throw new Error('No Chrome or Chromium binary found; set CHROME_PATH.')
  return found
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      server.close(() => resolve(port))
    })
  })
}

async function waitForJson(url, timeoutMs = 20000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) return await response.json()
    } catch {
      // Chrome is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

const report = {
  startedAt: new Date().toISOString(),
  ok: false,
  origin: '',
  steps: [],
  screenshots: [],
  consoleErrors: [],
  pageExceptions: [],
  networkFailures: [],
  providerCalls: { groq: 0, cloudflare: 0, hosts: [] },
  error: null,
}

let server
let chrome
let socket

let sequence = 0
const pending = new Map()
function call(method, params = {}) {
  const id = ++sequence
  socket.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}

try {
  await mkdir(OUT, { recursive: true })
  // The browser profile is disposable scratch space, not evidence.
  const profileDir = join(tmpdir(), `plattr-zero-cost-${process.pid}`)
  await rm(profileDir, { recursive: true, force: true })

  /* 1. The real Worker, over a disposable database, with every provider mocked. */
  const realFetch = globalThis.fetch
  const { dossier } = await crawlSpec()
  const set = sampleDesignSet()
  const mock = freeProviderFetch({ brief: briefFrom(dossier), set })
  globalThis.fetch = ((input, init) => {
    const url = new URL(String(input))
    if (MOCKED_HOSTS.has(url.hostname)) return mock.fetch(input, init)
    return realFetch(input, init)
  })

  const env = freeEnv(new LocalD1())
  server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: (request) => app.fetch(request, env),
  })
  const ORIGIN = `http://127.0.0.1:${server.port}`
  report.origin = ORIGIN

  /* 2. A headless Chrome, driven only through CDP. */
  const port = await freePort()
  chrome = spawn(
    chromePath(),
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--remote-allow-origins=*',
      `--user-data-dir=${profileDir}`,
      `--remote-debugging-port=${port}`,
      '--window-size=1440,1000',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'ignore'] },
  )
  try {
    await waitForJson(`http://127.0.0.1:${port}/json/version`)
  } catch (error) {
    chrome.kill('SIGTERM')
    throw error
  }

  const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
    method: 'PUT',
  }).then((response) => response.json())
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })

  const requestUrls = new Map()
  socket.addEventListener('message', (event) => {
    let message
    try {
      message = JSON.parse(String(event.data))
    } catch {
      return
    }
    const entry = pending.get(message.id)
    if (entry) {
      pending.delete(message.id)
      if (message.error) entry.reject(new Error(message.error.message))
      else entry.resolve(message.result)
    }
    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params?.exceptionDetails
      report.pageExceptions.push({
        text: details?.exception?.description ?? details?.text ?? 'exception',
        url: details?.url ?? '',
      })
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
      report.consoleErrors.push(
        (message.params.args ?? [])
          .map((arg) => arg.value ?? arg.description ?? '')
          .join(' '),
      )
    }
    if (message.method === 'Network.requestWillBeSent') {
      requestUrls.set(message.params.requestId, message.params.request.url)
    }
    if (message.method === 'Network.loadingFailed' && !message.params?.canceled) {
      report.networkFailures.push({
        url: requestUrls.get(message.params.requestId) ?? '',
        error: message.params?.errorText ?? 'loadingFailed',
      })
    }
  })

  await call('Page.enable')
  await call('Runtime.enable')
  await call('Network.enable')
  await call('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  })

  const evaluate = async (expression) => {
    const answer = await call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    if (answer.exceptionDetails)
      throw new Error(
        answer.exceptionDetails.exception?.description ?? answer.exceptionDetails.text,
      )
    return answer.result?.value
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  async function waitFor(expression, timeoutMs = 30000, label = expression) {
    const started = Date.now()
    let last
    while (Date.now() - started < timeoutMs) {
      try {
        last = await evaluate(expression)
        if (last) return last
      } catch {
        // The page is between documents.
      }
      await sleep(120)
    }
    const where = await evaluate('location.href').catch(() => '(no page)')
    throw new Error(`Timed out waiting for ${label} at ${where}; last value ${JSON.stringify(last)}`)
  }

  async function navigate(url) {
    await call('Page.navigate', { url })
    await waitFor('document.readyState === "complete"', 30000, `load of ${url}`)
  }

  async function screenshot(name) {
    const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
    const path = join(OUT, name)
    await writeFile(path, Buffer.from(shot.data, 'base64'))
    report.screenshots.push(path)
    return path
  }

  async function viewport(width, height, mobile) {
    await call('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: mobile ? 2 : 1,
      mobile,
    })
    await sleep(250)
  }

  /* 3. URL → business profile → three concepts. */
  await navigate(`${ORIGIN}/start`)
  await waitFor('Boolean(document.getElementById("start-url"))', 20000, 'the URL form')
  await evaluate(`(() => {
    const input = document.getElementById('start-url')
    input.value = ${JSON.stringify(JEWELLERY_URL)}
    input.dispatchEvent(new Event('input', { bubbles: true }))
    document.getElementById('start-button').click()
    return true
  })()`)
  const cards = await waitFor(
    `(() => {
      const grid = document.getElementById('concept-grid')
      const cards = [...grid.querySelectorAll('[data-concept]')]
      if (document.getElementById('concepts').hidden || cards.length !== 3) return null
      if (cards.some((card) => {
        const doc = card.querySelector('iframe').contentDocument
        if (!doc || doc.readyState !== 'complete') return true
        // The app's own splash covers the first paint; wait for the screen.
        const splash = doc.querySelector('[data-splash]')
        return Boolean(splash && !splash.classList.contains('gone'))
      })) return null
      return cards.map((card) => ({
        id: card.dataset.concept,
        title: card.querySelector('header b').textContent.trim(),
        note: card.querySelector('header span').textContent.trim(),
        preview: card.querySelector('iframe').getAttribute('src'),
      }))
    })()`,
    60000,
    'the three concept cards',
  )

  const profile = await evaluate(`({
    title: document.getElementById('discovery-title').textContent.trim(),
    name: document.getElementById('profile-name').value,
    category: document.getElementById('profile-category').value,
    tagline: document.getElementById('profile-tagline').value,
    catalogue: document.getElementById('catalogue-count').textContent.trim(),
    facts: document.getElementById('discovery-source').textContent.trim(),
  })`)
  const token = new URL(`${ORIGIN}${cards[0].preview}`).pathname.split('/')[2]

  const expectedTitles = set.concepts.map((concept) => concept.name)
  const expectedIds = set.concepts.map((concept) => concept.id)
  report.steps.push({
    step: 'url-to-concepts',
    profile,
    cards,
    expectedIds,
    expectedTitles,
  })
  if (JSON.stringify(cards.map((card) => card.id)) !== JSON.stringify(expectedIds))
    throw new Error(`concept ids were ${JSON.stringify(cards.map((card) => card.id))}, expected ${JSON.stringify(expectedIds)}`)
  if (JSON.stringify(cards.map((card) => card.title)) !== JSON.stringify(expectedTitles))
    throw new Error(`concept titles were ${JSON.stringify(cards.map((card) => card.title))}, expected ${JSON.stringify(expectedTitles)}`)
  if (cards.some((card) => !card.preview.includes('?design=')))
    throw new Error(`a concept was not previewed from its own document: ${JSON.stringify(cards)}`)
  if (!profile.name || !profile.catalogue.includes('3'))
    throw new Error(`the business profile was not established: ${JSON.stringify(profile)}`)

  await screenshot('concepts-desktop.png')
  await viewport(390, 844, true)
  await screenshot('concepts-mobile.png')
  await viewport(1440, 900, false)

  /* 4. Selection: the customer keeps the second concept. */
  const chosen = cards[1]
  await evaluate(`(() => {
    const cards = [...document.querySelectorAll('#concept-grid [data-concept]')]
    cards[1].querySelector('[data-pick]').click()
    return true
  })()`)
  await waitFor('!document.getElementById("choose-button").disabled', 10000, 'the choice button')
  const chooseLabel = await evaluate('document.getElementById("choose-button").textContent.trim()')
  await evaluate('document.getElementById("choose-button").click(); true')
  await waitFor(
    `/^\\/p\\/[0-9a-f]{24}$/.test(location.pathname)`,
    30000,
    'the owner workspace after choosing',
  )
  const workspaceToken = await evaluate('location.pathname.split("/")[2]')
  if (workspaceToken !== token) throw new Error(`workspace token ${workspaceToken} !== ${token}`)
  await waitFor('Boolean(document.getElementById("edit-tagline"))', 20000, 'the workspace editor')

  // The chosen document is what the workspace previews, not the deterministic
  // build it fell back to.
  const chosenAccent = set.concepts.find((concept) => concept.id === chosen.id).palette.accent
  const selectedPreview = await evaluate(
    `fetch('/p/${token}/app').then((response) => response.text()).then((html) => ({
      ok: html.includes('--accent: ${chosenAccent}'),
      accent: '${chosenAccent}',
    }))`,
  )
  if (!selectedPreview.ok)
    throw new Error(`the workspace is not showing the chosen concept (${chosenAccent})`)
  report.steps.push({ step: 'selection', chosen: chosen.id, chooseLabel, selectedPreview })

  const versionBefore = await evaluate('document.title')

  /* 5. Editing, save, reload. */
  await evaluate(`(() => {
    const input = document.getElementById('edit-tagline')
    input.value = ${JSON.stringify(TAGLINE)}
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    document.querySelector('[data-save]').click()
    return true
  })()`)
  await waitFor(
    `document.getElementById('edit-tagline') && document.getElementById('edit-tagline').value === ${JSON.stringify(TAGLINE)} && document.title !== ${JSON.stringify(versionBefore)}`,
    40000,
    'the rebuilt version',
  )
  const versionAfter = await evaluate('document.title')
  await call('Page.reload')
  await waitFor(
    `document.getElementById('edit-tagline') && document.getElementById('edit-tagline').value === ${JSON.stringify(TAGLINE)}`,
    30000,
    'the edit after a reload',
  )
  const afterReload = await evaluate(`({
    title: document.title,
    tagline: document.getElementById('edit-tagline').value,
  })`)
  if (afterReload.title !== versionAfter)
    throw new Error(`reload returned ${afterReload.title}, expected ${versionAfter}`)
  // The chosen AI document survives the rebuild as well as the edit.
  const stillChosen = await evaluate(
    `fetch('/p/${token}/app').then((response) => response.text()).then((html) => html.includes('--accent: ${chosenAccent}'))`,
  )
  if (!stillChosen) throw new Error('the rebuild replaced the chosen AI document')
  await screenshot('workspace-desktop.png')
  report.steps.push({ step: 'edit-save-reload', versionBefore, versionAfter, afterReload, stillChosen })

  /* 6. Approval and publication, through the real controls. */
  await evaluate('document.querySelector("[data-approve]").click(); true')
  await waitFor('Boolean(document.querySelector("[data-publish]"))', 30000, 'the publish control')
  await evaluate('document.querySelector("[data-publish]").click(); true')
  await waitFor(
    `document.body.innerText.includes('Published') && !document.querySelector('[data-publish]')`,
    30000,
    'the published state',
  )
  const published = await evaluate(`(() => {
    const link = document.querySelector('#publish a[href*="/app"]')
    return { link: link ? link.href : '', text: document.getElementById('publish').innerText.trim().slice(0, 400) }
  })()`)
  report.steps.push({ step: 'approve-publish', published })

  /* 7. The public preview, with no owner cookie at all. */
  await call('Network.clearBrowserCookies')
  await navigate(`${ORIGIN}/p/${token}/app`)
  // The published app is the chosen concept's own document over the source's
  // catalogue. Its headings come from that document, so the check is the chosen
  // palette plus a product the business actually published — not the spec
  // tagline the editor changed, which belongs to the workspace.
  await waitFor(
    `(() => {
      const splash = document.querySelector('[data-splash]')
      return document.readyState === 'complete' &&
        document.body.innerText.includes('Gold band') &&
        (!splash || splash.classList.contains('gone'))
    })()`,
    30000,
    'the public preview',
  )
  await sleep(400)
  const publicView = await evaluate(`({
    title: document.title,
    text: document.body.innerText.replace(/\\s+/g, ' ').slice(0, 300),
    accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
    notPublished: document.body.innerText.includes('Not published'),
  })`)
  if (publicView.notPublished) throw new Error('the published preview still refuses an anonymous visitor')
  if (!publicView.accent.toLowerCase().includes(chosenAccent.toLowerCase()))
    throw new Error(`the published app paints ${publicView.accent}, expected ${chosenAccent}`)
  if (!publicView.text.includes('Gold band'))
    throw new Error(`the published app lost the source catalogue: ${publicView.text}`)
  await screenshot('published-desktop.png')
  await viewport(390, 844, true)
  await screenshot('published-mobile.png')
  await viewport(1440, 900, false)
  report.steps.push({ step: 'published-preview', publicView })

  /* 8. Every outbound call in the whole journey stayed inside the fixture. */
  report.providerCalls = {
    groq: mock.calls.groq,
    cloudflare: mock.calls.cloudflare,
    hosts: [...new Set(mock.calls.hosts)],
  }
  const stray = report.providerCalls.hosts.filter((host) => !MOCKED_HOSTS.has(host))
  if (stray.length) throw new Error(`unmocked hosts were contacted: ${stray.join(', ')}`)
  if (report.providerCalls.groq < 2 || report.providerCalls.cloudflare < 1)
    throw new Error(`the free providers were not exercised: ${JSON.stringify(report.providerCalls)}`)

  const localFailures = report.networkFailures.filter(
    (failure) => !failure.url || failure.url.startsWith(ORIGIN),
  )
  if (report.pageExceptions.length)
    throw new Error(`uncaught page exception: ${report.pageExceptions[0].text}`)
  if (localFailures.length)
    throw new Error(`local request failed: ${localFailures.map((failure) => failure.url).join(', ')}`)

  report.ok = true
  report.finishedAt = new Date().toISOString()
} catch (error) {
  report.error = error instanceof Error ? error.stack ?? error.message : String(error)
} finally {
  try {
    socket?.close()
  } catch {
    // Already closed.
  }
  chrome?.kill('SIGTERM')
  server?.stop(true)
  await writeFile(join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  await rm(join(tmpdir(), `plattr-zero-cost-${process.pid}`), { recursive: true, force: true })
}

console.log(JSON.stringify(report, null, 2))
process.exit(report.ok ? 0 : 1)
