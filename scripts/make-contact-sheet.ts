// Builds a one-off contact sheet of six variant builds of the same shop, so the
// styles can be compared side by side. Not part of the app.
import { renderApp } from '../src/worker/app'
import { buildSpec } from '../src/worker/pricing'

// Same demo the /demo/app route uses for the shop.
const spec = buildSpec({ name: 'Fern & Flint', vertical: 'shop', accent: '#2a5a8f', logo: 'FF', features: [] })

const variants = [0, 1, 2, 3, 4, 5]
const scale = 0.46
const esc = (html: string) => html.replace(/&/g, '&amp;').replace(/"/g, '&quot;')

const cells = variants
  .map((variant) => {
    const html = renderApp(spec, {
      token: 'demo-shop',
      live: false,
      preview: { variant, density: 'standard', corners: 'soft', media: 'photo' },
    })
    return `<figure>
      <div class="phone"><iframe title="variant ${variant}" srcdoc="${esc(html)}" scrolling="no"></iframe></div>
      <figcaption>variant ${variant}</figcaption>
    </figure>`
  })
  .join('\n')

const sheet = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><title>Six variants · one shop</title>
<style>
  body { margin: 0; padding: 26px 28px; background: #f4f4f0; font-family: ui-sans-serif, system-ui, sans-serif; }
  h1 { font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase; margin: 0 0 20px; color: #1c2430; }
  h1 span { display: block; font-size: 10.5px; letter-spacing: 0.04em; text-transform: none; color: #5b6672; margin-top: 6px; font-weight: 500; }
  .grid { display: flex; flex-wrap: wrap; gap: 18px; }
  figure { margin: 0; }
  .phone { width: ${Math.round(390 * scale)}px; height: ${Math.round(844 * scale)}px; border-radius: 18px; overflow: hidden; background: #fff; border: 1px solid #e2e2dc; box-shadow: 0 12px 30px -20px rgba(0,0,0,.45); }
  iframe { width: 390px; height: 844px; border: 0; transform: scale(${scale}); transform-origin: top left; }
  figcaption { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #4a5560; margin-top: 8px; }
</style></head>
<body>
  <h1>Fern &amp; Flint · one shop, six variant styles
    <span>Photos on, standard density, soft corners — only the variant axis differs.</span>
  </h1>
  <div class="grid">${cells}</div>
</body></html>`

await Bun.write('screenshots/sheet.html', sheet)
console.log('wrote screenshots/sheet.html', sheet.length, 'bytes for', variants.length, 'variants')
