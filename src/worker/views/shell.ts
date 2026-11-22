export function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function attr(value: string): string {
  return esc(value).replace(/'/g, '&#39;')
}

export const CSS = `
:root {
  --ink: #1b1410;
  --ink-soft: #3d3129;
  --paper: #fbf6ee;
  --paper-2: #f3ebe0;
  --card: #fffdf9;
  --line: rgba(27, 20, 16, 0.12);
  --line-soft: rgba(27, 20, 16, 0.07);
  --muted: #7b6b5e;
  --accent: #e2522d;
  --basil: #1f6b52;
  --amber: #a8741a;
  --radius: 20px;
  --shadow: 0 26px 60px -40px rgba(27, 20, 16, 0.5);
  --serif: ui-serif, "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
  --sans: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  background:
    radial-gradient(1200px 600px at 88% -8%, rgba(226, 82, 45, 0.1), transparent 60%),
    radial-gradient(900px 500px at 0% 0%, rgba(31, 107, 82, 0.08), transparent 55%),
    var(--paper);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 16px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}
h1, h2, h3, h4 { font-family: var(--serif); font-weight: 600; letter-spacing: -0.018em; margin: 0; line-height: 1.12; }
p { margin: 0; }
a { color: inherit; }
img, svg { max-width: 100%; }
.wrap { width: min(1140px, 100% - 40px); margin-inline: auto; }
.wrap-narrow { width: min(820px, 100% - 40px); margin-inline: auto; }

/* nav */
.nav {
  position: sticky; top: 0; z-index: 40;
  display: flex; align-items: center; gap: 22px;
  padding: 14px 0;
  background: color-mix(in srgb, var(--paper) 86%, transparent);
  backdrop-filter: blur(14px);
  border-bottom: 1px solid var(--line-soft);
}
.nav .wrap { display: flex; align-items: center; gap: 22px; }
.brand { display: flex; align-items: center; gap: 10px; text-decoration: none; font-weight: 700; letter-spacing: -0.03em; font-size: 19px; }
.brand .glyph {
  width: 30px; height: 30px; border-radius: 9px; background: var(--ink); color: var(--paper);
  display: grid; place-items: center; font-family: var(--serif); font-size: 16px; font-weight: 600;
}
.nav-links { display: flex; gap: 18px; margin-left: auto; align-items: center; }
.nav-links a { font-size: 14px; color: var(--muted); text-decoration: none; }
.nav-links a:hover { color: var(--ink); }

/* type */
.eyebrow {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 11.5px; font-weight: 650; letter-spacing: 0.13em; text-transform: uppercase;
  color: var(--muted);
}
.eyebrow::before { content: ""; width: 22px; height: 1px; background: var(--accent); }
h1.display { font-size: clamp(38px, 5.4vw, 66px); }
h2.section { font-size: clamp(26px, 3.2vw, 38px); }
.lede { font-size: clamp(16px, 1.5vw, 19px); color: var(--ink-soft); line-height: 1.6; max-width: 60ch; }
.small { font-size: 13px; color: var(--muted); }
.tiny { font-size: 11.5px; color: var(--muted); letter-spacing: 0.02em; }
.mono { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace; font-size: 12.5px; }

/* buttons */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  border: 1px solid var(--line); background: var(--card); color: var(--ink);
  border-radius: 12px; padding: 12px 18px; font-size: 14px; font-weight: 600;
  text-decoration: none; cursor: pointer; font-family: inherit;
  transition: transform 0.12s ease, box-shadow 0.15s ease, background 0.15s ease;
}
.btn:hover { box-shadow: 0 8px 22px -16px rgba(27,20,16,0.6); }
.btn:active { transform: translateY(1px); }
.btn.primary { background: var(--ink); color: var(--paper); border-color: var(--ink); }
.btn.accent { background: var(--accent); color: #fff; border-color: var(--accent); }
.btn.ghost { background: transparent; }
.btn.small { padding: 8px 12px; font-size: 12.5px; border-radius: 9px; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: none; }
.linkish { background: none; border: 0; color: var(--accent); font: inherit; font-weight: 600; padding: 0; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }

/* surfaces */
.card {
  background: var(--card); border: 1px solid var(--line); border-radius: var(--radius);
  padding: 22px; box-shadow: var(--shadow);
}
.card.flat { box-shadow: none; }
.card h3 { font-size: 19px; }
.card h3 + p { margin-top: 6px; }
.card-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.stack { display: grid; gap: 14px; }
.grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.pill {
  display: inline-flex; align-items: center; gap: 6px; border-radius: 999px;
  padding: 4px 10px; font-size: 11.5px; font-weight: 650; letter-spacing: 0.02em;
  background: var(--paper-2); border: 1px solid var(--line); color: var(--ink-soft);
  white-space: nowrap;
}
.pill.green { background: #e8f4ed; border-color: #cfe7da; color: #1c6146; }
.pill.amber { background: #fbf1dd; border-color: #f0e0bd; color: #8a621a; }
.pill.accent { background: #fdeee8; border-color: #f6d7ca; color: #b0401f; }
.pill.dark { background: var(--ink); border-color: var(--ink); color: var(--paper); }
.dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.notice {
  border: 1px solid var(--line); background: var(--paper-2); border-radius: 14px;
  padding: 14px 16px; font-size: 13px; color: var(--ink-soft); line-height: 1.55;
}
.notice strong { color: var(--ink); }
.notice.accent { background: #fdf0ea; border-color: #f4d9cd; }
.hr { height: 1px; background: var(--line-soft); border: 0; margin: 18px 0; }

/* forms */
.field { display: grid; gap: 7px; margin-bottom: 14px; }
.field > label, .label { font-size: 12.5px; font-weight: 650; letter-spacing: 0.02em; color: var(--ink-soft); }
.field .hint { font-size: 12px; color: var(--muted); }
input[type="text"], input[type="email"], input[type="tel"], input[type="number"], select, textarea {
  width: 100%; border: 1px solid var(--line); background: #fffdf9; color: var(--ink);
  border-radius: 11px; padding: 11px 13px; font-family: inherit; font-size: 14px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
input:focus, select:focus, textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(226, 82, 45, 0.14); }
textarea { resize: vertical; min-height: 84px; }
.checks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
.check {
  display: flex; gap: 10px; align-items: flex-start;
  border: 1px solid var(--line); border-radius: 13px; padding: 12px;
  background: #fffdf9; cursor: pointer; transition: border-color 0.15s ease, background 0.15s ease;
}
.check:hover { border-color: rgba(27,20,16,0.28); }
.check:has(input:checked) { border-color: var(--accent); background: #fdf3ee; }
.check input { margin: 2px 0 0; accent-color: var(--accent); width: 15px; height: 15px; flex: 0 0 auto; }
.check b { display: block; font-size: 13.5px; font-weight: 650; }
.check span { display: block; font-size: 11.5px; color: var(--muted); line-height: 1.4; margin-top: 2px; }
.check .fee { float: right; font-size: 11.5px; color: var(--muted); font-variant-numeric: tabular-nums; }
.swatches { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.swatch {
  width: 30px; height: 30px; border-radius: 9px; border: 2px solid transparent; cursor: pointer;
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.08); padding: 0;
}
.swatch[aria-pressed="true"] { border-color: var(--ink); }
.seg { display: inline-grid; grid-auto-flow: column; gap: 4px; background: var(--paper-2); padding: 4px; border-radius: 12px; }
.seg button { border: 0; background: transparent; padding: 9px 14px; border-radius: 9px; font-weight: 600; font-size: 13px; color: var(--muted); cursor: pointer; font-family: inherit; }
.seg button[aria-pressed="true"] { background: var(--card); color: var(--ink); box-shadow: 0 1px 4px rgba(0,0,0,0.07); }

/* phone frame */
.phone {
  width: 100%; max-width: 372px; margin-inline: auto; padding: 10px;
  background: linear-gradient(160deg, #2a2019, #171110);
  border-radius: 42px; box-shadow: 0 40px 70px -34px rgba(27,20,16,0.55), inset 0 0 0 1px rgba(255,255,255,0.08);
  position: relative;
}
.phone::before {
  content: ""; position: absolute; top: 18px; left: 50%; transform: translateX(-50%);
  width: 84px; height: 20px; border-radius: 999px; background: #0c0908; z-index: 3;
}
.phone iframe {
  display: block; width: 100%; height: 660px; border: 0; border-radius: 33px; background: #fbf7f1;
}
.phone.tall iframe { height: 740px; }
.phone-sticky { position: sticky; top: 84px; }

/* misc lists */
.ticks { display: grid; gap: 9px; padding: 0; margin: 0; list-style: none; }
.ticks li { display: flex; gap: 9px; font-size: 13.5px; color: var(--ink-soft); align-items: flex-start; }
.ticks li::before { content: "✓"; color: var(--basil); font-weight: 700; font-size: 12px; margin-top: 3px; }
.feature-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.rows { display: grid; }
.row { display: flex; justify-content: space-between; gap: 14px; padding: 9px 0; border-bottom: 1px dashed var(--line-soft); font-size: 13.5px; }
.row:last-child { border-bottom: 0; }
.row strong { font-variant-numeric: tabular-nums; }
.row.total { border-top: 1px solid var(--line); border-bottom: 0; padding-top: 12px; font-weight: 700; font-family: var(--serif); font-size: 17px; }

.toast {
  position: fixed; left: 50%; bottom: 26px; transform: translate(-50%, 16px);
  background: var(--ink); color: var(--paper); padding: 11px 18px; border-radius: 999px;
  font-size: 13px; opacity: 0; pointer-events: none; transition: all 0.24s ease; z-index: 60;
  box-shadow: 0 18px 40px -22px rgba(0,0,0,0.6);
}
.toast.on { opacity: 1; transform: translate(-50%, 0); }

.timeline { list-style: none; margin: 0; padding: 0; display: grid; gap: 0; }
.timeline li { display: grid; grid-template-columns: 16px 1fr; gap: 12px; padding-bottom: 16px; position: relative; }
.timeline li::before {
  content: ""; width: 9px; height: 9px; border-radius: 50%; background: var(--accent);
  margin-top: 5px; box-shadow: 0 0 0 3px #fdf0ea;
}
.timeline li::after { content: ""; position: absolute; left: 4px; top: 18px; bottom: 0; width: 1px; background: var(--line); }
.timeline li:last-child::after { display: none; }
.timeline b { font-size: 13.5px; font-weight: 650; display: block; }
.timeline span { font-size: 12px; color: var(--muted); display: block; }
.timeline time { font-size: 11px; color: var(--muted); display: block; margin-top: 2px; }

.section-note { border-left: 2px solid var(--accent); padding-left: 14px; font-size: 13px; color: var(--ink-soft); }

footer.site { border-top: 1px solid var(--line-soft); margin-top: 70px; padding: 30px 0 50px; }
footer.site .wrap { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; justify-content: space-between; }

details.faq { border-bottom: 1px solid var(--line-soft); padding: 15px 0; }
details.faq summary { cursor: pointer; font-weight: 600; font-size: 15px; list-style: none; display: flex; justify-content: space-between; gap: 12px; }
details.faq summary::-webkit-details-marker { display: none; }
details.faq summary::after { content: "+"; color: var(--muted); font-weight: 400; font-size: 18px; line-height: 1; }
details.faq[open] summary::after { content: "−"; }
details.faq p { margin-top: 9px; font-size: 13.5px; color: var(--muted); line-height: 1.6; max-width: 74ch; }

@media (max-width: 900px) {
  .grid-3 { grid-template-columns: 1fr; }
  .grid-2 { grid-template-columns: 1fr; }
  .checks { grid-template-columns: 1fr; }
  .phone iframe { height: 600px; }
  .phone-sticky { position: static; }
}
@media (max-width: 760px) {
  .nav-links { gap: 8px; }
  .nav-links a:not(.btn) { display: none; }
  .nav .wrap { gap: 10px; }
}
`

export function page(options: {
  title: string
  description?: string
  body: string
  active?: 'home' | 'studio'
  script?: string
  bare?: boolean
  /** Private pages: keep them out of search results entirely. */
  noindex?: boolean
}): string {
  const nav = `
  <nav class="nav">
    <div class="wrap">
      <a class="brand" href="/"><span class="glyph">p</span>plattr</a>
      <div class="nav-links">
        <a href="/#how">How it works</a>
        <a href="/#proof">Live example</a>
        <a href="/#concepts">Concepts</a>
        <a href="/studio"${options.active === 'studio' ? ' style="color:var(--ink);font-weight:600"' : ''}>Studio</a>
        <a class="btn primary small" href="/start">Build from a URL</a>
      </div>
    </div>
  </nav>`

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(options.title)}</title>
${options.description ? `<meta name="description" content="${attr(options.description)}" />` : ''}
<meta name="theme-color" content="#fbf6ee" />
${options.noindex ? '<meta name="robots" content="noindex, nofollow" />' : ''}
<link rel="icon" href="/favicon.ico" sizes="32x32" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<style>${CSS}</style>
</head>
<body>
${options.bare ? '' : nav}
${options.body}
${options.bare ? '' : `<footer class="site"><div class="wrap"><span class="tiny">Plattr · a working web app from the business you already have</span><span class="tiny">Every build is reviewed by its owner before publishing. <a href="/privacy">Privacy &amp; terms</a></span></div></footer>`}
<div class="toast" data-toast></div>
${options.script ? `<script>${options.script}</script>` : ''}
</body>
</html>`
}
