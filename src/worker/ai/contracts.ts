import { z } from 'zod'

/**
 * The three answers Plattr asks a model for, as schemas.
 *
 * One source of truth: the same schema is sent to the provider as a strict JSON
 * schema and used locally to reject an answer that does not match. The schemas
 * deliberately contain no field for a price, a product, an address, a policy,
 * a URL, markup or CSS. A model cannot invent what the schema cannot carry.
 */

const Hex = z.string().regex(/^#[0-9a-f]{6}$/i)
const Screen = z.enum(['home', 'catalog', 'search', 'book', 'quote', 'more', 'contact', 'about'])
const Role = z.enum(['lead', 'discovery', 'proof', 'action', 'visit', 'utility', 'note'])
const Basis = z.enum(['verbatim', 'structural', 'owner-approval'])

const Identity = z
  .object({
    name: z.string().max(80),
    trade: z.string().max(30),
    category: z.string().max(60),
    summary: z.string().max(280),
    nameConfidence: z.enum(['verified', 'likely', 'guess']),
  })
  .strict()

export const BusinessBriefSchema = z
  .object({
    identity: Identity,
    audience: z
      .object({
        primary: z.string().max(120),
        secondary: z.array(z.string().max(120)).max(2),
        confidence: z.enum(['likely', 'guess']),
      })
      .strict(),
    offer: z
      .object({
        currency: z.string().max(8),
        catalogueEntries: z.number().int().min(0).max(100_000),
        entriesWithPhotograph: z.number().int().min(0).max(100_000),
        workflows: z
          .array(
            z
              .object({
                id: z.enum(['browse', 'buy', 'book', 'quote', 'visit']),
                available: z.boolean(),
                why: z.string().max(160),
              })
              .strict(),
          )
          .max(5),
      })
      .strict(),
    brand: z
      .object({
        personality: z.array(z.string().max(24)).min(2).max(4),
        formality: z.enum(['casual', 'balanced', 'formal']),
        energy: z.enum(['calm', 'lively']),
      })
      .strict(),
    vocabulary: z
      .object({
        catalog: z.string().max(20),
        item: z.string().max(20),
        buy: z.string().max(24),
        enquire: z.string().max(24),
      })
      .strict(),
    constraints: z.object({ mustNotInvent: z.array(z.string().max(80)).max(6) }).strict(),
    questions: z
      .array(
        z
          .object({
            id: z.string().max(24),
            question: z.string().max(120),
            why: z.string().max(120),
            skippable: z.boolean(),
          })
          .strict(),
      )
      .max(3),
  })
  .strict()

export const ConceptSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]{1,24}$/),
    name: z.string().max(32),
    oneLine: z.string().max(90),
    rationale: z
      .object({
        for: z.string().max(180),
        whyThisBusiness: z.string().max(240),
        tradeOff: z.string().max(180),
      })
      .strict(),
    architecture: z
      .object({
        header: z.enum(['masthead', 'utility', 'overlay']),
        catalog: z.enum(['journal', 'index', 'stories']),
        cards: z.enum(['editorial', 'compact', 'campaign']),
        detail: z.enum(['feature', 'spec', 'story']),
        type: z.enum(['serif', 'grotesk', 'display']),
        imagery: z.enum(['portrait', 'square', 'wide']),
      })
      .strict(),
    type: z
      .object({
        direction: z.enum(['editorial', 'modern', 'compact']),
        display: z.string().max(40),
        body: z.string().max(40),
        priceFont: z.enum(['display', 'mono', 'body']),
        weight: z.number().int().min(300).max(900),
        tracking: z.string().max(8),
      })
      .strict(),
    palette: z
      .object({
        bg: Hex,
        surface: Hex,
        surface2: Hex,
        ink: Hex,
        muted: Hex,
        accent: Hex,
        onAccent: Hex,
        dark: z.boolean(),
      })
      .strict(),
    radius: z.number().int().min(0).max(26),
    nav: z
      .object({
        model: z.enum(['bar', 'floating', 'dock']),
        initialScreen: z.enum(['home', 'catalog']),
        tabs: z.array(Screen).min(2).max(5),
        labels: z
          .array(z.object({ screen: Screen, label: z.string().max(16) }).strict())
          .min(2)
          .max(5),
      })
      .strict(),
    home: z
      .object({
        composition: z.enum(['title-first', 'image-first', 'catalogue-first']),
        hero: z.enum(['image', 'split', 'centered', 'none']),
        heroScale: z.enum(['compact', 'regular', 'tall', 'immersive']),
        density: z.enum(['cozy', 'standard', 'roomy']),
        blocks: z
          .array(
            z
              .object({ role: Role, variant: z.string().max(40), layout: z.enum(['grid', 'list', 'strip', 'split']) })
              .strict(),
          )
          .min(3)
          .max(7),
      })
      .strict(),
    catalogue: z
      .object({
        presentation: z.string().max(120),
        card: z.enum(['editorial', 'compact', 'campaign']),
        columns: z.number().int().min(1).max(3),
        aspect: z.enum(['portrait', 'square', 'wide']),
        priceTreatment: z.enum(['quiet', 'tabular', 'prominent']),
        imageFit: z.enum(['cover', 'contain']),
      })
      .strict(),
    components: z
      .object({
        buttons: z.enum(['square', 'soft', 'round']),
        cards: z.enum(['square', 'soft', 'round']),
        dividers: z.enum(['none', 'hairline']),
      })
      .strict(),
    rhythm: z
      .object({
        density: z.enum(['cozy', 'standard', 'roomy']),
        sectionGap: z.enum(['small', 'medium', 'large']),
        blockPadding: z.number().int().min(0).max(2),
      })
      .strict(),
    content: z
      .object({
        headings: z
          .array(
            z
              .object({ slot: Role, text: z.string().max(80), basis: Basis })
              .strict(),
          )
          .max(6),
        /** Optional short notes shown with the design in review. They are not
         *  rendered into the app, so they may only describe the design. */
        notes: z
          .array(z.object({ text: z.string().max(120), basis: Basis }).strict())
          .max(3),
      })
      .strict(),
    differentiation: z
      .object({
        against: z.array(z.string().max(24)).max(2),
        axes: z
          .array(z.object({ axis: z.string().max(40), value: z.string().max(120) }).strict())
          .min(6)
          .max(9),
      })
      .strict(),
  })
  .strict()

export const DesignSetSchema = z
  .object({
    thesis: z.string().max(240),
    concepts: z.array(ConceptSchema).length(3),
    diversityClaim: z
      .array(
        z.object({ pair: z.array(z.string().max(24)).length(2), different: z.array(z.string().max(40)).max(9) }).strict(),
      )
      .max(3),
    rejectedAlternatives: z
      .array(
        z
          .object({
            proposal: z.string().max(160),
            rejectedBy: z.string().max(40),
            why: z.string().max(200),
          })
          .strict(),
      )
      .max(4),
  })
  .strict()

export const CopySchema = z
  .object({
    concepts: z
      .array(
        z
          .object({
            id: z.string().max(24),
            headings: z
              .array(z.object({ slot: Role, text: z.string().max(80), basis: Basis }).strict())
              .max(6),
          })
          .strict(),
      )
      .length(3),
  })
  .strict()

export type BusinessBrief = z.infer<typeof BusinessBriefSchema>
export type ConceptSpec = z.infer<typeof ConceptSchema>
export type DesignSet = z.infer<typeof DesignSetSchema>
export type CopySet = z.infer<typeof CopySchema>
export type BasisKind = z.infer<typeof Basis>

/**
 * The exact schema object a provider is sent. Zod emits `$schema`, which some
 * providers reject as an unknown keyword; the rest of the document is already
 * strict (`additionalProperties: false`, every property required).
 */
export function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const generated = z.toJSONSchema(schema, { target: 'draft-2020-12' }) as Record<string, unknown>
  delete generated.$schema
  delete generated.$id
  return generated
}
