import { contrast } from './design'
import type { Theme } from './themes'

/**
 * The app stylesheet. One code path, twenty-seven themes: every value that changes
 * with the trade (palette, type, radius, nav, motif) arrives as a token, so the
 * components below can stay opinionated about craft — layered elevation,
 * hairline rules, editorial type — without knowing the trade.
 */

export type CssCtx = {
  theme: Theme
  accent: string
  onAccent: string
  /** Per-build corner language multiplier on the trade's radius. */
  radiusScale?: number
}

const SERIF_FALLBACK = 'ui-serif, Georgia, serif'

export function appCss(ctx: CssCtx): string {
  const radius = Math.round(ctx.theme.radius * (ctx.radiusScale ?? 1))
  const navSpace = ctx.theme.nav === 'floating' ? '108px' : '88px'
  const priceFont =
    ctx.theme.priceFont === 'mono'
      ? 'ui-monospace, "SF Mono", Menlo, monospace'
      : ctx.theme.priceFont === 'display'
        ? 'var(--display)'
        : 'var(--body)'
  const display = ctx.theme.display.includes('serif') ? ctx.theme.display : SERIF_FALLBACK
  // An imported palette can hand us ink and bg that are nearly the same colour.
  // The active chip is the app's selection state, so it gets its own guaranteed
  // contrasting pair instead of trusting the site's two tokens.
  const fallbackInk = contrast('#ffffff', ctx.theme.bg) >= contrast('#0b0b0c', ctx.theme.bg) ? '#ffffff' : '#0b0b0c'
  const chipOn = contrast(ctx.theme.ink, ctx.theme.bg) >= 4.5 ? ctx.theme.ink : fallbackInk
  const chipOnInk = contrast(ctx.theme.bg, chipOn) >= 4.5 ? ctx.theme.bg : chipOn === '#ffffff' ? '#0b0b0c' : '#ffffff'

  return `
:root {
  --bg: ${ctx.theme.bg};
  --surface: ${ctx.theme.surface};
  --surface-2: ${ctx.theme.surface2};
  --ink: ${ctx.theme.ink};
  --muted: ${ctx.theme.muted};
  --line: ${ctx.theme.line};
  --accent: ${ctx.accent};
  --on-accent: ${ctx.onAccent};
  --chip-on: ${chipOn};
  --chip-on-ink: ${chipOnInk};
  --accent-soft: color-mix(in srgb, var(--accent) 13%, transparent);
  --accent-ring: color-mix(in srgb, var(--accent) 34%, transparent);
  --accent-deep: color-mix(in srgb, var(--accent) 72%, #000 28%);
  /* The accent as a text colour. On a light page the brand colour itself is
     readable; on a dark page it is not, so it is lifted towards the ink. */
  --accent-text: var(--accent);
  /* Secondary text. A label drawn at 50% opacity can never reach 4.5:1 on any
     ground, so quiet text gets a colour instead: the ink mixed back towards the
     page, which reads as secondary in both themes and still measures above AA. */
  --ink-soft: color-mix(in srgb, var(--ink) 78%, var(--bg));
  --hair: color-mix(in srgb, var(--ink) 10%, transparent);
  --radius: ${radius}px;
  --display: ${ctx.theme.display};
  --display-serif: ${display};
  --body: ${ctx.theme.body};
  --weight: ${ctx.theme.weight};
  --tracking: ${ctx.theme.tracking};
  --nav-space: ${navSpace};
  --price-font: ${priceFont};
  --shadow-1: 0 2px 8px -6px color-mix(in srgb, #000 16%, transparent), 0 10px 22px -20px color-mix(in srgb, #000 22%, transparent);
  --shadow-2: 0 8px 20px -14px color-mix(in srgb, #000 16%, transparent), 0 24px 44px -28px color-mix(in srgb, #000 30%, transparent);
  --shadow-3: 0 22px 48px -26px color-mix(in srgb, #000 36%, transparent);
  --r-card: ${Math.round(radius * 1.1)}px;
  --r-media: ${Math.max(12, Math.round(radius * 0.78))}px;
  --edge: inset 0 1px 0 color-mix(in srgb, #fff 14%, transparent);
  --ease: cubic-bezier(0.22, 0.9, 0.24, 1);
  /* Type and space scales are shared by every direction. A direction changes
     the family, weight and rhythm, never the underlying steps. */
  --text-2xs: 10px; --text-xs: 11.5px; --text-sm: 13px; --text-md: 15px;
  --text-lg: 18px; --text-xl: 24px; --text-2xl: 32px; --text-3xl: clamp(34px, 10vw, 46px);
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px;
  --space-5: 22px; --space-6: 30px; --space-7: 40px;
  --r-xs: 6px; --r-sm: 10px; --r-md: 16px; --r-lg: 24px; --r-full: 999px;
  --dur-fast: 140ms; --dur-base: 240ms; --dur-slow: 380ms;
  --tap: 44px; --safe-top: env(safe-area-inset-top); --safe-bottom: env(safe-area-inset-bottom);
}

* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
html, body { margin: 0; height: 100%; }
body {
  background: var(--bg); color: var(--ink);
  font-family: var(--body); font-size: 15px; line-height: 1.5;
  overscroll-behavior: none; user-select: none; -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
input, textarea { font: inherit; user-select: text; }
h1, h2, h3 {
  font-family: var(--display); font-weight: var(--weight); letter-spacing: var(--tracking);
  margin: 0; line-height: 1.02; text-wrap: balance;
}
p { margin: 0; }
ul { margin: 0; padding: 0; list-style: none; }
body[data-theme="dark"] {
  --hair: color-mix(in srgb, var(--ink) 20%, transparent);
  --shadow-1: inset 0 1px 0 color-mix(in srgb, #fff 5%, transparent);
  --shadow-2: 0 24px 50px -30px #000;
  --accent-text: color-mix(in srgb, var(--accent) 42%, var(--ink));
}

.app { position: fixed; inset: 0; display: flex; flex-direction: column; overflow: hidden; background: var(--bg); }
/* A wash of the brand colour at the top of the page — depth without noise. */
.app::before {
  content: ""; position: absolute; inset: 0 0 auto; height: 470px; pointer-events: none;
  background:
    radial-gradient(120% 80% at 6% -20%, color-mix(in srgb, var(--accent) 24%, transparent), transparent 66%),
    radial-gradient(90% 60% at 100% -8%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 70%);
}
.grain {
  position: absolute; inset: 0; pointer-events: none; z-index: 80; opacity: 0.03; mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/></filter><rect width='140' height='140' filter='url(%23n)' opacity='0.55'/></svg>");
}

/* ---------------------------------------------------------------- splash */
.splash {
  position: absolute; inset: 0; z-index: 100; display: grid; place-content: center; justify-items: center; gap: 14px;
  padding: 40px 30px; color: var(--on-accent);
  background:
    radial-gradient(120% 80% at 24% 2%, color-mix(in srgb, #fff 24%, transparent), transparent 62%),
    linear-gradient(168deg, color-mix(in srgb, var(--accent) 92%, #fff 8%), var(--accent-deep));
  transition: opacity 0.5s ease, visibility 0.5s ease;
}
.splash .s-mark {
  position: relative; width: 96px; height: 96px; border-radius: 32px;
  background: color-mix(in srgb, var(--on-accent) 96%, transparent); color: var(--accent-text);
  display: grid; place-items: center;
  font-family: var(--display); font-weight: 800; font-size: 30px; letter-spacing: 0.01em;
  box-shadow: 0 26px 50px -24px color-mix(in srgb, #000 45%, transparent);
  animation: pop 0.7s var(--ease) both;
}
.splash .s-mark::after {
  content: ""; position: absolute; inset: -10px; border-radius: inherit;
  border: 1px solid color-mix(in srgb, var(--on-accent) 34%, transparent);
  opacity: 0; animation: halo 1.5s ease 0.25s forwards;
}
.splash b {
  font-family: var(--display); font-weight: var(--weight); letter-spacing: var(--tracking);
  font-size: 28px; color: var(--on-accent); animation: rise 0.7s var(--ease) 0.08s both;
}
.splash span {
  font-size: 9.5px; letter-spacing: 0.28em; text-transform: uppercase;
  color: color-mix(in srgb, var(--on-accent) 74%, transparent);
  animation: rise 0.7s var(--ease) 0.16s both;
}
.splash::after {
  content: ""; width: 52px; height: 3px; border-radius: 2px; margin-top: 10px;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--on-accent) 82%, transparent), transparent);
  animation: sweep 1.4s var(--ease) infinite;
}
.splash.gone { opacity: 0; visibility: hidden; }
.splash { animation: splashOut 0.5s ease 1.2s forwards; }
@keyframes splashOut { to { opacity: 0; visibility: hidden; } }
@keyframes pop { from { opacity: 0; transform: scale(0.86); } to { opacity: 1; transform: none; } }
@keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes halo { from { opacity: 0; transform: scale(0.9); } 40% { opacity: 0.7; } to { opacity: 0; transform: scale(1.12); } }
@keyframes sweep { 0% { opacity: 0.2; transform: scaleX(0.4); } 50% { opacity: 1; transform: scaleX(1); } 100% { opacity: 0.2; transform: scaleX(0.4); } }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; animation-delay: 0ms !important; transition-duration: 0.01ms !important; }
}

/* ---------------------------------------------------------------- chrome */
.appbar {
  flex: 0 0 auto; position: relative; z-index: 20; display: flex; align-items: center; gap: 8px;
  padding: calc(10px + env(safe-area-inset-top)) 16px 9px;
  background: color-mix(in srgb, var(--bg) 78%, transparent);
  backdrop-filter: blur(22px) saturate(150%); -webkit-backdrop-filter: blur(22px) saturate(150%);
  border-bottom: 1px solid transparent; transition: border-color 0.2s ease;
}
body[data-layout="rows"] .appbar, body[data-layout="grid"] .appbar { border-bottom-color: var(--hair); }
.appbar .mark {
  width: 32px; height: 32px; flex: 0 0 auto; border-radius: ${Math.max(10, radius * 0.42)}px;
  background: linear-gradient(150deg, color-mix(in srgb, var(--accent) 94%, #fff 6%), var(--accent-deep));
  color: var(--on-accent); display: grid; place-items: center;
  font-family: var(--display); font-weight: 800; font-size: 12.5px; letter-spacing: 0.04em;
  box-shadow: 0 8px 18px -12px var(--accent), var(--edge);
}
.appbar .mark.is-logo { background: transparent; box-shadow: none; padding: 0; width: auto; min-width: 26px; max-width: 104px; }
.appbar .mark.is-logo img { height: 26px; width: auto; max-width: 104px; object-fit: contain; display: block; }
.splash .s-mark.is-logo { background: color-mix(in srgb, #fff 94%, transparent); padding: 14px; }
.splash .s-mark.is-logo img { height: 60px; width: auto; max-width: 120px; object-fit: contain; display: block; }
.appbar .titles { flex: 1; min-width: 0; display: grid; gap: 2px; }
.appbar .kicker {
  display: block; font-size: 8.5px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase;
  color: var(--muted);
}
.appbar .title {
  display: block; font-family: var(--display); font-weight: var(--weight); letter-spacing: var(--tracking);
  font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.iconbtn {
  width: 34px; height: 34px; flex: 0 0 auto; border-radius: 999px; display: grid; place-items: center;
  border: 1px solid var(--hair); color: var(--ink);
  background: color-mix(in srgb, var(--surface) 76%, transparent);
  box-shadow: var(--shadow-1); transition: transform 0.14s var(--ease), background 0.2s ease;
}
.iconbtn svg { width: 15px; height: 15px; }
.iconbtn:active { transform: scale(0.93); }
.iconbtn .count {
  position: absolute; top: -3px; right: -3px; min-width: 17px; height: 17px; padding: 0 4px; border-radius: 9px;
  background: var(--accent); color: var(--on-accent); font-size: 10px; font-weight: 750;
  display: grid; place-items: center; box-shadow: 0 0 0 2px var(--bg);
}

/* [hidden] has to win: components below set their own display, which would
   otherwise keep badges, the back button and the offline pill on screen. */
[hidden] { display: none !important; }

/* --------------------------------------------------------------- screens */
.screens { flex: 1; position: relative; overflow: hidden; }
.screen {
  position: absolute; inset: 0; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch;
  padding: 10px 18px calc(var(--nav-space) + 26px); opacity: 0; visibility: hidden;
}
.screen > * { max-width: 620px; margin-inline: auto; }
.screen.on { opacity: 1; visibility: visible; animation: screenIn 0.36s var(--ease) both; }
.screen.on.is-detail { animation: pushIn 0.36s var(--ease) both; }
@keyframes screenIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes pushIn { from { opacity: 0.25; transform: translateX(34px); } to { opacity: 1; transform: none; } }

/* ------------------------------------------------------------------ type */
.display { font-size: clamp(30px, 9vw, 40px); line-height: 0.98; }
h2 { font-size: 19px; }
h3 { font-size: 16px; }
.label {
  display: block; font-size: 9.5px; font-weight: 750; letter-spacing: 0.2em; text-transform: uppercase;
  color: var(--muted);
}
.eyebrow {
  display: inline-flex; align-items: center; gap: 8px; font-size: 9.5px; font-weight: 750;
  letter-spacing: 0.2em; text-transform: uppercase; color: var(--muted);
}
.eyebrow::before {
  content: ""; width: 18px; height: 1px; background: currentColor; opacity: 0.6;
}
.dim { color: var(--muted); }
.tiny { font-size: 11.5px; line-height: 1.55; }
.tag {
  display: inline-block; font-size: 8.5px; font-weight: 750; letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--accent-text); background: var(--accent-soft); padding: 3px 7px; border-radius: 999px;
  vertical-align: 2px;
}
.price {
  font-family: var(--price-font); font-variant-numeric: tabular-nums; font-weight: 650;
  letter-spacing: -0.015em;
}
.rule { height: 1px; background: var(--hair); border: 0; margin: 0; }

/* --------------------------------------------------------------- buttons */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 14px 20px;
  border-radius: ${Math.max(10, Math.round(radius * 0.7))}px; font-weight: 650; font-size: 14px; text-decoration: none;
  letter-spacing: -0.005em; background: var(--ink); color: var(--bg);
  transition: transform 0.14s var(--ease), box-shadow 0.2s ease, opacity 0.15s ease;
  box-shadow: var(--shadow-1);
}
.btn:active { transform: scale(0.975); }
.btn.accent {
  background: linear-gradient(150deg, color-mix(in srgb, var(--accent) 94%, #fff 6%), var(--accent-deep));
  color: var(--on-accent); box-shadow: 0 14px 28px -18px var(--accent), var(--edge);
}
.btn.ghost {
  background: color-mix(in srgb, var(--surface) 70%, transparent); color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--hair), var(--shadow-1);
}
.btn.block { width: 100%; }
.btn.small { padding: 9px 16px; font-size: 12px; border-radius: ${Math.max(8, Math.round(radius * 0.55))}px; }
.btn svg { width: 16px; height: 16px; }
body[data-accent-style="block"] .btn.ghost { box-shadow: inset 0 -3px 0 0 var(--accent), var(--shadow-1); }
body[data-accent-style="underline"] .sect { border-bottom: 1px solid var(--hair); padding-bottom: 8px; }
.actions { display: flex; flex-wrap: wrap; gap: 9px; margin: 18px 0 6px; }
.actions .btn { flex: 1 1 auto; }

/* -------------------------------------------------------------- sections */
.sect {
  display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin: 30px 0 12px;
}
.sect .label { margin: 0; }
.sect .count {
  font-size: 10.5px; font-weight: 750; letter-spacing: 0.02em; color: var(--accent-text);
  border: 1px solid transparent; border-radius: 999px; padding: 4px 10px;
  font-variant-numeric: tabular-nums; background: var(--accent-soft);
}
.card {
  background: var(--surface); border: 1px solid var(--hair); border-radius: var(--radius);
  overflow: hidden; box-shadow: var(--shadow-1);
}

/* --------------------------------------------------------------- artwork */
.thumb {
  position: relative; display: block; overflow: hidden; isolation: isolate;
  background:
    linear-gradient(148deg, color-mix(in srgb, var(--accent) 92%, #fff 8%), var(--accent-deep));
}
.thumb .mono {
  position: absolute; inset: 0; display: grid; place-items: center; font-family: var(--display);
  font-weight: 800; font-size: 40px; letter-spacing: -0.045em; color: var(--on-accent); opacity: 0.9;
}
.thumb::after {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background:
    radial-gradient(circle at 78% 10%, color-mix(in srgb, #fff 42%, transparent), transparent 44%),
    radial-gradient(circle at 12% 96%, color-mix(in srgb, #000 22%, transparent), transparent 56%);
}
.thumb::before { content: ""; position: absolute; z-index: 1; }
.thumb .photo, .hero-art .photo, .cover-art .photo {
  position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
  z-index: 2; display: block;
}
.hero-art { position: absolute; inset: 0; z-index: 0; }
.hero-art::before { content: ""; position: absolute; z-index: 1; }
.m-circle::before {
  width: 120%; aspect-ratio: 1; border-radius: 50%; border: 1px solid color-mix(in srgb, var(--on-accent) 42%, transparent);
  left: -18%; top: 26%;
}
.m-arches::before {
  width: 78%; aspect-ratio: 1 / 1.1; left: 11%; top: 22%;
  border: 1px solid color-mix(in srgb, var(--on-accent) 44%, transparent);
  border-radius: 50% 50% 0 0; box-shadow: 0 0 0 1px color-mix(in srgb, var(--on-accent) 16%, transparent) inset;
}
.m-stripes::before {
  inset: 0; background: repeating-linear-gradient(112deg, color-mix(in srgb, var(--on-accent) 26%, transparent) 0 1px, transparent 1px 14px);
}
.m-grid::before {
  inset: 0; opacity: 0.7;
  background:
    linear-gradient(color-mix(in srgb, var(--on-accent) 28%, transparent) 1px, transparent 1px) 0 0 / 100% 22px,
    linear-gradient(90deg, color-mix(in srgb, var(--on-accent) 28%, transparent) 1px, transparent 1px) 0 0 / 22px 100%;
}
.m-rings::before {
  width: 150%; aspect-ratio: 1; left: -25%; top: -20%; border-radius: 50%;
  background: repeating-radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--on-accent) 28%, transparent) 0 1px, transparent 1px 18px);
}
.m-letter::before {
  content: "Aa"; font-family: var(--display-serif); font-size: 96px;
  color: color-mix(in srgb, var(--on-accent) 22%, transparent); left: 8%; bottom: -22px; line-height: 1;
}

/* ------------------------------------------------------------------ hero */
.l-hero {
  position: relative; border-radius: var(--r-card); overflow: hidden; min-height: 296px;
  display: flex; align-items: flex-end; padding: 24px 22px;
  color: var(--on-accent); isolation: isolate;
  background:
    linear-gradient(165deg, color-mix(in srgb, var(--accent) 90%, #fff 10%) 0%, var(--accent) 48%, var(--accent-deep) 100%);
  box-shadow: var(--shadow-3), var(--edge);
}
.l-hero::after {
  content: ""; position: absolute; inset: 0; z-index: 1; pointer-events: none;
  background: linear-gradient(180deg, color-mix(in srgb, #000 6%, transparent), transparent 38%, color-mix(in srgb, #000 30%, transparent));
}
.l-hero .hero-art { background: inherit; }
.l-hero .hero-art .mono {
  position: absolute; right: 16px; top: 8px; font-family: var(--display); font-size: 96px;
  line-height: 1; letter-spacing: -0.05em; opacity: 0.18; color: var(--on-accent);
}
.l-hero .hero-in { position: relative; z-index: 2; width: 100%; }
.l-hero .eyebrow { color: color-mix(in srgb, var(--on-accent) 72%, transparent); }
.l-hero .eyebrow::before { background: currentColor; }
.l-hero h1 { font-size: clamp(32px, 10vw, 46px); margin-top: 12px; text-shadow: 0 1px 20px color-mix(in srgb, #000 12%, transparent); }
.l-hero p {
  margin-top: 10px; font-size: 13.5px; line-height: 1.55; max-width: 28ch;
  color: color-mix(in srgb, var(--on-accent) 84%, transparent);
}
.l-hero .hero-foot {
  display: flex; align-items: center; gap: 12px; margin-top: 20px; flex-wrap: wrap;
}
.l-hero .hero-cta {
  background: color-mix(in srgb, var(--on-accent) 96%, transparent); color: var(--accent-text);
  padding: 12px 20px; font-size: 13px; box-shadow: 0 16px 30px -20px #000;
}
.l-hero .hero-meta {
  font-size: 11px; letter-spacing: 0.04em; display: inline-flex; align-items: center; gap: 7px;
  color: color-mix(in srgb, var(--on-accent) 78%, transparent);
}
.l-hero .hero-meta::before {
  content: ""; width: 5px; height: 5px; border-radius: 50%; background: currentColor; opacity: 0.8;
}

/* Magazine cover, for the grid + stack homes */
.cover {
  position: relative; border-radius: var(--r-card); overflow: hidden; min-height: 250px;
  display: flex; flex-direction: column; justify-content: flex-end; padding: 24px 22px;
  color: var(--on-accent); isolation: isolate;
  background: linear-gradient(170deg, color-mix(in srgb, var(--accent) 88%, #fff 12%), var(--accent-deep));
  box-shadow: var(--shadow-3), var(--edge);
}
.cover .cover-art { position: absolute; inset: 0; z-index: 0; background: inherit; }
.cover .cover-in { position: relative; z-index: 2; }
.cover h1 { font-size: clamp(34px, 11vw, 50px); line-height: 0.94; margin-top: 14px; }
.cover p {
  margin-top: 10px; font-size: 13.5px; line-height: 1.55; max-width: 30ch;
  color: color-mix(in srgb, var(--on-accent) 82%, transparent);
}
.cover .cover-rule { height: 1px; background: color-mix(in srgb, var(--on-accent) 28%, transparent); margin: 18px 0 14px; }
.cover .cover-meta {
  display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 11px; letter-spacing: 0.03em;
  color: color-mix(in srgb, var(--on-accent) 80%, transparent);
}
.cover .eyebrow { color: color-mix(in srgb, var(--on-accent) 74%, transparent); }
.cover .mono {
  position: absolute; right: 12px; top: -6px; font-family: var(--display); font-size: 110px;
  line-height: 1; letter-spacing: -0.055em; opacity: 0.16; color: var(--on-accent); z-index: 1;
}

/* --------------------------------------------------------- editorial rows */
.h-row {
  display: flex; width: 100%; text-align: left; gap: 16px; align-items: flex-start; justify-content: space-between;
  padding: 18px 0; border-bottom: 1px solid var(--hair); transition: background 0.2s ease;
}
.h-row:last-child { border-bottom: 0; }
.h-row .name {
  font-family: var(--display); font-size: 17px; font-weight: var(--weight); letter-spacing: var(--tracking);
  line-height: 1.2;
}
.h-row .desc { font-size: 12.5px; color: var(--muted); margin-top: 4px; max-width: 30ch; line-height: 1.5; }
.h-row .meta { font-size: 10.5px; color: var(--muted); margin-top: 6px; letter-spacing: 0.05em; text-transform: uppercase; font-weight: 600; }
.h-row .right { text-align: right; flex: 0 0 auto; display: grid; justify-items: end; gap: 8px; }
.h-row .right .price { font-size: 15.5px; }
.h-row .add {
  width: 32px; height: 32px; border-radius: 999px; border: 1px solid var(--hair);
  display: grid; place-items: center; background: color-mix(in srgb, var(--surface) 70%, transparent);
}
.h-row .add svg { width: 14px; height: 14px; }
.meta-strip {
  display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px;
}
.meta-strip span {
  font-size: 11px; color: var(--muted); display: inline-flex; align-items: center; gap: 7px;
  border: 1px solid var(--hair); border-radius: 999px; padding: 6px 12px;
  background: color-mix(in srgb, var(--surface) 55%, transparent);
}
.meta-strip span::before {
  content: ""; width: 4px; height: 4px; border-radius: 50%; background: var(--accent); flex: 0 0 auto;
}

/* -------------------------------------------------------------- grid tiles */
.tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.tile {
  display: flex; flex-direction: column; text-align: left; background: var(--surface);
  border: 1px solid color-mix(in srgb, var(--hair) 70%, transparent); border-radius: var(--r-card);
  overflow: hidden; padding: 6px;
  box-shadow: var(--shadow-1); transition: transform 0.16s var(--ease), box-shadow 0.2s ease;
  position: relative;
}
.tile:active { transform: scale(0.982); }
.tile .thumb { aspect-ratio: 1 / 0.94; border-radius: var(--r-media); }
.tile .body { padding: 11px 8px 13px; display: grid; gap: 5px; }
.tile .name {
  font-family: var(--display); font-weight: var(--weight); letter-spacing: var(--tracking);
  font-size: 14.5px; line-height: 1.2;
}
.tile .price { font-size: 13.5px; color: var(--ink); opacity: 1; font-weight: 700; }
.tile .go {
  position: absolute; right: 12px; bottom: 12px; width: 26px; height: 26px; border-radius: 999px;
  display: grid; place-items: center; background: var(--accent); color: var(--on-accent);
  box-shadow: 0 8px 16px -10px var(--accent);
}
.tile .go svg { width: 12px; height: 12px; }
.tile.wide { grid-column: span 2; flex-direction: row; align-items: stretch; }
.tile.wide .thumb { width: 44%; aspect-ratio: auto; border-radius: var(--r-media); }
.tile.wide .body { padding: 14px 16px; align-content: center; }
.tile.wide .go { position: static; margin-top: 6px; width: 26px; height: 26px; }
.chips { display: flex; gap: 8px; overflow-x: auto; padding: 2px 0 8px; scrollbar-width: none; }
.chips::-webkit-scrollbar { display: none; }
.chip {
  flex: 0 0 auto; border: 1px solid color-mix(in srgb, var(--hair) 75%, transparent); border-radius: 999px;
  padding: 9px 16px; font-size: 12px; font-weight: 650; color: var(--ink);
  background: var(--surface); box-shadow: var(--shadow-1); transition: all 0.2s ease;
}
.chip.on {
  background: var(--chip-on); color: var(--chip-on-ink); border-color: transparent;
  box-shadow: 0 10px 20px -14px var(--chip-on), 0 0 0 2px color-mix(in srgb, var(--chip-on) 14%, transparent);
}

/* ----------------------------------------------------------- compact rows */
.status-card {
  display: flex; align-items: center; gap: 12px; padding: 15px 16px; border-radius: var(--radius);
  background: var(--surface); border: 1px solid var(--hair); margin-bottom: 14px; box-shadow: var(--shadow-1);
}
.status-card .dot {
  width: 8px; height: 8px; border-radius: 50%; background: #2f9e6b;
  box-shadow: 0 0 0 4px color-mix(in srgb, #2f9e6b 18%, transparent); flex: 0 0 auto;
}
.status-card b { display: block; font-size: 13.5px; letter-spacing: -0.005em; }
.status-card span { font-size: 11.5px; color: var(--muted); }
.status-card .addr { margin-left: auto; text-align: right; font-size: 11px; color: var(--muted); max-width: 42%; }
.r-row {
  display: flex; width: 100%; text-align: left; align-items: center; gap: 14px; padding: 16px 0;
  border-bottom: 1px solid var(--hair);
}
.r-row:last-child { border-bottom: 0; }
.r-row .r-art {
  width: 54px; height: 54px; flex: 0 0 auto; border-radius: var(--r-media);
  box-shadow: var(--shadow-1), var(--edge);
}
.r-row .r-art .mono { font-size: 19px; opacity: 0.94; }
.r-row .lead { flex: 1; min-width: 0; }
.r-row .name { font-size: 14.5px; font-weight: 650; letter-spacing: -0.012em; }
.r-row .desc { font-size: 12px; color: var(--muted); margin-top: 3px; line-height: 1.45; }
.r-row .tail { flex: 0 0 auto; display: flex; align-items: center; gap: 10px; }
.r-row .tail .price { font-size: 14px; }
.r-row .tail > svg { width: 15px; height: 15px; color: var(--muted); opacity: 0.7; }
.r-row .add {
  width: 32px; height: 32px; border-radius: 999px; border: 1px solid var(--hair); display: grid; place-items: center;
  background: color-mix(in srgb, var(--surface) 70%, transparent);
}
.r-row .add svg { width: 14px; height: 14px; color: var(--ink); }

/* -------------------------------------------------------------- stack cards */
.stack-card {
  background: var(--surface); border: 1px solid color-mix(in srgb, var(--hair) 70%, transparent);
  border-radius: var(--r-card); overflow: hidden; margin-bottom: 14px; padding: 6px;
  box-shadow: var(--shadow-1);
}
.stack-card .band { position: relative; height: 158px; border-radius: var(--r-media); overflow: hidden; }
.stack-card .band .mono { font-size: 48px; }
.stack-card .body { padding: 14px 11px 12px; }
.stack-card .body .top { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.stack-card .body .name {
  font-family: var(--display); font-weight: var(--weight); letter-spacing: var(--tracking); font-size: 18.5px;
}
.stack-card .body p { font-size: 12.5px; color: var(--muted); margin-top: 6px; line-height: 1.55; }
.stack-card .specs { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.stack-card .specs span {
  font-size: 10.5px; letter-spacing: 0.04em; padding: 4px 9px; border-radius: 999px;
  background: var(--surface-2); color: var(--muted);
}
.stack-card .foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 14px; }
.stack-card .foot .btn { padding: 9px 16px; font-size: 12px; }

/* --------------------------------------------------- offers, loyalty, info */
.offer {
  display: flex; gap: 13px; align-items: flex-start; padding: 14px 15px;
  border-radius: ${Math.max(10, Math.round(radius * 0.72))}px;
  background: var(--surface); border: 1px solid var(--hair); margin-bottom: 9px; box-shadow: var(--shadow-1);
}
.offer b { display: block; font-size: 13.5px; font-weight: 650; letter-spacing: -0.005em; }
.offer p { font-size: 12px; color: var(--muted); margin-top: 3px; line-height: 1.5; }
.offer .spark {
  width: 28px; height: 28px; border-radius: 9px; background: var(--accent-soft); color: var(--accent-text);
  display: grid; place-items: center; font-size: 13px; flex: 0 0 auto;
}
body[data-accent-style="underline"] .offer .spark {
  background: none; box-shadow: inset 0 -2px 0 0 var(--accent); border-radius: 0;
}
.loyalty {
  position: relative; overflow: hidden; margin-top: 24px; padding: 20px; border-radius: var(--radius);
  background: linear-gradient(160deg, var(--ink) 0%, color-mix(in srgb, var(--ink) 84%, var(--accent) 16%) 100%);
  color: var(--bg); box-shadow: var(--shadow-2);
}
.loyalty::after {
  content: ""; position: absolute; right: -30px; top: -40px; width: 150px; height: 150px; border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--bg) 18%, transparent);
}
.loyalty b { font-family: var(--display); font-size: 16.5px; letter-spacing: var(--tracking); }
.loyalty p { font-size: 11.5px; opacity: 0.68; margin-top: 4px; }
.stamps { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 15px; }
.stamp {
  width: 26px; height: 26px; border-radius: 50%;
  border: 1px dashed color-mix(in srgb, var(--bg) 40%, transparent);
  display: grid; place-items: center; font-size: 9.5px; opacity: 0.62;
}
.stamp.on {
  background: var(--accent); border-style: solid; border-color: var(--accent); color: var(--on-accent); opacity: 1;
}
.info {
  border: 1px solid var(--hair); border-radius: var(--radius); padding: 17px; background: var(--surface);
  margin-bottom: 11px; box-shadow: var(--shadow-1);
}
.info h3 { font-size: 15.5px; margin-bottom: 6px; }
.info p, .info a { font-size: 12.5px; color: var(--muted); line-height: 1.65; text-decoration: none; }
.info a { color: var(--ink); font-weight: 600; text-decoration: underline; text-decoration-color: var(--hair); text-underline-offset: 3px; }
/* A strip of the trade's own work, edge to edge, snapping card by card. */
.showcase {
  display: flex; gap: 10px; overflow-x: auto; scroll-snap-type: x mandatory;
  scroll-padding-inline: 18px;
  margin: 16px -18px 4px; padding: 2px 18px 6px; scrollbar-width: none;
}
.showcase::-webkit-scrollbar { display: none; }
.showcase .slide {
  flex: 0 0 56%; scroll-snap-align: start; display: grid; gap: 7px;
  text-align: left; background: none; border: 0; padding: 0;
}
.showcase .thumb { aspect-ratio: 4 / 5; border-radius: var(--r-media); box-shadow: var(--shadow-1); }
.showcase .thumb .mono { font-size: 54px; letter-spacing: -0.03em; }
.showcase .cap {
  font-size: 11.5px; color: var(--muted); white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; letter-spacing: 0.04em;
}

.gallery { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.gallery .thumb { aspect-ratio: 1; border-radius: ${Math.max(8, Math.round(radius * 0.55))}px; box-shadow: var(--shadow-1); }
.timetable { display: grid; gap: 8px; }
.session {
  display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 13px 14px;
  border: 1px solid var(--hair); border-radius: ${Math.max(8, Math.round(radius * 0.62))}px;
  background: var(--surface); box-shadow: var(--shadow-1);
}
.session b { display: block; font-size: 13.5px; font-weight: 650; }
.session span { font-size: 11px; color: var(--muted); }
.session button { border: 1px solid var(--hair); border-radius: 999px; padding: 7px 12px; font-size: 11.5px; font-weight: 650; }
.session button.on { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }

/* ------------------------------------------------------- booking + quote */
.seg {
  display: grid; grid-auto-flow: column; gap: 4px; background: var(--surface-2); padding: 4px;
  border-radius: ${Math.max(9, Math.round(radius * 0.6))}px;
}
.seg button {
  padding: 10px 8px; border-radius: ${Math.max(7, Math.round(radius * 0.44))}px; font-size: 12px;
  font-weight: 650; color: var(--muted); transition: all 0.18s ease;
}
.seg button.on { background: var(--surface); color: var(--ink); box-shadow: var(--shadow-1); }
.slots { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.slot {
  border: 1px solid var(--hair); border-radius: ${Math.max(8, Math.round(radius * 0.46))}px;
  padding: 12px 4px; font-size: 12.5px; font-weight: 650; background: var(--surface);
  transition: all 0.16s var(--ease);
}
.slot.on { background: var(--accent); border-color: var(--accent); color: var(--on-accent); box-shadow: 0 10px 20px -14px var(--accent); }
.stepper { display: flex; align-items: center; justify-content: center; gap: 22px; }
.stepper b { font-family: var(--display); font-size: 26px; font-weight: var(--weight); font-variant-numeric: tabular-nums; }
.stepper button { width: 38px; height: 38px; border-radius: 999px; border: 1px solid var(--hair); display: grid; place-items: center; }
.stepper button svg { width: 15px; height: 15px; }
.field { display: grid; gap: 7px; margin-bottom: 11px; }
.field label {
  font-size: 10px; font-weight: 750; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted);
}
input[type="text"], textarea {
  width: 100%; background: var(--surface); color: var(--ink); border: 1px solid var(--hair);
  border-radius: ${Math.max(8, Math.round(radius * 0.46))}px; padding: 13px 14px; font-size: 16px;
  resize: none; transition: border-color 0.18s ease, box-shadow 0.18s ease;
}
input:focus, textarea:focus {
  outline: none; border-color: var(--accent-ring); box-shadow: 0 0 0 4px var(--accent-soft);
}
.stars { display: flex; gap: 8px; font-size: 23px; color: color-mix(in srgb, var(--muted) 42%, transparent); }
.stars span.on { color: var(--accent-text); }

/* ---------------------------------------------------------------- detail */
.detail-band {
  position: relative; margin: 2px 0 0; height: 254px; border-radius: var(--r-card); overflow: hidden;
  box-shadow: var(--shadow-2);
}
.detail-band .mono { font-size: 66px; }
.detail-band .cap {
  position: absolute; left: 18px; right: 18px; bottom: 18px; z-index: 2;
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  color: var(--on-accent); font-size: 10px; font-weight: 750; letter-spacing: 0.16em; text-transform: uppercase;
}
.detail-band .cap .tag { background: color-mix(in srgb, #fff 18%, transparent); color: var(--on-accent); }
.detail-body { padding: 22px 0 0; display: flex; flex-direction: column; flex: 1 1 auto; }
/* breathing room between the last line of copy and the pinned bar */
.detail-gap { flex: 0 0 14px; }
.screen.is-detail { padding-bottom: 0; }
/* A floating tab bar sits over the page, so the detail scrollport has to end
   above it — otherwise the pinned action bar lands underneath. */
body[data-nav="floating"] .screen.is-detail { bottom: var(--nav-space); }
.screen.is-detail > [data-detail-body] { min-height: 100%; display: flex; flex-direction: column; }
.detail-body h1 { font-size: clamp(26px, 7.6vw, 34px); }
.detail-body .lede { font-size: 13.5px; color: var(--muted); margin-top: 10px; line-height: 1.65; }
/* A real next step for a short detail page, not decorative filler. */
/* Owner-uploaded photography. The frame always reserves its ratio, so the
   first paint does not jump when the lazy image arrives. */
.media-frame {
  position: relative; display: block; overflow: hidden; margin: 0;
  border-radius: var(--r-md); background: var(--surface-2);
  aspect-ratio: var(--media-ratio, 1.6);
}
.media-frame.is-wide { aspect-ratio: 16 / 9; }
.media-frame.is-square { aspect-ratio: 1 / 1; }
.media-frame.is-portrait { aspect-ratio: 4 / 5; }
.media-frame .media-photo { width: 100%; height: 100%; display: block; }
.recs { margin-top: var(--space-6); }
.recs-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: var(--space-3); }
.recs-head b { font-family: var(--display); font-size: var(--text-md); font-weight: var(--weight); letter-spacing: var(--tracking); }
.recs-head span { color: var(--muted); font-size: var(--text-2xs); text-transform: uppercase; letter-spacing: 0.12em; }
.rec-row { display: flex; gap: var(--space-3); overflow-x: auto; padding: 0 0 var(--space-2); scrollbar-width: none; scroll-snap-type: x mandatory; }
.rec-row::-webkit-scrollbar { display: none; }
.rec { flex: 0 0 142px; scroll-snap-align: start; text-align: left; display: grid; gap: 7px; background: transparent; padding: 0; }
.rec-art { aspect-ratio: 1 / 0.9; border-radius: var(--r-sm); }
.rec-copy { display: grid; gap: 2px; }
.rec-copy b { font-size: var(--text-xs); font-weight: 650; line-height: 1.3; }
.rec-price { font-size: var(--text-2xs); color: var(--muted); }
.rec:active .rec-art { transform: scale(0.98); }
.detail-line {
  display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin: 18px 0 8px;
  padding: 0;
}
.detail-line .price { font-size: 22px; color: var(--accent-text); }
/* A dark surface cannot carry the deep mix of a dark brand colour: at 1.1:1
   the price is invisible. Keep the brand tint, at a lightness the surface can
   actually show. */
body[data-theme="dark"] .detail-line .price { color: var(--accent-text); }

/* ------------------------------------------------------------------- nav */
.tabbar {
  flex: 0 0 auto; position: relative; z-index: 25; display: flex; align-items: stretch; justify-content: space-around;
  padding: 8px 8px calc(8px + env(safe-area-inset-bottom));
  background: color-mix(in srgb, var(--surface) 94%, transparent);
  border-top: 1px solid var(--hair);
  backdrop-filter: blur(20px) saturate(150%); -webkit-backdrop-filter: blur(20px) saturate(150%);
}
body[data-nav="floating"] .tabbar {
  position: absolute; left: 14px; right: 14px; bottom: calc(12px + env(safe-area-inset-bottom));
  border-radius: ${Math.round(radius * 1.15)}px; border: 1px solid var(--hair); padding: 7px;
  background: color-mix(in srgb, var(--surface) 86%, transparent);
  backdrop-filter: blur(24px) saturate(160%); -webkit-backdrop-filter: blur(24px) saturate(160%);
  box-shadow: var(--shadow-3), var(--edge);
}
body[data-nav="dock"] .tabbar { padding: 10px 14px calc(10px + env(safe-area-inset-bottom)); background: transparent; border-top: 0; backdrop-filter: none; }
body[data-nav="dock"] .tabbar .tab { flex: 1; }
.tab {
  flex: 1; display: grid; justify-items: center; gap: 4px; padding: 6px; border-radius: 999px;
  color: var(--muted); font-size: 8.5px; font-weight: 750; letter-spacing: 0.1em; text-transform: uppercase;
  position: relative; transition: color 0.2s ease, background 0.2s ease;
}
.tab { min-height: 48px; align-content: center; font-size: 9.5px; letter-spacing: 0.07em; }
.tab svg { width: 22px; height: 22px; stroke-width: 1.6; }
.tab.on { color: var(--ink); }
.tab.on svg { stroke-width: 1.9; }
body[data-nav="bar"] .tab.on { background: var(--accent-soft); }
body[data-nav="dock"] .tab.on { background: var(--surface-2); }
body[data-nav="floating"] .tab.on { background: var(--accent-soft); color: var(--accent-text); }

/* ---------------------------------------------------------------- sheets */
.scrim {
  position: absolute; inset: 0; z-index: 50; background: color-mix(in srgb, #000 46%, transparent);
  opacity: 0; pointer-events: none; transition: opacity 0.28s ease; backdrop-filter: blur(3px);
}
.scrim.on { opacity: 1; pointer-events: auto; }
.sheet {
  position: absolute; left: 0; right: 0; bottom: 0; z-index: 60; max-height: 90%;
  display: flex; flex-direction: column; background: var(--surface); color: var(--ink);
  border-radius: ${Math.round(radius * 1.15)}px ${Math.round(radius * 1.15)}px 0 0;
  transform: translateY(103%); transition: transform 0.4s var(--ease);
  box-shadow: 0 -30px 70px -34px #000, var(--edge);
}
.sheet.on { transform: translateY(0); }
.sheet .handle { width: 40px; height: 4px; border-radius: 2px; background: var(--hair); margin: 10px auto 4px; }
.sheet .sheet-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 20px 12px; }
.sheet .sheet-head h2 { font-size: 20px; }
.sheet .sheet-body { padding: 0 20px calc(22px + env(safe-area-inset-bottom)); overflow-y: auto; overscroll-behavior: contain; }
.cart-line { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 14px 0; border-bottom: 1px solid var(--hair); }
.cart-line .name { font-size: 14px; font-weight: 650; }
.cart-line .price { font-size: 12.5px; color: var(--muted); margin-top: 3px; }
.qty { display: flex; align-items: center; gap: 6px; }
.qty b { font-size: 13px; min-width: 18px; text-align: center; font-variant-numeric: tabular-nums; }
.qty button { width: 30px; height: 30px; border-radius: 999px; border: 1px solid var(--hair); display: grid; place-items: center; }
.qty button svg { width: 13px; height: 13px; }
.totals { display: grid; gap: 8px; padding: 16px 0 4px; }
.totals div { display: flex; justify-content: space-between; font-size: 13px; color: var(--muted); }
.totals div.grand {
  color: var(--ink); font-size: 17px; font-weight: 700; font-family: var(--display);
  padding-top: 10px; margin-top: 4px; border-top: 1px solid var(--hair);
}
.empty { text-align: center; padding: 34px 12px 26px; color: var(--muted); font-size: 13px; line-height: 1.6; }
.done { text-align: center; padding: 10px 6px 12px; }
.done .tick {
  width: 58px; height: 58px; border-radius: 50%; margin: 0 auto 16px; display: grid; place-items: center;
  background: var(--accent-soft); color: var(--accent-text); animation: pop 0.45s var(--ease) both;
}
.done .tick svg { width: 24px; height: 24px; }
.done h2 { font-size: 22px; }
.done p { font-size: 13px; color: var(--muted); margin-top: 8px; line-height: 1.6; }
.toast {
  position: fixed; left: 50%; bottom: calc(var(--nav-space) + 22px); transform: translate(-50%, 18px);
  background: var(--ink); color: var(--bg); padding: 11px 18px; border-radius: 999px;
  font-size: 12.5px; font-weight: 650; opacity: 0; pointer-events: none; transition: all 0.26s var(--ease);
  z-index: 70; box-shadow: var(--shadow-2);
}
.toast.on { opacity: 1; transform: translate(-50%, 0); }

/* ---------------------------------------------------- app behaviours */
.offline {
  position: absolute; top: env(safe-area-inset-top); left: 50%; transform: translateX(-50%);
  z-index: 90; margin-top: 6px; padding: 6px 12px; border-radius: 999px;
  background: var(--ink); color: var(--bg); font-size: 10.5px; font-weight: 650; letter-spacing: 0.02em;
  box-shadow: var(--shadow-2);
}
.appbar { transition: transform 0.28s var(--ease), border-color 0.2s ease; }
.appbar.is-hidden { transform: translateY(-104%); }

/* search */
.search-field {
  display: flex; align-items: center; gap: 10px; margin: 8px 0 14px; padding: 0 14px;
  background: var(--surface); border: 1px solid var(--hair); border-radius: 999px;
  box-shadow: var(--shadow-1);
}
.search-field input {
  flex: 1; border: 0; background: none; padding: 14px 0; font-size: 16px; color: var(--ink);
  outline: none; min-width: 0;
}
.search-field .search-ico svg { width: 17px; height: 17px; color: var(--muted); display: block; }
.search-clear { display: grid; place-items: center; width: 40px; height: 40px; margin-right: -8px; border-radius: 999px; color: var(--muted); }
.search-clear svg { width: 13px; height: 13px; }

/* saved */
.save {
  width: 30px; height: 30px; flex: 0 0 auto; border-radius: 999px; display: grid; place-items: center;
  color: var(--muted); border: 1px solid transparent; transition: color 0.18s ease, background 0.18s ease, transform 0.12s var(--ease);
}
.save svg { width: 16px; height: 16px; }
.save.on { color: var(--accent-text); background: var(--accent-soft); }
.save.on svg path { fill: currentColor; stroke: none; }
.save:active { transform: scale(0.9); }
.save.on-art {
  position: absolute; top: 8px; right: 8px; z-index: 3; width: 30px; height: 30px;
  background: color-mix(in srgb, #000 26%, transparent); color: #fff; backdrop-filter: blur(6px);
}
.save.on-art.on { color: #fff; background: color-mix(in srgb, var(--accent) 88%, transparent); }
.detail-save { position: absolute; top: 14px; right: 14px; width: 34px; height: 34px; }
.row-tools, .foot-tools { display: inline-flex; align-items: center; gap: 8px; }

/* filters + sticky detail action */
.section-block[hidden] { display: none; }
.detail-cta {
  position: sticky; bottom: 0; z-index: 5; margin: auto -18px 0; padding: 14px 18px calc(16px + env(safe-area-inset-bottom));
  display: flex; align-items: center; gap: 12px; justify-content: space-between;
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  backdrop-filter: blur(18px) saturate(140%); -webkit-backdrop-filter: blur(18px) saturate(140%);
  border-top: 0; box-shadow: 0 -20px 36px -30px #000;
}
.detail-cta-line { display: grid; gap: 2px; }
.detail-cta-line b.price { font-size: 17px; }
.detail-cta .btn { padding: 12px 20px; }
.detail-cta .btn.block { width: 100%; }

@keyframes badgePop { 0% { transform: scale(0.6); } 60% { transform: scale(1.18); } 100% { transform: scale(1); } }
.iconbtn .count:not([hidden]) { animation: badgePop 0.32s var(--ease); }

/* the customer's site opens its nav in a drawer, so ours does too */
body[data-nav="drawer"] { --nav-space: 32px; }
body[data-nav="drawer"] .tabbar { display: none; }
.nav-list { display: grid; }
.nav-list button {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 15px 2px; border-bottom: 1px solid var(--hair); font-size: 15px; font-weight: 600; text-align: left;
}
.nav-list button:last-child { border-bottom: 0; }
.nav-list button svg { width: 18px; height: 18px; color: var(--muted); }

/* their hero composition, at app scale */
.l-hero.is-centered, .cover.is-centered { text-align: center; }
.l-hero.is-centered .hero-in, .cover.is-centered .cover-in { display: grid; justify-items: center; }
.l-hero.is-centered p, .cover.is-centered p { margin-inline: auto; }
.l-hero.is-centered .hero-foot { justify-content: center; }
.l-hero.is-split, .cover.is-split { flex-direction: column; align-items: stretch; gap: 16px; }
.l-hero.is-split .hero-in, .cover.is-split .cover-in { order: 1; }
.l-hero.is-split .hero-art, .cover.is-split .cover-art {
  order: 2; position: relative; inset: auto; width: 100%; min-height: 150px;
  border-radius: ${Math.max(10, Math.round(radius * 0.7))}px; overflow: hidden;
}
@media (min-width: 430px) {
  .l-hero.is-split, .cover.is-split { flex-direction: row; align-items: center; }
  .l-hero.is-split .hero-art, .cover.is-split .cover-art { width: 42%; min-height: 210px; }
}
.l-hero.is-none { min-height: 190px; }
.l-hero.is-none .hero-art, .cover.is-none .cover-art { display: none; }
.cover.is-none { min-height: 0; }

/* seeded hero scale: a fourth composition state */
body[data-hero-scale="compact"] .l-hero { min-height: 225px; }
body[data-hero-scale="compact"] .cover { min-height: 205px; }
body[data-hero-scale="tall"] .l-hero { min-height: 370px; }
body[data-hero-scale="tall"] .cover { min-height: 330px; }
body[data-hero-scale="tall"] .l-hero h1, body[data-hero-scale="tall"] .cover h1 {
  font-size: clamp(38px, 12vw, 54px);
}
body[data-hero-scale="immersive"] .l-hero { min-height: 440px; }
body[data-hero-scale="immersive"] .cover { min-height: 400px; }
body[data-hero-scale="immersive"] .l-hero h1, body[data-hero-scale="immersive"] .cover h1 {
  font-size: clamp(42px, 14vw, 62px);
}

/* ---------------------------------------------------------- trade shells */
.home-story {
  font-family: var(--display); font-size: 14px; line-height: 1.62; color: var(--muted);
  margin: 4px 0 18px; max-width: 44ch;
}
.search-pill {
  display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-radius: 999px;
  border: 1px solid var(--hair); background: color-mix(in srgb, var(--surface) 78%, transparent);
  color: var(--muted); font-size: 13px; font-weight: 600; text-align: left;
}
.search-pill svg { width: 15px; height: 15px; }
.appbar .search-pill { flex: 1; min-width: 0; }
body[data-shell="menu"] .appbar .titles { text-align: center; justify-items: stretch; }
body[data-shell="menu"] .tabbar { border-top-color: var(--ink); }
body[data-shell="menu"] .tab { text-transform: none; letter-spacing: 0.02em; font-family: var(--display); font-size: 10.5px; }
body[data-shell="session"] .appbar { border-bottom-color: var(--hair); }
body[data-shell="session"] .tab span { display: none; }
body[data-shell="session"] .tab svg { width: 23px; height: 23px; }
body[data-shell="session"] .tab.on::after { display: none; }
body[data-shell="care"] .appbar { background: color-mix(in srgb, var(--surface) 94%, transparent); }
/* The visit card already carries hours and address; the hero need not repeat them. */
body[data-shell="care"] .cover .cover-meta, body[data-shell="care"] .cover .cover-rule { display: none; }
body[data-shell="care"] .tabbar { border-radius: 20px 20px 0 0; border-top-color: transparent; box-shadow: 0 -18px 40px -34px #000; }
body[data-shell="listing"] .appbar { gap: 8px; }
/* Search lives in the bar until a listing is open, then its name takes over. */
body[data-shell="listing"] .bar-titles { display: none; }
body[data-shell="listing"].is-detail .bar-titles { display: grid; text-align: left; }
body[data-shell="listing"].is-detail .bar-pill { display: none; }

/* session home */
.sess-today {
  border: 1px solid var(--hair); border-radius: var(--radius); background: var(--surface);
  padding: 16px; margin: 6px 0 18px; box-shadow: var(--shadow-1);
}
.sess-today h2 { font-size: 20px; margin-top: 4px; }
.sess-row { display: flex; align-items: baseline; gap: 10px; padding: 10px 0; border-top: 1px solid var(--hair); font-size: 13px; }
.sess-row:first-of-type { margin-top: 10px; }
.sess-row b { flex: 1; font-weight: 650; }
.sess-row span { color: var(--muted); font-size: 12px; }
.sess-row em { font-style: normal; color: var(--accent-text); font-size: 11px; font-weight: 650; }

/* care home */
.care-visit {
  display: grid; gap: 6px; padding: 18px; border-radius: var(--radius); background: var(--surface);
  border: 1px solid var(--hair); margin: 6px 0 16px; box-shadow: var(--shadow-1);
}
.care-visit b { font-family: var(--display); font-size: 19px; letter-spacing: var(--tracking); }
.care-visit .care-addr { color: var(--muted); font-size: 12.5px; }
.care-visit .btn { margin-top: 8px; justify-self: start; }

/* listing home */
.listing-lead { display: flex; align-items: center; gap: 12px; margin: 6px 0 16px; }
.listing-lead .search-pill { flex: 1; }
.listing-count { display: grid; text-align: right; }
.listing-count b { font-family: var(--display); font-size: 17px; letter-spacing: var(--tracking); }
.listing-count span { font-size: 10px; color: var(--muted); letter-spacing: 0.08em; text-transform: uppercase; }

/* menu item */
.menu-band { height: 220px; margin: 2px 0 0; border-radius: var(--r-card); overflow: hidden; box-shadow: var(--shadow-2); }
.menu-title { font-family: var(--display-serif); font-size: clamp(28px, 8.4vw, 38px); margin-top: 8px; }
.menu-price { display: flex; align-items: baseline; gap: 10px; margin: 18px 0 4px; }
.menu-price span { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); }
.menu-price i { flex: 1; border-bottom: 1px dotted color-mix(in srgb, var(--ink) 26%, transparent); transform: translateY(-4px); }
.menu-price b { font-size: 19px; }

/* class detail */
.session-title { font-family: var(--display); text-transform: uppercase; font-size: clamp(30px, 9vw, 42px); letter-spacing: -0.01em; margin-top: 8px; }
.session-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(88px, 1fr)); gap: 10px; margin: 18px 0 6px; }
.session-facts div { padding: 12px 10px; border: 1px solid var(--hair); border-radius: 10px; background: var(--surface); }
.session-facts b { display: block; font-size: 14px; }
.session-facts span { font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); }

/* treatment detail */
.care-title { font-size: clamp(24px, 7vw, 32px); margin-top: 8px; }
.care-facts { display: flex; gap: 10px; margin: 18px 0 4px; }
.care-facts div { flex: 1; padding: 12px 14px; border-radius: 10px; background: var(--accent-soft); }
.care-facts span { display: block; font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); }
.care-facts b { font-size: 15px; }

/* property detail */
.listing-gallery { position: relative; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 2px 0 0; border-radius: var(--r-card); overflow: hidden; }
.listing-gallery .listing-shot { aspect-ratio: 1 / 0.82; border-radius: 0; }
.listing-gallery .listing-shot.wide { grid-column: span 2; aspect-ratio: 16 / 10; }
.listing-gallery .detail-save { top: 12px; right: 12px; }
.listing-title { font-size: clamp(22px, 6.4vw, 30px); margin-top: 8px; }
.listing-price { font-family: var(--display); font-size: 22px; margin-top: 4px; }
.listing-specs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 16px 0; }
.listing-specs div { border: 1px solid var(--hair); border-radius: 10px; padding: 10px 12px; }
.listing-specs b { display: block; font-size: 13px; }
.listing-specs span { font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
.agent { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 12px; background: var(--surface); border: 1px solid var(--hair); margin-top: 4px; }
.agent .agent-art { width: 42px; height: 42px; border-radius: 999px; flex: 0 0 auto; }
.agent .agent-art .mono { font-size: 15px; }
.agent b { display: block; font-size: 13.5px; }
.agent span { font-size: 11.5px; color: var(--muted); }

/* A marketplace's sellers: a rail of stores on the catalogue, and the store
   page itself. Both reuse the row and thumb the rest of the app browses with. */
.store-rail { display: flex; gap: 10px; overflow-x: auto; padding: 2px 0 8px; scrollbar-width: none; }
.store-rail::-webkit-scrollbar { display: none; }
.store-card {
  flex: 0 0 150px; display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto;
  column-gap: 10px; row-gap: 2px; align-items: center; text-align: left; padding: 10px;
  background: var(--surface); border: 1px solid var(--hair); border-radius: var(--r-card);
  box-shadow: var(--shadow-1);
}
.store-card .store-art { width: 34px; height: 34px; border-radius: 999px; grid-row: span 2; }
.store-card .store-art .mono { font-size: 12px; }
.store-card .store-name {
  font-family: var(--display); font-weight: var(--weight); letter-spacing: var(--tracking);
  font-size: 13px; line-height: 1.15; color: var(--ink);
}
.store-card .store-meta { font-size: 10.5px; color: var(--muted); }
.store-head { display: flex; align-items: center; gap: 14px; padding: 6px 0 2px; }
.store-head .store-art { width: 54px; height: 54px; border-radius: 999px; flex: 0 0 auto; }
.store-head .store-art .mono { font-size: 17px; }
.store-head .listing-title { margin: 2px 0 0; }
.store-link { width: 100%; text-align: left; }

/* ------------------------------------------------- per-build variation */
/* Two builds of the same trade get different rolls: the seed above picks one
   of these, so typography rhythm and card language shift build to build. The
   space is finite, so repeats are possible, not forbidden. */
/* ------------------------------------------- per-build card layout language */
/* v1: each section becomes a swipeable rail. */
body[data-variant="1"] .tiles {
  display: flex; gap: 10px; overflow-x: auto; scroll-snap-type: x mandatory;
  margin-inline: -18px; padding: 2px 18px 10px; scrollbar-width: none;
}
body[data-variant="1"] .tiles::-webkit-scrollbar { display: none; }
body[data-variant="1"] .tile { flex: 0 0 74%; scroll-snap-align: start; }
body[data-variant="1"] .tile.wide { flex-basis: 88%; }

/* v2: every card is a list row, image left. */
body[data-variant="2"] .tiles { grid-template-columns: 1fr; gap: 10px; }
body[data-variant="2"] .tile, body[data-variant="2"] .tile.wide { flex-direction: row; align-items: stretch; }
body[data-variant="2"] .tile .thumb,
body[data-variant="2"] .tile.wide .thumb { width: 42%; aspect-ratio: auto; min-height: 96px; }
body[data-variant="2"] .tile .body { align-content: center; }
body[data-variant="2"] .tile .go { position: static; margin-top: 6px; }

/* v3: photo-first cards, the copy sits on the image. */
body[data-variant="3"] .tile .thumb { aspect-ratio: 1 / 1.2; }
body[data-variant="3"] .tile .body {
  position: absolute; inset: auto 0 0 0; padding: 30px 12px 12px;
  background: linear-gradient(to top, color-mix(in srgb, #000 62%, transparent), transparent);
}
body[data-variant="3"] .tile .name,
body[data-variant="3"] .tile .price,
body[data-variant="3"] .tile .tiny { color: #fff; opacity: 0.94; }
body[data-variant="3"] .tile .go {
  color: #fff; background: color-mix(in srgb, #fff 20%, transparent);
  top: 8px; bottom: auto;
}
body[data-variant="3"] .tile.wide .thumb { width: 100%; aspect-ratio: 16 / 10; }

/* ------------------------------- same four languages for rows, stack, editorial */
/* v1: flat cards — rows lose their dividers, the stack turns side-by-side. */
body[data-variant="1"] .r-row {
  background: var(--surface); border: 1px solid var(--hair); border-radius: var(--radius);
  padding: 12px; margin-bottom: 8px; box-shadow: var(--shadow-1);
}
body[data-variant="1"] .r-row .r-art { width: 44px; height: 44px; border-radius: 50%; }
body[data-variant="1"] .stack-card { display: flex; align-items: stretch; }
body[data-variant="1"] .stack-card .band { width: 38%; height: auto; min-height: 128px; flex: 0 0 auto; }
body[data-variant="1"] .h-row {
  background: var(--surface); border: 1px solid var(--hair); border-radius: var(--radius);
  padding: 14px 16px; margin-bottom: 8px;
}

/* v2: media first — rows and editorial stack their art above the copy. */
body[data-variant="2"] .r-row { flex-direction: column; align-items: stretch; gap: 10px; padding: 12px 0 16px; }
body[data-variant="2"] .r-row .r-art { width: 100%; height: 116px; border-radius: var(--radius); }
body[data-variant="2"] .r-row .tail { width: 100%; justify-content: space-between; }
body[data-variant="2"] .stack-card {
  border-color: transparent; box-shadow: var(--shadow-2);
}
body[data-variant="2"] .stack-card .band { height: 86px; }
body[data-variant="2"] .stack-card .body { padding-top: 14px; }
body[data-variant="2"] .h-row { flex-direction: column; align-items: flex-start; gap: 8px; }
body[data-variant="2"] .h-row .right { display: flex; align-items: center; gap: 10px; justify-items: start; }

/* v3: dense ledger — tighter rows, tinted blocks, rules instead of cards. */
body[data-variant="3"] .r-row {
  gap: 10px; padding: 10px; border-bottom: 0; border-radius: var(--radius); margin-bottom: 6px;
  background: color-mix(in srgb, var(--surface) 60%, transparent);
}
body[data-variant="3"] .r-row .r-art { width: 34px; height: 34px; border-radius: 10px; }
body[data-variant="3"] .r-row .name { font-size: 13.5px; }
body[data-variant="3"] .stack-card {
  border: 0; background: transparent; box-shadow: none; border-radius: 0;
  border-top: 1px solid var(--hair); margin-bottom: 0;
}
body[data-variant="3"] .stack-card .band { height: 96px; }
body[data-variant="3"] .stack-card .body { padding: 12px 0 16px; }
body[data-variant="3"] .h-row { padding: 12px 0; border-bottom: 1px dashed var(--hair); }
body[data-variant="3"] .h-row .name { font-family: var(--body); font-size: 14.5px; font-weight: 650; letter-spacing: 0; }

body[data-density="cozy"] .sect { margin: 18px 0 8px; }
body[data-density="cozy"] .tile .body { padding: 10px 11px 12px; }
body[data-density="cozy"] .r-row { padding: 12px 0; }
body[data-density="roomy"] .sect { margin: 34px 0 14px; }
body[data-density="roomy"] .tile .body { padding: 15px 15px 18px; }
body[data-density="roomy"] .r-row { padding: 20px 0; }

/* per-layout rhythm */
body[data-layout="grid"] .actions { margin-top: 18px; }
body[data-layout="rows"] .sect { margin: 26px 0 8px; }
body[data-layout="editorial"] .sect { margin: 32px 0 8px; }
body[data-layout="stack"] .sect { margin: 28px 0 12px; }

/* ------------------------------------------------ trade design families */
/* One design grammar per trade — not another colourway of the shared
   card system. These rules sit last so they win over the per-build variation
   deck: the trade is the identity, the build is a variation inside it. Each
   family also re-cuts the shared components (cards, buttons, chips, slots,
   sheets) into its own geometry, so no single rounded import survives. */

/* Restaurant: a printed menu. Type and rules carry the page; no image hero,
   no rounded cards, prices set like a bill of fare. */
body[data-trade="restaurant"] { --nav-space: 84px; }
body[data-trade="restaurant"] .app::before { display: none; }
body[data-trade="restaurant"] .appbar {
  background: var(--bg); border-bottom: 1px solid var(--ink);
  backdrop-filter: none; -webkit-backdrop-filter: none;
}
body[data-trade="restaurant"] .appbar .mark {
  border-radius: 0; background: var(--ink); color: var(--bg); box-shadow: none;
  font-family: var(--display-serif); font-size: 14px; font-weight: 600; letter-spacing: 0;
}
body[data-trade="restaurant"] .appbar .kicker { letter-spacing: 0.26em; }
/* The masthead owns the name on the menu screen; repeating it in the chrome
   would read as two headers, not a printed menu. Only the screen carrying the
   masthead drops its title: book, order and visit keep their own headings. */
body[data-trade="restaurant"]:has(.screen.on .menu-masthead) .appbar .title { display: none; }
body[data-trade="restaurant"] .iconbtn { border-radius: 0; background: none; box-shadow: none; }
body[data-trade="restaurant"] .l-hero {
  display: block; min-height: 0; padding: 20px 0 24px; border-radius: 0; overflow: visible;
  background: none; color: var(--ink); box-shadow: none;
  border-top: 3px double var(--ink); border-bottom: 1px solid var(--ink);
}
body[data-trade="restaurant"] .l-hero::after { display: none; }
body[data-trade="restaurant"] .l-hero .hero-art { display: none; }
body[data-trade="restaurant"] .l-hero .hero-in { width: 100%; }
body[data-trade="restaurant"] .l-hero h1 {
  font-family: var(--display-serif); font-size: clamp(46px, 16vw, 78px); font-weight: 500;
  line-height: 0.82; letter-spacing: -0.045em; margin-top: 18px; text-shadow: none;
}
body[data-trade="restaurant"] .l-hero .eyebrow { color: var(--ink); letter-spacing: 0.24em; }
body[data-trade="restaurant"] .l-hero .eyebrow::before { width: 30px; background: var(--accent); }
body[data-trade="restaurant"] .l-hero p {
  margin-top: 16px; font-size: 13.5px; line-height: 1.6; max-width: 34ch; color: var(--muted);
}
body[data-trade="restaurant"] .l-hero .hero-foot {
  margin-top: 22px; padding-top: 14px; border-top: 1px solid var(--hair);
}
body[data-trade="restaurant"] .l-hero .hero-cta {
  border-radius: 0; background: var(--ink); color: var(--bg); box-shadow: none;
  padding: 11px 18px; font-size: 10.5px; font-weight: 750; letter-spacing: 0.12em; text-transform: uppercase;
}
body[data-trade="restaurant"] .l-hero .hero-meta { color: var(--muted); letter-spacing: 0.08em; text-transform: uppercase; font-size: 9.5px; }
body[data-trade="restaurant"] .menu-masthead {
  padding: 16px 0 18px; margin: 2px 0 0; border-top: 3px double var(--ink); border-bottom: 1px solid var(--ink);
}
body[data-trade="restaurant"] .menu-masthead .eyebrow { color: var(--ink); letter-spacing: 0.24em; }
body[data-trade="restaurant"] .menu-masthead .eyebrow::before { width: 30px; background: var(--accent); }
body[data-trade="restaurant"] .menu-masthead h1 {
  font-family: var(--display-serif); font-size: clamp(42px, 14vw, 64px); font-weight: 500;
  line-height: 0.84; letter-spacing: -0.045em; margin-top: 14px;
}
body[data-trade="restaurant"] .menu-masthead p {
  margin-top: 14px; color: var(--muted); font-size: 13px; line-height: 1.55; max-width: 34ch;
}
body[data-trade="restaurant"] .menu-masthead-row {
  display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 16px; padding-top: 10px;
  border-top: 1px solid var(--hair); color: var(--muted); font-size: 9.5px;
  letter-spacing: 0.1em; text-transform: uppercase;
}
body[data-trade="restaurant"] .actions { margin: 12px 0 2px; gap: 16px; padding-bottom: 12px; border-bottom: 1px solid var(--hair); }
body[data-trade="restaurant"] .actions .btn {
  flex: 0 0 auto; background: none; box-shadow: none; border-radius: 0; padding: 4px 0;
  color: var(--ink); font-family: var(--display-serif); font-size: 13px; font-weight: 500;
}
body[data-trade="restaurant"] .meta-strip { gap: 4px 14px; margin-top: 10px; }
body[data-trade="restaurant"] .meta-strip span {
  border: 0; border-radius: 0; padding: 0; background: none; font-size: 9.5px;
  letter-spacing: 0.1em; text-transform: uppercase;
}
body[data-trade="restaurant"] .sect {
  margin: 30px 0 2px; padding-bottom: 8px; border-bottom: 2px solid var(--ink); align-items: end;
}
body[data-trade="restaurant"] .sect .label {
  font-family: var(--display-serif); font-size: 23px; font-weight: 500; letter-spacing: -0.018em;
  text-transform: none; color: var(--ink);
}
body[data-trade="restaurant"] .sect .count {
  border: 0; border-radius: 0; padding: 0; background: none; color: var(--muted);
  font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase;
}
body[data-trade="restaurant"] .h-row {
  display: flex; flex-direction: row; align-items: baseline; padding: 15px 0; margin: 0;
  border: 0; border-bottom: 1px solid var(--hair); border-radius: 0;
  background: none; box-shadow: none;
}
body[data-trade="restaurant"] .chips { gap: 18px; border-bottom: 1px solid var(--hair); padding-bottom: 2px; }
body[data-trade="restaurant"] .chip {
  border: 0; border-radius: 0; padding: 7px 0; background: none; box-shadow: none;
  font-family: var(--display-serif); font-size: 14px; font-weight: 500; letter-spacing: -0.005em;
}
body[data-trade="restaurant"] .chip.on {
  background: none; color: var(--ink); box-shadow: inset 0 -2px 0 0 var(--accent);
}
/* Booking belongs to the same family: a ruled party panel and a button cut
   like the hero CTA, not a rounded card dropped in from the shared system.
   Nothing rounded survives on this screen, including the time slots. */
body[data-trade="restaurant"] .screen.is-booking .card,
body[data-trade="restaurant"] .screen.is-booking .stepper button,
body[data-trade="restaurant"] .screen.is-booking .slot,
body[data-trade="restaurant"] .screen.is-booking .btn.accent {
  border-radius: 0; box-shadow: none;
}
body[data-trade="restaurant"] .screen.is-booking .card {
  border: 0; border-top: 1px solid var(--ink); border-bottom: 1px solid var(--hair);
  background: none;
}
body[data-trade="restaurant"] .screen.is-booking .stepper button {
  border-color: var(--ink); background: none;
}
body[data-trade="restaurant"] .screen.is-booking .stepper b,
body[data-trade="restaurant"] .screen.is-booking .slot {
  font-family: var(--display-serif); font-weight: 500;
}
body[data-trade="restaurant"] .screen.is-booking .slot { background: none; font-size: 13px; }
body[data-trade="restaurant"] .screen.is-booking .slot.on {
  background: var(--ink); border-color: var(--ink); color: var(--bg);
}
body[data-trade="restaurant"] .screen.is-booking .btn.accent {
  background: var(--ink); color: var(--bg);
  padding: 13px 18px; font-size: 10.5px; font-weight: 750; letter-spacing: 0.12em; text-transform: uppercase;
}
body[data-trade="restaurant"] .h-row .name {
  font-family: var(--display-serif); font-size: 21px; font-weight: 500; letter-spacing: -0.012em; line-height: 1.12;
}
body[data-trade="restaurant"] .h-row .desc { font-size: 12px; line-height: 1.5; max-width: 34ch; }
body[data-trade="restaurant"] .h-row .meta { font-size: 9px; letter-spacing: 0.12em; }
body[data-trade="restaurant"] .h-row .right { gap: 6px; }
body[data-trade="restaurant"] .h-row .right .price { font-family: var(--display-serif); font-size: 17px; font-weight: 500; }
body[data-trade="restaurant"] .h-row .add {
  width: 28px; height: 28px; border-radius: 0; background: none; border-color: var(--ink);
}
body[data-trade="restaurant"] .offer {
  border: 0; border-top: 1px solid var(--hair); border-radius: 0; padding: 13px 0;
  background: none; box-shadow: none;
}
body[data-trade="restaurant"] .offer .spark {
  border-radius: 0; background: none; color: var(--accent-text);
  box-shadow: inset 0 -1px 0 0 var(--accent); width: 22px;
}
body[data-trade="restaurant"] .info {
  border: 0; border-top: 1px solid var(--ink); border-bottom: 1px solid var(--hair);
  border-radius: 0; padding: 16px 0; background: none; box-shadow: none;
}
body[data-trade="restaurant"] .loyalty { border-radius: 0; box-shadow: none; }
body[data-trade="restaurant"] .tabbar {
  position: relative; left: auto; right: auto; bottom: auto; margin: 0;
  border: 0; border-top: 2px solid var(--ink); border-radius: 0;
  padding: 8px 14px calc(8px + env(safe-area-inset-bottom));
  background: var(--bg); box-shadow: none;
  backdrop-filter: none; -webkit-backdrop-filter: none;
}
body[data-trade="restaurant"] .tab {
  border-radius: 0; font-family: var(--display-serif); font-size: 11px; font-weight: 500;
  letter-spacing: 0.01em; text-transform: none;
}
body[data-trade="restaurant"] .tab.on { background: none; color: var(--accent-text); }
body[data-trade="restaurant"] .tab.on::after {
  content: ""; width: 4px; height: 4px; border-radius: 50%; background: var(--accent); margin-top: 1px;
}

/* Café: a warm, image-led room. Arched photography, round tiles, a floating
   capsule nav and a cover that behaves like a window rather than a banner. */
body[data-trade="cafe"] { --nav-space: 108px; }
body[data-trade="cafe"] .app::before {
  height: 560px;
  background:
    radial-gradient(90% 60% at 10% -8%, color-mix(in srgb, var(--accent) 20%, transparent), transparent 68%),
    radial-gradient(70% 50% at 100% 0%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 72%);
}
body[data-trade="cafe"] .appbar { border-bottom: 0; }
body[data-trade="cafe"] .appbar .mark { border-radius: 50%; background: var(--ink); color: var(--bg); box-shadow: none; }
body[data-trade="cafe"] .screen { padding-inline: 20px; }
body[data-trade="cafe"] .cover {
  min-height: 360px; border-radius: 32px; padding: 30px 24px; justify-content: flex-end;
}
body[data-trade="cafe"] .cover .cover-art {
  border-radius: 46% 46% 26px 26px / 36% 36% 26px 26px;
}
body[data-trade="cafe"] .cover h1 {
  font-family: var(--display-serif); font-size: clamp(38px, 12vw, 48px); font-weight: 500;
  line-height: 0.94; letter-spacing: -0.03em;
}
body[data-trade="cafe"] .cover p { font-size: 14px; line-height: 1.6; max-width: 27ch; }
body[data-trade="cafe"] .cover .cover-rule { background: color-mix(in srgb, var(--on-accent) 34%, transparent); }
body[data-trade="cafe"] .cover .cover-meta { font-size: 10.5px; letter-spacing: 0.06em; }
body[data-trade="cafe"] .tiles { grid-template-columns: 1fr 1fr; gap: 22px 14px; }
body[data-trade="cafe"] .tile {
  display: flex; flex-direction: column; background: none; border: 0; box-shadow: none;
  padding: 0; overflow: visible; border-radius: 0;
}
body[data-trade="cafe"] .tile .thumb {
  width: 100%; aspect-ratio: 1 / 1.12; border-radius: 130px 130px 18px 18px; box-shadow: var(--shadow-2);
}
body[data-trade="cafe"] .tile .body {
  position: static; inset: auto; padding: 10px 2px 0; gap: 4px; background: none;
}
body[data-trade="cafe"] .tile .name { color: var(--ink); font-family: var(--display-serif); font-size: 16px; font-weight: 500; }
body[data-trade="cafe"] .tile .price { color: var(--ink); font-family: var(--display-serif); font-size: 14px; font-weight: 500; }
body[data-trade="cafe"] .tile .tiny { color: var(--muted); }
body[data-trade="cafe"] .tile .go { display: none; }
body[data-trade="cafe"] .tile.wide { display: block; grid-column: span 2; }
body[data-trade="cafe"] .tile.wide .thumb { width: 100%; aspect-ratio: 16 / 9; border-radius: 24px; }
body[data-trade="cafe"] .tile.wide .body { position: static; padding: 10px 2px 0; background: none; }
body[data-trade="cafe"] .sect { margin: 30px 0 10px; }
body[data-trade="cafe"] .sect .label {
  font-family: var(--display-serif); font-size: 19px; font-weight: 500; letter-spacing: -0.01em;
  text-transform: none; color: var(--ink);
}
body[data-trade="cafe"] .sect .count { border-color: transparent; background: none; color: var(--muted); font-size: 10px; }
body[data-trade="cafe"] .chip { border: 0; box-shadow: var(--shadow-1); }
body[data-trade="cafe"] .offer, body[data-trade="cafe"] .info {
  border-color: transparent; border-radius: 20px; background: color-mix(in srgb, var(--surface) 78%, transparent);
  box-shadow: none;
}
body[data-trade="cafe"] .tabbar {
  position: absolute; left: 16px; right: 16px; bottom: calc(12px + env(safe-area-inset-bottom));
  border: 0; border-radius: 999px; padding: 8px 10px;
  background: color-mix(in srgb, var(--surface) 90%, transparent);
  box-shadow: var(--shadow-3); backdrop-filter: blur(24px) saturate(160%);
  -webkit-backdrop-filter: blur(24px) saturate(160%);
}
body[data-trade="cafe"] .tab { font-size: 8.5px; letter-spacing: 0.08em; }
body[data-trade="cafe"] .tab.on { background: var(--ink); color: var(--bg); border-radius: 999px; }

/* Clinic: calm care cards. A flat status panel instead of a photo cover,
   rounded white rows with a quiet accent edge, and a small, highly legible
   type scale. */
body[data-trade="clinic"] { --nav-space: 90px; }
body[data-trade="clinic"] .app::before {
  height: 330px;
  background: radial-gradient(100% 70% at 50% -12%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 70%);
}
body[data-trade="clinic"] .appbar { border-bottom: 1px solid var(--hair); }
body[data-trade="clinic"] .appbar .mark {
  border-radius: 9px; background: var(--accent-soft); color: var(--accent-text); box-shadow: none;
  font-family: var(--body); font-weight: 750;
}
body[data-trade="clinic"] .appbar .title { font-family: var(--body); font-size: 15px; letter-spacing: -0.01em; }
body[data-trade="clinic"] .screen { padding-inline: 18px; }
body[data-trade="clinic"] .cover {
  display: block; min-height: 0; padding: 20px; border-radius: 16px;
  background: var(--surface); color: var(--ink); box-shadow: none;
  border: 1px solid var(--hair); border-top: 4px solid var(--accent);
}
body[data-trade="clinic"] .cover .cover-art,
body[data-trade="clinic"] .cover .mono { display: none; }
/* The cover already carries the clinic's hours, address and name; the shell's
   separate visit card would repeat the same block immediately above it. */
body[data-trade="clinic"] .care-visit { display: none; }
body[data-trade="clinic"] .cover .cover-in { position: relative; z-index: 1; }
body[data-trade="clinic"] .cover .eyebrow { color: var(--accent-text); letter-spacing: 0.16em; }
body[data-trade="clinic"] .cover .eyebrow::before { background: var(--accent); }
body[data-trade="clinic"] .cover h1 {
  font-family: var(--body); font-size: clamp(28px, 8.5vw, 34px); font-weight: 650;
  line-height: 1.08; letter-spacing: -0.025em; margin-top: 10px;
}
body[data-trade="clinic"] .cover p { margin-top: 9px; font-size: 14px; line-height: 1.55; max-width: 36ch; color: var(--muted); }
body[data-trade="clinic"] .cover .cover-rule { display: block; background: var(--hair); margin: 16px 0 12px; }
body[data-trade="clinic"] .cover .cover-meta { display: flex; gap: 8px; color: var(--muted); }
body[data-trade="clinic"] .cover .cover-meta span {
  background: var(--surface-2); border-radius: 6px; padding: 5px 8px; color: var(--ink); font-size: 10px;
}
body[data-trade="clinic"] .actions { margin-top: 14px; }
body[data-trade="clinic"] .actions .btn { border-radius: 10px; }
body[data-trade="clinic"] .status-card {
  border-radius: 14px; border-left: 3px solid var(--accent); box-shadow: none;
}
body[data-trade="clinic"] .sect { margin: 24px 0 8px; padding: 0 2px; }
body[data-trade="clinic"] .sect .label {
  font-size: 10px; font-weight: 750; letter-spacing: 0.18em; color: var(--accent-text);
}
body[data-trade="clinic"] .sect .count {
  border: 1px solid var(--hair); border-radius: 999px; padding: 3px 8px;
  background: transparent; color: var(--muted); font-size: 9px;
}
body[data-trade="clinic"] .r-row {
  display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; gap: 12px; align-items: center;
  padding: 13px 14px; margin-bottom: 9px; border: 1px solid var(--hair);
  border-left: 3px solid color-mix(in srgb, var(--accent) 60%, transparent);
  border-radius: 14px; background: var(--surface); box-shadow: none;
}
body[data-trade="clinic"] .r-row:last-child { border-bottom: 1px solid var(--hair); }
body[data-trade="clinic"] .r-row .r-art {
  width: 44px; height: 44px; border-radius: 10px; background: var(--surface-2); box-shadow: none;
}
body[data-trade="clinic"] .r-row .r-art .mono { font-size: 16px; }
body[data-trade="clinic"] .r-row .name {
  font-family: var(--body); font-size: 15px; font-weight: 650; letter-spacing: -0.005em;
}
body[data-trade="clinic"] .r-row .desc { font-size: 12px; line-height: 1.45; margin-top: 2px; }
body[data-trade="clinic"] .r-row .tail .price { font-family: var(--body); font-size: 13.5px; font-weight: 650; }
body[data-trade="clinic"] .r-row .add { width: 30px; height: 30px; background: none; }
body[data-trade="clinic"] .offer { border-radius: 12px; box-shadow: none; }
body[data-trade="clinic"] .info { border-radius: 14px; box-shadow: none; }
body[data-trade="clinic"] .loyalty { border-radius: 14px; box-shadow: none; }
body[data-trade="clinic"] .tabbar { background: var(--surface); }
body[data-trade="clinic"] .tab { border-radius: 6px; font-size: 8.5px; letter-spacing: 0.12em; }
body[data-trade="clinic"] .tab.on { background: var(--accent-soft); color: var(--accent-text); }

/* Shop: a price-tag catalogue. Flat shelving, boxed prices, label-sized chips
   and a rail of a tab bar — stock on a shelf, not a magazine cover. */
body[data-trade="shop"] .app::before { display: none; }
body[data-trade="shop"] .appbar {
  background: var(--surface); border-bottom: 1px solid var(--ink);
  backdrop-filter: none; -webkit-backdrop-filter: none;
}
body[data-trade="shop"] .appbar .mark {
  border-radius: 2px; background: var(--ink); color: var(--bg); box-shadow: none;
  font-size: 11px; letter-spacing: 0.04em;
}
body[data-trade="shop"] .appbar .kicker { letter-spacing: 0.24em; }
body[data-trade="shop"] .cover {
  min-height: 200px; border-radius: 2px; padding: 20px; justify-content: flex-end;
  background: var(--surface); color: var(--ink); box-shadow: none;
  border: 1px solid var(--line);
}
body[data-trade="shop"] .cover .cover-art { opacity: 0.45; }
body[data-trade="shop"] .cover .mono { display: none; }
body[data-trade="shop"] .cover .eyebrow { color: var(--muted); }
body[data-trade="shop"] .cover .eyebrow::before { background: var(--accent); }
body[data-trade="shop"] .cover h1 { font-size: clamp(26px, 8vw, 34px); letter-spacing: -0.03em; margin-top: 10px; }
body[data-trade="shop"] .cover p { color: var(--muted); font-size: 13px; margin-top: 8px; }
body[data-trade="shop"] .cover .cover-rule { background: var(--hair); margin: 14px 0 10px; }
body[data-trade="shop"] .cover .cover-meta {
  color: var(--muted); font-size: 9.5px; letter-spacing: 0.1em; text-transform: uppercase;
}
body[data-trade="shop"] .tiles { gap: 10px; }
body[data-trade="shop"] .tile { border-radius: 2px; border: 1px solid var(--line); box-shadow: none; padding: 0; }
body[data-trade="shop"] .tile .thumb { border-radius: 0; aspect-ratio: 1 / 1; }
body[data-trade="shop"] .tile .body { padding: 10px 10px 12px; gap: 6px; }
body[data-trade="shop"] .tile .name { font-size: 13px; letter-spacing: -0.01em; }
body[data-trade="shop"] .tile .price {
  justify-self: start; border: 1px solid var(--line); padding: 2px 7px;
  font-size: 11.5px; font-variant-numeric: tabular-nums;
}
body[data-trade="shop"] .tile .go { display: none; }
body[data-trade="shop"] .sect { margin: 26px 0 10px; }
body[data-trade="shop"] .sect .label { font-size: 10px; letter-spacing: 0.2em; }
body[data-trade="shop"] .sect .count {
  border-radius: 2px; border: 1px solid var(--line); background: none;
  color: var(--muted); font-size: 9.5px;
}
body[data-trade="shop"] .chip {
  border-radius: 2px; padding: 6px 10px; box-shadow: none;
  font-size: 9.5px; letter-spacing: 0.1em; text-transform: uppercase;
}
body[data-trade="shop"] .tabbar { border-top-color: var(--ink); }
body[data-trade="shop"] .tab { font-size: 8.5px; letter-spacing: 0.12em; text-transform: uppercase; }
body[data-trade="shop"] .tab.on { background: none; color: var(--ink); }
body[data-trade="shop"] .tab.on::after { background: var(--ink); }

/* The shelf's geometry reaches the shared parts too: a pill card, chip or
   button here would be another product's grammar. */
body[data-trade="shop"] :is(
  .card, .offer, .info, .loyalty, .status-card, .btn, .btn.small, .chip, .slot,
  .seg, .seg button, .stepper button, .iconbtn, .iconbtn .count, .search-field, .search-clear,
  .search-pill, .tag, .save, .session, .session button, .count, .meta-strip span,
  .h-row .add, .r-row .add, .thumb, .stack-card .specs span, .qty button, .spark, .tick,
  .tab, .tab.on, input[type="text"], textarea
) { border-radius: 2px; }
body[data-trade="shop"] .sheet { border-radius: 2px 2px 0 0; }

/* Salon: a lookbook. Arched portraits, hairline service lines and a serif
   scale that reads like a printed price list. */
body[data-trade="salon"] .appbar {
  background: transparent; border-bottom: 0;
  backdrop-filter: none; -webkit-backdrop-filter: none;
}
body[data-trade="salon"] .appbar .mark {
  border-radius: 50%; background: none; color: var(--ink); border: 1px solid var(--line);
  box-shadow: none; font-family: var(--display-serif); font-weight: 500;
}
body[data-trade="salon"] .appbar .title {
  font-family: var(--display-serif); font-weight: 500; font-style: italic; font-size: 17px;
}
body[data-trade="salon"] .cover {
  min-height: 340px; border-radius: 180px 180px 22px 22px; padding: 28px 22px;
  background: var(--surface-2); color: var(--ink); box-shadow: none;
}
body[data-trade="salon"] .cover .mono { display: none; }
body[data-trade="salon"] .cover h1 {
  font-family: var(--display-serif); font-weight: 500; font-size: clamp(32px, 10vw, 44px);
  letter-spacing: -0.02em;
}
body[data-trade="salon"] .cover p { font-size: 13px; color: var(--muted); }
body[data-trade="salon"] .cover .eyebrow { color: var(--muted); }
body[data-trade="salon"] .cover .cover-rule { background: color-mix(in srgb, var(--ink) 18%, transparent); }
body[data-trade="salon"] .cover .cover-meta {
  color: var(--muted); font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase;
}
body[data-trade="salon"] .r-row { border-radius: 0; background: none; box-shadow: none; padding: 18px 2px; }
body[data-trade="salon"] .r-row .r-art {
  width: 48px; height: 48px; border-radius: 50%; background: var(--surface-2); box-shadow: none;
}
body[data-trade="salon"] .r-row .name {
  font-family: var(--display-serif); font-weight: 500; font-size: 19px; letter-spacing: -0.012em;
}
body[data-trade="salon"] .r-row .desc { font-size: 12px; }
body[data-trade="salon"] .r-row .tail .price { font-family: var(--display-serif); font-weight: 500; font-size: 15px; }
body[data-trade="salon"] .sect { margin: 30px 0 4px; }
body[data-trade="salon"] .sect .label {
  font-family: var(--display-serif); font-style: italic; font-size: 18px; font-weight: 500;
  letter-spacing: 0; text-transform: none; color: var(--ink);
}
body[data-trade="salon"] .sect .count { background: none; border: 0; color: var(--muted); font-size: 9.5px; }
body[data-trade="salon"] .chip { border: 0; box-shadow: none; background: color-mix(in srgb, var(--surface) 80%, transparent); }
body[data-trade="salon"] .tabbar {
  left: 24px; right: 24px; border: 0; border-top: 1px solid var(--line); border-radius: 0;
  background: color-mix(in srgb, var(--bg) 90%, transparent); box-shadow: none;
}
body[data-trade="salon"] .tab { text-transform: uppercase; font-size: 8px; letter-spacing: 0.16em; }
body[data-trade="salon"] .tab.on { background: none; color: var(--ink); }
body[data-trade="salon"] .tab.on::after { background: var(--ink); }

/* Nothing in a lookbook is a pill: hairline geometry, and the main button cut
   from the same serif as the price list. */
body[data-trade="salon"] :is(
  .card, .offer, .info, .loyalty, .status-card, .btn, .btn.small, .chip, .slot,
  .seg, .seg button, .stepper button, .iconbtn, .iconbtn .count, .search-field, .search-clear,
  .search-pill, .tag, .save, .session, .session button, .count, .meta-strip span,
  .h-row .add, .r-row .add, .stack-card .specs span, .qty button, .spark, .tick,
  .tab, .tab.on, .gallery .thumb, input[type="text"], textarea
) { border-radius: 0; }
body[data-trade="salon"] .sheet { border-radius: 0; }
body[data-trade="salon"] .btn { font-family: var(--display-serif); font-weight: 500; font-size: 15px; }

/* Gym: a scoreboard. Condensed uppercase, a split accent slab and monospace
   numbers — the session list reads like a lane board. */
body[data-trade="gym"] .appbar {
  border-bottom: 2px solid var(--accent);
  background: color-mix(in srgb, var(--bg) 94%, transparent);
}
body[data-trade="gym"] .appbar .mark {
  border-radius: 2px; background: var(--accent); color: var(--on-accent); box-shadow: none;
  font-family: var(--display); font-weight: 800;
}
body[data-trade="gym"] .appbar .title {
  font-family: var(--display); text-transform: uppercase; font-size: 15px; letter-spacing: 0.03em;
}
body[data-trade="gym"] .sess-today {
  border-left: 4px solid var(--accent); border-bottom: 1px solid var(--hair);
  padding: 12px 0 10px 14px; border-radius: 0; background: none;
}
body[data-trade="gym"] .sess-today .eyebrow { color: var(--accent-text); letter-spacing: 0.24em; }
body[data-trade="gym"] .sess-today h2 {
  font-family: var(--display); text-transform: uppercase; font-size: 24px; letter-spacing: 0.01em;
}
body[data-trade="gym"] .sess-row {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 12px;
  padding: 10px 0; border-bottom: 1px solid var(--hair);
}
body[data-trade="gym"] .sess-row b {
  font-family: var(--display); text-transform: uppercase; font-size: 15px; letter-spacing: 0.02em;
}
body[data-trade="gym"] .sess-row span {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10.5px; color: var(--muted);
}
body[data-trade="gym"] .sess-row em {
  grid-column: 2; grid-row: 1 / span 2; align-self: center; font-style: normal;
  font-family: var(--display); text-transform: uppercase; font-size: 10px; letter-spacing: 0.08em; color: var(--muted);
}
body[data-trade="gym"] .cover {
  min-height: 300px; border-radius: 0; box-shadow: none; color: var(--on-accent);
  background: linear-gradient(118deg, var(--accent) 0 40%, var(--accent-deep) 40% 100%);
}
body[data-trade="gym"] .cover .cover-art { opacity: 0.28; }
body[data-trade="gym"] .cover h1 {
  font-family: var(--display); text-transform: uppercase; font-size: clamp(40px, 14vw, 64px);
  line-height: 0.84; letter-spacing: -0.01em;
}
body[data-trade="gym"] .cover p { color: color-mix(in srgb, var(--on-accent) 76%, transparent); }
body[data-trade="gym"] .cover .eyebrow { color: var(--on-accent); }
body[data-trade="gym"] .cover .eyebrow::before { background: var(--on-accent); }
body[data-trade="gym"] .cover .cover-rule { background: color-mix(in srgb, var(--on-accent) 36%, transparent); }
body[data-trade="gym"] .cover .cover-meta {
  color: color-mix(in srgb, var(--on-accent) 78%, transparent); font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.08em;
}
body[data-trade="gym"] .stack-card { border-radius: 4px; border-left: 4px solid var(--accent); box-shadow: none; }
body[data-trade="gym"] .stack-card .name {
  font-family: var(--display); text-transform: uppercase; font-size: 18px; letter-spacing: 0.02em;
}
body[data-trade="gym"] .stack-card .price { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
body[data-trade="gym"] .sect .label {
  font-family: var(--display); text-transform: uppercase; font-size: 10px; letter-spacing: 0.18em;
  color: var(--accent-text);
}
body[data-trade="gym"] .btn { border-radius: 4px; font-family: var(--display); text-transform: uppercase; letter-spacing: 0.03em; }
body[data-trade="gym"] .tab.on { background: var(--accent); color: var(--on-accent); border-radius: 4px; }

/* Processed signage, not UI: every shared part drops to the scoreboard's 4px
   cut. */
body[data-trade="gym"] :is(
  .card, .offer, .info, .loyalty, .status-card, .btn, .btn.small, .chip, .slot,
  .seg, .seg button, .stepper button, .iconbtn, .iconbtn .count, .search-field, .search-clear,
  .search-pill, .tag, .save, .session, .session button, .count, .meta-strip span,
  .h-row .add, .r-row .add, .thumb, .stack-card .specs span, .qty button, .spark, .tick,
  .tab, .tab.on, input[type="text"], textarea
) { border-radius: 4px; }
body[data-trade="gym"] .sheet { border-radius: 4px 4px 0 0; }

/* Trades: a work order. A stamped spec plate, numbered paper rows and chips
   that behave like job labels. */
body[data-trade="trades"] .appbar {
  background: var(--bg); border-bottom: 2px solid var(--ink);
  backdrop-filter: none; -webkit-backdrop-filter: none;
}
body[data-trade="trades"] .appbar .mark { border-radius: 0; background: var(--ink); color: var(--bg); box-shadow: none; }
body[data-trade="trades"] .appbar .title {
  font-family: var(--display); text-transform: uppercase; font-size: 14px; letter-spacing: 0.03em;
}
body[data-trade="trades"] .cover {
  display: block; min-height: 0; padding: 18px; border-radius: 0;
  background: var(--surface); color: var(--ink); border: 2px solid var(--ink); box-shadow: none;
}
body[data-trade="trades"] .cover .cover-art, body[data-trade="trades"] .cover .mono { display: none; }
body[data-trade="trades"] .cover h1 {
  font-family: var(--display); text-transform: uppercase; font-size: clamp(28px, 9vw, 38px);
  line-height: 0.92; letter-spacing: 0.005em; margin-top: 10px;
}
body[data-trade="trades"] .cover p { font-size: 13px; color: var(--muted); max-width: 40ch; margin-top: 8px; }
body[data-trade="trades"] .cover .cover-rule { background: var(--hair); margin: 14px 0 10px; }
body[data-trade="trades"] .cover .cover-meta {
  color: var(--ink); font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase;
}
body[data-trade="trades"] .r-row {
  border-bottom: 2px solid var(--ink); border-radius: 0; background: none; box-shadow: none; padding: 14px 0;
}
body[data-trade="trades"] .r-row .r-art { display: none; }
body[data-trade="trades"] .r-row .name {
  font-family: var(--display); text-transform: uppercase; font-size: 14px; letter-spacing: 0.02em;
}
body[data-trade="trades"] .r-row .desc { font-size: 12px; }
body[data-trade="trades"] .r-row .tail .price {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px;
  border: 1px solid var(--ink); padding: 2px 6px;
}
body[data-trade="trades"] .sect .label { font-size: 10px; letter-spacing: 0.2em; }
body[data-trade="trades"] .sect .count {
  border-radius: 0; border: 1px solid var(--ink); background: none; color: var(--ink);
  font-size: 9px; padding: 2px 6px;
}
body[data-trade="trades"] .chip {
  border-radius: 0; box-shadow: none; padding: 7px 12px;
  font-size: 9.5px; letter-spacing: 0.1em; text-transform: uppercase;
}
body[data-trade="trades"] .chip.on { background: var(--ink); color: var(--bg); }
body[data-trade="trades"] .status-card {
  border-radius: 0; border: 1px solid var(--ink); border-left: 3px solid var(--accent); box-shadow: none;
}
body[data-trade="trades"] .btn { border-radius: 0; }
body[data-trade="trades"] .tab { text-transform: uppercase; font-size: 8.5px; letter-spacing: 0.1em; }
body[data-trade="trades"] .tab.on::after { background: var(--ink); }

/* A work order is printed, punched and filed: no rounded corner survives. */
body[data-trade="trades"] :is(
  .card, .offer, .info, .loyalty, .status-card, .btn, .btn.small, .chip, .slot,
  .seg, .seg button, .stepper button, .iconbtn, .iconbtn .count, .search-field, .search-clear,
  .search-pill, .tag, .save, .session, .session button, .count, .meta-strip span,
  .h-row .add, .r-row .add, .thumb, .stack-card .specs span, .qty button, .spark, .tick,
  .tab, .tab.on, .h-row, .r-row, input[type="text"], textarea
) { border-radius: 0; }
body[data-trade="trades"] .sheet { border-radius: 0; }

/* Professional: a briefing. A title page instead of a hero, memo rows and a
   dock that reads like the footer of a document. */
body[data-trade="professional"] .appbar {
  background: transparent; border-bottom: 1px solid var(--hair);
  backdrop-filter: none; -webkit-backdrop-filter: none;
}
body[data-trade="professional"] .appbar .mark {
  border-radius: 0; background: none; color: var(--ink); border: 1px solid var(--ink);
  box-shadow: none; font-family: var(--display-serif); font-weight: 500;
}
body[data-trade="professional"] .appbar .title {
  font-family: var(--display-serif); font-weight: 500; font-size: 16px; letter-spacing: -0.01em;
}
body[data-trade="professional"] .l-hero {
  display: block; min-height: 0; padding: 26px 0 24px; border-radius: 0; overflow: visible;
  background: none; color: var(--ink); box-shadow: none; border-bottom: 1px solid var(--ink);
}
body[data-trade="professional"] .l-hero::after,
body[data-trade="professional"] .l-hero .hero-art { display: none; }
body[data-trade="professional"] .l-hero .hero-in { width: 100%; }
body[data-trade="professional"] .l-hero h1 {
  font-family: var(--display-serif); font-size: clamp(34px, 11vw, 50px); font-weight: 500;
  line-height: 0.98; letter-spacing: -0.025em; margin-top: 14px; text-shadow: none;
}
body[data-trade="professional"] .l-hero p { color: var(--muted); font-size: 13.5px; max-width: 36ch; margin-top: 12px; }
body[data-trade="professional"] .l-hero .eyebrow { color: var(--muted); letter-spacing: 0.26em; }
body[data-trade="professional"] .l-hero .eyebrow::before { background: var(--accent); }
body[data-trade="professional"] .l-hero .hero-foot { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--hair); }
body[data-trade="professional"] .l-hero .hero-cta {
  border-radius: 0; background: var(--ink); color: var(--bg); box-shadow: none;
  padding: 10px 16px; font-size: 10.5px; letter-spacing: 0.08em; text-transform: uppercase;
}
body[data-trade="professional"] .l-hero .hero-meta {
  color: var(--muted); text-transform: uppercase; letter-spacing: 0.1em; font-size: 9.5px;
}
body[data-trade="professional"] .actions .btn { border-radius: 0; }
body[data-trade="professional"] .h-row { padding: 16px 0; gap: 14px; }
body[data-trade="professional"] .h-row .name {
  font-family: var(--display-serif); font-weight: 500; font-size: 18px;
}
body[data-trade="professional"] .h-row .right .price { font-family: var(--display-serif); font-weight: 500; }
body[data-trade="professional"] .sect {
  margin: 28px 0 4px; padding-bottom: 6px; border-bottom: 1px solid var(--ink);
}
body[data-trade="professional"] .sect .label { font-size: 9px; letter-spacing: 0.28em; color: var(--ink); }
body[data-trade="professional"] .sect .count {
  border: 0; border-radius: 0; background: none; padding: 0;
  color: var(--muted); font-size: 9px; letter-spacing: 0.18em;
}
body[data-trade="professional"] .info {
  border: 0; border-top: 1px solid var(--hair); border-radius: 0; background: none;
  box-shadow: none; padding: 14px 0;
}
body[data-trade="professional"] .tab { text-transform: uppercase; font-size: 8px; letter-spacing: 0.16em; }
body[data-trade="professional"] .tab.on {
  background: none; border-radius: 0; color: var(--ink); box-shadow: inset 0 -2px 0 0 var(--ink);
}
body[data-trade="professional"] .tab.on::after { display: none; }

/* Set like a typed brief: square-edged throughout, including the form and the
   sheet that holds the cart. */
body[data-trade="professional"] :is(
  .card, .offer, .info, .loyalty, .status-card, .btn, .btn.small, .chip, .slot,
  .seg, .seg button, .stepper button, .iconbtn, .iconbtn .count, .search-field, .search-clear,
  .search-pill, .tag, .save, .session, .session button, .count, .meta-strip span,
  .h-row .add, .r-row .add, .thumb, .stack-card .specs span, .qty button, .spark, .tick,
  .tab, .tab.on, .h-row, .r-row, .session-facts div, .care-facts div, .agent,
  .listing-specs div, input[type="text"], textarea
) { border-radius: 0; }
body[data-trade="professional"] .sheet { border-radius: 0; }

/* Property: a listing sheet. Full-bleed photography under a caption plate,
   square cards and specifications set as small caps. */
body[data-trade="property"] .appbar {
  background: var(--surface); border-bottom: 1px solid var(--ink);
  backdrop-filter: none; -webkit-backdrop-filter: none;
}
body[data-trade="property"] .search-pill {
  border-radius: 0; border: 1px solid var(--ink); background: none; box-shadow: none;
}
body[data-trade="property"] .cover {
  display: block; margin-inline: -18px; min-height: 320px; padding: 0; border-radius: 0;
  background: var(--surface-2); color: var(--ink); box-shadow: none;
}
body[data-trade="property"] .cover .mono { display: none; }
body[data-trade="property"] .cover .cover-in {
  position: absolute; left: 16px; right: 16px; bottom: 16px; z-index: 3;
  background: var(--surface); color: var(--ink); border: 1px solid var(--ink); padding: 14px 16px;
}
body[data-trade="property"] .cover .eyebrow { color: var(--muted); }
body[data-trade="property"] .cover h1 {
  font-family: var(--display-serif); font-size: clamp(26px, 8vw, 32px); font-weight: 500; margin-top: 6px;
}
body[data-trade="property"] .cover p { display: none; }
body[data-trade="property"] .cover .cover-rule { display: none; }
body[data-trade="property"] .cover .cover-meta {
  color: var(--muted); font-size: 9.5px; letter-spacing: 0.1em; text-transform: uppercase; margin-top: 8px;
}
body[data-trade="property"] .stack-card { border-radius: 0; border: 1px solid var(--line); box-shadow: none; }
body[data-trade="property"] .stack-card .thumb { border-radius: 0; }
body[data-trade="property"] .stack-card .specs span {
  border-radius: 0; background: none; border: 1px solid var(--line);
}
body[data-trade="property"] .chip {
  border-radius: 0; box-shadow: none; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase;
}
body[data-trade="property"] .chip.on { background: var(--ink); color: var(--bg); }
body[data-trade="property"] .sect .label { font-family: var(--display-serif); font-size: 10px; letter-spacing: 0.22em; }
body[data-trade="property"] .sect .count {
  border-radius: 0; border: 1px solid var(--line); background: none; color: var(--muted);
}
body[data-trade="property"] .r-row { border-bottom: 1px solid var(--ink); border-radius: 0; background: none; box-shadow: none; }
body[data-trade="property"] .r-row .r-art { border-radius: 0; }
body[data-trade="property"] .btn { border-radius: 0; }
body[data-trade="property"] .tab { text-transform: uppercase; font-size: 8.5px; letter-spacing: 0.1em; }

/* Surveyed, not styled: square plates, square spec boxes, square agent card. */
body[data-trade="property"] :is(
  .card, .offer, .info, .loyalty, .status-card, .btn, .btn.small, .chip, .slot,
  .seg, .seg button, .stepper button, .iconbtn, .iconbtn .count, .search-field, .search-clear,
  .search-pill, .tag, .save, .session, .session button, .count, .meta-strip span,
  .h-row .add, .r-row .add, .thumb, .stack-card .specs span, .qty button, .spark, .tick,
  .tab, .tab.on, .tile, .h-row, .r-row, .listing-specs div, .agent,
  input[type="text"], textarea
) { border-radius: 0; }
body[data-trade="property"] .sheet { border-radius: 0; }

/* Hotel: a suite card. Wide serif, small-caps labels, a light key-card hero
   on the dark ground and a plate of a nav. */
body[data-trade="hotel"] .appbar {
  background: transparent; border-bottom: 1px solid color-mix(in srgb, var(--ink) 18%, transparent);
  backdrop-filter: none; -webkit-backdrop-filter: none;
}
body[data-trade="hotel"] .appbar .mark {
  border-radius: 0; background: none; color: var(--ink);
  border: 1px solid color-mix(in srgb, var(--ink) 30%, transparent); box-shadow: none;
  font-family: var(--display-serif); font-weight: 500;
}
body[data-trade="hotel"] .appbar .kicker { letter-spacing: 0.34em; }
body[data-trade="hotel"] .l-hero {
  min-height: 340px; border-radius: 2px; padding: 26px 22px;
  background: linear-gradient(180deg, var(--surface) 0%, var(--surface-2) 100%);
  color: var(--ink); box-shadow: none;
  border: 1px solid color-mix(in srgb, var(--ink) 16%, transparent);
}
body[data-trade="hotel"] .l-hero h1 {
  font-family: var(--display-serif); font-weight: 500; font-size: clamp(38px, 12vw, 54px);
  line-height: 0.92; letter-spacing: -0.015em; text-shadow: none;
}
body[data-trade="hotel"] .l-hero p { color: color-mix(in srgb, var(--ink) 78%, transparent); font-size: 13px; }
body[data-trade="hotel"] .l-hero .eyebrow { color: color-mix(in srgb, var(--ink) 70%, transparent); letter-spacing: 0.28em; }
body[data-trade="hotel"] .l-hero .hero-cta {
  border-radius: 0; background: var(--ink); color: var(--bg); box-shadow: none;
  padding: 11px 18px; font-size: 10.5px; letter-spacing: 0.14em; text-transform: uppercase;
}
body[data-trade="hotel"] .l-hero .hero-meta { color: color-mix(in srgb, var(--ink) 74%, transparent); }
body[data-trade="hotel"] .h-row { padding: 18px 0; }
body[data-trade="hotel"] .h-row .name {
  font-family: var(--display-serif); font-weight: 500; font-size: 21px; letter-spacing: -0.01em;
}
body[data-trade="hotel"] .h-row .right .price { font-family: var(--display-serif); font-weight: 500; font-size: 17px; }
body[data-trade="hotel"] .sect { margin: 32px 0 6px; }
body[data-trade="hotel"] .sect .label { font-size: 9.5px; letter-spacing: 0.32em; color: color-mix(in srgb, var(--ink) 80%, transparent); }
body[data-trade="hotel"] .sect .count {
  background: none; border: 0; padding: 0;
  color: color-mix(in srgb, var(--ink) 62%, transparent); font-size: 9px; letter-spacing: 0.2em;
}
body[data-trade="hotel"] .tabbar {
  left: 22px; right: 22px; border-radius: 2px;
  border: 1px solid color-mix(in srgb, var(--ink) 18%, transparent);
  background: color-mix(in srgb, var(--surface) 90%, transparent); box-shadow: none;
}
body[data-trade="hotel"] .tab { text-transform: uppercase; font-size: 8px; letter-spacing: 0.16em; }

/* A key card has corners, but barely: 2px through every card, chip, button,
   form field and sheet, including the room card inside the booking screen. */
body[data-trade="hotel"] :is(
  .card, .offer, .info, .loyalty, .status-card, .btn, .btn.small, .chip, .slot,
  .seg, .seg button, .stepper button, .iconbtn, .iconbtn .count, .search-field, .search-clear,
  .search-pill, .tag, .save, .session, .session button, .count, .meta-strip span,
  .h-row .add, .r-row .add, .thumb, .stack-card .specs span, .qty button, .spark, .tick,
  .tab, .tab.on, .h-row, .r-row, input[type="text"], textarea
) { border-radius: 2px; }
body[data-trade="hotel"] .sheet { border-radius: 2px 2px 0 0; }

/* Studio: a poster wall. An inverted block, oversized uppercase, zero radius
   and a nav that is a rule with names on it. */
body[data-trade="studio"] .app::before { display: none; }
body[data-trade="studio"] .appbar {
  background: transparent; border-bottom: 1px solid var(--ink);
  backdrop-filter: none; -webkit-backdrop-filter: none;
}
body[data-trade="studio"] .appbar .mark {
  border-radius: 0; background: none; color: var(--ink); box-shadow: none;
  font-size: 11px; letter-spacing: 0.06em;
}
body[data-trade="studio"] .appbar .title { text-transform: uppercase; font-size: 13px; letter-spacing: 0.06em; }
body[data-trade="studio"] .cover {
  min-height: 380px; border-radius: 0; padding: 26px 22px; justify-content: flex-end;
  background: var(--ink); color: var(--bg); box-shadow: none;
}
body[data-trade="studio"] .cover .cover-art, body[data-trade="studio"] .cover .mono { display: none; }
body[data-trade="studio"] .cover h1 {
  text-transform: uppercase; font-size: clamp(40px, 15vw, 72px); line-height: 0.82;
  letter-spacing: -0.045em; margin-top: 12px;
}
body[data-trade="studio"] .cover p { color: color-mix(in srgb, var(--bg) 74%, transparent); font-size: 12.5px; }
body[data-trade="studio"] .cover .eyebrow { color: color-mix(in srgb, var(--bg) 66%, transparent); letter-spacing: 0.3em; }
body[data-trade="studio"] .cover .eyebrow::before { background: var(--bg); }
body[data-trade="studio"] .cover .cover-rule { background: color-mix(in srgb, var(--bg) 30%, transparent); }
body[data-trade="studio"] .cover .cover-meta {
  color: color-mix(in srgb, var(--bg) 74%, transparent); text-transform: uppercase;
  font-size: 9px; letter-spacing: 0.16em;
}
body[data-trade="studio"] .tiles { gap: 18px 10px; }
body[data-trade="studio"] .tile { border: 0; border-radius: 0; background: none; box-shadow: none; padding: 0; }
body[data-trade="studio"] .tile .thumb { border-radius: 0; }
body[data-trade="studio"] .tile .body { padding: 9px 0 0; }
body[data-trade="studio"] .tile .name { text-transform: uppercase; font-size: 11px; letter-spacing: 0.1em; }
body[data-trade="studio"] .tile .price { font-size: 11px; letter-spacing: 0.08em; color: var(--muted); }
body[data-trade="studio"] .tile .go { display: none; }
body[data-trade="studio"] .sect .label { font-size: 9px; letter-spacing: 0.3em; color: var(--ink); }
body[data-trade="studio"] .sect .count {
  border: 0; border-radius: 0; background: none; padding: 0; color: var(--muted); font-size: 9px;
}
body[data-trade="studio"] .btn { border-radius: 0; text-transform: uppercase; font-size: 11px; letter-spacing: 0.12em; }
body[data-trade="studio"] .tabbar {
  border-top: 1px solid var(--ink); border-radius: 0; background: var(--bg);
  box-shadow: none; backdrop-filter: none; -webkit-backdrop-filter: none;
}
body[data-trade="studio"] .tab { text-transform: uppercase; font-size: 8px; letter-spacing: 0.16em; }
body[data-trade="studio"] .tab.on { background: none; color: var(--ink); }
body[data-trade="studio"] .tab.on::after { background: var(--ink); }

/* Pasted on a wall: no radius anywhere, including the catalogue chips and the
   saved-item row on the Visit screen. */
body[data-trade="studio"] :is(
  .card, .offer, .info, .loyalty, .status-card, .btn, .btn.small, .chip, .slot,
  .seg, .seg button, .stepper button, .iconbtn, .iconbtn .count, .search-field, .search-clear,
  .search-pill, .tag, .save, .session, .session button, .count, .meta-strip span,
  .h-row .add, .r-row .add, .thumb, .stack-card .specs span, .qty button, .spark, .tick,
  .tab, .tab.on, .h-row, .r-row, input[type="text"], textarea
) { border-radius: 0; }
body[data-trade="studio"] .sheet { border-radius: 0; }

/* Auto: a spec sheet. Condensed model names, monospace figures, hard rules
   and a status strip that reads like a service readout. */
body[data-trade="auto"] .app::before { display: none; }
body[data-trade="auto"] .appbar {
  background: var(--surface); border-bottom: 2px solid var(--ink);
  backdrop-filter: none; -webkit-backdrop-filter: none;
}
body[data-trade="auto"] .appbar .mark {
  border-radius: 2px; background: var(--ink); color: var(--bg); box-shadow: none;
  font-family: var(--display);
}
body[data-trade="auto"] .appbar .title {
  font-family: var(--display); text-transform: uppercase; font-size: 15px; letter-spacing: 0.03em;
}
body[data-trade="auto"] .cover {
  display: block; min-height: 0; padding: 20px; border-radius: 0;
  background: var(--surface); color: var(--ink); box-shadow: none;
  border: 1px solid var(--line); border-bottom: 3px solid var(--ink);
}
body[data-trade="auto"] .cover .cover-art, body[data-trade="auto"] .cover .mono { display: none; }
body[data-trade="auto"] .cover h1 {
  font-family: var(--display); text-transform: uppercase; font-size: clamp(30px, 10vw, 44px);
  line-height: 0.9; letter-spacing: 0.005em; margin-top: 10px;
}
body[data-trade="auto"] .cover p { color: var(--muted); font-size: 13px; margin-top: 8px; }
body[data-trade="auto"] .cover .eyebrow { color: var(--accent-text); }
body[data-trade="auto"] .cover .cover-rule { background: var(--hair); margin: 14px 0 10px; }
body[data-trade="auto"] .cover .cover-meta {
  color: var(--ink); font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 9.5px; letter-spacing: 0.02em;
}
body[data-trade="auto"] .status-card {
  border-radius: 0; border: 1px solid var(--line); border-left: 3px solid var(--accent); box-shadow: none;
}
body[data-trade="auto"] .r-row {
  border-bottom: 1px solid var(--line); border-radius: 0; background: none; box-shadow: none; padding: 14px 0;
}
body[data-trade="auto"] .r-row .r-art { border-radius: 2px; background: var(--surface-2); box-shadow: none; }
body[data-trade="auto"] .r-row .name {
  font-family: var(--display); text-transform: uppercase; font-size: 15px; letter-spacing: 0.02em;
}
body[data-trade="auto"] .r-row .tail .price {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; letter-spacing: -0.02em;
}
body[data-trade="auto"] .sect .label { font-size: 9.5px; letter-spacing: 0.22em; color: var(--accent-text); }
body[data-trade="auto"] .sect .count {
  border-radius: 0; border: 1px solid var(--line); background: none; color: var(--muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 9px;
}
body[data-trade="auto"] .chip {
  border-radius: 2px; box-shadow: none; font-size: 9.5px; letter-spacing: 0.1em; text-transform: uppercase;
}
body[data-trade="auto"] .chip.on { background: var(--ink); color: var(--bg); }
body[data-trade="auto"] .btn {
  border-radius: 2px; font-family: var(--display); text-transform: uppercase; letter-spacing: 0.04em;
}
body[data-trade="auto"] .tab { text-transform: uppercase; font-size: 8.5px; letter-spacing: 0.1em; }

/* Drawn on a datasheet: 2px corners on the shared parts, so the booking card
   and the time slots match the technical plate above them. */
body[data-trade="auto"] :is(
  .card, .offer, .info, .loyalty, .status-card, .btn, .btn.small, .chip, .slot,
  .seg, .seg button, .stepper button, .iconbtn, .iconbtn .count, .search-field, .search-clear,
  .search-pill, .tag, .save, .session, .session button, .count, .meta-strip span,
  .h-row .add, .r-row .add, .thumb, .stack-card .specs span, .qty button, .spark, .tick,
  .tab, .tab.on, .h-row, .r-row, input[type="text"], textarea
) { border-radius: 2px; }
body[data-trade="auto"] .sheet { border-radius: 2px 2px 0 0; }

/* Hospital: calm wayfinding. White cards on pale blue, a status rail, quiet tabs. */
body[data-trade="hospital"] .appbar { background: var(--surface); border-bottom: 1px solid var(--line); }
body[data-trade="hospital"] .status-card {
  border-radius: 14px; border-left: 3px solid var(--accent); background: var(--surface); box-shadow: none;
}
body[data-trade="hospital"] .r-row {
  border-radius: 14px; border: 1px solid var(--line); background: var(--surface); padding: 14px; margin-bottom: 8px;
}
body[data-trade="hospital"] .sect .label { letter-spacing: 0.24em; color: var(--accent-text); }
body[data-trade="hospital"] .tab { letter-spacing: 0.06em; }
body[data-trade="hospital"] .tab.on { background: var(--accent-soft); }
body[data-trade="hospital"] .tabbar { background: var(--surface); border-top: 1px solid var(--line); }
body[data-trade="hospital"] .appbar .mark { border-radius: 10px; }
body[data-trade="hospital"] .card { border-radius: 14px; border: 1px solid var(--line); box-shadow: none; }
body[data-trade="hospital"] .chip { border-radius: 999px; border: 1px solid var(--line); background: var(--surface); }
body[data-trade="hospital"] .slot { border-radius: 10px; }

/* Online store: product first. Squarer photography, the price set loud, a quiet buy bar. */
body[data-trade="ecommerce"] .tile .thumb { aspect-ratio: 1 / 1; }
body[data-trade="ecommerce"] .tile .name { font-size: 13.5px; letter-spacing: 0; }
body[data-trade="ecommerce"] .tile .price { font-size: 14.5px; color: var(--ink); }
body[data-trade="ecommerce"] .chip { font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase; }
body[data-trade="ecommerce"] .detail-cta { background: var(--surface); box-shadow: 0 -18px 30px -26px #000; }
body[data-trade="ecommerce"] .card { border-radius: 16px; border: 1px solid var(--line); box-shadow: none; }
body[data-trade="ecommerce"] .btn { border-radius: 999px; }
body[data-trade="ecommerce"] .slot { border-radius: 12px; }
body[data-trade="ecommerce"] .tabbar { border-top: 1px solid var(--line); }
body[data-trade="ecommerce"] .appbar .title { letter-spacing: -0.03em; }

/* Houseplants: soft and botanical. Italic serif names, round-topped art, generous buttons. */
body[data-trade="plants-indoor"] .tile .name { font-family: var(--display); font-style: italic; font-size: 15px; }
body[data-trade="plants-indoor"] .tile .thumb { border-radius: 50% 50% 18px 18px; }
body[data-trade="plants-indoor"] .sect .label { letter-spacing: 0.26em; }
body[data-trade="plants-indoor"] .btn { border-radius: 18px; }
body[data-trade="plants-indoor"] .cover { border: 1px solid var(--line); box-shadow: none; }
body[data-trade="plants-indoor"] .card { border-radius: 18px; }
body[data-trade="plants-indoor"] .chip { border-radius: 999px; background: var(--surface); }
body[data-trade="plants-indoor"] .slot { border-radius: 14px; }
body[data-trade="plants-indoor"] .tabbar { background: color-mix(in srgb, var(--surface) 92%, transparent); }
body[data-trade="plants-indoor"] .appbar { background: var(--bg); }

/* Garden centre: nursery labels. Condensed caps, hard corners, prices like plant labels. */
body[data-trade="plants-outdoor"] .tile { border-radius: 4px; }
body[data-trade="plants-outdoor"] .tile .name,
body[data-trade="plants-outdoor"] .r-row .name { text-transform: uppercase; letter-spacing: 0.04em; }
body[data-trade="plants-outdoor"] .tile .price,
body[data-trade="plants-outdoor"] .r-row .price { font-size: 12px; letter-spacing: 0.02em; }
body[data-trade="plants-outdoor"] .chip {
  border-radius: 3px; text-transform: uppercase; font-size: 9px; letter-spacing: 0.14em;
}
body[data-trade="plants-outdoor"] .sect { border-bottom: 2px solid var(--ink); padding-bottom: 6px; }
body[data-trade="plants-outdoor"] .card { border-radius: 4px; border: 1px solid var(--line); }
body[data-trade="plants-outdoor"] .btn { border-radius: 4px; }
body[data-trade="plants-outdoor"] .slot { border-radius: 3px; }
body[data-trade="plants-outdoor"] .tabbar { background: var(--surface); }
body[data-trade="plants-outdoor"] .appbar { background: var(--surface); border-bottom: 1px solid var(--ink); }

/* Online courses: a dark classroom. Lesson cards carry an accent rule, meta set in caps. */
body[data-trade="courses"] .stack-card {
  background: var(--surface); border: 0; border-left: 2px solid var(--accent); border-radius: 0 16px 16px 0;
}
body[data-trade="courses"] .stack-card .name { font-size: 15px; }
body[data-trade="courses"] .stack-card .price { font-family: var(--price-font); font-size: 13px; }
body[data-trade="courses"] .sect .label { color: var(--accent-text); letter-spacing: 0.24em; }
body[data-trade="courses"] .btn.accent { box-shadow: 0 12px 30px -14px var(--accent); }
body[data-trade="courses"] .card { background: var(--surface); border-radius: 16px; }
body[data-trade="courses"] .chip { border-radius: 999px; border: 1px solid var(--line); }
body[data-trade="courses"] .slot { border-radius: 12px; }
body[data-trade="courses"] .tabbar { background: var(--surface); }
body[data-trade="courses"] .appbar { background: color-mix(in srgb, var(--bg) 92%, transparent); }

/* Tuition: warm paper and term cards. Serif headings, a rule beside every programme. */
body[data-trade="tuition"] .r-row {
  border-left: 3px solid var(--accent); padding-left: 14px; border-bottom: 1px solid var(--hair);
}
body[data-trade="tuition"] .r-row .name { font-family: var(--display); font-size: 16px; }
body[data-trade="tuition"] .h-row {
  border-left: 3px solid var(--accent-soft); border-bottom: 1px solid var(--hair); padding-left: 14px;
}
body[data-trade="tuition"] .sect .label {
  font-family: var(--display); text-transform: none; letter-spacing: 0; font-size: 13px;
}
body[data-trade="tuition"] .chip { border: 1px solid var(--line); background: var(--surface); }
body[data-trade="tuition"] .card { border-radius: 6px; border: 1px solid var(--line); }
body[data-trade="tuition"] .btn { border-radius: 6px; }
body[data-trade="tuition"] .slot { border-radius: 4px; }
body[data-trade="tuition"] .tabbar { background: var(--surface); border-top: 1px solid var(--hair); }
body[data-trade="tuition"] .appbar { background: var(--bg); border-bottom: 1px solid var(--hair); }

/* School: clear and friendly. Chunky chips, tinted cards, a noticeboard timetable. */
body[data-trade="school"] .chip { border-radius: 999px; font-weight: 700; letter-spacing: 0.02em; }
body[data-trade="school"] .r-row {
  background: var(--surface); border: 0; border-radius: 12px; padding: 14px 16px; margin-bottom: 8px;
}
body[data-trade="school"] .sess-today { background: var(--surface); border-radius: 14px; }
body[data-trade="school"] .sect .label { letter-spacing: 0.16em; }
body[data-trade="school"] .btn { border-radius: 999px; }
body[data-trade="school"] .card { border-radius: 12px; border: 1px solid var(--line); box-shadow: none; }
body[data-trade="school"] .slot { border-radius: 10px; }
body[data-trade="school"] .tile { border-radius: 14px; }
body[data-trade="school"] .tabbar { background: var(--surface); border-top: 1px solid var(--line); }
body[data-trade="school"] .appbar { background: var(--surface); }

/* Kindergarten: rounded and unhurried. Everything soft, labels in plain sentence case. */
body[data-trade="kindergarten"] .tile { border-radius: 22px; border: 1px solid var(--line); box-shadow: none; }
body[data-trade="kindergarten"] .tile .thumb { border-radius: 22px 22px 0 0; }
body[data-trade="kindergarten"] .btn { border-radius: 999px; }
body[data-trade="kindergarten"] .sect .label { text-transform: none; letter-spacing: 0.02em; font-size: 12px; }
body[data-trade="kindergarten"] .card { border-radius: 22px; }
body[data-trade="kindergarten"] .chip { border-radius: 999px; }
body[data-trade="kindergarten"] .slot { border-radius: 18px; }
body[data-trade="kindergarten"] .tile .name { font-size: 14px; }
body[data-trade="kindergarten"] .tabbar { background: var(--surface-2); border-top: 0; }
body[data-trade="kindergarten"] .appbar { background: var(--surface); }

/* Financial services: an annual report. Hairline rules, tabular figures, nothing decorative. */
body[data-trade="finance"] .r-row,
body[data-trade="finance"] .h-row { border-bottom: 1px solid var(--ink); padding: 16px 0; }
body[data-trade="finance"] .price { font-family: var(--price-font); letter-spacing: -0.01em; }
body[data-trade="finance"] .sect .label { letter-spacing: 0.28em; }
body[data-trade="finance"] .btn { border-radius: 2px; }
body[data-trade="finance"] .chip { border-radius: 2px; border: 1px solid var(--line); background: none; }
body[data-trade="finance"] .card { border-radius: 2px; border: 1px solid var(--line); }
body[data-trade="finance"] .slot { border-radius: 2px; }
body[data-trade="finance"] .tabbar { background: var(--surface); border-top: 1px solid var(--ink); }
body[data-trade="finance"] .appbar { background: var(--surface); border-bottom: 1px solid var(--ink); }
body[data-trade="finance"] .appbar .kicker { letter-spacing: 0.3em; }

/* Business agency: a deck, not a brochure. Condensed caps, hard rules, mono figures. */
body[data-trade="agency"] .stack-card {
  background: none; border: 0; border-top: 1px solid var(--line); border-radius: 0; box-shadow: none;
}
body[data-trade="agency"] .stack-card .name { text-transform: uppercase; letter-spacing: 0.04em; }
body[data-trade="agency"] .price { font-family: var(--price-font); font-size: 12.5px; color: var(--muted); }
body[data-trade="agency"] .sect .label { letter-spacing: 0.3em; color: var(--accent-text); }
body[data-trade="agency"] .cover h1, body[data-trade="agency"] .l-hero h1 { text-transform: uppercase; }
body[data-trade="agency"] .btn {
  border-radius: 2px; text-transform: uppercase; letter-spacing: 0.08em; font-size: 12px;
}
body[data-trade="agency"] .card { background: none; border: 1px solid var(--line); border-radius: 2px; }
body[data-trade="agency"] .chip {
  border-radius: 2px; text-transform: uppercase; font-size: 9px; letter-spacing: 0.12em;
}
body[data-trade="agency"] .slot { border-radius: 2px; }
body[data-trade="agency"] .tabbar { background: var(--surface); }
body[data-trade="agency"] .appbar { background: var(--bg); border-bottom: 1px solid var(--line); }

/* Influencer: a creator's feed. Flat header, portrait crops, cards without shadow. */
body[data-trade="influencer"] .appbar { background: var(--bg); }
body[data-trade="influencer"] .tile .thumb { aspect-ratio: 4 / 5; }
body[data-trade="influencer"] .tile .name { font-size: 16px; letter-spacing: -0.02em; }
body[data-trade="influencer"] .sect .label { color: var(--accent-text); letter-spacing: 0.18em; }
body[data-trade="influencer"] .card { box-shadow: none; }
body[data-trade="influencer"] .btn { border-radius: 999px; font-weight: 700; }
body[data-trade="influencer"] .slot { border-radius: 14px; }
body[data-trade="influencer"] .tabbar { background: var(--surface); }

/* Personal portfolio: a catalogue of work. Flat header, square everything, and
   years in small caps where a shop would put a price. */
body[data-trade="portfolio"] .appbar { background: var(--bg); border-bottom: 1px solid var(--hair); }
body[data-trade="portfolio"] .h-row .name { font-size: 18px; letter-spacing: -0.04em; }
body[data-trade="portfolio"] .h-row .price {
  font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted);
}
body[data-trade="portfolio"] .sect .label { letter-spacing: 0.3em; }
body[data-trade="portfolio"] .btn { border-radius: 0; }
body[data-trade="portfolio"] .chip { border-radius: 0; border-color: var(--line); }
body[data-trade="portfolio"] .slot { border-radius: 0; }
body[data-trade="portfolio"] .tabbar { background: var(--bg); border-top: 1px solid var(--ink); }
body[data-trade="portfolio"] .gallery .thumb { border-radius: 0; }

/* Film: a title card. Flat header, gold labels, credits ruled like a press kit
   rather than cards, and square-cut actions. */
body[data-trade="film"] .appbar { background: var(--bg); border-bottom: 1px solid var(--line); }
body[data-trade="film"] .stack-card {
  background: none; border: 0; border-bottom: 1px solid var(--line); border-radius: 0; box-shadow: none;
}
body[data-trade="film"] .sect .label { letter-spacing: 0.3em; color: var(--accent-text); }
body[data-trade="film"] .chip {
  border-radius: 2px; text-transform: uppercase; font-size: 9px; letter-spacing: 0.14em;
}
body[data-trade="film"] .btn {
  border-radius: 2px; text-transform: uppercase; letter-spacing: 0.1em; font-size: 12px;
}
body[data-trade="film"] .slot { border-radius: 4px; }
body[data-trade="film"] .tabbar { background: var(--surface); }
body[data-trade="film"] .gallery .thumb { border-radius: 2px; }

/* Art gallery: a wall label. No shadows, serif titles in italic, works hung in a
   plain grid with dates and dimensions set small and wide. */
body[data-trade="gallery"] .appbar { background: var(--bg); border-bottom: 1px solid var(--line); }
body[data-trade="gallery"] .card { box-shadow: none; }
body[data-trade="gallery"] .tile { box-shadow: none; }
body[data-trade="gallery"] .tile .name { font-family: var(--display-serif); font-style: italic; font-size: 15px; }
body[data-trade="gallery"] .tile .price {
  font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted);
}
body[data-trade="gallery"] .sect .label { letter-spacing: 0.26em; }
body[data-trade="gallery"] .h-row .meta { letter-spacing: 0.14em; }
body[data-trade="gallery"] .chip { border-radius: 2px; border-color: var(--line); }
body[data-trade="gallery"] .btn { border-radius: 2px; letter-spacing: 0.02em; }
body[data-trade="gallery"] .slot { border-radius: 2px; }
body[data-trade="gallery"] .gallery .thumb { border-radius: 2px; }
body[data-trade="gallery"] .tabbar { background: var(--bg); border-top: 1px solid var(--line); }

/* Marketplace: a shelf of shops. Landscape product cards, the seller printed
   above the name, and the price set quiet because the product is the headline. */
body[data-trade="marketplace"] .appbar { background: var(--bg); }
body[data-trade="marketplace"] .tile { box-shadow: none; border-color: var(--line); }
body[data-trade="marketplace"] .tile .thumb { aspect-ratio: 16 / 10; border-radius: 12px; }
body[data-trade="marketplace"] .tile .price {
  font-size: 12px; color: var(--muted); letter-spacing: 0.04em;
}
body[data-trade="marketplace"] .sect .label { letter-spacing: 0.2em; color: var(--accent-text); }
body[data-trade="marketplace"] .btn { border-radius: 14px; }
body[data-trade="marketplace"] .chip { border-color: var(--accent-ring); }
body[data-trade="marketplace"] .store-card { border-radius: 14px; }
body[data-trade="marketplace"] .store-art { border-radius: 14px; }
body[data-trade="marketplace"] .tabbar { background: var(--surface); }

/* --------------------------------------------- the customer's element shape
   Chosen on the brief, so these beat every trade's own geometry — a lookbook
   that squares everything still gets curved buttons when curved is what was
   picked. They are the one place !important is right: the customer's choice is
   not a theme to be overridden by specificity. Absent means the trade decides,
   as it always has. */
body[data-buttons="square"] { --el-control-r: 0; }
body[data-buttons="soft"] { --el-control-r: 10px; }
body[data-buttons="round"] { --el-control-r: 999px; }
/* One list, so every control moves together: buttons and inputs, the appbar
   icons (search, saved, call), the search field, the nav bar and its items. */
body[data-buttons] :is(
  .btn, .chip, .slot, .seg button, .session button, .stepper button, .qty button,
  .h-row .add, .r-row .add, .search-field, .search-pill, .search-clear,
  .iconbtn, .iconbtn .count, .save, .tab, .nav-list button,
  input[type="text"], textarea
) { border-radius: var(--el-control-r) !important; }
/* A bar pinned to the bottom edge rounds only its top: a rounded bottom corner
   there lets the page show through the screen's corners, which reads as a bar
   clipped by the display. The cafe bar is inset and floats above the bottom, so
   it keeps all four. */
body[data-buttons] { --el-tabbar-r: var(--el-control-r); }
body[data-buttons][data-nav="bar"]:not([data-trade="cafe"]) {
  --el-tabbar-r: var(--el-control-r) var(--el-control-r) 0 0;
}
body[data-buttons] .tabbar { border-radius: var(--el-tabbar-r) !important; }
/* The drawer menu is a list of hairlines by default, so a radius alone would be
   invisible there. Once a shape is picked the rows become filled controls of
   that shape, reading the same as the buttons and the tab bar. */
body[data-buttons] .nav-list { gap: 6px; }
body[data-buttons] .nav-list button {
  border-bottom: 0; padding-inline: 14px; background: var(--surface-2);
}
body[data-cards="square"] { --el-panel-r: 0; }
body[data-cards="soft"] { --el-panel-r: 14px; }
body[data-cards="round"] { --el-panel-r: 26px; }
body[data-cards] :is(.card, .offer, .info, .loyalty, .status-card, .session, .tile, .stack-card, .seg, .gallery .thumb) {
  border-radius: var(--el-panel-r) !important;
}

/* ------------------------------------------------ contemporary refinements
   The first generation leaned on borders and drop shadows for depth. The new
   default is quieter: one hairline, a tinted surface and spacing to separate
   groups. Direction blocks below re-cut the same components rather than each
   trade inventing another card grammar. */
body { font-size: var(--text-md); }
.appbar { padding-top: calc(10px + var(--safe-top)); }
.tabbar { padding-bottom: calc(10px + var(--safe-bottom)); }
.tile {
  box-shadow: none; border-color: color-mix(in srgb, var(--hair) 80%, transparent);
  padding: 5px; transition: transform var(--dur-fast) var(--ease), border-color var(--dur-base) ease;
}
.tile:active { transform: scale(0.975); }
.tile .body { gap: var(--space-1); padding: var(--space-3) var(--space-2) var(--space-3); }
.tile .name { font-size: 15px; line-height: 1.25; }
.tile .price { font-size: var(--text-sm); }
.tile .go { width: var(--tap); height: var(--tap); right: 10px; bottom: 10px; }
.tile .go svg { width: 14px; height: 14px; }
.btn { min-height: 42px; transition: transform var(--dur-fast) var(--ease), background var(--dur-base) ease, border-color var(--dur-base) ease; }
.btn:active { transform: scale(0.975); }
.chip { min-height: 38px; padding: 8px var(--space-4); box-shadow: none; }
.iconbtn { width: 38px; height: 38px; box-shadow: none; background: var(--surface); }
.sect .label { font-size: 21px; letter-spacing: -0.02em; }
.sect .count { font-size: var(--text-2xs); }
.screen { padding-inline: var(--space-4); }
.screen.on { animation-duration: var(--dur-slow); }
.sheet { transition-duration: var(--dur-slow); }
.chip, .tab, .slot, .tile { touch-action: manipulation; }
.skeleton {
  background: linear-gradient(90deg, var(--surface-2) 25%, color-mix(in srgb, var(--surface-2) 45%, var(--surface)) 40%, var(--surface-2) 60%);
  background-size: 300% 100%; animation: shimmer 1.4s ease infinite; border-radius: var(--r-sm);
}
@keyframes shimmer { from { background-position: 120% 0; } to { background-position: -80% 0; } }

/* ------------------------------------------------------------- directions */
/* Editorial: imagery and typography carry the page; chrome almost disappears. */
body[data-direction="editorial"] .app::before { opacity: 0.35; }
body[data-direction="editorial"] .appbar { background: transparent; border-bottom-color: transparent; }
body[data-direction="editorial"] .appbar .mark { background: var(--ink); color: var(--bg); box-shadow: none; }
body[data-direction="editorial"] .tile { border: 0; background: transparent; padding: 0; }
body[data-direction="editorial"] .tile .thumb { border-radius: var(--r-sm); aspect-ratio: 1 / 1.08; }
body[data-direction="editorial"] .tile .body { padding: var(--space-3) 2px var(--space-5); }
body[data-direction="editorial"] .tile .name { font-size: 17px; line-height: 1.15; }
body[data-direction="editorial"] .tile .go { background: transparent; color: var(--ink); border: 1px solid var(--hair); box-shadow: none; }
body[data-direction="editorial"] .sect .label { font-family: var(--display-serif); font-size: 26px; font-weight: 500; letter-spacing: -0.02em; }
body[data-direction="editorial"] .tab { text-transform: none; letter-spacing: 0; font-size: 10.5px; }
body[data-direction="editorial"] .tab.on { background: transparent; color: var(--ink); }
body[data-direction="editorial"] .hero h1, body[data-direction="editorial"] .l-hero h1 { font-size: var(--text-3xl); }

/* Modern: crisp modules, tinted panels, almost no decoration. */
body[data-direction="modern"] .app::before { display: none; }
body[data-direction="modern"] .appbar { background: var(--bg); border-bottom-color: var(--hair); }
body[data-direction="modern"] .appbar .kicker { display: none; }
body[data-direction="modern"] .appbar .title { font-size: 17px; }
body[data-direction="modern"] .tile { background: var(--surface-2); border: 0; padding: 0; }
body[data-direction="modern"] .tile .thumb { border-radius: 0; aspect-ratio: 1 / 1; }
body[data-direction="modern"] .tile .body { padding: var(--space-3); }
body[data-direction="modern"] .tile .go { width: 32px; height: 32px; right: 12px; bottom: 12px; }
body[data-direction="modern"] .sect .label { font-size: 17px; letter-spacing: -0.03em; text-transform: none; }
body[data-direction="modern"] .tab { text-transform: none; letter-spacing: 0; font-size: 10.5px; }
body[data-direction="modern"] .btn.accent { box-shadow: none; }

/* Luxe: dark, quiet, generous; gold-less warmth comes from the accent. */
body[data-direction="luxe"] .app::before { opacity: 0.55; height: 560px; }
body[data-direction="luxe"] .appbar { background: color-mix(in srgb, var(--bg) 72%, transparent); }
body[data-direction="luxe"] .appbar .mark { border-radius: 50%; box-shadow: none; }
body[data-direction="luxe"] .tile { background: transparent; border: 0; }
body[data-direction="luxe"] .tile .thumb { aspect-ratio: 1 / 1.2; border-radius: 2px; }
body[data-direction="luxe"] .tile .body { padding: var(--space-3) 0 var(--space-5); }
body[data-direction="luxe"] .tile .name { font-size: 16px; letter-spacing: 0.01em; }
body[data-direction="luxe"] .tile .price { color: var(--muted); font-size: var(--text-xs); letter-spacing: 0.08em; text-transform: uppercase; }
body[data-direction="luxe"] .sect .label { font-size: 27px; letter-spacing: 0.01em; }
body[data-direction="luxe"] .tabbar { border-radius: 2px; }

/* Minimal: hairlines, row-first lists, no chrome in the way. */
body[data-direction="minimal"] .app::before { display: none; }
body[data-direction="minimal"] .appbar { background: var(--bg); }
body[data-direction="minimal"] .appbar .mark { background: transparent; color: var(--ink); border: 1px solid var(--hair); box-shadow: none; }
body[data-direction="minimal"] .tile { border: 0; border-bottom: 1px solid var(--hair); border-radius: 0; background: transparent; }
body[data-direction="minimal"] .tile .thumb { border-radius: 4px; }
body[data-direction="minimal"] .sect .label { font-size: 16px; text-transform: uppercase; letter-spacing: 0.12em; }
body[data-direction="minimal"] .tabbar { background: var(--bg); box-shadow: none; }
body[data-direction="minimal"] .iconbtn { background: transparent; }

/* Gallery: work first, labels set like wall cards. */
body[data-direction="gallery"] .app::before { display: none; }
body[data-direction="gallery"] .appbar { background: var(--bg); border-bottom-color: var(--line); }
body[data-direction="gallery"] .appbar .mark { display: none; }
body[data-direction="gallery"] .tile { background: transparent; border: 0; box-shadow: none; }
body[data-direction="gallery"] .tile .thumb { border-radius: 0; }
body[data-direction="gallery"] .tile .name { font-family: var(--display-serif); font-style: italic; font-weight: 500; font-size: 16px; }
body[data-direction="gallery"] .tile .price { font-size: var(--text-2xs); text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); }
body[data-direction="gallery"] .tile .go { display: none; }

/* Performance and technical: numbers, labels and tight rhythm. */
body[data-direction="performance"] .tile, body[data-direction="technical"] .tile { border-radius: 2px; }
body[data-direction="performance"] .sect .label, body[data-direction="technical"] .sect .label {
  text-transform: uppercase; letter-spacing: 0.08em; font-size: 14px;
}
body[data-direction="performance"] .price, body[data-direction="technical"] .price { font-variant-numeric: tabular-nums; }
body[data-direction="performance"] .tab, body[data-direction="technical"] .tab { text-transform: uppercase; letter-spacing: 0.08em; }

/* Warm, lifestyle and playful: softer surfaces, not more shadows. */
body[data-direction="warm"] .tile, body[data-direction="lifestyle"] .tile, body[data-direction="playful"] .tile {
  border: 0; background: var(--surface);
}
body[data-direction="warm"] .tile .thumb, body[data-direction="lifestyle"] .tile .thumb, body[data-direction="playful"] .tile .thumb {
  border-radius: var(--r-md);
}
body[data-direction="playful"] .tile:nth-child(3n + 2) .thumb { border-radius: var(--r-lg) var(--r-sm) var(--r-lg) var(--r-sm); }

/* Clinical: calm, high legibility, nothing competing with booking. */
body[data-direction="clinical"] .app::before { opacity: 0.25; }
body[data-direction="clinical"] .tile { box-shadow: none; }
body[data-direction="clinical"] .sect .label { font-size: 18px; letter-spacing: -0.015em; }
body[data-direction="clinical"] .tabbar { box-shadow: none; }

/* Bold and cinema: display type does the work. */
body[data-direction="bold"] .sect .label, body[data-direction="cinema"] .sect .label { font-size: clamp(28px, 8vw, 38px); }
body[data-direction="bold"] .tile .name { font-size: 18px; }
body[data-direction="cinema"] .tile .thumb { aspect-ratio: 16 / 10; }

/* Classic: little ornament, confident type, understated controls. */
body[data-direction="classic"] .app::before { opacity: 0.2; }
body[data-direction="classic"] .tile { border: 0; border-bottom: 1px solid var(--hair); border-radius: 0; background: transparent; }
body[data-direction="classic"] .sect .label { font-family: var(--display-serif); font-weight: 500; }

/* A visible keyboard focus ring, independent of each composition's button skin. */
button:focus-visible, a:focus-visible, [role="button"]:focus-visible, [tabindex]:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible {
  outline: 2px solid var(--accent); outline-offset: 2px;
}
`
}
