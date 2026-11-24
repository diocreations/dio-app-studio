import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { briefFor, designSetFor, trialBusinesses } from './aiTrialFixtures'
import {
  PROMPT_DIGEST,
  PROMPT_VERSION,
  copyPrompt,
  designPrompt,
  understandPrompt,
} from '../src/worker/ai/prompts'
import { dossierForPrompt, isGrounded } from '../src/worker/ai/dossier'
import { claimRisk, fatal, parseBrief, parseDesignSet } from '../src/worker/ai/validate'
import type { BusinessBrief, DesignSet } from '../src/worker/ai/contracts'

/**
 * Facts and assumptions, after the first live run was refused.
 *
 * The paid trial's first generation failed `brief_invalid` on one assumption:
 * "The brand values handcrafted quality." The dossier says "Unisex, handmade,
 * wardrobe staples" — a product description, not a brand-values claim. The
 * correction is prompt-only: the validator and `CLAIM_WORDS` are unchanged, and
 * these tests pin both sides of that line.
 */

const yarmouth = async () => {
  const business = (await trialBusinesses()).find((entry) => entry.id === 'yarmouth')
  if (!business) throw new Error('the Yarmouth saved crawl is missing')
  return business
}

const withAssumption = (brief: BusinessBrief, claim: string): BusinessBrief => ({
  ...brief,
  assumptions: [{ claim, basis: 'inference', why: 'the model inferred it' }],
})

describe('the understand prompt separates sourced facts from assumptions', () => {
  test('it states the rule and carries the Yarmouth worked example', async () => {
    const { dossier } = await yarmouth()
    const prompt = understandPrompt(dossier)

    expect(prompt.system).toContain('Sourced facts and assumptions are different instruments')
    expect(prompt.system).toContain('The assumptions list is only for what the dossier does not say')
    expect(prompt.system).toContain('Never paraphrase a source-backed claim into')
    expect(prompt.system).toContain('values, philosophy, quality or positioning')
    // Positive and negative examples, quoting the exact failure.
    expect(prompt.system).toContain('Unisex, handmade, wardrobe staples')
    expect(prompt.system).toContain('Good assumption')
    expect(prompt.system).toContain('Bad assumption, refused')
    expect(prompt.system).toContain('The brand values handcrafted quality.')
    expect(prompt.system).toContain('Every piece is handmade in Great Yarmouth.')
  })

  test('the dossier still reaches the prompt with its sourced words intact', async () => {
    const { dossier } = await yarmouth()
    const prompt = understandPrompt(dossier)
    const payload = dossierForPrompt(dossier) as { business: { story: string } }
    expect(payload.business.story).toContain('handmade')
    expect(prompt.user).toContain('handmade')
  })

  test('the prompt revision is recorded, so a run can name its instructions', () => {
    expect(PROMPT_VERSION).toBe('plattr-design/2026-11-24.1')
  })

  test('the recorded digest matches the instruction text', async () => {
    const { dossier, spec } = await yarmouth()
    const brief = briefFor(dossier)
    const set = designSetFor(dossier, brief, spec)
    const digest = createHash('sha256')
      .update(
        [
          understandPrompt(dossier).system,
          designPrompt(dossier, brief).system,
          copyPrompt(dossier, brief, set).system,
        ].join('\u0000'),
      )
      .digest('hex')
    expect(PROMPT_DIGEST).toBe(digest)
    expect(PROMPT_DIGEST).toMatch(/^[a-f0-9]{64}$/)
  })
})

describe('the exact live failure is still refused, and the corrected shape accepted', () => {
  test('"The brand values handcrafted quality." remains a fatal assumption', async () => {
    const { dossier } = await yarmouth()
    const result = parseBrief(withAssumption(briefFor(dossier), 'The brand values handcrafted quality.'), dossier)
    expect(result.issues.map((issue) => issue.code)).toContain('invented_assumption')
    expect(fatal(result.issues).map((issue) => issue.code)).toContain('invented_assumption')
  })

  test('assumptions about genuinely unknown things pass', async () => {
    const { dossier } = await yarmouth()
    const brief: BusinessBrief = {
      ...briefFor(dossier),
      assumptions: [
        {
          claim: 'Most customers buy for themselves rather than as gifts.',
          basis: 'guess',
          why: 'the dossier never says who buys',
        },
        {
          claim: 'A single browse screen covers the whole catalogue.',
          basis: 'inference',
          why: 'the catalogue digest is small',
        },
      ],
    }
    expect(fatal(parseBrief(brief, dossier).issues)).toEqual([])
  })
})

describe('source-backed product facts remain available to the pipeline', () => {
  test('the saved crawl still grounds the words the model must not treat as unknown', async () => {
    const { dossier } = await yarmouth()
    expect(dossier.quotes.some((quote) => /handmade/i.test(quote.text))).toBe(true)
    const payload = dossierForPrompt(dossier) as { business: { story: string } }
    expect(payload.business.story).toContain('handmade')
    expect(isGrounded('Unisex, handmade, wardrobe staples', dossier)).toBe(true)
    // A brief built from the dossier alone still validates: the fix adds no new
    // refusal to the sourced path.
    expect(fatal(parseBrief(briefFor(dossier), dossier).issues)).toEqual([])
  })
})

describe('grounding protections are unchanged', () => {
  test('unsupported brand-value claims are still rejected', async () => {
    const { dossier } = await yarmouth()
    for (const claim of [
      'We guarantee every jacket lasts a lifetime.',
      'The brand is certified for sustainable manufacturing.',
      'Our products are premium quality.',
    ]) {
      const issues = fatal(parseBrief(withAssumption(briefFor(dossier), claim), dossier).issues)
      expect(issues.map((issue) => issue.code)).toContain('invented_assumption')
    }
  })

  test('numbers, currency and claim words are still refused inside an assumption', async () => {
    expect(claimRisk('handcrafted quality')).toEqual(['claim'])
    expect(claimRisk('Rings start at 2499')).toContain('number')
    expect(claimRisk('From $40')).toContain('currency')
    const { dossier } = await yarmouth()
    for (const claim of ['The price is 2499.', 'Everything ships free delivery.', 'It is award winning.']) {
      expect(
        fatal(parseBrief(withAssumption(briefFor(dossier), claim), dossier).issues).length,
      ).toBeGreaterThan(0)
    }
  })

  test('heading grounding is unchanged for verbatim and structural text', async () => {
    const { dossier, spec } = await yarmouth()
    const brief = briefFor(dossier)
    const set = structuredClone(designSetFor(dossier, brief, spec)) as DesignSet
    set.concepts[0].content.headings = [
      { slot: 'lead', text: 'Every jacket is handmade in Great Yarmouth', basis: 'verbatim' },
      { slot: 'discovery', text: 'Handcrafted quality', basis: 'structural' },
    ]
    const issues = parseDesignSet(set, dossier).issues
    expect(issues.some((issue) => issue.code === 'ungrounded_heading')).toBe(true)
    expect(issues.some((issue) => issue.code === 'claim_in_heading')).toBe(true)
  })
})
