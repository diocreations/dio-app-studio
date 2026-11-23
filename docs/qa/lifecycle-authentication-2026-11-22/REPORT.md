# Plattr — Real Lifecycle, Authentication and Data Integrity Audit

**Date:** 22 November 2026  
**Scope:** real owner login/logout, import check/apply, field provenance, concurrent owner sessions, bulk publication, and Padella concept composition.  
**Verdict:** the audited workflows pass locally. This is **not** a production-readiness claim. No live crawl, paid AI, payment activation, deployment, commit or push was performed.

This report is separate from the earlier benchmark, remediation, recovery and final-acceptance reports. Those reports remain in place. The earlier 526-check harness was re-run as a regression check and its evidence path was regenerated; no report directory was deleted.

---

## 1. Evidence and what was run

| Check | Result | Evidence |
|---|---|---|
| Live owner authentication over the dev server | **22 passed, 0 failed** | `auth-live.json` |
| Route-level lifecycle suite (`tests/lifecycleAudit.test.ts`) | **9 passed, 0 failed; 106 assertions** | `import-routes.txt` |
| Full unit/integration suite | **744 passed, 0 failed; 61 files** | `full-tests.txt` |
| TypeScript, app and Worker projects | **clean** | `typecheck.txt` |
| Earlier 526-check HTTP acceptance harness | **526 passed, 0 failed** | `regression-results.json`, `regression-audit.log` |
| Browser conflict-resolution UI (headless Chrome/CDP) | **13 passed, 0 failed** | `regeneration-ui.json` |
| Current-generator concept audit, five saved businesses | **5/5 validator pass; all 15 pairs structural** | `concepts-current.json` |
| Live crawls, paid AI, payments, deployment, commit, push | **none** | — |

### Fixture boundary

- The live authentication run used the real login form and the real owner-key derivation. It did not insert an `owner_sessions` row.
- Import route tests call the actual Hono routes `/api/projects/:token/import/check` and `/import/apply` with real owner cookies, the real D1-backed project, and the real conflict/apply logic. The outbound website read is replaced by a deterministic JSON-LD fixture. This is **not** a live crawl.
- The 526-check regression harness seeds its own audit apps and uses direct session insertion, as it did in the previous phase. Its results are a regression check, not the authentication proof in Section 2.

---

## 2. Real authentication lifecycle

### 2.1 Live flow

`scripts/lifecycle-auth-audit.mjs` ran against the local Worker at `http://127.0.0.1:5173` and read `OWNER_SECRET` from `.dev.vars` without printing it. It exercised Yarmouth Oilskins.

1. A wrong owner key returned **401** and set no cookie.
2. The normal owner login form returned **303** and set the owner session cookie.
3. The session opened `/p/:token/dashboard` with **200**.
4. The dashboard carried a build version (`49`) and its `updatedAt`.
5. An imported “Yarmouth Oilskins Gift Card” price was corrected from **2600** to **2737** through `PATCH /api/projects/:token`.
6. The correction saved with **200**, version **50**.
7. Application logout returned **303**.
8. The old cookie was refused by the dashboard (**303** redirect to login) and by the owner API (**401**).
9. A fresh real login returned **303** with a different cookie.
10. The same project reopened with the corrected price, `ownerFields: ["price"]`, `priceEvidence.method: "owner"`, and the original website reading (**5.00**) still available.
11. The item was **not** relabelled as website-verified.
12. A second live session existed; “sign out everywhere” returned **303** and revoked both the first and second sessions.
13. A Padella owner session could sign in to Padella but received **401** on Yarmouth’s owner API and was redirected away from Yarmouth’s dashboard.
14. Padella’s owner key was refused by Yarmouth’s login route with **401**.

All 22 live checks passed.

### 2.2 Expiry and revocation

The route-level suite additionally verifies:

- an `expires_at` in the past is rejected on both the dashboard and API;
- `logout-all` revokes every live session, not only the current cookie;
- a cookie from one owner cannot read another owner’s dashboard or API;
- an owner key for one project cannot log in to another project.

Expiry was simulated by changing the stored `expires_at`; the test did not wait for wall-clock expiry.

### 2.3 What survived

After logout and a fresh login, the stored correction retained:

- the owner’s value;
- `ownerFields: ["price"]`;
- owner price evidence (`method: "owner"`);
- the original website snapshot (`sourceTrail.original.price`, `sourcePriceEvidence`);
- the per-field provenance for the price (`source: "owner"`, `validated: true`);
- the build version and update marker.

This is an actual application-session proof, not direct database session creation.

---

## 3. Import check/apply lifecycle

The route suite runs one project through the actual check/apply API and reads the stored project back through the real database. The fixture is per-URL so each scenario has its own source snapshot.

| Scenario | Check result | Apply/owner decision | Final stored data |
|---|---|---|---|
| **No source change** | `unchanged: 1`; no additions, removals, changes or conflicts | Apply with no selected changes | Original price unchanged |
| **New source value** | One changed field, price `1200 → 1300` | No approval: **200**, value stays **1200**; explicit `Cacio e Pepe|price`: **200** | **1300**, then a later owner action still protected |
| **Source value removed** | `removed: 1` | Keep row: **200**, one row remains; explicit removal: **200** | Zero menu rows |
| **Deleted then restored** | `added: 1` | `added: true`: **200** | One row restored |
| **Duplicate/repeated import** | Same row matched by identity | Re-apply: **200** | Still one row; no duplicate |
| **Conflicting values** | Incoming `1700` against owner `1500` becomes a conflict with both readings | Keep owner: **200**; later explicit source decision: **200** | Owner value preserved, then `1700` with website provenance and a recorded `source` decision |
| **Multiple owner corrections** | — | PATCH `1400`, then PATCH `1600` | Latest owner value wins; original `12.00` and owner date retained |
| **Fresh login after import** | — | Real login, dashboard **200** | One row, approved price **1300**, deleted row not resurrected |

### 3.1 Conflict presentation

The conflict response carries both values, the field, the owner value and the incoming source value. The browser conflict UI audit (13/13) confirmed:

- both conflicts are shown with four choices (two fields × two options);
- neither choice is preselected;
- the owner value and both readings are visible, with the correction date;
- owner-corrected fields are not ordinary approval checkboxes;
- an owner photo has no replacement checkbox;
- applying sends only the choice the owner made;
- an unresolved field stays the owner’s;
- taking the website value is an explicit separate decision;
- applying with no decision changes no owner field.

### 3.2 No silent overwrite

The apply path only writes a field when the owner selected it. A conflict with no resolution leaves the owner’s value intact. A stale apply is refused with **409 `version_conflict`**. Re-applying the same source does not duplicate a row.

Limitation: the website reads are deterministic fixtures. Live robots.txt handling, redirects, network failures and crawl-budget behaviour were not re-exercised in this phase.

---

## 4. Field-level provenance

A catalogue row now carries its own provenance for each field, and each variant carries provenance for its own price and availability.

### 4.1 Coverage

| Field | Default source | Evidence used | Validation |
|---|---|---|---|
| Name | Website | Structured data, visible text, metadata, owner | Validated only when tied to the item’s own record |
| Description | Website | Structured data, visible text, owner | Reported unless tied to the item |
| Price | Website | Structured data, text, variant, owner | Verified only when found in the item’s own record/card |
| Image | Unverified / website / owner | OG/public product image, owner upload | Validated for a public image tied to the item; owner image is owner-validated |
| Availability | Unverified | Variant availability when explicitly stated; owner | Unverified unless the source stated it |
| Variant price | Website | Shopify variant / structured variant | Variant-specific evidence only when the parent evidence names that variant |
| Variant availability | Website | Variant availability | Reported, not promoted to validated |

Each record stores `source`, `method`, `url` when known, `confidence` (`verified`, `reported`, `unverified`), `validated`, and an owner `at` timestamp where relevant.

### 4.2 Server ownership of provenance

- `markOwnerEdits` derives unchanged fields from the **stored** provenance, not the browser’s submitted provenance. A browser cannot relabel an unchanged website field as validated, or an unchanged owner field as website.
- A changed owner field is marked `source: "owner"`, `validated: true`.
- An owner-created row has owner provenance on name, description, price and availability; it is not given a fabricated website claim.
- Taking a website value in a conflict restores website provenance for that field only and removes it from `ownerFields`.
- Re-imports update website fields without replacing an owner-corrected field.
- Variants retain their own price/availability provenance through sanitisation and owner corrections.

### 4.3 Public boundary

`publicMenu` strips `fieldProvenance` and variant provenance from the customer payload. The rendered app test confirms the string `fieldProvenance` is absent, as is an unvalidated price amount.

### 4.4 Test evidence

Five provenance tests cover: a mixed-source row, an owner price that leaves website name/description intact, an owner photograph, an owner-created row, and a source decision that restores provenance for only the chosen field. Variant provenance is covered by `shopifyVariants.test.ts`; storage round-trips are covered by `sourcePersistence.test.ts`.

---

## 5. Concurrency and bulk operations

### 5.1 Two owner sessions

The suite opens two real owner sessions on one project.

- **Stale PATCH:** the first session saves version *n*; the second saves the same version. The second receives **409 `version_conflict`**; the first owner’s value survives. Retrying the second with the current version succeeds.
- **Catalogue saves:** the second window’s save at the old version and old `updatedAt` is **409**. This previously could pass when both saves landed in the same millisecond because only timestamps were compared. Catalogue saves now use `version + updated_at` compare-and-set and increment the version, and the returned version is applied by the dashboard.
- **Stale import apply:** an import plan made before another owner correction is refused with **409**; the newer correction survives.
- The catalogue test was run five times in a row after the fix; all passes.

### 5.2 Duplicate requests

A repeated import apply matches the existing row by identity and returns **200** without adding another row. The fresh-login read confirms one row.

### 5.3 Bulk portfolio publication

- The review page lists the suggested title and includes a required `name="confirm"` checkbox.
- `acceptAll` without confirmation returns **422** and leaves the project unaccepted.
- The public app does not contain the suggested title before confirmation.
- Confirmed `acceptAll` returns **303**, marks the project accepted, and only then does the public app include the title.
- Rejected rows are not customer catalogue rows.

The bulk confirmation UI was inspected through its rendered HTML by the route test; it was not clicked in a browser. The separate browser audit covers the field-conflict UI, not the portfolio screen.

---

## 6. Padella concept quality

### 6.1 What changed

The restaurant starter previously had only title, featured dish and action blocks. Padella’s own story was available but unused. A `dine-note` block now uses only `spec.story`, and only when it is not sample copy. It is mapped to the `note` role; no arbitrary section, marketing filler or invented restaurant fact was added.

The current generator composes three Padella concepts:

| Concept | Opening screen | Navigation | Home order |
|---|---|---|---|
| editorial | home | floating | `dine-note → dine-title → dine-actions` |
| luxe | home | bar | `dine-title → dine-actions → dine-note` |
| modern | catalogue | dock | `dine-actions → dine-note → dine-title` |

All three pass the concept validator. Every pair differs on screen/navigation architecture, section composition, catalogue presentation, detail interaction and primary journey.

### 6.2 Measurements

- Validator: **pass** for Padella and for all five sites (15 concepts).
- All 15 pairs are structural.
- Padella pair scores: `editorial/luxe 0.25`, `editorial/modern 0.1`, `luxe/modern 0.25`.
- The pairs still share the same trade functionality (`dine-actions`) and part of the block set; those are genuine limits of the current restaurant vocabulary, not failures hidden from the validator.

### 6.3 Saved evidence vs current build

`concepts-current.json` was built from the saved concept specs with the generator now in the tree; it reports `built: "current-generator"`. The earlier saved documents still show the previous Padella failure and were not modified. This report therefore distinguishes:

- **saved-document audit:** 4/5 sites pass, Padella old documents fail;
- **current-generator rebuild:** 5/5 sites pass, including Padella.

A restaurant with no story, no menu and no dish still has fewer honest blocks; the generator does not fill that gap with invented copy.

---

## 7. Remaining production-only verification

Local route tests and a local live server do not prove the following:

1. **Outbound crawl behaviour:** real DNS, TLS, robots.txt, redirects, timeouts, rate limits, crawl budget and hostile HTML. The import tests use deterministic fixtures; no live crawl was run.
2. **Production authentication transport:** HTTPS, Secure/SameSite cookie behaviour, reverse-proxy headers, real cookie expiry across browser restarts, and owner-key distribution/rotation. The live run was local HTTP.
3. **Real clock expiry:** session expiry was simulated by changing `expires_at`; no test waited for a session to age out.
4. **Production database concurrency:** local D1/SQLite in one process, not network D1, multiple regions, retries or clock skew. Two owner sessions were route-level, not two browsers on two machines.
5. **Rate limiting:** owner-login and import throttles were not stress-tested against real client IPs or shared NAT.
6. **Media upload:** the field provenance for owner images is unit-tested, but this phase did not exercise an upload through production storage/CDN.
7. **Payments, email and notifications:** not activated or exercised.
8. **Bulk portfolio UI:** confirmation was tested through the route and rendered HTML, not clicked in the browser.
9. **Deployment:** no deployment, and no production environment check, was performed.

---

## 8. Conclusion

Within the local application and deterministic fixtures:

- real owner login, logout, fresh login, expiry and cross-owner rejection behave correctly;
- corrections, source evidence, per-field provenance and conflict history survive a real session change;
- `/import/check` and `/import/apply` cover no change, changes, removals, restoration, duplicates, multiple corrections and conflicts;
- an import never silently replaces an owner-approved field;
- two owner sessions cannot silently overwrite each other, including same-millisecond catalogue saves;
- bulk publication requires an explicit confirmation and does not leak unaccepted titles;
- Padella’s current generator produces three valid, structurally distinct restaurant concepts without filler.

These are local results. They support the claim that Plattr protects owner decisions across the tested application workflows; they do not establish production readiness.
