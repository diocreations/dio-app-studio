# Plattr zero-cost AI plan — 2026-11-23

**Status:** proposal, awaiting approval. **Nothing in this document has been implemented**, no provider account or key exists, and no request of any kind has been made.
**Supersedes:** `docs/P1_TRIAL_AUTHORISATION_2026-11-23-REV5.md` (cancelled, never executed; no OpenRouter account, credits, billing details or paid calls).
**Scope:** local work only. No deployment, no production data change, no D1 write, no change to published applications.

---

## 0. What changed and what it costs

| Item | Before (REV5) | Now |
| --- | --- | --- |
| Providers | OpenRouter → Groq **and** OpenRouter → Anthropic (Claude) | Groq direct, Cloudflare Workers AI, Google Gemini, OpenRouter `:free` only, local Ollama |
| Money at risk | $30 all-in, $0.40/generation | **$0.00, structurally impossible to bill** |
| Paid fallback | disabled on both routes | disabled, and no paid model ID exists in the route table |
| Probe | two paid schema probes | same probes, free, and they consume free-tier quota instead of dollars |
| Cost recorded | provider-reported USD | `0`, by construction (`costUsd: 0`, `billingMode: 'free'`) |

Claude/Anthropic and OpenAI are removed from the product's reachable providers. The paid probe caps in `src/worker/ai/budget.ts` become dead code once the new route table lands; the dollar ledger is replaced by a **token quota ledger** whose money column is always `0`.

---

## 1. Exact free models and providers

Everything below is a model that is free **on a plan with no payment method attached**, so the provider's own meter cannot produce an invoice — the worst outcome of an overrun is a `429`, not a charge.

### 1.1 GroqCloud — free plan, no card

| Model ID | Free limits (per organisation, per model) | Context | Structured output |
| --- | --- | --- | --- |
| `openai/gpt-oss-120b` | 30 RPM · 1,000 RPD · **8,000 TPM** · **200,000 TPD** | 131,072 in / 65,536 out | `json_schema`, **`strict: true`** (constrained decoding) |
| `openai/gpt-oss-20b` | 30 RPM · 1,000 RPD · 8,000 TPM · 200,000 TPD | 131,072 | `json_schema`, `strict: true` |
| `qwen/qwen3.8-27b` | 30 RPM · 1,000 RPD · 8,000 TPM · 200,000 TPD | 131,072 | `json_schema`, `strict: true` |
| `openai/gpt-oss-safeguard-20b` | 3 RPM · 1,000 RPD · 2,000 TPM · 200,000 TPD | 131,072 | best-effort only |

Sources: [Groq rate limits](https://console.groq.com/docs/rate-limits), [Groq structured outputs](https://console.groq.com/docs/structured-outputs), [Groq gpt-oss-120b model card](https://console.groq.com/docs/model/openai/gpt-oss-120b).

Notes that matter for Plattr:
- `strict: true` is supported on exactly the three models above; it requires every property in `required` and `additionalProperties: false` on every object — Plattr's schemas already satisfy both.
- **Cached prompt tokens do not count toward the rate limits.** A byte-stable system prompt + schema prefix therefore buys real throughput.
- Llama 3.1/3.3 left the free and Developer tiers in August 2026 (enterprise-only); Groq's published table is the only authority for what is free.
- Free limits are per **organisation**, not per key, and are daily-refilled with no expiry.

### 1.2 Cloudflare Workers AI — Free plan, no card

| Model ID | Free allowance | Context | Structured output |
| --- | --- | --- | --- |
| `@cf/openai/gpt-oss-120b` | 10,000 **Neurons/day**, all models combined | 128,000 | JSON mode / `json_schema` (OpenAI-compatible), function calling, reasoning effort, **zero data retention** |
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | same pool | 24,000 | JSON mode |

Sources: [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing), [gpt-oss-120b model page](https://developers.cloudflare.com/workers-ai/models/gpt-oss-120b), [JSON mode](https://developers.cloudflare.com/workers-ai/features/json-mode).

- 10,000 neurons = `$0.11` at the paid rate. `gpt-oss-120b` bills **31,818 neurons per M input tokens** and **68,182 per M output tokens**, so the daily pool is roughly 314k input-only or 147k output-only tokens, and a real mix lands between.
- On Workers **Free** there is no overage: crossing the pool returns an error until **00:00 UTC**. That is a hard, provider-side zero-cost guarantee.
- Nine frontier model IDs (`kimi-k2.6/2.7`, `glm-5.2/5.3`, `deepseek-v4*`, `inkling-2-small`) require Workers Paid or prepaid credits and are therefore permanently excluded from Plattr's allowlist.
- Text generation is capped at 300 RPM; there is **no 8k-token-per-minute squeeze**, which is why this provider is the right home for Plattr's largest call.

### 1.3 Google Gemini API — free tier, no billing account

| Model ID | Free limits (per project) | Context | Structured output |
| --- | --- | --- | --- |
| `gemini-3.8-flash` | ~5 RPM · 250k TPM · **20 RPD** | 1M | `response_format` / `responseJsonSchema`, JSON Schema subset |
| `gemini-3.5-flash-lite` | ~10–15 RPM · 250k TPM · **500 RPD** | 1M | same |
| `gemini-3.1-flash-lite` | ~10–15 RPM · 250k TPM · **500 RPD** | 1M | same |
| `gemini-4-hydrogen`, `gemini-2.5-flash` | ~5 RPM · 250k TPM · 20 RPD | 1M | same |
| `gemini-4-argon`, `gemini-3.1-pro`, image models | **0 on free** | — | not available |

Sources: [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits), [structured outputs](https://ai.google.dev/gemini-api/docs/structured-output), [Gemini API terms](https://ai.google.dev/gemini-api/terms).

Two restrictions that are not negotiable:
- **Google no longer publishes a per-model free table.** `ai.google.dev` sends you to AI Studio's live counters and states limits "are not guaranteed". The numbers above come from developers reading their own project's 429 `quotaValue` (Sept–Oct 2026) and must be re-read from the Plattr project's rate-limit page after the key exists. The ledger treats the **AI Studio page as the source of truth**, not this table.
- **Free-tier data is used to improve Google products, and human reviewers may read it.** Paid tier is not. Plattr must never send customer records, owner contact details, session tokens or private documents to a Gemini free key — only the public-business dossier, which is already the contract in `src/worker/ai/dossier.ts`. EEA/CH/UK accounts get paid-tier data terms even on the free quota.
- Gemini ignores `minLength`, `maxLength`, `minProperties`, `maxProperties` and `uniqueItems` during constrained decoding, and `pattern` support is model-dependent. Zod validation stays the real gate.

### 1.4 OpenRouter — free models only, zero credits purchased

| Scope | Limits | Notes |
| --- | --- | --- |
| Any model ID ending `:free` | **20 RPM · 50 RPD** (1,000 RPD only after purchasing ≥ $10 of credits — which we will not do) | free variants expire or move to paid without notice; failed attempts count toward the 50 |
| `openrouter/free` router | same | routes each request to a free model — unpredictable model identity, unusable for a measured comparison |

Sources: [OpenRouter limits](https://openrouter.ai/docs/api_reference/limits), [free variant](https://openrouter.ai/docs/guides/routing/model-variants/free), [FAQ](https://openrouter.ai/docs/faq).

Examples of currently free IDs: `nvidia/nemotron-3-ultra-550b-a55b:free`, `baidu/ernie-5.5-flash-preview:free`, `nvidia/nemotron-3.5-lightning:free`. Because free IDs appear and disappear, the plan's rule is: **an OpenRouter model is usable only if the live `/api/v1/models` entry shows `prompt` and `completion` prices of exactly `"0"` and the ID ends in `:free`**; otherwise the request is refused before it is sent. A negative credit balance blocks free models too, so this path is optional and never the primary.

### 1.5 Local models via Ollama — this machine, measured

Measured on the enrolled machine: **Apple M5, 10 cores, 16 GB unified memory, arm64**. Ollama and llama.cpp are **not installed**.

| Model (4-bit) | Fits 16 GB? | Realistic | Verdict |
| --- | --- | --- | --- |
| `gpt-oss:20b` (~12–13 GB) | Yes, tight | single-digit to low-double-digit tokens/s while the OS competes for memory | usable for offline smoke tests, not for daily design throughput |
| `qwen3:14b` (~9 GB) | Yes | faster | same |
| `llama3.3:70b` (~40 GB+) | No | — | out of scope on this hardware |

Local inference is genuinely $0 and unmetered, but a Plattr design set (~4.8k output tokens) at ~10 tok/s is ~8 minutes per call before any reasoning. Recommendation: keep it as an **offline development fallback**, installed only if you want it (≈10–13 GB download), never as the production path.

---

## 2. Recommended primary and backup

| Role | Provider / model | Why |
| --- | --- | --- |
| **Primary — design stage** | Cloudflare Workers AI `@cf/openai/gpt-oss-120b` | 128k context, no 8k-TPM ceiling, 300 RPM, zero data retention, hard stop at 10k neurons/day (cannot bill) |
| **Primary — understand + copy** | Groq direct `openai/gpt-oss-120b` | fastest, 200k TPD is ample for the two small stages, strict JSON schema, cached prefix excluded from limits |
| **Backup** | Gemini `gemini-3.5-flash-lite` (500 RPD) with `gemini-3.8-flash` (20 RPD) for occasional hard cases | largest free request count; weaker design taste, so understand/copy only unless the design stage is unavailable |
| Optional third | OpenRouter `:free` | only behind the live zero-price check; 50 RPD; never relied on |
| Offline | Ollama `gpt-oss:20b` | development and capture testing without touching any quota |

Splitting stages across two providers is deliberate, not incidental: it is the only way to keep Plattr's single richest call (design) inside a free allowance, and it means one provider's daily exhaustion does not stop the product.

---

## 3. How the zero-cost safeguard is enforced

Three independent layers. Any one of them alone is enough to prevent a charge; all three must fail for money to move.

### Layer 1 — there is nothing to charge

No payment method, billing account or credit balance exists on Groq, Cloudflare or Gemini. Consequence: the account cannot incur debt, and the provider's own meter returns `429`/error instead of an invoice. No OpenRouter credits are purchased, so OpenRouter's free tier stays at the 50/day ceiling and its paid catalog is unreachable.

### Layer 2 — `ZERO_COST_MODE`, deny by default

A new module `src/worker/ai/zeroCost.ts` becomes the only gate every provider call passes through:

```
ZERO_COST_MODE = true

FREE_MODELS = {
  groq:        ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'],
  cloudflare:  ['@cf/openai/gpt-oss-120b', '@cf/meta/llama-3.3-70b-instruct-fp8-fast'],
  gemini:      ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
  openrouter:  []   // populated at runtime, and only from :free IDs whose live price is 0
}
```

`assertZeroCost(request)` throws `PaidRequestRefused` — before any socket is opened — when any of these is true:

1. the provider is not one of `groq | cloudflare | gemini | openrouter`;
2. the model ID is not in the allowlist for that provider (this is what makes a paid model ID impossible to reach, not merely discouraged);
3. an OpenRouter ID does not end in `:free`, or its cached catalog entry shows a non-zero prompt/completion price, or the catalog cannot be read (fail closed);
4. the request carries a `models: [...]` fallback array, `provider.allow_fallbacks !== false`, or an `openrouter/auto`/`openrouter/free` router ID;
5. the provider is Anthropic or OpenAI at all — those adapters are removed from `ProviderName`'s reachable set;
6. the projected tokens (input + `max_tokens`) exceed the **remaining** daily allowance or the per-minute allowance for that model;
7. `ZERO_COST_MODE` is false. The flag is not configurable by environment in production; flipping it is a code change that must be reviewed.

No automatic upgrades, no top-ups, no paid fallback: there is no code path that purchases, upgrades a plan, adds a payment method or routes to a paid endpoint. `billingMode: 'free'` and `costUsd: 0` are stamped on every result rather than derived, so no invoice figure can be fabricated by a price table.

### Layer 3 — quota ledger that stops before the ceiling

`src/worker/ai/quotas.ts` replaces the dollar ledger for run-time control:

| Field per (provider, model, UTC day) | Purpose |
| --- | --- |
| `requests` / `limitRpd` | request cap (Groq 1,000; Gemini 20 or 500; OpenRouter 50; CF n/a) |
| `inputTokens`, `outputTokens`, `totalTokens` / `limitTpd` | token cap (Groq 200,000) |
| `neuronsUsed` / `limitNeurons` | Cloudflare's 10,000/day pool |
| `minuteWindow[]` | TPM/RPM sliding window (Groq 8,000 TPM / 30 RPM) |
| `rateLimitHits`, `lastStatus`, `available` | provider health and 429 accounting |
| `resetsAt` | Groq UTC midnight, Cloudflare 00:00 UTC, Gemini midnight **Pacific**, OpenRouter UTC |
| `costUsd` | always `0`, written literally |

Behaviour:
- a reservation is taken from the quota ledger before each attempt (same discipline as the withdrawn dollar ledger), settled with the provider's reported usage afterwards;
- **exhaustion is a pause, not an error surfaced to the owner**: `pausedUntil = resetsAt`, the generation stops cleanly at a named stage, and the job resumes when the reset passes;
- a `429` records the hit and uses `retry-after` (already parsed, capped at 15s in `provider.ts`) as a *pause*, never as a reason to try a paid model;
- if the remaining allowance cannot be read, the request is refused (fail closed), not attempted optimistically.

The existing validators are unchanged and remain the quality gate: `parseBrief`, `parseDesignSet`, `parseCopy`, contrast checks, `validateConcepts` diversity, `compileConcept`. Deterministic local checks — not the model — decide whether output ships.

---

## 4. Expected generations per day

Measured, not assumed. Prompt sizes were computed with the shipped `estimateTokens()` over the real prompts and the five saved businesses (`docs/qa/generation-benchmark-2026-11-21`), and the design output from the validated sample `docs/p1-ai-proposal/geestores.design-set.json` (12,922 bytes ≈ 3,600 tokens).

| Stage | Prompt (mean of 5) | Wire schema | Visible output |
| --- | --- | --- | --- |
| understand | 953 | 718 | ~800 |
| design | 1,581 | 1,893 | ~3,600 |
| copy | 1,779 | 176 | ~400 |
| **per generation** | **4,313** | **2,787** | **~4,800** |

Plus reasoning tokens on `gpt-oss-120b` (`low`/`medium`): budget ~2,500 for a generation. So one generation ≈ **7.1k input + 7.3k output ≈ 14.4k tokens**.

| Configuration | Arithmetic | Generations/day |
| --- | --- | --- |
| Groq, all three stages, one design call | 9.1k-token design call **exceeds 8,000 TPM** → 429 mid-call | **not viable** |
| Groq, all three stages, design split into 3 concept calls | ≈ 26.3k tokens/generation → 200,000 ÷ 26.3k | **~7** |
| Cloudflare, all three stages | 724 neurons/generation → 10,000 ÷ 724 | **~13** |
| **Recommended hybrid:** Groq understand+copy, Cloudflare design | Cloudflare is the bottleneck at 526 neurons → 10,000 ÷ 526; Groq headroom ≈ 37 | **~19 theoretical, plan for 12–15 usable** |
| + Gemini Flash-Lite as a third lane for understand+copy | 500 RPD ÷ 2 calls | **+250 calls ≈ +125 generations in theory, quality-limited** |
| Gemini 3.8 Flash alone | 20 RPD ÷ 3 calls | **~6** |
| OpenRouter `:free` alone | 50 RPD ÷ 3 calls | **~16, unreliable** |

The honest planning figure is **12–15 business generations per day** in the recommended hybrid, rising towards 30 once Gemini Flash-Lite is trusted for two of the three stages. A 10-business QA sweep therefore takes about a day, which is acceptable for a design-quality trial and not acceptable for a launch day — that is a product decision, not a technical one.

Levers that raise it: cached prompt prefixes (Groq does not count them), smaller wire schemas, dropping the separate copy pass (it is already an improvement, not a dependency), and batching the five businesses' understand calls into one day's budget ahead of design.

---

## 5. Limitations that affect output quality

1. **The design call must be staged or moved.** 8,000 TPM on Groq cannot absorb a 9.1k-token design call. Either the design stage runs on Cloudflare Workers AI (recommended) or it is split into a small plan call plus one call per concept. The split keeps quality only because `validateConcepts` still enforces ≥ 6 differing axes across the three concepts — but a per-concept split makes genuine diversity harder than one call that sees all three at once, and will raise the rejection rate.
2. **Rejection is not free any more, it costs quota.** A failed diversity or grounding check burns the day's tokens. Expect ~1 in 5 generations to need a second attempt; that is already priced into the 12–15/day figure.
3. **Gemini free tier trains on the data.** Only the public-business dossier may go there. Never owner contact details, customer records or private documents.
4. **Cloudflare's 10,000 neurons is small** — one rich generation is ~5% of the day. Its value is the 128k context and the hard stop, not volume.
5. **OpenRouter free models are ephemeral** and can vanish; the allowlist must be resolved at runtime, which is why they are optional and never primary.
6. **No paid fallback means an outage is a wait.** If Groq and Cloudflare both 429, the job pauses to the next reset rather than degrading onto a paid model. That is the requested trade.
7. **Model capability is unchanged from the withdrawn trial for the design stage** (`openai/gpt-oss-120b` both times), so the design-quality comparison stays valid — but reasoning effort may need raising to `high` on the staged path, which costs roughly 30–60% more output tokens.
8. **Prompt-effort gap:** `gpt-oss-20b`/`qwen3.8-27b` are useful for understand and copy but noticeably weaker at the 9-axis design reasoning; they are allowlisted, not recommended for design.

---

## 6. Changes required to the existing code

Not applied yet — this is the approval list. No paid route can execute today because `OPENROUTER_API_KEY` (or any other provider key) is absent, but the removal below is still required so the paid path cannot exist.

**Remove / gate**
1. `src/worker/ai/routes.ts` — delete `TRIAL_ROUTES` (`groq-openrouter`, `claude-openrouter`), `TRIAL_REQUIRED_KEY`, `expectedProvider` pinning to `anthropic`, the Sonnet/Haiku slugs and the OpenRouter fee-bearing route wiring. Replace with `FREE_ROUTES`: `cloudflare-design`, `groq-understand-copy`, `gemini-backup`, each declaring `billing: 'free'`, the free allowance it draws on, and the stages it may serve.
2. `src/worker/ai/provider.ts` — remove `anthropicProvider` and `openaiProvider` from the reachable surface (or keep them behind a hard `PaidRequestRefused`), delete `ANTHROPIC_MODELS`/`OPENAI_MODELS`, and drop `'anthropic' | 'openai'` from `ProviderName`.

**Add**
3. `src/worker/ai/zeroCost.ts` — `ZERO_COST_MODE`, `FREE_MODELS`, `assertZeroCost`, `PaidRequestRefused`, the OpenRouter live-price check (cached) and the request allowlist.
4. `src/worker/ai/quotas.ts` — the per-provider/day ledger described in §3, with `reserveQuota` / `settleQuota` / `pauseUntilReset`, plus a `QuotaStore` interface (JSON file for the CLI, D1 table for production; the D1 write is deliberately out of scope until deployment is approved).
5. `src/worker/ai/provider.ts` — `groqProvider` (`api.groq.com/openai/v1/chat/completions`, `json_schema` + `strict`, `reasoning_effort`), `workersAiProvider` (`@cf/…` via the `AI` binding or REST), `geminiProvider` (`generateContent`, `responseJsonSchema`). Every result carries `billingMode: 'free'`, `costUsd: 0`.
6. `src/worker/ai/schema.ts` — `wireSchemaFor(provider, schema)`: strips `maxLength`/`minLength` (unenforced or rejected), keeps the closed-object/`required` form both Groq strict and Cloudflare JSON mode need, and leaves `pattern` only where the provider supports it. Zod remains authoritative; the wire schema is a hint that improves first-pass validity.
7. `tests/zeroCost.test.ts` — refuses a paid model ID, refuses an OpenRouter non-`:free` ID, refuses when the live price is non-zero, refuses when the quota is exhausted, refuses an unknown provider, records `costUsd: 0`, and pauses (does not retry paid) on 429. Plus `wireSchemaFor` tests.

**Change**
8. `src/worker/ai/pipeline.ts` — `runDesignPipeline` takes a quota ledger as well as (or instead of) the dollar ledger; add `designMode: 'single' | 'per-concept'`; on quota exhaustion throw `PipelineError('quota_paused')` with `pausedUntil`. `MAX_OUTPUT_TOKENS` becomes provider-aware (`gpt-oss-120b` visible ceiling ~3,600 on the staged path instead of 9,000).
9. `src/worker/ai/pricing.ts` — keep the price table and the fee helpers (they document what the paid trial *would* have cost and are still used by the report), but nothing on the free path may call them for spend control; the quota ledger is the control.
10. `src/worker/ai/budget.ts` — the probe caps become quota probes: same "must pass before generation" rule, `PROBE_RETRIES = 0`, but the budget unit is tokens and the booked cost is `0`.
11. `scripts/p1-ai-trial.ts` — `--dry-run` prints free-tier capacity instead of dollar ceilings; `trial.json` gains a `quota` block (`requests`, `tokens`, `neurons`, `rateLimitHits`, `resetsAt`, `costUsd: 0`); the fee/all-in maths moves out of the run path.
12. `tests/aiDesign.test.ts` — the route assertions at lines 578–593 (`['groq-openrouter','claude-openrouter']`, `expectedProvider: 'anthropic'`) move to the free routes.

**Keep unchanged:** prompts, `contracts.ts` schemas, `dossier.ts` minimisation, all validators, `compile.ts`, `doc.ts`, editor/published parity, save/reload. Free models change the supplier, not the guarantees.

---

## 7. What I need from you to proceed

1. **Approval of this plan** (the code changes in §6).
2. Three free keys, pasted into `.dev.vars` by you (never committed, never printed, no card required):
   - `GROQ_API_KEY` — console.groq.com, free plan.
   - `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` (Workers AI, Read/Run) — or, once deployment is approved separately, an `AI` binding with no token at all.
   - `GEMINI_API_KEY` — aistudio.google.com, no billing account linked.
3. Optional: whether to install Ollama (`gpt-oss:20b`, ~12 GB) for offline testing.

**Before any paid-adjacent action:** do not add a payment method to any of these accounts. The zero-cost guarantee in Layer 1 depends on that, not on our code.

## 8. Verification plan after approval (still $0)

- `bun run typecheck` and `bun test` green, including the new `zeroCost` tests.
- `bun scripts/p1-ai-trial.ts --dry-run` prints free capacity, and `--route` names only free routes.
- Adversarial checks: a paid model ID, a `:free` model with a non-zero live price, an exhausted quota and an `allow_fallbacks: true` request each produce `PaidRequestRefused` **without** a network call (asserted by a fetch spy).
- One free compatibility probe per provider against the real `DesignSet` schema, recording tokens, 429s and reset times — no dollar figure anywhere.
- Only then: the 5-business generation sweep, captures, blind review, and a report whose cost line reads exactly `$0.00`.
