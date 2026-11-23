# P1 — Grounded AI design generation: architecture, providers and cost

**Date:** 2026-11-23
**Status:** proposal. No model call has been made, no key configured, no dependency added, no product code changed, no deployment.
**Decision required:** provider and model, per-generation ceiling, monthly cap, data-egress policy, and approval of one additive document field (§3.6).

---

## 1. What this document answers

The P0 work made Plattr's output *belong to the business*. It did not make Plattr *understand* the business. Today the business model, the trade, the three concepts and the layout are chosen by lookup tables and regular expressions. That is why two cafés receive the same three applications, and why a jeweller with 101 photographed pieces receives the same three structures as a florist with nine.

This document proposes the smallest architecture that replaces those lookups with grounded generation while keeping the renderer, the document, the editor and the publication path exactly as they are.

It covers:

1. the current determinism, with the exact mechanism that limits each decision;
2. the target pipeline and the contract at each stage;
3. what the model may and may not produce, and how that is enforced by construction;
4. the one additive document field required for AI concepts to survive a reload;
5. a provider comparison on the criteria that decide this build;
6. sample structured output for GeeStores, validated against the shipping normaliser;
7. cost per generation at 100, 1,000 and 10,000, plus caps, caching and fallback;
8. the acceptance protocol for the five required businesses.

Nothing here is implemented. The sample files are data, not code.

---

## 2. What ships today, and exactly where it stops

### 2.1 The determinism map

| Decision | File and mechanism | Why it cannot be business-specific |
| --- | --- | --- |
| Trade from a sentence | `src/worker/prompt.ts` → `tradeFromPrompt()`, `PROMPT_NOUNS` (27 noun groups), `readPrompt()` | Scores literal nouns. It never reads audience, price position, occasion or voice. "A café in Kochi" and "a café in a business park" produce the same read. |
| Niche within a trade | `PROMPT_PRESETS` — one entry, the florist | Every other niche (jeweller, bakery, barber, physio) falls back to the trade seed. |
| Three concepts | `src/worker/directions.ts` → `DIRECTIONS`, `conceptsFor()` | Three fixed archetypes per trade, always the same three, in the same order, for every business in that trade. A café always gets daylight editorial, counter service, neighbourhood bakery. |
| Structure | `src/worker/blueprints.ts` → `BLUEPRINTS` (three), `assignments()`, `PREFERENCES` regex on the direction id | Three structural grammars, assigned by direction label and a hash of the business name. The business's actual content never influences the choice. |
| Screen set and tabs | `composeScreens()` | Same three grammars, same tab orders. |
| Palette and type | `directions.ts` palettes + `themeForDirection()` + `resolveTheme()` | Four palettes and four type stacks, reused across trades. A site's own palette can override colour, but not the layout argument. |
| Block order inside home | `composeHome()` | Selects blocks by role from the blueprint; it does not author a hierarchy for this business. |
| Copy | `buildSpec()`, flagship blueprints | Neutral trade defaults ("New in", "From the counter") plus the owner's own extracted text. |
| Design reasoning | none | There is no stage that can say *why* this business should open on one piece rather than a grid. |

Verified: `src/worker/` contains no provider reference, no `env.AI` binding and no model call. `wrangler.jsonc` binds D1 and R2 only.

### 2.2 The size of the current space

- 27 trades × 3 directions = **81 named looks**, fixed at build time.
- 3 structural blueprints, combined with direction preferences.
- The layout deck (`LAYOUT_DECK_SIZE = 2304`, 6,912 with corner language) varies *within* a chosen direction; it does not create a new design argument. Two builds of the same trade with different deck slots are still the same concept.
- Every prompt-only business in a trade shares the same three concept cards.

This is why "three genuinely different designs" is currently true *within a trade* and false *for a business*. The identity work made the content correct; it did not make the design considered.

### 2.3 The renderer's real control surface

This matters because a proposal that promises more than the renderer can express is fiction. Today, without touching `app.ts`, a build can persist and render:

| Lever | Persisted field | Read by |
| --- | --- | --- |
| Accent | `AppSpec.accent` | `renderApp` (`legibleAccent`, `inkFor`) |
| Full palette, display font, radius, light/dark | `AppSpec.design` (`DesignKit`) | `resolveTheme()` at `app.ts:1471` |
| Named look (type pairing, motif, accent style, weight, tracking) | `Doc.design.direction` | `directionFor()` → `themeForDirection()` at `app.ts:1893` |
| Type override (editorial / modern / compact) | `Doc.design.typography` | `typographyTheme()` |
| Nav model | `Doc.design.nav` | `renderApp` |
| Density | `Doc.design.density` and `AppSpec.layout.density` | `renderApp` |
| Button and card shape | `Doc.design.buttons` / `.cards` | `renderApp` |
| Hero composition, scale, section order, cards | `AppSpec.layout` (`LayoutChoice`) | merged into preview axes |
| Mobile nav drawer vs tabs, hero kind | `AppSpec.structure` (`SiteStructure`) | `renderApp` |
| Screens, tabs, initial screen | `Doc.screens[].nav`, `Doc.initialScreen` | app shell |
| Home hierarchy, block membership, per-block layout, inline style | `Doc.screens[].sections[]` | `renderApp` |
| Copy, CTA labels, catalogue section order | `DocNode.title/text/cta`, `AppSpec.menu` | `renderApp` |
| Six architecture axes (header, catalogue, cards, detail, type, imagery) | derived from `blueprintFor(spec)` | `renderApp`, `structureOf`, `validateConcepts` |

Two hard limits follow:

1. **`Doc.design.direction` is whitelisted.** `sanitizeDesign()` (`doc.ts:420`) accepts only the ids in `directionsFor(vertical)`. A model that invents `vault` loses the whole direction on reload, silently falling back to index 0.
2. **The architecture is not stored on the document.** `blueprintFor(spec)` derives it from `spec.direction` and the trade. So three AI concepts would still resolve to at most the three existing grammars, and `validateConcepts` would judge the same three grammars rather than the generated ones.

Also note the provenance conflict: `AppSpec.design` currently means *the design read from the customer's site*. Writing an AI palette into it would overwrite the very evidence P0/Stage 2 established, and `radiusScale` in `app.ts` treats any `spec.design` as imported geometry.

### 2.4 What this proposal will not pretend

- The block vocabulary is finite. AI composition is generative *within* a documented set of blocks and tokens, not arbitrary HTML or CSS. New component types remain engineering work.
- Design quality cannot be established by tests. §7 defines a human panel; automated gates only prevent regressions.
- Provider quality on *this* task is unmeasured. §4.6 makes a bake-off a precondition of the recommendation becoming a commitment.

---

## 3. Target architecture

### 3.1 Principles

1. **The model decides; the compiler writes.** The model returns design *instructions*, never markup, styles or application code.
2. **Facts come from the read, never from the model.** Prices, products, addresses, hours and policies are not in the model's output schema at all.
3. **Every output is validated before it can be stored.** Schema, enums, contrast, grounding, renderability, identity, diversity. A failed answer is discarded, not repaired into the document.
4. **Deterministic fallback is always available.** A provider outage degrades the design, never the build.
5. **One renderer, one document.** The editor, preview, published app and exports continue to read the same `Doc`. AI output becomes document and specification data.
6. **Nothing is generated twice for free.** A design set is cached by a content fingerprint and reused until the business materially changes.

### 3.2 Pipeline

```
URL ──► discovery (existing, deterministic) ──► verified dossier ─┐
                                                                  ├─► A. UNDERSTAND ─► BusinessBrief
prompt + ≤3 owner answers ──► prompt read (existing) ─────────────┘        │
                                                                          ▼
                                                          B. DESIGN SET (3 concepts)
                                                                          │
                                                                          ▼
                                                          C. COPY, grounded per field
                                                                          │
                                                                          ▼
                                          D. COMPILE (deterministic, no model)
                                     AppSpec patch + Doc + DocDesign
                                                                          │
                                                                          ▼
                                     E. VALIDATE (schema, contrast, identity,
                                        renderability, diversity, budget)
                                                                          │
                                      pass ─► 3 previews ─► owner chooses ─► existing editor/publish
                                      fail ─► bounded repair ─► fallback ladder
```

A, B and C are three bounded calls, not an agent loop. There are no tools, no browsing, no code execution and no second model deciding what to ask next. That keeps latency, cost and failure modes predictable.

### 3.3 Stage contracts

**A. Understand — `ai.business.v1`**

Input: a bounded dossier, not raw HTML.

- identity fields with their provenance (`value`, `sourceRef`, `method`, `confidence`, `needsConfirmation`);
- up to 40 verbatim source sentences, each with page and selector;
- catalogue digest: counts, currency, price spread, section labels, photograph coverage;
- available workflows derived from the read (catalogue, ordering, booking, quote, visit);
- what the read explicitly failed to establish.

Output: `BusinessBrief` with `identity`, `audience`, `offer`, `brand` (explicitly a `designHypothesis`), `workflows`, `vocabulary`, `constraints`, `uncertainties`, `questionsForOwner`.

Rules:

- every identity value must cite a `sourceRef` and may not alter the value;
- audience and personality are hypotheses with `confidence: guess` unless a source sentence supports them;
- workflows may only be marked `available` when the read or the owner established them;
- `questionsForOwner` is capped at three, ordered by design impact, and must exclude anything already extracted.

**B. Design set — `ai.design-set.v1`**

Output: exactly three `ConceptSpec` objects plus a `diversityClaim` and `rejectedAlternatives`.

Each concept carries the nine axes the brief asks for:

| Axis | Fields |
| --- | --- |
| Typography | display family, body family, price treatment, weight, tracking |
| Colour | bg, surface, surface2, ink, muted, accent, on-accent, dark |
| Navigation | model, initial screen, tab list, labels |
| Hero composition | composition, scale, media treatment |
| Content hierarchy | ordered block roles and their emphasis |
| Product presentation | presentation, card grammar, columns, aspect, price treatment, image fit |
| Screen structure | which screens exist, which are tabs, what opens |
| Component design | button/card shape, dividers, radius, motif, accent style |
| Spacing and rhythm | density, section gap, block padding |

Plus, per concept: `rationale.for`, `rationale.whyThisBusiness`, `rationale.tradeOff`. A concept without a stated trade-off is rejected: three designs that are all "best" are three designs that were not reasoned about.

**C. Copy — grounded per string**

Every generated string is an object, not a bare string:

```json
{ "text": "One piece at a time", "basis": "structural" }
{ "text": "GeeStores", "basis": "verbatim", "sourceRef": "json-ld:name" }
{ "text": "Hand-finished in Jaipur", "basis": "owner-approval", "requiresOwnerApproval": true }
```

- `verbatim` must appear exactly in the dossier.
- `structural` may name a section, an action or a layout ("The collection", "See every piece") but may make no factual claim.
- `owner-approval` is displayed to the owner as a suggestion and is never published unconfirmed.

Any string containing a number, currency symbol, price, material, place, certification, policy or availability claim must be `verbatim`; otherwise the validator rejects it.

**D. Compile — deterministic**

A pure function maps `ConceptSpec` → `{ specPatch, doc, docDesign }`. It:

1. resolves the concept's registered fallback direction for fields the renderer already understands;
2. writes the design tokens and architecture into the additive document field (§3.6);
3. emits `DocNode`s with stable ids, explicit layouts and styles;
4. selects only screens the build actually has (no Visit screen without an address; no Book screen without a booking workflow);
5. attaches catalogue items by `itemRef`, never by copied name or price;
6. runs `normalizeDoc`-equivalent sanitisation before the document is stored.

The compiler is the only writer. The model cannot address a `DocNode` directly.

**E. Validate — refuse, do not repair**

| Check | Source |
| --- | --- |
| JSON schema and enums | provider strict schema + a local schema |
| Every quote present in the dossier | grounding validator |
| No forbidden field (price, product, policy) | schema by construction |
| Palette contrast: ink/bg ≥ 4.5, muted/bg ≥ 3, accent/on-accent ≥ 4.5 | `contrast()` in `design.ts` |
| Font in the registry | font whitelist |
| Screens available for the established workflows | `verticalFor`, `features` |
| Identity agreement | `identityIssues()` |
| Renderability: home has ≥ 3 blocks, every node id valid, render produces no `undefined`/`NaN` | `normalizeDoc`, `renderApp` smoke test |
| Structural difference | `validateConcepts()` — no shared order, ≥ 5 architecture axes, not same opening screen + same tabs |
| Design difference | new: each pair ≥ 6 of the 9 axes, including at least one of typography/palette and one of hierarchy/screen structure |
| Budget | per-run token ceiling and monthly cap |

A schema or grounding failure gets **one** repair attempt with the validator's error appended. A second failure discards the answer and uses the fallback. Grounding failures are never retried with more creative freedom.

### 3.4 The model's output schema, and what it cannot contain

The schema has no fields for:

- prices, currency conversion, discounts;
- product, service, room or dish names;
- addresses, coordinates, opening hours, phone or email;
- policies (delivery, returns, privacy, terms);
- stock or availability;
- HTML, CSS, URLs, image data or scripts.

Those arrive from the catalogue and the specification. The model's only contact with them is a `catalogueRef` (a section index or item id) and a `sourceRef` for a quoted string.

This is prevention by construction, not a prompt instruction. A model cannot hallucinate a price into a schema that has no price field.

### 3.5 Grounding for the two input kinds

**URL builds.** The verified discovery payload is the only source of truth. The model receives provenance-carrying fields. A field with `confidence: guess` or `needsConfirmation: true` may inform a design *hypothesis* (audience, personality) but may not become a claim in copy. Conflicting prices are irrelevant to the design schema because prices never enter it. Photography is used only through the item's own `media`/`image` reference — never a stock substitute, consistent with P0.

**Prompt builds.** There is little or no verified fact. Therefore:

- identity comes from the prompt, and fields the prompt did not state stay absent;
- the catalogue is the existing labelled sample set (`sample: true`), never presented as the owner's stock;
- no stock photography on product cards (the P0 rule stays);
- the design is generated for the *kind* of business the owner described, with honest empty states rather than invented products;
- at most three questions are asked, only for what the prompt did not establish: what they sell, who it is for, and what a customer should do first. Every question is skippable; a skipped answer narrows the design, it does not block it.

A prompt build must never show another business's brand, catalogue, navigation or workflow. That is the P0 acceptance criterion and it is unchanged.

### 3.6 The one additive change the renderer needs (P1.0)

Without this, AI concepts collapse into the three registered per-trade directions on reload. The change is additive and inert for every existing document.

```ts
// doc.ts
export type ConceptTokens = {
  display: string          // from the font registry, validated
  body: string
  weight: number           // 400–800
  tracking: string         // bounded em value
  accentStyle: 'solid' | 'block' | 'underline'
  motif: 'arches' | 'rings' | 'grid' | 'circle' | 'letter' | 'stripes' | 'none'
  palette: { bg; surface; surface2; ink; muted; accent; onAccent; dark }
  radius: number           // 0–26
}

export type ConceptStructure = {
  id: string               // slug, bounded
  name: string             // 40 chars
  architecture: ConceptArchitecture   // the six existing axes
  roleSequence: BlockRole[]           // home composition, ordered
  nav: ScreenKind[]                   // tab order
  initial: 'home' | 'catalog'
}

export type DocDesign = {
  // existing fields unchanged
  concept?: { structure: ConceptStructure; tokens: ConceptTokens; source: 'ai' | 'preset' }
}
```

Resolution order in `renderApp`:

1. `doc.design.concept.tokens` when present (AI or future preset);
2. the registered direction (`doc.design.direction`) as today;
3. the trade theme.

`blueprintFor()` returns the document's `concept.structure` when present, otherwise the existing blueprint assignment. `sanitizeDesign()` validates tokens with the same contrast, font and enum rules as `cleanDesign`, so a malformed concept is dropped as a whole and the build falls back to today's behaviour.

Why not reuse `spec.design`? Because it means "the design read from their site". Overwriting it would destroy the source palette evidence and change `radiusScale` semantics. Keeping the source kit and the AI concept separate preserves both, and lets concept 1 honour the source palette while concepts 2 and 3 depart from it deliberately.

Estimated size: ~120 lines across `doc.ts`, `blueprints.ts`, `app.ts`, plus tests. No renderer rewrite, no new component types, no change to editor, publish, auth or payments.

### 3.7 Where the output lives

| Data | Storage | Why |
| --- | --- | --- |
| `BusinessBrief` | `builds.brief_json` (new column or side table) | Owner can review what the model understood and correct it without regenerating. |
| `DesignSet` | `builds.design_set_json` | The three concepts survive reload and can be re-shown after a failed choice. |
| Chosen concept | existing `spec` + `doc` | The document remains the source of truth after birth. |
| Run metadata | `ai_runs` table: id, project, stage, model, prompt version, input/output tokens, cost, latency, outcome, fingerprint | Cost control, debugging, and proving no prompt text was logged. |
| Page text | not stored by the AI layer | It already lives in the discovery record; duplicating it widens the privacy surface. |

The document is never regenerated by the model after the owner edits it. Regeneration is an explicit action that produces a *new* concept set, not a mutation of the current document.

### 3.8 Untrusted input and prompt injection

Scraped page text is hostile input. Defences, in order:

1. page text is passed as delimited data with instructions that it is data, not direction;
2. the model has no tools, no browsing and no ability to emit URLs;
3. the output schema has no field for URLs, markup or prices;
4. every enum is validated locally, so an injected "make the nav say BANK" fails the enum;
5. every copy string is grounding-checked against the dossier;
6. the compiler writes only known node kinds and sanitised text, and the renderer escapes all text (`esc`);
7. a concept that fails any check is discarded.

Residual risk: an injection can produce *bad copy inside a valid schema*. That is caught by grounding and by the owner's preview, not by trusting the model.

### 3.9 Latency and UX

Estimates, to be measured in the bake-off:

| Stage | p50 | p95 |
| --- | --- | --- |
| A understand | 1.5–2.5 s | 5 s |
| B design set (7,500 output tokens) | 9–16 s | 30 s |
| C copy | 1.5–2.5 s | 6 s |
| Compile + validate | < 200 ms | 500 ms |
| **Total, cold** | **12–21 s** | **40 s** |
| **Cached design set** | < 300 ms | — |

The brief must not block on this. The three concept cards become a single async job with three skeleton frames and honest progress copy ("Reading the collection… Choosing a hierarchy… Checking the palette…"). All three appear together: judging them separately defeats the comparison. Hard timeout 55 s, then the fallback set is shown with a plain explanation. A retry is offered once.

### 3.10 Failure ladder

| Level | Trigger | Result |
| --- | --- | --- |
| L0 cached | fingerprint match | Stored design set, $0 |
| L1 live | normal | Generated set |
| L2 deterministic | timeout, 5xx, 429 after one retry, schema twice, grounding twice, budget exhausted, flag off | Today's three directions, labelled as standard designs |
| L3 minimal | renderer/validator regression | Generic composition, honest empty states, build still possible |

Circuit breaker: three consecutive transport failures, or >5% errors over ten minutes, disables the AI stage for ten minutes. The URL-first journey is unaffected because discovery and rendering are separate.

### 3.11 Budget and abuse control

The AI stage sits behind the same protections as the live importer, not in front of them:

- AI only runs for a request that already passed the visitor and daily limits (`spendDailyBudget`, `daily_budget`, `import_budget` in `db.ts`);
- new buckets: `ai:day:<date>` (global), `ai:project:<id>` (per build), `ai:visitor:<hash>` (per visitor);
- the *maximum* estimated cost is reserved before the call and settled to actual after; a reservation that would exceed the monthly cap is refused;
- prompt builds get one free generation per visitor per day; regeneration is explicit and rate-limited;
- the cap is a stored counter, not an invoice surprise.

---

## 4. Provider comparison

### 4.1 Criteria and weights

| Criterion | Weight | Why |
| --- | --- | --- |
| Structured-output reliability | 30% | A malformed design set is a failed build; this is the dominant risk. |
| Design reasoning and composition quality | 30% | The product promise. Must be measured, not assumed. |
| Business understanding from messy site text | 15% | Wrong identity ruins every downstream choice (P0's lesson). |
| Cost per generation | 10% | At these volumes the spread is ~$1,000 per 10k; material but not decisive. |
| Latency | 10% | 7.5k tokens of structured output is the long pole. |
| Worker compatibility, limits, data handling | 5% | All four are REST-reachable; Workers AI is a binding. |

### 4.2 Prices (USD per 1M tokens, standard tier, list)

Read 18–23 November 2026 from vendor pricing pages and two independent trackers. Prices change; re-check at signup and on every invoice.

| Provider | Model | Input | Cached input | Output | Context |
| --- | --- | ---: | ---: | ---: | ---: |
| OpenAI | GPT-6 Luna | 0.10 | 0.01 | 0.50 | 1.05M |
| OpenAI | GPT-6.1 Terra | 1.00 | 0.05 | 5.00 | 1.05M |
| OpenAI | GPT-6.1 Sol | 2.00 | 0.10 | 10.00 | 1.05M |
| Anthropic | Claude Haiku 5.5 | 0.10 | 0.01 | 0.50 | 200K (0.50/2.50 above 100K) |
| Anthropic | Claude Sonnet 5.5 | 2.00 | 0.10 | 10.00 | 1M |
| Google | Gemini 3.8 Flash | 0.75 | 0.075 | 3.75 | 1.05M (doubles 1 Jan 2027) |
| Google | Gemini 3.5 Flash-Lite | 0.30 | 0.03 | 2.50 | 1.05M |
| Cloudflare | Workers AI `gpt-oss-120b` | ~0.35 | — | ~0.75 | model-dependent |
| Cloudflare | Workers AI `llama-3.1-8b-instruct-fp8-fast` | ~0.28 | — | ~0.83 | 128K |

Workers AI is billed in neurons: $0.011 per 1,000, with 10,000 neurons/day free; per-model neuron rates differ (for example `llama-3.1-8b` is 25,608 neurons per 1M input and 75,147 per 1M output, which is where the derived dollar figures above come from).

### 4.3 Capability matrix

| Criterion | OpenAI | Anthropic | Google Gemini | Workers AI |
| --- | --- | --- | --- | --- |
| Strict JSON schema | Yes — `json_schema` with `strict: true`, plus refusals surfaced | Yes — `output_config.format` JSON outputs and strict tool use | Yes — `responseSchema` / `responseMimeType` | Model-dependent; several current models advertise structured outputs, but validate locally and expect more drift |
| Business understanding | Strong | Strong; strongest instruction-following at small sizes in our earlier review | Strong; 1M context can hold an entire crawl in one call | Adequate on 8B, good on gpt-oss-120b; weaker on long multi-constraint prompts |
| Design reasoning | Unmeasured on our corpus | Unmeasured on our corpus | Unmeasured on our corpus | Unmeasured; smallest models drift on long design instructions |
| Copy quality | Strong | Strongest per dollar at the small tier in our earlier review | Good; sometimes verbose | Weakest at 8B |
| Context | 400K–1.05M | 200K–1M | 1.05M | often 128K |
| Latency for 7.5k output | Not measured | Not measured | Fastest on very long input; output-bound like the rest | Lowest network hop; model speed varies |
| Rate limits (published) | Build tier ~5,000 RPM and ~1M TPM on Terra-class models | Start tier 2M ITPM / 400K OTPM; RPM reported between 1,000 and 4,000 depending on snapshot; **$500 monthly spend cap on Start** | Per-project RPM/TPM/RPD by model and tier; free tier is small | 300 text-generation requests/min; 10,000 neurons/day free |
| API from a Worker | REST via `fetch`; no SDK needed | REST via `fetch`; no SDK needed | REST via `fetch`; no SDK needed | Native binding, no key, no egress |
| Data handling | DPA, zero-retention option on enterprise | DPA, no training on API data by default | DPA, regional endpoints | Stays inside the Cloudflare account |
| Deprecation risk | Moderate | Moderate | Moderate; promotional pricing ends 1 Jan 2027 | Highest; model catalogue churns |

Two honest notes:

- The RPM figures for Anthropic's Start tier conflict across sources read this week (1,000 vs 4,000). At our volume (≈1 request/second burst) it is not binding; the number must be read from the console at signup.
- No source establishes design quality for this task. That is exactly what §4.6 measures.

### 4.4 Cost per generation

Assumption per business (one cold generation, three concepts):

| Stage | Input tokens | Output tokens | Includes |
| --- | ---: | ---: | --- |
| A understand | 9,000 | 1,400 | system + schema + dossier + 40 source sentences |
| B design set | 12,000 | 7,500 | system + schema + dossier digest + 3 concepts × ~2,000 tokens JSON |
| C copy | 6,000 | 2,200 | design set + source spans for grounded strings |
| **Total** | **27,000** | **11,100** | ~108 KB in, ~44 KB out |

Retry allowance: ×1.25 (one transport retry on a quarter of calls). This is *not* a worst case; worst case is ~$0.40 with two full regeneration attempts.

| Pipeline | Per generation | 100 | 1,000 | 10,000 |
| --- | ---: | ---: | ---: | ---: |
| Claude Haiku 5.5 or GPT-6 Luna, all stages | $0.010 | $1.03 | $10.31 | $103 |
| Workers AI `gpt-oss-120b`, all stages | $0.022 | $2.22 | $22.19 | $222 |
| Gemini 3.5 Flash-Lite | $0.045 | $4.48 | $44.82 | $448 |
| Gemini 3.8 Flash (2026 price) | $0.077 | $7.73 | $77.30 | $773 |
| Gemini 3.8 Flash (from 1 Jan 2027) | $0.154 | $15.46 | $154.60 | $1,546 |
| GPT-6.1 Terra, all stages | $0.103 | $10.31 | $103.10 | $1,031 |
| **Claude Sonnet 5.5 design + Haiku 5.5 understand/copy (recommended)** | **$0.128** | **$12.79** | **$127.90** | **$1,279** |
| Claude Sonnet 5.5, all stages | $0.206 | $20.63 | $206.30 | $2,063 |

The difference between the cheapest credible pipeline and the most expensive is about $1,900 at 10,000 builds — under two engineering days. **Reliability and design quality should decide this, not the token line.**

Non-model infrastructure (unchanged by AI): Workers requests/CPU ~$25–60/mo at 10k builds, R2 derivatives ~$5, D1 ~$5–15, email ~$10–20. The AI stage adds one to three subrequests per build and no new storage of consequence.

### 4.5 Recommendation

**Primary: Anthropic, two models, one contract.**

- **Claude Sonnet 5.5** for the design set (B). This is the stage that must reason about this business and produce three coherent, defensible concepts in one JSON object. It is the only stage where the mid-tier price is justified: ~$0.099 of the $0.128.
- **Claude Haiku 5.5** for understanding (A) and copy (C). Both are bounded, evidence-quoting tasks; the cheap tier is appropriate and ~$0.003 combined.

Why Anthropic over the alternatives:

- strict JSON outputs plus strict tool use give two independent ways to constrain the answer;
- strongest instruction-following and copy quality at the small tier, based on the earlier provider review in this repo — and the copy stage is where genericness shows;
- one provider, one error model, one retry policy, one invoice;
- 1M context on Sonnet means the whole crawl can be passed when needed, without a second vendor.

Why not the others as primary:

- **OpenAI GPT-6.1 Terra** is the strongest alternative and ~20% cheaper ($0.103). If the bake-off shows equal design quality, switch: the abstraction makes it a one-file change. Do not decide on price before measuring.
- **Gemini 3.8 Flash** is cheaper today but doubles on 1 January 2027, and its advantage is long-context reading, which our dossier already solves by pre-extracting.
- **Workers AI** is the right *fallback and classification* path: no key, no egress, free tier sufficient for a small volume. It is not the right primary for design copy: smaller open models drift on long, multi-constraint design instructions, and its model catalogue changes most often.

### 4.6 The bake-off that must precede commitment

Before any production rollout, and before the recommendation is treated as settled:

- corpus: the five acceptance businesses plus fifteen additional real sites (mixed trades, one JS-only failure, one robots-blocked, one empty catalogue);
- each pipeline runs twice on the same dossier with the same prompt version;
- blind review: two reviewers score the 3 × 20 concepts on the §7 rubric without seeing the model name;
- measured: schema pass rate, grounding rejection rate, repair rate, p50/p95 latency, tokens and cost per accepted set, and how often all three concepts pass the diversity gate first time;
- decision rule: choose the cheapest pipeline whose first-pass schema rate is ≥ 95% and whose human craft score is within 0.3 of the best. If none reaches 95%, the architecture is right and the prompt/schema needs work before launch.

Trial cap: **$30** (≈100–150 generations across two pipelines, including retries).

---

## 5. Sample structured output — GeeStores

Files:

- [`p1-ai-proposal/geestores.business.json`](p1-ai-proposal/geestores.business.json) — stage A
- [`p1-ai-proposal/geestores.design-set.json`](p1-ai-proposal/geestores.design-set.json) — stage B, three concepts
- [`p1-ai-proposal/geestores.compiled.json`](p1-ai-proposal/geestores.compiled.json) — stage D, per-concept specification and document

### 5.1 Input facts used

From the Stage 2 live read of `https://geestores.com/`: 10 pages, 101 catalogue entries, 101 priced, 71 with their own photograph, currency INR, name `verified` from JSON-LD, category `Jewellery shop` `likely` from visible text, no enquiry flow, no address established. No product name or price is reproduced in the design sample, because the design schema cannot carry one.

### 5.2 What the model understood

`geestores.business.json` returns identity with provenance, audience as an explicit guess, the catalogue facts, four workflows (two available, two not, each with a reason), a brand hypothesis flagged `designHypothesis: true`, a vocabulary, a `mustNotInvent` list, and exactly two owner questions. It does not ask for the name, category, currency or catalogue — the read already established those.

Representative fragment:

```json
"audience": {
  "primary": {
    "value": "Phone-first gift and occasion buyers",
    "basis": "inferred",
    "confidence": "guess",
    "evidence": ["the storefront is mobile-first",
                 "prices are published in INR",
                 "no appointment, booking or consultation flow was found"]
  },
  "confirmed": false
}
```

### 5.3 The three concepts

| | **The Vault** | **The Counter** | **Festival** |
| --- | --- | --- | --- |
| Argument | A piece is an exhibit | A piece is stock to compare | A piece is a gift |
| Audience | First-time gift buyer | Repeat/local buyer | Wedding or milestone buyer |
| Type | Playfair Display / Inter / display prices | Space Grotesk / Inter / tabular prices | Avenir Next Condensed / Space Grotesk / mono prices |
| Palette | near-black #101110, metallic #b8863f | paper #fbfaf7, deep red #8a1c2b | sand #f3ede2, deep green #1f4f45 |
| Nav | floating bar, home first | bottom dock, catalogue first | top bar, search in the bar |
| Hero | title, then one tall portrait | compact split, search + 2-up | photograph first, words after |
| Hierarchy | lead > discovery > action > utility | utility > discovery > action > lead | discovery > lead > utility > action |
| Catalogue | 1-up journal, portrait | 2-up square grid | staggered 2-up, wide campaign cards |
| Components | soft cards, hairlines | square cards, no dividers | round cards, no dividers |
| Rhythm | roomy, large gaps | cozy, tight gaps | roomy, immersive opening |
| Trade-off stated | slower to scan | no ceremony | least efficient for a known piece |

The design-set file also records three deliberately rejected alternatives: a fabricated origin claim (`ungrounded_claim`), a printed price (`schema_forbidden_field`), and a Visit screen with no address (`screen_unavailable`). A proposal that only shows accepted output hides the part that matters.

### 5.4 Validation actually run

A temporary script (since deleted) loaded the three sample files and ran the **shipping** validators, not a mock:

| Check | Result |
| --- | --- |
| `identityIssues()` for shop + "Jewellery shop" + site trade shop | pass |
| `contrast()` ink/bg per concept | 16.77, 17.50, 14.29 (≥ 4.5) |
| `contrast()` muted/bg per concept | 6.83, 5.02, 4.30 (≥ 3) |
| `contrast()` accent/on-accent per concept | 5.88, 9.20, 9.28 (≥ 4.5) |
| `cleanLayout()` accepts all three axis sets | pass |
| `cleanStructure()` accepts all three nav/hero structures | pass |
| `normalizeDoc()` keeps each registered direction and all four home blocks | pass |
| `validateConcepts()` on the three normalised documents | **pass** — 7 architecture axes differ for every pair, no shared order |
| Distinct home order per concept | pass |

This proves the sample is *renderable today* on the existing path, not merely well-formed JSON. It does not prove the concepts are premium, and it does not prove the model would produce them — the model has not been called.

### 5.5 What the sample cannot do without P1.0

Each concept is mapped to a registered direction (`editorial`, `minimal`, `lifestyle`) so the shipping normaliser accepts it. The AI-authored architecture, role sequence and full token palette sit in `requiresP1`, which today's `sanitizeDesign` would drop. That is the honest boundary: **without §3.6, the AI can author palette, type, density, shape, hierarchy, copy and screens, but its structural grammar still resolves to the three existing blueprints.**

With §3.6, the same sample stores its own architecture and role sequence, and `validateConcepts` judges the generated structures rather than the three blueprints. The block vocabulary remains finite; that limit is stated in §2.4 and is not hidden.

---

## 6. Cost control

### 6.1 Recommended limits

| Item | Recommendation |
| --- | --- |
| Provider / model | Anthropic Sonnet 5.5 (design) + Haiku 5.5 (understand, copy) |
| Ceiling per generation | $0.18 soft, $0.40 hard (two full attempts) |
| Trial cap | $30 (bake-off) |
| Monthly cap at launch | **$200** — ≈1,500 generations at $0.128, ~50% headroom over 1,000 builds |
| Monthly cap at 10,000 builds | **$2,000** |
| Daily sub-cap | $15, to stop a runaway loop inside one day |
| Per-visitor | one free generation/day; regeneration explicit and rate-limited |

The $200 cap sits comfortably under Anthropic's published Start-tier $500 monthly spend cap, so an internal cap is the binding one — which is how it should be.

### 6.2 Caching

| Cache | Key | TTL | Saves |
| --- | --- | --- | --- |
| Discovery | URL + content hash | 7 days | Re-crawl and re-extraction |
| Design set | hash(identity facts + catalogue fingerprint + prompt version + model id) | until content changes | The whole generation (~$0.128) on every re-render, reload and preview |
| Provider prompt cache | static system + schema + few-shot (~4,000 tokens) | provider-managed | ~6% of the design call |
| Chosen build | document | forever | Nothing is regenerated after the owner edits |

Owner edits never invalidate the design set. Re-import that changes material facts does. At a 30% cache hit rate the effective cost falls from $0.128 to about $0.090 per build; demo and trial traffic should hit far more often than production first-builds.

### 6.3 Retry and fallback

- transport 5xx / 429 / network: one retry with jitter, honouring `retry-after`;
- schema failure: one repair with the validator error;
- grounding failure: no creative retry — discard and fall back;
- timeout: 25 s per call, 55 s per set;
- circuit breaker: 3 consecutive failures or >5% errors over 10 min → 10 min open;
- fallback: today's deterministic three directions, clearly labelled, never an empty page;
- a fallback costs $0 and still produces a publishable app.

---

## 7. Design quality acceptance

Automated gates prevent regressions. They cannot establish quality, and this proposal does not claim it.

### 7.1 Businesses

| # | Input | Identity constraint the run must prove |
| --- | --- | --- |
| 1 | `https://geestores.com/` | Jewellery/e-commerce, INR, own photography, no invented materials or policies |
| 2 | `need a website for a cafe in kochi` | Café, Kochi locality, sample menu labelled, no stock photos, no invented table-booking promise, no jewellery or florist vocabulary |
| 3 | `https://www.bluetitlondon.com/` | Salon, services and booking, no invented prices or staff |
| 4 | `florist in Fort Kochi doing wedding flowers` | Florist, wedding workflow, delivery question asked not assumed |
| 5 | `small accounting practice in Leeds, fixed monthly fees for Ltd companies` | Professional services, quote/enquiry workflow, no invented fee amounts or credentials |

Each journey is run cold (empty storage, fresh project) and then reloaded. The P0 isolation checks still apply: two tabs, two businesses, no leakage; a new project starts empty.

### 7.2 Capture protocol

- 390 × 844 and 1440 × 900.
- Per business: all three concepts at home, catalogue and detail — 9 screens per width, 18 per business, 90 total. The 30 home captures are mandatory; the rest are supporting evidence.
- Same seeded catalogue and photographs across the three concepts, so the only variable is design.
- Full-page captures, plus one above-the-fold crop per concept at 390 for the comparison sheet.
- `journey.json` per business: input, identity, brief, design set, concept ids, timings, tokens, cost, validator outcomes, chosen document, save/reload result.
- Stored under `docs/qa/p1-ai-<date>/`; no production data.

### 7.3 Differentiation rubric

Machine gate (must pass before review):

- `validateConcepts().ok` — no shared home order, ≥5 architecture axes differ, not same opening screen plus same tabs;
- each pair ≥ 6 of the 9 design axes differ, including at least one of typography/palette and one of hierarchy/screen structure;
- no concept reuses another's exact palette or type pairing.

Human review (two reviewers, blind to the model):

| Criterion | 1–5 | What a 5 means |
| --- | --- | --- |
| Identity fit | | A local customer would recognise the business in the design |
| Hierarchy | | The first screen answers the buyer's first question |
| Craft | | Type, spacing and imagery are deliberate at 390 and desktop |
| Originality | | Not recognisably one of Plattr's old trade templates |
| Content honesty | | Nothing on screen claims what the source did not establish |
| Usability | | Contrast, tap targets, label clarity, no dead ends |

Pass: mean ≥ 3.5 with no criterion below 3, for every concept. A "premium" claim requires mean ≥ 4 on Craft and Identity fit across all 15 concepts. Any concept that fails is regenerated or replaced; the failure is recorded, not averaged away.

### 7.4 What counts as a failed generation

- two concepts share an opening screen, tab set and home order;
- any ungrounded fact, price, policy or product;
- a screen for a workflow the business does not have;
- contrast below the gate, or a tap target below 44px;
- a palette or type pairing that reads as the same design recoloured;
- provider failure that surfaces as an empty or broken page rather than the fallback.

---

## 8. Risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Hallucinated business facts | Medium | High | No fact fields in the schema; verbatim quote checks; owner preview |
| Prompt injection from scraped pages | Medium | Medium | Data delimiters, no tools, enum validation, grounding, escaped render |
| Three concepts converge on one design | Medium | High | Diversity gate + design-axis rubric; regeneration, not acceptance |
| Cost runaway / abuse | Low | Medium | Reservations, daily/monthly caps, per-visitor quota, circuit breaker |
| Provider outage at peak | Medium | Medium | Deterministic fallback, cached sets, breaker, no build blocked |
| Latency makes the brief feel broken | Medium | Medium | Async job, skeletons, 55 s timeout, cached path |
| Model deprecation changes output | High over a year | Medium | Prompt version + model id in the fingerprint; bake-off on change; provider abstraction |
| Customer page text leaving Cloudflare | Policy | High | Owner decision required; if refused, Workers AI only and quality expectations reset |
| Copyright in typefaces | Low | Medium | Font registry limited to families already used or system-safe; no webfont embedding without a licence |
| Accessibility regression from generated palettes | Medium | High | Contrast gate, tap-target checks, the existing trade-matrix harness |
| Over-fitting to five businesses | Medium | Medium | 20-site bake-off corpus, including failure paths |

---

## 9. Implementation plan (after approval)

| Phase | Work | Files | Exit criterion |
| --- | --- | --- | --- |
| P1.0 | Document-level concept tokens and structure; sanitise; resolve; tests | `doc.ts`, `blueprints.ts`, `app.ts`, `tests/doc.test.ts` | Existing suite green; no behaviour change when `concept` absent |
| P1.1 | Provider abstraction, fake provider, budget reservation, run log | `src/worker/ai/provider.ts`, `budget.ts`, `db.ts` | Contract tests with a mocked provider; $0 spend |
| P1.2 | Schemas, prompts, validators, golden fixtures | `src/worker/ai/contracts.ts`, `validate.ts`, `prompts/` | Fixtures pass; every rejection case covered |
| P1.3 | Compiler, persistence, async preview route, reload | `src/worker/ai/compile.ts`, `index.ts`, `views/brief.ts` | Three concepts survive reload; fallback proven |
| P1.4 | Bake-off on 20 sites + 5 acceptance businesses | `scripts/` | Schema ≥95%, rubric scores, measured cost |
| P1.5 | Shadow mode, then 10% rollout | flags | No regression in publish or isolation; cost within cap |

Roughly two engineering weeks. No production deployment in this proposal; production release `7f3f33af-b49a-4d69-993b-46e31269a087` and rollback `ab5bec21-11e9-47f2-9fa0-e3a2ee43e7d3` are untouched.

**Untouched by design:** authentication, owner sessions, payments, publication gates, versioning, the editor bridge, media storage, the discovery crawler and its provenance model. AI output is data on the existing path, not a second renderer.

---

## 10. Approval requested

| # | Decision | Recommendation |
| --- | --- | --- |
| 1 | Provider and models | Anthropic Sonnet 5.5 for design, Haiku 5.5 for understanding and copy |
| 2 | Per-generation ceiling | $0.18 soft / $0.40 hard |
| 3 | Monthly cap | $200 at launch; $30 trial for the bake-off |
| 4 | Data egress | May bounded, already-extracted page text leave the Cloudflare account? If no: Workers AI only, and design quality expectations must be reset |
| 5 | P1.0 renderer change | Approve the additive `DocDesign.concept` field (§3.6) |

Until those are answered: no key, no dependency, no paid call, no code change.

---

## 11. Limitations of this proposal

1. **No model has been called.** Every quality statement is a hypothesis. The bake-off is the measurement, and the recommendation is conditional on it.
2. **Design-reasoning quality is unmeasured for all four providers on this task.** Nothing in the public material establishes it; only blind review on our corpus can.
3. **The block vocabulary is finite.** AI composition is generative within documented blocks and tokens; new component types remain engineering work.
4. **Without P1.0, AI structural choices collapse to the three existing blueprints on reload.** The sample demonstrates both the working part and this boundary.
5. **Prompt builds have no verified facts.** Their catalogues are labelled samples and their photography is absent by design; three of the five acceptance businesses therefore test design reasoning more than extraction.
6. **Rate-limit figures conflict across sources** and must be read from the provider console at signup.
7. **Prices are list prices from 18–23 November 2026.** Gemini's promotional price ends 1 January 2027; every figure must be re-checked before commitment.
8. **No accessibility, performance or publish regression testing has been run for this proposal**, because no code changed.
