/**
 * Test-only fixtures for the free AI route.
 *
 * The site pages are the same shape the importer fixture suite uses, and the
 * design set is the reviewed GeeStores sample. Providers are mocked at the
 * `fetch` boundary, which is exactly where the adapters meet the network: no
 * live request is possible from a test that installs this fetch.
 */

import { readFileSync } from 'node:fs'
import { buildDiscovery, discoverPlan } from '../src/worker/discovery'
import { dossierFromSpec, type Dossier } from '../src/worker/ai/dossier'
import type { AppSpec } from '../src/worker/types'
import { importWebsite } from '../src/worker/importer'
import type { BusinessBrief, DesignSet } from '../src/worker/ai/contracts'

export const JEWELLERY_URL = 'https://geestores.example/'
export const GROQ_KEY = 'test-groq-key'
export const CF_ACCOUNT = 'test-account'
export const CF_TOKEN = 'test-cloudflare-token'

const productPage = (name: string, price: string, crumb: string) => `<!doctype html><html><head>
<title>${name} — GeeStores</title>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"${name}",
 "description":"A hand-finished piece from the GeeStores collection.",
 "offers":{"@type":"Offer","price":"${price}","priceCurrency":"INR"}}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
 {"@type":"ListItem","position":1,"name":"Home","item":"https://geestores.example/"},
 {"@type":"ListItem","position":2,"name":"${crumb}"},
 {"@type":"ListItem","position":3,"name":"${name}"}]}
</script></head><body><h1>${name}</h1><button>Add to cart</button></body></html>`

const HOME = `<!doctype html><html><head><title>GeeStores</title>
<meta property="og:site_name" content="GeeStores" />
<meta name="description" content="Jewellery shop. Ceremonial pieces, priced and photographed." />
<meta property="og:description" content="Jewellery shop. Ceremonial pieces, priced and photographed." />
<meta name="theme-color" content="#b8863f" /></head>
<body><h1>GeeStores</h1><p>Jewellery shop. Every piece is priced and photographed in the studio.</p>
<a href="/shop/gold-band">Gold band</a> <a href="/shop/stone-ring">Stone ring</a>
<a href="/shop/chain">Chain</a></body></html>`

const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://geestores.example/</loc></url>
  <url><loc>https://geestores.example/shop/gold-band</loc></url>
  <url><loc>https://geestores.example/shop/stone-ring</loc></url>
  <url><loc>https://geestores.example/shop/chain</loc></url>
  <url><loc>https://geestores.example/policies/returns</loc></url>
</urlset>`

const PAGES: Record<string, string> = {
  '/': HOME,
  '/shop/gold-band': productPage('Gold band', '2499.00', 'Rings'),
  '/shop/stone-ring': productPage('Stone ring', '1899.00', 'Rings'),
  '/shop/chain': productPage('Chain', '1299.00', 'Necklaces'),
  '/policies/returns': HOME,
}

export type SiteCall = { path: string }

/** The business's own website, as the importer sees it. */
export function siteFetch(seen: SiteCall[] = []) {
  return (async (input: string | URL | Request) => {
    const url = new URL(String(input))
    seen.push({ path: url.pathname })
    if (url.hostname !== 'geestores.example') throw new Error(`unexpected site fetch ${url.href}`)
    if (url.pathname === '/robots.txt')
      return new Response('User-agent: *\nAllow: /\n', { headers: { 'content-type': 'text/plain' } })
    if (url.pathname === '/sitemap.xml')
      return new Response(SITEMAP, { headers: { 'content-type': 'application/xml' } })
    const html = PAGES[url.pathname]
    return html
      ? new Response(html, { headers: { 'content-type': 'text/html' } })
      : new Response('gone', { status: 404, headers: { 'content-type': 'text/html' } })
  }) as unknown as typeof fetch
}

export async function crawlSpec(): Promise<{ spec: AppSpec; dossier: Dossier }> {
  const report = await importWebsite(JEWELLERY_URL, siteFetch(), { withHtml: true })
  const discovery = buildDiscovery({
    report,
    site: report.site,
    source: report.source,
    html: report.entryHtml,
    pagesRead: report.pagesRead,
    pagesFailed: report.pagesFailed,
    usedSitemap: report.usedSitemap,
  })
  const spec = discoverPlan(discovery, report.site).concepts[0].spec
  return { spec, dossier: dossierFromSpec(spec, { source: report.source }) }
}

/** A brief that says only what the read established. */
export function briefFrom(dossier: Dossier): BusinessBrief {
  return {
    identity: {
      name: dossier.business.name,
      trade: dossier.business.trade,
      category: dossier.business.category || 'Jewellery shop',
      summary: 'A jewellery shop with a priced, photographed catalogue.',
      nameConfidence: 'likely',
    },
    audience: { primary: 'Gift buyers', secondary: [], confidence: 'guess' },
    offer: {
      currency: dossier.catalogue.currency,
      catalogueEntries: dossier.catalogue.entries,
      entriesWithPhotograph: dossier.catalogue.withPhotograph,
      workflows: dossier.workflows.map((id) => ({ id: id as 'browse' | 'buy', available: true, why: 'read from the site' })),
    },
    brand: { personality: ['ceremonial', 'ornate'], formality: 'formal', energy: 'calm' },
    vocabulary: { catalog: 'Collection', item: 'Piece', buy: 'Add to bag', enquire: 'Ask about this piece' },
    constraints: { mustNotInvent: ['prices', 'materials'] },
    assumptions: [],
    questions: [],
  }
}

export function sampleDesignSet(): DesignSet {
  return JSON.parse(
    readFileSync(new URL('../docs/p1-ai-proposal/geestores.design-set.json', import.meta.url).pathname, 'utf8'),
  ) as DesignSet
}

/** The copy stage is optional; this answer keeps it valid but empty. */
export function copySetFor(set: DesignSet) {
  return { concepts: set.concepts.map((concept) => ({ id: concept.id, headings: [] })) }
}

type Mode = 'ok' | 'server_error' | 'malformed'

export type ProviderCalls = { groq: number; cloudflare: number; hosts: string[]; bodies: string[] }

function chat(content: string, usage: { prompt: number; completion: number }) {
  return new Response(
    JSON.stringify({
      id: 'chatcmpl-test',
      model: 'openai/gpt-oss-120b',
      choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
      usage: {
        prompt_tokens: usage.prompt,
        completion_tokens: usage.completion,
        completion_tokens_details: { reasoning_tokens: 40 },
      },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

/**
 * One `fetch` for the whole request: the business site stays real (mocked
 * HTML), and both providers answer deterministically. Hosts that do not belong
 * to this route are refused loudly, so a paid endpoint can never be reached by
 * accident in a test.
 */
export function freeProviderFetch(options: {
  design?: Mode
  understand?: Mode
  copy?: Mode
  brief: BusinessBrief
  set: DesignSet
}): { fetch: typeof fetch; calls: ProviderCalls } {
  const calls: ProviderCalls = { groq: 0, cloudflare: 0, hosts: [], bodies: [] }
  const site = siteFetch()
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    calls.hosts.push(url.host)
    if (init?.body) calls.bodies.push(String(init.body))
    if (url.hostname === 'geestores.example') return site(input, init)
    if (url.hostname === 'api.groq.com') {
      calls.groq += 1
      const stage = calls.groq === 1 ? 'understand' : 'copy'
      const mode = stage === 'understand' ? (options.understand ?? 'ok') : (options.copy ?? 'ok')
      if (mode === 'server_error') return new Response('upstream down', { status: 503 })
      if (mode === 'malformed')
        return chat('{"not":"the contract"}', { prompt: 900, completion: 40 })
      return chat(
        JSON.stringify(stage === 'understand' ? options.brief : copySetFor(options.set)),
        stage === 'understand' ? { prompt: 900, completion: 300 } : { prompt: 800, completion: 120 },
      )
    }
    if (url.hostname === 'api.cloudflare.com') {
      calls.cloudflare += 1
      const mode = options.design ?? 'ok'
      if (mode === 'server_error') return new Response('upstream down', { status: 503 })
      if (mode === 'malformed') return chat('{"concepts":[]}', { prompt: 1_500, completion: 40 })
      return chat(JSON.stringify(options.set), { prompt: 1_500, completion: 900 })
    }
    throw new Error(`a test tried to reach ${url.href}; only the free route may be called`)
  }) as typeof fetch
  return { fetch: fetchImpl, calls }
}

export function freeEnv(db: unknown, keys = true) {
  return {
    DB: db,
    ...(keys
      ? { GROQ_API_KEY: GROQ_KEY, CLOUDFLARE_ACCOUNT_ID: CF_ACCOUNT, CLOUDFLARE_API_TOKEN: CF_TOKEN }
      : {}),
  } as { DB: unknown } & Record<string, string | undefined>
}
