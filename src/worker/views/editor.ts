import type { Doc } from '../doc'
import type { Project } from '../db'
import { esc } from './shell'

/*
 * The visual editor for a mobile application: screens and navigation on the
 * left, a phone canvas in the middle, properties on the right. Every change
 * posts the whole shared document; the server normalises it, and both this
 * preview and the published PWA render from it.
 */
export function editorPage(options: { project: Project; doc: Doc; origin: string }): string {
  const { project, doc, origin } = options
  const token = project.token
  const json = JSON.stringify(doc).replace(/</g, '\\u003c')
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
.stage { display: flex; flex-direction: column; min-width: 0; background: #eceae4; }
.stagebar { height: 42px; display: flex; align-items: center; gap: 8px; padding: 0 12px; border-bottom: 1px solid var(--line); background: rgba(255,255,255,.55); }
.ai { display: flex; align-items: center; gap: 8px; margin-left: auto; width: min(430px, 52%); }
.ai input { flex: 1; min-width: 0; border: 1px solid var(--line); background: #fff; border-radius: 999px; padding: 7px 12px; outline: none; }
.ai input:focus { border-color: var(--accent); }
.canvas { flex: 1; overflow: auto; display: flex; align-items: center; justify-content: center; padding: 22px; }
.phone { position: relative; width: 390px; height: 780px; max-height: 100%; background: #0d0c0a; border-radius: 48px; padding: 9px; box-shadow: 0 30px 70px -34px rgba(25,23,19,.65), inset 0 0 0 2px #2a2824; transition: width .2s ease, height .2s ease; }
.phone::after { content: ''; position: absolute; top: 9px; left: 50%; transform: translateX(-50%); width: 118px; height: 24px; background: #0d0c0a; border-radius: 0 0 16px 16px; z-index: 2; pointer-events: none; }
.phone iframe { width: 100%; height: 100%; border: 0; border-radius: 39px; background: #fff; display: block; }
.phone.tablet { width: 820px; height: 640px; border-radius: 30px; padding: 7px; }
.phone.tablet iframe { border-radius: 24px; }
.phone.desktop { width: 100%; max-width: 1180px; height: 100%; border-radius: 18px; padding: 5px; }
.phone.desktop iframe { border-radius: 14px; }
.aibar { display: none; align-items: center; gap: 10px; padding: 9px 14px; border-bottom: 1px solid var(--line); background: #fff8ec; }
.aibar.on { display: flex; }
.aibar p { flex: 1; margin: 0; font-size: 12px; }
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
  .phone.desktop { width: 100%; }
}
@media (max-width: 900px) {
  .bar { gap: 6px; padding: 0 9px; }
  .brand span { display: none; }
  .brand b { max-width: 96px; }
  .bar .ghost, #openApp { display: none; }
  .seg button { padding: 5px 7px; font-size: 11px; }
}
@media (max-width: 760px) {
  .layout { grid-template-columns: minmax(0, 1fr); }
  .panel.left { position: fixed; left: 0; top: 56px; bottom: 0; width: 252px; z-index: 10; transform: translateX(-100%); transition: transform .18s; box-shadow: 20px 0 50px -30px rgba(0,0,0,.4); }
  .panel.left.open { transform: none; }
  .brand b { max-width: 110px; }
  .ai { display: none; }
  .canvas { padding: 10px; }
  .phone, .phone.tablet, .phone.desktop { width: 100%; height: 100%; border-radius: 24px; padding: 5px; }
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
  <button class="iconbtn" id="history" title="Version history" aria-label="Version history">⟲</button>
  <button class="iconbtn" id="panelRight" title="Properties" aria-label="Properties">⚙</button>
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
    <div class="aibar" id="aiBar">
      <p id="aiSummary"></p>
      <button class="btn" id="aiDiscard">Discard</button>
      <button class="btn primary" id="aiApply">Apply</button>
    </div>
    <div class="canvas">
      <div class="phone mobile" id="phone">
        <iframe id="frame" title="Live application preview" src="/p/${esc(token)}/app?editor=1"></iframe>
      </div>
    </div>
  </main>
  <aside class="panel right" id="right">
    <div class="head"><b>Properties</b><span class="badge" id="selectionLabel">Screen</span></div>
    <div id="inspector"></div>
  </aside>
</div>
<div class="toast" id="toast"></div>
<script>
const TOKEN = ${JSON.stringify(token)};
const INITIAL = ${json};
const HAS_SAVED = ${project.doc ? 'true' : 'false'};
const SECTION_LABELS = { hero:'Hero', featured:'Featured', offers:'Offers', loyalty:'Rewards', visit:'Visit', story:'Story', testimonials:'Testimonials', cta:'Call to action', heading:'Heading', text:'Text', button:'Button', image:'Image', banner:'Banner', productList:'Product list', search:'Search', form:'Contact form', gallery:'Gallery' };
const SCREEN_LABELS = { home:'Home', catalog:'Catalogue', search:'Search', saved:'Saved', detail:'Details', book:'Booking', quote:'Enquiry', more:'More', contact:'Contact', profile:'Profile', about:'About', custom:'Screen' };
const COMPONENTS = ['heading','text','button','image','banner','gallery','productList','search','form','testimonials','cta','offers','loyalty','visit','story','featured'];
const SINGLE = ['hero','featured','offers','loyalty','visit','story','testimonials','cta','search','form','productList'];
const SCREENS = [['contact','Contact','Address, hours and a message'],['about','About','Your story and a photo'],['profile','Profile','Account and shortcuts'],['custom','Blank','A new screen']];
const state = { doc: JSON.parse(JSON.stringify(INITIAL)), screen: INITIAL.initialScreen || INITIAL.screens[0].id, selected: null, device: 'mobile', history: [], future: [], historyMode: false };
const $ = (id) => document.getElementById(id);
const frame = $('frame');
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function current() { return state.doc.screens.find((s) => s.id === state.screen) || state.doc.screens[0]; }
function component() { return current().sections.find((s) => s.id === state.selected) || null; }
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
  state.future.push(clone(state.doc)); state.doc = state.history.pop(); render(); scheduleSave(); reloadFrame();
}
function redo() {
  if (!state.future.length) return;
  state.history.push(clone(state.doc)); state.doc = state.future.pop(); render(); scheduleSave(); reloadFrame();
}
function toast(text) { const el = $('toast'); el.textContent = text; el.classList.add('on'); clearTimeout(el.dataset.t); el.dataset.t = String(setTimeout(() => el.classList.remove('on'), 1800)); }
let saveTimer = null;
function scheduleSave() {
  $('saveStatus').textContent = 'Saving…'; $('saveStatus').classList.add('busy');
  clearTimeout(saveTimer); saveTimer = setTimeout(save, 650);
}
function save() {
  return fetch('/api/projects/' + TOKEN + '/doc', { method:'PUT', headers:{'content-type':'application/json'}, body: JSON.stringify({ doc: state.doc }) })
    .then((response) => { if (!response.ok) throw new Error('save'); $('saveStatus').textContent = 'Saved'; $('saveStatus').classList.remove('busy'); })
    .catch(() => { $('saveStatus').textContent = 'Not saved'; $('saveStatus').classList.add('busy'); });
}
let reloadTimer = null;
function reloadFrame() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => { save().then(() => { frame.src = '/p/' + TOKEN + '/app?editor=1&screen=' + encodeURIComponent(appId(current())) + '&v=' + Date.now(); }); }, 240);
}
function render() { renderScreens(); renderScreenLibrary(); renderLibrary(); renderStructure(); renderInspector(); renderToolbar(); }
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
  $('library').innerHTML = COMPONENTS.map((kind) => {
    const present = SINGLE.includes(kind) && current().sections.some((s) => s.kind === kind);
    return '<button class="tile-add" data-add-component="' + kind + '"' + (present ? ' disabled' : '') + '><b>' + SECTION_LABELS[kind] + '</b><span>' + (present ? 'On this screen' : 'Add to screen') + '</span></button>';
  }).join('');
}
function renderStructure() {
  $('structure').innerHTML = current().sections.map((s) => '<div class="node' + (state.selected === s.id ? ' on' : '') + (s.hidden ? ' off' : '') + '" draggable="true" data-node="' + s.id + '">' +
    '<span class="grip">⠿</span>' +
    '<button class="name" data-select="' + s.id + '">' + esc(s.title || SECTION_LABELS[s.kind]) + '<small>' + SECTION_LABELS[s.kind] + '</small></button>' +
    '<button class="act" data-hide="' + s.id + '" title="Hide">' + (s.hidden ? '◌' : '◉') + '</button>' +
    '<button class="act" data-duplicate="' + s.id + '" title="Duplicate">⧉</button>' +
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
  const node = component();
  $('selectionLabel').textContent = node ? SECTION_LABELS[node.kind] : 'Screen';
  if (!node) { renderScreenInspector(); return; }
  const style = node.style || {}; const hides = (node.responsive && node.responsive.hideOn) || [];
  $('inspector').innerHTML =
    '<div class="sec">' +
      '<div class="field"><label>Heading</label><input id="pTitle" type="text" maxlength="60" value="' + esc(node.title || '') + '" placeholder="' + SECTION_LABELS[node.kind] + '" /></div>' +
      '<div class="field"><label>Words</label><textarea id="pText" maxlength="600" placeholder="A sentence or two">' + esc(node.text || '') + '</textarea></div>' +
      (node.kind === 'button' || node.kind === 'banner' || node.kind === 'cta' ? '<div class="field"><label>Button label</label><input id="pCta" type="text" maxlength="28" value="' + esc((node.cta && node.cta.label) || '') + '" /></div><div class="field"><label>Button opens</label><select id="pTarget">' + state.doc.screens.map((s) => '<option value="' + s.id + '"' + (node.cta && node.cta.screen === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('') + '</select></div>' : '') +
    (node.kind === 'hero' ? '' : '<div class="field"><label>Move to another screen</label><select id="pMoveTo"><option value="">Choose a screen…</option>' + state.doc.screens.filter((s) => s.id !== state.screen).map((s) => '<option value="' + s.id + '">' + esc(s.name) + '</option>').join('') + '</select></div>') +
    '</div>' +
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
  $('inspector').innerHTML =
    '<div class="sec">' +
      '<div class="field"><label>Screen name</label><input id="sName" type="text" maxlength="24" value="' + esc(screen.name) + '" /></div>' +
      '<div class="checks"><label><input type="checkbox" id="sNav" ' + (screen.nav ? 'checked' : '') + '/> Show in bottom navigation</label>' +
      '<label><input type="checkbox" id="sInitial" ' + (state.doc.initialScreen === screen.id ? 'checked' : '') + '/> Open the app on this screen</label></div>' +
      '<p class="hint">Up to five navigation items fit. The first five selected are used.</p>' +
    '</div>' +
    '<div class="sec"><h3>This screen</h3><p class="empty">' + screen.sections.length + ' component' + (screen.sections.length === 1 ? '' : 's') + '. Add or reorder them on the left, or click one in the app.</p></div>' +
    (screen.kind === 'home' ? '' : '<div class="sec"><button class="btn" id="sDuplicate">Duplicate screen</button> <button class="btn" id="sDelete" style="color:#a13b2b;margin-top:8px">Delete screen</button></div>');
  $('sName').addEventListener('input', (event) => commit((doc) => { const s = doc.screens.find((x) => x.id === screen.id); if (s) s.name = event.target.value.slice(0,24); return doc; }));
  $('sNav').addEventListener('change', (event) => commit((doc) => { const s = doc.screens.find((x) => x.id === screen.id); if (s) s.nav = event.target.checked; return doc; }, true));
  $('sInitial').addEventListener('change', (event) => { if (event.target.checked) commit((doc) => { doc.initialScreen = screen.id; return doc; }, true); });
  const dup = $('sDuplicate'); if (dup) dup.addEventListener('click', () => duplicateScreen(screen.id));
  const del = $('sDelete'); if (del) del.addEventListener('click', () => { if (confirm('Delete this screen?')) removeScreen(screen.id); });
}
function bindInspector(node) {
  $('pTitle').addEventListener('input', (event) => commit((doc) => patchNode(doc, node.id, { title: event.target.value })));
  $('pText').addEventListener('input', (event) => commit((doc) => patchNode(doc, node.id, { text: event.target.value })));
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
    commit((doc) => { const screen = doc.screens.find((s) => s.id === state.screen); if (screen) screen.sections = screen.sections.filter((s) => s.id !== node.id); return doc; }, true);
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
    doc.screens.push({ id, kind, name: kind === 'custom' ? 'New screen' : kind[0].toUpperCase() + kind.slice(1), icon: kind === 'contact' ? 'phone' : 'dots', nav: kind !== 'custom', hidden: false, sections: defaults[kind] || [] });
    state.screen = id; state.selected = null;
    return doc;
  }, true);
}
function duplicateScreen(id) {
  commit((doc) => {
    const index = doc.screens.findIndex((s) => s.id === id); if (index < 0) return doc;
    let newId = 'scr_custom'; let n = 2; while (doc.screens.some((s) => s.id === newId)) { newId = 'scr_custom_' + n; n += 1; }
    const source = doc.screens[index];
    doc.screens.splice(index + 1, 0, Object.assign(clone(source), { id: newId, kind: 'custom', name: (source.name + ' copy').slice(0,24), nav: false, sections: source.sections.map((s) => Object.assign(clone(s), { id: s.id + '_copy' })) }));
    state.screen = newId; state.selected = null;
    return doc;
  }, true);
}
function removeScreen(id) {
  commit((doc) => {
    const screen = doc.screens.find((s) => s.id === id); if (!screen || screen.kind === 'home') return doc;
    doc.screens = doc.screens.filter((s) => s.id !== id);
    if (!doc.screens.some((s) => s.id === doc.initialScreen)) doc.initialScreen = doc.screens[0].id;
    if (state.screen === id) { state.screen = doc.screens[0].id; state.selected = null; }
    return doc;
  }, true);
}
document.addEventListener('click', (event) => {
  const screenAdd = event.target.closest('[data-add-screen]'); if (screenAdd) { addScreen(screenAdd.dataset.addScreen); return; }
  const componentAdd = event.target.closest('[data-add-component]'); if (componentAdd) { addComponent(componentAdd.dataset.addComponent); return; }
  const open = event.target.closest('[data-open]'); if (open) { state.screen = open.dataset.open; state.selected = null; render(); reloadFrame(); return; }
  const del = event.target.closest('[data-screen-delete]'); if (del) { if (confirm('Delete this screen?')) removeScreen(del.dataset.screenDelete); return; }
  const select = event.target.closest('[data-select]'); if (select) { state.selected = select.dataset.select; render(); return; }
  const hide = event.target.closest('[data-hide]'); if (hide) { commit((doc) => { const screen = doc.screens.find((s) => s.id === state.screen); const node = screen && screen.sections.find((s) => s.id === hide.dataset.hide); if (node) node.hidden = !node.hidden; return doc; }, true); return; }
  const dup = event.target.closest('[data-duplicate]'); if (dup) { commit((doc) => { const screen = doc.screens.find((s) => s.id === state.screen); if (!screen) return doc; const index = screen.sections.findIndex((s) => s.id === dup.dataset.duplicate); if (index < 0 || screen.sections[index].kind === 'hero') return doc; const cloneNode = clone(screen.sections[index]); cloneNode.id += '_' + Date.now().toString(36); screen.sections.splice(index + 1, 0, cloneNode); return doc; }, true); return; }
  const restore = event.target.closest('[data-restore]'); if (restore) { restoreVersion(restore.dataset.restore); return; }
  const remove = event.target.closest('[data-delete]'); if (remove) { if (!confirm('Delete this component?')) return; commit((doc) => { const screen = doc.screens.find((s) => s.id === state.screen); if (screen) screen.sections = screen.sections.filter((s) => s.id !== remove.dataset.delete); return doc; }, true); if (state.selected === remove.dataset.delete) state.selected = null; render(); }
});
window.addEventListener('message', (event) => {
  const message = event.data;
  if (!message || message.source !== 'plattr-canvas') return;
  if (message.type === 'select') { state.selected = message.id; render(); }
  if (message.type === 'screen') { const screen = state.doc.screens.find((s) => appId(s) === message.id); if (screen) { state.screen = screen.id; state.selected = null; render(); } }
});
$('undo').addEventListener('click', undo);
$('redo').addEventListener('click', redo);
document.addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); } });
document.querySelectorAll('[data-device]').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('[data-device]').forEach((other) => other.classList.toggle('on', other === button));
  state.device = button.dataset.device;
  $('phone').className = 'phone ' + state.device;
}));
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
if (!HAS_SAVED) save().then(reloadFrame);
</script>
</body>
</html>`
}
