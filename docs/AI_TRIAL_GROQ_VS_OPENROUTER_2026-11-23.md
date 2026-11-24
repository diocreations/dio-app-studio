# The paid AI trial: Groq vs OpenRouter

Status: **one live attempt made and stopped by the grounding guard.** The first
paid generation (Yarmouth Oilskins / direct Groq, prompt
`plattr-design/2026-11-23.1`) was billed $0.0010698 and refused `brief_invalid`;
the matrix stopped and the remaining eight cells were never sent. Nothing is
deployed, and Plattr's shipped generation path remains AI-free.

Generated: 2026-11-23. Revision 2 adds endpoint attribution and a controlled
pinned arm. This document replaces the earlier trial drafts, which named the
wrong provider. Revision 3 replaces the synthetic GeeStores retail fixture with
the real saved Yarmouth Oilskins crawl. Revision 4 corrects the understand
prompt (`plattr-design/2026-11-24.1`): sourced facts stay sourced facts, and
assumptions describe only what the dossier does not say.

### Trial businesses and provenance

The nine generations use three real saved crawls. No scenario uses the
synthetic GeeStores `.example` fixture or any invented product, price, policy or
workflow.

| Scenario | Business | Source | Saved crawl | Facts carried into the trial |
| --- | --- | --- | --- | --- |
| Product retail | Yarmouth Oilskins | <https://yarmouthoilskins.com/> | `docs/qa/generation-benchmark-2026-11-21/yarmouth` | 74 products; 74 priced; 74 with photographs; GBP; `browse`/`buy` |
| Professional services | Architecture for London | <https://www.architectureforlondon.com/> | `docs/qa/generation-benchmark-2026-11-21/afl` | Saved service/journal crawl; GBP; `browse`/`book`/`quote` |
| Bookings | Padella | <https://www.padella.co/> | `docs/qa/generation-benchmark-2026-11-21/padella` | Saved restaurant/location crawl; GBP; `browse`/`buy`/`book`; no menu or prices were captured |

The Yarmouth spec is the `editorial` saved concept. Its crawl records the
business name as `yarmouthoilskins`; the trial labels the scenario **Yarmouth
Oilskins**. The lowercase app heading is a known discovery artifact from that
source, not a fabricated fact. The trial harness sends the same saved `AppSpec`
and dossier to every arm; only provider routing differs.

The deterministic `designSetFor` template remains a **mock-only** stand-in for
mocked runs. It is not a `TrialBusiness` and is never passed to a live provider
as business input.

## 1. What is being compared

Two gateways serving the **same model**, with the same prompts, stages, JSON
schemas, output ceilings and reasoning allowance. This is a **provider-routing
and gateway comparison**, not a gateway-only comparison: OpenRouter's
`sort: "price"` chooses among same-model endpoints and does not guarantee a
specific vendor.

| Arm | Endpoint | Key | Model ID | Routing |
| --- | --- | --- | --- | --- |
| Primary | `https://api.groq.com/openai/v1/chat/completions` | `GROQ_API_KEY` | `openai/gpt-oss-120b` | direct, no gateway |
| Primary | `https://openrouter.ai/api/v1/chat/completions` | `OPENROUTER_API_KEY` | `openai/gpt-oss-120b` | cheapest eligible endpoint (`sort: price`, fallbacks allowed) |
| Controlled | the same OpenRouter endpoint | `OPENROUTER_API_KEY` | `openai/gpt-oss-120b` | pinned to Groq (`only: ["Groq"]`), fallbacks disabled |

Because the model is identical, a difference in grounding, diversity, latency or
cost is a difference between the gateways and the endpoints they select — not
between two model families. The primary Groq-versus-OpenRouter result answers
the practical question: what a customer would get and pay. The controlled arm
removes routing as a variable by pinning OpenRouter to Groq's endpoint.

Every response's serving endpoint is recorded per stage and per generation
(`servedProviders`, and `providerServed` on each call). Unpinned routing that
does not report its endpoint is not attributed to a vendor; a pinned call served
by anything other than Groq is refused as `provider_mismatch` and still charged.

`scripts/ai-trial.mjs` runs the three saved-crawl businesses × three arms = nine generations.

## 2. Model IDs and prices (read 2026-11-23)

### Groq — `openai/gpt-oss-120b`

Source: <https://console.groq.com/docs/models> and
<https://console.groq.com/docs/structured-outputs>.

| Property | Value |
| --- | --- |
| Input | $0.15 per 1M tokens |
| Cached input | $0.075 per 1M tokens |
| Output | $0.60 per 1M tokens |
| Context | 131,072 tokens |
| Max completion | 65,536 tokens |
| Structured output | `json_schema` with `strict: true` (constrained decoding) |
| Reported speed | ~500 tokens/second |

Groq reports tokens, not dollars, so the adapter prices the reported usage at
this published rate. The rate is not a guess: it is the production price on the
page above.

### OpenRouter — `openai/gpt-oss-120b`

Source: <https://openrouter.ai/openai/gpt-oss-120b> and the per-endpoint listing.

| Property | Value |
| --- | --- |
| Inference markup | none; the endpoint price is passed through |
| Cheapest standard endpoints | $0.03 input / $0.15 output per 1M |
| Dearest listing for this model | $0.35 input (Cerebras) / $0.95 output (SambaNova) |
| Context | 131,072 tokens |
| Billing | `usage.cost` in the response is the charge that is settled |
| Account fee | 5.5% on credit purchases; inference itself is not marked up |

Routing for the primary arm is `sort: price`, `allow_fallbacks: true` within the
same model, `require_parameters: true`, `data_collection: "deny"`. The
reservation uses the dearest listing ($0.35 / $0.95) so the $0.40 generation cap
cannot be made nominal by an expensive endpoint; settlement uses what was
actually reported.

The controlled arm sends `only: ["Groq"]`, `allow_fallbacks: false`, so the
only endpoint that can answer is Groq's. Its price is Groq's own $0.15 / $0.075
/ $0.60, and any other serving endpoint is refused. OpenRouter's 5.5% credit
purchase fee is paid when credits are bought, not per call, and is not part of
the per-generation charge.

## 3. The gate

`src/worker/ai/trial.ts` refuses to build a provider unless **all** of these are
true:

- `GROQ_API_KEY` is present;
- `OPENROUTER_API_KEY` is present;
- `PLATTR_AI_TRIAL=approved` is set;
- live mode was started with `--approve-trial`.

A comparison needs both keys, so one key alone is refused as `no_keys` and names
the missing variable. Every refusal happens before a socket is opened. Keys are
read from `.dev.vars` (gitignored) or the environment; they are not logged, not
returned in a result object, and not placed in a request body. Tests assert all
three, and that each gateway receives only its own key.

## 4. The budget

| Rule | Value | Where enforced |
| --- | --- | --- |
| Whole trial | $30.00 | atomic claim in `ai_trial_spend` |
| Soft limit per generation | $0.18 | before the optional copy pass |
| Hard reservation ceiling per generation | $0.40 | in-process ledger, before each attempt |

The CLI keeps this pool in `.chrome-qa/ai-trial-spend.sqlite`; `ai_trial_spend` is
not part of the production runtime schema. `migrations/0002_ai_trial_spend.sql`
is only for a deliberate local D1 store, not for a deployment.

Before a generation starts, it reserves its hard ceiling against the pool in one
statement whose `WHERE` carries the $30 total. On every exit path — success,
validation failure, crash — the reservation is replaced with the actual charge.
There is no top-up code and no credit purchase. The $0.40 figure is a reservation
and budget ceiling, **not an absolute provider invoice cap**: a provider-reported
charge above an attempt's reservation is still booked and shown in the report,
`overReservedUsd` records the excess and `withinHardCap` becomes false.

Worst-case ceiling for one full generation at these token ceilings:

| Arm | Reservation price in/out per 1M | Ceiling per generation |
| --- | --- | --- |
| Groq (primary) | $0.15 / $0.60 | about $0.013 |
| OpenRouter, cheapest (primary) | $0.35 / $0.95 | about $0.023 |
| OpenRouter pinned to Groq (controlled) | $0.15 / $0.60 | about $0.013 |

At these prices the $0.18 soft limit is a guard rather than a likely stop, and
nine generations cost cents against the $30 pool.

Every HTTP attempt, including a failed or retried one, reserves separately and
is reconciled in the report: `reservedUsd`, `chargedUsd`, `retainedUsd`,
`accountedUsd`, `maxAttemptReservedUsd`, `withinHardCap`,
`chargedWithinReservation`, `uncertainAttempts`, `retried` and `failedCalls`. A
truncated or wrongly-routed answer is charged before it fails, so a refusal
cannot look free. `retried` means one stage called the provider more than once;
`failedCalls` counts attempts that produced no call, so three successful stages
in one generation is not a retry.

A failed HTTP call keeps why it failed: the status, an allow-listed subset of
the provider's error object (`code`, `type`, and `param` when it is a parameter
path), the output ceiling, reasoning effort and schema digest it was sent, and a
bounded (2,000-character), sanitized excerpt including `failed_generation` when
the gateway returns one. Unknown and nested provider fields are dropped, not
sanitized, so nothing the adapter did not approve can reach the report.
Free provider prose is not kept at all: `message` is excluded even though it is
usually the most descriptive field, because provider text can echo the request
or a credential and no pattern makes arbitrary prose safe. `code` and `type` are
kept only when each is a single classification identifier — letters, digits, `_`
and `-`, at most 120 characters, no segment longer than 40 — so prose,
whitespace, newlines, URLs, JSON and credential-shaped values are omitted rather
than sanitized into something that reads like a classification. `param` is kept
only when it matches a conservative parameter-path character set (letters,
digits, `_`, `.`, `[`, `]`, `-`, up to 200 characters); anything else is omitted.
Credentials, Bearer tokens and key-like values are redacted before anything is
written, and no excerpt is longer than its limit.

A retained `failed_generation` is provider-supplied diagnostic content. It is
sanitized and capped, but pattern-based redaction is not a guarantee that every
sensitive value has been removed, so treat a report that contains one as
sensitive material.

### Uncertain charges are never refunded

An attempt is classified before its reservation is settled:

| What happened | Classification | Effect on the budget |
| --- | --- | --- |
| Usage and a charge are known (reported `usage.cost`, or reported tokens priced at the published rate) | `billed` | Settle the confirmed charge |
| The request was refused locally, before it was sent (for example a missing key) | `not_billed` | Release the reservation |
| Timeout, dropped connection, unreadable response, any non-2xx without billing information (including 4xx), a 2xx body with no usable usage, or an attempt with no billing classification at all | `unknown` | **Keep the reservation as spent** |

A timeout or dropped connection may have reached the provider and been billed;
an answer without usage cannot be priced. In both cases the reservation is
retained (`retainedUsd`) rather than released, so an uncertain attempt is
visible in the report and can never silently refund itself. A retry takes its
own reservation: the first, uncertain attempt stays in the budget alongside the
retry. A 5xx or 4xx body that does report `usage.cost` is charged before it is
classified, and OpenRouter's `no choices` branch now preserves a reported
`usage.cost` before throwing.

The $0.40 reservation ceiling and the $30 pool are enforced against the ledger
that includes retained amounts, so an uncertain charge consumes budget exactly
as a worst-case reservation would. The report shows actual provider-reported
charges, retained reservations, any `overReservedUsd`, and whether the
reservation ceiling was met; it does not claim that an invoice cannot exceed it. A successful generation settles the persistent
pool with the ledger's accounted amount — confirmed charges **plus** retained
reservations — not with the sum of the calls that happened to succeed. A
first attempt that times out and is then retried successfully therefore keeps
its reservation charged to both the generation and the trial pool, while the
report still shows `chargedUsd`, `retainedUsd` and `accountedUsd` separately.

## 5. Understanding: facts, and assumptions kept apart

`BusinessBrief` carries an explicit `assumptions[]` list (`claim`, `basis:
inference|guess`, `why`), separate from every sourced field. The validator
rejects an assumption containing a number, a currency or a claim word: an
assumption may be wrong, but it may not present itself as a fact. Grounding is
unchanged: name, trade, currency, catalogue count and workflows are checked
against the dossier; `verbatim` headings must appear in the read; structural
headings may not carry a price or a claim.

### Prompt revision and comparability

| Prompt | Used by | State |
| --- | --- | --- |
| `plattr-design/2026-11-23.1` | first live attempt, 2026-11-23 | 1 generation, `brief_invalid` (`invented_assumption`), $0.0010698 charged, 8 skipped |
| `plattr-design/2026-11-24.1` | every run from now on | adds the facts/assumptions rules and the Yarmouth worked example to the understand stage |

Prompt digest for `2026-11-24.1` (sha256 over the three system strings):
`bbfeda0b05d703230a2c45ac1e5446edb2b8f975f1658041efef9ed19ddf0fc0`. It is
recorded in `report.json` as `promptDigest` and printed in `REPORT.md`, beside
`promptVersion`. Each run also records every call's input, cached-input, output
and reasoning tokens, latency, provider and model attribution, reservation,
charge and billing class.

The two revisions are not comparable. The next nine-generation run must send
`2026-11-24.1` to all three arms and all three businesses, and `report.json`
records `promptVersion` so a run can never be attributed to the wrong
instructions. The validator and `CLAIM_WORDS` are unchanged by this revision:
the correction is instructional, not a relaxation of the grounding gate.

## 6. Generation: three real directions

The contract requires three concepts with at least six of nine axes different,
distinct type pairings, and compiled documents that are not the same sections in
the same order. A palette-only triple is refused during design validation.

The offline evaluation also exposed a real gap: a concept's navigation never
reached the compiled document for non-shop trades, so a restaurant or practice
compiled three concepts onto identical tabs, opening screen and journey.
`compileConcept` now applies the concept's tabs, opening screen and navigation
model to the document before validation, with a regression test that compiles a
restaurant and a professional practice and requires three distinct journeys.

Both gateways produce the same `DesignSet`/`CopySet` contracts, which compile to
the same `Doc` the preview, editor, saved project and publish read. There is no
second document format, renderer or save path.

## 7. Evaluation

`bun scripts/ai-trial.mjs` measures, per gateway and business:

- **factual grounding** — brief validated against the dossier, design issue
  codes listed, invented/ungrounded count;
- **input provenance** — the Yarmouth, AFL and Padella specs are the saved
  crawls named above; no `.example` or GeeStores input enters the trial;
- **business relevance** — catalogue entries, catalogue screens, workflows;
- **concept diversity** — pairwise axis differences and per-pair verdicts;
- **visual structure** — distinct palettes, type/hierarchy pairings, navigation
  models (contrast is a validator rule; taste is not scored);
- **completeness and editability** — concepts, screens, nodes, components and a
  coverage audit of every visible node against the rendered page;
- **latency** — wall clock for the generation plus per-stage provider latency;
- **actual cost and routing** — OpenRouter reported charge, Groq published rate
  on reported tokens, the serving endpoint per call, and every attempt checked
  against its reservation and the $0.40 cap.

```bash
bun scripts/ai-trial.mjs --status                 # gate, both keys, pool; no calls
bun scripts/ai-trial.mjs                          # mocked stand-in, no keys, no spend
bun scripts/ai-trial.mjs --live --approve-trial   # the paid run
```

### Mocked run

`docs/qa/ai-trial-2026-11-23/mocked/REPORT.md` is labelled `mode: mocked` and
`comparable: false`. It proves the plumbing: three arms, both keys, the pinned
routing body, endpoint attribution (with clearly stand-in endpoint names), the
HTML/PNG sets, the validators and the budget, with deterministic stand-in
answers. Latency there measures pipeline overhead only, and cost is simulated.
It is not a quality comparison.

### Live run

The same tables with real answers, real latency, real reported cost and any
refusals. Written to `docs/qa/ai-trial-2026-11-23/live/`.

### Scope of the nine-generation run

Nine generations — one sample per business per arm — is an **initial screening
comparison**, not a winner determination. It can reveal large gateway, routing,
latency or accounting differences, but it cannot support a general quality
claim about a provider or model. Mocked screenshots and tables are labelled
`mocked` / `comparable: false`; they prove the pipeline, not model output. A
live result should be reported as observations, with the sample size, serving
endpoints and refusal rate stated, and should be repeated or expanded before any
provider is chosen on quality grounds.

## 8. What still needs your keys

1. `GROQ_API_KEY` in `.dev.vars` (the same variable the free route uses; the
   trial needs a billing-enabled Groq account).
2. `OPENROUTER_API_KEY` in `.dev.vars`.
3. `PLATTR_AI_TRIAL=approved` for the trial window.
4. `bun scripts/ai-trial.mjs --status` must print `gate: open` and both models.
5. `bun scripts/ai-trial.mjs --live --approve-trial`.

Do not paste keys into chat, logs or the repository. Nothing in this trial
deploys, publishes or writes to production data, and it does not change the
customer-facing generation route.

## 9. Test coverage

`tests/aiTrial.test.ts` (33 tests):

- closed without keys: zero provider calls;
- the live inputs are Yarmouth Oilskins, Architecture for London and Padella
  saved crawls; the synthetic GeeStores fixture and `.example` data are absent;
- all three arms receive the same Yarmouth prompts, JSON schemas, output limits
  and reasoning effort;
- keys without approval still closed, for four approval spellings;
- a comparison needs both keys; one key alone names the missing one;
- Groq contacts only `api.groq.com`, OpenRouter only `openrouter.ai`, each with
  its own key, both with the same model, and every arm records its serving
  endpoint;
- the pinned arm sends `only: ["Groq"]` with fallbacks disabled, and a call
  served elsewhere is refused as `provider_mismatch` and still charged;
- a truncated attempt is charged and counted in the verification, and a retried
  attempt reserves twice and is reported as retried;
- a timeout and a dropped connection are retried, and both attempts retain their
  reservations rather than looking free;
- a confirmed pre-inference rejection releases its reservation, while a 4xx
  without billing stays uncertain and keeps it;
- a 5xx with `usage.cost` is charged, not retained;
- a body with usage but no choices is charged before its parse failure;
- a body with no usage marks the attempt uncertain, retains its reservation and
  remains visible in the report;
- a successful retry settles the persistent pool with the retained first attempt
  as well as the confirmed charge, while a run with no uncertain attempts keeps
  normal accounting unchanged;
- an attempt with no billing classification is recorded as uncertain, keeps its
  reservation and settles it against the persistent pool;
- Groq cost comes from its published rate; OpenRouter from `usage.cost`;
- reservations are non-zero for a model that is also on the free allowlist;
- the $30 pool refuses the claim that would cross it;
- a generation that would cross $0.40 is refused before its second call;
- the $0.18 soft limit keeps the design and skips copy;
- a palette-only triple is refused as `concepts_not_distinct`;
- accepted documents carry three different structures;
- neither key appears in bodies, issues or results;
- an assumption carrying a price is rejected;
- migration and runtime schema cannot drift;
- restaurant and practice compile three distinct journeys;
- the catalogue is two primary arms plus one controlled arm at verified prices.

Full suite: 880 tests, 0 failing (31 of them this trial); typecheck and
production build clean.
