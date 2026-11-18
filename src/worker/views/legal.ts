import { page } from './shell'

/**
 * One short page for both privacy and terms: a brief is a tiny amount of
 * personal data, and the deal is a quote plus a private build link. Anything
 * longer would be copy nobody reads. Written in the product's own voice, and
 * deliberately honest about what is not wired up yet.
 */
export function legalPage(): string {
  const body = `
  <div class="wrap-narrow" style="padding:54px 0 8px">
    <span class="eyebrow">Privacy &amp; terms</span>
    <h1 style="font-size:clamp(34px,5.4vw,48px);margin-top:14px">Short, because the product is.</h1>
    <p class="lede" style="margin-top:14px">A brief, a quote and a private build link. This page says what happens to each of them. Last updated 18 November 2026.</p>

    <h2 style="margin-top:44px">Privacy</h2>

    <h3 style="margin-top:22px">What is collected</h3>
    <p class="small" style="margin-top:8px;color:var(--ink-soft);max-width:72ch">The answers you type into a brief: business name, contact name, email, and the phone, address, trade, features, colours and free-text notes you choose to give. If you paste a public website address, the pages you point at are read for the name, catalogue, prices and contact details the business already publishes. The build page keeps the quote, the app specification and any notes you add there.</p>

    <h3 style="margin-top:22px">Why it is held</h3>
    <p class="small" style="margin-top:8px;color:var(--ink-soft);max-width:72ch">To generate the app, price it, and reply to you about it. Nothing is sold, and there are no advertising or analytics scripts on this site. If stock photography is enabled, the photo search runs server-side against Pexels; visitors do not upload images.</p>

    <h3 style="margin-top:22px">Cookies and local storage</h3>
    <p class="small" style="margin-top:8px;color:var(--ink-soft);max-width:72ch">This site sets one cookie, and only after an operator unlocks the studio: an HttpOnly session cookie derived from the operator key. There are no tracking cookies. A generated app stores its cart and saved items in your browser's local storage, on that device only.</p>

    <h3 style="margin-top:22px">Who holds it, and for how long</h3>
    <p class="small" style="margin-top:8px;color:var(--ink-soft);max-width:72ch">Builds and their details are stored in a Cloudflare database for the studio that produced them, and hosted by Cloudflare. A build stays until the operator deletes it. To have a build and the contact details attached to it removed, ask the person who sent you the link; deletion removes the project, its notes and its activity in one step.</p>

    <h2 style="margin-top:44px">Terms</h2>

    <h3 style="margin-top:22px">Quotes</h3>
    <p class="small" style="margin-top:8px;color:var(--ink-soft);max-width:72ch">The quote on a build page is an estimate of production work: a base build, each capability, each store format and any platform bundle. It becomes an order only when you and the studio confirm it in writing. Payment is not collected on this site; the operator invoices separately, and no card details pass through here.</p>

    <h3 style="margin-top:22px">What is delivered</h3>
    <p class="small" style="margin-top:8px;color:var(--ink-soft);max-width:72ch">A private build link, a downloadable package once the build is approved, and the version history on the build page. Store submission, app-store accounts, hosting and domain costs sit with the business that owns the app. Generated apps are working demos of the brief you gave: they are provided as they are, without a warranty that they fit a purpose you did not state.</p>

    <h3 style="margin-top:22px">Fair use</h3>
    <p class="small" style="margin-top:8px;color:var(--ink-soft);max-width:72ch">Builds are metered to keep the service available to everyone: a few per visitor each day and a daily cap for the studio as a whole. Do not use the brief to store unlawful content, to attack or overload the service, or to resell generated builds as your own generator. Builds that break those rules can be removed.</p>

    <h3 style="margin-top:22px">Your content</h3>
    <p class="small" style="margin-top:8px;color:var(--ink-soft);max-width:72ch">The business name, catalogue, prices and copy you supply remain yours. The generated code is licensed to the business under whatever agreement the studio and the customer sign; exporting the package does not transfer anyone else's trademarks or photography to you.</p>

    <p class="tiny" style="margin-top:34px;max-width:72ch">This is a plain-language summary for a small studio tool, not legal advice. Have it reviewed before a commercial launch in a regulated market.</p>

    <div class="actions" style="margin-top:26px">
      <a class="btn primary" href="/brief">Start a brief</a>
      <a class="btn ghost" href="/">Back to the site</a>
    </div>
  </div>`

  return page({
    title: 'Privacy & terms · Plattr',
    description:
      'What a Plattr brief collects, why it is held, how a build is deleted, and the terms a quote and generated app come with.',
    body,
  })
}
