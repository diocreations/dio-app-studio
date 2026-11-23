# P1 trial authorisation — exact API, models, tokens and exposure

> **Superseded for provider, model, endpoint and cost sections by
> `docs/P1_TRIAL_AUTHORISATION_2026-11-23-REV3.md`.** REV3 compares Groq
> `openai/gpt-oss-120b` through OpenRouter against Claude Sonnet 5.5 through
> OpenRouter, ten generations in total. (REV2 proposed Grok/xAI and is itself
> void.) The document architecture, validators, prompts, five businesses and
> acceptance criteria below are unchanged.

**Date:** 2026-11-23
**Status:** AI core and trial harness complete; product UI integration not started. **No paid call has been made.** Both provider keys are absent on this machine, so the trial cannot start until they are supplied.
**Scope:** local trial only. No deployment, no production data, no production secrets, no change to existing projects or published applications. Production activation remains a separate approval.

This is the pre-call confirmation required before spending. It states the exact endpoint, model identifiers, what is sent, token assumptions, the arithmetic for one generation, the trial's maximum exposure, and how the cap is enforced in code.

---

## 1. Provider APIs

| | Anthropic | OpenAI |
| --- | --- | --- |
| Endpoint | `POST https://api.anthropic.com/v1/messages` | `POST https://api.openai.com/v1/responses` |
| Auth header | `x-api-key: $ANTHROPIC_API_KEY` | `Authorization: Bearer $OPENAI_API_KEY` |
| Version header | `anthropic-version: 2026-10-21` | — |
| Structured output | `output_config.format = { type: "json_schema", schema }` | `text.format = { type: "json_schema", name, strict: true, schema }` |
| Output ceiling | `max_tokens` per stage | `max_output_tokens` per stage |
| Usage read | `usage.input_tokens`, `usage.cache_read_input_tokens`, `usage.output_tokens` | `usage.input_tokens`, `usage.input_tokens_details.cached_tokens`, `usage.output_tokens` |
| Truncation signal | `stop_reason === "max_tokens"` | `status === "incomplete"` |

Both are called with `fetch` from `src/worker/ai/provider.ts`. No SDK was added and no dependency changed.

## 2. Model identifiers

| Stage | Anthropic | OpenAI |
| --- | --- | --- |
| A. Understand | `claude-haiku-5-5` | `gpt-6.1-terra` |
| B. Design set (3 concepts) | `claude-sonnet-5-5` | `gpt-6-sol` |
| C. Copy | `claude-haiku-5-5` | `gpt-6.1-terra` |

The JSON schemas are generated from the same Zod definitions used to validate the answer (`src/worker/ai/contracts.ts`), so a valid provider answer and a locally accepted answer cannot drift apart.

## 3. What is sent

Only a bounded dossier, never raw HTML and never credentials:

- business name, category, trade, tagline, story (first 600 characters), hours, address;
- catalogue digest: entry count, priced count, photographed count, currency, section names and counts;
- up to 40 verbatim source sentences with their source URL;
- the workflows and screens the saved build actually establishes;
- the business brief produced by stage A (for stages B and C).

Never sent: API keys, owner secrets, session cookies, customer records, payment data, account identifiers, private project data, full page HTML, scripts or images.

The dossier shape is enforced by `src/worker/ai/dossier.ts`. Prompt text is not logged by the trial runner.

## 4. Token assumptions per generation

One generation = stages A + B + C and produces three concepts. These are planning assumptions from the approved architecture, not measured values; the trial records actual usage from the provider response and reports it.

| Stage | Input tokens | Output tokens | Max output ceiling |
| --- | ---: | ---: | ---: |
| A. Understand | 9,000 | 1,400 | 1,800 |
| B. Design set | 12,000 | 7,500 | 9,000 |
| C. Copy | 6,000 | 2,200 | 2,600 |
| **Total** | **27,000** | **11,100** | **13,400** |

No prompt-cache hit is assumed: every input token is priced fresh. The design stage is the long pole and the only mid-tier call.

## 5. Prices on file (USD per 1M tokens, standard tier)

Read 2026-11-23; the table lives in `src/worker/ai/pricing.ts`. Prices can change; the invoice is authoritative.

| Model | Input | Cached input | Output |
| --- | ---: | ---: | ---: |
| `claude-sonnet-5-5` | 2.00 | 0.10 | 10.00 |
| `claude-haiku-5-5` | 0.10 | 0.01 | 0.50 |
| `gpt-6-sol` | 2.00 | 0.10 | 10.00 |
| `gpt-6.1-terra` | 1.00 | 0.05 | 5.00 |

## 6. Cost of one generation, shown as arithmetic

**Anthropic (Sonnet 5.5 design, Haiku 5.5 understand and copy)**

| Stage | Arithmetic | Cost |
| --- | --- | ---: |
| A | 9,000 × $0.10/M + 1,400 × $0.50/M | $0.0016 |
| B | 12,000 × $2.00/M + 7,500 × $10.00/M | $0.0990 |
| C | 6,000 × $0.10/M + 2,200 × $0.50/M | $0.0017 |
| **Base** | | **$0.1023** |

**OpenAI (GPT-6 Sol design, GPT-6.1 Terra understand and copy)**

| Stage | Arithmetic | Cost |
| --- | --- | ---: |
| A | 9,000 × $1.00/M + 1,400 × $5.00/M | $0.0160 |
| B | 12,000 × $2.00/M + 7,500 × $10.00/M | $0.0990 |
| C | 6,000 × $1.00/M + 2,200 × $5.00/M | $0.0170 |
| **Base** | | **$0.1320** |

The earlier architecture note quoted ≈$0.103 for OpenAI because it priced GPT-6.1 Terra at all three stages. The implemented mapping uses GPT-6 Sol for the design set, so the correct planning figure is **$0.132**. This document supersedes that line.

With the approved ×1.25 transport-retry allowance:

| Pipeline | Base | Planning figure |
| --- | ---: | ---: |
| Anthropic hybrid | $0.1023 | **$0.128** |
| OpenAI hybrid | $0.1320 | **$0.165** |

Both planning figures sit under the **$0.18 soft limit**. The **$0.40 hard limit** is a per-generation ceiling, not an expectation: it is enforced by a scoped ledger, so a generation whose reservations would cross $0.40 is refused rather than attempted.

## 7. Trial design and exposure

The trial compares the same five accepted businesses under both providers:

| id | Business | Trade model |
| --- | --- | --- |
| `yarmouth` | Yarmouth Oilskins | Retail with variants |
| `padella` | Padella | Restaurant |
| `bluetit` | Blue Tit | Appointment-based salon |
| `pelirocco` | Hotel Pelirocco | Hotel / accommodation |
| `afl` | Architecture for London | Professional / enquiry-led |

Inputs come from the saved discovery records and saved specs in `docs/qa/generation-benchmark-2026-11-21/`; the trial does not crawl again and does not touch any live project.

Each business × provider is one generation of three concepts: **10 generations, 30 concepts**.

| Scenario | Generations | Planning cost | Absolute ceiling |
| --- | ---: | ---: | ---: |
| Planned trial | 10 | $1.46 | $4.00 |
| One repair run per business/provider | 20 | $2.93 | $8.00 |
| **Trial maximum authorised** | — | — | **$30.00** |

The $30 ceiling is a hard stop, not a target. The runner refuses to start a call whose reservation would cross the remaining trial budget, records actual usage after each call, and cannot top up. Even the worst case above leaves more than $20 unspent.

**Monthly launch cap:** $50, per the approval. It is not activated by this trial. Production spend control (D1-backed daily/monthly counters, per-project and per-visitor buckets) is part of production activation and remains a separate approval.

## 8. What the runner produces

`scripts/p1-ai-trial.ts` writes `docs/qa/p1-ai-trial-<date>/`:

- `<business>/run-<provider>.json`: brief, design set, per-call model/tokens/cost/latency/outcome, validation issues, compiled documents;
- `<business>/concepts/<provider>--<concept>.html`: the rendered app from the compiled document, in the layout the existing capture harness already reads;
- `trial.json`: totals, actual tokens and cost, schema/grounding/diversity results per generation;
- `blind-review.json` and `blind-review.md`: provider-hidden labels with an empty 1–5 rubric for human scoring;
- `blind-key.json`: the label-to-provider key, kept separate so scoring is blind.

Captures are taken with the existing CDP harness after the run:

```
BASE=docs/qa/p1-ai-trial-<date> bun scripts/capture-concepts.mjs
```

## 9. Blocker

`ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are **absent** from this environment, and no key exists in `.dev.vars`. A paid call cannot be made without them.

Set them locally in `.dev.vars` (untracked, never committed):

```
ANTHROPIC_API_KEY=…
OPENAI_API_KEY=…
```

Then run:

```
bun scripts/p1-ai-trial.ts --provider both
```

Before spending, the same runner can prove the wiring and the exposure without a network call:

```
bun scripts/p1-ai-trial.ts --dry-run
```

Until the keys exist, the honest status is: implementation verified offline, trial evidence **not produced**. No captures, scores, token counts or costs are claimed.
