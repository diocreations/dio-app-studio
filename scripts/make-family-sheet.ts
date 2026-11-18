// Review sheet for the twelve trade design families.
import { renderApp } from '../src/worker/app'
import { buildSpec } from '../src/worker/pricing'

const TRADES = [
  {
    key: 'restaurant',
    name: 'Trattoria Vela',
    vertical: 'restaurant',
    accent: '#c8452b',
    logo: 'TV',
    family: 'Printed menu',
    notes: 'Double-rule masthead · serif bill of fare · hairline rows · margin rules',
  },
  {
    key: 'cafe',
    name: 'Ember Coffee',
    vertical: 'cafe',
    accent: '#8a5a2b',
    logo: 'EC',
    family: 'Arched window',
    notes: 'Cover window · arched photo tiles · serif labels · capsule nav',
  },
  {
    key: 'clinic',
    name: 'Wellfield Dental',
    vertical: 'clinic',
    accent: '#2a5a8f',
    logo: 'WD',
    family: 'Care panel',
    notes: 'Flat status hero · bordered care rows · compact sans · calm nav',
  },
  {
    key: 'shop',
    name: 'Fern & Flint',
    vertical: 'shop',
    accent: '#2a5a8f',
    logo: 'FF',
    family: 'Price-tag shelf',
    notes: 'Flat shelf cover · bordered product tiles · boxed prices · label chips',
  },
  {
    key: 'salon',
    name: 'Mallow Hair',
    vertical: 'salon',
    accent: '#a04a6a',
    logo: 'MH',
    family: 'Lookbook',
    notes: 'Arch portrait cover · hairline service lines · italic serif · thin nav rule',
  },
  {
    key: 'gym',
    name: 'Iron Yard',
    vertical: 'gym',
    accent: '#c8f14a',
    logo: 'IY',
    family: 'Scoreboard',
    notes: 'Split accent slab · condensed uppercase · mono figures · block nav',
  },
  {
    key: 'trades',
    name: 'Hale & Sons',
    vertical: 'trades',
    accent: '#b4451f',
    logo: 'HS',
    family: 'Work order',
    notes: 'Stamped spec plate · heavy rules · ticket chips · job-ticket nav',
  },
  {
    key: 'professional',
    name: 'Ashby Partners',
    vertical: 'professional',
    accent: '#1f4e79',
    logo: 'AP',
    family: 'Briefing',
    notes: 'Title-page hero · memo rows · ruled section heads · document dock',
  },
  {
    key: 'property',
    name: 'Lumen Estates',
    vertical: 'property',
    accent: '#2f5d50',
    logo: 'LE',
    family: 'Listing sheet',
    notes: 'Full-bleed photo · caption plate · square listing cards · small-caps specs',
  },
  {
    key: 'hotel',
    name: 'The Rowan',
    vertical: 'hotel',
    accent: '#c9a227',
    logo: 'TR',
    family: 'Suite card',
    notes: 'Key-card hero · wide serif · small-caps labels · plate nav',
  },
  {
    key: 'studio',
    name: 'Northlight',
    vertical: 'studio',
    accent: '#e6e6e6',
    logo: 'NL',
    family: 'Poster wall',
    notes: 'Inverted poster block · oversized uppercase · zero radius · rule nav',
  },
  {
    key: 'auto',
    name: 'Ridge Motors',
    vertical: 'auto',
    accent: '#b23b1e',
    logo: 'RM',
    family: 'Spec sheet',
    notes: 'Technical plate · condensed model names · mono figures · readout strip',
  },
] as const

const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
const still = `<style>
  .splash { display: none !important; }
  .screen.on { animation: none !important; opacity: 1 !important; visibility: visible !important; }
</style>`

const cards = TRADES.map((trade) => {
  const spec = buildSpec({ ...trade, features: [] })
  const html = renderApp(spec, { token: `demo-${trade.vertical}`, live: false }).replace('</head>', `${still}</head>`)
  return `<figure>
    <div class="phone"><iframe title="${trade.name}" srcdoc="${esc(html)}" scrolling="no"></iframe></div>
    <figcaption>
      <div class="caption-head"><b>${trade.name}</b><span>${trade.family}</span></div>
      <p>${trade.notes}</p>
    </figcaption>
  </figure>`
}).join('\n')

const sheet = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><title>Plattr · twelve design families</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 34px 34px 48px; background: #f2f1ec; color: #17212b; font-family: ui-sans-serif, system-ui, sans-serif; }
  h1 { font-size: 13px; letter-spacing: 0.12em; text-transform: uppercase; margin: 0 0 6px; }
  .lede { margin: 0 0 28px; font-size: 12px; color: #65707b; max-width: 70ch; }
  .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 22px; align-items: start; max-width: 1240px; }
  iframe { width: 100%; height: 100%; border: 0; display: block; }
  figure { margin: 0; }
  .phone { width: 100%; aspect-ratio: 390 / 800; border-radius: 24px; overflow: hidden; background: #fff; border: 1px solid #deded7; box-shadow: 0 20px 38px -28px rgba(0,0,0,.55); }
  figcaption { margin-top: 12px; }
  .caption-head { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
  .caption-head b { font-size: 13px; }
  .caption-head span { color: #7a848e; font-size: 9.5px; letter-spacing: .1em; text-transform: uppercase; }
  figcaption p { margin: 5px 0 0; font-size: 11px; line-height: 1.5; color: #65707b; }
  @media (max-width: 1080px) { .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  @media (max-width: 820px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 560px) { body { padding: 22px 14px 32px; } .grid { grid-template-columns: 1fr; max-width: 390px; } }
</style></head>
<body>
  <h1>Plattr · twelve trade design families</h1>
  <p class="lede">Every trade gets its own layout grammar, type scale, card language, hero treatment and nav — no shared shell recoloured. Restaurant, café and clinic were approved first; the other nine follow the same rule.</p>
  <div class="grid">${cards}</div>
</body></html>`

await Bun.write('screenshots/design-families.html', sheet)
console.log(`wrote screenshots/design-families.html (${TRADES.length} trades, ${sheet.length} bytes)`)
