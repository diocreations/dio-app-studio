# P1 trial authorisation — Groq vs OpenRouter (REV6)

**Status:** prepared, not started. **No paid provider call has been made.** Both
keys are absent from this environment and from `.dev.vars`.

This revision replaces all earlier trial drafts. The providers are **Groq**
(`api.groq.com`) and **OpenRouter** (`openrouter.ai`), each serving the same
model, `openai/gpt-oss-120b`. Architecture and pricing detail:
`docs/AI_TRIAL_GROQ_VS_OPENROUTER_2026-11-23.md`.

## Authorised scope, once you approve

- Nine generations: three businesses (jewellery retail, restaurant, professional
  services) × three arms. Two primary arms (direct Groq, and OpenRouter routing
  to the cheapest eligible endpoint) and one controlled arm (OpenRouter pinned
  to its Groq endpoint with fallbacks disabled).
- This is a provider-routing and gateway comparison, not a gateway-only
  comparison: OpenRouter's cheapest-endpoint routing selects the serving vendor.
- Model: `openai/gpt-oss-120b` on every arm. No other model is selected by any
  route.
- The serving endpoint is recorded for every stage and generation; a pinned call
  served by anything other than Groq is refused and charged.
- Stages: understand, design, optional copy. Same prompts, schemas and output
  ceilings on both sides.
- Keys: `GROQ_API_KEY`, `OPENROUTER_API_KEY`, read from `.dev.vars` or the
  environment.
- Approval: `PLATTR_AI_TRIAL=approved` plus the CLI flag `--approve-trial`.

## Limits

| Limit | Value |
| --- | --- |
| Total trial | $30.00 |
| Soft, per generation | $0.18 |
| Hard reservation ceiling, per generation | $0.40 |
| Top-ups | none; there is no code path that purchases credit |

A generation reserves its $0.40 ceiling against the pool before its first call
and settles to the actual charge afterwards. A generation that cannot reserve is
refused without contacting a provider. The $0.40 figure is a reservation and
budget ceiling, not an absolute invoice cap: a provider charge above it is still
recorded, shown in the report and counted against the pool. A charge that cannot be established — a
timeout, dropped connection, non-2xx without billing information, or an answer
without usage — keeps its reservation as spent instead of being refunded, so an
uncertain attempt can never silently increase the remaining budget.

## Prohibited in this trial

- No deployment, publication, domain change or production database write.
- No change to the customer-facing generation route; the trial is a separate,
  explicitly authorised mode.
- No key in chat, logs, commits, browser storage or client code.
- No automatic retry beyond one attempt for transport failure, timeout, 429 or
  5xx.
- No model other than `openai/gpt-oss-120b` on any arm, and no endpoint other
  than Groq on the pinned arm.

## What approval requires

1. Both keys in `.dev.vars`.
2. `PLATTR_AI_TRIAL=approved` for the trial window.
3. `bun scripts/ai-trial.mjs --status` prints `gate: open`.
4. You have explicitly authorised the run in this conversation.

Until all four are true, the trial cannot spend and no provider is contacted.
Revoke by removing `PLATTR_AI_TRIAL`; the gate closes immediately.
