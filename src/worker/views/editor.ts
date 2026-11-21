import type { Doc } from '../doc'
import type { Project } from '../db'
import { directionsFor } from '../directions'
import { esc } from './shell'

/*
 * The visual editor for a mobile application: screens and navigation on the
 * left, a phone canvas in the middle, properties on the right. Every change
 * posts the whole shared document; the server normalises it, and both this
 * preview and the published PWA render from it.
 */
/**
 * The sample notice belongs to what actually remains an example. An imported
 * shop's catalogue and photographs are the owner's, so a banner must not call
 * them examples just because a trade-default offer or phone number is still
 * there. Nothing is hidden: whatever is still sample is named.
 */
export function sampleNotice(sample: Project['spec']['sampleContent']): {
  groups: string[]
  menu: boolean
  compact: boolean
  text: string
} | null {
  if (!sample) return null
  const groups = [
    sample.menu ? 'catalogue and prices' : '',
    sample.offers ? 'offers' : '',
    sample.story ? 'about text' : '',
    sample.tagline ? 'tagline' : '',
    sample.contact ? 'contact details' : '',
    sample.team ? 'team profiles' : '',
    sample.staff ? 'staff names' : '',
  ].filter(Boolean)
  if (!groups.length) return null
  const menu = sample.menu === true
  return {
    groups,
    menu,
    // A catalogue-wide disclosure stays a full notice. Once the catalogue is
    // verified, only name the small groups that are still examples.
    compact: !menu,
    text: menu
      ? `Sample ${groups.join(', ')} are examples — replace anything that is not yours.`
      : `Sample ${groups.join(', ')} remain. Your catalogue, prices and photographs are your own.`,
  }
}

export function editorPage(options: { project: Project; doc: Doc; origin: string }): string {
  const { project, doc, origin } = options
  const token = project.token
  const notice = sampleNotice(project.spec.sampleContent)
  const json = JSON.stringify(doc).replace(/</g, '\\u003c')
  const directions = directionsFor(project.spec.vertical).map((entry) => ({
    id: entry.id,
    label: entry.label,
    blurb: entry.blurb,
  }))
  const directionsJson = JSON.stringify(directions).replace(/</g, '\\u003c')
  const catalogJson = JSON.stringify(project.spec.menu).replace(/</g, '\\u003c')
  const offersJson = JSON.stringify(project.spec.offers).replace(/</g, '\\u003c')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Edit ${esc(project.name)} · Plattr</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<style>
:root {
  --paper: #f6f4ef; --panel: #fffefb; --ink: #191713; --muted: #7a7267;
  --line: rgba(25, 23, 19, 0.1); --line-soft: rgba(25, 23, 19, 0.06);
  --accent: ${esc(project.accent)}; --radius: 12px;
  --sans: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif;
  --serif: ui-serif, "Iowan Old Style", "Palatino Linotype", Georgia, serif;
}
* { box-sizing: border-box; }
html, body { height: 100%; }
body { margin: 0; background: var(--paper); color: var(--ink); font-family: var(--sans); font-size: 13px; -webkit-font-smoothing: antialiased; overflow: hidden; }
button, input, textarea, select { font: inherit; color: inherit; }
button { cursor: pointer; }
.bar { height: 56px; display: flex; align-items: center; gap: 12px; padding: 0 14px; background: var(--panel); border-bottom: 1px solid var(--line); }
.bar .back { text-decoration: none; width: 30px; height: 30px; display: grid; place-items: center; border-radius: 8px; color: var(--muted); }
.bar .back:hover { background: var(--paper); color: var(--ink); }
.brand { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.brand b { font-family: var(--serif); font-size: 15px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.brand span { color: var(--muted); font-size: 11px; }
.save { color: var(--muted); font-size: 11px; min-width: 54px; }
.save.busy { color: var(--accent); }
.spacer { flex: 1; }
.seg { display: inline-flex; background: var(--paper); border: 1px solid var(--line); border-radius: 9px; padding: 2px; }
.seg button { border: 0; background: transparent; border-radius: 7px; padding: 5px 9px; color: var(--muted); }
.seg button.on { background: var(--panel); color: var(--ink); box-shadow: 0 1px 2px rgba(0,0,0,.08); }
.btn { border: 1px solid var(--line); background: var(--panel); border-radius: 9px; padding: 7px 12px; text-decoration: none; color: var(--ink); display: inline-flex; align-items: center; gap: 6px; }
.btn:hover { border-color: rgba(25,23,19,.25); }
.btn.primary { background: var(--ink); color: #fff; border-color: var(--ink); }
.btn.ghost { background: transparent; }
.btn:disabled { opacity: .35; cursor: default; }
.iconbtn { width: 30px; height: 30px; display: grid; place-items: center; border: 1px solid transparent; background: transparent; border-radius: 8px; color: var(--muted); }
.iconbtn:hover { background: var(--paper); color: var(--ink); }
.iconbtn:disabled { opacity: .3; }
.layout { display: grid; grid-template-columns: 252px minmax(0, 1fr) 292px; height: calc(100% - 56px); }
.panel { background: var(--panel); overflow-y: auto; }
.panel.left { border-right: 1px solid var(--line); }
.panel.right { border-left: 1px solid var(--line); }
.sec { padding: 15px 14px; border-bottom: 1px solid var(--line-soft); }
.sec h3 { margin: 0 0 9px; font-size: 10.5px; text-transform: uppercase; letter-spacing: .09em; color: var(--muted); font-weight: 650; }
.tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.tile-add { border: 1px solid var(--line-soft); background: #fff; border-radius: 9px; padding: 8px; text-align: left; display: grid; gap: 2px; }
.tile-add:hover { border-color: var(--accent); }
.tile-add b { font-size: 11.5px; font-weight: 600; }
.tile-add span { color: var(--muted); font-size: 9.5px; line-height: 1.3; }
.tile-add:disabled { opacity: .38; cursor: default; border-color: var(--line-soft); }
.list { display: grid; gap: 4px; }
.node { display: flex; align-items: center; gap: 7px; border: 1px solid transparent; border-radius: 9px; padding: 7px 6px 7px 4px; background: transparent; }
.node:hover { background: var(--paper); }
.node.on { background: #fff; border-color: var(--line); box-shadow: 0 1px 2px rgba(0,0,0,.04); }
.node .grip { color: #b9b1a5; cursor: grab; font-size: 12px; padding: 0 2px; user-select: none; }
.node .name { flex: 1; min-width: 0; text-align: left; border: 0; background: transparent; padding: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.node .name small { color: var(--muted); font-size: 9.5px; display: block; }
.node .act { opacity: 0; border: 0; background: transparent; color: var(--muted); padding: 2px; border-radius: 5px; font-size: 12px; }
.node:hover .act, .node.on .act { opacity: 1; }
.node .act:hover { background: var(--paper); color: var(--ink); }
.node.off .name { opacity: .45; }
.node.drag { opacity: .4; }
.node.over { border-color: var(--accent); border-style: dashed; }
.node .init { color: var(--accent); font-size: 11px; width: 14px; text-align: center; }
.stage { position: relative; display: flex; flex-direction: column; min-width: 0; background: #eceae4; }
.stagebar { height: 42px; display: flex; align-items: center; gap: 8px; padding: 0 12px; border-bottom: 1px solid var(--line); background: rgba(255,255,255,.55); }
.sample-note { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; padding: 8px 12px; border-bottom: 1px solid #eadcc4; background: #fff8ec; color: #6f5630; font-size: 11px; line-height: 1.35; }
.sample-note b { flex: 0 0 auto; font-size: 9px; letter-spacing: .08em; text-transform: uppercase; padding: 3px 6px; border-radius: 999px; background: #f0ddbb; }
.sample-note span { flex: 1 1 180px; min-width: 0; }
.sample-note button, .sample-note a { flex: 0 0 auto; border: 1px solid #d9c39a; background: #fffdf8; color: inherit; border-radius: 7px; padding: 5px 8px; font: inherit; font-weight: 600; text-decoration: none; }
.sample-note.compact { padding: 5px 12px; border-bottom-color: var(--line-soft); background: transparent; color: var(--muted); }
.sample-note.compact b { background: var(--paper); border: 1px solid var(--line); color: var(--ink); }
.sample-note.compact button, .sample-note.compact a { border-color: var(--line); background: transparent; color: var(--ink); padding: 3px 7px; }
@media (max-width: 700px) {
  .sample-note { display: grid; grid-template-columns: auto 1fr auto; align-items: center; }
  .sample-note b { grid-column: 1; grid-row: 1; }
  .sample-note button { grid-column: 2; grid-row: 1; justify-self: end; }
  .sample-note a { grid-column: 3; grid-row: 1; }
  .sample-note span { grid-column: 1 / -1; grid-row: 2; }
}
.ai { display: flex; align-items: center; gap: 8px; margin-left: auto; width: min(430px, 52%); }
.ai input { flex: 1; min-width: 0; border: 1px solid var(--line); background: #fff; border-radius: 999px; padding: 7px 12px; outline: none; }
.ai input:focus { border-color: var(--accent); }
.canvas { flex: 1; min-height: 0; overflow: auto; display: flex; align-items: center; justify-content: center; padding: 22px; }
.device-wrap { position: relative; flex: 0 0 auto; width: 390px; height: 780px; }
.phone { position: absolute; top: 0; left: 0; width: var(--preview-source-w, 390px); height: var(--preview-source-h, 780px); background: #0d0c0a; border-radius: 48px; padding: 9px; box-shadow: 0 30px 70px -34px rgba(25,23,19,.65), inset 0 0 0 2px #2a2824; transform: scale(var(--preview-scale, 1)); transform-origin: top left; transition: transform .2s ease, width .2s ease, height .2s ease; }
.phone::after { content: ''; position: absolute; top: 9px; left: 50%; transform: translateX(-50%); width: 118px; height: 24px; background: #0d0c0a; border-radius: 0 0 16px 16px; z-index: 2; pointer-events: none; }
.phone iframe { width: 100%; height: 100%; border: 0; border-radius: 39px; background: #fff; display: block; }
.phone.tablet { border-radius: 30px; padding: 7px; }
.phone.tablet::after, .phone.desktop::after { display: none; }
.phone.tablet iframe { border-radius: 24px; }
.phone.desktop { border-radius: 18px; padding: 5px; }
.phone.desktop iframe { border-radius: 14px; }
.aibar { display: none; align-items: center; gap: 10px; padding: 9px 14px; border-bottom: 1px solid var(--line); background: #fff8ec; }
.aibar.on { display: flex; }
.aibar p { flex: 1; margin: 0; font-size: 12px; }
.quick { position: absolute; left: 50%; bottom: 16px; z-index: 9; width: min(540px, calc(100% - 28px)); transform: translateX(-50%); padding: 11px; border: 1px solid rgba(25,23,19,.14); border-radius: 14px; background: rgba(255,254,251,.97); box-shadow: 0 18px 45px -22px rgba(25,23,19,.55); backdrop-filter: blur(14px); display: grid; gap: 9px; }
.quick[hidden] { display: none; }
.quick-head { display: flex; align-items: center; gap: 9px; }
.quick-head b { flex: 1; min-width: 0; font-family: var(--serif); font-size: 15px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.quick-head button { border: 0; background: transparent; color: var(--muted); font-size: 16px; }
.quick-fields { display: grid; grid-template-columns: minmax(0, .72fr) minmax(0, 1fr); gap: 7px; }
.quick-fields[hidden] { display: none; }
.quick-fields label { display: grid; gap: 3px; font-size: 9.5px; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); }
.quick-fields input, .quick-fields textarea, .quick-fields select { width: 100%; border: 1px solid var(--line); border-radius: 8px; background: #fff; padding: 7px 8px; font-size: 12px; text-transform: none; letter-spacing: 0; color: var(--ink); }
.quick-fields textarea { resize: vertical; min-height: 46px; max-height: 100px; }
.quick-cta { grid-template-columns: 1fr 1fr; margin-top: -1px; }
.quick-style { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; min-height: 24px; }
.quick-style > span { font-size: 9px; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); margin-right: 1px; }
.quick-style [data-quick-bg] { width: 24px; height: 24px; padding: 0; border-radius: 50%; border: 1px solid rgba(25,23,19,.16); background: var(--sw, #fff); font-size: 8px; color: var(--muted); }
.quick-style [data-quick-bg].on { box-shadow: 0 0 0 2px #fff, 0 0 0 3px var(--accent); }
.quick-color { display: flex; align-items: center; gap: 5px; margin-left: auto; font-size: 9px; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); }
.quick-color select { border: 1px solid var(--line); border-radius: 6px; background: #fff; padding: 4px 5px; font: inherit; font-size: 9px; text-transform: none; letter-spacing: 0; color: var(--ink); }
.quick-actions { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.quick-actions button { min-height: 32px; padding: 0 9px; border: 1px solid var(--line); border-radius: 7px; background: #fff; font-size: 10.5px; }
.quick-actions button:hover { border-color: var(--accent); }
.quick-actions .danger { color: #a13b2b; }
.quick-actions .more { margin-left: auto; }
@media (max-width: 760px) { .quick { bottom: 8px; width: calc(100% - 16px); padding: 9px; } .quick-fields { grid-template-columns: 1fr; } .quick-cta { grid-template-columns: 1fr 1fr; } .quick-fields textarea { min-height: 38px; } }
.field { display: grid; gap: 5px; margin-bottom: 12px; }
.field label { font-size: 11px; color: var(--muted); }
.field input[type="text"], .field textarea, .field select { width: 100%; border: 1px solid var(--line); border-radius: 8px; padding: 7px 9px; background: #fff; outline: none; }
.field input:focus, .field textarea:focus, .field select:focus { border-color: var(--accent); }
.field textarea { min-height: 64px; resize: vertical; }
.swatches { display: flex; gap: 6px; flex-wrap: wrap; }
.swatch { width: 24px; height: 24px; border-radius: 7px; border: 1px solid var(--line); }
.swatch.on { outline: 2px solid var(--ink); outline-offset: 1px; }
.checks { display: grid; gap: 6px; }
.checks label { display: flex; gap: 7px; align-items: center; font-size: 12px; }
.hint { color: var(--muted); font-size: 10.5px; line-height: 1.45; margin: 8px 0 0; }
.empty { color: var(--muted); font-size: 12px; line-height: 1.5; padding: 4px 2px; }
.right .head { padding: 14px; border-bottom: 1px solid var(--line-soft); display: flex; align-items: center; justify-content: space-between; }
.right .head b { font-family: var(--serif); font-size: 15px; font-weight: 600; }
.badge { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
.media-modal { position: fixed; inset: 0; z-index: 40; background: rgba(25,23,19,.45); backdrop-filter: blur(3px); display: grid; place-items: center; padding: 24px; }
.media-modal[hidden] { display: none; }
.media-card { width: min(760px, 100%); max-height: min(760px, 90vh); display: flex; flex-direction: column; background: var(--panel); border-radius: 16px; overflow: hidden; box-shadow: 0 30px 80px -30px rgba(0,0,0,.5); }
.media-head { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 14px 18px; border-bottom: 1px solid var(--line); }
.media-head div { display: grid; gap: 2px; }
.media-head b { font-family: var(--serif); font-size: 19px; font-weight: 600; }
.media-head span { color: var(--muted); font-size: 11px; }
.media-body { overflow-y: auto; padding: 16px 18px 22px; }
.upload-zone { display: grid; gap: 3px; justify-items: center; text-align: center; border: 1px dashed var(--line); border-radius: 12px; padding: 20px; cursor: pointer; background: var(--paper); }
.upload-zone:hover { border-color: var(--accent); }
.upload-zone input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.upload-zone b { font-size: 13px; }
.upload-zone span { color: var(--muted); font-size: 10.5px; }
.media-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 6px; }
.media-item { border: 1px solid var(--line-soft); background: #fff; border-radius: 10px; overflow: hidden; text-align: left; }
.media-item img { width: 100%; aspect-ratio: 1.25; object-fit: cover; display: block; background: var(--paper); }
.media-item .meta { padding: 7px 8px 8px; display: grid; gap: 2px; }
.media-item .meta b { font-size: 10.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.media-item .meta span { color: var(--muted); font-size: 9px; }
.media-item .actions { display: flex; flex-wrap: wrap; gap: 4px; padding: 0 8px 8px; }
.media-item .actions .btn { padding: 4px 8px; font-size: 9.5px; border-radius: 6px; }
.media-item .actions .del { color: #a13b2b; }
.media-tools { display: flex; gap: 6px; margin: 10px 0 4px; }
.media-tools input, .media-tools select { border: 1px solid var(--line); border-radius: 7px; background: #fff; padding: 7px 9px; font: inherit; font-size: 11px; min-width: 0; }
.media-tools input { flex: 1; }
.media-item .used { display: inline-block; margin-top: 2px; font-size: 8.5px; letter-spacing: .05em; text-transform: uppercase; color: #33613f; }
.suggestions { display: grid; gap: 6px; margin: 4px 0 14px; }
.suggestion { display: grid; gap: 2px; padding: 9px 10px; border: 1px solid var(--line-soft); border-radius: 9px; background: var(--paper); }
.suggestion b { font-size: 11px; }
.suggestion span { color: var(--muted); font-size: 10px; line-height: 1.4; }
.media-preview { position: relative; border-radius: 9px; overflow: hidden; background: var(--paper); aspect-ratio: 16/10; margin-bottom: 8px; touch-action: none; cursor: crosshair; }
.media-preview img { width: 100%; height: 100%; object-fit: cover; display: block; }
.media-preview .focal { position: absolute; width: 14px; height: 14px; border-radius: 50%; border: 2px solid #fff; background: var(--accent); transform: translate(-50%,-50%); box-shadow: 0 1px 4px rgba(0,0,0,.4); pointer-events: none; }
.catalog-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 18px; border-top: 1px solid var(--line); }
.catalog-foot .hint { margin: 0; }
.cat-group { border: 1px solid var(--line-soft); border-radius: 10px; padding: 10px; margin-bottom: 10px; background: #fff; }
.cat-group-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.cat-group-head input { flex: 1; font-weight: 600; }
.cat-row { display: grid; grid-template-columns: 38px 1.1fr 1.5fr 70px 24px; gap: 6px; margin-bottom: 6px; align-items: center; }
.cat-row input { min-width: 0; padding: 7px 8px; font-size: 11px; }
.cat-row .x { border: 0; background: none; color: #a13b2b; cursor: pointer; font-size: 14px; }
.cat-photo { width: 38px; height: 38px; padding: 0; border: 1px dashed var(--line); border-radius: 8px; background: var(--paper); color: var(--muted); font-size: 16px; line-height: 1; cursor: pointer; overflow: hidden; }
.cat-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cat-photo:hover { border-color: var(--accent); color: var(--ink); }
.cat-media { grid-column: 2 / -1; display: grid; grid-template-columns: 1fr 1fr auto auto; gap: 6px; align-items: end; padding: 7px 0 10px; }
.cat-media .field { margin: 0; }
.cat-media input[type="range"] { width: 100%; padding: 0; }
.cat-media .hint { grid-column: 1 / -1; margin: 0; }
.cat-media .cat-remove-photo { border: 0; background: none; color: #a13b2b; font-size: 10px; cursor: pointer; padding: 7px 4px; }
.cat-add { border: 1px dashed var(--line); background: none; border-radius: 7px; padding: 6px 9px; font-size: 10px; color: var(--muted); cursor: pointer; }
.cat-add:hover { border-color: var(--accent); color: var(--ink); }
.cat-section-title { font-size: 10.5px; text-transform: uppercase; letter-spacing: .09em; color: var(--muted); margin: 18px 0 8px; }
@media (max-width: 700px) {
  .media-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cat-row { grid-template-columns: 32px minmax(0,1fr) 62px 20px; grid-template-areas: "photo name price remove" "photo desc desc remove"; gap: 5px 6px; align-items: start; }
  .cat-row .cat-photo { grid-area: photo; }
  .cat-row input[data-field="name"] { grid-area: name; }
  .cat-row input[data-field="desc"] { grid-area: desc; }
  .cat-row input[data-field="price"] { grid-area: price; }
  .cat-row .x { grid-area: remove; align-self: center; }
  .cat-photo { width: 32px; height: 32px; }
  .cat-media { grid-template-columns: 1fr 1fr; }
  .cat-media .cat-remove-photo { justify-self: start; }
}
.cat-offer { display: grid; grid-template-columns: 1fr 2fr 24px; gap: 6px; margin-bottom: 6px; }
.variant-bar { display: flex; align-items: center; gap: 8px; margin: 0 0 8px 50px; }
.variant-bar button { border: 1px dashed var(--line); background: none; border-radius: 7px; padding: 5px 8px; font-size: 10px; color: var(--muted); }
.variant-bar button:hover { border-color: var(--accent); color: var(--ink); }
.variant-bar span { color: var(--muted); font-size: 10px; }
.variant-panel { margin: 0 0 12px 50px; padding: 10px; border: 1px solid var(--line); border-radius: 10px; background: #fff; }
.variant-panel h4 { margin: 0 0 8px; font-size: 10.5px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
.variant-row { display: grid; grid-template-columns: 34px minmax(0,1.4fr) 76px 52px minmax(0,1fr) 22px 22px 22px; gap: 5px; align-items: center; margin-bottom: 6px; }
.variant-row input { min-width: 0; padding: 6px 7px; font-size: 11px; border: 1px solid var(--line); border-radius: 6px; }
.variant-row input[type="radio"] { justify-self: center; }
.variant-row .id { font-size: 9px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.variant-row .x, .variant-row .mv { border: 0; background: none; color: var(--muted); font-size: 11px; padding: 2px; }
.variant-row .x { color: #a13b2b; }
.variant-opts { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 7px; padding: 2px 0 4px 34px; }
.variant-opts label { display: grid; gap: 3px; font-size: 9px; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; }
.variant-opts select { border: 1px solid var(--line); border-radius: 6px; padding: 5px 6px; font-size: 11px; min-width: 92px; }
.vv-avail { display: flex; align-items: center; gap: 3px; font-size: 9px; color: var(--muted); white-space: nowrap; }
.vv-avail input { margin: 0; }
.variant-vphoto { width: 34px; height: 34px; padding: 0; border: 1px dashed var(--line); border-radius: 7px; background: var(--paper); overflow: hidden; color: var(--muted); }
.variant-vphoto img { width: 100%; height: 100%; object-fit: cover; display: block; }
.variant-group { display: grid; grid-template-columns: minmax(0,.8fr) minmax(0,1.4fr) 22px; gap: 5px; margin-bottom: 6px; }
.variant-group input { padding: 6px 7px; font-size: 11px; border: 1px solid var(--line); border-radius: 6px; }
.variant-foot { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 7px; }
.variant-foot .hint { margin: 0; flex: 1 1 150px; }
.cat-offer input { min-width: 0; padding: 7px 8px; font-size: 11px; }
.dir-grid { display: grid; gap: 6px; }
.dir { display: grid; gap: 2px; text-align: left; border: 1px solid var(--line-soft); background: #fff; border-radius: 10px; padding: 9px 10px; }
.dir:hover { border-color: var(--line); }
.dir.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.dir b { font-size: 11.5px; font-weight: 650; }
.dir span { color: var(--muted); font-size: 9.5px; line-height: 1.35; }
.versions { display: grid; gap: 6px; }
.version { display: flex; align-items: center; gap: 8px; border: 1px solid var(--line-soft); border-radius: 9px; padding: 8px 9px; background: #fff; }
.version b { flex: 1; font-size: 11.5px; font-weight: 600; }
.version span { color: var(--muted); font-size: 10px; }
.toast { position: fixed; bottom: 18px; left: 50%; transform: translate(-50%, 20px); background: var(--ink); color: #fff; padding: 8px 14px; border-radius: 9px; font-size: 12px; opacity: 0; transition: .2s; pointer-events: none; z-index: 20; }
.toast.on { opacity: 1; transform: translate(-50%, 0); }
@media (max-width: 1080px) {
  .layout { grid-template-columns: 224px minmax(0, 1fr); }
  .panel.right { position: fixed; right: 0; top: 56px; bottom: 0; width: 292px; z-index: 10; box-shadow: -20px 0 50px -30px rgba(0,0,0,.4); transform: translateX(100%); transition: transform .18s; }
  .panel.right.open { transform: none; }
  .ai { width: min(320px, 46%); }
}
@media (max-width: 900px) {
  .bar { gap: 5px; padding: 0 9px; }
  .brand span { display: none; }
  .brand b { max-width: 96px; }
  .bar .ghost, #openApp { display: none; }
  .seg button { padding: 5px 7px; font-size: 11px; }
}
@media (max-width: 620px) {
  .bar { gap: 4px; padding: 0 6px; }
  .bar .brand b { max-width: 76px; font-size: 13px; }
  .save { display: none; }
  .seg { display: none; }
  .bar .iconbtn { width: 30px; height: 30px; }
  #mediaBtn { display: none; }
}
@media (max-width: 380px) {
  .bar .brand { display: none; }
}
@media (max-width: 760px) {
  .layout { grid-template-columns: minmax(0, 1fr); }
  .panel.left { position: fixed; left: 0; top: 56px; bottom: 0; width: 252px; z-index: 10; transform: translateX(-100%); transition: transform .18s; box-shadow: 20px 0 50px -30px rgba(0,0,0,.4); }
  .panel.left.open { transform: none; }
  .brand b { max-width: 110px; }
  .ai { display: none; }
  .canvas { padding: 10px; }
  .phone, .phone.tablet, .phone.desktop { border-radius: 24px; padding: 5px; }
  .phone iframe { border-radius: 20px; }
  .phone::after { display: none; }
}
</style>
</head>
<body data-token="${esc(token)}">
<div class="bar">
  <a class="back" href="/p/${esc(token)}" aria-label="Back to the build">←</a>
  <button class="iconbtn" id="panelLeft" title="Screens and components" aria-label="Screens and components">☰</button>
  <div class="brand"><b>${esc(project.name)}</b><span>mobile app · v${project.version}</span></div>
  <span class="save" id="saveStatus">Saved</span>
  <div class="spacer"></div>
  <button class="iconbtn" id="undo" disabled title="Undo (⌘Z)" aria-label="Undo">↶</button>
  <button class="iconbtn" id="redo" disabled title="Redo (⇧⌘Z)" aria-label="Redo">↷</button>
  <div class="seg" role="group" aria-label="Preview device">
    <button data-device="desktop" title="Desktop check">Desktop</button>
    <button data-device="tablet" title="Tablet check">Tablet</button>
    <button data-device="mobile" class="on" title="Phone">Phone</button>
  </div>
  <button class="iconbtn" id="mediaBtn" title="Photos" aria-label="Photos">▧</button>
  <button class="iconbtn" id="catalogBtn" title="Catalogue and offers" aria-label="Catalogue and offers">▤</button>
  <button class="iconbtn" id="history" title="Version history" aria-label="Version history">⟲</button>
  <button class="iconbtn" id="panelRight" title="Properties" aria-label="Properties">⚙</button>
  <a class="btn ghost" href="/p/${esc(token)}/dashboard">Dashboard</a>
  <a class="btn ghost" href="/p/${esc(token)}" target="_blank" rel="noreferrer">Review page</a>
  <a class="btn primary" id="openApp" href="${esc(origin)}/p/${esc(token)}/app" target="_blank" rel="noreferrer">Open app ↗</a>
</div>
<div class="layout">
  <aside class="panel left" id="left">
    <div class="sec">
      <h3>Screens</h3>
      <div class="list" id="screens"></div>
      <div class="tiles" id="screenLibrary" style="margin-top:8px"></div>
    </div>
    <div class="sec">
      <h3>Elements</h3>
      <div class="list" id="elements"></div>
      <p class="hint">Click any text, photo, button or container in the preview. Nested elements can be selected here.</p>
    </div>
    <div class="sec">
      <h3>Add component</h3>
      <div class="tiles" id="library"></div>
    </div>
    <div class="sec">
      <h3>This screen</h3>
      <div class="list" id="structure"></div>
      <p class="hint">Drag to reorder. Select a component to edit it.</p>
    </div>
  </aside>
  <main class="stage">
    <div class="stagebar">
      <span class="badge" id="screenPath">Home</span>
      <div class="ai">
        <input id="aiCommand" type="text" maxlength="120" placeholder="Add a contact screen, make it premium…" aria-label="AI instruction" />
        <button class="btn" id="aiRun">Preview</button>
      </div>
    </div>
    ${notice ? `<div class="sample-note${notice.compact ? ' compact' : ''}" id="sampleNote"><b>Sample</b><span>${esc(notice.text)}</span>${notice.menu ? `<button type="button" id="sampleEdit">Items &amp; prices</button>` : ''}<a href="/p/${esc(token)}/dashboard">Review</a></div>` : ''}
    <div class="aibar" id="aiBar">
      <p id="aiSummary"></p>
      <button class="btn" id="aiDiscard">Discard</button>
      <button class="btn primary" id="aiApply">Apply</button>
    </div>
    <div class="canvas">
      <div class="device-wrap" id="deviceWrap">
        <div class="phone mobile" id="phone">
          <iframe id="frame" title="Live application preview" src="/p/${esc(token)}/app?editor=1"></iframe>
        </div>
      </div>
    </div>
    <div class="quick" id="quickEditor" hidden role="region" aria-label="Selected component controls">
      <div class="quick-head"><b id="quickLabel">Component</b><button type="button" id="quickClose" aria-label="Close component controls">✕</button></div>
      <div class="quick-fields">
        <label>Heading<input id="quickTitle" type="text" maxlength="60" placeholder="Heading" /></label>
        <label>Words<textarea id="quickText" maxlength="600" placeholder="Text shown in this component"></textarea></label>
      </div>
      <div class="quick-fields quick-cta" id="quickCtaRow" hidden>
        <label>Button<input id="quickCta" type="text" maxlength="28" placeholder="Button label" /></label>
        <label>Opens<select id="quickTarget"></select></label>
      </div>
      <div class="quick-style" id="quickStyle">
        <span>Background</span>
        <button type="button" data-quick-bg="" aria-label="Automatic background" title="Automatic">A</button>
        <button type="button" data-quick-bg="#faf7f1" style="--sw:#faf7f1" aria-label="Paper background" title="Paper"></button>
        <button type="button" data-quick-bg="#efe7db" style="--sw:#efe7db" aria-label="Sand background" title="Sand"></button>
        <button type="button" data-quick-bg="#17110d" style="--sw:#17110d" aria-label="Ink background" title="Ink"></button>
        <button type="button" data-quick-bg="${esc(project.accent)}" style="--sw:${esc(project.accent)}" aria-label="Accent background" title="Accent"></button>
        <label class="quick-color">Text<select id="quickColor"><option value="">Auto</option><option value="#17110d">Ink</option><option value="#ffffff">White</option></select></label>
      </div>
      <div class="quick-actions">
        <button type="button" data-quick="photo">Photo</button>
        <button type="button" data-quick="catalog" id="quickCatalog" hidden>Items &amp; prices</button>
        <button type="button" data-quick="up" title="Move up">↑ Up</button>
        <button type="button" data-quick="down" title="Move down">↓ Down</button>
        <button type="button" data-quick="duplicate">Duplicate</button>
        <button type="button" data-quick="hide" id="quickHide">Hide</button>
        <button type="button" data-quick="delete" class="danger">Delete</button>
        <button type="button" data-quick="more" class="more">More</button>
      </div>
    </div>
  </main>
  <aside class="panel right" id="right">
    <div class="head"><b>Properties</b><span class="badge" id="selectionLabel">Screen</span></div>
    <div id="inspector"></div>
  </aside>
</div>
<div class="media-modal" id="mediaModal" hidden>
  <div class="media-card" role="dialog" aria-modal="true" aria-label="Media library">
    <div class="media-head"><div><b>Photos</b><span id="mediaSub">Your image library</span></div><button class="iconbtn" id="mediaClose" aria-label="Close">✕</button></div>
    <div class="media-body">
      <label class="upload-zone" id="uploadZone">
        <input id="mediaFile" type="file" accept="image/jpeg,image/png,image/webp" />
        <b>Upload a photo</b>
        <span>JPEG, PNG or WebP · up to 8 MB · resized for mobile automatically</span>
      </label>
      <p class="hint" id="mediaStatus"></p>
      <div class="media-tools">
        <input id="mediaSearch" type="search" placeholder="Search photos" aria-label="Search photos" />
        <select id="mediaFilter" aria-label="Filter photos">
          <option value="all">All photos</option>
          <option value="used">In use</option>
          <option value="unused">Not used</option>
        </select>
      </div>
      <input id="mediaReplaceFile" type="file" accept="image/jpeg,image/png,image/webp" hidden />
      <div class="media-grid" id="mediaGrid"></div>
      <div id="mediaSuggestions"></div>
    </div>
  </div>
</div>
<div class="media-modal" id="catalogModal" hidden>
  <div class="media-card" role="dialog" aria-modal="true" aria-label="Catalogue and offers">
    <div class="media-head"><div><b>Catalogue &amp; offers</b><span>Names, descriptions and prices customers see</span></div><button class="iconbtn" id="catalogClose" aria-label="Close">✕</button></div>
    <div class="media-body" id="catalogBody"></div>
    <div class="catalog-foot"><span class="hint" id="catalogStatus">Changes appear in the app after saving.</span><button class="btn primary" id="catalogSave">Save catalogue</button></div>
  </div>
</div>
<div class="toast" id="toast"></div>
<script>
const TOKEN = ${JSON.stringify(token)};
const INITIAL = ${json};
const CATALOG = ${catalogJson};
const OFFERS = ${offersJson};
const DIRECTIONS = ${directionsJson};
const HAS_SAVED = ${project.doc ? 'true' : 'false'};
const SECTION_LABELS = { hero:'Hero', featured:'Featured', offers:'Offers', loyalty:'Rewards', visit:'Visit', story:'Story', testimonials:'Testimonials', cta:'Call to action', heading:'Heading', text:'Text', button:'Button', image:'Image', banner:'Banner', productList:'Product list', search:'Search', form:'Contact form', gallery:'Gallery', flagship:'Feature block' };
const VARIANT_LABELS = { 'dine-title':'Restaurant intro', 'dine-feature':'Featured dish', 'dine-actions':'Actions', 'dine-facts':'Visit details', 'dine-note':'Kitchen note', 'shop-search':'Search', 'shop-title':'Shop intro', 'shop-products':'Products', 'shop-all':'Browse link', 'salon-title':'Salon intro', 'salon-dates':'Date picker', 'salon-services':'Treatments', 'salon-staff':'Team', 'salon-action':'Book action', 'hotel-cover':'Stay cover', 'hotel-stay':'Stay card', 'hotel-rooms':'Rooms', 'hotel-facts':'Visit details', 'pro-title':'Practice intro', 'pro-intro':'Approach', 'pro-index':'Services index', 'pro-actions':'Consult action', 'pro-facts':'Visit details', 'cafe-hero':'Café intro', 'cafe-menu':'Counter menu', 'cafe-order':'Takeaway band', 'cafe-reserve':'Table reservation', 'gym-hero':'Gym intro', 'gym-plans':'Membership plans', 'gym-timetable':'Class timetable', 'gym-trainers':'Coach profiles', 'gym-join':'Membership enquiry', 'clinic-hero':'Clinic intro', 'clinic-specialities':'Specialities', 'clinic-doctors':'Doctor profiles', 'clinic-care':'Visit steps', 'clinic-privacy':'Privacy note', 'clinic-appointments':'Appointment card', 'property-hero':'Property intro', 'property-search':'Search and filters', 'property-listings':'Listings', 'property-viewing':'Viewing card', 'property-enquire':'Valuation enquiry', 'studio-hero':'Studio intro', 'studio-work':'Selected work', 'studio-services':'Services and prices', 'studio-team':'Studio team', 'studio-book':'Project enquiry', 'offers':'Offers' };
const SCREEN_LABELS = { home:'Home', catalog:'Catalogue', search:'Search', saved:'Saved', detail:'Details', book:'Booking', quote:'Enquiry', more:'More', contact:'Contact', profile:'Profile', about:'About', custom:'Screen' };
const COMPONENTS = ['heading','text','button','image','banner','gallery','productList','search','form','testimonials','cta','offers','loyalty','visit','story','featured'];
const SINGLE = ['hero','featured','offers','loyalty','visit','story','testimonials','cta','search','form','productList'];
const SCREENS = [['contact','Contact','Address, hours and a message'],['about','About','Your story and a photo'],['profile','Profile','Account and shortcuts'],['custom','Blank','A new screen']];
const NAV_ICONS = [['home','Home'],['catalog','Catalogue'],['bag','Bag'],['calendar','Calendar'],['dots','More dots'],['plus','Plus'],['chevron','Chevron'],['phone','Phone'],['search','Search'],['heart','Heart'],['quote','Quote'],['none','No icon']];
const state = { doc: JSON.parse(JSON.stringify(INITIAL)), screen: INITIAL.initialScreen || INITIAL.screens[0].id, selected: null, element: null, elementMeta: null, device: 'mobile', history: [], future: [], historyMode: false, clipboard: null, media: [], mediaSuggestions: [], mediaTarget: null, elementTarget: null, catalogTarget: null, variantTarget: null, variantMediaTarget: null, mediaQuery: '', mediaFilter: 'all', mediaBusy: false, mediaReplaceId: null, catalog: [], offers: [] };
const $ = (id) => document.getElementById(id);
const frame = $('frame');
const DEVICE_SIZES = { mobile: [390, 780], tablet: [820, 640], desktop: [1180, 760] };
/** Fit the whole device into the canvas without changing the device's aspect
 *  ratio. The phone is scaled as one piece, so its iframe is never stretched. */
function fitPreview() {
  const canvas = document.querySelector('.canvas');
  const wrap = $('deviceWrap');
  if (!canvas || !wrap || !canvas.clientWidth || !canvas.clientHeight) return;
  const [width, height] = DEVICE_SIZES[state.device] || DEVICE_SIZES.mobile;
  const style = getComputedStyle(canvas);
  const availableWidth = Math.max(1, canvas.clientWidth - parseFloat(style.paddingLeft || '0') - parseFloat(style.paddingRight || '0'));
  const availableHeight = Math.max(1, canvas.clientHeight - parseFloat(style.paddingTop || '0') - parseFloat(style.paddingBottom || '0'));
  const scale = Math.max(0.05, Math.min(1, availableWidth / width, availableHeight / height));
  wrap.style.setProperty('--preview-source-w', width + 'px');
  wrap.style.setProperty('--preview-source-h', height + 'px');
  wrap.style.setProperty('--preview-scale', String(scale));
  wrap.style.width = width * scale + 'px';
  wrap.style.height = height * scale + 'px';
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function current() { return state.doc.screens.find((s) => s.id === state.screen) || state.doc.screens[0]; }
function component() { return current().sections.find((s) => s.id === state.selected) || null; }
function nodeLabel(node) { return node.title || VARIANT_LABELS[node.variant] || SECTION_LABELS[node.kind] || 'Component'; }
function appId(screen) { return ['contact','profile','about','custom'].includes(screen.kind) ? screen.id : screen.kind; }
function historyPush(before) { state.history.push(before); if (state.history.length > 60) state.history.shift(); state.future = []; }
function commit(mutate, reload) {
  const before = clone(state.doc);
  const next = mutate(clone(state.doc));
  if (!next || JSON.stringify(next) === JSON.stringify(before)) return;
  historyPush(before); state.doc = next; render(); scheduleSave(); if (reload) reloadFrame();
}
function undo() {
  if (!state.history.length) return;
  state.future.push(clone(state.doc)); state.doc = state.history.pop(); quickShown = null; render(); scheduleSave(); reloadFrame();
}
function redo() {
  if (!state.future.length) return;
  state.history.push(clone(state.doc)); state.doc = state.future.pop(); quickShown = null; render(); scheduleSave(); reloadFrame();
}
function toast(text) { const el = $('toast'); el.textContent = text; el.classList.add('on'); clearTimeout(el.dataset.t); el.dataset.t = String(setTimeout(() => el.classList.remove('on'), 1800)); }
let saveTimer = null;
function scheduleSave() {
  $('saveStatus').textContent = 'Saving…'; $('saveStatus').classList.add('busy');
  clearTimeout(saveTimer); saveTimer = setTimeout(save, 650);
}
/** The keepalive flag lets a save finish after the tab closes or reloads, so a
 *  change made inside the debounce window is not lost by a refresh. */
function save() {
  clearTimeout(saveTimer); saveTimer = null;
  const body = JSON.stringify({ doc: state.doc });
  $('saveStatus').textContent = 'Saving…'; $('saveStatus').classList.add('busy');
  return fetch('/api/projects/' + TOKEN + '/doc', { method:'PUT', headers:{'content-type':'application/json'}, body, keepalive: true })
    .then((response) => {
      if (!response.ok) throw new Error('save');
      return response.json().catch(() => null);
    })
    .then((payload) => {
      $('saveStatus').textContent = 'Saved'; $('saveStatus').classList.remove('busy');
      // The server hides a component that cannot draw itself. Adopt its
      // document only when nothing was typed while this save was in flight, so
      // a late response can never overwrite newer words.
      const hidden = payload && Array.isArray(payload.hidden) ? payload.hidden : [];
      const restored = payload && Array.isArray(payload.restored) ? payload.restored : [];
      if (hidden.length || restored.length) {
        if (payload.doc && JSON.stringify({ doc: state.doc }) === body) { state.doc = payload.doc; render(); }
        if (hidden.length)
          toast(hidden.length === 1
            ? 'One section was hidden automatically: it has nothing to show yet'
            : hidden.length + ' sections were hidden automatically: they have nothing to show yet');
        else
          toast(restored.length === 1
            ? 'A section is visible again: the business now has details for it'
            : restored.length + ' sections are visible again: the business now has details for them');
      }
      return true;
    })
    .catch(() => { $('saveStatus').textContent = 'Not saved'; $('saveStatus').classList.add('busy'); });
}
addEventListener('pagehide', () => { if (saveTimer !== null) save(); });
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && saveTimer !== null) save(); });
let reloadTimer = null;
function reloadFrame() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    // The preview shows the saved document, so it is only reloaded once the
    // save has actually landed. A failed save leaves the last good preview up.
    save().then((result) => {
      if (!result) return;
      frame.src = '/p/' + TOKEN + '/app?editor=1&screen=' + encodeURIComponent(appId(current())) + '&v=' + Date.now();
    });
  }, 240);
}
function render() { renderScreens(); renderScreenLibrary(); renderLibrary(); renderStructure(); renderElements(); renderInspector(); renderQuick(); renderToolbar(); }
let quickShown = null;
const CATALOG_VARIANTS = ['shop-products', 'salon-services', 'hotel-rooms', 'pro-index', 'cafe-menu', 'gym-plans', 'clinic-specialities', 'property-listings', 'studio-services', 'offers'];
function renderQuick() {
  const box = $('quickEditor'); const node = component();
  const show = Boolean(node && !state.historyMode && !state.element); box.hidden = !show;
  if (!show) { quickShown = null; return; }
  $('quickLabel').textContent = nodeLabel(node); $('quickHide').textContent = node.hidden ? 'Show' : 'Hide';
  $('quickCtaRow').hidden = !node.cta;
  $('quickCatalog').hidden = !CATALOG_VARIANTS.includes(node.variant || '');
  if (quickShown !== node.id) {
    $('quickTitle').value = node.title || ''; $('quickText').value = node.text || '';
    if (node.cta) {
      $('quickCta').value = node.cta.label || '';
      $('quickTarget').replaceChildren(...state.doc.screens.map((screen) => {
        const option = document.createElement('option'); option.value = screen.id; option.textContent = screen.name; return option;
      }));
    }
    quickShown = node.id;
  }
  if (node.cta) $('quickTarget').value = node.cta.screen;
  const background = (node.style && node.style.background) || '';
  document.querySelectorAll('[data-quick-bg]').forEach((button) => button.classList.toggle('on', button.dataset.quickBg === background));
  const color = (node.style && node.style.color) || '';
  $('quickColor').value = ['', '#17110d', '#ffffff'].includes(color) ? color : '';
}
function renderToolbar() { $('undo').disabled = !state.history.length; $('redo').disabled = !state.future.length; $('screenPath').textContent = current().name; }
function renderScreens() {
  $('screens').innerHTML = state.doc.screens.map((s) => '<div class="node' + (state.screen === s.id ? ' on' : '') + (s.hidden ? ' off' : '') + '" draggable="true" data-screen="' + s.id + '">' +
    '<span class="grip">⠿</span>' +
    '<button class="name" data-open="' + s.id + '">' + esc(s.name) + '<small>' + SCREEN_LABELS[s.kind] + (s.nav ? ' · in nav' : '') + '</small></button>' +
    (state.doc.initialScreen === s.id ? '<span class="init" title="Initial screen">★</span>' : '') +
    (s.kind === 'home' ? '' : '<button class="act" data-screen-delete="' + s.id + '" title="Delete screen">✕</button>') +
    '</div>').join('');
  document.querySelectorAll('[data-screen]').forEach((el) => {
    el.addEventListener('dragstart', (event) => { event.dataTransfer.setData('text/plain', el.dataset.screen); el.classList.add('drag'); });
    el.addEventListener('dragend', () => el.classList.remove('drag'));
    el.addEventListener('dragover', (event) => { event.preventDefault(); el.classList.add('over'); });
    el.addEventListener('dragleave', () => el.classList.remove('over'));
    el.addEventListener('drop', (event) => {
      event.preventDefault(); el.classList.remove('over');
      const id = event.dataTransfer.getData('text/plain');
      if (id && id !== el.dataset.screen) commit((doc) => moveScreen(doc, id, el.dataset.screen), true);
    });
  });
}
function moveScreen(doc, id, beforeId) {
  const from = doc.screens.findIndex((s) => s.id === id); if (from < 0) return doc;
  const moving = doc.screens[from]; if (moving.kind === 'home') return doc;
  const rest = doc.screens.filter((s) => s.id !== id);
  const at = beforeId ? rest.findIndex((s) => s.id === beforeId) : rest.length;
  if (at < 0) return doc;
  rest.splice(Math.max(at, rest[0] && rest[0].kind === 'home' ? 1 : 0), 0, moving);
  return Object.assign({}, doc, { screens: rest });
}
function renderScreenLibrary() {
  $('screenLibrary').innerHTML = SCREENS.map(([kind, label, hint]) => {
    const present = (kind === 'custom' ? false : state.doc.screens.some((s) => s.kind === kind));
    return '<button class="tile-add" data-add-screen="' + kind + '"' + (present ? ' disabled' : '') + '><b>' + label + '</b><span>' + hint + '</span></button>';
  }).join('');
}
function renderLibrary() {
  $('library').innerHTML = (state.clipboard ? '<button class="btn" data-paste-component="1" style="grid-column:1/-1">Paste ' + esc(nodeLabel(state.clipboard)) + '</button>' : '') + COMPONENTS.map((kind) => {
    const present = SINGLE.includes(kind) && current().sections.some((s) => s.kind === kind);
    return '<button class="tile-add" data-add-component="' + kind + '"' + (present ? ' disabled' : '') + '><b>' + SECTION_LABELS[kind] + '</b><span>' + (present ? 'On this screen' : 'Add to screen') + '</span></button>';
  }).join('');
}
function renderStructure() {
  $('structure').innerHTML = current().sections.map((s) => '<div class="node' + (state.selected === s.id ? ' on' : '') + (s.hidden ? ' off' : '') + '" draggable="true" data-node="' + s.id + '"' + (s.hidden && s.hiddenBecause === 'empty' ? ' title="Hidden automatically: nothing to show yet"' : '') + '>' +
    '<span class="grip">⠿</span>' +
    '<button class="name" data-select="' + s.id + '">' + esc(nodeLabel(s)) + '<small>' + (VARIANT_LABELS[s.variant] || SECTION_LABELS[s.kind]) + (s.hidden && s.hiddenBecause === 'empty' ? ' · auto-hidden' : '') + '</small></button>' +
    '<button class="act" data-hide="' + s.id + '" title="' + (s.hidden ? 'Show' : 'Hide') + '">' + (s.hidden ? '◌' : '◉') + '</button>' +
    '<button class="act" data-copy-component="' + s.id + '" title="Copy">⧉</button>' +
    '<button class="act" data-duplicate="' + s.id + '" title="Duplicate">＋</button>' +
    (s.kind === 'hero' ? '' : '<button class="act" data-delete="' + s.id + '" title="Delete">✕</button>') +
    '</div>').join('') || '<p class="empty">No components yet. Add one from above.</p>';
  document.querySelectorAll('[data-node]').forEach((el) => {
    el.addEventListener('dragstart', (event) => { event.dataTransfer.setData('text/plain', el.dataset.node); el.classList.add('drag'); });
    el.addEventListener('dragend', () => el.classList.remove('drag'));
    el.addEventListener('dragover', (event) => { event.preventDefault(); el.classList.add('over'); });
    el.addEventListener('dragleave', () => el.classList.remove('over'));
    el.addEventListener('drop', (event) => {
      event.preventDefault(); el.classList.remove('over');
      const id = event.dataTransfer.getData('text/plain');
      if (id && id !== el.dataset.node) commit((doc) => moveComponent(doc, state.screen, id, el.dataset.node), true);
    });
  });
}
function elementEntry(key) { return (state.doc.elements && state.doc.elements[key]) || {}; }
function elementDomain() {
  const frameDoc = frame.contentDocument;
  if (!frameDoc) return [];
  const ids = current().sections.map((section) => section.id);
  const rows = [];
  const nav = frameDoc.querySelector('.tabbar .tab');
  if (nav) {
    frameDoc.querySelectorAll('.tabbar .tab').forEach((tab) => {
      const key = tab.dataset.el;
      if (!key) return;
      const entry = elementEntry(key);
      rows.push({ key, tag: 'button', label: entry.name || (tab.textContent || 'Tab').trim() || 'Tab', nav: true, bound: false, depth: 0, hidden: Boolean(entry.hidden), action: tab.hasAttribute('data-go') });
    });
  }
  frameDoc.querySelectorAll('[data-sec] [data-el]').forEach((el) => {
    const section = el.closest('[data-sec]');
    if (!section || !ids.includes(section.dataset.sec)) return;
    const entry = elementEntry(el.dataset.el);
    const words = (el.textContent || '').replace(/\s+/g, ' ').trim();
    let depth = 0;
    let parent = el.parentElement;
    while (parent && parent !== section) { if (parent.hasAttribute('data-el')) depth += 1; parent = parent.parentElement; }
    rows.push({
      key: el.dataset.el,
      tag: el.tagName.toLowerCase(),
      label: entry.name || (el.tagName === 'IMG' ? (el.getAttribute('alt') || 'Photo') : words ? words.slice(0, 34) : el.tagName.toLowerCase()),
      nav: false,
      bound: el.dataset.elBound === '1',
      depth,
      hidden: Boolean(entry.hidden),
      action: el.hasAttribute('data-go') || el.tagName === 'A',
    });
  });
  return rows.slice(0, 160);
}
function renderElements() {
  let rows = [];
  try { rows = elementDomain(); } catch (error) { rows = []; }
  $('elements').innerHTML = rows.length ? rows.map((row) => '<div class="node' + (state.element === row.key ? ' on' : '') + (row.hidden ? ' off' : '') + '" style="padding-left:' + (4 + row.depth * 10) + 'px">' +
    '<button class="name" data-element="' + esc(row.key) + '">' + esc(row.label) + '<small>' + row.tag + (row.bound ? ' · catalogue' : row.nav ? ' · navigation' : '') + '</small></button>' +
    (row.toggle === false ? '' : '') +
    '</div>').join('') : '<p class="empty">No elements on this screen yet.</p>';
}
function selectElement(key) {
  const row = (() => { try { return elementDomain().find((entry) => entry.key === key); } catch (error) { return null; } })();
  state.element = key; state.elementMeta = row || null;
  if (row && !row.nav) state.selected = key.split('~')[0];
  quickShown = null;
  render();
  try { frame.contentWindow.postMessage({ source: 'plattr-editor', type: 'element', key }, '*'); } catch (error) {}
}
function setElement(key, patch) {
  commit((doc) => {
    doc.elements = doc.elements || {};
    const before = doc.elements[key] || {};
    const next = Object.assign({}, before);
    if (patch.style) next.style = Object.assign({}, before.style, patch.style);
    if (patch.media === null) delete next.media;
    else if (patch.media) next.media = Object.assign({}, before.media, patch.media);
    if (patch.action === null) delete next.action;
    else if (patch.action) next.action = Object.assign({}, before.action, patch.action);
    if (patch.text !== undefined) { if (String(patch.text).trim()) next.text = String(patch.text).slice(0, 300); else delete next.text; }
    if (patch.name !== undefined) { if (String(patch.name).trim()) next.name = String(patch.name).trim().slice(0, 40); else delete next.name; }
    if (patch.hidden !== undefined) { if (patch.hidden) next.hidden = true; else delete next.hidden; }
    if (patch.navIcon === null) delete next.navIcon;
    else if (patch.navIcon) next.navIcon = patch.navIcon;
    if (Object.keys(next).length) doc.elements[key] = next; else delete doc.elements[key];
    return doc;
  }, true);
}
const isCloneKey = (key) => /~c[a-z0-9]{4,12}$/.test(String(key));
function dropCopyEntries(doc, key) {
  doc.elements = doc.elements || {};
  delete doc.elements[key];
  Object.keys(doc.elements).forEach((candidate) => {
    if (doc.elements[candidate] && doc.elements[candidate].copyParent === key) delete doc.elements[candidate];
  });
}
function resetElement(key) {
  commit((doc) => {
    if (!doc.elements) return doc;
    if (isCloneKey(key)) dropCopyEntries(doc, key);
    else delete doc.elements[key];
    return doc;
  }, true);
  toast('Element reset to its design');
}
function elementNode(key) {
  try { return frame.contentDocument.querySelector('[data-el="' + key + '"]'); } catch (error) { return null; }
}
function siblingKeys(key) {
  const node = elementNode(key); if (!node || !node.parentElement) return [];
  return [...node.parentElement.children].filter((child) => child.dataset && child.dataset.el).map((child) => child.dataset.el);
}
function positionSiblings(doc, keys) {
  doc.elements = doc.elements || {};
  keys.forEach((key, index) => {
    doc.elements[key] = Object.assign({}, doc.elements[key], { position: index * 10 });
  });
}
function duplicateElement(key) {
  const node = elementNode(key); const meta = state.elementMeta || {};
  if (!node || meta.nav) return toast('Navigation items are edited, not duplicated');
  if (meta.bound || node.dataset.elBound === '1') return toast('Catalogue-owned elements keep one identity and cannot be duplicated');
  if (isCloneKey(key)) return toast('A copied element cannot be copied again');
  const descendants = [...node.querySelectorAll('[data-el]')];
  if (descendants.some((child) => child.dataset.elBound === '1' || child.closest('[data-item]'))) {
    return toast('This container holds catalogue-owned content and cannot be duplicated');
  }
  if (descendants.some((child) => isCloneKey(child.dataset.el))) return toast('Remove copied children before copying this container');
  const siblings = siblingKeys(key); const at = siblings.indexOf(key);
  if (at < 0) return toast('This element is not on the current screen');
  let suffix = Date.now().toString(36).slice(-6);
  let cloneKey = key + '~c' + suffix;
  let attempt = 1;
  while (state.doc.elements && state.doc.elements[cloneKey]) {
    suffix = Date.now().toString(36).slice(-6) + attempt.toString(36);
    cloneKey = key + '~c' + suffix;
    attempt += 1;
  }
  const copyTree = {};
  descendants.forEach((child) => { copyTree[child.dataset.el] = child.dataset.el + '~c' + suffix; });
  commit((doc) => {
    doc.elements = doc.elements || {};
    const source = doc.elements[key] ? clone(doc.elements[key]) : {};
    delete source.hidden; delete source.removed; delete source.copyParent; delete source.copyTree; delete source.duplicateOf;
    const copy = Object.assign(source, {
      duplicateOf: key,
      name: ((source.name || (descendants.length ? 'Container' : meta.label || 'Element')) + ' copy').slice(0, 40),
      ...(Object.keys(copyTree).length ? { copyTree } : {}),
    });
    const nextOrder = siblings.slice(); nextOrder.splice(at + 1, 0, cloneKey);
    positionSiblings(doc, nextOrder);
    doc.elements[cloneKey] = copy;
    descendants.forEach((child) => {
      const before = doc.elements[child.dataset.el];
      if (!before) return;
      const childCopy = clone(before);
      delete childCopy.hidden; delete childCopy.removed; delete childCopy.copyParent; delete childCopy.copyTree; delete childCopy.duplicateOf;
      doc.elements[copyTree[child.dataset.el]] = Object.assign(childCopy, { duplicateOf: child.dataset.el, copyParent: cloneKey });
    });
    return doc;
  }, true);
  state.element = cloneKey; state.elementMeta = null; render();
  toast(descendants.length ? 'Container duplicated with its children' : 'Element duplicated');
}
function deleteElement(key) {
  const meta = state.elementMeta || {};
  if (meta.nav) return toast('Remove navigation on the screen instead');
  if (meta.bound) return toast('Catalogue-owned elements keep their product identity');
  const entry = elementEntry(key);
  commit((doc) => {
    doc.elements = doc.elements || {};
    if (entry.copyParent) delete doc.elements[key];
    else if (entry.duplicateOf || isCloneKey(key)) dropCopyEntries(doc, key);
    else doc.elements[key] = Object.assign({}, doc.elements[key], { removed: true });
    return doc;
  }, true);
  state.element = null; state.elementMeta = null; render();
  toast('Element deleted · undo restores it');
}
function moveElement(key, delta) {
  const siblings = siblingKeys(key); const from = siblings.indexOf(key); const to = from + delta;
  if (from < 0 || to < 0 || to >= siblings.length) return;
  const swapped = siblings.slice(); [swapped[from], swapped[to]] = [swapped[to], swapped[from]];
  commit((doc) => { positionSiblings(doc, swapped); return doc; }, true);
}
function navScreenFor(key) {
  const index = Number(String(key).split('~').pop());
  const nav = state.doc.screens.filter((screen) => screen.nav && !screen.hidden && screen.kind !== 'detail');
  return nav[index] || current();
}
function moveNav(key, delta) {
  const target = navScreenFor(key);
  commit((doc) => {
    const nav = doc.screens.filter((screen) => screen.nav && !screen.hidden && screen.kind !== 'detail');
    const at = nav.findIndex((screen) => screen.id === target.id); const to = at + delta;
    if (at < 0 || to < 0 || to >= nav.length) return doc;
    const a = doc.screens.findIndex((screen) => screen.id === nav[at].id);
    const b = doc.screens.findIndex((screen) => screen.id === nav[to].id);
    [doc.screens[a], doc.screens[b]] = [doc.screens[b], doc.screens[a]];
    return doc;
  }, true);
}
function toggleNav(key) {
  const target = navScreenFor(key);
  if (!target.nav) {
    const active = state.doc.screens.filter((screen) => screen.nav && !screen.hidden && screen.kind !== 'detail');
    if (active.length >= 5) return toast('A tab bar holds five items. Remove one first.');
  }
  commit((doc) => { const screen = doc.screens.find((entry) => entry.id === target.id); if (screen) screen.nav = !screen.nav; return doc; }, true);
}
function dropSectionElements(doc, sectionId) {
  doc.elements = doc.elements || {};
  Object.keys(doc.elements).forEach((key) => { if (String(key).startsWith(sectionId + '~')) delete doc.elements[key]; });
}
function remapSectionElements(doc, fromId, toId) {
  doc.elements = doc.elements || {};
  const map = (key) => String(key).startsWith(fromId + '~') ? toId + String(key).slice(fromId.length) : key;
  const copied = {};
  Object.keys(doc.elements).forEach((key) => {
    if (!String(key).startsWith(fromId + '~')) return;
    const next = clone(doc.elements[key]);
    if (next.duplicateOf) next.duplicateOf = map(next.duplicateOf);
    if (next.copyParent) next.copyParent = map(next.copyParent);
    if (next.copyTree) next.copyTree = Object.fromEntries(Object.entries(next.copyTree).map(([source, target]) => [map(source), map(target)]));
    copied[map(key)] = next;
  });
  doc.elements = Object.assign({}, doc.elements, copied);
}
function uniqueSectionId(screen, base) {
  let id = base; let index = 2;
  while (screen.sections.some((section) => section.id === id)) { id = base + '_' + index; index += 1; }
  return id;
}
function copyComponent(id) {
  const node = current().sections.find((section) => section.id === id); if (!node) return;
  state.clipboard = clone(node); toast('Component copied');
}
function pasteComponent() {
  if (!state.clipboard) return;
  commit((doc) => {
    const screen = doc.screens.find((entry) => entry.id === state.screen); if (!screen) return doc;
    const id = uniqueSectionId(screen, state.clipboard.id);
    const pasted = Object.assign(clone(state.clipboard), { id });
    const at = screen.sections.findIndex((section) => section.id === state.selected);
    screen.sections.splice(at < 0 ? screen.sections.length : at + 1, 0, pasted);
    remapSectionElements(doc, state.clipboard.id, id);
    state.selected = id; state.element = null;
    return doc;
  }, true);
  toast('Component pasted');
}
function renderElementInspector() {
  const key = state.element; const entry = elementEntry(key); const meta = state.elementMeta || {};
  const style = entry.style || {};
  const isImage = meta.tag === 'img';
  const isIcon = meta.tag === 'svg';
  const isContainer = meta.tag === 'div' || meta.tag === 'a';
  const bound = Boolean(meta.bound);
  const nav = Boolean(meta.nav);
  $('selectionLabel').textContent = entry.name || (nav ? 'Navigation item' : isImage ? 'Image' : isIcon ? 'Icon' : meta.tag || 'Element');
  const number = (id, label, value, min, max, step) => '<div class="field"><label>' + label + '</label><input id="' + id + '" type="number" min="' + min + '" max="' + max + '" step="' + (step || 1) + '" value="' + (value === undefined ? '' : value) + '" placeholder="Auto" /></div>';
  $('inspector').innerHTML =
    '<div class="sec"><button class="btn" id="eBack">← Component properties</button>' +
      '<p class="hint" style="margin-top:10px">' + (bound ? 'This text and its photograph come from your catalogue. Its appearance is editable; its identity, price and option IDs are not.' : nav ? 'This is a navigation item. Its label and destination are saved with the document.' : 'Element changes are saved with the design, not applied as a one-off style.') + '</p>' +
      '<div class="field"><label>Name in layers</label><input id="eName" type="text" maxlength="40" value="' + esc(entry.name || '') + '" placeholder="e.g. Hero photo" /></div>' +
    '</div>' +
    (!bound && !isImage && !isIcon ? '<div class="sec"><h3>Words</h3><div class="field"><label>Content</label><textarea id="eText" maxlength="300" placeholder="Leave empty to keep the design copy">' + esc(entry.text || '') + '</textarea></div></div>' : '') +
    '<div class="sec"><h3>Typography</h3>' +
      number('eSize', 'Size (px)', style.fontSize, 8, 96) +
      '<div class="field"><label>Weight</label><select id="eWeight"><option value="">Default</option>' + [300,400,500,600,700,800,900].map((value) => '<option value="' + value + '"' + (style.weight === value ? ' selected' : '') + '>' + value + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>Colour</label><input id="eColor" type="color" value="' + esc(style.color || '#17110d') + '" /></div>' +
      '<div class="field"><label>Alignment</label><div class="seg">' + [['left','Left'],['center','Centre'],['right','Right']].map(([value,label]) => '<button data-ealign="' + value + '" class="' + (style.align === value ? 'on' : '') + '">' + label + '</button>').join('') + '</div></div>' +
      number('eLine', 'Line height', style.lineHeight, 0.8, 2.4, 0.05) +
    '</div>' +
    '<div class="sec"><h3>Box</h3>' +
      (isContainer ? '<div class="field"><label>Arrangement</label><select id="eLayout">' + [['','Default'],['stack','Stacked'],['row','Side by side'],['grid','Two columns']].map(([value,label]) => '<option value="' + value + '"' + ((style.layout || '') === value ? ' selected' : '') + '>' + label + '</option>').join('') + '</select></div>' : '') +
      number('eWidth', 'Width (% of container)', style.width, 10, 100) +
      number('eHeight', 'Height (px)', style.height, 8, 800) +
      number('ePadding', 'Padding (px)', style.padding, 0, 64) +
      number('eMargin', 'Margin (px)', style.margin, 0, 64) +
      number('eGap', 'Gap (px)', style.gap, 0, 64) +
      '<div class="field"><label>Background</label><input id="eBg" type="color" value="' + esc(style.background || '#ffffff') + '" /></div>' +
      number('eRadius', 'Corner radius (px)', style.radius, 0, 64) +
      number('eBorder', 'Border (px)', style.border, 0, 8) +
      '<div class="field"><label>Shadow</label><select id="eShadow">' + [['','Default'],['none','None'],['soft','Soft'],['strong','Strong']].map(([value,label]) => '<option value="' + value + '"' + ((style.shadow || '') === value ? ' selected' : '') + '>' + label + '</option>').join('') + '</select></div>' +
    '</div>' +
    (nav ? '<div class="sec"><h3>Navigation</h3>' +
      '<div class="field"><label>Icon</label><select id="eNavIcon"><option value="">Design default</option>' + NAV_ICONS.map(([value,label]) => '<option value="' + value + '"' + ((entry.navIcon || '') === value ? ' selected' : '') + '>' + label + '</option>').join('') + '</select></div>' +
      '<button class="btn" id="eNavPhoto" style="width:100%">' + (entry.media ? 'Replace custom icon' : 'Upload custom icon') + '</button>' +
      (entry.media ? ' <button class="btn" id="eNavPhotoRemove" style="width:100%;margin-top:6px">Remove custom icon</button>' : '') +
      '<div class="actions" style="display:flex;gap:6px;margin-top:8px"><button class="btn" id="eNavEarlier">← Earlier</button><button class="btn" id="eNavLater">Later →</button><button class="btn" id="eNavToggle">' + (navScreenFor(key).nav ? 'Remove from nav' : 'Add to nav') + '</button></div>' +
      '<p class="hint">Five items fit. Labels, destination and icon are saved with the document; custom icons are uploaded media.</p>' +
    '</div>' : '') +
    (isImage ? '<div class="sec"><h3>Image</h3>' +
      (bound ? '<p class="hint">The product photograph belongs to the catalogue. Change it under Catalogue → item photo, not here.</p>' : '<button class="btn primary" id="ePhoto" style="width:100%">' + (entry.media ? 'Replace photo' : 'Choose photo') + '</button>' + (entry.media ? ' <button class="btn" id="eRemovePhoto" style="width:100%;margin-top:6px">Remove photo</button>' : '')) +
      '<div class="field"><label>Aspect</label><select id="eAspect">' + [['','Default'],['auto','Original'],['wide','Wide 16:9'],['square','Square'],['portrait','Portrait 4:5']].map(([value,label]) => '<option value="' + value + '"' + ((style.aspect || '') === value ? ' selected' : '') + '>' + label + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>Fitting</label><select id="eFit">' + [['','Default'],['cover','Crop to fill'],['contain','Fit whole image']].map(([value,label]) => '<option value="' + value + '"' + ((style.imageFit || '') === value ? ' selected' : '') + '>' + label + '</option>').join('') + '</select></div>' +
      number('eFocalX', 'Crop focus X (%)', style.focalX, 0, 100) + number('eFocalY', 'Crop focus Y (%)', style.focalY, 0, 100) +
      number('eCropTop', 'Crop from top (%)', style.cropTop, 0, 45) + number('eCropRight', 'Crop from right (%)', style.cropRight, 0, 45) +
      number('eCropBottom', 'Crop from bottom (%)', style.cropBottom, 0, 45) + number('eCropLeft', 'Crop from left (%)', style.cropLeft, 0, 45) +
      '<p class="hint">Crop insets the photograph without changing the stored file or its catalogue association.</p>' +
    '</div>' : '') +
    (meta.action ? '<div class="sec"><h3>Action</h3><div class="field"><label>Opens</label><select id="eAction"><option value="">Design default</option>' + state.doc.screens.filter((screen) => screen.kind !== 'detail').map((screen) => '<option value="' + appId(screen) + '"' + ((entry.action && entry.action.screen) === appId(screen) ? ' selected' : '') + '>' + esc(screen.name) + '</option>').join('') + '</select></div></div>' : '') +
    '<div class="sec"><div class="actions" style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn" id="eEarlier">↑ Earlier</button><button class="btn" id="eLater">↓ Later</button>' +
      (nav ? '' : '<button class="btn" id="eDuplicate"' + (bound ? ' disabled title="Catalogue-owned"' : '') + '>Duplicate</button><button class="btn" id="eDelete" style="color:#a13b2b"' + (bound ? ' disabled title="Catalogue-owned"' : '') + '>Delete</button>') +
      '</div><div class="actions" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"><button class="btn" id="eHide">' + (entry.hidden ? 'Show element' : 'Hide element') + '</button><button class="btn" id="eReset" style="color:#a13b2b">Reset element</button></div></div>';
  $('eBack').addEventListener('click', () => { state.element = null; state.elementMeta = null; render(); });
  $('eName').addEventListener('input', (event) => setElement(key, { name: event.target.value }));
  const text = $('eText'); if (text) text.addEventListener('input', (event) => setElement(key, { text: event.target.value }));
  const bind = (id, field, numberValue) => { const input = $(id); if (!input) return; input.addEventListener('change', () => { const value = numberValue ? (input.value === '' ? undefined : Number(input.value)) : input.value; setElement(key, { style: { [field]: value } }); }); };
  bind('eSize','fontSize',true); bind('eWeight','weight',true); bind('eColor','color',false); bind('eLine','lineHeight',true);
  bind('eWidth','width',true); bind('eHeight','height',true); bind('ePadding','padding',true); bind('eMargin','margin',true);
  bind('eGap','gap',true); bind('eBg','background',false); bind('eRadius','radius',true); bind('eBorder','border',true);
  bind('eShadow','shadow',false); bind('eAspect','aspect',false); bind('eFit','imageFit',false); bind('eFocalX','focalX',true); bind('eFocalY','focalY',true);
  bind('eLayout','layout',false);
  bind('eCropTop','cropTop',true); bind('eCropRight','cropRight',true); bind('eCropBottom','cropBottom',true); bind('eCropLeft','cropLeft',true);
  document.querySelectorAll('[data-ealign]').forEach((button) => button.addEventListener('click', () => setElement(key, { style: { align: button.dataset.ealign } })));
  const action = $('eAction'); if (action) action.addEventListener('change', () => setElement(key, { action: action.value ? { screen: action.value } : null }));
  const photo = $('ePhoto'); if (photo) photo.addEventListener('click', () => openMedia(null, null, key));
  const removePhoto = $('eRemovePhoto'); if (removePhoto) removePhoto.addEventListener('click', () => setElement(key, { media: null }));
  const navPhoto = $('eNavPhoto'); if (navPhoto) navPhoto.addEventListener('click', () => openMedia(null, null, key));
  const navPhotoRemove = $('eNavPhotoRemove'); if (navPhotoRemove) navPhotoRemove.addEventListener('click', () => setElement(key, { media: null }));
  const navIcon = $('eNavIcon'); if (navIcon) navIcon.addEventListener('change', () => setElement(key, navIcon.value ? { navIcon: navIcon.value, media: null } : { navIcon: null }));
  const navEarlier = $('eNavEarlier'); if (navEarlier) navEarlier.addEventListener('click', () => moveNav(key, -1));
  const navLater = $('eNavLater'); if (navLater) navLater.addEventListener('click', () => moveNav(key, 1));
  const navToggle = $('eNavToggle'); if (navToggle) navToggle.addEventListener('click', () => toggleNav(key));
  const earlier = $('eEarlier'); if (earlier) earlier.addEventListener('click', () => moveElement(key, -1));
  const later = $('eLater'); if (later) later.addEventListener('click', () => moveElement(key, 1));
  const duplicate = $('eDuplicate'); if (duplicate) duplicate.addEventListener('click', () => duplicateElement(key));
  const remove = $('eDelete'); if (remove) remove.addEventListener('click', () => deleteElement(key));
  $('eHide').addEventListener('click', () => setElement(key, { hidden: !entry.hidden }));
  $('eReset').addEventListener('click', () => resetElement(key));
}
function moveComponent(doc, screenId, id, beforeId) {
  const target = doc.screens.find((s) => s.id === screenId); if (!target) return doc;
  const from = target.sections.findIndex((s) => s.id === id); if (from < 0) return doc;
  const moving = target.sections[from];
  const rest = target.sections.filter((s) => s.id !== id);
  const at = beforeId ? rest.findIndex((s) => s.id === beforeId) : rest.length;
  if (at < 0) return doc;
  rest.splice(Math.max(at, rest[0] && rest[0].kind === 'hero' ? 1 : 0), 0, moving);
  target.sections = rest; return doc;
}
function renderInspector() {
  if (state.historyMode) { renderHistory(); return; }
  if (state.element) { renderElementInspector(); return; }
  const node = component();
  $('selectionLabel').textContent = node ? nodeLabel(node) : 'Screen';
  if (!node) { renderScreenInspector(); return; }
  const style = node.style || {}; const hides = (node.responsive && node.responsive.hideOn) || [];
  $('inspector').innerHTML =
    (node.hidden && node.hiddenBecause === 'empty'
      ? '<div class="sec"><p class="hint" role="status">Hidden automatically: this section has nothing to show yet. It comes back on its own when the business has the details it needs.</p></div>'
      : '') +
    '<div class="sec">' +
      '<div class="field"><label>Heading</label><input id="pTitle" type="text" maxlength="60" value="' + esc(node.title || '') + '" placeholder="' + (VARIANT_LABELS[node.variant] || SECTION_LABELS[node.kind]) + '" /></div>' +
      '<div class="field"><label>Words</label><textarea id="pText" maxlength="600" placeholder="A sentence or two">' + esc(node.text || '') + '</textarea></div>' +
      (node.kind === 'button' || node.kind === 'banner' || node.kind === 'cta' ? '<div class="field"><label>Button label</label><input id="pCta" type="text" maxlength="28" value="' + esc((node.cta && node.cta.label) || '') + '" /></div><div class="field"><label>Button opens</label><select id="pTarget">' + state.doc.screens.map((s) => '<option value="' + s.id + '"' + (node.cta && node.cta.screen === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('') + '</select></div>' : '') +
    (node.kind === 'hero' ? '' : '<div class="field"><label>Move to another screen</label><select id="pMoveTo"><option value="">Choose a screen…</option>' + state.doc.screens.filter((s) => s.id !== state.screen).map((s) => '<option value="' + s.id + '">' + esc(s.name) + '</option>').join('') + '</select></div>') +
    '</div>' +
    (node.kind === 'image' || node.kind === 'flagship' ? '<div class="sec"><h3>Photograph</h3>' + mediaInspector(node) + '</div>' : '') +
    '<div class="sec"><h3>Design</h3>' +
      '<div class="field"><label>Alignment</label><div class="seg"><button data-align="left" class="' + (style.align !== 'center' ? 'on' : '') + '">Left</button><button data-align="center" class="' + (style.align === 'center' ? 'on' : '') + '">Centred</button></div></div>' +
      '<div class="field"><label>Background</label><div class="swatches">' +
        ['', '${esc(project.accent)}', '#f5efe4', '#12100d', '#ffffff'].map((colour) => '<button class="swatch' + ((style.background || '') === colour ? ' on' : '') + '" data-bg="' + colour + '" style="background:' + (colour || 'transparent') + '" title="' + (colour || 'None') + '"></button>').join('') +
      '</div></div>' +
      '<div class="field"><label>Spacing</label><div class="seg">' + [0,1,2].map((value) => '<button data-pad="' + value + '" class="' + ((style.paddingY || 0) === value ? 'on' : '') + '">' + ['None','Cosy','Roomy'][value] + '</button>').join('') + '</div></div>' +
      '<div class="field"><label>Corners</label><div class="seg">' + [0,1,2].map((value) => '<button data-radius="' + value + '" class="' + ((style.radius || 0) === value ? 'on' : '') + '">' + ['Square','Soft','Round'][value] + '</button>').join('') + '</div></div>' +
    '</div>' +
    '<div class="sec"><h3>Show on</h3><div class="checks">' +
      ['desktop','tablet','mobile'].map((point) => '<label><input type="checkbox" data-hide-point="' + point + '" ' + (hides.includes(point) ? 'checked' : '') + '/> ' + point[0].toUpperCase() + point.slice(1) + '</label>').join('') +
    '</div></div>' +
    '<div class="sec"><button class="btn" id="pDelete" style="color:#a13b2b">Delete component</button></div>';
  bindInspector(node);
}
function renderScreenInspector() {
  const screen = current();
  const design = state.doc.design || {};
  $('inspector').innerHTML =
    '<div class="sec">' +
      '<div class="field"><label>Screen name</label><input id="sName" type="text" maxlength="24" value="' + esc(screen.name) + '" /></div>' +
      '<div class="checks"><label><input type="checkbox" id="sNav" ' + (screen.nav ? 'checked' : '') + '/> Show in bottom navigation</label>' +
      '<label><input type="checkbox" id="sInitial" ' + (state.doc.initialScreen === screen.id ? 'checked' : '') + '/> Open the app on this screen</label></div>' +
      '<p class="hint">Up to five navigation items fit. The first five selected are used.</p>' +
    '</div>' +
    '<div class="sec"><h3>Design direction</h3><div class="dir-grid">' +
      DIRECTIONS.map((entry) => '<button class="dir ' + (design.direction === entry.id ? 'on' : '') + '" data-direction-value="' + entry.id + '"><b>' + esc(entry.label) + '</b><span>' + esc(entry.blurb) + '</span></button>').join('') +
    '</div><p class="hint">Direction changes typography, layout, navigation and surfaces together.</p></div>' +
    '<div class="sec"><h3>Fine tune</h3>' +
      '<div class="field"><label>Typography</label><select id="dType">' +
        [['','Direction default'],['editorial','Editorial serif'],['modern','Modern grotesk'],['compact','Compact condensed']].map(([value,label]) => '<option value="' + value + '"' + ((design.typography || '') === value ? ' selected' : '') + '>' + label + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>Navigation</label><select id="dNav">' +
        [['','Direction default'],['bar','Bar'],['floating','Floating pill'],['dock','Dock']].map(([value,label]) => '<option value="' + value + '"' + ((design.nav || '') === value ? ' selected' : '') + '>' + label + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>Buttons</label><select id="dButtons">' +
        [['','Direction default'],['square','Square'],['soft','Soft'],['round','Round']].map(([value,label]) => '<option value="' + value + '"' + ((design.buttons || '') === value ? ' selected' : '') + '>' + label + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>Cards</label><select id="dCards">' +
        [['','Direction default'],['square','Square'],['soft','Soft'],['round','Round']].map(([value,label]) => '<option value="' + value + '"' + ((design.cards || '') === value ? ' selected' : '') + '>' + label + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>Spacing</label><select id="dDensity">' +
        [['','Direction default'],['cozy','Compact'],['standard','Standard'],['roomy','Generous']].map(([value,label]) => '<option value="' + value + '"' + ((design.density || '') === value ? ' selected' : '') + '>' + label + '</option>').join('') + '</select></div>' +
    '</div>' +
    '<div class="sec"><h3>This screen</h3><p class="empty">' + screen.sections.length + ' component' + (screen.sections.length === 1 ? '' : 's') + '. Add or reorder them on the left, or click one in the app.</p></div>' +
    (screen.kind === 'home' ? '' : '<div class="sec"><button class="btn" id="sDuplicate">Duplicate screen</button> <button class="btn" id="sDelete" style="color:#a13b2b;margin-top:8px">Delete screen</button></div>');
  const setDesign = (patch) => commit((doc) => { doc.design = Object.assign({}, doc.design, patch); return doc; }, true);
  document.querySelectorAll('[data-direction-value]').forEach((button) => button.addEventListener('click', () => commit((doc) => { doc.design = { direction: button.dataset.directionValue }; return doc; }, true)));
  [['dType','typography'],['dNav','nav'],['dButtons','buttons'],['dCards','cards'],['dDensity','density']].forEach(([id,key]) => {
    const input = $(id); if (input) input.addEventListener('change', () => setDesign({ [key]: input.value || undefined }));
  });
  $('sName').addEventListener('input', (event) => commit((doc) => { const s = doc.screens.find((x) => x.id === screen.id); if (s) s.name = event.target.value.slice(0,24); return doc; }));
  $('sNav').addEventListener('change', (event) => commit((doc) => { const s = doc.screens.find((x) => x.id === screen.id); if (s) s.nav = event.target.checked; return doc; }, true));
  $('sInitial').addEventListener('change', (event) => { if (event.target.checked) commit((doc) => { doc.initialScreen = screen.id; return doc; }, true); });
  const dup = $('sDuplicate'); if (dup) dup.addEventListener('click', () => duplicateScreen(screen.id));
  const del = $('sDelete'); if (del) del.addEventListener('click', () => { if (confirm('Delete this screen?')) removeScreen(screen.id); });
}
function bindInspector(node) {
  $('pTitle').addEventListener('input', (event) => commit((doc) => patchNode(doc, node.id, { title: event.target.value }), true));
  $('pText').addEventListener('input', (event) => commit((doc) => patchNode(doc, node.id, { text: event.target.value }), true));
  const pick = $('pPick');
  if (pick) pick.addEventListener('click', () => openMedia(node.id));
  const alt = $('pAlt');
  if (alt) alt.addEventListener('change', () => patchMedia(node.id, { alt: alt.value.trim().slice(0, 120) }));
  const fit = $('pFit');
  if (fit) fit.addEventListener('change', () => patchMedia(node.id, { fit: fit.value }));
  const aspect = $('pAspect');
  if (aspect) aspect.addEventListener('change', () => patchMedia(node.id, { aspect: aspect.value }));
  const removePhoto = $('pRemove');
  if (removePhoto) removePhoto.addEventListener('click', () => patchMedia(node.id, null));
  const preview = $('pMediaPreview');
  if (preview) {
    let dragging = false;
    const point = (event) => {
      const rect = preview.getBoundingClientRect();
      const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
      const image = preview.querySelector('img');
      const dot = preview.querySelector('.focal');
      if (image) image.style.objectPosition = x + '% ' + y + '%';
      if (dot) { dot.style.left = x + '%'; dot.style.top = y + '%'; }
      return { x: Math.round(x), y: Math.round(y) };
    };
    preview.addEventListener('pointerdown', (event) => { dragging = true; preview.setPointerCapture && preview.setPointerCapture(event.pointerId); point(event); });
    preview.addEventListener('pointermove', (event) => { if (dragging) point(event); });
    preview.addEventListener('pointerup', (event) => { if (!dragging) return; dragging = false; const at = point(event); patchMedia(node.id, { focalX: at.x, focalY: at.y }); });
    preview.addEventListener('pointercancel', () => { dragging = false; });
  }
  const moveTo = $('pMoveTo');
  if (moveTo) moveTo.addEventListener('change', (event) => { if (event.target.value) moveComponentTo(event.target.value, node.id); });
  const cta = $('pCta'), target = $('pTarget');
  if (cta) cta.addEventListener('input', (event) => commit((doc) => patchNode(doc, node.id, { cta: { label: event.target.value, screen: target.value } })));
  if (target) target.addEventListener('change', (event) => commit((doc) => patchNode(doc, node.id, { cta: { label: cta.value || 'Continue', screen: event.target.value } }), true));
  document.querySelectorAll('[data-align]').forEach((button) => button.addEventListener('click', () => commit((doc) => patchNode(doc, node.id, { style: { align: button.dataset.align } }))));
  document.querySelectorAll('[data-bg]').forEach((button) => button.addEventListener('click', () => commit((doc) => patchNode(doc, node.id, { style: { background: button.dataset.bg || undefined } }))));
  document.querySelectorAll('[data-pad]').forEach((button) => button.addEventListener('click', () => commit((doc) => patchNode(doc, node.id, { style: { paddingY: Number(button.dataset.pad) } }))));
  document.querySelectorAll('[data-radius]').forEach((button) => button.addEventListener('click', () => commit((doc) => patchNode(doc, node.id, { style: { radius: Number(button.dataset.radius) } }))));
  document.querySelectorAll('[data-hide-point]').forEach((input) => input.addEventListener('change', () => commit((doc) => {
    const screen = doc.screens.find((s) => s.id === state.screen); if (!screen) return doc;
    const node = screen.sections.find((s) => s.id === state.selected); if (!node) return doc;
    const set = new Set(node.responsive.hideOn);
    if (input.checked) set.add(input.dataset.hidePoint); else set.delete(input.dataset.hidePoint);
    node.responsive.hideOn = ['desktop','tablet','mobile'].filter((point) => set.has(point));
    return doc;
  })));
  const remove = $('pDelete'); if (remove) remove.addEventListener('click', () => {
    if (!confirm('Delete this component?')) return;
    commit((doc) => { const screen = doc.screens.find((s) => s.id === state.screen); if (screen) { screen.sections = screen.sections.filter((s) => s.id !== node.id); dropSectionElements(doc, node.id); } return doc; }, true);
    state.selected = null; render();
  });
}
function patchNode(doc, id, patch) {
  const screen = doc.screens.find((s) => s.id === state.screen); if (!screen) return doc;
  const node = screen.sections.find((s) => s.id === id); if (!node) return doc;
  if (patch.title !== undefined) node.title = patch.title.trim().slice(0,60) || undefined;
  if (patch.text !== undefined) node.text = patch.text.trim().slice(0,600) || undefined;
  if (patch.cta !== undefined) node.cta = { label: (patch.cta.label || 'Continue').slice(0,28), screen: patch.cta.screen };
  if (patch.style) node.style = Object.assign({}, node.style, patch.style);
  return doc;
}
function mediaSrc(item, width) { return '/p/' + TOKEN + '/media/' + item.id + '/' + width + '.webp'; }
function mediaInspector(node) {
  const media = node.media;
  if (!media) return '<p class="empty">No photo yet. A real photograph of the work will always beat generated artwork.</p><button class="btn primary" id="pPick">Choose a photo</button>';
  const src = mediaSrc(media, 320);
  return '<div class="media-preview" id="pMediaPreview"><img src="' + src + '" alt="' + esc(media.alt || '') + '" style="object-fit:' + (media.fit === 'contain' ? 'contain' : 'cover') + ';object-position:' + (media.focalX ?? 50) + '% ' + (media.focalY ?? 50) + '%" /><span class="focal" style="left:' + (media.focalX ?? 50) + '%;top:' + (media.focalY ?? 50) + '%"></span></div>' +
    '<div class="field"><label>Describe the photo</label><input id="pAlt" type="text" maxlength="120" value="' + esc(media.alt || '') + '" placeholder="What is in this image?" /></div>' +
    '<div class="field"><label>Image fitting</label><select id="pFit"><option value="cover"' + (media.fit !== 'contain' ? ' selected' : '') + '>Fill the frame</option><option value="contain"' + (media.fit === 'contain' ? ' selected' : '') + '>Fit inside</option></select></div>' +
    '<div class="field"><label>Crop shape</label><select id="pAspect"><option value="wide"' + (media.aspect === 'wide' || !media.aspect ? ' selected' : '') + '>Wide 16:9</option><option value="square"' + (media.aspect === 'square' ? ' selected' : '') + '>Square</option><option value="portrait"' + (media.aspect === 'portrait' ? ' selected' : '') + '>Portrait 4:5</option><option value="auto"' + (media.aspect === 'auto' ? ' selected' : '') + '>Original shape</option></select></div>' +
    '<p class="hint">Drag the dot to reposition the crop. This changes what stays in frame, never the stored photograph.</p>' +
    '<div class="actions"><button class="btn" id="pPick">Replace photo</button><button class="btn" id="pRemove" style="color:#a13b2b">Remove</button></div>';
}
function patchMedia(id, patch) {
  commit((doc) => {
    const screen = doc.screens.find((s) => s.id === state.screen); if (!screen) return doc;
    const node = screen.sections.find((s) => s.id === id); if (!node) return doc;
    if (patch === null) delete node.media;
    else node.media = Object.assign({}, node.media, patch);
    return doc;
  }, true);
}
function openMedia(targetId, catalogTarget, elementTarget, variantTarget) {
  state.mediaTarget = targetId || null;
  state.catalogTarget = catalogTarget || null;
  state.elementTarget = elementTarget || null;
  state.variantMediaTarget = variantTarget || null;
  if (catalogTarget || variantTarget) $('catalogModal').hidden = true;
  $('mediaSub').textContent = variantTarget ? 'Choose a photo for this option' : catalogTarget ? 'Choose a photo for this item' : elementTarget ? 'Choose a photo for this element' : targetId ? 'Choose a photo for this block' : 'Your image library';
  $('mediaModal').hidden = false;
  loadMedia();
}
function closeMedia() {
  const reopenCatalog = Boolean(state.catalogTarget || state.variantMediaTarget);
  $('mediaModal').hidden = true;
  state.mediaTarget = null; state.catalogTarget = null; state.elementTarget = null; state.variantMediaTarget = null; state.mediaReplaceId = null; state.mediaBusy = false; $('mediaStatus').textContent = '';
  if (reopenCatalog) $('catalogModal').hidden = false;
}
function loadMedia() {
  fetch('/api/projects/' + TOKEN + '/media').then((r) => r.json().then((payload) => { if (!r.ok) throw new Error('media'); return payload; })).then((payload) => {
    state.media = payload.media || [];
    state.mediaSuggestions = payload.suggestions || [];
    renderMedia(state.mediaSuggestions);
  }).catch(() => { $('mediaGrid').innerHTML = '<p class="empty">The media library could not be loaded. Check the local R2 binding.</p>'; });
}
function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  return value >= 1024 * 1024 ? (value / (1024 * 1024)).toFixed(1) + ' MB' : Math.max(1, Math.round(value / 1024)) + ' KB';
}
function mediaUsed(id) {
  let used = 0;
  state.doc.screens.forEach((screen) => screen.sections.forEach((node) => { if (node.media && node.media.id === id) used += 1; }));
  Object.values(state.doc.elements || {}).forEach((entry) => { if (entry.media && entry.media.id === id) used += 1; });
  CATALOG.forEach((section) => (section.items || []).forEach((item) => { if (item.media && item.media.id === id) used += 1; }));
  return used;
}
function renderMedia(suggestions) {
  const grid = $('mediaGrid');
  const query = state.mediaQuery.trim().toLowerCase();
  const list = state.media.filter((item) => {
    const name = String(item.alt || '').toLowerCase();
    if (query && name.indexOf(query) < 0 && item.id.indexOf(query) < 0) return false;
    const used = mediaUsed(item.id) > 0;
    if (state.mediaFilter === 'used' && !used) return false;
    if (state.mediaFilter === 'unused' && used) return false;
    return true;
  });
  grid.innerHTML = list.length ? list.map((item) => { const used = mediaUsed(item.id); return '<div class="media-item">' +
    '<img src="' + mediaSrc(item, 320) + '" alt="' + esc(item.alt || 'Uploaded image') + '" loading="lazy" decoding="async" />' +
    '<div class="meta"><b>' + esc(item.alt || 'Untitled photo') + '</b><span>' + item.width + ' × ' + item.height + ' · ' + formatBytes(item.bytes) + ' · WebP</span>' +
    (used ? '<span class="used">In use · ' + used + ' place' + (used === 1 ? '' : 's') + '</span>' : '') + '</div>' +
    '<div class="actions"><button class="btn" data-media-use="' + item.id + '">' + (state.mediaTarget || state.catalogTarget || state.elementTarget || state.variantMediaTarget ? 'Use photo' : 'Add to screen') + '</button><button class="btn" data-media-replace="' + item.id + '">Replace</button>' +
    (used ? '<button class="btn del" disabled title="Used in the app">In use</button>' : '<button class="btn del" data-media-delete="' + item.id + '">Delete</button>') + '</div></div>'; }).join('')
    : '<p class="empty">' + (state.media.length ? 'No photos match that search or filter.' : 'No photos yet. Upload one — it is resized to mobile widths automatically and never published at full resolution.') + '</p>';
  const suggestionsEl = $('mediaSuggestions');
  suggestionsEl.innerHTML = suggestions.length ? '<h3 style="font-size:10.5px;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);margin:0 0 7px">Where photos would help</h3><div class="suggestions">' +
    suggestions.map((entry) => '<div class="suggestion"><b>' + esc(entry.slot) + ' — ' + esc(entry.subject) + '</b><span>' + esc(entry.reason) + '</span></div>').join('') + '</div>' : '';
}
function applyMedia(record, nodeId) {
  if (state.catalogTarget) {
    const parts = state.catalogTarget.split(':').map(Number);
    const item = state.catalog[parts[0]] && state.catalog[parts[0]].items[parts[1]];
    if (item) {
      item.media = { id: record.id, width: record.width, height: record.height, alt: record.alt || item.name || '', focalX: record.focalX ?? 50, focalY: record.focalY ?? 50, fit: (item.media && item.media.fit) || 'cover' };
      closeMedia(); renderCatalog(); toast('Photo assigned. Save catalogue to publish.');
    } else closeMedia();
    return;
  }
  if (state.variantMediaTarget) {
    const parts = state.variantMediaTarget.split(':'); const index = parts.pop(); const target = parts.join(':'); const item = catalogItem(target);
    const variant = item && item.variants && item.variants[Number(index)];
    if (variant) {
      variant.media = { id: record.id, width: record.width, height: record.height, alt: record.alt || variant.name || '', focalX: record.focalX ?? 50, focalY: record.focalY ?? 50, fit: (variant.media && variant.media.fit) || 'cover' };
      closeMedia(); renderCatalog(); toast('Option photo assigned. Save catalogue to publish.');
    } else closeMedia();
    return;
  }
  if (state.elementTarget) {
    commit((doc) => {
      doc.elements = doc.elements || {};
      const key = state.elementTarget;
      doc.elements[key] = Object.assign({}, doc.elements[key], { media: { id: record.id, width: record.width, height: record.height, alt: record.alt || '', focalX: record.focalX ?? 50, focalY: record.focalY ?? 50, fit: (doc.elements[key] && doc.elements[key].media && doc.elements[key].media.fit) || 'cover' } });
      return doc;
    }, true);
    closeMedia(); toast('Element photo updated'); return;
  }
  commit((doc) => {
    const screen = doc.screens.find((s) => s.id === state.screen); if (!screen) return doc;
    let node = nodeId ? screen.sections.find((s) => s.id === nodeId) : screen.sections.find((s) => s.kind === 'image');
    if (!node) {
      let id = 'sec_image'; let index = 2; while (screen.sections.some((s) => s.id === id)) { id = 'sec_image_' + index; index += 1; }
      node = { id, kind: 'image', title: record.alt || 'Photo', style: {}, responsive: { hideOn: [] }, hidden: false };
      screen.sections.push(node);
    }
    node.media = { id: record.id, width: record.width, height: record.height, alt: record.alt || node.title || '', focalX: record.focalX ?? 50, focalY: record.focalY ?? 50, fit: (node.media && node.media.fit) || 'cover', aspect: (node.media && node.media.aspect) || 'wide' };
    state.selected = node.id;
    return doc;
  }, true);
  closeMedia(); toast('Photo added');
}
async function uploadPhoto(file) {
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return toast('Use a JPEG, PNG or WebP image.');
  if (file.size > 8 * 1024 * 1024) return toast('That image is larger than 8 MB.');
  state.mediaBusy = true; $('mediaStatus').textContent = 'Preparing mobile sizes…';
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file));
    if (bitmap.width * bitmap.height > 24_000_000) throw new Error('That image has too many pixels. Try a smaller photograph.');
    const widths = [...new Set([320, 640, 1280].map((width) => Math.min(width, bitmap.width)))].filter((width) => width > 0);
    const form = new FormData();
    form.append('file', file, file.name || 'photo');
    form.append('alt', '');
    const replaceId = state.mediaReplaceId;
    if (replaceId) {
      const previous = state.media.find((item) => item.id === replaceId);
      form.set('replace', replaceId);
      if (previous) { form.set('alt', previous.alt || ''); form.set('focalX', String(previous.focalX ?? 50)); form.set('focalY', String(previous.focalY ?? 50)); }
    }
    for (const width of widths) {
      const height = Math.max(1, Math.round((bitmap.height / bitmap.width) * width));
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d'); context.imageSmoothingQuality = 'high'; context.drawImage(bitmap, 0, 0, width, height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82));
      if (!blob) throw new Error('This browser could not prepare a WebP image.');
      form.append('variant', blob, width + '.webp');
    }
    if (bitmap.close) bitmap.close();
    $('mediaStatus').textContent = 'Uploading…';
    const response = await fetch('/api/projects/' + TOKEN + '/media', { method: 'POST', body: form });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error((payload.error && payload.error.message) || 'Upload failed.');
    $('mediaStatus').textContent = '';
    if (replaceId) { state.mediaReplaceId = null; await loadMedia(); toast('Photo replaced'); return; }
    if (state.catalogTarget) return applyMedia(payload.media, null);
    if (state.elementTarget) return applyMedia(payload.media, null);
    if (state.variantMediaTarget) return applyMedia(payload.media, null);
    if (state.mediaTarget) return applyMedia(payload.media, state.mediaTarget);
    await loadMedia(); toast('Photo uploaded');
  } catch (error) {
    $('mediaStatus').textContent = error && error.message ? error.message : 'Upload failed.';
  } finally { state.mediaBusy = false; }
}
function deleteMediaItem(id) {
  if (!confirm('Delete this photo? Images used by the app or a saved version cannot be deleted.')) return;
  fetch('/api/projects/' + TOKEN + '/media/' + id, { method: 'DELETE' }).then((response) => response.json().then((payload) => { if (!response.ok) throw new Error((payload.error && payload.error.message) || 'Could not delete.'); return payload; })).then(() => { toast('Photo deleted'); loadMedia(); }).catch((error) => toast(error.message));
}
function openCatalog() {
  state.catalog = clone(CATALOG); state.offers = clone(OFFERS);
  $('catalogStatus').textContent = 'Changes appear in the app after saving.';
  $('catalogModal').hidden = false; renderCatalog();
}
function closeCatalog() { $('catalogModal').hidden = true; }
function catalogItem(target) {
  const [section, item] = String(target).split(':').map(Number);
  return state.catalog[section] && state.catalog[section].items[item] ? state.catalog[section].items[item] : null;
}
function variantPanel(item, target) {
  const variants = item.variants || [];
  const groups = item.optionGroups || [];
  return '<div class="variant-panel" data-variant-panel="' + target + '">' +
    '<h4>Option groups</h4>' +
    (groups.length ? groups.map((group, index) => '<div class="variant-group">' +
      '<input data-vg-name="' + target + '" data-vg-prev="' + esc(group.name) + '" data-index="' + index + '" value="' + esc(group.name) + '" maxlength="24" aria-label="Option group name" placeholder="Size" />' +
      '<input data-vg-options="' + target + '" data-index="' + index + '" value="' + esc((group.options || []).join(', ')) + '" maxlength="400" aria-label="Option values" placeholder="Small, Medium, Large" />' +
      '<button class="x" data-vg-remove="' + target + '" data-index="' + index + '" title="Remove group">✕</button></div>').join('')
      : '<p class="hint" style="margin:0 0 7px">No groups yet. Groups name the choices; each combination below still has its own price and ID.</p>') +
    '<button class="cat-add" type="button" data-vg-add="' + target + '">+ Option group</button>' +
    '<h4 style="margin-top:14px">Variants · ' + variants.length + '</h4>' +
    (variants.length ? variants.map((variant, index) => {
      const selected = variant.selected === true;
      return '<div class="variant-row">' +
        '<button class="variant-vphoto" type="button" data-variant-photo="' + target + ':' + index + '" title="' + (variant.media ? 'Change photo' : 'Add photo') + '">' + (variant.media ? '<img src="' + mediaSrc(variant.media, 320) + '" alt="" />' : '📷') + '</button>' +
        '<input data-variant-field="name" data-target="' + target + '" data-index="' + index + '" value="' + esc(variant.name) + '" maxlength="40" aria-label="Variant name" placeholder="Name this combination" />' +
        '<input data-variant-field="price" data-target="' + target + '" data-index="' + index + '" type="number" min="0" step="0.01" value="' + (variant.price > 0 ? (variant.price / 100).toFixed(2) : '') + '" aria-label="Variant price" placeholder="Price" />' +
        '<span class="id" title="' + (variant.id ? 'Variant ID ' + esc(variant.id) : 'No ID') + '">' + esc(variant.currency || '') + '</span>' +
        '<span class="id" title="' + (variant.id ? 'Preserved ID: ' + esc(variant.id) : 'New option') + '">' + esc(variant.id || 'new') + '</span>' +
        '<input type="radio" name="default-' + target + '" data-variant-default="' + target + '" data-index="' + index + '" ' + (selected ? 'checked' : '') + ' aria-label="Default option" title="Default option" />' +
        '<label class="vv-avail" title="Available to order"><input type="checkbox" data-variant-available="' + target + '" data-index="' + index + '" ' + (variant.available === false ? '' : 'checked') + ' /> Live</label>' +
        '<button class="mv" type="button" data-variant-move="' + target + ':' + index + ':-1" title="Move up" ' + (index === 0 ? 'disabled' : '') + '>↑</button>' +
        '<button class="x" type="button" data-variant-remove="' + target + ':' + index + '" title="Delete variant">✕</button>' +
        (groups.length ? '<div class="variant-opts">' + groups.map((group) => '<label>' + esc(group.name || 'Option') +
          '<select data-variant-value="' + target + '" data-index="' + index + '" data-group="' + esc(group.name) + '"><option value="">Not set</option>' +
          (group.options || []).map((option) => '<option value="' + esc(option) + '"' + ((variant.values && variant.values[group.name]) === option ? ' selected' : '') + '>' + esc(option) + '</option>').join('') +
          '</select></label>').join('') + '</div>' : '') +
        '</div>';
    }).join('') : '<p class="hint" style="margin:0 0 7px">No variants. This product has one price.</p>') +
    '<div class="variant-foot"><button class="cat-add" type="button" data-variant-add="' + target + '">+ Add variant</button><p class="hint">Prices are in the shop currency. Default is what the product shows before the customer chooses. IDs are preserved, including Shopify IDs. Leave values unset rather than guessing a combination.</p></div>' +
    '</div>';
}
function renderCatalog() {
  const body = $('catalogBody');
  body.innerHTML = (state.catalog.length ? state.catalog.map((section, sectionIndex) => '<div class="cat-group">' +
    '<div class="cat-group-head"><input data-cat-section="' + sectionIndex + '" value="' + esc(section.name) + '" maxlength="40" aria-label="Category name" /><button class="cat-add" data-cat-add="' + sectionIndex + '">+ Item</button></div>' +
    ((section.items || []).length ? section.items.map((item, itemIndex) => {
      const target = sectionIndex + ':' + itemIndex;
      return '<div class="cat-row">' +
      '<button class="cat-photo" type="button" data-cat-photo="' + target + '" aria-label="' + (item.media ? 'Change photo for ' : 'Add photo for ') + esc(item.name || 'item') + '">' + (item.media ? '<img src="' + mediaSrc(item.media, 320) + '" alt="' + esc(item.media.alt || '') + '" loading="lazy" decoding="async" />' : '+') + '</button>' +
      '<input data-cat-field="menu" data-sec="' + sectionIndex + '" data-item="' + itemIndex + '" data-field="name" value="' + esc(item.name) + '" maxlength="60" placeholder="Name" aria-label="Item name" />' +
      '<input data-cat-field="menu" data-sec="' + sectionIndex + '" data-item="' + itemIndex + '" data-field="desc" value="' + esc(item.desc || '') + '" maxlength="120" placeholder="Short description" aria-label="Item description" />' +
      '<input data-cat-field="menu" data-sec="' + sectionIndex + '" data-item="' + itemIndex + '" data-field="price" type="number" min="0" step="0.01" value="' + ((item.price || 0) / 100).toFixed(2) + '" aria-label="Price" />' +
      '<button class="x" data-cat-remove="' + target + '" title="Remove item">✕</button></div>' +
      '<div class="variant-bar"><button type="button" data-cat-options="' + target + '">Options: ' + ((item.variants || []).length) + '</button><span>' + ((item.optionGroups || []).map((group) => esc(group.name)).join(' · ') || 'No option groups') + '</span></div>' +
      (state.variantTarget === target ? variantPanel(item, target) : '') +
      (item.media ? '<div class="cat-media" data-cat-media="' + target + '">' +
        '<div class="field"><label>Describe the photo</label><input data-cat-media="' + target + '" data-field="alt" maxlength="120" value="' + esc(item.media.alt || '') + '" placeholder="What is in this image?" /></div>' +
        '<div class="field"><label>Crop focus</label><input type="range" min="0" max="100" value="' + (item.media.focalX ?? 50) + '" data-cat-media="' + target + '" data-field="focalX" aria-label="Horizontal crop focus" /><input type="range" min="0" max="100" value="' + (item.media.focalY ?? 50) + '" data-cat-media="' + target + '" data-field="focalY" aria-label="Vertical crop focus" /></div>' +
        '<div class="field"><label>Fitting</label><select data-cat-media="' + target + '" data-field="fit"><option value="cover"' + (item.media.fit !== 'contain' ? ' selected' : '') + '>Crop to fill</option><option value="contain"' + (item.media.fit === 'contain' ? ' selected' : '') + '>Fit whole image</option></select></div>' +
        '<button class="cat-remove-photo" data-cat-media-remove="' + target + '">Remove photo</button>' +
        '<p class="hint">Horizontal and vertical sliders move the crop. The stored photograph is never changed.</p></div>' : '') +
      // A photograph the source site published has no media record, so it needs
      // its own fitting control: a tall packshot cropped to a square tile can
      // show nothing but its background.
      (item.image && !item.media ? '<div class="cat-media">' +
        '<div class="field"><label>Site photograph</label><select data-cat-image="' + target + '" data-field="fit"><option value="contain"' + (item.image.fit !== 'cover' ? ' selected' : '') + '>Fit the whole image</option><option value="cover"' + (item.image.fit === 'cover' ? ' selected' : '') + '>Crop to fill</option></select></div>' +
        '<div class="field"><label>Crop centre</label><input type="range" min="0" max="100" value="' + (item.image.positionX ?? 50) + '" data-cat-image="' + target + '" data-field="positionX" aria-label="Horizontal crop centre" /><input type="range" min="0" max="100" value="' + (item.image.positionY ?? 50) + '" data-cat-image="' + target + '" data-field="positionY" aria-label="Vertical crop centre" /></div>' +
        '<p class="hint">The image the site published for this item. Upload a photo above to replace it.</p></div>' : '')
    }).join('')
      : '<p class="hint">No items yet. Add the first one.</p>') + '</div>').join('')
    : '<p class="empty">No catalogue categories yet. Add one and fill in your real products or services.</p>') +
    '<button class="cat-add" data-cat-add-section="1">+ Add category</button>' +
    '<h3 class="cat-section-title">Offers</h3>' +
    (state.offers.length ? state.offers.map((offer, index) => '<div class="cat-offer"><input data-offer="' + index + '" data-field="title" value="' + esc(offer.title) + '" maxlength="60" placeholder="Offer title" aria-label="Offer title" /><input data-offer="' + index + '" data-field="body" value="' + esc(offer.body) + '" maxlength="160" placeholder="What the customer gets" aria-label="Offer details" /><button class="x" data-offer-remove="' + index + '" title="Remove offer">✕</button></div>').join('')
      : '<p class="hint">No offers. Leave this empty rather than promising something you cannot honour.</p>') +
    '<button class="cat-add" data-offer-add="1" style="margin-top:6px">+ Add offer</button>';
}
function catalogInput(event) {
  const input = event.target;
  if (input.dataset.catSection !== undefined) { state.catalog[Number(input.dataset.catSection)].name = input.value; return; }
  if (input.dataset.catMedia) {
    const [section, item] = input.dataset.catMedia.split(':').map(Number);
    const target = state.catalog[section] && state.catalog[section].items[item];
    if (!target || !target.media) return;
    if (input.dataset.field === 'focalX' || input.dataset.field === 'focalY') target.media[input.dataset.field] = Math.max(0, Math.min(100, Math.round(Number(input.value || 50))));
    else target.media[input.dataset.field] = input.value;
    return;
  }
  if (input.dataset.catImage) {
    const [section, item] = input.dataset.catImage.split(':').map(Number);
    const target = state.catalog[section] && state.catalog[section].items[item];
    if (!target || !target.image) return;
    if (input.dataset.field === 'positionX' || input.dataset.field === 'positionY') target.image[input.dataset.field] = Math.max(0, Math.min(100, Math.round(Number(input.value || 50))));
    else target.image[input.dataset.field] = input.value;
    return;
  }
  if (input.dataset.variantField) {
    const item = catalogItem(input.dataset.target); const variant = item && item.variants && item.variants[Number(input.dataset.index)];
    if (!variant) return;
    if (input.dataset.variantField === 'price') variant.price = Math.max(0, Math.round(Number(input.value || 0) * 100));
    else variant.name = input.value.slice(0, 40);
    return;
  }
  if (input.dataset.variantValue !== undefined) {
    const item = catalogItem(input.dataset.variantValue); const variant = item && item.variants && item.variants[Number(input.dataset.index)];
    if (!variant) return;
    variant.values = Object.assign({}, variant.values);
    if (input.value) variant.values[input.dataset.group] = input.value; else delete variant.values[input.dataset.group];
    if (!Object.keys(variant.values).length) delete variant.values;
    return;
  }
  if (input.dataset.variantAvailable !== undefined) {
    const item = catalogItem(input.dataset.variantAvailable); const variant = item && item.variants && item.variants[Number(input.dataset.index)];
    if (!variant) return;
    if (input.checked) delete variant.available; else variant.available = false;
    return;
  }
  if (input.dataset.vgName !== undefined || input.dataset.vgOptions !== undefined) {
    const item = catalogItem(input.dataset.vgName || input.dataset.vgOptions); if (!item) return;
    const group = item.optionGroups && item.optionGroups[Number(input.dataset.index)]; if (!group) return;
    if (input.dataset.vgName !== undefined) {
      const previous = input.dataset.vgPrev || group.name;
      const next = input.value.slice(0, 24);
      group.name = next;
      if (previous && previous !== next) {
        (item.variants || []).forEach((variant) => {
          if (!variant.values || !Object.prototype.hasOwnProperty.call(variant.values, previous)) return;
          variant.values[next] = variant.values[previous];
          delete variant.values[previous];
        });
      }
      input.dataset.vgPrev = next;
    } else {
      group.options = input.value.split(',').map((value) => value.trim()).filter(Boolean).slice(0, 20).map((value) => value.slice(0, 30));
    }
    return;
  }
  if (input.dataset.variantDefault !== undefined) {
    const item = catalogItem(input.dataset.variantDefault); if (!item || !item.variants) return;
    item.variants.forEach((variant, index) => { if (index === Number(input.dataset.index)) variant.selected = true; else delete variant.selected; });
    renderCatalog(); return;
  }
  if (input.dataset.catField === 'menu') {
    const item = state.catalog[Number(input.dataset.sec)]?.items[Number(input.dataset.item)]; if (!item) return;
    if (input.dataset.field === 'price') item.price = Math.max(0, Math.round(Number(input.value || 0) * 100));
    else item[input.dataset.field] = input.value;
    return;
  }
  if (input.dataset.offer !== undefined) {
    const offer = state.offers[Number(input.dataset.offer)]; if (offer) offer[input.dataset.field] = input.value;
  }
}
function saveCatalog() {
  $('catalogStatus').textContent = 'Saving…';
  fetch('/api/projects/' + TOKEN + '/catalog', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ menu: state.catalog, offers: state.offers }) })
    .then((response) => response.json().then((payload) => { if (!response.ok) throw new Error((payload.error && payload.error.message) || 'Could not save the catalogue.'); return payload; }))
    .then((payload) => { state.catalog = payload.menu; state.offers = payload.offers; CATALOG.splice(0, CATALOG.length, ...payload.menu); OFFERS.splice(0, OFFERS.length, ...payload.offers); closeCatalog(); toast('Catalogue saved'); reloadFrame(); })
    .catch((error) => { $('catalogStatus').textContent = error.message; });
}
function renderHistory() {
  $('selectionLabel').textContent = 'Versions';
  $('inspector').innerHTML = '<div class="sec"><p class="hint">Loading saved versions…</p></div>';
  fetch('/api/projects/' + TOKEN + '/doc/versions').then((r) => r.json()).then((payload) => {
    const versions = payload.versions || [];
    $('inspector').innerHTML = '<div class="sec"><h3>Saved versions</h3>' +
      (versions.length ? '<div class="versions">' + versions.map((v) => '<div class="version"><b>' + new Date(v.createdAt).toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) + '</b><button class="btn small" data-restore="' + v.id + '">Restore</button></div>').join('') + '</div>'
        : '<p class="empty">No earlier versions yet. Versions are kept as you edit, at most one a minute.</p>') +
      '<p class="hint">Up to 20 designs are kept. Restoring is itself undoable for this session.</p></div>';
  }).catch(() => toast('Could not load versions.'));
}
function restoreVersion(versionId) {
  fetch('/api/projects/' + TOKEN + '/doc/versions/' + versionId + '/restore', { method:'POST' })
    .then((response) => response.json().then((payload) => { if (!response.ok) throw new Error('restore'); return payload; }))
    .then((payload) => {
      historyPush(clone(state.doc)); state.doc = payload.doc; state.historyMode = false; state.selected = null;
      const home = state.doc.screens[0]; state.screen = home.id;
      render(); save(); reloadFrame(); toast('Version restored');
    })
    .catch(() => toast('Could not restore that version.'));
}
function moveComponentTo(screenId, nodeId) {
  commit((doc) => {
    const from = doc.screens.find((s) => s.id === state.screen);
    const to = doc.screens.find((s) => s.id === screenId);
    if (!from || !to) return doc;
    const node = from.sections.find((s) => s.id === nodeId);
    if (!node || node.kind === 'hero') return doc;
    from.sections = from.sections.filter((s) => s.id !== nodeId);
    let id = node.id; let index = 2; while (to.sections.some((s) => s.id === id)) { id = node.id + '_' + index; index += 1; }
    node.id = id; to.sections.push(node);
    state.screen = screenId; state.selected = id;
    return doc;
  }, true);
}
function addComponent(kind) {
  commit((doc) => {
    const screen = doc.screens.find((s) => s.id === state.screen); if (!screen) return doc;
    if (screen.sections.some((s) => s.kind === kind)) return doc;
    const id = 'sec_' + kind + '_' + Date.now().toString(36);
    const preset = kind === 'heading' ? { title: 'A new heading' } : kind === 'text' ? { text: 'A short paragraph that explains this screen.' } : kind === 'button' ? { title: 'Continue', cta: { label: 'Continue', screen: 'scr_home' } } : {};
    screen.sections.push({ id, kind, style: {}, responsive: { hideOn: [] }, hidden: false, ...preset });
    state.selected = id;
    return doc;
  }, true);
}
function addScreen(kind) {
  commit((doc) => {
    if (kind !== 'custom' && doc.screens.some((s) => s.kind === kind)) return doc;
    let id = 'scr_' + kind; let index = 2; while (doc.screens.some((s) => s.id === id)) { id = 'scr_' + kind + '_' + index; index += 1; }
    const defaults = {
      contact: [{ id:'sec_heading', kind:'heading', title:'Get in touch', style:{}, responsive:{hideOn:[]}, hidden:false }, { id:'sec_text', kind:'text', text:'Add your address, opening hours and a message here.', style:{}, responsive:{hideOn:[]}, hidden:false }, { id:'sec_visit', kind:'visit', title:'Opening hours', style:{}, responsive:{hideOn:[]}, hidden:false }, { id:'sec_form', kind:'form', title:'Send a message', style:{}, responsive:{hideOn:[]}, hidden:false }],
      about: [{ id:'sec_heading', kind:'heading', title:'Our story', style:{}, responsive:{hideOn:[]}, hidden:false }, { id:'sec_text', kind:'text', text:'Tell customers what makes this business different.', style:{}, responsive:{hideOn:[]}, hidden:false }],
      profile: [{ id:'sec_heading', kind:'heading', title:'Your account', style:{}, responsive:{hideOn:[]}, hidden:false }, { id:'sec_text', kind:'text', text:'Orders, bookings and saved items appear here.', style:{}, responsive:{hideOn:[]}, hidden:false }],
      custom: [{ id:'sec_heading', kind:'heading', title:'New screen', style:{}, responsive:{hideOn:[]}, hidden:false }]
    };
    const used = new Set(doc.screens.flatMap((s) => s.sections.map((section) => section.id)));
    const sections = (defaults[kind] || []).map((section) => {
      let sectionId = section.id;
      if (used.has(sectionId)) {
        sectionId = id + '_' + section.id;
        let suffix = 2;
        while (used.has(sectionId)) { sectionId = id + '_' + section.id + '_' + suffix; suffix += 1; }
      }
      used.add(sectionId);
      return Object.assign({}, section, { id: sectionId });
    });
    doc.screens.push({ id, kind, name: kind === 'custom' ? 'New screen' : kind[0].toUpperCase() + kind.slice(1), icon: kind === 'contact' ? 'phone' : 'dots', nav: kind !== 'custom', hidden: false, sections });
    state.screen = id; state.selected = null;
    return doc;
  }, true);
}
function duplicateScreen(id) {
  commit((doc) => {
    const index = doc.screens.findIndex((s) => s.id === id); if (index < 0) return doc;
    const source = doc.screens[index]; if (source.kind === 'home') return doc;
    let newId = 'scr_custom'; let n = 2; while (doc.screens.some((s) => s.id === newId)) { newId = 'scr_custom_' + n; n += 1; }
    const used = new Set(doc.screens.flatMap((s) => s.sections.map((section) => section.id)));
    const shared = new Set(doc.screens.filter((s) => s.id !== id).flatMap((s) => s.sections.map((section) => section.id)));
    const sectionMap = new Map();
    const sections = source.sections.map((section) => {
      let next = section.id + '_copy'; let suffix = 2;
      while (used.has(next)) { next = section.id + '_copy_' + suffix; suffix += 1; }
      used.add(next); sectionMap.set(section.id, next);
      return Object.assign(clone(section), { id: next });
    });
    doc.screens.splice(index + 1, 0, Object.assign(clone(source), { id: newId, kind: 'custom', name: (source.name + ' copy').slice(0,24), nav: false, sections }));
    sectionMap.forEach((to, from) => { if (!shared.has(from)) remapSectionElements(doc, from, to); });
    state.screen = newId; state.selected = null;
    return doc;
  }, true);
}
function removeScreen(id) {
  commit((doc) => {
    const screen = doc.screens.find((s) => s.id === id); if (!screen || screen.kind === 'home') return doc;
    const remaining = new Set(doc.screens.filter((s) => s.id !== id).flatMap((s) => s.sections.map((section) => section.id)));
    screen.sections.forEach((section) => { if (!remaining.has(section.id)) dropSectionElements(doc, section.id); });
    doc.screens = doc.screens.filter((s) => s.id !== id);
    if (!doc.screens.some((s) => s.id === doc.initialScreen)) doc.initialScreen = doc.screens[0].id;
    if (state.screen === id) { state.screen = doc.screens[0].id; state.selected = null; }
    return doc;
  }, true);
}
document.addEventListener('click', (event) => {
  const mediaUse = event.target.closest('[data-media-use]'); if (mediaUse) { const record = state.media.find((item) => item.id === mediaUse.dataset.mediaUse); if (record) applyMedia(record, state.mediaTarget); return; }
  const mediaReplace = event.target.closest('[data-media-replace]'); if (mediaReplace) { state.mediaReplaceId = mediaReplace.dataset.mediaReplace; $('mediaReplaceFile').click(); return; }
  const mediaDelete = event.target.closest('[data-media-delete]'); if (mediaDelete) { deleteMediaItem(mediaDelete.dataset.mediaDelete); return; }
  const screenAdd = event.target.closest('[data-add-screen]'); if (screenAdd) { addScreen(screenAdd.dataset.addScreen); return; }
  const componentAdd = event.target.closest('[data-add-component]'); if (componentAdd) { addComponent(componentAdd.dataset.addComponent); return; }
  const open = event.target.closest('[data-open]'); if (open) { state.screen = open.dataset.open; state.selected = null; state.element = null; state.elementMeta = null; render(); reloadFrame(); return; }
  const del = event.target.closest('[data-screen-delete]'); if (del) { if (confirm('Delete this screen?')) removeScreen(del.dataset.screenDelete); return; }
  const element = event.target.closest('[data-element]'); if (element) { selectElement(element.dataset.element); return; }
  const select = event.target.closest('[data-select]'); if (select) { state.selected = select.dataset.select; state.element = null; state.elementMeta = null; render(); return; }
  const hide = event.target.closest('[data-hide]'); if (hide) { commit((doc) => { const screen = doc.screens.find((s) => s.id === state.screen); const node = screen && screen.sections.find((s) => s.id === hide.dataset.hide); if (node) { node.hidden = !node.hidden; if (!node.hidden) delete node.hiddenBecause; } return doc; }, true); return; }
  const copyComponentButton = event.target.closest('[data-copy-component]'); if (copyComponentButton) { copyComponent(copyComponentButton.dataset.copyComponent); renderLibrary(); return; }
  const pasteComponentButton = event.target.closest('[data-paste-component]'); if (pasteComponentButton) { pasteComponent(); return; }
  const dup = event.target.closest('[data-duplicate]'); if (dup) {
    const screen = current(); const index = screen.sections.findIndex((s) => s.id === dup.dataset.duplicate);
    const source = screen.sections[index];
    if (!source || source.kind === 'hero') return;
    const id = uniqueSectionId(screen, source.id + '_' + Date.now().toString(36));
    commit((doc) => {
      const target = doc.screens.find((s) => s.id === state.screen); if (!target) return doc;
      const at = target.sections.findIndex((s) => s.id === source.id); if (at < 0) return doc;
      const cloneNode = Object.assign(clone(source), { id });
      target.sections.splice(at + 1, 0, cloneNode);
      remapSectionElements(doc, source.id, id);
      state.selected = id; state.element = null;
      return doc;
    }, true);
    return;
  }
  const restore = event.target.closest('[data-restore]'); if (restore) { restoreVersion(restore.dataset.restore); return; }
  const remove = event.target.closest('[data-delete]'); if (remove) { if (!confirm('Delete this component?')) return; commit((doc) => { const screen = doc.screens.find((s) => s.id === state.screen); if (screen) { screen.sections = screen.sections.filter((s) => s.id !== remove.dataset.delete); dropSectionElements(doc, remove.dataset.delete); } return doc; }, true); if (state.selected === remove.dataset.delete) state.selected = null; render(); }
});
window.addEventListener('message', (event) => {
  const message = event.data;
  if (!message || message.source !== 'plattr-canvas') return;
  if (message.type === 'select') { state.selected = message.id; state.element = null; state.elementMeta = null; quickShown = null; render(); }
  if (message.type === 'element') { state.selected = message.id || null; state.element = message.key; state.elementMeta = message; quickShown = null; render(); }
  if (message.type === 'move') commit((doc) => moveComponent(doc, state.screen, message.id, message.before), true);
  if (message.type === 'screen') { const screen = state.doc.screens.find((s) => appId(s) === message.id); if (screen) { state.screen = screen.id; state.selected = null; quickShown = null; render(); } }
});
frame.addEventListener('load', () => {
  setTimeout(() => {
    try { if (state.element) frame.contentWindow.postMessage({ source: 'plattr-editor', type: 'element', key: state.element }, '*'); else if (state.selected) frame.contentWindow.postMessage({ source: 'plattr-editor', type: 'select', id: state.selected }, '*'); } catch (error) {}
    renderElements();
  }, 120);
});
$('quickClose').addEventListener('click', () => { state.selected = null; quickShown = null; render(); });
$('quickTitle').addEventListener('input', (event) => commit((doc) => patchNode(doc, state.selected, { title: event.target.value }), true));
$('quickText').addEventListener('input', (event) => commit((doc) => patchNode(doc, state.selected, { text: event.target.value }), true));
$('quickCta').addEventListener('input', (event) => {
  const node = component(); if (!node || !node.cta) return;
  commit((doc) => patchNode(doc, state.selected, { cta: { label: event.target.value, screen: node.cta.screen } }), true);
});
$('quickTarget').addEventListener('change', (event) => {
  const node = component(); if (!node || !node.cta) return;
  commit((doc) => patchNode(doc, state.selected, { cta: { label: node.cta.label, screen: event.target.value } }), true);
});
$('quickColor').addEventListener('change', (event) => commit((doc) => patchNode(doc, state.selected, { style: { color: event.target.value || undefined } }), true));
document.addEventListener('click', (event) => {
  const background = event.target.closest('[data-quick-bg]');
  if (background) {
    const node = component(); if (!node) return;
    commit((doc) => patchNode(doc, state.selected, { style: { background: background.dataset.quickBg || undefined } }), true);
    return;
  }
  const action = event.target.closest('[data-quick]'); if (!action) return;
  const node = component(); if (!node) return;
  const kind = action.dataset.quick;
  if (kind === 'photo') { openMedia(node.id); return; }
  if (kind === 'catalog') { openCatalog(); return; }
  if (kind === 'more') { $('right').classList.add('open'); return; }
  if (kind === 'duplicate') {
    const id = uniqueSectionId(current(), node.id + '_' + Date.now().toString(36));
    commit((doc) => {
      const screen = doc.screens.find((s) => s.id === state.screen); if (!screen) return doc;
      const index = screen.sections.findIndex((s) => s.id === node.id); if (index < 0) return doc;
      const copy = clone(screen.sections[index]); copy.id = id; screen.sections.splice(index + 1, 0, copy);
      remapSectionElements(doc, node.id, id);
      return doc;
    }, true);
    state.selected = id; quickShown = null; render(); toast('Component duplicated'); return;
  }
  if (kind === 'delete') {
    if (!confirm('Delete this component?')) return;
    commit((doc) => { const screen = doc.screens.find((s) => s.id === state.screen); if (screen) { screen.sections = screen.sections.filter((s) => s.id !== node.id); dropSectionElements(doc, node.id); } return doc; }, true);
    state.selected = null; quickShown = null; render(); return;
  }
  if (kind === 'hide') {
    commit((doc) => { const screen = doc.screens.find((s) => s.id === state.screen); const hit = screen && screen.sections.find((s) => s.id === node.id);     if (hit) { hit.hidden = !hit.hidden; if (!hit.hidden) delete hit.hiddenBecause; } return doc; }, true);
    if (!node.hidden) { state.selected = null; quickShown = null; render(); toast('Hidden — show it again from This screen'); }
    return;
  }
  if (kind === 'up' || kind === 'down') {
    commit((doc) => {
      const screen = doc.screens.find((s) => s.id === state.screen); if (!screen) return doc;
      const index = screen.sections.findIndex((s) => s.id === node.id); const next = index + (kind === 'up' ? -1 : 1);
      if (index < 0 || next < 0 || next >= screen.sections.length) return doc;
      const [moving] = screen.sections.splice(index, 1); screen.sections.splice(next, 0, moving); return doc;
    }, true);
  }
});
$('undo').addEventListener('click', undo);
$('redo').addEventListener('click', redo);
document.addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); } });
document.querySelectorAll('[data-device]').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('[data-device]').forEach((other) => other.classList.toggle('on', other === button));
  state.device = button.dataset.device;
  $('phone').className = 'phone ' + state.device;
  fitPreview();
}));
$('mediaBtn').addEventListener('click', () => openMedia(null));
$('mediaClose').addEventListener('click', closeMedia);
$('mediaModal').addEventListener('click', (event) => { if (event.target === $('mediaModal')) closeMedia(); });
$('mediaSearch').addEventListener('input', (event) => { state.mediaQuery = event.target.value; renderMedia(state.mediaSuggestions); });
$('mediaFilter').addEventListener('change', (event) => { state.mediaFilter = event.target.value; renderMedia(state.mediaSuggestions); });
$('mediaFile').addEventListener('change', (event) => { const file = event.target.files && event.target.files[0]; event.target.value = ''; if (file) uploadPhoto(file); });
$('mediaFile').addEventListener('click', () => { state.mediaReplaceId = null; });
$('mediaReplaceFile').addEventListener('change', (event) => { const file = event.target.files && event.target.files[0]; event.target.value = ''; if (file) uploadPhoto(file); else state.mediaReplaceId = null; });
$('catalogBtn').addEventListener('click', openCatalog);
if ($('sampleEdit')) $('sampleEdit').addEventListener('click', openCatalog);
$('catalogClose').addEventListener('click', closeCatalog);
$('catalogModal').addEventListener('click', (event) => { if (event.target === $('catalogModal')) closeCatalog(); });
$('catalogSave').addEventListener('click', saveCatalog);
$('catalogBody').addEventListener('input', catalogInput);
// Rebuild the per-variant selects after a group edit so newly added values can
// be assigned without closing and reopening the panel. Editing itself still
// happens on input, so typing never loses the caret.
$('catalogBody').addEventListener('change', (event) => {
  if (!event.target.matches('[data-vg-name], [data-vg-options]')) return;
  if (event.target.matches('[data-vg-options]')) {
    const item = catalogItem(event.target.dataset.vgOptions);
    const group = item && item.optionGroups && item.optionGroups[Number(event.target.dataset.index)];
    // Prune now that the owner has finished the list, never mid-keystroke.
    if (group) (item.variants || []).forEach((variant) => {
      if (variant.values && variant.values[group.name] && !group.options.includes(variant.values[group.name])) delete variant.values[group.name];
    });
  }
  renderCatalog();
});
$('catalogBody').addEventListener('click', (event) => {
  const photo = event.target.closest('[data-cat-photo]');
  if (photo) { openMedia(null, photo.dataset.catPhoto); return; }
  const removePhoto = event.target.closest('[data-cat-media-remove]');
  if (removePhoto) { const [section, item] = removePhoto.dataset.catMediaRemove.split(':').map(Number); const target = state.catalog[section] && state.catalog[section].items[item]; if (target) delete target.media; renderCatalog(); return; }
  const addItem = event.target.closest('[data-cat-add]');
  if (addItem) { state.catalog[Number(addItem.dataset.catAdd)].items.push({ name: '', desc: '', price: 0 }); renderCatalog(); return; }
  const addSection = event.target.closest('[data-cat-add-section]');
  if (addSection) { state.catalog.push({ name: 'New category', items: [{ name: '', desc: '', price: 0 }] }); renderCatalog(); return; }
  const remove = event.target.closest('[data-cat-remove]');
  if (remove) { const [section, item] = remove.dataset.catRemove.split(':').map(Number); state.catalog[section].items.splice(item, 1); renderCatalog(); return; }
  const options = event.target.closest('[data-cat-options]');
  if (options) { state.variantTarget = state.variantTarget === options.dataset.catOptions ? null : options.dataset.catOptions; renderCatalog(); return; }
  const addVariant = event.target.closest('[data-variant-add]');
  if (addVariant) {
    const item = catalogItem(addVariant.dataset.variantAdd); if (!item) return;
    item.variants = item.variants || [];
    // A new combination starts blank: the owner names it, prices it and picks
    // its values. The editor never fills those in from the product or a sibling.
    item.variants.push({ id: 'var_' + Date.now().toString(36), name: '', price: 0 });
    renderCatalog(); return;
  }
  const removeVariant = event.target.closest('[data-variant-remove]');
  if (removeVariant) {
    const parts = removeVariant.dataset.variantRemove.split(':'); const index = parts.pop(); const target = parts.join(':'); const item = catalogItem(target); if (!item || !item.variants) return;
    const removed = item.variants.splice(Number(index), 1)[0];
    if (removed && removed.selected && item.variants.length) item.variants[0].selected = true;
    renderCatalog(); return;
  }
  const moveVariant = event.target.closest('[data-variant-move]');
  if (moveVariant) {
    const parts = moveVariant.dataset.variantMove.split(':'); const delta = parts.pop(); const index = parts.pop(); const target = parts.join(':'); const item = catalogItem(target); if (!item || !item.variants) return;
    const from = Number(index); const to = from + Number(delta);
    if (to < 0 || to >= item.variants.length) return;
    const [moving] = item.variants.splice(from, 1); item.variants.splice(to, 0, moving); renderCatalog(); return;
  }
  const variantPhoto = event.target.closest('[data-variant-photo]');
  if (variantPhoto) { openMedia(null, null, null, variantPhoto.dataset.variantPhoto); return; }
  const addGroup = event.target.closest('[data-vg-add]');
  if (addGroup) { const item = catalogItem(addGroup.dataset.vgAdd); if (!item) return; item.optionGroups = item.optionGroups || []; item.optionGroups.push({ name: '', options: [] }); renderCatalog(); return; }
  const removeGroup = event.target.closest('[data-vg-remove]');
  if (removeGroup) {
    const item = catalogItem(removeGroup.dataset.vgRemove); if (!item || !item.optionGroups) return;
    const [removed] = item.optionGroups.splice(Number(removeGroup.dataset.index), 1);
    if (removed) (item.variants || []).forEach((variant) => { if (variant.values) delete variant.values[removed.name]; });
    renderCatalog(); return;
  }
  const addOffer = event.target.closest('[data-offer-add]');
  if (addOffer) { state.offers.push({ title: '', body: '' }); renderCatalog(); return; }
  const removeOffer = event.target.closest('[data-offer-remove]');
  if (removeOffer) { state.offers.splice(Number(removeOffer.dataset.offerRemove), 1); renderCatalog(); }
});
$('history').addEventListener('click', () => { state.historyMode = !state.historyMode; if (state.historyMode) state.selected = null; render(); $('right').classList.add('open'); });
$('panelLeft').addEventListener('click', () => $('left').classList.toggle('open'));
$('panelRight').addEventListener('click', () => $('right').classList.toggle('open'));
let proposal = null;
$('aiRun').addEventListener('click', () => {
  const command = $('aiCommand').value.trim(); if (!command) return;
  $('aiRun').disabled = true;
  fetch('/api/projects/' + TOKEN + '/doc/ai', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ command, doc: state.doc }) })
    .then((response) => response.json().then((payload) => { if (!response.ok) throw new Error((payload.error && payload.error.message) || 'AI'); proposal = payload.doc; $('aiSummary').textContent = payload.summary; $('aiBar').classList.add('on'); }))
    .catch(() => toast('Could not preview that change.'))
    .finally(() => { $('aiRun').disabled = false; });
});
$('aiDiscard').addEventListener('click', () => { proposal = null; $('aiBar').classList.remove('on'); });
$('aiApply').addEventListener('click', () => {
  if (!proposal) return;
  const before = clone(state.doc); historyPush(before); state.doc = proposal; proposal = null;
  $('aiBar').classList.remove('on'); render(); scheduleSave(); reloadFrame(); toast('Change applied');
});
$('aiCommand').addEventListener('keydown', (event) => { if (event.key === 'Enter') $('aiRun').click(); });
render();
fitPreview();
addEventListener('resize', fitPreview);
if (typeof ResizeObserver !== 'undefined' && document.querySelector('.canvas')) new ResizeObserver(fitPreview).observe(document.querySelector('.canvas'));
if (!HAS_SAVED) save().then(reloadFrame);
</script>
</body>
</html>`
}
