import type { Project } from '../db'
import { money, usd } from '../pricing'
import { verticalFor } from '../verticals'
import { esc, page } from './shell'

const STATUS_PILL: Record<Project['status'], string> = {
  in_review: '<span class="pill amber">In review</span>',
  changes_requested: '<span class="pill accent">Changes requested</span>',
  approved: '<span class="pill green">Approved</span>',
}

/**
 * The gate itself. When no key is set the page says so instead of showing the
 * board, because a missing secret must fail closed.
 */
export function studioKeyPage(options: { configured: boolean; wrong?: boolean }): string {
  const body = `
  <div class="wrap-narrow" style="padding:80px 0;max-width:520px">
    <span class="eyebrow">Operator view</span>
    <h1 class="display" style="font-size:clamp(30px,4vw,42px);margin-top:12px">The build board is private.</h1>
    <p class="small" style="margin-top:10px">It lists every customer's name, email, quote and private build link. Enter the operator key to open it.</p>
    ${
      options.configured
        ? `<form method="post" action="/studio/unlock" class="card flat" style="margin-top:22px;display:grid;gap:12px">
             <div class="field" style="margin:0">
               <label for="studio-key">Operator key</label>
               <input id="studio-key" name="key" type="password" autocomplete="current-password" required autofocus />
             </div>
             ${options.wrong ? `<p class="small" style="color:#b0401f">That key didn't match. Try again.</p>` : ''}
             <button class="btn primary" type="submit">Open the board</button>
           </form>`
        : `<div class="notice accent" style="margin-top:22px">
             <strong>No operator key is set on this deployment.</strong> The board stays closed until <span class="mono">STUDIO_KEY</span> is added as a Worker secret and the Worker picks it up.
           </div>`
    }
    <p class="tiny" style="margin-top:18px">Looking for your own build? Open the link the studio sent you at <span class="mono">/p/&lt;token&gt;</span>.</p>
  </div>`
  return page({
    title: 'Studio · Plattr',
    description: 'Operator sign-in for the Plattr build board.',
    body,
    noindex: true,
  })
}

export function studioPage(projects: Project[], ownerKeys: Record<string, string> = {}): string {
  const monthly = projects
    .filter((project) => project.quote.plan === 'monthly')
    .reduce((sum, project) => sum + project.quote.monthly, 0)
  const setup = projects
    .filter((project) => project.quote.plan === 'monthly')
    .reduce((sum, project) => sum + project.quote.setupFee, 0)
  const oneTime = projects
    .filter((project) => project.quote.plan === 'onetime')
    .reduce((sum, project) => sum + project.quote.oneTime, 0)
  const approved = projects.filter((project) => project.status === 'approved').length

  const body = `
  <div class="wrap" style="padding:34px 0 10px">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap">
      <div>
        <span class="eyebrow">Operator view</span>
        <h1 class="display" style="font-size:clamp(30px,4vw,44px);margin-top:12px">Every build, one board.</h1>
        <p class="small" style="margin-top:8px">Newest first. Open a build to rebrand it, answer a request, or download the store packages.</p>
      </div>
      <a class="btn accent" href="/brief">New brief &rarr;</a>
    </div>

    <div class="grid-3" style="margin-top:24px">
      <div class="card flat">
        <span class="tiny">Live builds</span>
        <p style="font-family:var(--serif);font-size:32px;line-height:1.1;margin-top:4px">${projects.length}</p>
        <span class="tiny">${approved} approved · ${projects.length - approved} in the loop</span>
      </div>
      <div class="card flat">
        <span class="tiny">One-time work booked</span>
        <p style="font-family:var(--serif);font-size:32px;line-height:1.1;margin-top:4px">${usd(oneTime)}</p>
        <span class="tiny">From projects on a one-time plan</span>
      </div>
      <div class="card flat">
        <span class="tiny">Recurring</span>
        <p style="font-family:var(--serif);font-size:32px;line-height:1.1;margin-top:4px">${usd(monthly)}<span style="font-size:15px;font-family:var(--sans);color:var(--muted)">/mo</span></p>
        <span class="tiny">Plus ${usd(setup)} in setup fees</span>
      </div>
    </div>

    <div class="card" style="margin-top:18px;padding:0;overflow:hidden">
      ${
        projects.length === 0
          ? `<div style="padding:44px 24px;text-align:center">
               <h3>No builds yet</h3>
               <p class="small" style="margin-top:8px">Start a brief and a working restaurant app appears here in about a minute.</p>
               <a class="btn primary" style="margin-top:16px" href="/brief">Start the first brief</a>
             </div>`
          : `<div style="overflow-x:auto">
              <table style="width:100%;border-collapse:collapse;font-size:13.5px">
                <thead>
                  <tr style="text-align:left;color:var(--muted);font-size:11.5px;letter-spacing:0.06em;text-transform:uppercase">
                    <th style="padding:14px 18px;font-weight:600">Restaurant</th>
                    <th style="padding:14px 10px;font-weight:600">Status</th>
                    <th style="padding:14px 10px;font-weight:600">Plan</th>
                    <th style="padding:14px 10px;font-weight:600">Value</th>
                    <th style="padding:14px 10px;font-weight:600">Build</th>
                    <th style="padding:14px 18px"></th>
                  </tr>
                </thead>
                <tbody>
                  ${projects
                    .map(
                      (project) => `
                    <tr style="border-top:1px solid var(--line-soft)">
                      <td style="padding:14px 18px">
                        <div style="display:flex;gap:10px;align-items:center">
                          <span style="width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:${esc(project.accent)};color:#fff;font-size:11px;font-weight:700">${esc(project.spec.logo)}</span>
                          <span>
                            <b style="display:block">${esc(project.name)}</b>
                            <span class="tiny">${esc(verticalFor(project.vertical).label)} · ${esc(project.contact || 'no contact')}${project.email ? ` · ${esc(project.email)}` : ''}</span>
                            ${ownerKeys[project.id] ? `<details style="margin-top:4px"><summary class="tiny" style="cursor:pointer">Owner access</summary><span class="tiny">Dashboard key: <code>${esc(ownerKeys[project.id])}</code> · <a href="/p/${project.token}/dashboard/login">owner login</a></span></details>` : ''}
                          </span>
                        </div>
                      </td>
                      <td style="padding:14px 10px">${STATUS_PILL[project.status]}</td>
                      <td style="padding:14px 10px">${project.quote.plan === 'monthly' ? 'Monthly' : 'One-time'}</td>
                      <td style="padding:14px 10px;font-variant-numeric:tabular-nums">${project.quote.plan === 'monthly' ? `${money(project.quote.monthly)}/mo` : usd(project.quote.oneTime)}</td>
                      <td style="padding:14px 10px">v${project.version}</td>
                      <td style="padding:14px 18px;text-align:right;white-space:nowrap">
                        <a class="btn small" href="/p/${project.token}">Open</a>
                        <form method="post" action="/studio/projects/${esc(project.id)}/delete" style="display:inline;margin:0" onsubmit="return confirm('Delete this build and everything attached to it?')">
                          <button class="btn small ghost" type="submit">Delete</button>
                        </form>
                      </td>
                    </tr>`,
                    )
                    .join('')}
                </tbody>
              </table>
            </div>`
      }
    </div>

    <div class="notice" style="margin-top:18px;display:flex;gap:14px;align-items:center;justify-content:space-between;flex-wrap:wrap">
      <span><strong>Operator only.</strong> This board lists customer names, emails, quotes and build tokens, so it opens with the operator key and nothing else. The customer build links stay private — each one carries a 24-character token instead of a password.</span>
      <form method="post" action="/studio/lock" style="margin:0">
        <button class="btn small" type="submit">Sign out</button>
      </form>
    </div>
  </div>
`
  return page({
    title: 'Studio · Plattr',
    description: 'Every build, plan and download in one board.',
    body,
    active: 'studio',
    // Customer names, emails, quotes and tokens live here.
    noindex: true,
  })
}
