# Session-day checklist

One copy per session. Tick each item; do not improvise around a failed item.

## Before

- [ ] Owner is the real operator, not a stand-in.
- [ ] Consent form read and signed; recording choice recorded.
- [ ] Frozen build ID confirmed:
      `plattr-pilot-2026-11-22-50ed8bf-2331b6369062-dirty`.
- [ ] No product change is pending. `CHANGELOG.md` has no unreviewed change.
- [ ] Previous session's edits have been restored; all 12 pilot rows exist.
- [ ] Baseline dataset hash is pristine:
      `bad9e57a526ce3132928123ac32c25e39ef1b62b8abbf8c2d25e9bedea6bf471`.
- [ ] Dev server running on **127.0.0.1 only** (`bunx vite --host 127.0.0.1`);
      confirm `lsof` shows `TCP 127.0.0.1:5173`, not `*:5173`; health returns 200.
- [ ] Only this business's concept sheet is open:
      `.chrome-qa/pilot-concepts-<business>.html`.
- [ ] Owner private link and key are separate; key is not visible on screen.
- [ ] Operator Studio, payment pages, other businesses and public deployment are
      closed.
- [ ] Project is private, `noindex`, in review; payments off.
- [ ] Timer, this checklist, business sheet and pen/notes ready.
- [ ] Fresh browser profile/window; no other owner's session cookie.

## During

- [ ] Read the opening script and task prompts once.
- [ ] Start/stop the timer per task.
- [ ] Log every hint, pointer, named label or mouse action as assistance.
- [ ] Record mistakes, wrong turns, exact questions and quotes.
- [ ] Do not teach the workflow or defend the design.
- [ ] Do not press **Approve build**, publish, pay, or submit customer data.
- [ ] Stop if a credential, private project or wrong business data is exposed.

## After

- [ ] Record the owner's concept choice and **reason** separately from usability.
- [ ] Record all accuracy corrections and feature requests.
- [ ] Record whether the owner could explain found/uncertain/missing and the
      private status.
- [ ] Stop the dev server before touching D1.
- [ ] Restore every affected project for this business from the frozen backup.
- [ ] Start the server; confirm all 12 pilot rows exist.
- [ ] Recompute the dataset hash; it must return to the pristine value.
- [ ] Confirm no order, booking or enquiry was created.
- [ ] Store consent/recording privately; remove secrets from notes.
- [ ] Add the session row and any product-change row to `CHANGELOG.md`.
- [ ] Fill the business sheet and `SESSION-RESULTS.csv`.
- [ ] Do not run the next owner until the baseline is clean.

## Abort

If any stop condition occurs, stop the session, preserve notes, restore the
project, and mark the session `aborted` in the results CSV. Do not continue to
“finish the tasks” after a privacy or wrong-data event.
