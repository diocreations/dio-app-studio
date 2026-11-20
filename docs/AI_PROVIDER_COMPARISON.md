# AI provider comparison — research only, nothing activated

Status: **research**. No paid provider is integrated, no key is configured, and no
call is made from the Worker. `src/worker/importer.ts` stays deterministic. This
document exists so the owner can approve a provider and a budget before any code
depends on one.

Prices below are public list prices read on **20 November 2026** from the
vendors' own pricing pages and two independent trackers
(developers.openai.com/api/docs/pricing, ai.google.dev/gemini-api/docs/pricing,
platform.claude.com/docs/models, developers.cloudflare.com/workers-ai/pricing).
They change; every figure must be re-checked at signup and again at each invoice.

## 1. What Plattr would actually ask a model to do

Four separate jobs, deliberately kept apart because they have different risk:

| Job | Input | Output | Failure that matters |
| --- | --- | --- | --- |
| **A. Understand + classify** | cleaned page text (up to 12k tokens), title, meta, JSON-LD summary, URL | trade, business type, confidence, evidence strings | wrong trade → wrong composition |
| **B. Structure extraction** | the same text plus the deterministic candidates the crawler already found | strict JSON: sections, items, prices, currency, image URLs, hours, contact | invented price or item |
| **C. Content + design decisions** | verified facts only (post-validation) | heading copy, section order, three direction choices with reasons | generic copy, invented claims |
| **D. Missing/conflict detection** | verified facts + which fields are empty | blocker list, questions to ask the owner | asking what was already extracted |

A and B are extraction; C and D are generation. Plattr's rule stays: **the model
may classify, choose and write; it may never produce a price, an item, an address
or a policy that is not in the extracted facts.** Output is JSON-schema
constrained, then every field goes through the existing deterministic validators
(`pricing.ts`, `doc.ts`, `importer.ts` sanitizers). A model answer that fails
validation is discarded, not repaired by the model.

## 2. Price comparison (USD per 1M tokens, standard tier)

| Provider | Model | Input | Cached in | Output | Context | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| OpenAI | GPT-6 Luna | $0.10 | $0.01 | $0.50 | 1.05M | cheapest current OpenAI tier |
| OpenAI | GPT-6.1 Terra | $1.00 | $0.05 | $5.00 | 1.05M | balanced default |
| OpenAI | GPT-5.4 mini | $0.75 | $0.075 | $4.50 | 400K | previous mini tier |
| OpenAI | GPT-5 nano | $0.05 | $0.005 | $0.40 | 400K | cheapest, weakest |
| Google | Gemini 3.8 Flash | $0.75 | $0.075 | $3.75 | 1.05M | **doubles on 1 Jan 2027** to $1.50 / $7.50 |
| Google | Gemini 3.5 Flash-Lite | $0.30 | $0.03 | $2.50 | 1.05M | cheap, long context |
| Google | Gemini 2.5 Pro | $1.25 | $0.125 | $10.00 | 1.05M | stronger reasoning |
| Anthropic | Claude Haiku 5.5 | $0.10 | $0.01 | $0.50 | 200K | $0.50 / $2.50 above a 100K prompt |
| Anthropic | Claude Sonnet 5.5 | $2.00 | $0.10 | $10.00 | 1M | 128K output, strong writing |
| Anthropic | Claude Opus 5.5 | $4.00 | $0.20 | $20.00 | 1M | overkill for this task |
| Cloudflare | Workers AI `@cf/openai/gpt-oss-120b` | $0.35 | — | $0.75 | model-dependent | no separate egress, billed in neurons at $0.011/1k |
| Cloudflare | Workers AI `llama-3.1-8b-instruct-fp8-fast` | $0.045 | — | $0.384 | 128K | very cheap, classification only |

## 3. Cost per generated application

Assumption per application (one discovery, three documents, one regeneration
allowance), derived from the page budgets already in `importer.ts`:

- **Input ≈ 34,000 tokens**: A 12k + B 10k + C 6k + D 6k, including schema and
  instruction overhead. Prompt caching removes ~35% of this on repeat visits.
- **Output ≈ 8,500 tokens**: A 1k + B 3k + C 3.5k + D 1k.
- No thinking/reasoning tokens are budgeted; if a reasoning model is used, its
  tokens bill as output and roughly double the generation line.

| Model | Per app | 100 apps/mo | 1,000 apps/mo | 10,000 apps/mo |
| --- | --- | --- | --- | --- |
| Workers AI llama-3.1-8b-fp8-fast | $0.0048 | $0.48 | $4.80 | $48 |
| GPT-6 Luna | $0.0077 | $0.77 | $7.70 | $77 |
| Claude Haiku 5.5 | $0.0077 | $0.77 | $7.70 | $77 |
| Workers AI gpt-oss-120b | $0.0183 | $1.83 | $18.30 | $183 |
| Gemini 3.5 Flash-Lite | $0.0315 | $3.15 | $31.50 | $315 |
| Gemini 3.8 Flash (2026 price) | $0.0574 | $5.74 | $57.40 | $574 |
| GPT-6.1 Terra | $0.0770 | $7.70 | $77 | $770 |
| Claude Sonnet 5.5 | $0.1530 | $15.30 | $153 | $1,530 |
| Gemini 3.8 Flash (from 1 Jan 2027) | $0.1148 | $11.48 | $114.80 | $1,148 |

Model spend is small next to everything else. At 10,000 applications a month the
difference between the cheapest and the most expensive credible option is about
$1,500 — roughly one part-time day of engineering. **Cost should not be the
deciding factor; reliability of structured output and data handling should be.**

### Infrastructure, kept separate from model spend

Not provided by any model vendor, and not included above:

| Item | Unit cost (list) | 10,000 apps/mo |
| --- | --- | --- |
| Worker requests + CPU (crawl, extract, render) | Workers Paid $5/mo minimum, then per-request | ~$25–60 |
| Image fetch + optimise | ~6 MB of derivatives per app | ~60 GB stored → ~$1/mo on R2; optimisation compute is the larger line |
| D1 (specs, documents, history, customers) | first 5 GB free, then per-GB | ~$5–15 |
| R2 storage + operations | $0.015/GB-mo, operations cheap | ~$5 |
| Crawling egress/retries | included in Worker CPU | — |
| Email (magic links, owner notices) | per 1,000 sends | ~$10–20 |
| **Total infra, indicative** | | **~$60–120/mo at 10k apps** |

So at 10,000 applications a month: infra ≈ $60–120, model ≈ $77–1,530. The
honest conclusion is that a premium model is affordable and that crawling,
rendering and storage dominate only if model calls are avoided by caching.

## 4. Qualitative comparison against Plattr's jobs

| Criterion | OpenAI | Gemini | Anthropic | Workers AI |
| --- | --- | --- | --- | --- |
| Business understanding (A) | strong | strong, best long-document reading | strong | adequate on 8B, good on gpt-oss-120b |
| Website content interpretation (A, B) | strong | strong, 1M context handles a whole crawl in one call | strong | one page at a time in practice |
| Structured extraction (B) | JSON schema / structured outputs, reliable | JSON schema supported, reliable | tool-use schema, reliable | JSON mode varies by model; validate strictly |
| Prompt/output reliability (C) | very good | good, occasionally verbose | best instruction-following at small sizes | weakest at 8B, watch for drift |
| Context limits | 400K–1.05M | 1.05M | 200K–1M | model-dependent, often 128K |
| Latency (p50, short prompt) | fast on Luna/Terra | fastest of the four for long inputs | fast on Haiku, slower on Opus | fastest (same network as the Worker) |
| Provider reliability | mature, occasional regional incidents | mature | mature | younger, model deprecations are frequent |
| Data privacy | DPA available, zero-retention option on enterprise | DPA, regional endpoints | DPA, no training on API data by default | data stays inside Cloudflare, strong default for a Worker-only stack |
| Integration complexity | low (REST, no SDK needed) | low | low | lowest: a Worker binding, no egress, no key rotation |
| Fit for Plattr | good default | best if one call must read a whole crawl | best copy quality per dollar at small size | best for classification and for keeping data in-house |

## 5. Recommendation, for approval — not implemented

**Two-model split, one provider abstraction.** This is the shape the code would
take, whichever vendor is approved:

- `src/worker/ai/provider.ts` — one interface: `classify()`, `extract()`,
  `describe()`, `audit()`. Every method takes facts and returns schema-validated
  JSON. No provider type leaks past this file.
- **Extraction and classification (A, B, D):** a small fast model — Claude Haiku
  5.5 or GPT-6 Luna, about **$0.008 per application**. Both are cheap enough that
  the choice should be made on structured-output reliability, tested on the same
  twenty real sites rather than on price.
- **Copy and design decisions (C):** a mid model — Claude Sonnet 5.5 or Gemini
  3.8 Flash, about **$0.15 / $0.06 per application**.
- **Blended estimate: $0.05–0.16 per generated application**, or **$50–160 per
  1,000**, **$500–1,600 per 10,000**. Add infra separately.
- **Workers AI** is the right choice for a free, in-house fallback path
  (classification on `llama-3.1-8b-instruct-fp8-fast`) and for keeping a
  customer's page text inside Cloudflare when that matters more than quality. It
  is not the right primary for copy: the 8B models drift on long instructions.

**Grounded-AI guardrails that must ship with any provider:**

1. The model receives *extracted facts*, never a blank page, and returns JSON.
2. Prices, currency, addresses, hours and item names are accepted only when they
   appear verbatim in the extracted facts; the validator compares before saving.
3. Every accepted field keeps `source`, `method` and `confidence`.
4. A model failure degrades to the deterministic path; it never blocks a build.
5. Per-application token budget with a hard cap, logged per project, so a runaway
   prompt is visible before the invoice.
6. No customer page text is stored in logs; prompts are not retained.

**What approval would look like:** a provider, a monthly cap, and a test corpus
(twenty real sites). Nothing is activated in this change. Before activation I
would run the corpus through the abstraction with a mocked provider, then a single
metered run capped at a few dollars, and report actual tokens and cost per
application against the estimates above.

**Open questions for the owner**

1. Primary provider preference, if any (the recommendation is Anthropic Haiku 5.5
   for extraction and Sonnet 5.5 for copy, with OpenAI as the second option).
2. Monthly cap for the metered trial (recommend $25).
3. Whether customer page text may leave the Cloudflare account at all — if not,
   Workers AI only, and copy quality drops.
