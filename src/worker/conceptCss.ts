/**
 * Concept architecture CSS.
 *
 * A direction supplies the brand (palette, type pairing, accent). The blueprint
 * supplies the application architecture: masthead or utility bar, journal or
 * index, editorial or compact cards, feature or spec detail. These rules make
 * that architecture reach the catalogue, search, saved, detail, More and custom
 * screens, not just the landing page.
 *
 * Everything is scoped to the saved document's body attributes; no second
 * renderer and no unsaved preview state.
 */
export function conceptCss(): string {
  return `
/* ----------------------------------------------------------- app viewport */
html body[data-flagship="1"] { --app-w: 520px; }
/* Tablet and desktop use the page instead of a centred phone column. The cap
   keeps line lengths readable on very wide screens. */
@media (min-width: 720px) { html body[data-flagship="1"] { --app-w: min(880px, calc(100% - 40px)); } }
@media (min-width: 1120px) { html body[data-flagship="1"] { --app-w: min(1200px, calc(100% - 64px)); } }
html body[data-flagship="1"] .app { max-width: var(--app-w); width: 100%; margin-inline: auto; }
html body[data-flagship="1"] .tabbar {
  left: 50% !important;
  right: auto !important;
  width: min(100%, var(--app-w)) !important;
  transform: translateX(-50%);
}
html body[data-flagship="1"] .sheet { max-width: min(100%, var(--app-w)); margin-inline: auto; }

/* ------------------------------------------------------- missing photography
   A photograph may be absent; a hole in the layout may not. The name the image
   belongs to is drawn in the brand's own type and colour in CSS (not extra
   document elements), so no saved element slot moves. */
.thumb.is-empty,
.rl-media.is-empty,
.rec-row { position: relative; }
.rl-media,
.rd-media,
.detail-band,
.menu-band,
.rec-art,
.r-art { position: relative; }
.rec-row { display: flex; gap: 10px; overflow-x: auto; padding: 2px 0 4px; scrollbar-width: none; }
.rec-row::-webkit-scrollbar { display: none; }
.rec-row .rec { flex: 0 0 132px; }
.thumb.is-empty,
.rl-media.is-empty,
.rd-media.is-empty,
.detail-band.is-empty,
.menu-band.is-empty,
.listing-shot.is-empty,
.rec-art.is-empty,
.r-art.is-empty {
  background:
    radial-gradient(110% 90% at 82% 6%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 56%),
    linear-gradient(150deg, color-mix(in srgb, var(--accent) 9%, var(--surface-2)), var(--surface-2)) !important;
}
.media-missing {
  position: absolute;
  inset: 0;
  display: grid !important;
  place-items: center;
  gap: 0 !important;
  padding: 10px !important;
  color: color-mix(in srgb, var(--ink) 54%, transparent);
}
.media-missing-icon,
.media-missing-label { display: none !important; }
.media-missing::before {
  content: attr(data-mark);
  max-width: 4ch;
  font-family: var(--display);
  font-size: clamp(15px, 4vw, 24px);
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.02em;
  text-align: center;
  opacity: 0.5;
}
.media-missing::after {
  content: "";
  position: absolute;
  inset: auto 22% 15%;
  height: 1px;
  background: color-mix(in srgb, var(--ink) 15%, transparent);
}
.media-missing[data-mark=""]::before { content: "·"; }
.rec-art .media-missing::before,
.r-art .media-missing::before { font-size: 11px; max-width: 3ch; opacity: 0.62; }
.rec-art .media-missing::after,
.r-art .media-missing::after { inset: auto 26% 14%; background: color-mix(in srgb, var(--ink) 12%, transparent); }
.rd-media .media-missing::before { font-size: clamp(30px, 9vw, 54px); opacity: 0.34; }
.detail-band .media-missing::before,
.menu-band .media-missing::before,
.listing-shot.wide .media-missing::before { font-size: clamp(30px, 9vw, 54px); opacity: 0.34; }
.rl-media.is-empty { aspect-ratio: 4 / 3 !important; }
.rd-media.is-empty { aspect-ratio: 16 / 10 !important; max-height: 300px !important; }
.detail-band.is-empty,
.menu-band.is-empty { aspect-ratio: 16 / 10 !important; max-height: 300px !important; }
.listing-shot.is-empty { aspect-ratio: 4 / 3 !important; }

/* The app bar is furniture, not a caption over a photograph. It is solid unless
   the concept deliberately opens on a full-bleed cover. */
body[data-flagship="1"] .appbar { color: var(--ink); }
body[data-flagship="1"][data-concept="lead"] .appbar {
  background: color-mix(in srgb, var(--bg) 94%, transparent);
  backdrop-filter: blur(14px);
}
body[data-flagship="1"][data-concept="index"] .appbar,
body[data-flagship="1"][data-concept="immersive"] .appbar { background: color-mix(in srgb, var(--bg) 96%, transparent); }
body[data-flagship="1"][data-concept="immersive"]:has([data-screen="home"].on) .appbar { color: var(--ink); text-shadow: none; background: color-mix(in srgb, var(--bg) 94%, transparent); }
body[data-flagship="1"][data-concept="immersive"][data-trade="hotel"]:has([data-screen="home"].on) .appbar,
body[data-flagship="1"][data-concept="immersive"][data-trade="restaurant"]:has([data-screen="home"].on) .appbar {
  position: absolute;
  top: 0;
  left: 50%;
  right: auto;
  width: min(100%, var(--app-w));
  transform: translateX(-50%);
  z-index: 8;
  color: #fff;
  text-shadow: 0 1px 12px rgba(0, 0, 0, 0.42);
  background: linear-gradient(180deg, rgba(10, 10, 10, 0.46), rgba(10, 10, 10, 0.06) 74%, transparent);
  border: 0;
  backdrop-filter: none;
}
body[data-flagship="1"][data-concept="immersive"][data-trade="hotel"]:has([data-screen="home"].on) .appbar .mark,
body[data-flagship="1"][data-concept="immersive"][data-trade="hotel"]:has([data-screen="home"].on) .appbar .iconbtn,
body[data-flagship="1"][data-concept="immersive"][data-trade="restaurant"]:has([data-screen="home"].on) .appbar .mark,
body[data-flagship="1"][data-concept="immersive"][data-trade="restaurant"]:has([data-screen="home"].on) .appbar .iconbtn {
  background: rgba(255, 255, 255, 0.16) !important;
  color: #fff;
  border-color: transparent;
}
.fx-art.is-missing {
  display: grid;
  place-items: center;
  padding: 10px;
  background:
    radial-gradient(120% 90% at 82% 10%, color-mix(in srgb, var(--accent) 24%, transparent), transparent 58%),
    linear-gradient(152deg, color-mix(in srgb, var(--accent) 10%, var(--surface-2)), var(--surface-2));
  color: color-mix(in srgb, var(--ink) 62%, transparent);
}
.fx-art.is-missing::before {
  content: attr(data-label);
  max-width: 11ch;
  font-family: var(--display);
  font-size: clamp(10px, 2.5vw, 18px);
  font-weight: 500;
  line-height: 1.12;
  letter-spacing: -0.02em;
  text-align: center;
  text-wrap: balance;
  overflow-wrap: anywhere;
}
/* Small catalogue fields carry a short monogram, centred in the field. */
.fx-art.is-missing.is-quiet::before {
  content: attr(data-mark);
  position: absolute; inset: 0;
  display: grid; place-items: center;
  max-width: none; padding: 0;
  font-size: clamp(13px, 3.5vw, 20px); font-weight: 650; letter-spacing: .16em; opacity: .55;
}
.fx-art.is-missing::after {
  content: "";
  position: absolute;
  inset: auto 18% 16%;
  height: 1px;
  background: color-mix(in srgb, var(--ink) 18%, transparent);
  opacity: 1;
  mix-blend-mode: normal;
}
.fx-art.is-missing[data-label=""]::before { content: ""; }
.fx-fin-thumb .fx-art.is-missing::before { font-size: 8px; max-width: 7ch; }
.fx-art.is-missing::before { position: relative; z-index: 1; }
.fx-product .fx-art.is-missing,
.fx-cafe-item .fx-art.is-missing { aspect-ratio: 4 / 3 !important; }
.fx-room .fx-art.is-missing { aspect-ratio: 16 / 10 !important; }
.fx-cafe-window .fx-art.is-missing,
.fx-clinic-photo .fx-art.is-missing,
.fx-prop-cover .fx-art.is-missing,
.fx-auto-cover .fx-art.is-missing,
.fx-course-cover .fx-art.is-missing,
.fx-fin-cover .fx-art.is-missing { aspect-ratio: 16 / 9 !important; max-height: 240px; }
.fx-ecom-delivery-shot .fx-art.is-missing { aspect-ratio: 16 / 9 !important; }
.fx-cafe-window { max-height: 260px; }

/* Hotel without a photograph: a front-desk masthead, not a tall empty frame. */
.fx-hotel-type {
  margin: 0 -18px;
  padding: 92px 22px 24px;
  background: linear-gradient(152deg, color-mix(in srgb, var(--accent) 22%, var(--bg)), var(--bg) 72%);
  border-bottom: 1px solid var(--line);
}
.fx-hotel-type h1 { font-family: var(--display); font-size: clamp(38px, 10vw, 56px); line-height: 0.95; letter-spacing: -0.05em; font-weight: 500; margin: 10px 0 0; }
.fx-hotel-type p { font-size: 14px; line-height: 1.48; margin: 12px 0 0; max-width: 32ch; color: var(--ink-soft); }
.fx-hotel-type-meta { display: flex; flex-wrap: wrap; gap: 5px 16px; margin-top: 20px; font-size: 9px; letter-spacing: 0.07em; text-transform: uppercase; color: var(--muted); }
.fx-hotel-type > button { display: grid; grid-template-columns: 1fr auto; gap: 2px 12px; width: 100%; min-height: 58px; margin-top: 20px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 2px; background: color-mix(in srgb, var(--bg) 72%, transparent); color: inherit; font: inherit; text-align: left; }
.fx-hotel-type > button span { grid-column: 1 / -1; font-size: 8px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
.fx-hotel-type > button b { font-family: var(--display); font-size: 17px; font-weight: 500; }
.fx-hotel-type > button em { align-self: end; font-style: normal; font-size: 11px; color: var(--muted); }

@media (min-width: 720px) {
  body[data-flagship="1"] .screen > * { max-width: 100%; }
}

/* Search starts with the business's own groups, not an empty page. */
.search-browse { padding: 20px 0 100px; }
.search-cats { display: grid; border-top: 1px solid color-mix(in srgb, var(--ink) 14%, transparent); }
.search-cat { display: flex; align-items: baseline; justify-content: space-between; gap: 18px; min-height: 48px; padding: 9px 0; border: 0; border-bottom: 1px solid color-mix(in srgb, var(--ink) 10%, transparent); background: transparent; color: inherit; text-align: left; }
.search-cat span { font-family: var(--display); font-size: 17px; }
.search-cat em { font-family: var(--body); font-style: normal; font-size: 10px; color: var(--muted); font-variant-numeric: tabular-nums; }
body[data-concept="index"] .search-cats { grid-template-columns: 1fr 1fr; column-gap: 24px; }
body[data-concept="index"] .search-cat span { font-family: var(--body); font-size: 13px; font-weight: 600; }
body[data-concept="immersive"] .search-cats { grid-template-columns: 1fr 1fr; column-gap: 24px; }
.screen[data-screen="search"]:has([data-search-input]:not(:placeholder-shown)) .search-browse { display: none; }
.screen[data-screen="more"] .info { padding: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
.screen[data-screen="more"] .info h3 { font-family: var(--display); font-size: 22px; font-weight: 500; letter-spacing: -0.03em; }
.screen[data-screen="more"] .info p { font-size: 12px; line-height: 1.55; }
@media (min-width: 720px) {
  .screen[data-screen="more"] .more-story,
  .screen[data-screen="more"] .more-work,
  .screen[data-screen="more"] .info,
  .screen[data-screen="more"] > .sect,
  .screen[data-screen="more"] > .actions,
  .screen[data-screen="more"] > .card { max-width: 760px; margin-inline: auto; }
  .screen[data-screen="more"] .btn.block { max-width: 360px; }
}

/* More without photographs: a real collection index, never four empty tiles. */
.more-work { padding: 22px 0 10px; }
.more-work .sect { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.more-work > p { font-size: 12px; line-height: 1.5; color: var(--muted); max-width: 38ch; margin: 8px 0 12px; }
.more-index { display: grid; border-top: 1px solid color-mix(in srgb, var(--ink) 16%, transparent); }
.more-index button { display: flex; align-items: baseline; justify-content: space-between; gap: 18px; min-height: 46px; padding: 8px 0; border: 0; border-bottom: 1px solid color-mix(in srgb, var(--ink) 12%, transparent); background: transparent; color: inherit; font-family: var(--display); font-size: 16px; text-align: left; }
.more-index button em { font-family: var(--body); font-style: normal; font-size: 10px; color: var(--muted); font-variant-numeric: tabular-nums; }
body[data-concept="index"] .more-index { grid-template-columns: 1fr 1fr; column-gap: 24px; }

/* The index bar names the app even on the menu masthead screen, where the
   trade's own rule hides the title to let the masthead lead. The catalogue
   still needs a location marker. */
body[data-flagship="1"][data-concept="index"] .appbar .titles { display: grid !important; justify-items: start !important; text-align: left !important; }
body[data-flagship="1"][data-concept="index"] .appbar .title { display: block !important; }
body[data-flagship="1"][data-concept="index"] .appbar .kicker { display: block !important; }

/* Detail screen geometry: the document's detail screen removes its inline
   padding so media can run full bleed. The concepts below own that gutter, so
   reset the negative margins rather than letting a 390px screen grow to 434. */
html body[data-flagship="1"] .screen.is-detail { padding-inline: 0; }
body[data-flagship="1"] .screen.is-detail .detail-body { padding-inline: 22px; }
body[data-flagship="1"] .screen.is-detail .rd-copy { padding-inline: 22px; }
body[data-flagship="1"] .screen.is-detail .rd-media,
body[data-flagship="1"] .screen.is-detail .detail-band { width: 100%; margin-inline: 0; }
/* The action belongs after the words and recommendations. A bottom-sticky bar
   moved over the product copy before the reader had scrolled, so it is part of
   the page flow and only settles at the bottom on a short page. */
body[data-flagship="1"] .screen.is-detail .detail-cta { position: relative; bottom: auto; margin-inline: 0; }
body[data-flagship="1"] .screen.is-detail .detail-body > .detail-cta { margin-top: auto; }
body[data-flagship="1"] .screen.is-detail .rd-copy .detail-cta { margin-top: 26px; }
/* Keep the primary action visible before the recommendation rail, without
   pinning it over the copy. Recommendations remain the last thing on the page. */
body[data-flagship="1"] .screen.is-detail .detail-gap { order: 6; }
body[data-flagship="1"] .screen.is-detail .detail-cta { order: 7; }
body[data-flagship="1"] .screen.is-detail .recs { order: 8; }
body[data-flagship="1"] .screen.is-detail .detail-body > .detail-cta { margin-inline: -22px; padding-inline: 22px; }
body[data-flagship="1"][data-concept="index"] .screen.is-detail .rd-copy { padding-inline: 16px; }
body[data-flagship="1"][data-concept="index"] .screen.is-detail .rd-media,
body[data-flagship="1"][data-concept="index"] .screen.is-detail .detail-band { margin-inline: 0; }
body[data-flagship="1"][data-concept="immersive"] .screen.is-detail .rd-copy { margin-inline: 0; border-radius: 0; padding-inline: 18px; }

/* =============================================================== editorial
   A magazine: generous margins, a quiet masthead, one considered object at a
   time, captions that read as captions, and a detail page led by the image. */
body[data-flagship="1"][data-concept="lead"] .screen { padding-inline: 22px; }
body[data-flagship="1"][data-concept="lead"] .appbar {
  position: relative;
  left: auto;
  right: auto;
  width: auto;
  transform: none;
  min-height: 66px;
  background: color-mix(in srgb, var(--bg) 94%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--ink) 9%, transparent);
  backdrop-filter: blur(14px);
  color: var(--ink);
  text-shadow: none;
}
body[data-flagship="1"][data-concept="lead"] .appbar .iconbtn { background: transparent; color: var(--ink); border: 1px solid color-mix(in srgb, var(--ink) 12%, transparent); }
body[data-flagship="1"][data-concept="lead"] .appbar .mark {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 0;
  background: transparent !important;
  color: var(--ink);
  font-family: var(--display);
  font-size: 15px;
}
body[data-flagship="1"][data-concept="lead"] .appbar .titles { gap: 1px; }
body[data-flagship="1"][data-concept="lead"] .appbar .kicker {
  font-size: 8px;
  letter-spacing: 0.16em;
  opacity: 0.62;
}
body[data-flagship="1"][data-concept="lead"] .appbar .title {
  font-family: var(--display);
  font-size: 16px;
  font-weight: 500;
  letter-spacing: -0.015em;
}
body[data-flagship="1"][data-concept="lead"] .appbar .iconbtn {
  width: 38px;
  height: 38px;
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--ink) 12%, transparent);
}
body[data-flagship="1"][data-concept="lead"] .screen h1,
body[data-flagship="1"][data-concept="lead"] .screen h2,
body[data-flagship="1"][data-concept="lead"] .fx-title h1,
body[data-flagship="1"][data-concept="lead"] .fx-shop-title h1,
body[data-flagship="1"][data-concept="lead"] .shop-head h1,
body[data-flagship="1"][data-concept="lead"] .rd-copy h1,
body[data-flagship="1"][data-concept="lead"] .detail-body h1 {
  font-family: var(--display) !important;
  font-weight: 500 !important;
  letter-spacing: -0.035em !important;
}
body[data-flagship="1"][data-concept="lead"] .fx-eyebrow,
body[data-flagship="1"][data-concept="lead"] .fx-mini-label,
body[data-flagship="1"][data-concept="lead"] .sect .label {
  font-size: 8.5px;
  letter-spacing: 0.18em;
  opacity: 0.62;
}
body[data-flagship="1"][data-concept="lead"] .history-lead,
body[data-flagship="1"][data-concept="lead"] .history-lead,
body[data-flagship="1"][data-concept="lead"] .fx-home { padding-top: 20px; }
body[data-flagship="1"][data-concept="lead"] .fx-dine .fx-title h1 { font-size: clamp(42px, 12vw, 60px); line-height: 0.9; }
body[data-flagship="1"][data-concept="lead"] .fx-dine .fx-title p { font-size: 15px; max-width: 29ch; }
body[data-flagship="1"][data-concept="lead"] .fx-shop-title { padding: 32px 0 24px; border-bottom: 1px solid var(--line); }
body[data-flagship="1"][data-concept="lead"] .fx-shop-title h1 { font-size: clamp(36px, 10vw, 50px); max-width: 14ch; line-height: 0.98; }
body[data-flagship="1"][data-concept="lead"] .fx-search { display: none !important; }
body[data-flagship="1"][data-concept="lead"] .fx-rail { gap: 0; margin-top: 18px; }
body[data-flagship="1"][data-concept="lead"] .fx-rail-link { min-height: 38px; padding: 0 14px 0 0; border: 0; border-radius: 0; background: none; font-family: var(--display); font-size: 12px; font-weight: 500; }
body[data-flagship="1"][data-concept="lead"] .fx-rail-link span { width: auto; height: auto; background: none; border-radius: 0; opacity: 0.45; }
body[data-flagship="1"][data-concept="lead"] .fx-products { display: grid; grid-template-columns: minmax(0, 1fr); gap: 34px; }
body[data-flagship="1"][data-concept="lead"] .fx-product { padding-bottom: 20px; border-bottom: 1px solid var(--line); }
body[data-flagship="1"][data-concept="lead"] .fx-product:nth-child(even) { width: 84%; margin-left: auto; }
body[data-flagship="1"][data-concept="lead"] .fx-product .fx-art { aspect-ratio: 4 / 5; border-radius: 0; }
body[data-flagship="1"][data-concept="lead"] .fx-product .fx-art.is-missing { aspect-ratio: 4 / 3; }
body[data-flagship="1"][data-concept="lead"] .fx-product-copy { padding-top: 10px; }
body[data-flagship="1"][data-concept="lead"] .fx-product-copy b { font-family: var(--display); font-size: 17px; font-weight: 500; }
body[data-flagship="1"][data-concept="lead"] .fx-product-copy span { font-size: 10px; letter-spacing: 0.04em; }
body[data-flagship="1"][data-concept="lead"] .fx-feature { display: block; border-radius: 0; background: transparent; padding: 0; margin-top: 26px; }
body[data-flagship="1"][data-concept="lead"] .fx-feature .fx-art { width: 100%; height: auto; aspect-ratio: 4 / 3; border-radius: 0; margin-bottom: 13px; }
body[data-flagship="1"][data-concept="lead"] .fx-feature-copy b { font-size: 24px; }
body[data-flagship="1"][data-concept="lead"] .fx-actions { display: grid; grid-template-columns: 1fr; }
body[data-flagship="1"][data-concept="lead"] .fx-primary,
body[data-flagship="1"][data-concept="lead"] .fx-secondary { border-radius: 0; }
body[data-flagship="1"][data-concept="lead"] .fx-stay-card { border-radius: 0; box-shadow: none; }
body[data-flagship="1"][data-concept="lead"] .fx-room-stack { gap: 30px; }
body[data-flagship="1"][data-concept="lead"] .fx-room .fx-art { border-radius: 0; aspect-ratio: 4 / 3; }
body[data-flagship="1"][data-concept="lead"] .fx-room:nth-child(even) { width: 86%; margin-left: auto; }
body[data-flagship="1"][data-concept="lead"] .fx-services { display: grid !important; grid-template-columns: 1fr !important; gap: 28px !important; }
body[data-flagship="1"][data-concept="lead"] .fx-service { display: block !important; border: 0 !important; border-bottom: 1px solid var(--line) !important; border-radius: 0 !important; background: transparent !important; padding: 0 0 20px !important; }
body[data-flagship="1"][data-concept="lead"] .fx-service .fx-art { width: 100% !important; max-width: none !important; height: auto !important; aspect-ratio: 16 / 9 !important; border-radius: 0 !important; margin-bottom: 12px; }
body[data-flagship="1"][data-concept="lead"] .fx-service-tail { display: flex !important; justify-content: space-between; align-items: baseline; }
body[data-flagship="1"][data-concept="lead"] .fx-service-copy b { font-family: var(--display); font-size: 20px; font-weight: 500; }

/* Catalogue: a printed collection, one entry per spread. */
body[data-flagship="1"][data-concept="lead"] .shop-head { padding: 22px 0 18px; border-bottom: 1px solid var(--ink); }
body[data-flagship="1"][data-concept="lead"] .shop-head .eyebrow { font-size: 8px; letter-spacing: 0.18em; }
body[data-flagship="1"][data-concept="lead"] .shop-head h1 { font-size: clamp(34px, 9vw, 46px); margin: 8px 0 0; }
body[data-flagship="1"][data-concept="lead"] .shop-lede { font-family: var(--display); font-size: 14px; line-height: 1.45; max-width: 30ch; margin-top: 10px; }
body[data-flagship="1"][data-concept="lead"] .shop-tools { padding: 16px 0 4px; }
body[data-flagship="1"][data-concept="lead"] .shop-search { border: 0; border-bottom: 1px solid var(--line); border-radius: 0; background: transparent; padding-inline: 0; }
body[data-flagship="1"][data-concept="lead"] .shop-sort select { border: 0; background: transparent; }
body[data-flagship="1"][data-concept="lead"] .chips { gap: 14px; overflow: visible; flex-wrap: wrap; }
body[data-flagship="1"][data-concept="lead"] .chip { min-height: 32px; padding: 0; border: 0; border-bottom: 1px solid transparent; border-radius: 0; background: transparent !important; color: var(--muted); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; }
body[data-flagship="1"][data-concept="lead"] .chip.on { color: var(--ink); border-bottom-color: var(--ink); }
body[data-flagship="1"][data-concept="lead"] .shop-list { padding-top: 10px; }
body[data-flagship="1"][data-concept="lead"] .section-block > .sect { margin-top: 28px; border-bottom: 1px solid var(--line); padding-bottom: 8px; }
body[data-flagship="1"][data-concept="lead"] .rl-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 30px; }
body[data-flagship="1"][data-concept="lead"] .rl-card { display: block; border: 0; border-bottom: 1px solid var(--line); border-radius: 0; background: transparent; padding: 0 0 22px; }
body[data-flagship="1"][data-concept="lead"] .rl-card:nth-child(even) { width: 86%; margin-left: auto; }
body[data-flagship="1"][data-concept="lead"] .rl-media { margin: 0 0 12px; border-radius: 0; aspect-ratio: 4 / 3; }
body[data-flagship="1"][data-concept="lead"] .rl-media.is-empty { background: transparent; }
body[data-flagship="1"][data-concept="lead"] .rl-kicker { font-size: 8px; letter-spacing: 0.16em; }
body[data-flagship="1"][data-concept="lead"] .rl-title { display: block; }
body[data-flagship="1"][data-concept="lead"] .rl-title h3 { font-family: var(--display); font-size: 21px; font-weight: 500; margin-top: 4px; }
body[data-flagship="1"][data-concept="lead"] .rl-price { display: block; margin-top: 3px; font-size: 11px; }
body[data-flagship="1"][data-concept="lead"] .rl-desc { font-family: var(--display); font-size: 12.5px; line-height: 1.45; color: var(--muted); margin-top: 6px; max-width: 34ch; }
body[data-flagship="1"][data-concept="lead"] .tiles { grid-template-columns: 1fr !important; gap: 28px !important; }
body[data-flagship="1"][data-concept="lead"] .tile { border: 0 !important; border-bottom: 1px solid var(--line) !important; border-radius: 0 !important; background: transparent !important; padding: 0 0 18px !important; }
body[data-flagship="1"][data-concept="lead"] .tile .thumb { border-radius: 0 !important; aspect-ratio: 3 / 2 !important; }
body[data-flagship="1"][data-concept="lead"] .h-row { padding: 18px 0; }
body[data-flagship="1"][data-concept="lead"] .h-row .name { font-size: 20px; }
body[data-flagship="1"][data-concept="lead"] .h-row::before { width: 72px; height: 72px; flex-basis: 72px; }

/* Search, saved and More belong to the same magazine. */
body[data-flagship="1"][data-concept="lead"] .search-field { border: 0; border-bottom: 1px solid var(--ink); border-radius: 0; background: transparent; padding-inline: 0; }
body[data-flagship="1"][data-concept="lead"] .r-row { padding: 18px 0; border-bottom: 1px solid var(--line); }
body[data-flagship="1"][data-concept="lead"] .r-row .r-art { width: 64px; height: 64px; border-radius: 0; }
body[data-flagship="1"][data-concept="lead"] .r-row .name { font-family: var(--display); font-size: 17px; font-weight: 500; }
body[data-flagship="1"][data-concept="lead"] .more-lead { padding: 24px 0 26px; border-bottom: 1px solid var(--ink); }
body[data-flagship="1"][data-concept="lead"] .more-lead h1 { font-size: clamp(38px, 11vw, 56px); }
body[data-flagship="1"][data-concept="lead"] .more-lead p { font-family: var(--display); font-size: 15px; line-height: 1.5; max-width: 31ch; }
body[data-flagship="1"][data-concept="lead"] .more-facts { display: flex; flex-wrap: wrap; gap: 4px 18px; margin-top: 18px; font-size: 9px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
body[data-flagship="1"][data-concept="lead"] .more-story { padding: 26px 0 24px; }
body[data-flagship="1"][data-concept="lead"] .more-story p { font-family: var(--display); font-size: 17px; line-height: 1.5; max-width: 34ch; margin-top: 10px; }
body[data-flagship="1"][data-concept="lead"] .custom-wrap { padding: 24px 0 100px; }
body[data-flagship="1"][data-concept="lead"] .custom-lead { padding-bottom: 24px; border-bottom: 1px solid var(--ink); }
body[data-flagship="1"][data-concept="lead"] .custom-lead h1 { font-size: clamp(36px, 10vw, 52px); margin-top: 9px; }
body[data-flagship="1"][data-concept="lead"] .custom-body { padding-top: 22px; }

/* Detail: the photograph is the spread, the words are the caption. */
body[data-flagship="1"][data-concept="lead"] .rd-media,
body[data-flagship="1"][data-concept="lead"] .detail-band { margin: 0 -22px; border-radius: 0; aspect-ratio: 4 / 3; max-height: 56vh; }
body[data-flagship="1"][data-concept="lead"] .rd-copy { padding: 22px 0 120px; }
body[data-flagship="1"][data-concept="lead"] .rd-copy h1 { font-size: clamp(34px, 9vw, 46px); margin: 8px 0 10px; }
body[data-flagship="1"][data-concept="lead"] .rd-copy .lede { font-family: var(--display); font-size: 16px; line-height: 1.5; max-width: 32ch; }
body[data-flagship="1"][data-concept="lead"] .detail-cta .btn { border-radius: 0; }

@media (min-width: 720px) {
  body[data-flagship="1"][data-concept="lead"] .fx-products { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 42px 28px; }
  body[data-flagship="1"][data-concept="lead"] .fx-product:nth-child(even) { width: auto; margin-left: 0; }
  body[data-flagship="1"][data-concept="lead"] .rl-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 42px 34px; }
  body[data-flagship="1"][data-concept="lead"] .rl-card:nth-child(even) { width: auto; margin-left: 0; }
  body[data-flagship="1"][data-concept="lead"] .rl-card:nth-child(4n + 2) { margin-top: 54px; }
  body[data-flagship="1"][data-concept="lead"] .more-lead,
  body[data-flagship="1"][data-concept="lead"] .custom-lead { display: grid; grid-template-columns: 1fr auto; align-items: end; }
  body[data-flagship="1"][data-concept="lead"] .more-lead .fx-eyebrow,
  body[data-flagship="1"][data-concept="lead"] .custom-lead .fx-eyebrow { grid-column: 1 / -1; }
  body[data-flagship="1"][data-concept="lead"] .more-facts { justify-content: flex-end; text-align: right; }
  body[data-flagship="1"][data-concept="lead"] .custom-lead h1 { grid-column: 1 / -1; }
}
@media (min-width: 1120px) {
  body[data-flagship="1"][data-concept="lead"] .rl-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  body[data-flagship="1"][data-concept="lead"] .rl-card:nth-child(4n + 2) { margin-top: 0; }
  body[data-flagship="1"][data-concept="lead"] .rl-card:nth-child(3n + 2) { margin-top: 44px; }
}

/* ================================================================== index
   A catalogue utility: a compact header, search first, dense two-up cards,
   a spec-sheet detail and a docked navigation. No oversized statement. */
body[data-flagship="1"][data-concept="index"] .screen { padding-inline: 16px; }
body[data-flagship="1"][data-concept="index"] .appbar {
  position: relative;
  left: auto;
  right: auto;
  width: auto;
  transform: none;
  min-height: 52px;
  background: color-mix(in srgb, var(--bg) 96%, transparent);
  border-bottom: 1px solid var(--line);
  backdrop-filter: blur(16px);
  color: var(--ink);
  text-shadow: none;
}
body[data-flagship="1"][data-concept="index"] .appbar .iconbtn { color: var(--ink); }
body[data-flagship="1"][data-concept="index"] .appbar .mark { color: var(--ink); }
body[data-flagship="1"][data-concept="index"] .appbar .kicker { font-size: 8px; letter-spacing: 0.1em; opacity: 0.55; }
body[data-flagship="1"][data-concept="index"] .appbar .title { font-size: 12.5px; font-weight: 650; }
body[data-flagship="1"][data-concept="index"] .appbar .mark { width: 27px; height: 27px; border-radius: 8px; font-size: 9px; }
body[data-flagship="1"][data-concept="index"] .appbar .iconbtn { width: 38px; height: 38px; background: color-mix(in srgb, var(--ink) 4%, transparent); }
body[data-flagship="1"][data-concept="index"] .fx-home { padding-top: 12px; }
body[data-flagship="1"][data-concept="index"] .fx-kicker { margin-bottom: 14px; }
body[data-flagship="1"][data-concept="index"] .fx-title h1,
body[data-flagship="1"][data-concept="index"] .fx-shop-title h1,
body[data-flagship="1"][data-concept="index"] .fx-salon-head h1,
body[data-flagship="1"][data-concept="index"] .fx-pro-head h1,
body[data-flagship="1"][data-concept="index"] .fx-hotel-title h1 {
  font-size: 26px;
  line-height: 1.02;
  letter-spacing: -0.035em;
}
body[data-flagship="1"][data-concept="index"] .fx-dine .fx-title p,
body[data-flagship="1"][data-concept="index"] .fx-shop-title p,
body[data-flagship="1"][data-concept="index"] .fx-pro-head p { font-size: 12px; line-height: 1.4; max-width: 36ch; }
body[data-flagship="1"][data-concept="index"] .fx-shop-title { padding: 18px 0 12px; }
body[data-flagship="1"][data-concept="index"] .fx-shop-title h1 { font-size: 27px; max-width: 22ch; }
body[data-flagship="1"][data-concept="index"] .fx-search { min-height: 42px; border-radius: 8px; background: color-mix(in srgb, var(--ink) 4%, transparent); }
body[data-flagship="1"][data-concept="index"] .fx-rail { margin: 6px -16px 14px; padding-inline: 16px; gap: 6px; }
body[data-flagship="1"][data-concept="index"] .fx-rail-link { min-height: 36px; padding: 0 11px 0 7px; border: 1px solid var(--line); border-radius: 8px; font-size: 10.5px; }
body[data-flagship="1"][data-concept="index"] .fx-rail-link span { width: 18px; height: 18px; font-size: 7px; }
body[data-flagship="1"][data-concept="index"] .fx-products { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px 10px; align-items: start; }
body[data-flagship="1"][data-concept="index"] .doc-section[data-layout="grid"] .fx-products,
body[data-flagship="1"][data-concept="index"] .doc-section[data-layout="strip"] .fx-products { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 18px 10px !important; overflow: visible !important; }
@media (min-width: 720px) {
  body[data-flagship="1"][data-concept="index"] .doc-section[data-layout="grid"] .fx-products,
  body[data-flagship="1"][data-concept="index"] .doc-section[data-layout="strip"] .fx-products { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; gap: 20px 12px !important; }
}
@media (min-width: 1120px) {
  body[data-flagship="1"][data-concept="index"] .doc-section[data-layout="grid"] .fx-products,
  body[data-flagship="1"][data-concept="index"] .doc-section[data-layout="strip"] .fx-products { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; }
}
body[data-flagship="1"][data-concept="index"] .fx-product { padding: 0; border: 0; background: transparent; }
body[data-flagship="1"][data-concept="index"] .fx-product .fx-art { aspect-ratio: 1 / 1; border-radius: 8px; }
body[data-flagship="1"][data-concept="index"] .fx-product .fx-art.is-missing { aspect-ratio: 1 / 1; }
body[data-flagship="1"][data-concept="index"] .fx-product-copy { padding-top: 6px; }
body[data-flagship="1"][data-concept="index"] .fx-product-copy b { font-size: 11px; line-height: 1.25; }
body[data-flagship="1"][data-concept="index"] .fx-product-copy span { font-size: 9.5px; }
body[data-flagship="1"][data-concept="index"] .fx-dine .fx-feature { display: grid; grid-template-columns: 84px minmax(0, 1fr); gap: 12px; margin-top: 14px; padding: 8px; border-radius: 10px; }
body[data-flagship="1"][data-concept="index"] .fx-dine .fx-feature .fx-art { width: 84px; height: 84px; aspect-ratio: auto; border-radius: 50%; }
body[data-flagship="1"][data-concept="index"] .fx-feature-copy b { font-size: 16px; }
body[data-flagship="1"][data-concept="index"] .fx-feature-copy p { font-size: 10.5px; }
body[data-flagship="1"][data-concept="index"] .fx-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin-top: 12px; }
body[data-flagship="1"][data-concept="index"] .fx-primary,
body[data-flagship="1"][data-concept="index"] .fx-secondary { min-height: 42px; border-radius: 7px; font-size: 11px; }
body[data-flagship="1"][data-concept="index"] .fx-salon-head { padding: 14px 0 16px; }
body[data-flagship="1"][data-concept="index"] .fx-salon-head h1 { font-size: 27px; }
body[data-flagship="1"][data-concept="index"] .fx-dates { border-radius: 10px; padding: 6px; }
body[data-flagship="1"][data-concept="index"] .fx-dates button { min-height: 48px; border-radius: 6px; }
body[data-flagship="1"][data-concept="index"] .fx-service { min-height: 56px; grid-template-columns: 42px 1fr auto; gap: 10px; }
body[data-flagship="1"][data-concept="index"] .fx-service .fx-art { width: 42px; height: 42px; border-radius: 8px; }
body[data-flagship="1"][data-concept="index"] .fx-hotel-title { padding-top: 18px; }
body[data-flagship="1"][data-concept="index"] .fx-hotel-image { height: 30vh; min-height: 210px; }
body[data-flagship="1"][data-concept="index"] .fx-hotel-type { padding-top: 72px; }
body[data-flagship="1"][data-concept="index"] .fx-stay-card { margin-top: 14px; border-radius: 10px; box-shadow: none; }
body[data-flagship="1"][data-concept="index"] .fx-rooms-head { padding-top: 22px; }
body[data-flagship="1"][data-concept="index"] .fx-room { display: grid; grid-template-columns: 96px 1fr; gap: 12px; border-bottom: 1px solid var(--line); padding-bottom: 12px; }
body[data-flagship="1"][data-concept="index"] .fx-room .fx-art { aspect-ratio: 1 / 1; border-radius: 8px; }
body[data-flagship="1"][data-concept="index"] .fx-room-copy b { font-size: 16px; }
body[data-flagship="1"][data-concept="index"] .fx-pro-intro { grid-template-columns: 72px 1fr; padding: 16px 0; }
body[data-flagship="1"][data-concept="index"] .fx-pro-photo { display: none; }
body[data-flagship="1"][data-concept="index"] .fx-pro-row { min-height: 58px; padding: 12px 0; }

/* Catalogue: dense, searchable, two-up with a spec-led list at wide sizes. */
body[data-flagship="1"][data-concept="index"] .shop-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 12px 0 8px; border-bottom: 1px solid var(--line); }
body[data-flagship="1"][data-concept="index"] .shop-head h1 { font-size: 23px; margin: 0; }
body[data-flagship="1"][data-concept="index"] .shop-head .eyebrow { font-size: 8px; letter-spacing: 0.12em; }
body[data-flagship="1"][data-concept="index"] .shop-lede { display: none; }
body[data-flagship="1"][data-concept="index"] .shop-tools { position: sticky; top: 52px; z-index: 3; padding: 10px 0 6px; background: color-mix(in srgb, var(--bg) 96%, transparent); backdrop-filter: blur(12px); }
body[data-flagship="1"][data-concept="index"] .shop-search { min-height: 42px; border-radius: 8px; }
body[data-flagship="1"][data-concept="index"] .shop-row { margin-top: 8px; }
body[data-flagship="1"][data-concept="index"] .chips { gap: 6px; }
body[data-flagship="1"][data-concept="index"] .chip { min-height: 34px; padding: 0 11px; border-radius: 7px; font-size: 10px; }
body[data-flagship="1"][data-concept="index"] .shop-list { padding-top: 12px; }
body[data-flagship="1"][data-concept="index"] .section-block > .sect { margin-top: 18px; padding-bottom: 6px; }
body[data-flagship="1"][data-concept="index"] .rl-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 9px; }
body[data-flagship="1"][data-concept="index"] .rl-card { display: flex; flex-direction: column; border: 0; border-radius: 0; background: transparent; padding: 0; }
body[data-flagship="1"][data-concept="index"] .rl-media { margin: 0 0 7px; border-radius: 8px; aspect-ratio: 1 / 1; }
body[data-flagship="1"][data-concept="index"] .rl-kicker { display: none; }
body[data-flagship="1"][data-concept="index"] .rl-title { display: flex; justify-content: space-between; gap: 5px; align-items: baseline; }
body[data-flagship="1"][data-concept="index"] .rl-title h3 { font-size: 11px; line-height: 1.25; font-weight: 600; }
body[data-flagship="1"][data-concept="index"] .rl-price { font-size: 10px; flex: 0 0 auto; }
body[data-flagship="1"][data-concept="index"] .rl-desc { display: none; }
body[data-flagship="1"][data-concept="index"] .rl-option { font-size: 8px; }
body[data-flagship="1"][data-concept="index"] .tiles { grid-template-columns: 1fr 1fr !important; gap: 9px !important; }
body[data-flagship="1"][data-concept="index"] .tile { border: 0 !important; border-radius: 0 !important; background: transparent !important; padding: 0 !important; }
body[data-flagship="1"][data-concept="index"] .tile .thumb { aspect-ratio: 1 / 1 !important; border-radius: 8px !important; }
body[data-flagship="1"][data-concept="index"] .tile .name { font-size: 10.5px; }
body[data-flagship="1"][data-concept="index"] .tile .go { display: none; }
body[data-flagship="1"][data-concept="index"] .h-row { padding: 11px 0; gap: 9px; }
body[data-flagship="1"][data-concept="index"] .h-row::before { flex-basis: 46px; width: 46px; height: 46px; }
body[data-flagship="1"][data-concept="index"] .h-row .name { font-family: var(--body); font-size: 14px; font-weight: 600; }
body[data-flagship="1"][data-concept="index"] .h-row .desc { font-size: 10.5px; }

/* Search, saved, detail: a utility, not a magazine. */
body[data-flagship="1"][data-concept="index"] .search-field { min-height: 44px; border-radius: 8px; background: color-mix(in srgb, var(--ink) 5%, transparent); }
body[data-flagship="1"][data-concept="index"] .r-row { padding: 10px 0; border-bottom: 1px solid var(--line); }
body[data-flagship="1"][data-concept="index"] .r-row .r-art { width: 46px; height: 46px; border-radius: 7px; }
body[data-flagship="1"][data-concept="index"] .r-row .name { font-size: 13px; font-weight: 600; }
body[data-flagship="1"][data-concept="index"] .r-row .desc { font-size: 10px; }
body[data-flagship="1"][data-concept="index"] .r-row .tail .add { width: 34px; height: 34px; }
body[data-flagship="1"][data-concept="index"] .rd-media,
body[data-flagship="1"][data-concept="index"] .detail-band { aspect-ratio: 1 / 1; max-height: 42vh; border-radius: 10px; margin: 0; }
body[data-flagship="1"][data-concept="index"] .rd-copy { padding: 14px 0 110px; }
body[data-flagship="1"][data-concept="index"] .rd-copy h1 { font-size: 26px; margin: 6px 0 8px; }
body[data-flagship="1"][data-concept="index"] .rd-copy .lede { font-size: 12px; line-height: 1.5; }
body[data-flagship="1"][data-concept="index"] .rd-meta { font-size: 10px; }
body[data-flagship="1"][data-concept="index"] .detail-cta .btn { border-radius: 8px; }
body[data-flagship="1"][data-concept="index"] .more-lead { padding: 12px 0 18px; border-bottom: 1px solid var(--line); }
body[data-flagship="1"][data-concept="index"] .more-lead h1 { font-size: 28px; }
body[data-flagship="1"][data-concept="index"] .more-lead p { font-size: 12px; color: var(--muted); max-width: 38ch; }
body[data-flagship="1"][data-concept="index"] .more-facts { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 12px; font-size: 9px; color: var(--muted); }
body[data-flagship="1"][data-concept="index"] .more-story { padding: 20px 0; }
body[data-flagship="1"][data-concept="index"] .more-story p { font-size: 13px; line-height: 1.55; max-width: 42ch; }
body[data-flagship="1"][data-concept="index"] .custom-wrap { padding: 12px 0 100px; }
body[data-flagship="1"][data-concept="index"] .custom-lead { padding-bottom: 16px; border-bottom: 1px solid var(--line); }
body[data-flagship="1"][data-concept="index"] .custom-lead h1 { font-size: 28px; }
body[data-flagship="1"][data-concept="index"] .custom-body { padding-top: 14px; }
body[data-flagship="1"][data-concept="index"] .tabbar { height: calc(62px + env(safe-area-inset-bottom)); padding: 6px 12px; background: var(--surface); border: 1px solid var(--line); border-radius: 16px 16px 0 0; box-shadow: 0 -12px 30px -24px color-mix(in srgb, var(--ink) 50%, transparent); }
body[data-flagship="1"][data-concept="index"] .tab span { font-size: 8px; }

@media (min-width: 720px) {
  body[data-flagship="1"][data-concept="index"] .rl-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px 12px; }
  body[data-flagship="1"][data-concept="index"] .tiles { grid-template-columns: repeat(3, 1fr) !important; }
  body[data-flagship="1"][data-concept="index"] .fx-products { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px 12px; }
  body[data-flagship="1"][data-concept="index"] .shop-head h1 { font-size: 27px; }
  body[data-flagship="1"][data-concept="index"] .rd-copy { max-width: 58ch; }
}
@media (min-width: 1120px) {
  body[data-flagship="1"][data-concept="index"] .rl-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  body[data-flagship="1"][data-concept="index"] .fx-products { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  body[data-flagship="1"][data-concept="index"] .tiles { grid-template-columns: repeat(4, 1fr) !important; }
}

/* ================================================================ immersive
   A campaign: image first, type large, content running edge to edge, a floating
   navigation and a detail page that opens like a story. */
body[data-flagship="1"][data-concept="immersive"] .screen { padding-inline: 18px; padding-bottom: 120px; }
body[data-flagship="1"][data-concept="immersive"] .appbar {
  position: relative;
  left: auto;
  right: auto;
  width: auto;
  transform: none;
  min-height: 58px;
  background: color-mix(in srgb, var(--bg) 96%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--ink) 7%, transparent);
  color: var(--ink);
  text-shadow: none;
}
body[data-flagship="1"][data-concept="immersive"] .appbar .iconbtn { color: var(--ink); }
body[data-flagship="1"][data-concept="immersive"] .appbar .title { font-size: 13px; font-weight: 650; letter-spacing: -0.01em; }
body[data-flagship="1"][data-concept="immersive"] .appbar .kicker { font-size: 8px; letter-spacing: 0.14em; opacity: 0.62; }
body[data-flagship="1"][data-concept="immersive"] .fx-home { padding-top: 0; }
body[data-flagship="1"][data-concept="immersive"] .fx-kicker { margin: 16px 0 22px; }
body[data-flagship="1"][data-concept="immersive"] .fx-shop-title { padding: 54px 0 20px; min-height: 280px; display: flex; flex-direction: column; justify-content: flex-end; margin: 0 -18px; padding-inline: 18px; background: linear-gradient(160deg, color-mix(in srgb, var(--accent) 22%, var(--bg)), var(--bg)); }
body[data-flagship="1"][data-concept="immersive"] .fx-shop-title h1 { font-size: clamp(44px, 12vw, 64px); line-height: 0.9; letter-spacing: -0.055em; max-width: 12ch; }
body[data-flagship="1"][data-concept="immersive"] .fx-search { display: none !important; }
body[data-flagship="1"][data-concept="immersive"] .fx-rail { margin-top: 12px; gap: 6px; }
body[data-flagship="1"][data-concept="immersive"] .fx-rail-link { min-height: 34px; border: 0; border-radius: 0; border-bottom: 1px solid color-mix(in srgb, var(--ink) 20%, transparent); font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; }
body[data-flagship="1"][data-concept="immersive"] .fx-rail-link span { width: auto; height: auto; background: none; }
body[data-flagship="1"][data-concept="immersive"] .fx-products { display: flex; gap: 12px; overflow-x: auto; scroll-snap-type: x mandatory; margin-inline: -18px; padding: 2px 18px 8px; scrollbar-width: none; }
body[data-flagship="1"][data-concept="immersive"] .fx-products::-webkit-scrollbar { display: none; }
body[data-flagship="1"][data-concept="immersive"] .fx-product { flex: 0 0 78%; scroll-snap-align: start; position: relative; padding-bottom: 0; }
body[data-flagship="1"][data-concept="immersive"] .fx-product .fx-art { aspect-ratio: 3 / 4; border-radius: 2px; }
body[data-flagship="1"][data-concept="immersive"] .fx-product .fx-art.is-missing { aspect-ratio: 1 / 1; }
body[data-flagship="1"][data-concept="immersive"] .fx-product-copy { position: absolute; inset: auto 0 0; padding: 40px 14px 14px; background: linear-gradient(0deg, rgba(10, 10, 10, 0.72), transparent); color: #fff; }
body[data-flagship="1"][data-concept="immersive"] .fx-product-copy b { font-family: var(--display); font-size: 21px; font-weight: 500; }
body[data-flagship="1"][data-concept="immersive"] .fx-product-copy span { color: rgba(255, 255, 255, 0.78); }
body[data-flagship="1"][data-concept="immersive"] .fx-dine .fx-title { text-align: center; padding: 14px 0 0; }
body[data-flagship="1"][data-concept="immersive"] .fx-dine .fx-title h1 { font-size: clamp(48px, 13vw, 72px); line-height: 0.86; }
body[data-flagship="1"][data-concept="immersive"] .fx-dine .fx-title p { margin-inline: auto; text-align: center; }
body[data-flagship="1"][data-concept="immersive"] .fx-dine .fx-feature { display: block; margin: 20px -18px 0; padding: 0; border-radius: 0; background: transparent; }
body[data-flagship="1"][data-concept="immersive"] .fx-dine .fx-feature .fx-art { width: 100%; height: auto; aspect-ratio: 4 / 5; border-radius: 0; }
body[data-flagship="1"][data-concept="immersive"] .fx-dine .fx-feature-copy { padding: 14px 18px 0; }
body[data-flagship="1"][data-concept="immersive"] .fx-dine .fx-feature-copy b { font-size: 26px; }
body[data-flagship="1"][data-concept="immersive"] .fx-actions { display: grid; grid-template-columns: 1fr; gap: 7px; }
body[data-flagship="1"][data-concept="immersive"] .fx-primary,
body[data-flagship="1"][data-concept="immersive"] .fx-secondary { border-radius: 999px; }
body[data-flagship="1"][data-concept="immersive"] .fx-salon-head h1,
body[data-flagship="1"][data-concept="immersive"] .fx-pro-head h1,
body[data-flagship="1"][data-concept="immersive"] .fx-hotel-title h1 { font-size: clamp(40px, 11vw, 58px); line-height: 0.92; }
body[data-flagship="1"][data-concept="immersive"] .fx-service { display: block; border: 0; padding: 0 0 18px; }
body[data-flagship="1"][data-concept="immersive"] .fx-service .fx-art { width: 100%; height: auto; aspect-ratio: 16 / 10; border-radius: 0; margin-bottom: 9px; }
body[data-flagship="1"][data-concept="immersive"] .fx-service-tail { display: flex; justify-content: space-between; }
body[data-flagship="1"][data-concept="immersive"] .fx-room-stack { display: flex; gap: 12px; overflow-x: auto; margin-inline: -18px; padding: 0 18px 8px; scrollbar-width: none; }
body[data-flagship="1"][data-concept="immersive"] .fx-room { flex: 0 0 82%; }
body[data-flagship="1"][data-concept="immersive"] .fx-room .fx-art { aspect-ratio: 3 / 4; border-radius: 2px; }

/* Catalogue as a campaign contact sheet. */
body[data-flagship="1"][data-concept="immersive"] .shop-head { margin: 0 -18px; padding: 42px 18px 26px; background: var(--ink); color: var(--bg); }
body[data-flagship="1"][data-concept="immersive"] .shop-head .eyebrow { color: var(--bg); opacity: 0.62; }
body[data-flagship="1"][data-concept="immersive"] .shop-head h1 { font-size: clamp(38px, 10vw, 54px); line-height: 0.92; margin-top: 8px; }
body[data-flagship="1"][data-concept="immersive"] .shop-lede { color: var(--bg); opacity: 0.7; font-size: 13px; max-width: 34ch; }
body[data-flagship="1"][data-concept="immersive"] .shop-tools { padding: 14px 0 8px; }
body[data-flagship="1"][data-concept="immersive"] .shop-search { border: 0; border-bottom: 1px solid var(--line); border-radius: 0; background: transparent; padding-inline: 0; }
body[data-flagship="1"][data-concept="immersive"] .chips { gap: 6px; }
body[data-flagship="1"][data-concept="immersive"] .chip { min-height: 34px; border-radius: 999px; background: transparent; border: 1px solid var(--line); font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.06em; }
body[data-flagship="1"][data-concept="immersive"] .chip.on { background: var(--ink); color: var(--bg); }
body[data-flagship="1"][data-concept="immersive"] .rl-grid { display: flex; gap: 12px; overflow-x: auto; margin-inline: -18px; padding: 14px 18px 10px; scroll-snap-type: x mandatory; scrollbar-width: none; }
body[data-flagship="1"][data-concept="immersive"] .rl-grid::-webkit-scrollbar { display: none; }
body[data-flagship="1"][data-concept="immersive"] .rl-card { flex: 0 0 78%; min-width: 0; scroll-snap-align: start; position: relative; border: 0; border-radius: 0; background: transparent; padding: 0; }
body[data-flagship="1"][data-concept="immersive"] .rl-media { margin: 0; border-radius: 2px; aspect-ratio: 3 / 4; }
body[data-flagship="1"][data-concept="immersive"] .rl-copy { position: absolute; inset: auto 0 0; padding: 46px 14px 14px; background: linear-gradient(0deg, rgba(10, 10, 10, 0.74), transparent); color: #fff; }
body[data-flagship="1"][data-concept="immersive"] .rl-kicker { color: rgba(255, 255, 255, 0.7); }
body[data-flagship="1"][data-concept="immersive"] .rl-title { display: block; }
body[data-flagship="1"][data-concept="immersive"] .rl-title h3 { font-family: var(--display); font-size: 21px; font-weight: 500; line-height: 1.02; }
body[data-flagship="1"][data-concept="immersive"] .rl-price { display: block; margin-top: 4px; color: rgba(255, 255, 255, 0.8); }
body[data-flagship="1"][data-concept="immersive"] .rl-desc { display: none; }
body[data-flagship="1"][data-concept="immersive"] .rl-save { color: #fff; background: rgba(0, 0, 0, 0.3); }
body[data-flagship="1"][data-concept="immersive"] .section-block > .sect { margin-top: 24px; padding-bottom: 4px; border-bottom: 1px solid var(--line); }
body[data-flagship="1"][data-concept="immersive"] .tiles { grid-template-columns: 1fr !important; gap: 18px !important; }
body[data-flagship="1"][data-concept="immersive"] .tile { border: 0 !important; border-radius: 0 !important; background: transparent !important; padding: 0 !important; }
body[data-flagship="1"][data-concept="immersive"] .tile .thumb { border-radius: 2px !important; aspect-ratio: 3 / 2 !important; }
body[data-flagship="1"][data-concept="immersive"] .tile .name { font-family: var(--display); font-size: 19px; font-weight: 500; }
body[data-flagship="1"][data-concept="immersive"] .h-row { padding: 18px 0; }

/* Search, saved, detail and More use the same full-bleed language. */
body[data-flagship="1"][data-concept="immersive"] .search-field { border-radius: 999px; background: color-mix(in srgb, var(--ink) 5%, transparent); }
body[data-flagship="1"][data-concept="immersive"] .r-row { padding: 13px 0; border-bottom: 1px solid var(--line); }
body[data-flagship="1"][data-concept="immersive"] .r-row .r-art { width: 80px; height: 80px; border-radius: 2px; }
body[data-flagship="1"][data-concept="immersive"] .r-row .name { font-family: var(--display); font-size: 18px; font-weight: 500; }
body[data-flagship="1"][data-concept="immersive"] .rd-media,
body[data-flagship="1"][data-concept="immersive"] .detail-band { margin: 0 -18px; border-radius: 0; aspect-ratio: 3 / 4; max-height: 62vh; }
body[data-flagship="1"][data-concept="immersive"] .rd-copy { position: relative; z-index: 2; margin: -34px -18px 0; padding: 22px 18px 16px; border-radius: 26px 26px 0 0; background: var(--bg); }
body[data-flagship="1"][data-concept="immersive"] .rd-copy h1 { font-size: clamp(36px, 10vw, 50px); line-height: 0.95; }
body[data-flagship="1"][data-concept="immersive"] .rd-copy .lede { font-size: 14px; line-height: 1.5; }
body[data-flagship="1"][data-concept="immersive"] .detail-cta .btn { border-radius: 999px; }
body[data-flagship="1"][data-concept="immersive"] .more-lead { margin: 0 -18px; padding: 56px 18px 30px; background: var(--ink); color: var(--bg); }
body[data-flagship="1"][data-concept="immersive"] .more-lead .fx-eyebrow { color: var(--bg); opacity: 0.6; }
body[data-flagship="1"][data-concept="immersive"] .more-lead h1 { font-size: clamp(46px, 12vw, 66px); line-height: 0.88; }
body[data-flagship="1"][data-concept="immersive"] .more-lead p { color: var(--bg); opacity: 0.7; font-size: 13px; max-width: 34ch; }
body[data-flagship="1"][data-concept="immersive"] .more-facts { display: flex; flex-wrap: wrap; gap: 5px 15px; margin-top: 18px; font-size: 9px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--bg); opacity: 0.68; }
body[data-flagship="1"][data-concept="immersive"] .more-story { padding: 26px 0; }
body[data-flagship="1"][data-concept="immersive"] .more-story p { font-family: var(--display); font-size: 18px; line-height: 1.45; max-width: 32ch; }
body[data-flagship="1"][data-concept="immersive"] .custom-wrap { padding: 0 0 100px; }
body[data-flagship="1"][data-concept="immersive"] .custom-lead { margin: 0 -18px; padding: 46px 18px 26px; background: var(--ink); color: var(--bg); }
body[data-flagship="1"][data-concept="immersive"] .custom-lead .fx-eyebrow { color: var(--bg); opacity: 0.62; }
body[data-flagship="1"][data-concept="immersive"] .custom-lead h1 { font-size: clamp(40px, 11vw, 56px); line-height: 0.9; }
body[data-flagship="1"][data-concept="immersive"] .custom-body { padding-top: 20px; }
body[data-flagship="1"][data-concept="immersive"] .tabbar { left: 50% !important; right: auto !important; bottom: max(10px, env(safe-area-inset-bottom)); width: min(calc(100% - 24px), calc(var(--app-w) - 24px)) !important; transform: translateX(-50%); border: 1px solid color-mix(in srgb, var(--ink) 12%, transparent); border-radius: 999px; background: color-mix(in srgb, var(--surface) 92%, transparent); box-shadow: 0 18px 40px -24px color-mix(in srgb, var(--ink) 55%, transparent); padding: 5px 10px; height: 62px; }
body[data-flagship="1"][data-concept="immersive"] .tab.on svg { transform: translateY(-1px); }
body[data-flagship="1"][data-concept="immersive"] .tab span { font-size: 8px; }

@media (min-width: 720px) {
  body[data-flagship="1"][data-concept="immersive"] .fx-product { flex-basis: 42%; }
  body[data-flagship="1"][data-concept="immersive"] .rl-card { flex-basis: 40%; }
  body[data-flagship="1"][data-concept="immersive"] .fx-products,
  body[data-flagship="1"][data-concept="immersive"] .rl-grid { overflow: visible; flex-wrap: wrap; margin-inline: 0; padding-inline: 0; }
  body[data-flagship="1"][data-concept="immersive"] .rd-copy { max-width: 60ch; margin-left: auto; margin-right: auto; }
}
@media (min-width: 720px) {
  body[data-flagship="1"][data-concept="lead"] .fx-services { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 32px 24px !important; }
  body[data-flagship="1"][data-concept="lead"] .fx-service .fx-art { aspect-ratio: 4 / 3 !important; }
  body[data-flagship="1"][data-concept="index"] .shop-list .rl-grid:has(.h-row) { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 0 28px !important; }
  body[data-flagship="1"][data-concept="index"] .shop-list .h-row .thumb { width: 62px; height: 62px; }
  body[data-flagship="1"][data-concept="index"] .shop-list .h-row { padding-block: 14px; }
  body[data-flagship="1"][data-concept="index"] .fx-room-stack { display: grid !important; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
  body[data-flagship="1"][data-concept="index"] .fx-room { display: block; border: 0; padding: 0; }
  body[data-flagship="1"][data-concept="index"] .fx-room .fx-art { width: 100%; aspect-ratio: 4 / 3 !important; border-radius: 8px; }
  body[data-flagship="1"][data-concept="index"] .fx-room-copy { margin-top: 8px; }
}
@media (min-width: 1120px) {
  body[data-flagship="1"][data-concept="immersive"] .fx-product { flex-basis: 30%; }
  body[data-flagship="1"][data-concept="immersive"] .rl-card { flex-basis: 30%; }
  body[data-flagship="1"][data-concept="index"] .shop-list .rl-grid:has(.h-row) { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
}
`
}
