import type { AppSpec, VerticalId } from '../types'

/**
 * The only business data a model ever sees.
 *
 * It is deliberately smaller than the discovery record: identity with its
 * provenance, a catalogue digest, a bounded set of source sentences and the
 * workflows the read actually established. There is no raw HTML, no script, no
 * owner contact, no session token and no customer record. Everything a design
 * may quote is in `facts` or `quotes`; everything else is ungrounded by
 * definition and rejected before the owner sees it.
 */

export type DossierFact = {
  id: string
  label: string
  value: string
  source: string
  confidence: 'verified' | 'likely' | 'guess'
}

export type Dossier = {
  kind: 'url' | 'prompt'
  /** Present only for a prompt-described business. */
  prompt?: string
  business: {
    name: string
    category: string
    trade: VerticalId
    tagline: string
    story: string
    hours: string
    address: string
    phone: string
    email: string
  }
  catalogue: {
    entries: number
    priced: number
    withPhotograph: number
    currency: string
    sections: { name: string; count: number }[]
  }
  facts: DossierFact[]
  quotes: { text: string; source: string }[]
  /** Workflows the read or the owner established. A design may not add one. */
  workflows: string[]
  /** Screens this build can actually render. */
  allowedScreens: string[]
  sample: boolean
}

/** Normalised text, so a model quoting a sentence with different spacing or
 *  curly quotes still matches the source it was given. */
export function normaliseText(value: string): string {
  return value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Every string a `verbatim` design value may match. */
export function groundingStrings(dossier: Dossier): string[] {
  const values = [
    dossier.business.name,
    dossier.business.category,
    dossier.business.tagline,
    dossier.business.story,
    dossier.business.hours,
    dossier.business.address,
    ...dossier.facts.map((fact) => fact.value),
    ...dossier.quotes.map((quote) => quote.text),
  ]
  return values.map(normaliseText).filter(Boolean)
}

export function isGrounded(text: string, dossier: Dossier): boolean {
  const needle = normaliseText(text)
  if (needle.length < 2) return false
  return groundingStrings(dossier).some((value) => value.includes(needle) || needle.includes(value))
}

/**
 * The dossier for a build that has already been read from a website.
 *
 * Only what the import established: the extracted identity, the catalogue
 * digest, bounded source sentences and the workflows the read supports. Contact
 * details and anything customer-shaped stay out; `dossierForPrompt` is the last
 * filter before a provider, and it drops phone, email and story beyond 600
 * characters.
 */
export function dossierFromSpec(spec: AppSpec, options: { source: string }): Dossier {
  const items = spec.menu.flatMap((section) => section.items ?? [])
  const story = String(spec.story ?? '')
  const quotes: { text: string; source: string }[] = []
  const seen = new Set<string>()
  const addQuote = (text: string) => {
    const clean = text.replace(/\s+/g, ' ').trim()
    if (clean.length < 8 || seen.has(clean)) return
    seen.add(clean)
    quotes.push({ text: clean, source: options.source })
  }
  for (const sentence of story.split(/(?<=[.!?])\s+/)) addQuote(sentence)
  addQuote(String(spec.tagline ?? ''))

  const features = new Set(spec.features ?? [])
  const workflows = ['browse']
  if (features.has('ordering') || features.has('delivery')) workflows.push('buy')
  if (features.has('booking') || features.has('classes')) workflows.push('book')
  if (features.has('quote')) workflows.push('quote')
  if (String(spec.address ?? '').trim()) workflows.push('visit')

  const allowedScreens = ['home', 'catalog', 'search', 'more', 'contact', 'about']
  if (workflows.includes('buy')) allowedScreens.push('catalog')
  if (workflows.includes('book')) allowedScreens.push('book')
  if (workflows.includes('quote')) allowedScreens.push('quote')

  const facts: DossierFact[] = []
  const addFact = (id: string, label: string, value: string) => {
    const clean = String(value ?? '').trim()
    if (clean) facts.push({ id, label, value: clean, source: options.source, confidence: 'likely' })
  }
  addFact('identity.category', 'Category', spec.category ?? '')
  addFact('identity.tagline', 'Tagline', spec.tagline ?? '')
  addFact('contact.hours', 'Opening hours', spec.hours ?? '')
  addFact('contact.address', 'Address', spec.address ?? '')
  addFact('catalogue.currency', 'Currency', spec.currency ?? '')

  return {
    kind: 'url',
    business: {
      name: String(spec.name ?? '').trim(),
      category: String(spec.category ?? '').trim(),
      trade: spec.vertical,
      tagline: String(spec.tagline ?? '').trim(),
      // Kept out of the provider payload by `dossierForPrompt`; carried here so
      // the grounding strings match what the owner sees in the build.
      story,
      hours: String(spec.hours ?? '').trim(),
      address: String(spec.address ?? '').trim(),
      phone: String(spec.phone ?? '').trim(),
      email: String(spec.email ?? '').trim(),
    },
    catalogue: {
      entries: items.length,
      priced: items.filter((item) => (item.price ?? 0) > 0).length,
      withPhotograph: items.filter((item) => Boolean(item.image || item.media)).length,
      currency: String(spec.currency ?? ''),
      sections: spec.menu.slice(0, 20).map((section) => ({
        name: section.name,
        count: (section.items ?? []).length,
      })),
    },
    facts,
    quotes: quotes.slice(0, 40),
    workflows,
    allowedScreens: Array.from(new Set(allowedScreens)),
    sample: Boolean(spec.sample),
  }
}

/** A digest for the prompt: facts only, no markup, no duplicated prose. */
export function dossierForPrompt(dossier: Dossier): Record<string, unknown> {
  return {
    kind: dossier.kind,
    prompt: dossier.prompt ?? '',
    business: {
      name: dossier.business.name,
      category: dossier.business.category,
      trade: dossier.business.trade,
      tagline: dossier.business.tagline,
      story: dossier.business.story.slice(0, 600),
      hours: dossier.business.hours,
      address: dossier.business.address,
    },
    catalogue: dossier.catalogue,
    workflows: dossier.workflows,
    allowedScreens: dossier.allowedScreens,
    sampleCatalogue: dossier.sample,
    facts: dossier.facts,
    quotes: dossier.quotes.slice(0, 40),
  }
}
