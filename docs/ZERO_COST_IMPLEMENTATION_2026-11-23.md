# Zero-cost AI implementation — 2026-11-23

**Status:** implemented and tested locally. **No provider request has been made**, no account was created, no payment method exists, nothing was deployed and no production data was touched.
**Applies to:** `docs/ZERO_COST_AI_PLAN_2026-11-23.md`, approved with the ten conditions in the 2026-11-23 message.
**Supersedes the paid trial:** `docs/P1_TRIAL_AUTHORISATION_2026-11-23-REV5.md` is cancelled; its harness (`scripts/p1-ai-trial.ts`) and its probe-cap module (`src/worker/ai/budget.ts`) are deleted.

---

## 1. What changed

| File | Change |
| --- | --- |
| `src/worker/ai/zeroCost.ts` | **new** — `ZERO_COST_MODE`, the free model allowlist, `assertZeroCost`, `PaidRequestRefused`, Neuron arithmetic, the Cloudflare pool key |
| `src/worker/ai/quotas.ts` | **new** — quota ledger + atomic SQL, D1 store, in-memory store for tests, `QuotaExhaustedError` |
| `src/worker/ai/quotasFile.ts` | **new** — file-backed store with a lock, for local CLI runs only (keeps `node:fs` out of the Worker bundle) |
| `src/worker/ai/provider.ts` | `groqProvider`, `workersAiProvider`, `stagedProvider`; `ProviderName` gains `groq`/`cloudflare`/`mixed`; `providerFromEnv` now builds the zero-cost route; the Anthropic, OpenAI and OpenRouter adapters now throw `PaidRequestRefused` before a request is built |
| `src/worker/ai/routes.ts` | paid trial routes replaced by `ZERO_COST_ROUTES` (three free routes) and `providerForRoute` that refuses without a shared ledger |
| `src/worker/ai/pricing.ts` | free models price at `0` in both `priceFor` and `estimateMaxUsd` |
| `src/worker/ai/budget.ts` | **deleted** — paid probe caps, superseded by the quota ledger |
| `scripts/p1-ai-trial.ts` | **deleted** — the cancelled paid trial harness |
| `scripts/ai-free-preflight.ts` | **new** — offline preflight, no network |
| `tests/zeroCost.test.ts` | **new** — 21 tests |
| `tests/aiDesign.test.ts` | probe-budget tests removed; route test now asserts the free routes |
| `.env.example` | documents the three free key names, empty |

Unchanged, deliberately: prompts, `contracts.ts` schemas, `dossier.ts` minimisation, every validator, `compile.ts`, `doc.ts`, editor/published parity, save/reload, the deterministic fallback when no key is present.

---

## 2. How the zero-cost safeguard works

**Layer 1 — the accounts cannot bill.** Groq free plan, Cloudflare Workers Free, no payment method on either. Groq returns `429`; Cloudflare Workers Free stops at the daily Neuron pool with no overage. An overrun is a wait, not an invoice.

**Layer 2 — the guard, deny by default.** `assertZeroCost()` runs inside every adapter before `fetch`, and again when a route is built:

- provider must be `groq` or `cloudflare`; `gemini` and `openrouter` are refused by name as **future** providers;
- the model must be an exact member of that provider's allowlist (`openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `qwen/qwen3.8-27b`, `@cf/openai/gpt-oss-120b`, `@cf/meta/llama-3.3-70b-instruct-fp8-fast`);
- a `models: [...]` fallback list, `allow_fallbacks: true` or an automatic router is refused outright;
- a request larger than the model's context is refused;
- `ZERO_COST_MODE` is a literal, not an environment variable, so it cannot be turned off by configuration;
- the adapters never send a fallback list or a provider-routing block at all.

**Layer 3 — the ledger stops before the ceiling.** Money is not the control any more; tokens are.

---

## 3. Quota accounting: shared and concurrency-safe

The counter is a table, not a process variable. Every reservation is **one statement whose `WHERE` clause decides**, so two Workers isolates (or two CLI processes) cannot both take the last slot:

```sql
INSERT INTO ai_quota (key, requests, tokens, neurons, rate_limits, blocked_until, updated_at)
VALUES (?, ?, ?, ?, 0, NULL, ?)
ON CONFLICT(key) DO UPDATE SET
  requests = ai_quota.requests + excluded.requests,
  tokens   = ai_quota.tokens   + excluded.tokens,
  neurons  = ai_quota.neurons  + excluded.neurons,
  updated_at = excluded.updated_at
WHERE ai_quota.requests + excluded.requests <= ?
  AND ai_quota.tokens   + excluded.tokens   <= ?
  AND ai_quota.neurons  + excluded.neurons  <= ?
  AND (ai_quota.blocked_until IS NULL OR ai_quota.blocked_until <= ?)
RETURNING key;
```

Keys: `<provider>:<model>:day:<YYYY-MM-DD>`, `<provider>:<model>:minute:<YYYY-MM-DDTHH:MM>`, and one shared `<provider>:neurons:day:<date>` pool because Cloudflare's Neurons are account-wide, not per model.

- **Reserve** before the call (prompt + schema + margin + billed output ceiling), **settle** to reported usage afterwards; a refusal releases every leg it took, in reverse, so no phantom spend remains anywhere.
- **429** increments `rate_limits` and sets `blocked_until`, which every caller reads — provider unavailability is shared state, not local knowledge.
- **Exhaustion throws `QuotaExhaustedError` with `resetsAt`**, so the run pauses to the reset (Groq UTC midnight, Cloudflare 00:00 UTC, minute window for TPM) instead of degrading to a paid model.
- **Fail closed**: a store that throws produces a refusal; there is no optimistic path, and `providerForRoute` throws if no shared ledger is supplied.

Stores: `d1QuotaStore(env.DB)` for Plattr (the pool every user shares), `fileQuotaStore(path)` for the local CLI (exclusive lock file), `memoryQuotaStore()` for tests only.

Deployment note: the Worker needs the `ai_quota` table (DDL above) and `d1QuotaStore(env.DB)` passed as the ledger when the generation route is wired. Nothing was deployed and no D1 statement was executed against production.

---

## 4. Free models, quotas, and why the design stage moved

| Model | Free allowance | Where it is used |
| --- | --- | --- |
| `openai/gpt-oss-120b` (Groq) | 1,000 req/day · 200,000 tok/day · **8,000 tok/min** · 30 req/min | understand + copy |
| `@cf/openai/gpt-oss-120b` (Workers AI) | 10,000 Neurons/day · 300 req/min · 128k context | **design** |
| `openai/gpt-oss-20b`, `qwen/qwen3.8-27b` (Groq) | same Groq pool | allowlisted, not used by the shipping route |
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | same Neuron pool | allowlisted fallback model, 24k context |

Measured per generation: understand 953 + 718 schema, design 1,581 + 1,893, copy 1,779 + 176 → **4,313 prompt + 2,787 schema tokens**, with ~4,800 visible output plus ~3,300 reasoning.

A full design call is ≈9,600 tokens, which is **over Groq's 8,000 tokens/minute**: the ledger refuses it with the minute reset time rather than sending a request that would 429 mid-answer. That is why the shipping route sends design to Workers AI and keeps Groq for the two small stages. The `groq-direct` route exists and fails exactly this way — proof the refusal is real, not a comment.

Daily capacity in the shipping hybrid: ~35 generations of Groq headroom, ~18 of Cloudflare Neuron headroom (a design call is 527 Neurons) → **18/day theoretical, 12–14 usable** once retries and rejected design sets are counted. Exhaustion means waiting for the reset.

---

## 5. Preflight — account status, model availability, quotas, billing

Run `bun scripts/ai-free-preflight.ts`. It is offline by construction: it reads `.dev.vars` **key names only** and prints the allowlist, quotas, routes and capacity. It never prints a value and never opens a socket.

Current state:

| Item | Status |
| --- | --- |
| `GROQ_API_KEY` | **absent** |
| `CLOUDFLARE_ACCOUNT_ID` | **absent** |
| `CLOUDFLARE_API_TOKEN` | **absent** |
| Provider account created by me | none |
| Payment method on any AI account | none |
| Credit balance / purchased credits | none |
| Billing activation code in the project | none, and none may be added |
| Live model availability check | **not performed** — it needs a real request, which awaits your approval |

Until the three keys exist, `providerForRoute` returns `null`, so Plattr cannot call a provider at all and keeps its deterministic fallback.

---

## 6. Privacy: nothing customer-shaped is sent

`dossierForPrompt` is still the only business data a model sees: name, category, trade, tagline, a 600-character story, hours, address, the catalogue digest, established workflows, allowed screens, facts and up to 40 quoted sentences. **No email, phone, customer record, account data, payment data, session token or secret** is in that payload — asserted by a test that plants an owner email, a phone number and a checksum-style value in the dossier and fails if any appears in the prompt.

Keys stay server-side: no browser code imports `src/worker/ai/*` (verified by search), adapters read keys from the server environment, and no adapter returns the key it was given.

---

## 7. Verification actually run

- `bun run typecheck` — clean (`tsc --noEmit` for app and worker configs).
- `bun test` — **825 pass, 0 fail** across 67 files, including 21 new zero-cost tests:
  - guard refusals: Anthropic/OpenAI/OpenRouter/Gemini, unknown model, fallback list, `allow_fallbacks: true`, auto-router, context overrun;
  - a paid model ID refused **before** any socket is opened (fetch spy count 0);
  - the Anthropic, OpenAI and OpenRouter adapters refuse before any fetch, with the spy still at 0;
  - atomic SQL: ten concurrent reservations against a limit of three → exactly three succeed (real SQLite, the same SQL D1 runs);
  - Cloudflare Neuron pool exhaustion, TPM refusal with the reset time, 429 shared blocking, settlement, release, no counter below zero;
  - file-backed ledger shared by two stores → twelve of forty concurrent reservations succeed;
  - adapters: Groq URL/body (`max_completion_tokens`, `reasoning_effort`, strict schema, no fallback fields), Workers AI account URL + bearer token, both `costUsd === 0`;
  - privacy assertions above.
- `bun scripts/ai-free-preflight.ts` — offline report, no request.

---

## 8. Not done, by design

- No provider request, probe, capture or generation sweep. That is the next gate.
- Gemini and OpenRouter are refused, not implemented (condition 2).
- Ollama is not installed (condition 3).
- The product's generation route is not wired to `providerForRoute`; doing so is a separate change with its own review.
- No deployment, no D1 write, no production data change (condition 10).

## 9. Next step

Approve the preflight above, then add the three free keys to `.dev.vars` (no card on any account). After that, the first approved action should be a single free compatibility probe per provider against the real `DesignSet` schema, recording tokens, 429s and reset times — with the cost line reading exactly `$0.00`.
