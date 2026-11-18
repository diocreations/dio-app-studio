import type { Doc } from '../doc'
import type { Project } from '../db'
import { esc } from './shell'

/*
 * The visual editor. It is a thin client over the shared document: every change
 * posts the whole document, the server normalises it, and both this canvas and
 * the published app render from it. No second representation exists.
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
  --accent: ${esc(project.accent)};
  --radius: 12px;
  --sans: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif;
  --serif: ui-serif, "Iowan Old Style", "Palatino Linotype", Georgia, serif;
}
* { box-sizing: border-box; }
html, body { height: 100%; }
body { margin: 0; background: var(--paper); color: var(--ink); font-family: var(--sans); font-size: 13px; -webkit-font-smoothing: antialiased; overflow: hidden; }
button, input, textarea, select { font: inherit; color: inherit; }
button { cursor: pointer; }
.ico { width: 16px; height: 16px; display: inline-block; vertical-align: -3px; }
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
.sec { padding: 16px 14px; border-bottom: 1px solid var(--line-soft); }
.sec h3 { margin: 0 0 10px; font-size: 10.5px; text-transform: uppercase; letter-spacing: .09em; color: var(--muted); font-weight: 650; }
.tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.tile-add { border: 1px solid var(--line-soft); background: #fff; border-radius: 9px; padding: 9px 8px; text-align: left; display: grid; gap: 3px; }
.tile-add:hover { border-color: var(--accent); }
.tile-add b { font-size: 12px; font-weight: 600; }
.tile-add span { color: var(--muted); font-size: 10px; line-height: 1.3; }
.tile-add:disabled { opacity: .38; cursor: default; border-color: var(--line-soft); }
.structure { display: grid; gap: 4px; }
.node { display: flex; align-items: center; gap: 8px; border: 1px solid transparent; border-radius: 9px; padding: 7px 7px 7px 5px; background: transparent; }
.node:hover { background: var(--paper); }
.node.on { background: #fff; border-color: var(--line); box-shadow: 0 1px 2px rgba(0,0,0,.04); }
.node .grip { color: #b9b1a5; cursor: grab; font-size: 12px; padding: 0 2px; user-select: none; }
.node .name { flex: 1; min-width: 0; text-align: left; border: 0; background: transparent; padding: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.node .name small { color: var(--muted); font-size: 10px; display: block; }
.node .act { opacity: 0; border: 0; background: transparent; color: var(--muted); padding: 3px; border-radius: 5px; }
.node:hover .act, .node.on .act { opacity: 1; }
.node .act:hover { background: var(--paper); color: var(--ink); }
.node.off .name { opacity: .45; }
.node.drag { opacity: .4; }
.node.over { border-color: var(--accent); border-style: dashed; }
.stage { position: relative; display: flex; flex-direction: column; min-width: 0; background: #eceae4; }
.stagebar { height: 42px; display: flex; align-items: center; gap: 8px; padding: 0 12px; border-bottom: 1px solid var(--line); background: rgba(255,255,255,.55); }
.ai { display: flex; align-items: center; gap: 8px; margin-left: auto; width: min(430px, 52%); }
.ai input { flex: 1; min-width: 0; border: 1px solid var(--line); background: #fff; border-radius: 999px; padding: 7px 12px; outline: none; }
.ai input:focus { border-color: var(--accent); }
.canvas { flex: 1; overflow: auto; display: flex; align-items: flex-start; justify-content: center; padding: 22px; }
.device { background: #fff; border-radius: 16px; box-shadow: 0 24px 60px -32px rgba(25,23,19,.5); transition: width .2s ease, height .2s ease; width: 100%; max-width: 100%; height: 100%; min-height: 640px; overflow: hidden; }
.device iframe { width: 100%; height: 100%; border: 0; display: block; background: #fff; }
.device.mobile { width: 390px; height: 780px; min-height: 0; }
.device.tablet { width: 820px; height: 780px; max-height: 100%; min-height: 0; }
.device.desktop { width: 100%; height: 100%; min-height: 0; }
.aibar { display: none; align-items: center; gap: 10px; padding: 9px 14px; border-bottom: 1px solid var(--line); background: #fff8ec; }
.aibar.on { display: flex; }
.aibar p { flex: 1; margin: 0; font-size: 12px; }
.field { display: grid; gap: 5px; margin-bottom: 12px; }
.field label { font-size: 11px; color: var(--muted); }
.field input[type="text"], .field textarea { width: 100%; border: 1px solid var(--line); border-radius: 8px; padding: 7px 9px; background: #fff; outline: none; }
.field input[type="text"]:focus, .field textarea:focus { border-color: var(--accent); }
.field textarea { min-height: 68px; resize: vertical; }
.swatches { display: flex; gap: 6px; flex-wrap: wrap; }
.swatch { width: 24px; height: 24px; border-radius: 7px; border: 1px solid var(--line); }
.swatch.on { outline: 2px solid var(--ink); outline-offset: 1px; }
.checks { display: grid; gap: 6px; }
.checks label { display: flex; gap: 7px; align-items: center; font-size: 12px; color: var(--ink); }
.hint { color: var(--muted); font-size: 11px; line-height: 1.45; margin: 8px 0 0; }
.empty { color: var(--muted); font-size: 12px; line-height: 1.5; padding: 4px 2px; }
.right .head { padding: 14px 14px 10px; border-bottom: 1px solid var(--line-soft); display: flex; align-items: center; justify-content: space-between; }
.right .head b { font-family: var(--serif); font-size: 15px; font-weight: 600; }
.badge { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
.toast { position: fixed; bottom: 18px; left: 50%; transform: translate(-50%, 20px); background: var(--ink); color: #fff; padding: 8px 14px; border-radius: 9px; font-size: 12px; opacity: 0; transition: .2s; pointer-events: none; z-index: 20; }
.toast.on { opacity: 1; transform: translate(-50%, 0); }
@media (max-width: 1080px) {
  .layout { grid-template-columns: 220px minmax(0, 1fr); }
  .panel.right { position: fixed; right: 0; top: 56px; bottom: 0; width: 292px; z-index: 10; box-shadow: -20px 0 50px -30px rgba(0,0,0,.4); transform: translateX(100%); transition: transform .18s; }
  .panel.right.open { transform: none; }
  .ai { width: min(340px, 48%); }
}
@media (max-width: 760px) {
  .layout { grid-template-columns: minmax(0, 1fr); }
  .panel.left { position: fixed; left: 0; top: 56px; bottom: 0; width: 252px; z-index: 10; transform: translateX(-100%); transition: transform .18s; box-shadow: 20px 0 50px -30px rgba(0,0,0,.4); }
  .panel.left.open { transform: none; }
  .brand b { max-width: 120px; }
  .ai { display: none; }
  .canvas { padding: 10px; }
  .device.desktop, .device.tablet, .device.mobile { width: 100%; height: 100%; }
}
</style>
</head>
<body data-token="${esc(token)}">
<div class="bar">
  <a class="back" href="/p/${esc(token)}" aria-label="Back to the build">←</a>
  <button class="iconbtn" id="panelLeft" title="Sections and elements" aria-label="Sections and elements">☰</button>
  <div class="brand"><b>${esc(project.name)}</b><span>editor · v${project.version}</span></div>
  <span class="save" id="saveStatus">Saved</span>
  <div class="spacer"></div>
  <button class="iconbtn" id="undo" disabled title="Undo (⌘Z)" aria-label="Undo">↶</button>
  <button class="iconbtn" id="redo" disabled title="Redo (⇧⌘Z)" aria-label="Redo">↷</button>
  <div class="seg" role="group" aria-label="Preview size">
    <button data-device="desktop" title="Desktop">Desktop</button>
    <button data-device="tablet" title="Tablet">Tablet</button>
    <button data-device="mobile" class="on" title="Mobile">Mobile</button>
  </div>
  <button class="iconbtn" id="panelRight" title="Properties" aria-label="Properties">⚙</button>
  <a class="btn ghost" href="/p/${esc(token)}" target="_blank" rel="noreferrer">Review page</a>
  <a class="btn primary" id="openApp" href="${esc(origin)}/p/${esc(token)}/app" target="_blank" rel="noreferrer">Open app ↗</a>
</div>
<div class="layout">
  <aside class="panel left" id="left">
    <div class="sec">
      <h3>Add a section</h3>
      <div class="tiles" id="library"></div>
    </div>
    <div class="sec">
      <h3>Structure</h3>
      <div class="structure" id="structure"></div>
      <p class="hint">Drag to reorder. Click a section to edit its words, colour and spacing.</p>
    </div>
  </aside>
  <main class="stage">
    <div class="stagebar">
      <span class="badge" id="deviceLabel">Mobile · 390</span>
      <div class="ai">
        <input id="aiCommand" type="text" maxlength="120" placeholder="Ask for a change — “make it premium”" aria-label="AI edit instruction" />
        <button class="btn" id="aiRun">Preview</button>
      </div>
    </div>
    <div class="aibar" id="aiBar">
      <p id="aiSummary"></p>
      <button class="btn" id="aiDiscard">Discard</button>
      <button class="btn primary" id="aiApply">Apply</button>
    </div>
    <div class="canvas">
      <div class="device mobile" id="device">
        <iframe id="frame" title="Live application preview" src="/p/${esc(token)}/app?editor=1"></iframe>
      </div>
    </div>
  </main>
  <aside class="panel right" id="right">
    <div class="head"><b>Properties</b><span class="badge" id="selectionLabel">Nothing selected</span></div>
    <div id="inspector"><p class="empty">Select a section on the canvas or in the structure list to edit it.</p></div>
  </aside>
</div>
<div class="toast" id="toast"></div>
<script>
const TOKEN = ${JSON.stringify(token)};
const INITIAL = ${json};
const HAS_SAVED = ${project.doc ? 'true' : 'false'};
const KINDS = ['hero','featured','offers','loyalty','visit','story','testimonials','cta'];
const LABELS = { hero:'Hero', featured:'Featured', offers:'Offers', loyalty:'Rewards', visit:'Visit', story:'Story', testimonials:'Testimonials', cta:'Call to action' };
const DESCRIPTIONS = { hero:'The opening screen', featured:'A first look at the catalogue', offers:'A live promotion', loyalty:'A reason to come back', visit:'Hours, address and contact', story:'A short introduction', testimonials:'A quote from a customer', cta:'A closing invitation' };
const ADDABLE = ['offers','loyalty','story','testimonials','cta'];
const state = { doc: INITIAL, selected: null, device: 'mobile', history: [], future: [], saving: null, timer: null, pending: null };
const $ = (id) => document.getElementById(id);
const frame = $('frame');

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function node(id) { return state.doc.sections.find((section) => section.id === id) || null; }
function commit(mutate, options = {}) {
  const before = clone(state.doc);
  const next = mutate(clone(state.doc));
  if (!next || JSON.stringify(next) === JSON.stringify(before)) return;
  state.history.push(before);
  if (state.history.length > 60) state.history.shift();
  state.future = [];
  state.doc = next;
  render();
  scheduleSave();
  if (options.reload) reload();
}
function undo() {
  if (!state.history.length) return;
  state.future.push(clone(state.doc));
  state.doc = state.history.pop();
  render(); scheduleSave(); reload();
}
function redo() {
  if (!state.future.length) return;
  state.history.push(clone(state.doc));
  state.doc = state.future.pop();
  render(); scheduleSave(); reload();
}
function toast(message) {
  const el = $('toast'); el.textContent = message; el.classList.add('on');
  clearTimeout(el.dataset.timer); el.dataset.timer = String(setTimeout(() => el.classList.remove('on'), 1800));
}
function scheduleSave() {
  $('saveStatus').textContent = 'Saving…'; $('saveStatus').classList.add('busy');
  clearTimeout(state.timer);
  state.timer = setTimeout(save, 650);
}
async function save() {
  try {
    const response = await fetch('/api/projects/' + TOKEN + '/doc', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ doc: state.doc }),
    });
    if (!response.ok) throw new Error('save failed');
    $('saveStatus').textContent = 'Saved'; $('saveStatus').classList.remove('busy');
  } catch {
    $('saveStatus').textContent = 'Not saved'; $('saveStatus').classList.add('busy');
  }
}
let reloadTimer = null;
function reload() {
  clearTimeout(reloadTimer);
  // The preview is server-rendered from the stored document, so save first.
  reloadTimer = setTimeout(() => { save().then(loadFrame); }, 260);
}
function loadFrame() { frame.src = '/p/' + TOKEN + '/app?editor=1&v=' + Date.now(); }

function render() {
  renderLibrary(); renderStructure(); renderInspector(); renderToolbar();
  if (state.selected && !node(state.selected)) state.selected = null;
}
function renderToolbar() {
  $('undo').disabled = !state.history.length;
  $('redo').disabled = !state.future.length;
}
function renderLibrary() {
  $('library').innerHTML = ADDABLE.map((kind) => {
    const present = state.doc.sections.some((section) => section.kind === kind);
    return '<button class="tile-add" data-add="' + kind + '"' + (present ? ' disabled' : '') + '><b>' + LABELS[kind] + '</b><span>' + (present ? 'On the page' : DESCRIPTIONS[kind]) + '</span></button>';
  }).join('');
}
function renderStructure() {
  $('structure').innerHTML = state.doc.sections.map((section) => {
    const title = section.title || LABELS[section.kind];
    return '<div class="node' + (state.selected === section.id ? ' on' : '') + (section.hidden ? ' off' : '') + '" draggable="true" data-id="' + section.id + '">' +
      '<span class="grip" aria-hidden="true">⠿</span>' +
      '<button class="name" data-select="' + section.id + '">' + esc(title) + '<small>' + LABELS[section.kind] + '</small></button>' +
      (section.kind === 'hero'
        ? '<span class="act" title="The hero always stays first">·</span>'
        : '<button class="act" data-hide="' + section.id + '" title="' + (section.hidden ? 'Show' : 'Hide') + '">' + (section.hidden ? '◌' : '◉') + '</button>' +
          '<button class="act" data-duplicate="' + section.id + '" title="Duplicate">⧉</button>' +
          '<button class="act" data-remove="' + section.id + '" title="Delete">✕</button>') +
      '</div>';
  }).join('');
  bindStructure();
}
function bindStructure() {
  document.querySelectorAll('.node').forEach((element) => {
    element.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('text/plain', element.dataset.id);
      element.classList.add('drag');
    });
    element.addEventListener('dragend', () => element.classList.remove('drag'));
    element.addEventListener('dragover', (event) => { event.preventDefault(); element.classList.add('over'); });
    element.addEventListener('dragleave', () => element.classList.remove('over'));
    element.addEventListener('drop', (event) => {
      event.preventDefault(); element.classList.remove('over');
      const id = event.dataTransfer.getData('text/plain');
      if (id && id !== element.dataset.id) reorder(id, element.dataset.id);
    });
  });
}
function reorder(id, beforeId) {
  commit((doc) => {
    const from = doc.sections.findIndex((section) => section.id === id);
    if (from < 0) return doc;
    const moving = doc.sections[from];
    if (moving.kind === 'hero') return doc;
    const rest = doc.sections.filter((section) => section.id !== id);
    const at = beforeId ? rest.findIndex((section) => section.id === beforeId) : rest.length;
    if (at < 0) return doc;
    rest.splice(Math.max(at, rest[0]?.kind === 'hero' ? 1 : 0), 0, moving);
    return { ...doc, sections: rest };
  }, { reload: true });
}
function renderInspector() {
  const selected = node(state.selected);
  $('selectionLabel').textContent = selected ? LABELS[selected.kind] : 'Nothing selected';
  if (!selected) {
    $('inspector').innerHTML = '<p class="empty">Select a section on the canvas or in the structure list to edit it.</p>';
    return;
  }
  const style = selected.style || {};
  const hides = selected.responsive?.hideOn || [];
  $('inspector').innerHTML =
    '<div class="sec">' +
      '<div class="field"><label>Heading</label><input id="pTitle" type="text" maxlength="60" value="' + esc(selected.title || '') + '" placeholder="' + LABELS[selected.kind] + '" /></div>' +
      '<div class="field"><label>Words</label><textarea id="pText" maxlength="600" placeholder="A sentence or two">' + esc(selected.text || '') + '</textarea></div>' +
    '</div>' +
    '<div class="sec"><h3>Design</h3>' +
      '<div class="field"><label>Alignment</label><div class="seg"><button data-align="left" class="' + (style.align !== 'center' ? 'on' : '') + '">Left</button><button data-align="center" class="' + (style.align === 'center' ? 'on' : '') + '">Centred</button></div></div>' +
      '<div class="field"><label>Background</label><div class="swatches">' +
        ['', '${esc(project.accent)}', '#f5efe4', '#12100d', '#ffffff'].map((colour) => '<button class="swatch' + ((style.background || '') === colour ? ' on' : '') + '" data-bg="' + colour + '" style="background:' + (colour || 'transparent') + '" title="' + (colour || 'None') + '"></button>').join('') +
      '</div></div>' +
      '<div class="field"><label>Spacing</label><div class="seg">' + [0,1,2].map((value) => '<button data-pad="' + value + '" class="' + ((style.paddingY ?? 0) === value ? 'on' : '') + '">' + ['None','Cosy','Roomy'][value] + '</button>').join('') + '</div></div>' +
      '<div class="field"><label>Corners</label><div class="seg">' + [0,1,2].map((value) => '<button data-radius="' + value + '" class="' + ((style.radius ?? 0) === value ? 'on' : '') + '">' + ['Square','Soft','Round'][value] + '</button>').join('') + '</div></div>' +
    '</div>' +
    '<div class="sec"><h3>Show on</h3><div class="checks">' +
      ['desktop','tablet','mobile'].map((point) => '<label><input type="checkbox" data-hide="' + point + '" ' + (hides.includes(point) ? 'checked' : '') + ' /> ' + point[0].toUpperCase() + point.slice(1) + '</label>').join('') +
    '</div><p class="hint">Uncheck a device to hide this section there.</p></div>' +
    (selected.kind === 'hero' ? '<div class="sec"><p class="hint">The hero is the opening screen, so it always stays first.</p></div>' :
      '<div class="sec"><button class="btn" id="pDelete" style="color:#a13b2b">Delete section</button></div>');
  bindInspector();
}
function bindInspector() {
  const selected = node(state.selected);
  if (!selected) return;
  const id = selected.id;
  $('pTitle').addEventListener('input', (event) => commit((doc) => patch(doc, id, { title: event.target.value })));
  $('pText').addEventListener('input', (event) => commit((doc) => patch(doc, id, { text: event.target.value })));
  document.querySelectorAll('[data-align]').forEach((button) => button.addEventListener('click', () => commit((doc) => patch(doc, id, { style: { align: button.dataset.align } }))));
  document.querySelectorAll('[data-bg]').forEach((button) => button.addEventListener('click', () => commit((doc) => patch(doc, id, { style: { background: button.dataset.bg || undefined } }))));
  document.querySelectorAll('[data-pad]').forEach((button) => button.addEventListener('click', () => commit((doc) => patch(doc, id, { style: { paddingY: Number(button.dataset.pad) } }))));
  document.querySelectorAll('[data-radius]').forEach((button) => button.addEventListener('click', () => commit((doc) => patch(doc, id, { style: { radius: Number(button.dataset.radius) } }))));
  document.querySelectorAll('[data-hide]').forEach((input) => input.addEventListener('change', () => commit((doc) => {
    const target = doc.sections.find((section) => section.id === id);
    if (!target) return doc;
    const current = new Set(target.responsive.hideOn);
    if (input.checked) current.add(input.dataset.hide); else current.delete(input.dataset.hide);
    target.responsive.hideOn = ['desktop','tablet','mobile'].filter((point) => current.has(point));
    return doc;
  })));
  const remove = $('pDelete');
  if (remove) remove.addEventListener('click', () => {
    if (!confirm('Delete this section? You can undo this.')) return;
    commit((doc) => ({ ...doc, sections: doc.sections.filter((section) => section.id !== id) }), { reload: true });
    state.selected = null; render();
  });
}
function patch(doc, id, change) {
  const target = doc.sections.find((section) => section.id === id);
  if (!target) return doc;
  if (change.title !== undefined) target.title = change.title.trim().slice(0, 60) || undefined;
  if (change.text !== undefined) target.text = change.text.trim().slice(0, 600) || undefined;
  if (change.style) target.style = { ...target.style, ...change.style };
  return doc;
}
function add(kind) {
  commit((doc) => {
    if (doc.sections.some((section) => section.kind === kind)) return doc;
    const id = 'sec_' + kind + '_' + Date.now().toString(36);
    const preset = kind === 'testimonials' ? { title: 'Kind words', text: 'A line from a happy customer belongs here.' }
      : kind === 'cta' ? { title: 'Ready when you are', text: 'Start with a message, and we will take it from there.' } : {};
    doc.sections.push({ id, kind, style: {}, responsive: { hideOn: [] }, hidden: false, ...preset });
    state.selected = id;
    return doc;
  }, { reload: true });
}
function hide(id) {
  commit((doc) => {
    const target = doc.sections.find((section) => section.id === id);
    if (target) target.hidden = !target.hidden;
    return doc;
  }, { reload: true });
}
function duplicate(id) {
  commit((doc) => {
    const index = doc.sections.findIndex((section) => section.id === id);
    if (index < 0 || doc.sections[index].kind === 'hero') return doc;
    const copy = { ...clone(doc.sections[index]), id: 'sec_' + doc.sections[index].kind + '_' + Date.now().toString(36) };
    doc.sections.splice(index + 1, 0, copy);
    return doc;
  }, { reload: true });
}

document.addEventListener('click', (event) => {
  const addButton = event.target.closest('[data-add]');
  if (addButton && !addButton.disabled) { add(addButton.dataset.add); return; }
  const select = event.target.closest('[data-select]');
  if (select) { selectSection(select.dataset.select); return; }
  const hideButton = event.target.closest('[data-hide]');
  if (hideButton && hideButton.classList.contains('act')) { hide(hideButton.dataset.hide); return; }
  const dup = event.target.closest('[data-duplicate]');
  if (dup) { duplicate(dup.dataset.duplicate); return; }
  const remove = event.target.closest('[data-remove]');
  if (remove) {
    if (!confirm('Delete this section? You can undo this.')) return;
    commit((doc) => ({ ...doc, sections: doc.sections.filter((section) => section.id !== remove.dataset.remove) }), { reload: true });
    if (state.selected === remove.dataset.remove) state.selected = null;
    render();
  }
});
function selectSection(id) {
  state.selected = id;
  render();
  if (frame.contentWindow) frame.contentWindow.postMessage({ source: 'plattr-editor', type: 'select', id }, '*');
}
window.addEventListener('message', (event) => {
  const message = event.data;
  if (!message || message.source !== 'plattr-canvas') return;
  if (message.type === 'select') selectSection(message.id);
  if (message.type === 'move') reorder(message.id, message.before);
  if (message.type === 'ready' && state.selected && frame.contentWindow) {
    frame.contentWindow.postMessage({ source: 'plattr-editor', type: 'select', id: state.selected }, '*');
  }
});
$('undo').addEventListener('click', undo);
$('redo').addEventListener('click', redo);
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    if (event.shiftKey) redo(); else undo();
  }
});
document.querySelectorAll('[data-device]').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('[data-device]').forEach((other) => other.classList.toggle('on', other === button));
  state.device = button.dataset.device;
  const device = $('device');
  device.className = 'device ' + state.device;
  $('deviceLabel').textContent = state.device[0].toUpperCase() + state.device.slice(1) + ' · ' + (state.device === 'mobile' ? '390' : state.device === 'tablet' ? '820' : 'full');
}));
$('panelLeft').addEventListener('click', () => $('left').classList.toggle('open'));
$('panelRight').addEventListener('click', () => $('right').classList.toggle('open'));

let proposal = null;
$('aiRun').addEventListener('click', async () => {
  const command = $('aiCommand').value.trim();
  if (!command) return;
  $('aiRun').disabled = true;
  try {
    const response = await fetch('/api/projects/' + TOKEN + '/doc/ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ command, doc: state.doc }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message || 'AI failed');
    proposal = payload.doc;
    $('aiSummary').textContent = payload.summary;
    $('aiBar').classList.add('on');
  } catch (error) {
    toast('Could not preview that change.');
  } finally {
    $('aiRun').disabled = false;
  }
});
$('aiDiscard').addEventListener('click', () => { proposal = null; $('aiBar').classList.remove('on'); });
$('aiApply').addEventListener('click', () => {
  if (!proposal) return;
  state.history.push(clone(state.doc)); state.future = [];
  state.doc = proposal;
  proposal = null; $('aiBar').classList.remove('on');
  render(); scheduleSave(); reload();
  toast('Change applied');
});
$('aiCommand').addEventListener('keydown', (event) => { if (event.key === 'Enter') $('aiRun').click(); });

render();
// A build that predates the editor has no saved document yet; persist the
// generated starting point once so the preview and the customer agree.
if (!HAS_SAVED) save().then(loadFrame);
</script>
</body>
</html>`
}
