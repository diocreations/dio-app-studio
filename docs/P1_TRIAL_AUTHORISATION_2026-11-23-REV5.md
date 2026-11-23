# P1 trial authorisation — REV5: probe budget isolation

> **CANCELLED 2026-11-23 — never executed, and authorises nothing.**
>
> The paid trial is withdrawn. Zero expenditure is now a firm requirement for Plattr, so no OpenRouter account, credit purchase, billing detail, API key or paid request was made — and none will be. This document is kept only as a record of what was proposed; every cap, probe and route below is void.
>
> Replacement: `docs/ZERO_COST_AI_PLAN_2026-11-23.md`, which uses provider free tiers only and has no paid path at all.

**Date:** 2026-11-23
**Status (historical, superseded by the cancellation above):** final revision of `docs/P1_TRIAL_AUTHORISATION_2026-11-23-REV4.md`. REV5 adds **one** clarification: the two schema compatibility probes are isolated budgets with their own caps, no retries, and their charges booked to the $30 trial ledger. Nothing else changes — the providers, models, endpoints, generation limits, pricing assumptions, prompts, validators and safeguards are exactly as approved in REV4. **No paid provider call has been made.** `OPENROUTER_API_KEY` is absent from this environment and from `.dev.vars`.
**Scope:** local trial only. No deployment, no production data, no production secrets, no change to existing projects or published applications.

Sections 1–10 below are REV4 unchanged except where marked; section 2.1 is new and section 6's probe row now reflects it.

---

## 1. Routes, endpoints and attribution

Two routes, both through OpenRouter, five businesses each: **10 scored generations / 30 concepts**. Provider selection lives server-side in `src/worker/ai/routes.ts`.

| Route id | Gateway | Pinned endpoint | Models (understand / design / copy) | Reasoning effort |
| --- | --- | --- | --- | --- |
| `groq-openrouter` | OpenRouter → **Groq** | `groq` | `openai/gpt-oss-120b` ×3 | low / medium / low |
| `claude-openrouter` | OpenRouter → **Anthropic** | `anthropic` | `anthropic/claude-haiku-5.5` / `anthropic/claude-sonnet-5.5` / `anthropic/claude-haiku-5.5` | low / medium / low |

Both routes send the same routing block; **fallback is disabled on both**:

```json
"provider": {
  "only": ["<expected slug>"],
  "allow_fallbacks": false,
  "require_parameters": true,
  "data_collection": "deny"
}
```

`only` is a hard allow-list: OpenRouter may use no other endpoint. `allow_fallbacks: false` is explicit so a change of default cannot silently widen it. `require_parameters: true` keeps the request on endpoints that advertise the JSON-schema parameters. Model-level fallback (`models: [...]`) is never sent.

### 1.1 How the endpoint is confirmed, not assumed

A pinned request is necessary but not sufficient evidence. Every response is checked against the route:

1. the adapter reads the top-level `provider` field (or `choices[0].provider` when present);
2. it compares that value, case-insensitively, with the route's `expectedProvider` (`groq` or `anthropic`);
3. **missing or different attribution throws `provider_mismatch`**, which is not retryable, writes no concept and no Doc, and is recorded in the evidence;
4. `providerServed` and `modelServed` from the response are recorded on every call, and the probe must report the expected endpoint before the route proceeds.

So the trial confirms the actual OpenRouter endpoint twice: the request cannot be routed elsewhere, and the response is refused unless it names the expected endpoint.

### 1.2 Why `openai/gpt-oss-120b` is the Groq model

Only one Groq-served model on OpenRouter both fits a 12k-token design prompt and advertises strict JSON-schema output:

| Groq-served model on OpenRouter | Context | Input / output $/1M | `structured_outputs` on the Groq endpoint | Verdict |
| --- | ---: | --- | --- | --- |
| `openai/gpt-oss-120b` | 131,072 | 0.15 / 0.60 | **yes** (also `reasoning`, `reasoning_effort`, `max_tokens`) | **chosen** |
| `openai/gpt-oss-20b` | 131,072 | 0.075 / 0.30 | yes | considered; 20B is a weaker design model |
| `meta-llama/llama-3.3-70b-instruct` | 131,072 | 0.59 / 0.79 | **no** — `response_format` and `tools` only | rejected: JSON-object mode cannot guarantee the schema |
| `minimax/minimax-m2.7` | 196,608 | 0.60 / 1.80 | **no** — no `response_format` at all | rejected: no schema support |

### 1.3 Timeouts, retries, headroom

180 s per call via `AbortController`. Generation calls get **one** retry, only for transport failure, timeout, 429 or 5xx, honouring `Retry-After` capped at 15 s. A schema, grounding or truncation failure is never retried. **Probes are the exception: they get no retry at all** (section 2.1).

Reasoning is billed as output and counts against `max_tokens` on both gateways, so each stage sends its visible ceiling plus a reasoning allowance (section 5).

## 2. Structured-output compatibility probe (the first paid request)

Documentary and catalogue compatibility is not proof that an endpoint accepts this schema. The first paid request on each route is therefore a **controlled probe** that must pass before any generation runs.

**What is sent.** One design-stage call with:
- the shipping schema, `jsonSchemaOf(DesignSetSchema)` — generated from the same Zod definitions that validate the answer, strict, with no `$schema`/`$id`;
- the real `designPrompt()` and a fixed brief derived from the first saved dossier, checked by `parseBrief` so the probe does not depend on a paid understand pass;
- the route's normal `max_tokens` (15,000 Groq / 13,000 Claude), provider pin and reasoning effort.

**What must pass, in order:**

1. HTTP success and no `provider_mismatch`;
2. `finish_reason` is neither `length` (truncated) nor `error` (refused);
3. the text is JSON;
4. it parses against `DesignSetSchema`;
5. the grounding, contrast, font and diversity validators raise **no fatal issue** (`parseDesignSet`).

**On failure.** That route stops. The probe writes `smoke-<route>.json` with the error code, cap, reservation, endpoint/model attribution, tokens, latency, cost and validation issues. **No concept, HTML or Doc is written.** There is no downgrade to JSON-object mode, no model substitution and no provider fallback. The other route may continue; if neither passes, the runner exits non-zero with only the probe evidence.

**Fail-closed rationale.** A design set that cannot be produced under the schema is not a design set. Discovering that on a probe costs one call; discovering it on generation 1 after writing files would leave partial state and misattribute the failure.

### 2.1 Probe budget isolation

The probes are paid requests but **not scored generations**. They are therefore budgeted separately from the 10 generations, with their own caps, and still counted inside the trial's $30 all-in ceiling. Enforcement lives in `src/worker/ai/budget.ts`; the scored set remains **10 generations / 30 concepts**.

| # | Requirement | Enforced value |
| --- | --- | ---: |
| 1 | Maximum reserved cost, Groq probe | **$0.02** (`PROBE_ROUTE_CAP_USD['groq-openrouter']`) |
| 2 | Maximum reserved cost, Claude probe | **$0.20** (`PROBE_ROUTE_CAP_USD['claude-openrouter']`) |
| 3 | Maximum combined probe cost | **$0.22** (`PROBE_TOTAL_CAP_USD`) |
| 4 | Probe retries | **Disabled** — `PROBE_RETRIES = 0`, one HTTP attempt per probe |
| 5 | Charged to the $30 all-in ledger | **Yes** — every probe reservation chains route cap → combined cap → trial ledger, and settles on the trial ledger |
| 6 | Failed probe blocks generation | **Yes** — generation iterates only routes whose probe passed, and re-checks before each generation |

**How the reservation is bounded.** A probe reserves one design call at the pinned endpoint price:

```
reservation = (estimateTokens(design prompt) + 900) × input price
            + (9,000 visible + reasoning allowance) × output price
```

With the real probe prompt on the first saved dossier, the dry run prints **$0.0094 Groq**, **$0.1354 Claude**, **$0.1448 combined**. Both route caps sit above those figures with headroom for tokeniser drift and well below the $0.40 generation cap; the combined cap covers both probes with $0.0752 spare. At 5.5% the combined reservations are **$0.1528 all-in**.

**How it is enforced, not merely documented.**

- Each probe reserves against a three-level chain: its route cap, the shared `$0.22` probe cap, and the `$28.43` trial credit ledger. A refusal on any level releases the others, so a refused probe books $0 and leaves no phantom reservation.
- The route cap is checked against the computed reservation **before** the request: a reservation above `$0.02` / `$0.20` fails with `smoke_over_cap`, makes no call, and disables that route.
- Because the combined ledger is created once and shared by both probes, the ceiling holds in either order and after a failure; it cannot be refreshed by retrying a route.
- `PROBE_RETRIES = 0` is passed to `generateWithRetry`, so a 429, timeout or 5xx ends the probe instead of buying a second design call. There is no second reservation, and the cap cannot be doubled by retrying.
- `trialSpend` in `trial.json` is computed from **generation spend plus probe spend**, and `probeBudget` records both caps, the retries setting, each reservation, the booked amount and `countsTowardsTrialLedger: true`.
- Probe spend is inside the `$28.43` credit ledger, so the all-in cash ceiling of $30 holds with probes included: $28.43 × 1.055 = $29.9937 in the absolute worst case.
- A route that fails any probe check is never pushed to `activeRoutes`; the generation loop throws if asked to run a route without a passed probe (`Refusing to generate on <route>: its schema probe did not pass.`).
- Probes are **not** scored: they produce no concept, no HTML, no blind card and no score, and they are excluded from `generationsOk` / `generationsFailed`.

**Worst case, both probes fail.** $0.1448 of reservations, settled to actual usage, booked to the trial ledger, no generation, exit 1 with `smoke-<route>.json` evidence for each route.

## 3. Corrected OpenRouter fees

The Standard plan charges **5.5% of the credit purchase**. It is a rate, not a flat $0.80 charge: there is no minimum-fee arithmetic in the implementation (`src/worker/ai/pricing.ts`). Inference is passed through at the pinned endpoint price with no per-request markup. The fee is charged when credits are bought, not per call, so it is reported separately but **counted inside the trial budget**.

| Scenario | Inference (exact) | Fee at 5.5% | All-in |
| --- | ---: | ---: | ---: |
| Base, no reasoning, no retry | $0.56505 | $0.03108 | $0.59613 → **$0.60** |
| **Planning (reasoning allowance)** | **$0.79405** | **$0.04367** | **$0.83772 → $0.84** |
| One repair run per generation | $1.58810 | $0.08735 | $1.67545 → **$1.68** |
| Absolute inference ceiling (10 × $0.40) | $4.00000 | $0.22000 | $4.22000 → **$4.22** |

**Why planning reports $0.84, not $0.83.** The headline inference figure is rounded: $0.79405 prints as $0.79. Multiplying the rounded $0.79 by 1.055 gives $0.8335 → $0.83; multiplying the exact $0.79405 gives $0.8377 → $0.84. The cent is the $0.00405 dropped by rounding inference to the cent. The fee itself is $0.04367 → $0.04 in both readings. The report uses the exact purchase amount, as required.

**Why the fee is not $0.80.** $0.79 of credits at 5.5% is $0.04. A flat $0.80 was the old floor, wrongly applied as if it were the fee for a small purchase; it is not part of this calculation.

## 4. The $30 ceiling is all-in

$30 is the total cash the trial may spend, **including the fee**. It is not $30 of inference plus a fee.

| Quantity | Value |
| --- | ---: |
| Authorised all-in ceiling | **$30.00** |
| Credits that ceiling buys | **$28.43** (floored to the cent) |
| Fee on that purchase | $1.56365 → **$1.56** |
| Cash total | **$29.99365 → $29.99** |

The cap floors to the cent because credits are bought in cents. $28.44 of credits would cost $30.0042 — four-tenths of a cent over the ceiling — so the ledger stops at $28.43. The one-cent remainder is retained as headroom, not spent.

**Enforcement is independent of the per-generation limit.** The trial ledger is created at `openRouterInferenceBudgetUsd(30)` = $28.43. Every attempt reserves against both that ledger and its own scope ($0.40 for a generation, $0.02 / $0.20 and $0.22 combined for a probe); a refusal on any scope releases the others. Because the fee is 5.5% of total inference, actual cash is at most $28.43 × 1.055 = $29.9937. There are no top-ups in the runner or the adapters, and no automatic re-arming after a limit. The **$50 monthly launch cap** remains unimplemented and inactive.

If OpenRouter's checkout enforces a minimum purchase block, the funded balance and its fee are that block (unused credits remain); the ledger still cannot spend more than $28.43 of inference, so the all-in ceiling is unchanged.

## 5. Stage-level token reservations, reasoning and retries

Planned input tokens per generation: understand 9,000; design 12,000; copy 6,000. Reservations are computed at call time as:

```
reservation = (estimateTokens(system + user) + 900) × pinned input price
            + (visible ceiling + reasoning allowance) × pinned output price
```

The 900-token margin covers tokeniser drift. The reservation is a ceiling, never the billing figure; it is settled to `usage.cost` when OpenRouter reports it, otherwise to the local price table.

| Stage | Planned input | Visible ceiling | Reasoning Groq / Claude | `max_tokens` sent Groq / Claude | Reserve/attempt Groq | Groq + retry | Reserve/attempt Claude | Claude + retry |
| --- | ---: | ---: | --- | --- | ---: | ---: | ---: | ---: |
| Understand | 9,000 | 1,800 | 1,000 / 600 | 2,800 / 2,400 | $0.0032 | $0.0063 | $0.0022 | $0.0044 |
| Design | 12,000 | 9,000 | 6,000 / 4,000 | **15,000** / **13,000** | $0.0109 | $0.0219 | $0.1558 | $0.3116 |
| Copy | 6,000 | 2,600 | 1,500 / 800 | 4,100 / 3,400 | $0.0035 | $0.0070 | $0.0024 | $0.0048 |
| **Whole generation, every stage retried once** | | | | | | **$0.0352** | | **$0.3208** |

Both retry totals are below the **$0.40 hard generation limit**. The table is computed at the planned prompt size; the pipeline recomputes from the real prompt, and each call records its actual `reservedUsd` and `attempts` in `trial.json`. If a reservation does not fit, the attempt is refused before it is made.

**Retry accounting.** A retry is a second billable HTTP request. `generateWithRetry` takes a guard whose `begin()` reserves for **each attempt**. An attempt that fails with a transport error releases its reservation and books $0, and the run aborts; schema and grounding failures are never retried. **Probes pass `PROBE_RETRIES = 0`, so no probe is ever retried.**

**Known limit.** If an upstream bills a failed attempt without reporting usage, that charge is invisible to the ledger. The exposure is bounded by one reservation ($0.0109 Groq / $0.1558 Claude) and the run stops at that point.

## 6. Trial exposure and projections

| Scenario | Inference | Fee | All-in |
| --- | ---: | ---: | ---: |
| Base (no reasoning allowance, no retry) | $0.57 | $0.03 | $0.60 |
| **Planning (reasoning included)** | **$0.79** | **$0.04** | **$0.84** |
| One repair per generation | $1.59 | $0.09 | $1.68 |
| Two schema probes, expected reservations | $0.1448 | $0.0080 | **$0.1528** |
| Two schema probes, both at their caps | $0.22 | $0.0121 | **$0.2321** |
| Absolute inference ceiling (10 × $0.40) | $4.00 | $0.22 | $4.22 |
| **Authorised all-in ceiling** | **$28.43 credits** | **$1.56** | **$29.99** |

At planning rates, $30 all-in funds about 36× the trial's expected generation inference ($0.79); with the probes at their caps the expected total is under $1.02 all-in. Projections at planning rates:

| Route | 100 generations | 1,000 generations | 10,000 generations |
| --- | ---: | ---: | ---: |
| `groq-openrouter` (inference) | $1.58 | $15.81 | $158.10 |
| `groq-openrouter` (all-in) | $1.67 | $16.68 | $166.80 |
| `claude-openrouter` (inference) | $14.30 | $143.00 | $1,430.00 |
| `claude-openrouter` (all-in) | $15.09 | $150.87 | $1,508.65 |

At the inactive $50 monthly cap, planning rates allow roughly **2,999 Groq generations** or **331 Claude generations** on an all-in basis ($50 buys $47.39 of credits).

## 7. Required environment variables and commands

Set in `.dev.vars` (gitignored) or the process environment. Never paste into chat, commit, or expose to browser code.

| Variable | Needed by | Purpose |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | both routes | Bearer token for `openrouter.ai/api/v1` |
| `P1_TRIAL_OUT` | optional | Override the evidence directory |

`XAI_API_KEY`, `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are not required. The xAI adapter has been removed.

```bash
bun scripts/p1-ai-trial.ts --dry-run          # no network, no spend; prints the probe budget
bun scripts/p1-ai-trial.ts --route all        # probes, then the paid trial
BASE=docs/qa/p1-ai-trial-2026-11-23 bun scripts/capture-concepts.mjs
```

## 8. No-call confirmation

- The runner refuses to start when `OPENROUTER_API_KEY` is absent, **before** any request or probe: `Refusing to start: OPENROUTER_API_KEY is not set. … No call was made.` (exit 1, verified).
- `--dry-run` performs no network call. It prices both routes, constructs each adapter with a placeholder key, prints the per-attempt reservation table, prints the per-route and combined probe reservations against their caps, proves the all-in budget and derives all five dossiers.
- No paid request has been made: no probe, no generation, no capture, no score. There are no actual tokens, costs, latencies or endpoints to report yet.
- Provider selection and key lookup are server-side only (`routes.ts`, `provider.ts`); neither is imported by browser code, and no adapter returns its key.
- Deterministic fallback is intact: no key, a provider failure, a failed probe or a failed validation stops at a named stage and existing documents render exactly as before.
- The dossier sent to a provider is derived from the public pages of the five benchmark businesses — no customer records, accounts, orders or personal data — and `data_collection: "deny"` keeps prompts off endpoints that train on them.

## 9. Production untouched

- Nothing is deployed. No `wrangler deploy`, no Sites publish, no D1 write and no change to any published application was performed in this work.
- The production release `7f3f33af-b49a-4d69-993b-46e31269a087` and rollback `ab5bec21-11e9-47f2-9fa0-e3a2ee43e7d3` remain as they were.
- All changes are local and uncommitted: the two route adapters, the ledger/pipeline accounting, the probe budget module, the trial harness, the contract tests and these authorisation documents. Production activation remains a separate approval.

## 10. Status and blocker

Offline verification after this clarification: `bun run typecheck` exit 0; `bun test` **809 pass, 0 fail** (805 before, plus 4 probe-budget tests); `bun scripts/p1-ai-trial.ts --dry-run` exit 0 printing Groq **$0.0094 / $0.02**, Claude **$0.1354 / $0.20**, combined **$0.1448 / $0.22**, retries 0; the paid path exits 1 with the key refusal.

**Awaiting:** `OPENROUTER_API_KEY` in `.dev.vars` (never committed) and your explicit approval of this revision. Until both exist, nothing paid runs. After the trial, the report will carry the probe outcome and caps, side-by-side captures, blind scores, schema/grounding/diversity results, actual model IDs and upstream endpoints, token and reasoning counts, latency, provider-reported cost, the 5.5% gateway fee, projections and a recommendation.
