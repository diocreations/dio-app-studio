import { contrast, fontStackFor } from '../design'
import {
  BusinessBriefSchema,
  CopySchema,
  DesignSetSchema,
  type BusinessBrief,
  type ConceptSpec,
  type CopySet,
  type DesignSet,
} from './contracts'
import { isGrounded, type Dossier } from './dossier'

/**
 * Everything a model says is checked before it can reach a document.
 *
 * The checks are deliberately blunt: if a palette is unreadable, a font is
 * unknown, a heading makes a claim, a screen cannot exist, or two concepts are
 * the same application, the answer is refused. A partially repaired answer is
 * harder to reason about than a clean fallback.
 */

export type IssueCode =
  | 'schema'
  | 'identity_trade'
  | 'identity_name'
  | 'currency'
  | 'workflow'
  | 'question'
  | 'palette_contrast'
  | 'font_unknown'
  | 'ungrounded_heading'
  | 'claim_in_heading'
  | 'screen_unavailable'
  | 'concepts_not_distinct'
  | 'concept_duplicate'
  | 'copy_failed'
  | 'owner_approval'

export type Issue = { code: IssueCode; message: string; conceptId?: string }

export type Validated<T> = { value?: T; issues: Issue[] }

/** `owner_approval` is a note, not a refusal: the owner decides. */
export function fatal(issues: Issue[]): Issue[] {
  return issues.filter((issue) => issue.code !== 'owner_approval')
}

function schemaIssues(error: { issues: { path: PropertyKey[]; message: string }[] }): Issue[] {
  return error.issues.slice(0, 8).map((entry) => ({
    code: 'schema' as const,
    message: `${entry.path.map(String).join('.') || 'root'}: ${entry.message}`,
  }))
}

export function parseBrief(raw: unknown, dossier: Dossier): Validated<BusinessBrief> {
  const parsed = BusinessBriefSchema.safeParse(raw)
  if (!parsed.success) return { issues: schemaIssues(parsed.error) }
  const brief = parsed.data
  const issues: Issue[] = []
  const trade = dossier.business.trade
  if (brief.identity.trade !== trade) {
    issues.push({
      code: 'identity_trade',
      message: `The brief says ${brief.identity.trade} but the business was read as ${trade}.`,
    })
  }
  if (brief.identity.name !== dossier.business.name) {
    issues.push({
      code: 'identity_name',
      message: `The brief changed the business name from “${dossier.business.name}” to “${brief.identity.name}”.`,
    })
  }
  if (brief.offer.currency !== dossier.catalogue.currency) {
    issues.push({
      code: 'currency',
      message: `The brief changed the currency from “${dossier.catalogue.currency}” to “${brief.offer.currency}”.`,
    })
  }
  if (dossier.catalogue.entries > 0 && brief.offer.catalogueEntries !== dossier.catalogue.entries) {
    issues.push({
      code: 'workflow',
      message: `The brief reports ${brief.offer.catalogueEntries} catalogue entries; the read found ${dossier.catalogue.entries}.`,
    })
  }
  for (const workflow of brief.offer.workflows) {
    if (workflow.available && !dossier.workflows.includes(workflow.id)) {
      issues.push({
        code: 'workflow',
        message: `The brief offers “${workflow.id}”, which the read did not establish.`,
      })
    }
  }
  if (brief.questions.length > 3) {
    issues.push({ code: 'question', message: 'More than three questions were asked.' })
  }
  return { value: brief, issues }
}

const CLAIM_WORDS =
  /\b(handmade|hand-made|hand-finished|handcrafted|authentic|certified|award[- ]winning|warranty|guarantee|refund|returns?|free delivery|in stock|sold out|best[- ]selling|premium quality|luxury)\b/i

/** A structural heading may name a section or an action. It may not smuggle in
 *  a number, a price or a claim about the business. */
export function claimRisk(text: string): string[] {
  const risks: string[] = []
  if (/\d/.test(text)) risks.push('number')
  if (/[₹$€£¥]/.test(text)) risks.push('currency')
  if (CLAIM_WORDS.test(text)) risks.push('claim')
  return risks
}

function headingIssues(
  concept: ConceptSpec,
  dossier: Dossier,
): Issue[] {
  const issues: Issue[] = []
  for (const heading of concept.content.headings) {
    if (heading.basis === 'verbatim' && !isGrounded(heading.text, dossier)) {
      issues.push({
        code: 'ungrounded_heading',
        conceptId: concept.id,
        message: `“${heading.text}” is marked verbatim but does not appear in the read.`,
      })
    }
    if (heading.basis === 'structural') {
      const risks = claimRisk(heading.text)
      if (risks.length) {
        issues.push({
          code: 'claim_in_heading',
          conceptId: concept.id,
          message: `“${heading.text}” is marked structural but contains ${risks.join(', ')}.`,
        })
      }
    }
    if (heading.basis === 'owner-approval') {
      issues.push({
        code: 'owner_approval',
        conceptId: concept.id,
        message: `“${heading.text}” needs the owner's confirmation before it is published.`,
      })
    }
  }
  return issues
}

export const AXES = [
  'typography',
  'palette',
  'navigation',
  'hero',
  'hierarchy',
  'productPresentation',
  'screenStructure',
  'componentDesign',
  'rhythm',
] as const

export type Axis = (typeof AXES)[number]

export function conceptAxes(concept: ConceptSpec): Record<Axis, string> {
  return {
    typography: `${concept.type.display}|${concept.type.body}|${concept.type.priceFont}`,
    palette: `${concept.palette.bg}|${concept.palette.accent}`,
    navigation: concept.nav.model,
    hero: `${concept.home.composition}|${concept.home.hero}|${concept.home.heroScale}`,
    hierarchy: concept.home.blocks.map((block) => block.role).join('>'),
    productPresentation: `${concept.catalogue.card}|${concept.catalogue.columns}|${concept.catalogue.aspect}|${concept.catalogue.priceTreatment}`,
    screenStructure: `${concept.nav.initialScreen}|${concept.nav.tabs.join(',')}`,
    componentDesign: `${concept.components.buttons}|${concept.components.cards}|${concept.components.dividers}|${concept.radius}`,
    rhythm: `${concept.rhythm.density}|${concept.rhythm.sectionGap}|${concept.rhythm.blockPadding}`,
  }
}

export function parseDesignSet(raw: unknown, dossier: Dossier): Validated<DesignSet> {
  const parsed = DesignSetSchema.safeParse(raw)
  if (!parsed.success) return { issues: schemaIssues(parsed.error) }
  const set = parsed.data
  const issues: Issue[] = []

  const ids = new Set<string>()
  for (const concept of set.concepts) {
    if (ids.has(concept.id)) {
      issues.push({ code: 'concept_duplicate', conceptId: concept.id, message: `Duplicate concept id ${concept.id}.` })
    }
    ids.add(concept.id)

    if (contrast(concept.palette.bg, concept.palette.ink) < 4.5) {
      issues.push({
        code: 'palette_contrast',
        conceptId: concept.id,
        message: `Ink on background is ${contrast(concept.palette.bg, concept.palette.ink).toFixed(2)}:1 (needs 4.5).`,
      })
    }
    if (contrast(concept.palette.bg, concept.palette.muted) < 3) {
      issues.push({
        code: 'palette_contrast',
        conceptId: concept.id,
        message: `Muted text on background is ${contrast(concept.palette.bg, concept.palette.muted).toFixed(2)}:1 (needs 3).`,
      })
    }
    if (contrast(concept.palette.accent, concept.palette.onAccent) < 4.5) {
      issues.push({
        code: 'palette_contrast',
        conceptId: concept.id,
        message: `Accent and on-accent are ${contrast(concept.palette.accent, concept.palette.onAccent).toFixed(2)}:1 (needs 4.5).`,
      })
    }
    if (!fontStackFor(concept.type.display)) {
      issues.push({
        code: 'font_unknown',
        conceptId: concept.id,
        message: `Display family “${concept.type.display}” is not in the font registry.`,
      })
    }
    if (!fontStackFor(concept.type.body)) {
      issues.push({
        code: 'font_unknown',
        conceptId: concept.id,
        message: `Body family “${concept.type.body}” is not in the font registry.`,
      })
    }
    for (const screen of concept.nav.tabs) {
      if (!dossier.allowedScreens.includes(screen)) {
        issues.push({
          code: 'screen_unavailable',
          conceptId: concept.id,
          message: `“${screen}” is not a screen this build has.`,
        })
      }
    }
    issues.push(...headingIssues(concept, dossier))
  }

  for (let i = 0; i < set.concepts.length; i += 1) {
    for (let j = i + 1; j < set.concepts.length; j += 1) {
      const left = conceptAxes(set.concepts[i])
      const right = conceptAxes(set.concepts[j])
      const different = AXES.filter((axis) => left[axis] !== right[axis])
      if (different.length < 6) {
        issues.push({
          code: 'concepts_not_distinct',
          conceptId: set.concepts[j].id,
          message: `${set.concepts[i].id} and ${set.concepts[j].id} differ on only ${different.length} of 9 axes.`,
        })
      }
      if (left.typography === right.typography) {
        issues.push({
          code: 'concepts_not_distinct',
          conceptId: set.concepts[j].id,
          message: `${set.concepts[i].id} and ${set.concepts[j].id} share one type pairing.`,
        })
      }
    }
  }

  return { value: set, issues }
}

export function parseCopy(raw: unknown, set: DesignSet, dossier: Dossier): Validated<CopySet> {
  const parsed = CopySchema.safeParse(raw)
  if (!parsed.success) return { issues: schemaIssues(parsed.error) }
  const copy = parsed.data
  const issues: Issue[] = []
  const known = new Set(set.concepts.map((concept) => concept.id))
  for (const entry of copy.concepts) {
    if (!known.has(entry.id)) {
      issues.push({ code: 'schema', message: `Copy returned for unknown concept ${entry.id}.` })
      continue
    }
    for (const heading of entry.headings) {
      if (heading.basis === 'verbatim' && !isGrounded(heading.text, dossier)) {
        issues.push({
          code: 'ungrounded_heading',
          conceptId: entry.id,
          message: `“${heading.text}” is marked verbatim but does not appear in the read.`,
        })
      }
      if (heading.basis === 'structural') {
        const risks = claimRisk(heading.text)
        if (risks.length) {
          issues.push({
            code: 'claim_in_heading',
            conceptId: entry.id,
            message: `“${heading.text}” is marked structural but contains ${risks.join(', ')}.`,
          })
        }
      }
      if (heading.basis === 'owner-approval') {
        issues.push({
          code: 'owner_approval',
          conceptId: entry.id,
          message: `“${heading.text}” needs the owner's confirmation.`,
        })
      }
    }
  }
  return { value: copy, issues }
}
