# The editor architecture

This is the working record of how the visual editor is built, what it shares with
the published app, and what is deliberately still ahead. It exists so the next
change starts from the same model rather than inventing a parallel one.

## Audit

The build was already a deterministic renderer, not a page builder:

- `buildSpec()` (`src/worker/pricing.ts` + verticals/importers) produces one
  `AppSpec`, stored as JSON on the project row. It carries the business, its
  catalogue, features, chosen layout, imported design kit and structure.
- `renderApp(spec, options)` selects a theme from the trade, derives a seeded
  composition (deck slot, hero, order, density, corners, media), and emits a
  complete document: HTML, generated CSS, and a small client script for the
  app's screens.
- `themeFor()` and `verticals.ts` already give the 27 trades distinct layouts,
  palettes, type pairings and navigation shells; `designsFor()` already offers
  three directions per trade on the brief.
- Persistence is one `projects` row; `saveVersion()` rebuilds and bumps the
  version, `notes` and `activity` carry review history. Exports render from the
  same `AppSpec`.

There was no component tree. Sections were composed inside layout functions and
ordered by a seeded value, so nothing could address "the offers section" as an
editable object. That was the gap.

## The shared representation

`src/worker/doc.ts` defines a small, strict document:

```ts
Doc { v, accent?, sections: DocNode[] }
DocNode { id, kind, title?, text?, cta?, style, responsive, hidden }
```

- **One document, every surface.** Generation suggests a starting `Doc`
  (`docFromSpec`), the editor reads and saves that same JSON, `/p/:token/app`
  passes it into `renderApp`, and the exported PWA bundle renders with it too.
  There is no editor-only model.
- **Stable ids.** Default sections are `sec_<kind>`; added or duplicated
  sections get a suffix. Selection, drag targets and undo snapshots refer to ids,
  not array positions.
- **Content, style and responsive kept apart.** Wording lives in `title`/`text`
  and `cta`; visual choices in `style` (background, ink, alignment, vertical
  padding, radius); device visibility in `responsive.hideOn`. Accent is one
  document-level value so every themed surface follows it.
- **Normalise on the way in.** `normalizeDoc` accepts browser input, drops
  unknown kinds, de-duplicates ids, clamps text, sanitises colours, guarantees a
  hero, and refuses to hide the hero. The renderer normalises again, so a
  document can never reach HTML unchecked.
- **Legacy builds are untouched.** A project with no saved document renders
  through the original seeded path. Opening its editor synthesises
  `docFromSpec` and the first save opts it into the document model.

## Rendering

`renderApp` now accepts `doc` and wraps each rendered home section in
`<div class="doc-section" data-sec="…">` with its responsive classes and inline
style. Order comes from the document when present. The hero, composed separately
by each layout, is wrapped too, so it is selectable but cannot be moved or
hidden. Added kinds (`testimonials`, `cta`) have their own markup.

`editor=1` adds an opt-in bridge to the app document: click to select, drag to
reorder, and `postMessage` to the parent. A published app never includes it.

## The editor

`/p/:token/edit` is the editor page (private token, noindex header and meta):

- **Left** — add-section tiles (only kinds the build can render, disabled when
  present) and a draggable structure list with show/hide, duplicate, delete.
- **Centre** — a live, server-rendered iframe at desktop/tablet/mobile widths.
  Clicking a section selects it; dragging one reorders against its neighbour.
- **Right** — heading, words, alignment, background, spacing, corners and
  per-device visibility for the selected section, plus delete.
- **Toolbar** — undo/redo (buttons and ⌘Z / ⇧⌘Z, 60 snapshots), save status,
  device switcher, review link and the live app.
- **Autosave** — debounced PUT of the whole document; the preview reloads from
  the stored document so the canvas is never a client-only illusion.
- **AI preview** — `/api/projects/:token/doc/ai` proposes a changed document and
  a summary; nothing is stored until "Apply". Apply pushes history, so it is
  undoable like any manual edit.

`applyCommand` is an honest local vocabulary (premium/modern/warm/minimal/bold,
add testimonials or CTA, improve the hero, rearrange, clear device hiding, set a
colour). It costs nothing and cannot invent customer content. A hosted model can
replace it behind the same signature.

## Security and cost

- Document reads/writes require the same private token as the review link;
  cross-origin JSON writes are refused and bodies are capped at 256 KB.
- Every document is normalised server-side; section ids are regex-bound and
  colour values sanitised, and all text is escaped by the renderer.
- Autosave writes one row and one activity entry; there is no extra request
  metering, no external call, and the app page remains the only read path.
- `/p/*` stays noindex in HTML and headers; `/p/:token/edit` inherits both.

## What this slice is not

Still ahead, in rough order of value:

1. Element-level nodes inside a section (drag text/button/image), inline canvas
   text editing, image upload and cropping.
2. Version history for documents (the model has `v`; there is no snapshot table
   yet) and restore.
3. A hosted AI model behind `applyCommand` with per-user limits.
4. Per-breakpoint style overrides beyond show/hide, and saved design presets.
5. Design-system review for all 27 trades (the themes and three directions already
   exist; they are not yet curated as editor-facing presets).

The editor is intentionally section-first: a restaurant owner can reorder,
rewrite, recolour and hide whole sections without meeting a property grid they
cannot interpret. Element-level control is the next layer, not a replacement.
