import type { Activity, Note, Project } from '../db'
import { BUNDLES, FEATURES, FEATURE_LABEL, money, PLATFORMS, usd } from '../pricing'
import { verticalFor } from '../verticals'
import { esc, page } from './shell'

const STATUS_COPY: Record<Project['status'], { label: string; pill: string; line: string }> = {
  in_review: {
    label: 'Ready for review',
    pill: 'amber',
    line: 'Send this link to the owner. They can try the app, edit it, or leave a note. Nothing ships until they approve.',
  },
  changes_requested: {
    label: 'Changes requested',
    pill: 'accent',
    line: 'There is an open request on this build. Apply the edits below, or answer the note, then ask them to approve the next version.',
  },
  approved: {
    label: 'Approved · v{version}',
    pill: 'green',
    line: 'Signed off and locked. The downloads below are generated from exactly this version.',
  },
}

function statusPill(project: Project): string {
  const copy = STATUS_COPY[project.status]
  return `<span class="pill ${copy.pill}"><span class="dot"></span>${esc(copy.label.replace('{version}', String(project.version)))}</span>`
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function menuEditor(project: Project): string {
  return project.spec.menu
    .map(
      (section) => `
      <div class="section-card" data-section style="border:1px solid var(--line);border-radius:13px;padding:12px;margin-bottom:10px;background:#fffdf9">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
          <input data-section-name value="${esc(section.name)}" maxlength="40" aria-label="Section name" style="font-weight:650" />
          <button type="button" class="btn small ghost" data-remove-section aria-label="Remove section">Remove</button>
        </div>
        <div data-items style="display:grid;gap:7px">
          ${section.items
            .map(
              (item) => `
            <div class="item-row" data-item style="display:grid;grid-template-columns:1.3fr .6fr .8fr 1.4fr 28px;gap:6px;align-items:center">
              <input data-item-name value="${esc(item.name)}" maxlength="60" aria-label="Item name" />
              <input data-item-price value="${(item.price / 100).toFixed(2)}" inputmode="decimal" aria-label="Price" />
              <input data-item-meta value="${esc(item.meta ?? '')}" maxlength="30" aria-label="Note" placeholder="45 min" />
              <input data-item-desc value="${esc(item.desc)}" maxlength="90" aria-label="Description" placeholder="Description" />
              <button type="button" class="btn small ghost" data-remove-item aria-label="Remove item" style="padding:6px 8px">×</button>
            </div>`,
            )
            .join('')}
        </div>
        <button type="button" class="btn small ghost" data-add-item style="margin-top:8px">+ Item</button>
      </div>`,
    )
    .join('')
}

export function workspacePage(options: {
  project: Project
  notes: Note[]
  activity: Activity[]
  origin: string
}): string {
  const { project, notes, activity, origin } = options
  const approved = project.status === 'approved'
  const quote = project.quote
  const bundle = BUNDLES.find((entry) => entry.id === project.spec.bundle)
  const featureChips = project.features
    .map((id) => `<span class="pill">${esc(FEATURE_LABEL[id])}</span>`)
    .join('')
  const platformNames = project.platforms
    .map((id) => PLATFORMS.find((platform) => platform.id === id)?.label ?? id)
    .join(' · ')

  const body = `
  <div class="wrap" style="padding:26px 0 0">
    <a href="/studio" class="tiny" style="text-decoration:none">&larr; Studio</a>
    <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-top:10px">
      <div>
        <h1 class="display" style="font-size:clamp(30px,4vw,42px)">${esc(project.name)}</h1>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:8px">
          ${statusPill(project)}
          <span class="pill accent">${esc(project.spec.category || verticalFor(project.vertical).label)}</span>
          ${
            project.spec.category
              ? `<span class="pill">${esc(verticalFor(project.vertical).label)} shape</span>`
              : ''
          }
          <span class="pill">Build v${project.version}</span>
          ${
            project.spec.website
              ? `<a class="pill" href="${esc(project.spec.website)}" target="_blank" rel="noopener">Read from their site &#8599;</a>`
              : ''
          }
          <span class="pill">${esc(platformNames)}</span>
          <span class="tiny">${esc(project.contact || 'No contact yet')}${project.email ? ` · ${esc(project.email)}` : ''}</span>
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <button class="btn small ghost" type="button" data-copy="${origin}/p/${project.token}">Copy review link</button>
        <a class="btn small primary" href="/p/${project.token}/edit">Customise my app</a>
        <a class="btn small ghost" href="/p/${project.token}/app" target="_blank" rel="noreferrer">Preview application &#8599;</a>
      </div>
    </div>
  </div>

  <div class="wrap" style="padding:22px 0 50px">
    <div style="display:grid;grid-template-columns:372px minmax(0,1fr);gap:26px;align-items:start" class="workspace">
      <div class="phone-sticky">
        <div class="phone">
          <iframe title="${esc(project.name)} app preview" src="/p/${project.token}/app"></iframe>
        </div>
        <p class="tiny" style="text-align:center;margin-top:10px">Live build v${project.version} — this is the app, not a mockup.</p>
      </div>

      <div class="stack">
        <div class="card">
          <div class="card-head">
            <h3>Where this stands</h3>
            ${statusPill(project)}
          </div>
          <p class="small">${esc(STATUS_COPY[project.status].line.replace('{version}', String(project.version)))}</p>
          <hr class="hr" />
          <ul class="timeline">
            ${activity
              .slice(0, 5)
              .map(
                (entry) => `<li><div><b>${esc(entry.label)}</b><span>${esc(entry.detail)}</span><time>${formatDate(entry.createdAt)}</time></div></li>`,
              )
              .join('') || '<li><div><b>Build generated</b><span>Waiting for the first review</span></div></li>'}
          </ul>
        </div>

        <div class="card" id="package">
          <div class="card-head">
            <h3>Take it to the stores</h3>
            ${approved ? '<span class="pill green">Unlocked</span>' : '<span class="pill">Locked</span>'}
          </div>
          ${
            approved
              ? `<p class="small">Everything below is generated from build v${project.version}. Re-download any time; the files never change underneath a customer.</p>
                 <div class="stack" style="margin-top:14px">
                   <div style="display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;border:1px solid var(--line);border-radius:14px;padding:14px">
                     <div style="min-width:220px;flex:1">
                       <b style="font-size:14px">Installable web app (PWA)</b>
                       <p class="tiny" style="margin-top:3px">index.html, manifest, service worker, icon. Host on HTTPS and send the link. Installs from Safari and Chrome, works offline.</p>
                     </div>
                     <a class="btn small primary" href="/p/${project.token}/export/pwa">Download zip</a>
                   </div>
                   <div style="display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;border:1px solid var(--line);border-radius:14px;padding:14px">
                     <div style="min-width:220px;flex:1">
                       <b style="font-size:14px">Android package</b>
                       <p class="tiny" style="margin-top:3px">Bubblewrap/TWA project + assetlinks.json + the exact commands. Run with your upload key to get the .aab for Play, or a signed .apk to sideload.</p>
                     </div>
                     <a class="btn small primary" href="/p/${project.token}/export/android">Download project</a>
                   </div>
                   <div style="display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;border:1px solid var(--line);border-radius:14px;padding:14px">
                     <div style="min-width:220px;flex:1">
                       <b style="font-size:14px">iOS package</b>
                       <p class="tiny" style="margin-top:3px">Capacitor project with the build inside www/. Needs a Mac, an Apple Developer account and a review queue — the README covers the archive and TestFlight steps.</p>
                     </div>
                     <a class="btn small primary" href="/p/${project.token}/export/ios">Download project</a>
                   </div>
                 </div>
                 <div class="notice accent" style="margin-top:14px">
                   <strong>No binary is pre-signed here.</strong> An .apk or .ipa has to carry the customer's signing identity. That key never touches this server — the downloads give you the project and the commands instead.
                 </div>`
              : `<p class="small">Downloads unlock when the owner approves. That keeps a half-finished build from reaching a store listing — and gives the sign-off a natural place in the project.</p>
                 <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:14px">
                   <button class="btn primary" type="button" data-approve>Approve build v${project.version}</button>
                   <span class="tiny">Approving marks open requests as handled.</span>
                 </div>
                 <div class="notice" style="margin-top:14px">
                   <strong>What you can hand over today, without approval:</strong> the live preview link. It looks and behaves exactly like the installed app.
                 </div>`
          }
        </div>

        <form class="card" id="edit-form">
          <div class="card-head">
            <h3>Edit it yourself</h3>
            <span class="pill">No code</span>
          </div>
          <p class="small" style="margin-bottom:16px">Change the brand, the feature set or any menu item. Saving produces a new version and updates the preview immediately.</p>

          <div class="grid-2" style="gap:14px">
            <div class="field">
              <label for="edit-name">Restaurant name</label>
              <input id="edit-name" name="name" value="${esc(project.name)}" maxlength="60" />
            </div>
            <div class="field">
              <label for="edit-tagline">One-line promise</label>
              <input id="edit-tagline" name="tagline" value="${esc(project.spec.tagline)}" maxlength="90" />
            </div>
          </div>
          <div class="field">
            <label for="edit-category">Category</label>
            <input id="edit-category" name="category" value="${esc(project.spec.category ?? '')}" maxlength="40" placeholder="Bookshop, mobile dog grooming…" />
            <span class="hint">What the app calls them — header, splash and home screen. Empty falls back to the shape's name.</span>
          </div>
          <div class="grid-2" style="gap:14px">
            <div class="field">
              <span class="label">Brand colour</span>
              <div class="swatches">
                <input id="edit-accent" name="accent" type="color" value="${project.spec.accent}" style="width:44px;height:32px;padding:0;border-radius:9px;border:1px solid var(--line);background:none" />
                <span class="tiny">Drives the app header, buttons and icon.</span>
              </div>
            </div>
            <div class="field">
              <label for="edit-logo">Icon text</label>
              <input id="edit-logo" name="logo" value="${esc(project.spec.logo)}" maxlength="2" style="text-transform:uppercase" />
            </div>
          </div>

          <div class="field">
            <span class="label">Contact &amp; hours</span>
            <div class="grid-2" style="gap:10px">
              <input name="hours" value="${esc(project.spec.hours)}" maxlength="90" aria-label="Opening hours" placeholder="Tue–Sun 17:00–23:00" style="grid-column:1/-1" />
              <input name="phone" value="${esc(project.spec.phone)}" maxlength="24" aria-label="Phone" placeholder="+1 555 0142" />
              <input name="email" value="${esc(project.spec.email ?? '')}" maxlength="80" aria-label="Email" placeholder="hello@example.com" />
              <input name="address" value="${esc(project.spec.address)}" maxlength="60" aria-label="Address" placeholder="8 Furnace Yard, Old Town" style="grid-column:1/-1" />
            </div>
            <span class="hint">Filled from the website when the brief started there. Rendered in the app's “Find us” block and its directions, call and email links.</span>
          </div>

          <div class="field">
            <span class="label">Features in the build</span>
            <div class="checks">
              ${FEATURES.map(
                (feature) => `
                <label class="check" style="padding:9px 10px">
                  <input type="checkbox" data-edit-feature="${feature.id}" ${project.features.includes(feature.id) ? 'checked' : ''} ${feature.core ? 'disabled' : ''} />
                  <span><b style="font-size:12.5px">${esc(feature.label)}</b></span>
                </label>`,
              ).join('')}
            </div>
            <span class="hint">Adding features changes the quote. Table ordering pulls in the cart automatically.</span>
          </div>

          <div class="field">
            <label for="edit-custom">Anything else it must do</label>
            <textarea id="edit-custom" name="custom" rows="3" maxlength="600" placeholder="Stock levels, staff rota, tickets…">${esc(project.custom)}</textarea>
            <span class="hint">The customer's own words. Anything no field covers gets scoped by hand.</span>
          </div>

          <details class="faq" style="border-top:1px solid var(--line-soft);border-bottom:0;padding-top:14px">
            <summary>Catalogue — ${project.spec.menu.reduce((sum, section) => sum + section.items.length, 0)} items in ${project.spec.menu.length} sections</summary>
            <div style="margin-top:14px">
              <div data-menu>${menuEditor(project)}</div>
              <button type="button" class="btn small ghost" data-add-section>+ Section</button>
              <p class="tiny" style="margin-top:8px">Prices in the app's currency. Items priced 0 show as “On request”.</p>
            </div>
          </details>

          <div style="display:flex;gap:10px;align-items:center;margin-top:16px;flex-wrap:wrap">
            <button class="btn accent" type="submit" data-save>Save &amp; rebuild</button>
            <span class="tiny" data-save-note>Creates build v${project.version + 1}.</span>
          </div>
        </form>

        <form class="card" id="note-form">
          <div class="card-head">
            <h3>Ask for a change</h3>
            <span class="pill">${notes.filter((note) => note.status === 'open').length} open</span>
          </div>
          <p class="small" style="margin-bottom:12px">For anything the form can't express: “move the lunch menu above dinner”, “the owner wants the phone number on the first screen”. Write it in plain English.</p>
          <textarea name="note" rows="3" maxlength="800" placeholder="Could the reservation screen show the kitchen's closing time?"></textarea>
          <div style="display:flex;justify-content:flex-end;margin-top:10px">
            <button class="btn primary" type="submit">Send request</button>
          </div>
          ${
            notes.length
              ? `<hr class="hr" />
                 <div class="stack" style="gap:10px">
                   ${notes
                     .map(
                       (note) => `
                     <div style="border:1px solid var(--line);border-radius:13px;padding:12px">
                       <div style="display:flex;gap:8px;align-items:center;margin-bottom:5px">
                         <span class="pill ${note.status === 'open' ? 'amber' : 'green'}">${note.status === 'open' ? 'Open' : 'Handled'}</span>
                         <span class="tiny">v${note.version} · ${formatDate(note.createdAt)}</span>
                       </div>
                       <p style="font-size:13.5px">${esc(note.body)}</p>
                     </div>`,
                     )
                     .join('')}
                 </div>`
              : ''
          }
        </form>

        <div class="card">
          <div class="card-head"><h3>What's in this build</h3><span class="pill">v${project.version}</span></div>
          <div class="feature-chips">${featureChips}</div>
          ${
            bundle
              ? `<div class="notice accent" style="margin-top:12px">
                   <strong>${esc(bundle.label)} · ${usd(bundle.price)} + ${usd(bundle.monthly)}/mo</strong>
                   <ul class="ticks" style="margin-top:8px">${bundle.includes.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>
                 </div>`
              : ''
          }
          ${project.custom ? `<div class="notice" style="margin-top:12px"><strong>Also asked for:</strong> ${esc(project.custom)}</div>` : ''}
          <div class="notice" style="margin-top:14px">
            <strong>${esc(project.spec.hours)}</strong><br />
            ${esc(project.spec.address)} · ${esc(project.spec.phone)}${project.spec.email ? ` · ${esc(project.spec.email)}` : ''}
            ${
              project.spec.website
                ? `<br /><a href="${esc(project.spec.website)}" target="_blank" rel="noopener" class="tiny">${esc(project.spec.website.replace(/^https?:\/\//, ''))}</a>`
                : ''
            }
          </div>
          <hr class="hr" />
          <div class="rows">
            ${quote.lines
              .map((line) => `<div class="row"><span>${esc(line.label)}</span><strong>${usd(line.amount)}</strong></div>`)
              .join('')}
          </div>
          <div class="row total">
            <span>${quote.plan === 'monthly' ? 'Setup + monthly' : 'One-time total'}</span>
            <strong>${quote.plan === 'monthly' ? `${usd(quote.setupFee)} + ${usd(quote.monthly)}/mo` : usd(quote.oneTime)}</strong>
          </div>
          <p class="tiny" style="margin-top:10px">Price of production. Retail is yours to set. ${
            quote.plan === 'monthly'
              ? `Monthly covers rebuilds and menu changes; first year ${usd(quote.firstYear)}.`
              : 'Changes after handover are quoted as new work.'
          }</p>
        </div>

        <p class="tiny">Private build link: <span class="mono">${esc(origin)}/p/${project.token}</span></p>
      </div>
    </div>
  </div>

  <style>
    @media (max-width: 960px) {
      .workspace { grid-template-columns: 1fr !important; }
    }
    .item-row input { font-size: 12.5px; padding: 8px 9px; }
  </style>
`
  return page({
    title: `${project.name} · build v${project.version}`,
    description: `Live build of ${project.name} — review, edit and package.`,
    body,
    script: workspaceScript(project),
    // The token is the only way in; this page must never surface in search.
    noindex: true,
  })
}

function workspaceScript(project: Project): string {
  return `
(() => {
  const token = ${JSON.stringify(project.token)}
  const toastEl = document.querySelector('[data-toast]')
  const money = (cents) => '$' + (cents / 100).toFixed(2)

  function toast(message) {
    toastEl.textContent = message
    toastEl.classList.add('on')
    clearTimeout(toast.timer)
    toast.timer = setTimeout(() => toastEl.classList.remove('on'), 2400)
  }

  async function send(path, body, method) {
    const response = await fetch(path, {
      method: method || 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    })
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error((data.error && data.error.message) || 'Request failed')
    }
    return response.json().catch(() => ({}))
  }

  document.querySelector('[data-copy]')?.addEventListener('click', async (event) => {
    try {
      await navigator.clipboard.writeText(event.currentTarget.dataset.copy)
      toast('Review link copied')
    } catch {
      toast('Copy the link from the footer')
    }
  })

  document.querySelector('[data-approve]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget
    button.disabled = true
    button.textContent = 'Approving…'
    try {
      await send('/api/projects/' + token + '/approve')
      toast('Approved — downloads unlocked')
      setTimeout(() => window.location.reload(), 500)
    } catch (error) {
      button.disabled = false
      button.textContent = 'Approve build'
      toast(error.message)
    }
  })

  document.getElementById('note-form').addEventListener('submit', async (event) => {
    event.preventDefault()
    const field = event.currentTarget.querySelector('[name=note]')
    if (field.value.trim().length < 4) return toast('A little more detail, please')
    const button = event.currentTarget.querySelector('button[type=submit]')
    button.disabled = true
    try {
      await send('/api/projects/' + token + '/notes', { body: field.value })
      toast('Request sent')
      setTimeout(() => window.location.reload(), 400)
    } catch (error) {
      button.disabled = false
      toast(error.message)
    }
  })

  /* menu editor */
  const menu = document.querySelector('[data-menu]')
  function itemRow(name, price, desc) {
    const row = document.createElement('div')
    row.className = 'item-row'
    row.dataset.item = ''
    row.style.cssText = 'display:grid;grid-template-columns:1.3fr .6fr .8fr 1.4fr 28px;gap:6px;align-items:center'
    row.innerHTML =
      '<input data-item-name maxlength="60" aria-label="Item name" />' +
      '<input data-item-price inputmode="decimal" aria-label="Price" value="0.00" />' +
      '<input data-item-meta maxlength="30" aria-label="Note" placeholder="45 min" />' +
      '<input data-item-desc maxlength="90" aria-label="Description" placeholder="Description" />' +
      '<button type="button" class="btn small ghost" data-remove-item aria-label="Remove item" style="padding:6px 8px">×</button>'
    row.querySelector('[data-item-name]').value = name || ''
    row.querySelector('[data-item-price]').value = price || '0.00'
    row.querySelector('[data-item-desc]').value = desc || ''
    return row
  }

  menu.addEventListener('click', (event) => {
    const target = event.target
    if (target.matches('[data-add-item]')) {
      const host = target.closest('[data-section]').querySelector('[data-items]')
      host.appendChild(itemRow('', '', ''))
      host.lastElementChild.querySelector('[data-item-name]').focus()
    }
    if (target.matches('[data-remove-item]')) {
      const section = target.closest('[data-section]')
      target.closest('[data-item]').remove()
      if (!section.querySelectorAll('[data-item]').length) section.remove()
    }
    if (target.matches('[data-remove-section]')) target.closest('[data-section]').remove()
  })

  document.querySelector('[data-add-section]')?.addEventListener('click', () => {
    const card = document.createElement('div')
    card.setAttribute('data-section', '')
    card.style.cssText = 'border:1px solid var(--line);border-radius:13px;padding:12px;margin-bottom:10px;background:#fffdf9'
    card.innerHTML =
      '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">' +
      '<input data-section-name maxlength="40" aria-label="Section name" placeholder="Desserts" style="font-weight:650" />' +
      '<button type="button" class="btn small ghost" data-remove-section>Remove</button></div>' +
      '<div data-items style="display:grid;gap:7px"></div>' +
      '<button type="button" class="btn small ghost" data-add-item style="margin-top:8px">+ Item</button>'
    menu.appendChild(card)
    card.querySelector('[data-section-name]').focus()
  })

  function collectMenu() {
    return Array.from(menu.querySelectorAll('[data-section]')).map((section) => ({
      name: section.querySelector('[data-section-name]').value,
      items: Array.from(section.querySelectorAll('[data-item]')).map((row) => ({
        name: row.querySelector('[data-item-name]').value,
        price: Math.round((parseFloat(row.querySelector('[data-item-price]').value) || 0) * 100),
        meta: row.querySelector('[data-item-meta]').value,
        desc: row.querySelector('[data-item-desc]').value,
      })),
    }))
  }

  document.getElementById('edit-form').addEventListener('submit', async (event) => {
    event.preventDefault()
    const form = event.currentTarget
    const button = form.querySelector('[data-save]')
    const note = form.querySelector('[data-save-note]')
    const features = Array.from(form.querySelectorAll('[data-edit-feature]'))
      .filter((input) => input.checked)
      .map((input) => input.dataset.editFeature)
    button.disabled = true
    button.textContent = 'Rebuilding…'
    note.textContent = 'Generating the next version…'
    try {
      const result = await send('/api/projects/' + token, {
        name: form.querySelector('[name=name]').value,
        logo: form.querySelector('[name=logo]').value,
        accent: form.querySelector('[name=accent]').value,
        features,
        custom: form.querySelector('[name=custom]').value,
        spec: {
          tagline: form.querySelector('[name=tagline]').value,
          category: form.querySelector('[name=category]').value,
          hours: form.querySelector('[name=hours]').value,
          address: form.querySelector('[name=address]').value,
          phone: form.querySelector('[name=phone]').value,
          email: form.querySelector('[name=email]').value,
          menu: collectMenu(),
        },
      }, 'PATCH')
      note.textContent = 'Build v' + result.version + ' ready'
      toast('Rebuilt as v' + result.version)
      setTimeout(() => window.location.reload(), 650)
    } catch (error) {
      button.disabled = false
      button.textContent = 'Save & rebuild'
      note.textContent = 'Nothing was saved.'
      toast(error.message)
    }
  })
})()
`
}
