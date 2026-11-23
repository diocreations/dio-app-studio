# P1 trial authorisation — REV3: Groq + Claude through OpenRouter

> **Superseded by `docs/P1_TRIAL_AUTHORISATION_2026-11-23-REV4.md`.** REV4 corrects the OpenRouter fee arithmetic (5.5% of the credit purchase, not a flat $0.80), makes the $30 ceiling all-in, disables provider fallback on both routes, and makes a schema compatibility probe the first paid request. REV3 is retained for history; its fee table and Claude fallback policy are not current.

**Date:** 2026-11-23
**Status:** revision of `docs/P1_TRIAL_AUTHORISATION_2026-11-23-REV2.md`, which named the wrong provider (Grok/xAI). Offline implementation, repricing and contract tests are complete. **No paid provider call has been made.** `OPENROUTER_API_KEY` is absent from this environment and from `.dev.vars`, so the trial cannot start.
**Scope:** local trial only. No deployment, no production data, no production secrets, no change to existing projects or published applications. Production activation remains a separate approval.

This supersedes the provider, model, endpoint, routing and cost sections of REV1 and REV2. The document architecture, validators, prompts, five businesses and acceptance criteria are unchanged.

---

## 1. Final provider and model configuration

Two routes, both through OpenRouter, five businesses each: **10 generations / 30 concepts**. Provider selection lives server-side in `src/worker/ai/routes.ts`; every adapter takes its model IDs as a parameter.

| Route id | Gateway | Endpoint | Models (understand / design / copy) | Reasoning effort |
| --- | --- | --- | --- | --- |
| `groq-openrouter` | OpenRouter → **Groq only** | `POST https://openrouter.ai/api/v1/chat/completions` | `openai/gpt-oss-120b` / `openai/gpt-oss-120b` / `openai/gpt-oss-120b` | low / medium / low |
| `claude-openrouter` | OpenRouter → Anthropic | same endpoint | `anthropic/claude-haiku-5.5` / `anthropic/claude-sonnet-5.5` / `anthropic/claude-haiku-5.5` | low / medium / low |

### 1.1 Why `openai/gpt-oss-120b` is the Groq model

Groq's OpenRouter catalogue is far narrower than the general catalogue, and only one Groq-served model both fits a 12k-token design prompt and advertises strict JSON-schema output:

| Groq-served model on OpenRouter | Context | Input / output $/1M | `structured_outputs` on the Groq endpoint | Verdict |
| --- | ---: | --- | --- | --- |
| `openai/gpt-oss-120b` | 131,072 | 0.15 / 0.60 | **yes** (also `reasoning`, `reasoning_effort`, `max_tokens`) | **chosen** |
| `openai/gpt-oss-20b` | 131,072 | 0.075 / 0.30 | yes | considered; 20B is a weaker design model, kept only as a cheaper fallback idea |
| `meta-llama/llama-3.3-70b-instruct` | 131,072 | 0.59 / 0.79 | **no** — `response_format` and `tools` only | rejected: JSON-object mode cannot guarantee the schema |
| `minimax/minimax-m2.7` | 196,608 | 0.60 / 1.80 | **no** — no `response_format` at all | rejected: no schema support |

Groq's own documentation confirms the split: `strict: true` constrained decoding is supported for `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `qwen/qwen3.8-27b` and `meta-models/muse-spark-open`; every other model gets JSON-object mode, which "may not match your schema". A design set that cannot be validated is not a design set, so Llama 3.3 and MiniMax are out regardless of price.

### 1.2 Provider pinning

The Groq route sends:

```json
"provider": {
  "only": ["groq"],
  "allow_fallbacks": false,
  "require_parameters": true,
  "data_collection": "deny"
}
```

`openai/gpt-oss-120b` is served by roughly twenty OpenRouter endpoints, from $0.03/$0.15 (Near AI) to $0.35/$0.75 (Cerebras) and $0.14/$0.95 (SambaNova). `order: ["groq"]` plus fallbacks would let the gateway quietly serve another provider, and the trial could then attribute quality and price to the wrong vendor. `only: ["groq"]` pins it: if Groq is unavailable the call fails closed and is recorded as such, rather than silently becoming a different comparison. `require_parameters` keeps the request on endpoints that can honour the schema, and `data_collection: "deny"` excludes endpoints whose policy allows training on prompts.

The Claude route keeps `order: ["anthropic"]` with fallbacks allowed, since `anthropic/*` is served by Anthropic and Bedrock at the same list price, and the responding endpoint is recorded per call as `providerServed`.

Model-level fallback (`models: [...]`) is deliberately off on both routes: if a different model answered, the bake-off could no longer attribute quality or cost to a model.

### 1.3 Timeouts, retries, headroom

180 s per call via `AbortController`. One retry, only for transport failure, timeout, 429 or 5xx, honouring `Retry-After` capped at 15 s. A schema, grounding or truncation failure is never retried.

Reasoning is billed as output and counts against `max_tokens` on both gateways, so each stage sends its visible ceiling plus a reasoning allowance: understand 1,800 + 1,000 = 2,800; design 9,000 + 6,000 = **15,000**; copy 2,600 + 1,500 = 4,100. All are far below Groq's 65,536-token maximum completion for this model.

## 2. Exact API payloads

Headers on every call: `content-type: application/json`, `authorization: Bearer <OPENROUTER_API_KEY>`. The key is never placed in a URL, a log, a response, or browser code.

### 2.1 `groq-openrouter` — design stage

```json
{
  "model": "openai/gpt-oss-120b",
  "messages": [
    { "role": "system", "content": "<design system prompt>" },
    { "role": "user", "content": "<bounded dossier + stage-A brief>" }
  ],
  "max_tokens": 15000,
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "plattr_design",
      "strict": true,
      "schema": { "...": "jsonSchemaOf(DesignSetSchema), generated at runtime" }
    }
  },
  "reasoning": { "effort": "medium" },
  "provider": {
    "only": ["groq"],
    "allow_fallbacks": false,
    "require_parameters": true,
    "data_collection": "deny"
  }
}
```

The understand call sends 2,800 at `low`, the copy call 4,100 at `low`.

### 2.2 `claude-openrouter` — design stage

```json
{
  "model": "anthropic/claude-sonnet-5.5",
  "messages": [
    { "role": "system", "content": "<design system prompt>" },
    { "role": "user", "content": "<bounded dossier + stage-A brief>" }
  ],
  "max_tokens": 13000,
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "plattr_design",
      "strict": true,
      "schema": { "...": "jsonSchemaOf(DesignSetSchema)" }
    }
  },
  "reasoning": { "effort": "medium" },
  "provider": {
    "order": ["anthropic"],
    "allow_fallbacks": true,
    "require_parameters": true,
    "data_collection": "deny"
  }
}
```

Understand sends `anthropic/claude-haiku-5.5` at 2,400, copy at 3,400.

### 2.3 Fields read from the response

`choices[0].message.content` (string, or text parts), `choices[0].finish_reason` (`length` ⇒ truncated, `error` ⇒ refused), `usage.prompt_tokens`, `usage.completion_tokens`, `usage.prompt_tokens_details.cached_tokens`, `usage.completion_tokens_details.reasoning_tokens`, `usage.cost` (credits; 1 credit = $1), and the top-level `model`, `provider`, `id`. `usage.cost` is recorded as `reportedCostUsd` and used as the billed figure; the local price table is the fallback when a response omits it.

## 3. Structured-output compatibility

Verified on **2026-11-23** against live catalog metadata and vendor documentation, plus offline contract tests asserting the exact request shape and response parsing.

| Fact | Evidence |
| --- | --- |
| OpenRouter Chat Completions accepts `response_format = { type: "json_schema", json_schema: { name, strict, schema } }` | <https://openrouter.ai/docs/features/structured-outputs> |
| Groq supports `strict: true` constrained decoding for `openai/gpt-oss-120b` | <https://console.groq.com/docs/structured-outputs> |
| The Groq endpoint for `openai/gpt-oss-120b` advertises `structured_outputs`, `response_format`, `reasoning`, `reasoning_effort`, `max_tokens`; context 131,072; max completion 65,536; status operational | <https://openrouter.ai/api/v1/models/openai/gpt-oss-120b/endpoints> |
| The provider slug for routing is `groq` | <https://openrouter.ai/api/v1/providers> |
| OpenRouter support is per endpoint, not per model; `require_parameters` keeps a request off endpoints that cannot honour the schema | Structured Outputs, "Model Support"; Provider Routing: <https://openrouter.ai/docs/guides/routing/provider-selection> |
| `anthropic/claude-sonnet-5.5` (1M context) and `anthropic/claude-haiku-5.5` advertise `structured_outputs` / `response_format`, at $2/$10 and $0.10/$0.50 per 1M | <https://openrouter.ai/api/v1/models?q=claude> |
| OpenRouter reports `usage.cost` in credits, plus cached and reasoning token counts | Usage Accounting: <https://openrouter.ai/docs/cookbook/administration/usage-accounting> |
| Groq prices `openai/gpt-oss-120b` at $0.15 input / $0.60 output per 1M tokens | <https://console.groq.com/docs/models> |

**Limits of this verification.** This is documentary and catalog compatibility plus mocked contract tests, not a live schema-acceptance call — that would require spending money. The trial fails closed: a rejection is recorded as `http` or `parse`, the generation stops at a named stage, and no document is written. The first paid call is therefore also the live compatibility check.

**Schema shape.** Generated by `jsonSchemaOf()` from the same Zod definitions that validate the answer: strict (`additionalProperties: false`, every property required), no `$schema`/`$id`, and no field for a price, product, address, policy, URL, markup or CSS.

## 4. Revised cost calculations

USD per 1M tokens, standard tier, read 2026-11-23 from the endpoints the routes pin. The table lives in `src/worker/ai/pricing.ts`; the invoice is authoritative.

| Model | Input | Cached input | Output |
| --- | ---: | ---: | ---: |
| `openai/gpt-oss-120b` (Groq endpoint) | 0.15 | 0.075 | 0.60 |
| `anthropic/claude-sonnet-5.5` | 2.00 | 0.10 | 10.00 |
| `anthropic/claude-haiku-5.5` | 0.10 | 0.01 | 0.50 |

Planning tokens per generation are the approved assumptions: understand 9,000/1,400, design 12,000/7,500, copy 6,000/2,200. Reasoning is a separate allowance because gpt-oss reasons by default.

### 4.1 Groq `gpt-oss-120b` — one generation

| Stage | Visible answer | Reasoning allowance | Arithmetic (USD) | Base | Planning |
| --- | --- | --- | --- | ---: | ---: |
| A. Understand | 1,400 | 1,000 | 9,000 × $0.15/M + 1,400 × $0.60/M | $0.00219 | $0.00279 |
| B. Design | 7,500 | 6,000 | 12,000 × $0.15/M + 7,500 × $0.60/M | $0.00630 | $0.00990 |
| C. Copy | 2,200 | 1,500 | 6,000 × $0.15/M + 2,200 × $0.60/M | $0.00222 | $0.00312 |
| **Total** | | | | **$0.0107** | **$0.0158** |

### 4.2 Claude Sonnet 5.5 / Haiku 5.5 — one generation

| Stage | Model | Visible answer | Reasoning allowance | Arithmetic (USD) | Base | Planning |
| --- | --- | --- | --- | --- | ---: | ---: |
| A. Understand | Haiku 5.5 | 1,400 | 600 | 9,000 × $0.10/M + 1,400 × $0.50/M | $0.00160 | $0.00190 |
| B. Design | Sonnet 5.5 | 7,500 | 4,000 | 12,000 × $2/M + 7,500 × $10/M | $0.09900 | $0.13900 |
| C. Copy | Haiku 5.5 | 2,200 | 800 | 6,000 × $0.10/M + 2,200 × $0.50/M | $0.00170 | $0.00210 |
| **Total** | | | | | **$0.1023** | **$0.1430** |

No prompt-cache hit is assumed. Both planning figures are under the **$0.18 soft limit**; the Groq generation is about nine times cheaper than the Claude generation, which is the main thing the trial quantifies.

### 4.3 The $0.40 hard generation limit

Every call reserves its maximum possible cost before it is made — visible ceiling plus reasoning allowance, at the pinned endpoint price — and settles to the provider's reported usage afterwards. If the reservation does not fit the generation's $0.40 ledger, the call is refused.

| Route | Peak single-call reservation | Whole generation if every stage hits its ceiling | Under $0.40? |
| --- | ---: | ---: | --- |
| `groq-openrouter` | $0.0109 | $0.0176 | yes |
| `claude-openrouter` | $0.1558 | $0.1604 | yes |

The Groq route is a true dollar ceiling because `only: ["groq"]` fixes the price and `max_tokens` fixes the token count. `RESERVATION_PRICES` keeps the bound explicit: if the pin were ever removed, the same field would have to rise to the dearest endpoint ($0.35/$0.95), or the cap would only be nominal.

### 4.4 Trial exposure

Five businesses × two routes = **10 generations / 30 concepts**.

| Scenario | Inference | OpenRouter credit fee | Cash |
| --- | ---: | ---: | ---: |
| Base (no reasoning allowance, no retry) | $0.57 | $0.80 | $1.37 |
| **Planning (reasoning allowance included)** | **$0.79** | **$0.80** | **$1.59** |
| One repair run per generation | $1.59 | $0.80 | $2.39 |
| Absolute inference ceiling (10 × $0.40) | $4.00 | $0.80 | $4.80 |
| **Authorised trial ceiling** | **$30.00** | **$1.65** | **$31.65** |

At the planning figure, 5.5% of $0.79 is $0.04, so the **$0.80 minimum purchase fee** applies and dominates the cash cost of this trial. The fee is charged on funding credits, not per request, and is reported separately from inference. A $30 cash budget buys **$28.44 of credits** ($31.65 with the fee), about 36 times the planning inference spend.

No automatic top-up exists in the runner or the adapters. The ledger is in-memory, refuses a reservation that would cross the trial or per-generation cap, and settles to the provider-reported charge. The **$50 monthly launch cap** remains unimplemented and inactive; production D1 spend buckets are a separate approval.

### 4.5 Projections at planning rates

| Route | 100 generations | 1,000 generations | 10,000 generations |
| --- | ---: | ---: | ---: |
| `groq-openrouter` (inference) | $1.58 | $15.81 | $158.10 |
| `groq-openrouter` (cash incl. fee) | $2.38¹ | $16.68 | $166.80 |
| `claude-openrouter` (inference) | $14.30 | $143.00 | $1,430.00 |
| `claude-openrouter` (cash incl. fee) | $15.10² | $150.87 | $1,508.65 |

¹ 5.5% of $1.58 is $0.09, below the $0.80 floor. ² 5.5% of $14.30 is $0.79, just below the floor.

At the inactive $50 monthly cap, planning rates allow roughly **3,160 Groq generations** or **349 Claude generations** (about 2,997 and 331 on a cash basis, where $50 buys $47.39 of credits).

## 5. Required environment variables

Set in `.dev.vars` (gitignored) or the process environment. Never paste into chat, commit, or expose to browser code.

| Variable | Needed by | Purpose |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | both routes | Bearer token for `openrouter.ai/api/v1` |
| `P1_TRIAL_OUT` | optional | Override the evidence directory |

`XAI_API_KEY`, `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are **not** required. The xAI adapter has been removed from the codebase; the Anthropic and OpenAI adapters remain, unused by this comparison.

```bash
bun scripts/p1-ai-trial.ts --dry-run          # no network, no spend
bun scripts/p1-ai-trial.ts --route all        # paid trial, $30 ceiling
bun scripts/p1-ai-trial.ts --route groq-openrouter
BASE=docs/qa/p1-ai-trial-2026-11-23 bun scripts/capture-concepts.mjs
```

## 6. No-call confirmation

- The runner refuses to start when `OPENROUTER_API_KEY` is absent, **before** constructing a request: `Refusing to start: OPENROUTER_API_KEY is not set. … No call was made.` (exit 1, verified).
- `--dry-run` performs no network call. It prices both routes, constructs each adapter with a placeholder key, proves the reservation ceilings, and derives all five dossiers.
- Provider selection and key lookup are server-side only (`src/worker/ai/routes.ts`, `provider.ts`); neither is imported by browser code, and no adapter returns its key.
- The pipeline, document architecture and validators are unchanged: understand → design → copy → compile → validate, with `parseBrief`, `parseDesignSet`, `parseCopy`, `compileConcept` and `validateConcepts` before anything reaches a document.
- Deterministic fallback is intact: no key, a provider failure or a failed validation stops at a named stage and existing documents render exactly as before.
- The dossier sent to a provider is derived from the public pages of the five benchmark businesses — no customer records, accounts, orders or personal data — and `data_collection: "deny"` keeps prompts off endpoints that train on them.
- Nothing is deployed. The production release `7f3f33af-b49a-4d69-993b-46e31269a087` and rollback `ab5bec21-11e9-47f2-9fa0-e3a2ee43e7d3` are untouched. Production activation is a separate approval.

## 7. Current blocker and status

`OPENROUTER_API_KEY` is absent from this environment and from `.dev.vars`. Offline verification: `bun run typecheck` clean, `bun test tests/aiDesign.test.ts` 20/20 passing, `bun scripts/p1-ai-trial.ts --dry-run` exit 0 with the figures above, paid path exit 1 with the key refusal.

**Awaiting:** the API key, and approval of this cost calculation. Once both exist, run the trial and the report will carry side-by-side captures, blind scores, schema/grounding/diversity results, actual model IDs and upstream endpoints, token and reasoning counts, latency, provider-reported cost, gateway fee, projections and a recommendation.
