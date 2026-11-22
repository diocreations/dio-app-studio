# Grounded AI model step — provider and cost proposal

**Date:** 2026-11-23
**Status:** proposal only. No paid call made, no paid dependency added, no key configured.
**Decision required:** provider, model, per-generation cost and monthly budget.

## Why a model at all

Stage 1 proved the deterministic URL → profile → three concepts journey. Stage 2 added provenance so every field can say where it came from. What remains genuinely hard for rules:

- choosing between two evidenced trades on a mixed site (a garden centre with a café);
- turning a page's own sentences into a shorter product description **without adding facts**;
- naming a catalogue section in the business's own vocabulary rather than the crawler's;
- classifying an ambiguous policy page (shipping vs returns vs both).

These are judgement calls about language. Prices, currencies, products, images and policies are not: those stay deterministic.

## Recommended provider and model

**Anthropic Claude Haiku 5.5** (`claude-haiku-5-5`) via the Messages API with structured outputs / tool schema.

Why this one:

- Strong instruction-following on extraction and refusal tasks at the lowest current flagship-tier price: **$0.10 input / $0.50 output per 1M tokens** for prompts up to 100k tokens (batch is half price).
- Native strict JSON schema output, which lets Plattr reject a malformed answer before it reaches the owner.
- Long context is not needed per call, so the cheap band applies.
- A clearly cheaper fallback exists if the per-generation figure proves too high: **Gemini 2.5 Flash-Lite at $0.10 / $0.40 per 1M** (or Gemini 3.1 Flash-Lite at $0.25 / $1.50 for newer quality). The interface is a single `fetch`, so either can replace the other without changing the pipeline.

Pricing sources checked 2026-11-23: Anthropic pricing via <https://reflektlab.ai/blog/claude-api-pricing/> and <https://agentping.io/llm-api-pricing>; Google/OpenAI comparison via <https://troiana.net/insights/llm-api-pricing-comparison> and <https://www.vantasoft.com/resources/llm-prices>. **All figures are list prices at the time of writing and must be re-checked before approval; providers changed prices repeatedly in 2026.**

Rejected for this step: Z.ai / GLM Flash (cheapest, but structured-output adherence and English copy quality are unproven for this task and the recommendation is sponsored); a multi-provider gateway (adds a vendor before a single call is justified).

## Tasks assigned to the model

Each task receives a bounded, already-extracted dossier and must answer with a schema-constrained object that cites the evidence it used.

| # | Task | Input | Output | Guard |
| --- | --- | --- | --- | --- |
| 1 | Trade/category choice | Candidate trades with their evidence phrases | One candidate id + one quoted phrase per candidate | Must be one of the candidates; no new trade |
| 2 | Product description tightening | The product's own source sentences, max 400 chars | A shorter description plus the exact source span | Reject if the output contains a number, price, material or claim absent from the span |
| 3 | Section naming | Section names, item names, trade vocabulary | A label from the trade's vocabulary or the source's own words | Length bound; no invented category |
| 4 | Policy classification | URL, page title, first 400 chars | `shipping` / `returns` / `privacy` / `terms` / `other` / `unknown` | Link and URL are still recorded by the crawler; the model never supplies the URL |

Not assigned: extracting products, prices, currencies, images or contact details; resolving price conflicts; converting currency; choosing a concept or writing its layout; publishing; payment.

## What remains deterministic

- Fetching, robots.txt, redirects and crawl budgets.
- HTML parsing, JSON-LD/embedded-JSON/visible-text extraction.
- Price reading, ranges, conflict detection, currency codes (never converted).
- Image eligibility and the "not this product's photo" gate.
- Field-level provenance, confidence and the owner-question set.
- Catalogue cleaning, validation, composition choice, rendering, editor, publish and pricing.
- Every fallback path: if the model is unavailable, the deterministic result is the product.

## Estimated cost per generation

Assumptions per build (one model call per task, four tasks, one bounded retry budget):

- Dossier: **12,000 input tokens** total across the four calls (about 10 pages of clipped visible text plus item names).
- Output: **1,500 tokens** total.
- Retry allowance: **30%** of calls repeat once.

| Component | Calculation | Cost |
| --- | --- | ---: |
| Input | 12,000 × $0.10 / 1M | $0.00120 |
| Output | 1,500 × $0.50 / 1M | $0.00075 |
| Subtotal | | **$0.00195** |
| With 30% retries | × 1.3 | **≈ $0.0025** |

- Typical build: **$0.002–0.003**.
- Chatty catalogue (25k input / 3k output): **≈ $0.005**.
- Worst case with three failed attempts and a full re-run: **≈ $0.02**.

A generation that uses the fallback (model unavailable) costs **$0**.

## Monthly budget scenarios

At ≈ $0.0025 per successful generation, before any committed discount:

| Builds / month | Token cost | +50% headroom | Proposed cap |
| ---: | ---: | ---: | ---: |
| 500 | $1.25 | $1.88 | $5 |
| 2,000 | $5.00 | $7.50 | $15 |
| 10,000 | $25.00 | $37.50 | **$50** |
| 50,000 | $125.00 | $187.50 | $250 |

**Recommendation:** start on the **10,000-build tier with a hard $50/month cap**, which covers roughly 20,000 generations including retries at the estimated rate. The cap is enforced by a stored monthly counter checked before every call, not by hoping the invoice is small. The counter, token usage and per-build cost are logged without prompt contents.

## Fallback behaviour

1. **Timeout** (8s per call, 15s per build): abandon the model for that build and use the deterministic answer.
2. **Provider 5xx / 429 / network failure:** one retry with jitter, then deterministic.
3. **Invalid schema or ungrounded output:** reject that answer, no partial merge; deterministic answer stands and the field is marked `needsConfirmation`.
4. **Circuit breaker:** three consecutive transport failures pause model calls for 10 minutes; the URL-first journey is unaffected.
5. **No key configured:** model step is skipped entirely. This is the current state.
6. **Never:** invent a fact to fill a gap, resolve a price conflict, convert currency, or block a build because the model is down.

## Approval request

To proceed, approve:

1. Provider/model: **Anthropic Claude Haiku 5.5** (fallback: Gemini Flash-Lite).
2. Estimated **$0.0025 per generation**, hard ceiling **$0.02**.
3. Monthly cap: **$50**, covering ~20,000 generations including retries.

Until that approval, no key is added, no paid dependency is installed and no model call is made.
