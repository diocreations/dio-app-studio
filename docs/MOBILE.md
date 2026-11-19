# Mobile application architecture

Plattr generates a mobile application, not a website wearing a phone frame. This
documents the assessment that redirected the product and the screen-based
architecture that replaces the section-only document.

## Assessment before this change

1. **AppSpec** (`src/worker/types.ts`) is the business: name, catalogue,
   features, accent, imported design kit, chosen layout. It is not a UI tree and
   should not become one.
2. **Doc** (v1, `src/worker/doc.ts`) addressed home sections only. It could order,
   hide, restyle and rewrite the home page, but had no concept of a screen, a tab
   bar or navigation, so it could not describe an application.
3. **The renderer** (`src/worker/app.ts`) already produces a real app shell:
   fixed app bar, multiple screens, detail push, bottom sheets, cart, booking,
   search, saved, install prompt, offline banner, haptics and history-based back.
   Its screens were hard-coded and its tab bar was computed per trade. That is
   the functionality worth keeping.
4. **The editor** edited one implicit home page. Its autosave, undo, drag and AI
   preview loop were right; its object model was wrong.
5. **The PWA** is a genuine installable web app: manifest with `display:
   standalone`, start URL and scope, generated icon, trade theme colour,
   service worker with network-first navigation and cache-first assets, an
   offline fallback and an in-app install prompt. It is not a native package.

## The screen model (Doc v2)

```ts
Doc { v: 2, accent?, initialScreen, screens: ScreenNode[] }
ScreenNode { id, kind, name, icon, nav, hidden, sections: DocNode[] }
```

- **Screens** are ordered, named and addressable with stable `scr_*` ids. Supported
  kinds are `home`, `catalog`, `search`, `saved`, `detail`, `book`, `quote`,
  `more`, plus editor-created `contact`, `profile`, `about` and `custom`.
- **Navigation** is the set of visible screens with `nav: true`, in screen order,
  capped at five tab items. `initialScreen` chooses what opens on launch. Buttons
  and components link to screens by document id.
- **Sections become components** inside a screen: hero, featured/product list,
  offers, rewards, visit, story, testimonials, CTA, heading, text, button, image,
  banner, search, contact form and gallery. Ids are stable within a screen.
- **Migration is automatic and safe.** A v1 section document is lifted into the
  home screen of a full v2 app; a project with no document still renders through
  the original seeded path. No customer build is rewritten on read.
- **Normalisation** accepts browser input and enforces known screen kinds, unique
  ids, bounded text, sanitised colours, a home screen, a valid initial screen and
  a non-hideable hero.

## What changed in the renderer and editor

- Bottom tabs and the initial screen now come from the document when one exists;
  without a document the seeded trade navigation still applies.
- Custom screens render inside the same app shell with the same app bar, tab bar,
  scrolling, safe-area padding and theme, and are reachable by tabs and buttons.
- The editor is screen-first: a screens list (reorder, delete, duplicate, rename,
  show in navigation, choose initial), a component library scoped to the current
  screen, drag reorder on both the canvas and the list, properties per component,
  autosave, undo/redo and AI preview/apply. The phone canvas is the default view;
  tablet and desktop are validation sizes.
- AI understands screens: add contact/about/profile/blank screens, add bottom
  navigation, bring the catalogue or booking into it, plus the previous design,
  copy and section commands. Proposals remain unsaved until accepted.

## PWA, Android and iOS — honestly

The PWA is installable and works offline. That is **not** the same as a native
app:

- **Android APK/AAB:** a Trusted Web Activity (Bubblewrap) wrapper can ship the
  same PWA through Google Play. It needs a signing key, an asset-links file on
  the origin, a Play Console account and store assets. Not implemented.
- **iOS:** there is no TWA equivalent. App Store distribution requires a native
  Swift wrapper or Capacitor/Cordova shell, Apple signing, review, and Apple's
  rules on web-wrapper apps. Not implemented and not promised.
- The current export produces PWA, Android TWA project and iOS project scaffolding
  as source and commands, deliberately without signing identities.

## Still ahead

1. Removing built-in screens completely: deleting one now removes it from the
   document and navigation, but the legacy renderer markup for search/saved and
   the other built-in screens is still emitted (unreachable). Render them
   conditionally next.
2. Moving components between screens, explicit containers (list/grid/section),
   inline canvas text editing, image upload and cropping.
3. Checkout/order-history screens: ordering and cart exist as a functional bottom
   sheet, not yet as document-managed screens.
4. Per-breakpoint style overrides beyond visibility, and named mobile design
   presets curated for all 27 categories.
5. Hosted AI with limits behind the existing proposal API.

## Workflow audit, August 2026

Generated apps are functional, not mockups, in these flows:

| Flow | State |
| --- | --- |
| Browse catalogue, sections, filters | Works (all catalogue trades) |
| Item detail, favourite, quantity | Works |
| Cart sheet, fulfilment choice, guest order | Works for ordering trades; creates a real D1 order with server-priced lines |
| Booking (days, slots, party size, confirmation) | Works for booking/classes trades |
| Enquiry form (name, contact, message) | Works for quote trades |
| Search and saved items | Works |
| Call, directions, social links | Work when the build has the details |
| Order/booking confirmation and status | Works through the returned random capability id stored on the device |
| Profile / saved items | Saved items work locally; customer accounts remain future work |

Ordering and checkout deliberately remain a bottom sheet. They now create a real
guest order in D1 and the customer can read its status with the returned id, but
no payment is taken in the app. Making them document-managed screens must keep
that working sheet as the transactional surface; payment remains blocked on each
business's own merchant credentials.

## Media manager

The editor now has a real R2-backed media library: browser-side WebP conversion,
server validation, focal-point crops, replace/reuse/delete, reference-safe
deletion and quotas. The published app falls back to deliberate abstract artwork
when the owner has not supplied a photograph or a stock key is unavailable.

## Element editing today

Components are selectable in the canvas and in the structure list, with
properties, duplicate, delete, reorder and move-to-screen. Direct inline editing
on the canvas, image replacement and resize handles are not implemented yet.
