# P1 sample output — how to read it

These three files are the sample structured output for one business (GeeStores)
described in `docs/P1_AI_DESIGN_ARCHITECTURE_2026-11-23.md`. They are data, not
code, and no model produced them: they are the shape the pipeline is specified
to produce, written against the real GeeStores read so the cost and mapping
tables are concrete.

| File | Pipeline stage | What it holds |
| --- | --- | --- |
| `geestores.business.json` | A — understand | Identity with provenance, audience hypothesis, catalogue facts, available and unavailable workflows, brand hypothesis, uncertainties, two owner questions |
| `geestores.design-set.json` | B — design set | Three concepts with the nine design axes, stated trade-offs, a diversity claim and three deliberately rejected alternatives |
| `geestores.compiled.json` | D — compile | Per concept: the `AppSpec` patch, the `Doc` and `DocDesign` the compiler emits, and the `requiresP1` tokens and architecture |

## What was verified

A temporary checker loaded these files and ran the product's own validators:

- `identityIssues()` — shop + “Jewellery shop” + site trade `shop` agree;
- `contrast()` — ink/bg 16.77, 17.50, 14.29; muted/bg 6.83, 5.02, 4.30;
  accent/on-accent 5.88, 9.20, 9.28;
- `cleanLayout()` and `cleanStructure()` — all three axis sets accepted;
- `normalizeDoc()` — every compiled document keeps its direction and its four
  home blocks;
- `validateConcepts()` — **pass**: 7 architecture axes differ for every pair,
  no shared home order, no shared opening screen plus tabs.

So the sample is renderable on the shipping path today. It is not a claim that a
model would produce it, and it is not a claim that the three designs are premium.

## What it does not do

Every concept is mapped to a registered direction (`editorial`, `minimal`,
`lifestyle`) so today's normaliser accepts it. The AI-authored architecture,
role sequence and full token palette are in `requiresP1`; the shipping
`sanitizeDesign()` would drop them. That is the boundary the architecture
document describes in §3.6, and the reason for the one additive document field.

No price, product name, address, policy or material claim appears in any design
field. That is by construction: the schema has no field for them.
