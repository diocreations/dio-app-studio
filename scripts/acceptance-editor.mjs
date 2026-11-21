/**
 * Editor acceptance, driven in the real editor.
 *
 *   bun scripts/acceptance-editor.mjs
 *
 * One concept per trade. Each build is exercised through the editor's own
 * controls, then restored to the document and catalogue it started with.
 * Nothing is deployed.
 */
import { readFile, writeFile } from 'node:fs/promises'

const CDP = 'http://127.0.0.1:9223'
const ORIGIN = 'http://127.0.0.1:5173'
const OUT = 'docs/qa/acceptance-2026-11-21'
const apps = JSON.parse(await readFile('.chrome-qa/acceptance-apps.json', 'utf8'))
const FIXTURE = {
  shop: 'docs/qa/live-verification-2026-11-20-final/present-and-correct/spec.json',
  restaurant: 'docs/qa/trade-audit-2026-11-20/machine/restaurant.spec.json',
  hotel: 'docs/qa/trade-audit-2026-11-20/machine/hotel.spec.json',
  salon: 'docs/qa/trade-audit-2026-11-20/machine/salon.spec.json',
  professional: 'docs/qa/trade-audit-2026-11-20/machine/professional.spec.json',
}
const only = process.env.ONLY_TRADE
const chosen = [
  ['shop', 'editorial'],
  ['restaurant', 'luxe'],
  ['hotel', 'luxe'],
  ['salon', 'luxe'],
  ['professional', 'classic'],
].map(([trade, direction]) => apps.find((app) => app.trade === trade && app.direction === direction)).filter((app) => !only || app.trade === only)

const target = await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json())
const socket = new WebSocket(target.webSocketDebuggerUrl)
let sequence = 0
const pending = new Map()
const call = (method, params = {}) => {
  const id = ++sequence
  socket.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.method === 'Page.javascriptDialogOpening') call('Page.handleJavaScriptDialog', { accept: true })
  const entry = pending.get(message.id)
  if (!entry) return
  pending.delete(message.id)
  if (message.error) entry.reject(new Error(message.error.message))
  else entry.resolve(message.result)
})
await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }))
await call('Page.enable')
await call('Runtime.enable')
await call('DOM.enable')
await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })

const headers = (cookie) => ({ cookie, origin: ORIGIN, 'content-type': 'application/json' })
async function docOf(app) {
  return fetch(`${ORIGIN}/api/projects/${app.token}/doc`, { headers: { cookie: app.cookie } }).then((r) => r.json())
}
async function catalogOf(app) {
  const spec = JSON.parse(await readFile(FIXTURE[app.trade], 'utf8'))
  return { menu: spec.menu, offers: spec.offers ?? [] }
}

/** Run the editor UI checks for one build. */
async function exercise(app) {
  const baseline = await docOf(app)
  const catalog = await catalogOf(app)
  const [cookieName, cookieValue] = app.cookie.split(';')[0].split('=')
  await call('Network.setCookie', { name: cookieName, value: cookieValue, domain: '127.0.0.1', path: '/', httpOnly: true })
  await call('Page.navigate', { url: `${ORIGIN}/p/${app.token}/edit` })
  await new Promise((resolve) => setTimeout(resolve, 2200))

  const result = await call('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const TOKEN = ${JSON.stringify(app.token)}
      const wait = (fn, ms = 9000) => new Promise((resolve, reject) => {
        const started = Date.now()
        const timer = setInterval(() => {
          let value = false
          try { value = fn() } catch (error) {}
          if (value) { clearInterval(timer); resolve(value) }
          else if (Date.now() - started > ms) { clearInterval(timer); reject(new Error('timeout ' + fn.toString().slice(0, 70))) }
        }, 100)
      })
      const doc = () => fetch('/api/projects/' + TOKEN + '/doc').then((r) => r.json()).then((p) => p.doc)
      const home = (payload) => payload.screens.find((screen) => screen.kind === 'home')
      const log = []
      let pass = 0
      let fail = 0
      const check = (name, ok, detail) => { if (ok) pass += 1; else fail += 1; log.push((ok ? 'PASS ' : 'FAIL ') + name + (detail === undefined ? '' : ' — ' + detail)) }

      await wait(() => document.querySelectorAll('#structure .node').length > 1)
      const frame = document.querySelector('#frame')
      await wait(() => frame && frame.contentDocument && frame.contentDocument.querySelector('[data-sec]'))

      // Element editing through the live preview.
      frame.contentDocument.querySelectorAll('[data-sec]')[1].click()
      await wait(() => document.querySelector('#pTitle'))
      const original = document.querySelector('#pTitle').value
      const edited = original + ' · ED'
      const input = document.querySelector('#pTitle')
      input.value = edited
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await wait(() => document.querySelector('#saveStatus') && /saved/i.test(document.querySelector('#saveStatus').textContent), 8000)
      await new Promise((r) => setTimeout(r, 800))
      let current = await doc()
      check('element edit autosaves', home(current).sections[1].title === edited)
      const published = await fetch('/p/' + TOKEN + '/app').then((r) => r.text())
      check('edit reaches the customer app', published.includes(edited))

      document.querySelector('#undo').click()
      await new Promise((r) => setTimeout(r, 1300))
      current = await doc()
      check('undo restores the original words', home(current).sections[1].title === original)
      document.querySelector('#redo').click()
      await new Promise((r) => setTimeout(r, 1300))
      current = await doc()
      check('redo reapplies the edit', home(current).sections[1].title === edited)
      document.querySelector('#undo').click()
      await new Promise((r) => setTimeout(r, 1200))

      // Library add, then undo.
      const before = home(current).sections.length
      const tile = document.querySelector('[data-add-component="text"]')
      if (tile) { tile.click(); await new Promise((r) => setTimeout(r, 1100)) }
      current = await doc()
      check('component can be added', home(current).sections.length === before + 1)
      document.querySelector('#undo').click()
      await new Promise((r) => setTimeout(r, 1200))
      current = await doc()
      check('undo removes the added component', home(current).sections.length === before)

      // Hide and unhide.
      const hideNode = [...document.querySelectorAll('#structure .node')][1]
      const hideId = hideNode.dataset.node
      hideNode.querySelector('[data-hide]').click()
      await new Promise((r) => setTimeout(r, 1300))
      current = await doc()
      check('hide persists', home(current).sections.find((s) => s.id === hideId).hidden === true)
      const hiddenApp = await fetch('/p/' + TOKEN + '/app').then((r) => r.text())
      check('hidden component leaves the customer app', !hiddenApp.includes('data-sec="' + hideId + '"'))
      document.querySelector('#undo').click()
      await new Promise((r) => setTimeout(r, 1200))
      current = await doc()
      check('undo unhides', !home(current).sections.find((s) => s.id === hideId).hidden)

      // A new screen joins navigation, and deleting it removes the tab.
      let screensBefore = current.screens.length
      const addable = [...document.querySelectorAll('[data-add-screen]')].find((node) => !node.disabled)
      if (addable) addable.click()
      try {
        await wait(() => true, 100)
        const started = Date.now()
        while (Date.now() - started < 7000) {
          current = await doc()
          if (current.screens.length === screensBefore + 1) break
          await new Promise((r) => setTimeout(r, 250))
        }
      } catch (error) {}
      check('screen can be added', current.screens.length === screensBefore + 1)
      const added = current.screens.length === screensBefore + 1 ? current.screens[current.screens.length - 1] : null
      const withScreen = await fetch('/p/' + TOKEN + '/app').then((r) => r.text())
      if (added) check('new screen never exceeds the five-tab bar', added.nav ? withScreen.includes('data-go="' + added.id + '"') : true, added.id + ' nav=' + added.nav)
      const del = document.querySelector('[data-screen-delete="' + (added ? added.id : '') + '"]')
      if (del) { del.click(); await new Promise((r) => setTimeout(r, 1600)) }
      current = await doc()
      check('screen can be deleted', current.screens.length === screensBefore)

      // Duplicate a screen through its inspector, then remove the copy.
      const catalogScreen = current.screens.find((s) => s.kind === 'catalog') || current.screens[1]
      const catalogOpener = catalogScreen && document.querySelector('#screens [data-open="' + catalogScreen.id + '"]')
      if (catalogOpener) catalogOpener.click()
      await wait(() => document.querySelector('#sDuplicate'), 6000)
      const idsBefore = new Set(current.screens.map((s) => s.id))
      document.querySelector('#sDuplicate').click()
      let duplicated = null
      for (let attempt = 0; attempt < 24 && !duplicated; attempt += 1) {
        await new Promise((r) => setTimeout(r, 250))
        current = await doc()
        duplicated = current.screens.find((s) => !idsBefore.has(s.id)) || null
      }
      check('screen can be duplicated', Boolean(duplicated) && duplicated.kind === 'custom')
      if (duplicated) {
        await wait(() => document.querySelector('#sDelete'), 4000)
        document.querySelector('#sDelete').click()
        await new Promise((r) => setTimeout(r, 1500))
        current = await doc()
        check('duplicated screen can be removed', !current.screens.some((s) => s.id === duplicated.id))
      }

      // Navigation change: turn a tab off, see it leave the bar, undo it.
      const tabScreen = current.screens.find((s) => s.kind === 'catalog')
      const openTab = tabScreen && document.querySelector('#screens [data-open="' + tabScreen.id + '"]')
      if (openTab) {
        openTab.click()
        await wait(() => document.querySelector('#sNav'))
        const toggle = document.querySelector('#sNav')
        const was = toggle.checked
        toggle.checked = !was
        toggle.dispatchEvent(new Event('change', { bubbles: true }))
        await new Promise((r) => setTimeout(r, 1400))
        current = await doc()
        const changed = current.screens.find((s) => s.id === tabScreen.id)
        check('navigation can be changed', changed.nav === !was)
        document.querySelector('#undo').click()
        await new Promise((r) => setTimeout(r, 1200))
        current = await doc()
        check('undo restores the tab', current.screens.find((s) => s.id === tabScreen.id).nav === was)
      }

      // Reusable component: save one, insert it elsewhere, edit it once, apply
      // to all linked instances.
      const otherScreen = current.screens.find((s) => s.kind === 'catalog') || current.screens.find((s) => s.kind === 'custom')
      const sourceNode = [...document.querySelectorAll('#structure .node')][1]
      if (sourceNode && otherScreen) {
        sourceNode.querySelector('[data-select]').click()
        await wait(() => document.querySelector('#pComponentSave'))
        document.querySelector('#pComponentSave').click()
        let cmpId = null
        for (let attempt = 0; attempt < 28 && !cmpId; attempt += 1) {
          await new Promise((r) => setTimeout(r, 250))
          current = await doc()
          cmpId = (current.library || [])[0]?.id || null
        }
        check('section saved as a reusable component', Boolean(cmpId), cmpId || 'none')
        if (cmpId) {
          const opener = document.querySelector('[data-open="' + otherScreen.id + '"]')
          if (opener) { opener.click(); await new Promise((r) => setTimeout(r, 900)) }
          const insert = document.querySelector('[data-insert-component="' + cmpId + '"]')
          if (insert) { insert.click(); await new Promise((r) => setTimeout(r, 1600)) }
          current = await doc()
          const target = current.screens.find((s) => s.id === otherScreen.id)
          const linked = target ? target.sections.filter((s) => s.componentId === cmpId) : []
          check('reusable component inserts as a linked copy', linked.length === 1)
          if (linked.length) {
            const node = document.querySelector('#structure [data-node="' + linked[0].id + '"] [data-select]')
            if (node) node.click()
            await wait(() => document.querySelector('#pTitle'))
            const title = document.querySelector('#pTitle')
            const shared = (title.value || 'Component') + ' · shared'
            title.value = shared
            title.dispatchEvent(new Event('input', { bubbles: true }))
            await new Promise((r) => setTimeout(r, 1400))
            const apply = document.querySelector('#pComponentAll')
            if (apply) apply.click()
            await new Promise((r) => setTimeout(r, 1600))
            current = await doc()
            const instances = current.screens.flatMap((s) => s.sections.filter((section) => section.componentId === cmpId))
            check('one edit updates every linked instance', instances.length > 1 && instances.every((section) => section.title === shared), instances.length + ' linked')
          }
        }
      }

      return { log, pass, fail, edited }
    })()`,
  })

  // Reload the editor and confirm the saved document is what it reads.
  await call('Page.navigate', { url: `${ORIGIN}/p/${app.token}/edit` })
  await new Promise((resolve) => setTimeout(resolve, 2200))
  const reloaded = await call('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const wait = (fn, ms = 8000) => new Promise((resolve, reject) => {
        const started = Date.now(); const timer = setInterval(() => {
          let value = false; try { value = fn() } catch (error) {}
          if (value) { clearInterval(timer); resolve(value) }
          else if (Date.now() - started > ms) { clearInterval(timer); reject(new Error('timeout')) }
        }, 100)
      })
      await wait(() => document.querySelectorAll('#structure .node').length > 1)
      return { nodes: document.querySelectorAll('#structure .node').length, saved: document.querySelector('#saveStatus')?.textContent }
    })()`,
  })

  // Catalogue editing and restoration.
  await call('Page.navigate', { url: `${ORIGIN}/p/${app.token}/edit` })
  await new Promise((resolve) => setTimeout(resolve, 2200))
  const catalogue = await call('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const TOKEN = ${JSON.stringify(app.token)}
      const wait = (fn, ms = 9000) => new Promise((resolve, reject) => {
        const started = Date.now(); const timer = setInterval(() => {
          let value = false; try { value = fn() } catch (error) {}
          if (value) { clearInterval(timer); resolve(value) }
          else if (Date.now() - started > ms) { clearInterval(timer); reject(new Error('timeout ' + fn.toString().slice(0, 60))) }
        }, 100)
      })
      const log = []; let pass = 0; let fail = 0
      const check = (name, ok, detail) => { if (ok) pass += 1; else fail += 1; log.push((ok ? 'PASS ' : 'FAIL ') + name + (detail === undefined ? '' : ' — ' + detail)) }
      document.querySelector('#catalogBtn').click()
      await wait(() => document.querySelector('[data-cat-field][data-field="price"]'))
      const price = document.querySelector('[data-cat-field][data-field="price"]')
      const oldPrice = price.value
      price.value = '12.34'
      price.dispatchEvent(new Event('input', { bubbles: true }))
      document.querySelector('#catalogSave').click()
      let app = ''
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await new Promise((r) => setTimeout(r, 400))
        app = await fetch('/p/' + TOKEN + '/app').then((r) => r.text())
        if (app.includes('12.34')) break
      }
      check('catalogue price edit reaches the app', ['£','$','€'].some((symbol) => app.includes(symbol + '12.34')), oldPrice + ' -> 12.34')

      // Variants, where the saved catalogue has them.
      const options = [...document.querySelectorAll('[data-cat-options]')].find((node) => parseInt(node.textContent.replace(/[^0-9]/g, ''), 10) > 0)
      if (options) {
        options.click()
        await wait(() => document.querySelector('[data-variant-panel] [data-variant-field="price"]'))
        const variantPrice = document.querySelector('[data-variant-field="price"]')
        const oldVariant = variantPrice.value
        variantPrice.value = '19.99'
        variantPrice.dispatchEvent(new Event('input', { bubbles: true }))
        const live = document.querySelector('[data-variant-panel] [data-variant-available]')
        if (live) { live.checked = false; live.dispatchEvent(new Event('change', { bubbles: true })) }
        document.querySelector('#catalogSave').click()
        let after = ''
        for (let attempt = 0; attempt < 20; attempt += 1) {
          await new Promise((r) => setTimeout(r, 400))
          after = await fetch('/p/' + TOKEN + '/app').then((r) => r.text())
          if (after.includes('19.99') && after.includes('Unavailable')) break
        }
        // A sold-out option renders "Unavailable" instead of its price, so the
        // saved pennies are what proves the price reached the customer app.
        check('variant price edit reaches the app', after.includes('"price":1999'), oldVariant + ' -> 19.99')
        check('sold-out option reaches the app', after.includes('Unavailable'))
      } else {
        log.push('SKIP variants — this saved catalogue has no option variants')
      }
      return { log, pass, fail }
    })()`,
  })

  // Image replacement, proved once through the real file picker: a section
  // photo is replaced by an upload, the customer app shows the new image, and
  // undo puts the original back.
  let image = null
  if (app.trade === 'shop') {
    const opened = await call('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
        const home = document.querySelector('#screens [data-open="scr_home"]')
        if (home) { home.click(); await sleep(800) }
        // Replace a real Image component: a flagship home section may not use
        // its media slot for every variant, so the test creates the image block
        // the editor offers for exactly this purpose.
        const screenNow = () => state.doc.screens.find((s) => s.id === state.screen)
        let imageNode = [...document.querySelectorAll('#structure .node')].find((entry) => {
          const section = screenNow().sections.find((n) => n.id === entry.dataset.node)
          return section && section.kind === 'image'
        })
        if (!imageNode) {
          const tile = document.querySelector('[data-add-component="image"]')
          if (tile) { tile.click(); await sleep(1000) }
          imageNode = [...document.querySelectorAll('#structure .node')].find((entry) => {
            const section = screenNow().sections.find((n) => n.id === entry.dataset.node)
            return section && section.kind === 'image'
          })
        }
        if (imageNode) imageNode.querySelector('[data-select]').click()
        await sleep(250)
        const pick = document.querySelector('#pPick')
        if (pick) {
          pick.click()
          const started = Date.now()
          while (!document.querySelector('#mediaFile') && Date.now() - started < 6000) await sleep(100)
          const selectedNode = screenNow().sections.find((n) => n.id === state.selected) || {}
          return { section: state.selected, kind: selectedNode.kind, before: selectedNode.media?.id || null, dialog: !!document.querySelector('#mediaFile') }
        }
        return { section: null, before: null, dialog: false }
      })()`,
    })
    const info = opened.result?.value
    if (info?.dialog && info.section) {
      const root = await call('DOM.getDocument', { depth: -1 })
      const input = await call('DOM.querySelector', { nodeId: root.root.nodeId, selector: '#mediaFile' })
      await call('DOM.setFileInputFiles', {
        nodeId: input.nodeId,
        files: [`${process.cwd()}/public/og.png`],
      })
      const replaced = await call('Runtime.evaluate', {
        awaitPromise: true,
        returnByValue: true,
        expression: `(async () => {
          const TOKEN = ${JSON.stringify(app.token)}
          const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
          const started = Date.now()
          let media = null
          while (Date.now() - started < 20000) {
            const payload = await fetch('/api/projects/' + TOKEN + '/doc').then((r) => r.json())
            const screen = payload.doc.screens.find((s) => s.id === 'scr_home')
            const node = screen && screen.sections.find((s) => s.id === ${JSON.stringify(info.section)})
            media = node && node.media && node.media.id
            if (media && media !== ${JSON.stringify(info.before)}) break
            await sleep(300)
          }
          // The preview reloads its iframe after the document saves; poll it
          // rather than reading a frame that has not swapped in the new image.
          let previewHas = false
          const previewStarted = Date.now()
          while (media && Date.now() - previewStarted < 10000) {
            const previewFrame = document.querySelector('#frame').contentDocument
            if (previewFrame && previewFrame.documentElement.innerHTML.includes('/media/' + media + '/')) {
              previewHas = true
              break
            }
            await sleep(250)
          }
          const appFrame = document.createElement('iframe')
          appFrame.style.cssText = 'position:absolute;left:-9999px;width:390px;height:844px'
          appFrame.src = '/p/' + TOKEN + '/app'
          document.body.appendChild(appFrame)
          await new Promise((resolve) => appFrame.addEventListener('load', resolve, { once: true }))
          await sleep(1200)
          const appHas = appFrame.contentDocument.documentElement.innerHTML.includes('/media/' + media + '/')
          appFrame.remove()
          return { media, previewHas, appHas }
        })()`,
      })
      const stateOut = replaced.result?.value || {}
      image = { kind: info.kind, before: info.before, after: stateOut.media || null, preview: Boolean(stateOut.previewHas), app: Boolean(stateOut.appHas) }
      const undone = await call('Runtime.evaluate', {
        awaitPromise: true,
        returnByValue: true,
        expression: `(async () => {
          document.querySelector('#undo').click()
          await new Promise((r) => setTimeout(r, 1500))
          const TOKEN = ${JSON.stringify(app.token)}
          const payload = await fetch('/api/projects/' + TOKEN + '/doc').then((r) => r.json())
          const screen = payload.doc.screens.find((s) => s.id === 'scr_home')
          const node = screen && screen.sections.find((s) => s.id === ${JSON.stringify(info.section)})
          return { restored: ((node && node.media && node.media.id) || null) === ${JSON.stringify(info.before)} }
        })()`,
      })
      image.undo = Boolean(undone.result?.value?.restored)
      if (image.after) await fetch(`${ORIGIN}/api/projects/${app.token}/media/${image.after}`, { method: 'DELETE', headers: { cookie: app.cookie, origin: ORIGIN } })
    } else {
      image = { error: 'no image section with a photo picker' }
    }
  }

  // Photograph-panel honesty: a flagship section that paints catalogue photos
  // must not offer an editable section image, and one that paints its own
  // media must still offer the picker.
  const CATALOGUE_VARIANT = {
    shop: 'shop-products',
    restaurant: 'dine-feature',
    hotel: 'hotel-cover',
    salon: 'salon-services',
    professional: null,
  }[app.trade]
  const sectionMediaAnswer = await call('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
      const home = document.querySelector('#screens [data-open="scr_home"]')
      if (home) { home.click(); await sleep(700) }
      const screenNow = () => state.doc.screens.find((s) => s.id === state.screen)
      const nodes = () => [...document.querySelectorAll('#structure .node')]
      const findNode = (predicate) => nodes().find((entry) => {
        const section = screenNow().sections.find((n) => n.id === entry.dataset.node)
        return section && predicate(section)
      })
      const out = { catalogue: null, own: null }
      const variant = ${JSON.stringify(CATALOGUE_VARIANT)}
      if (variant) {
        const node = findNode((section) => section.kind === 'flagship' && section.variant === variant)
        if (node) {
          node.querySelector('[data-select]').click()
          await sleep(350)
          const hint = document.querySelector('#pCataloguePhotos')
          out.catalogue = {
            variant,
            hasSectionPicker: Boolean(document.querySelector('#pPick')),
            hasCatalogueHint: Boolean(hint),
            hintText: hint ? hint.parentElement.innerText.replace(/\s+/g, ' ').trim() : '',
          }
          if (hint) {
            hint.click()
            await sleep(350)
            out.catalogue.openedCatalogue = document.querySelector('#catalogModal')?.hidden === false
            document.querySelector('#catalogClose')?.click()
            await sleep(200)
          }
        }
      }
      let ownNode = findNode((section) => section.kind === 'image')
      if (!ownNode) {
        const tile = document.querySelector('[data-add-component="image"]')
        if (tile) { tile.click(); await sleep(900) }
        ownNode = findNode((section) => section.kind === 'image')
      }
      if (ownNode) {
        ownNode.querySelector('[data-select]').click()
        await sleep(300)
        out.own = { kind: 'image', hasSectionPicker: Boolean(document.querySelector('#pPick')) }
      }
      return out
    })()`,
  })
  const sectionMedia = sectionMediaAnswer.result?.value ?? null
  const sectionMediaError = sectionMediaAnswer?.exceptionDetails
    ? sectionMediaAnswer.exceptionDetails.exception?.description ?? sectionMediaAnswer.exceptionDetails.text
    : null

  // Restore both surfaces.
  await fetch(`${ORIGIN}/api/projects/${app.token}/doc`, {
    method: 'PUT',
    headers: headers(app.cookie),
    body: JSON.stringify({ doc: baseline.doc }),
  })
  await fetch(`${ORIGIN}/api/projects/${app.token}/catalog`, {
    method: 'PUT',
    headers: headers(app.cookie),
    body: JSON.stringify({ menu: catalog.menu, offers: catalog.offers }),
  })

  const pageError = (answer) =>
    answer?.exceptionDetails
      ? answer.exceptionDetails.exception?.description ?? answer.exceptionDetails.text
      : null
  return {
    trade: app.trade,
    direction: app.direction,
    token: app.token,
    checks: result.result?.value ?? null,
    checksError: pageError(result),
    reload: reloaded.result?.value ?? null,
    reloadError: pageError(reloaded),
    catalogue: catalogue.result?.value ?? null,
    catalogueError: pageError(catalogue),
    image,
    sectionMedia,
    sectionMediaError,
  }
}

const report = []
for (const app of chosen) {
  try {
    const entry = await exercise(app)
    report.push(entry)
    const pass = (entry.checks?.pass ?? 0) + (entry.catalogue?.pass ?? 0)
    const fail = (entry.checks?.fail ?? 0) + (entry.catalogue?.fail ?? 0)
    console.log(`${app.trade}/${app.direction}: ${pass} pass, ${fail} fail`)
    for (const line of [...(entry.checks?.log ?? []), ...(entry.catalogue?.log ?? [])]) console.log('  ' + line)
    if (entry.image) console.log('  IMAGE ' + JSON.stringify(entry.image))
    if (entry.sectionMedia || entry.sectionMediaError) console.log('  SECTION MEDIA ' + JSON.stringify(entry.sectionMedia ?? entry.sectionMediaError))
  } catch (error) {
    report.push({ trade: app.trade, direction: app.direction, error: error.message })
    console.log(`${app.trade}/${app.direction}: ERROR ${error.message}`)
  }
}

let merged = report
if (only) {
  try {
    const previous = JSON.parse(await readFile(`${OUT}/editor-report.json`, 'utf8'))
    merged = previous.report.map((entry) => report.find((fresh) => fresh.trade === entry.trade) || entry)
  } catch (error) {}
}
await writeFile(`${OUT}/editor-report.json`, JSON.stringify({ generatedAt: new Date().toISOString(), report: merged }, null, 2))
socket.close()
await fetch(`${CDP}/json/close/${target.id}`).catch(() => {})
