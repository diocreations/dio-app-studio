// One-off gallery: every trade demo rendered side by side for comparison.
import { renderApp } from '../src/worker/app'
import { buildSpec } from '../src/worker/pricing'

const TRADES = [
  { key: 'restaurant', name: 'Trattoria Vela', vertical: 'restaurant', accent: '#c8452b', logo: 'TV' },
  { key: 'cafe', name: 'Ember Coffee', vertical: 'cafe', accent: '#8a5a2b', logo: 'EC' },
  { key: 'salon', name: 'Marlow & Co', vertical: 'salon', accent: '#7a4b8f', logo: 'MC' },
  { key: 'gym', name: 'Ironworks', vertical: 'gym', accent: '#1f6b52', logo: 'IW' },
  { key: 'shop', name: 'Fern & Flint', vertical: 'shop', accent: '#2a5a8f', logo: 'FF' },
  { key: 'clinic', name: 'Wellfield Dental', vertical: 'clinic', accent: '#2a5a8f', logo: 'WD' },
  { key: 'trades', name: 'Rook Plumbing', vertical: 'trades', accent: '#a8741a', logo: 'RP' },
  { key: 'hotel', name: 'Harbour House', vertical: 'hotel', accent: '#1f6b52', logo: 'HH' },
  { key: 'property', name: 'Kestrel & Co', vertical: 'property', accent: '#5b3f8f', logo: 'KC' },
  { key: 'professional', name: 'Cornfield & Co', vertical: 'professional', accent: '#111a24', logo: 'CC' },
  { key: 'studio', name: 'Northlight Studio', vertical: 'studio', accent: '#e2522d', logo: 'NS' },
  { key: 'auto', name: 'Dock Road Motors', vertical: 'auto', accent: '#2a5a8f', logo: 'DM' },
] as const

const scale = 0.54
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
    <figcaption><b>${trade.name}</b><span>${trade.key}</span></figcaption>
  </figure>`
}).join('\n')

const sheet = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><title>Plattr · twelve trades</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 30px 32px 44px; background: #f2f1ec; color: #17212b; font-family: ui-sans-serif, system-ui, sans-serif; }
  h1 { font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; margin: 0 0 6px; }
  p { margin: 0 0 24px; font-size: 12px; color: #65707b; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(215px, 1fr)); gap: 24px 18px; align-items: start; }
  figure { margin: 0; }
  .phone { width: 100%; aspect-ratio: 390 / 800; border-radius: 20px; overflow: hidden; background: #fff; border: 1px solid #deded7; box-shadow: 0 18px 34px -26px rgba(0,0,0,.55); }
  iframe { width: 390px; height: 800px; border: 0; display: block; transform: scale(${scale}); transform-origin: top left; }
  figcaption { display: flex; justify-content: space-between; gap: 8px; margin-top: 9px; font-size: 11px; }
  figcaption b { font-weight: 700; }
  figcaption span { color: #7a848e; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; }
</style></head>
<body>
  <h1>Plattr · twelve trades, one generator</h1>
  <p>Each phone is a separate generated app with its own trade vocabulary, palette, typography, navigation and home composition.</p>
  <div class="grid">${cards}</div>
</body></html>`

await Bun.write('screenshots/trades.html', sheet)
console.log(`wrote screenshots/trades.html (${TRADES.length} trades, ${sheet.length} bytes)`)
