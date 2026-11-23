# P1 trial authorisation — OpenRouter + Grok revision

> **SUPERSEDED by `docs/P1_TRIAL_AUTHORISATION_2026-11-23-REV3.md`.** This
> revision named the wrong provider: the intended provider is **Groq**, not
> Grok/xAI. Every Grok, xAI and `XAI_API_KEY` section below is void and is
> kept only as history. REV3 compares Groq `openai/gpt-oss-120b` through
> OpenRouter against Claude Sonnet 5.5 through OpenRouter.

**Date:** 2026-11-23
**Status:** revision of `docs/P1_TRIAL_AUTHORISATION_2026-11-23.md`. Offline implementation and contract tests complete. **No paid provider call has been made.** Neither `OPENROUTER_API_KEY` nor `XAI_API_KEY` exists in this environment or in `.dev.vars`, so the trial cannot start.
**Scope:** local trial only. No deployment, no production data, no production secrets, no change to existing projects or published applications. Production activation remains a separate approval.

This supersedes the provider, model, endpoint and cost sections of REV1. The document architecture, validators, prompts, five businesses and acceptance criteria are unchanged.

---

## 1. Final provider and model configuration

Provider selection lives server-side in `src/worker/ai/routes.ts`. Every adapter takes its model IDs as a parameter; the route table is the single place they are chosen.

| Route id | Gateway | Endpoint | Models (understand / design / copy) | Reasoning effort |
| --- | --- | --- | --- | --- |
| `grok-openrouter` | OpenRouter | `POST https://openrouter.ai/api/v1/chat/completions` | `x-ai/grok-4.7` / `x-ai/grok-4.7` / `x-ai/grok-4.7` | low / medium / low |
| `grok-xai` | xAI direct | `POST https://api.x.ai/v1/responses` | `grok-4.7` / `grok-4.7` / `grok-4.7` | low / medium / low |
| `sonnet-openrouter` | OpenRouter | `POST https://openrouter.ai/api/v1/chat/completions` | `anthropic/claude-haiku-5.5` / `anthropic/claude-sonnet-5.5` / `anthropic/claude-haiku-5.5` | low / medium / low |

The two Grok routes are identical in model, effort and visible-output ceilings, so the comparison isolates the gateway rather than the model. Sonnet 5.5 is the strong alternative: the incumbent design model, now reached through the gateway, with Haiku 5.5 keeping the read and copy roles cheap.

**Why `medium` for design.** Grok 4.7 reasoning cannot be disabled and defaults to `high`. At `high`, the planning figure including a reasoning allowance exceeds the $0.18 soft generation limit before any retry. `medium` keeps the planning figure at **$0.1734**, under the limit. Reading and copy use `low`. Both Grok routes use the same effort, so the bake-off stays fair.

**Provider routing.** Both OpenRouter routes send:

```json
"provider": {
  "order": ["xai"],
  "allow_fallbacks": true,
  "require_parameters": true,
  "data_collection": "deny"
}
```

`order` prefers the vendor's own endpoint (`anthropic` for the Sonnet route). `allow_fallbacks` lets the gateway use another endpoint of the same model if the preferred one is unavailable. `require_parameters` prevents routing to an endpoint that cannot honour a JSON schema. The responding endpoint is recorded on every call as `providerServed`; the billed model as `modelServed`.

Model-level fallback (`models: [...]`) is deliberately **not** enabled: if a different model answered, the bake-off could no longer attribute quality or cost to a model. Endpoint fallback within the same model gives resilience without that ambiguity.

**Timeouts and retries.** 240 s per Grok call, 180 s per Sonnet/OpenRouter call, enforced with `AbortController`. One retry, only for transport failure, timeout, 429 or 5xx. `Retry-After` is honoured and capped at 15 s. A schema, grounding or truncation failure is never retried: more freedom is not the fix.

## 2. Exact API payloads

Headers for all calls: `content-type: application/json`, plus `authorization: Bearer <key>`. No key is ever placed in a URL, a log or a response.

### 2.1 OpenRouter — Grok 4.7 design stage

```json
{
  "model": "x-ai/grok-4.7",
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
    "order": ["xai"],
    "allow_fallbacks": true,
    "require_parameters": true,
    "data_collection": "deny"
  }
}
```

`max_tokens` is **15,000**: the 9,000-token visible answer ceiling plus the 6,000-token reasoning allowance, because OpenRouter endpoints count reasoning against `max_tokens`. The understand call sends 3,000 (1,800 + 1,200); copy sends 4,200 (2,600 + 1,600).

Response fields read: `choices[0].message.content` (string or text parts), `choices[0].finish_reason` (`length` means truncated), `usage.prompt_tokens`, `usage.completion_tokens`, `usage.prompt_tokens_details.cached_tokens`, `usage.completion_tokens_details.reasoning_tokens`, `usage.cost` (credits, 1 credit = $1), `provider`, `model`, `id`.

### 2.2 OpenRouter — Sonnet 5.5 design stage

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

`max_tokens` is 13,000 (9,000 + 4,000). Understand and copy use `anthropic/claude-haiku-5.5` with 2,400 and 3,400 respectively.

### 2.3 xAI direct — Grok 4.7 design stage

```json
{
  "model": "grok-4.7",
  "input": [
    { "role": "system", "content": "<design system prompt>" },
    { "role": "user", "content": "<bounded dossier + stage-A brief>" }
  ],
  "max_output_tokens": 9000,
  "reasoning": { "effort": "medium" },
  "text": {
    "format": {
      "type": "json_schema",
      "name": "plattr_design",
      "strict": true,
      "schema": { "...": "jsonSchemaOf(DesignSetSchema)" }
    }
  },
  "store": false
}
```

`max_output_tokens` is **9,000**, not 15,000: on the xAI Responses API it caps only visible output, so reasoning does not consume it. `store: false` keeps the dossier out of xAI's 30-day response store. The 6,000-token reasoning allowance is still reserved in the spend ledger, because those tokens are billed.

Response fields read: `output[].content[].text` where `type` is `output_text` (or top-level `output_text`), `status` (`incomplete` means truncated), `usage.input_tokens`, `usage.input_tokens_details.cached_tokens`, `usage.output_tokens`, `usage.output_tokens_details.reasoning_tokens`, `usage.cost_in_usd_ticks` (divide by 1e10 for USD), `model`, `id`.

## 3. Structured-output compatibility

Verified against the current vendor documentation on **2026-11-23**, plus offline contract tests that assert the exact request shape and response parsing (`tests/aiDesign.test.ts`, 21 passing).

| Fact | Evidence |
| --- | --- |
| OpenRouter Chat Completions accepts `response_format = { type: "json_schema", json_schema: { name, strict, schema } }` | OpenRouter Structured Outputs: <https://openrouter.ai/docs/features/structured-outputs> |
| `x-ai/grok-4.7` endpoints advertise `structured_outputs`, `response_format`, `max_tokens`, `reasoning`, `max_completion_tokens` | Endpoint metadata: <https://openrouter.ai/api/v1/models/x-ai/grok-4.7/endpoints> |
| `anthropic/claude-sonnet-5.5` and `claude-haiku-5.5` advertise `structured_outputs` and `response_format` | <https://openrouter.ai/docs/cookbook/evaluate-and-optimize/model-migrations/claude-5-5> |
| OpenRouter support is per endpoint, not per model; `require_parameters` keeps the request away from unsupported endpoints | OpenRouter Structured Outputs, "Model Support"; Provider Routing: <https://openrouter.ai/docs/guides/routing/provider-selection> |
| OpenRouter reports `usage.cost` in credits (1 credit = $1), cached tokens and reasoning tokens | Usage Accounting: <https://openrouter.ai/docs/cookbook/administration/usage-accounting> |
| xAI Responses accepts `text.format = { type: "json_schema", name, strict, schema }` | Structured Outputs: <https://docs.x.ai/developers/model-capabilities/text/structured-outputs> |
| xAI supports the JSON Schema subset these schemas use: objects, arrays, enums, `pattern`, `minItems`/`maxItems`, `minimum`/`maximum`, Draft 2020-12 | Same page, "JSON Schema support" |
| xAI `max_output_tokens` excludes reasoning and function-call tokens | Responses reference: <https://docs.x.ai/developers/rest-api-reference/inference/responses> |
| xAI reports the actual charge in `usage.cost_in_usd_ticks`; 1 USD = 1e10 ticks | Cost Tracking: <https://docs.x.ai/developers/cost-tracking> |
| Grok 4.7 reasoning is always on, defaults to `high`, supports `low`/`medium`/`high`/`xhigh` | Reasoning: <https://docs.x.ai/developers/model-capabilities/text/reasoning> |
| Grok 4.7 list price is $2 / $0.50 / $6 per 1M input / cached / output below 200k prompt tokens; $4 / $1 / $12 above | Pricing: <https://docs.x.ai/developers/pricing> |
| OpenRouter charges 5.5% (minimum $0.80) when buying credits, with no inference markup | Pricing: <https://openrouter.ai/pricing>; FAQ: <https://openrouter.ai/docs/faq> |

**Limits of this verification.** This is documentary compatibility plus mocked contract tests, not a live schema-acceptance test. A live rejection cannot be discovered without spending money. The trial fails closed if it happens: the call is recorded as `http` or `parse`, that generation stops at a named stage, and no partial application is written. The first paid call is therefore also the live compatibility check.

**Schema shape.** The schema is generated by `jsonSchemaOf()` from the same Zod definitions used to validate the answer. It is strict (`additionalProperties: false`, every property required), contains no `$schema`/`$id`, and has no field for a price, product, address, policy, URL, markup or CSS. xAI accepts it as Draft 2020-12; the `pattern` values (`^#[0-9a-f]{6}$`, `^[a-z][a-z0-9-]{1,24}$`) fall inside xAI's documented ECMA-262 subset.

## 4. Revised trial cost calculations

USD per 1M tokens, standard tier, read 2026-11-23. The table lives in `src/worker/ai/pricing.ts`. The invoice is authoritative.

| Model | Input | Cached input | Output |
| --- | ---: | ---: | ---: |
| `x-ai/grok-4.7` (OpenRouter, xAI/Bedrock endpoint) | 2.00 | 0.50 | 6.00 |
| `x-ai/grok-4.7` (priority / long-context endpoints) | 4.00 | 1.00 | 12.00 |
| `grok-4.7` (xAI direct) | 2.00 | 0.50 | 6.00 |
| `anthropic/claude-sonnet-5.5` | 2.00 | 0.10 | 10.00 |
| `anthropic/claude-haiku-5.5` | 0.10 | 0.01 | 0.50 |

Planning tokens per generation remain the approved assumptions: A 9,000/1,400, B 12,000/7,500, C 6,000/2,200. Reasoning is added as a separate allowance because Grok cannot switch it off.

### 4.1 Grok 4.7 — one generation

| Stage | Visible answer | Reasoning allowance | Arithmetic (USD) | Base | Planning |
| --- | --- | --- | --- | ---: | ---: |
| A. Understand | 1,400 | 1,200 | 9,000 × $2/M + 1,400 × $6/M | $0.0264 | $0.0336 |
| B. Design | 7,500 | 6,000 | 12,000 × $2/M + 7,500 × $6/M | $0.0690 | $0.1050 |
| C. Copy | 2,200 | 1,600 | 6,000 × $2/M + 2,200 × $6/M | $0.0252 | $0.0348 |
| **Total** | | | | **$0.1206** | **$0.1734** |

Planning is visible answer **plus** reasoning allowance at the standard endpoint price. `$0.1734` is under the **$0.18 soft limit**. No prompt-cache hit is assumed.

### 4.2 Sonnet 5.5 via OpenRouter — one generation

| Stage | Model | Visible answer | Reasoning allowance | Arithmetic (USD) | Base | Planning |
| --- | --- | --- | --- | --- | ---: | ---: |
| A. Understand | Haiku 5.5 | 1,400 | 600 | 9,000 × $0.10/M + 1,400 × $0.50/M | $0.0016 | $0.0019 |
| B. Design | Sonnet 5.5 | 7,500 | 4,000 | 12,000 × $2/M + 7,500 × $10/M | $0.0990 | $0.1390 |
| C. Copy | Haiku 5.5 | 2,200 | 800 | 6,000 × $0.10/M + 2,200 × $0.50/M | $0.0017 | $0.0021 |
| **Total** | | | | | **$0.1023** | **$0.1430** |

### 4.3 The $0.40 hard generation limit

A call reserves its maximum possible cost before it is made, using the dearest endpoint the gateway could route to ($4 / $12 for `x-ai/grok-4.7`) and the visible ceiling plus reasoning allowance. If the reservation does not fit the $0.40 generation ledger, the call is refused.

| Route | Peak single-call reservation | Under $0.40? |
| --- | ---: | --- |
| `grok-openrouter` | $0.2316 | yes |
| `grok-xai` | $0.1158 | yes |
| `sonnet-openrouter` | $0.1558 | yes |

For the two OpenRouter routes the provider-side `max_tokens` also bounds the whole generation:

- **Grok through OpenRouter, every stage at its ceiling on the dearest endpoint:** A $0.0756 + B $0.2316 + C $0.0780 = **$0.3852**, under $0.40.
- **Sonnet through OpenRouter, every stage at its ceiling:** A $0.0022 + B $0.1558 + C $0.0024 = **$0.1604**, under the $0.18 soft limit.

**Residual risk on xAI direct.** xAI exposes no total-token cap: `max_output_tokens` excludes reasoning, and effort is qualitative, not a token ceiling. Its ledger reservation assumes 6,000 design reasoning tokens. If Grok reasons well beyond that, a generation can settle above $0.40 even though no further call is allowed. This is a known property of the direct API, not a gap in the ledger, and it is one of the things the trial measures. OpenRouter can enforce a true token ceiling and therefore a true dollar ceiling.

### 4.4 Trial exposure

Five businesses × three routes = **15 generations / 45 concepts**.

| Scenario | Inference | OpenRouter credit fee | Cash |
| --- | ---: | ---: | ---: |
| Base (no reasoning allowance, no retry) | $1.72 | $0.80 | $2.52 |
| **Planning (reasoning allowance included)** | **$2.45** | **$0.80** | **$3.25** |
| One repair run per generation | $4.90 | $0.80 | $5.70 |
| Absolute inference ceiling (15 × $0.40) | $6.00 | $0.80 | $6.80 |
| **Authorised trial ceiling** | **$30.00** | **$1.65** | **$31.65** |

The OpenRouter portion of the planning spend is $1.58; 5.5% of that is $0.09, so the **$0.80 minimum purchase fee** applies. The fee is charged on funding credits, not on individual requests, and is reported separately from inference. A $30 cash budget buys $28.44 of OpenRouter credits ($30.00 with the fee), still more than eleven times the planning spend.

No automatic top-up exists in the runner or in the adapters. The ledger is in-memory, refuses a reservation that would cross the trial or generation cap, and settles to the provider-reported charge. The **$50 monthly launch cap** remains unimplemented and inactive; production D1 spend buckets are a separate approval.

### 4.5 Projections at planning rates

Per route, including the reasoning allowance. These are replaced by measured actuals after the trial.

| Route | 100 generations | 1,000 generations | 10,000 generations |
| --- | ---: | ---: | ---: |
| `grok-openrouter` (inference) | $17.34 | $173.40 | $1,734.00 |
| `grok-openrouter` (cash incl. 5.5% fee) | $18.29 | $182.94 | $1,829.37 |
| `grok-xai` (inference, no gateway fee) | $17.34 | $173.40 | $1,734.00 |
| `sonnet-openrouter` (inference) | $14.30 | $143.00 | $1,430.00 |
| `sonnet-openrouter` (cash incl. fee) | $15.10 | $150.87 | $1,508.65 |

At planning rates, including the gateway fee, the $50 monthly cap allows roughly 273 Grok generations or 331 Sonnet generations through OpenRouter.

## 5. Required environment variables

Set these in `.dev.vars` (gitignored) or the process environment. Never paste them into chat, commit them, or expose them to browser code.

| Variable | Needed by | Purpose |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | `grok-openrouter`, `sonnet-openrouter` | Bearer token for `openrouter.ai/api/v1` |
| `XAI_API_KEY` | `grok-xai` | Bearer token for `api.x.ai/v1` |
| `P1_TRIAL_OUT` | optional | Override the evidence directory |

`ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are **not** required for these routes. Their adapters remain in the codebase and are not part of this comparison.

Preflight without a key or a network call:

```
bun scripts/p1-ai-trial.ts --dry-run
```

Paid trial:

```
bun scripts/p1-ai-trial.ts --route all
```

One route, or one business:

```
bun scripts/p1-ai-trial.ts --route grok-openrouter
bun scripts/p1-ai-trial.ts --route all yarmouth
```

Captures after the run:

```
BASE=docs/qa/p1-ai-trial-2026-11-23 bun scripts/capture-concepts.mjs
```

## 6. No-call confirmation

- The runner refuses to start when a required key is absent, **before** constructing a request. Current behaviour: `Refusing to start: OPENROUTER_API_KEY and XAI_API_KEY are not set. … No call was made.`
- `--dry-run` performs no network call at all. It prices every route, constructs each adapter with a placeholder key, proves the reservation ceilings, and derives all five dossiers.
- Provider selection and key lookup are server-side only (`src/worker/ai/routes.ts`, `provider.ts`). Neither module is imported by browser code, and no adapter returns its key.
- The pipeline, document architecture and validators are unchanged: `runDesignPipeline` still runs understand → design → copy → compile → validate, and every answer passes `parseBrief`, `parseDesignSet`, `parseCopy`, `compileConcept` and `validateConcepts` before it can reach a document.
- Deterministic fallback is intact: no key, a provider failure or a failed validation stops at a named stage, and existing documents render exactly as before.
- Nothing is deployed. The production release and rollback remain untouched. Production activation is a separate approval.

## 7. Current blocker and status

`OPENROUTER_API_KEY` and `XAI_API_KEY` are absent from this environment and from `.dev.vars`. No paid call, capture, score, token count or invoice exists. The honest status is: **implementation verified offline; trial evidence not produced.**

Set both keys locally, run the dry run, then run the trial. The report that follows will carry the requested evidence: side-by-side captures, blind scores, schema/grounding/diversity results, actual model IDs and upstream endpoints, token and reasoning counts, latency, provider-reported cost, gateway fee, projections and a provider recommendation.
