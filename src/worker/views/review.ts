import type { Project } from '../db'
import type { MenuItem, SourceReview } from '../types'
import { reviewCounts } from '../review'
import { esc, page } from './shell'

/**
 * The owner's evidence desk.
 *
 * It shows what the read kept, what it read but did not publish, what is still
 * missing, and which catalogue values came from the website or from the owner.
 * Nothing here edits a value: corrections happen in the editor, where the
 * server records the changed fields as owner-provided. This page is where the
 * owner checks the source before trusting the build.
 */

function money(item: MenuItem, currency: string): string {
  if (item.price <= 0) return 'No price'
  return `${currency ? esc(currency) + ' ' : ''}${(item.price / 100).toFixed(2)}`
}

function statusPill(item: MenuItem): string {
  if (item.ownerFields?.length) return '<span class="pill">Your data</span>'
  if (item.priceEvidence?.validated) return '<span class="pill dark">Website evidence</span>'
  if (item.price > 0) return '<span class="pill">Unverified price</span>'
  return '<span class="pill">No price</span>'
}

function day(value: string | undefined): string {
  if (!value) return ''
  const time = Date.parse(value)
  return Number.isFinite(time)
    ? new Date(time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : ''
}

function evidenceLine(item: MenuItem): string {
  const bits: string[] = []
  if (item.sourceUrl) bits.push(`Read from <span class="mono">${esc(item.sourceUrl)}</span>`)
  if (item.sourceMethod) bits.push(`via ${esc(item.sourceMethod.replace(/-/g, ' '))}`)
  if (item.priceEvidence) {
    const evidence = item.priceEvidence
    bits.push(
      `price ${esc(evidence.raw || '—')}${evidence.currency ? ` ${esc(evidence.currency)}` : ''}` +
        ` from ${esc(evidence.method === 'owner' ? 'your entry' : evidence.method)}` +
        ` (${evidence.validated ? 'validated' : 'unverified'})`,
    )
  }
  if (item.ownerFields?.length) bits.push(`you changed ${esc(item.ownerFields.join(', '))}`)
  if (item.fieldProvenance)
    bits.push(
      Object.entries(item.fieldProvenance)
        .filter(([, field]) => Boolean(field))
        .map(
          ([field, value]) =>
            `${esc(field)}: ${esc(value!.source === 'website' ? (value!.validated ? 'website, validated' : 'website, reported') : value!.source === 'owner' ? 'yours' : 'unverified')}`,
        )
        .join(', '),
    )
  if (item.sourcePriceEvidence)
    bits.push(
      `${item.sourcePriceEvidence.method === 'owner' ? 'earlier entry had' : 'website had'} ${esc(item.sourcePriceEvidence.raw || 'a price')}${item.sourcePriceEvidence.currency ? ` ${esc(item.sourcePriceEvidence.currency)}` : ''}${item.sourcePriceEvidence.validated ? '' : ' (unverified)'}`,
    )
  // The dated trail survives a fresh browser session: what the site said when
  // the owner corrected it, what a later read said, and what the owner chose.
  const trail = item.sourceTrail
  if (trail?.ownerAt) bits.push(`you corrected this on ${esc(day(trail.ownerAt))}`)
  if (trail?.original?.at && !trail.ownerAt)
    bits.push(`source reading kept from ${esc(day(trail.original.at))}`)
  if (trail?.latest)
    bits.push(
      `website re-read ${esc(day(trail.latest.at))}: ${esc(
        trail.latest.price ? `price ${trail.latest.price}` : trail.latest.name || trail.latest.desc || 'a new reading',
      )}`,
    )
  if (trail?.decisions?.length) {
    const last = trail.decisions[trail.decisions.length - 1]
    bits.push(
      `you chose ${last.choice === 'owner' ? 'your value' : 'the website value'} over ${
        last.choice === 'owner' ? `the site's ${esc(last.sourceValue || 'reading')}` : `your ${esc(last.ownerValue || 'value')}`
      } on ${esc(day(last.at))}`,
    )
  }
  return bits.length ? bits.join(' · ') : 'No website evidence recorded for this item.'
}

function editAnchor(field: string): { href: string; label: string } {
  const value = field.toLowerCase()
  if (/catalog|product|dish|service|price|photo|treatment/.test(value))
    return { href: '/edit?panel=catalog', label: 'Open catalogue' }
  if (/project|portfolio|case stud/.test(value)) return { href: '/review#portfolio', label: 'Review work' }
  if (/phone|email|contact/.test(value)) return { href: '#edit-phone', label: 'Add contact' }
  if (/address|location/.test(value)) return { href: '#edit-address', label: 'Add address' }
  if (/hour|open/.test(value)) return { href: '#edit-hours', label: 'Add hours' }
  if (/name/.test(value)) return { href: '#edit-name', label: 'Check name' }
  if (/tagline|category|story|about/.test(value)) return { href: '#edit-name', label: 'Edit details' }
  return { href: '#edit-name', label: 'Edit details' }
}

function fieldLabel(field: string): string {
  const value = field.toLowerCase()
  if (value === 'name') return 'Business name'
  if (value === 'contact') return 'Contact details'
  if (value === 'catalogue') return 'Catalogue'
  if (value === 'hours') return 'Opening hours'
  return field.charAt(0).toUpperCase() + field.slice(1)
}

function editLink(token: string, field: string): string {
  const target = editAnchor(field)
  return `<a class="btn small ghost" href="/p/${esc(token)}${esc(target.href)}">${esc(target.label)}</a>`
}

function identity(project: Project): string {
  const spec = project.spec
  const rows = [
    ['Business name', spec.name, 'edit-name'],
    ['Category', spec.category || spec.kind, 'edit-name'],
    ['Tagline', spec.tagline, 'edit-name'],
    ['Phone', spec.phone, 'edit-phone'],
    ['Email', spec.email || project.email, 'edit-email'],
    ['Address', spec.address, 'edit-address'],
    ['Hours', spec.hours, 'edit-hours'],
  ]
  return `<div class="card"><div class="card-head"><h3>Business information kept</h3></div>
    <div class="rows">${rows
      .map(([label, value, anchor]) =>
        value
          ? `<div class="row"><span>${esc(label)}</span><strong>${esc(value)}</strong><a class="tiny" href="/p/${esc(project.token)}#${esc(anchor)}">Edit</a></div>`
          : `<div class="row"><span>${esc(label)}</span><span class="tiny">Not provided</span><a class="tiny" href="/p/${esc(project.token)}#${esc(anchor)}">Add</a></div>`,
      )
      .join('')}</div>
    <p class="tiny">Kept from your website and brief. Missing fields stay blank; they are not filled with sample copy. Use Edit or Add to open the field in your workspace.</p></div>`
}

function catalogue(project: Project): string {
  const items = project.spec.menu.flatMap((section) => section.items.map((item) => ({ section, item })))
  const open = `<a class="btn small primary" href="/p/${esc(project.token)}/edit?panel=catalog">Add the first item</a>`
  if (!items.length)
    return `<div class="card"><div class="card-head"><h3>Catalogue</h3><span class="pill">Empty</span></div>
      <p class="small">No items have been published. That is the honest result of this read, not a failed render. Add items one at a time or paste a list; both are recorded as your own data.</p>
      <div style="margin-top:10px">${open}</div></div>`
  return `<div class="card"><div class="card-head"><h3>Catalogue evidence</h3><span class="pill">${items.length}</span></div>
    <div style="display:flex;justify-content:flex-end;margin-bottom:4px"><a class="btn small ghost" href="/p/${esc(project.token)}/edit?panel=catalog">Open catalogue</a></div>
    ${items
      .map(
        ({ section, item }) => `<div class="row" style="align-items:flex-start;gap:10px;padding:10px 0;border-top:1px solid var(--line)">
          <div style="flex:1;min-width:0">
            <div><strong>${esc(item.name)}</strong> ${statusPill(item)}</div>
            <div class="tiny">${esc(section.name)} · ${money(item, project.spec.currency ?? '')}${item.meta ? ` · ${esc(item.meta)}` : ''}</div>
            <div class="tiny" style="margin-top:3px">${evidenceLine(item)}</div>
            ${item.desc ? `<div class="tiny" style="margin-top:3px">${esc(item.desc)}</div>` : ''}
          </div>
        </div>`,
      )
      .join('')}</div>`
}

function rejectedBlock(review: SourceReview | undefined, token: string, projects: { title: string }[] = []): string {
  if (!review?.rejected.length)
    return `<div class="card"><div class="card-head"><h3>Read but not published</h3></div><p class="small">No content was refused with a reason.</p></div>`
  const groups: { key: 'information' | 'portfolio' | 'excluded'; title: string; note: string }[] = [
    {
      key: 'information',
      title: 'Kept as business information',
      note: 'Policies, locations, press and promotions stay available on the Visit screen. They are not sold as catalogue items.',
    },
    {
      key: 'portfolio',
      title: 'Eligible for the portfolio',
      note: 'Completed work, kept apart from services. Add it below and it appears as selected work, never as a priced service.',
    },
    {
      key: 'excluded',
      title: 'Site chrome, not content',
      note: 'Navigation labels and unclassifiable rows have no destination in the app.',
    },
  ]
  return `<div class="card"><div class="card-head"><h3>Read but not published</h3><span class="pill">${review.rejected.length}</span></div>
    ${groups
      .map((group) => {
        const rows = review.rejected.filter((entry) => entry.destination === group.key)
        if (!rows.length) return ''
        return `<div style="margin-top:12px"><div class="label">${esc(group.title)} · ${rows.length}</div>
          <p class="tiny" style="margin:4px 0 6px">${esc(group.note)}</p>
          ${rows
            .map(
              (entry) => `<div class="row" style="align-items:flex-start;gap:10px;padding:7px 0;border-top:1px solid var(--line)">
                <div style="flex:1;min-width:0">
                  <strong>${esc(entry.name)}</strong> <span class="tiny">· ${esc(entry.section)} · ${esc(entry.kind)}</span>
                  <div class="tiny">Refused: ${esc(entry.reason.replace(/-/g, ' '))}${entry.source ? ` · <span class="mono">${esc(entry.source)}</span>` : ''}</div>
                </div>
                ${group.key === 'portfolio'
                  ? inPortfolio(projects, entry.name)
                    ? '<span class="pill">In portfolio</span>'
                    : `<form method="post" action="/p/${esc(token)}/review/portfolio"><input type="hidden" name="action" value="add" /><input type="hidden" name="name" value="${esc(entry.name)}" /><button class="btn small" type="submit">Add to portfolio</button></form>`
                  : ''}
              </div>`,
            )
            .join('')}
        </div>`
      })
      .join('')}</div>`
}

// A source excerpt and its shortened project title are the same piece of work.
function workKey(value: string): string {
  return value
    .toLowerCase()
    .split(/[,.]/)[0]
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function inPortfolio(projects: { title: string; accepted?: boolean }[], name: string): boolean {
  return projects.some((entry) => entry.accepted !== false && workKey(entry.title) === workKey(name))
}

function portfolio(project: Project, review: SourceReview | undefined, token: string): string {
  const projects = project.spec.projects ?? []
  const published = projects.filter((entry) => entry.accepted !== false)
  const suggested = projects.filter((entry) => entry.accepted === false)
  const candidates = (review?.rejected ?? []).filter((entry) => entry.destination === 'portfolio')
  const remaining = candidates.filter((entry) => !inPortfolio(projects, entry.name))
  const addAll =
    remaining.length > 1
      ? `<form method="post" action="/p/${esc(token)}/review/portfolio" style="margin-bottom:10px"><input type="hidden" name="action" value="addAll" /><button class="btn small" type="submit">Add ${remaining.length === candidates.length ? 'all ' : 'the remaining '}${remaining.length} as portfolio work</button></form>`
      : ''
  const acceptAll =
    suggested.length
      ? `<div style="margin-bottom:10px;border:1px solid var(--line);border-radius:10px;padding:10px"><div class="label">Review before publishing</div><ul class="small" style="margin:4px 0 8px;padding-left:18px">${suggested.map((entry) => `<li>${esc(entry.title)}</li>`).join('')}</ul><form method="post" action="/p/${esc(token)}/review/portfolio"><input type="hidden" name="action" value="acceptAll" /><label class="tiny" style="display:flex;gap:6px;align-items:flex-start;margin-bottom:8px"><input type="checkbox" name="confirm" value="yes" required /> I have reviewed these titles and want them published as portfolio work.</label><button class="btn small primary" type="submit">Publish ${suggested.length} suggested project${suggested.length === 1 ? '' : 's'}</button></form></div>`
      : ''
  return `<div class="card" id="portfolio"><div class="card-head"><h3>Portfolio</h3><span class="pill">${published.length} live${suggested.length ? ` · ${suggested.length} suggested` : ''}</span></div>
    <p class="small">Selected work is proof, not a service. It has no price and no booking action. A project read from the website stays unpublished until you accept it.</p>
    ${acceptAll}${addAll}
    ${
      projects.length
        ? projects
            .map(
              (entry, index) => `<form method="post" action="/p/${esc(token)}/review/portfolio" style="border-top:1px solid var(--line);padding:10px 0;display:grid;gap:6px">
                <input type="hidden" name="action" value="update" />
                <input type="hidden" name="index" value="${index}" />
                <input name="title" value="${esc(entry.title)}" maxlength="120" aria-label="Project title" />
                <input name="desc" value="${esc(entry.desc ?? '')}" maxlength="400" aria-label="Project description" placeholder="What the project was" />
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                  <button class="btn small primary" type="submit">${entry.accepted === false ? 'Publish this project' : 'Save'}</button>
                  <span class="tiny">${entry.accepted === false ? 'Suggested from the website · not published' : entry.source === 'owner' ? 'Added by you' : 'From the website'}</span>
                </div>
              </form>`,
            )
            .join('')
        : '<p class="tiny">No portfolio entries yet.</p>'
    }
    <form method="post" action="/p/${esc(token)}/review/portfolio"><input type="hidden" name="action" value="add" /><input type="hidden" name="name" value="New project" /><button class="btn small" type="submit">Add a project by hand</button></form>
  </div>`
}

function questions(project: Project, review: SourceReview | undefined): string {
  if (!review) return ''
  return `<div class="card" id="missing"><div class="card-head"><h3>What is missing or unconfirmed</h3><span class="pill">${review.missing.length + review.questions.length}</span></div>
    <p class="small">These are the only things standing between this build and a confident handover. You can add them now or leave them for later; nothing is invented for you.</p>
    ${review.missing.length ? `<div class="label" style="margin-top:10px">Not found on your site</div>${review.missing.map((entry) => `<div class="row" style="align-items:flex-start;gap:10px;padding:7px 0;border-top:1px solid var(--line)"><div style="flex:1"><strong>${esc(entry.charAt(0).toUpperCase() + entry.slice(1))}</strong></div>${editLink(project.token, entry)}</div>`).join('')}` : ''}
    ${review.questions.length ? `<div class="label" style="margin-top:12px">Needs your confirmation</div>${review.questions.map((question) => `<div class="row" style="align-items:flex-start;gap:10px;padding:8px 0;border-top:1px solid var(--line)"><div style="flex:1"><strong>${esc(fieldLabel(question.field))}</strong>${question.kind === 'blocker' ? ' <span class="pill">Blocking</span>' : ''}<div class="tiny" style="margin-top:3px">${esc(question.why)}</div></div>${editLink(project.token, question.field)}</div>`).join('')}` : ''}
    ${review.conflicts.length ? `<div class="label" style="margin-top:12px">Conflicting readings</div>${review.conflicts.map((conflict) => `<p class="small" style="margin-top:6px"><strong>${esc(conflict.field)}</strong>: ${conflict.values.map((value) => `${esc(value.value)} <span class="tiny">(${esc(value.source)})</span>`).join(' vs ')}</p>`).join('')}` : ''}
  </div>`
}

function discovered(project: Project): string {
  const review = project.spec.sourceReview
  if (!review) return ''
  return `<div class="card"><div class="card-head"><h3>What we found</h3><span class="pill">From your website</span></div>
    <p class="small" style="margin-bottom:8px">Read from ${esc(review.host || review.source || 'your website')}. These are the facts the build starts from.</p>
    <ul class="ticks" style="margin:0;padding-left:20px">${review.found.map((entry) => `<li style="margin:5px 0">${esc(entry)}</li>`).join('') || '<li>No verified facts were recorded.</li>'}</ul>
    <p class="tiny" style="margin-top:10px">Where the site was silent, the app stays silent. It never fills a gap with another business’s examples.</p></div>`
}

function pages(review: SourceReview | undefined): string {
  if (!review) return ''
  return `<div class="card"><div class="card-head"><h3>What was read</h3></div>
    <p class="small">${review.pages.read.length} page${review.pages.read.length === 1 ? '' : 's'} from ${esc(review.host || review.source || 'the site')}${review.pages.usedSitemap ? ', via their sitemap' : ''}.</p>
    ${review.pages.failed.length ? `<details style="margin-top:8px"><summary class="tiny" style="cursor:pointer">Could not be read (${review.pages.failed.length})</summary><ul class="ticks" style="margin-top:6px">${review.pages.failed.map((entry) => `<li><span class="mono">${esc(entry.url)}</span> — ${esc(entry.reason)}</li>`).join('')}</ul></details>` : ''}
    ${review.pages.read.length ? `<details style="margin-top:8px"><summary class="tiny" style="cursor:pointer">Pages inspected (${review.pages.read.length})</summary><ul class="ticks" style="margin-top:6px">${review.pages.read.slice(0, 40).map((page) => `<li><span class="mono">${esc(page)}</span></li>`).join('')}</ul></details>` : ''}
  </div>`
}

export function reviewPage(options: { project: Project; origin: string; notice?: string }): string {
  const { project, notice } = options
  const spec = project.spec
  const review = spec.sourceReview
  const counts = reviewCounts(review, spec.menu)
  const empty = !counts.items
  const body = `<style>@media(max-width:640px){.nav-links a:not(.btn){display:none}.nav-links{gap:8px}}</style>
  <div class="wrap" style="max-width:920px;padding:32px 0 60px">
    <a href="/p/${esc(project.token)}/edit" class="tiny" style="text-decoration:none">← Back to the editor</a>
    <div style="display:flex;justify-content:space-between;gap:14px;align-items:flex-end;flex-wrap:wrap;margin-top:12px">
      <div><span class="eyebrow">Source review</span><h1 class="display" style="font-size:clamp(28px,4vw,40px);margin-top:8px">What we read</h1>
      <p class="small" style="margin-top:6px">${esc(spec.name)} · ${review ? `${esc(review.host || review.source)}` : 'No website read recorded for this build'}</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <a class="btn ghost" href="/p/${esc(project.token)}/edit">Edit the app</a>
        <a class="btn primary" href="/p/${esc(project.token)}/app" target="_blank" rel="noreferrer">Open the app</a>
      </div>
    </div>

    ${notice ? `<div class="notice" style="margin-top:18px"><strong>${esc(notice)}</strong></div>` : ''}
    <div class="notice accent" style="margin-top:18px">
      <strong>Start here, in this order</strong>
      <ol class="small" style="margin:6px 0 0 18px;padding:0">
        <li>Read what we found and check the business details.</li>
        <li>Add what is missing, or confirm the values we marked uncertain.</li>
        <li>Open the app, try the customer journey, then approve when it is right.</li>
      </ol>
      <div class="links" style="margin-top:9px">
        <a class="btn small primary" href="/p/${esc(project.token)}/edit?panel=catalog">Open the catalogue</a>
        <a class="btn small" href="/p/${esc(project.token)}#edit-name">Edit business details</a>
        <a class="btn small ghost" href="/p/${esc(project.token)}/app" target="_blank" rel="noreferrer">Preview the app</a>
      </div>
    </div>
    <div class="notice" style="margin-top:12px">
      <strong>${empty ? 'No catalogue items are in this build yet.' : `${counts.items} item${counts.items === 1 ? ' is' : 's are'} in this build.`}</strong>
      <span class="tiny">${counts.verified} with validated website price evidence · ${counts.owner} with your corrections (kept as yours, never upgraded to website-verified) · ${counts.rejected} read but not included · ${counts.missing} missing. This build is still private.</span>
      <p class="tiny" style="margin-top:6px">${empty ? 'The app keeps the business’s identity, contact and information. To complete the catalogue, open the editor and use the catalogue panel (▤): add items one at a time, or paste a list as Name | Price | Description. Both are saved as your own data, never as website evidence.' : 'Open the editor’s catalogue panel to correct a value. Anything you change is recorded as owner-provided and the website’s original reading is kept beside it.'}</p>
    </div>

    <div class="grid-2" style="gap:16px;align-items:start;margin-top:16px">
      <div style="display:grid;gap:16px">${discovered(project)}${identity(project)}${catalogue(project)}${rejectedBlock(review, project.token, project.spec.projects ?? [])}</div>
      <div style="display:grid;gap:16px">${questions(project, review)}${portfolio(project, review, project.token)}${pages(review)}</div>
    </div>
  </div>`
  return page({
    title: `What we read · ${spec.name} · Plattr`,
    description: 'The source evidence behind this build, and what still needs the owner.',
    body,
  })
}
