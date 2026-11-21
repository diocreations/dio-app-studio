/**
 * Editability audit for the fifteen trade concepts.
 *
 * This renders the same documents the app review uses, extracts every slot the
 * browser tags with `data-el`, and reports whether each one has an editable
 * document identity. Shell chrome that belongs to the application frame is
 * named separately rather than treated as an editable page element.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { renderApp } from '../src/worker/app'
import { flagshipDocFromSpec } from '../src/worker/doc'
import { APPEARANCE_CONTROLS, AUDIT_COVERAGE, auditElementCoverage, elementSlots, SYSTEM_CONTROLLED } from '../src/worker/editability'
import { directionsFor } from '../src/worker/directions'
import { buildSpec } from '../src/worker/pricing'

const TRADES = ['shop', 'restaurant', 'hotel', 'salon', 'professional'] as const
const lines = [
  '# Visual Editor 2.0 — editability audit',
  '',
  'Generated from the saved trade fixtures. Every slot below is tagged by the renderer and addressable by a `Doc.elements` key; shell chrome is listed separately.',
  '',
  '| Trade | Direction | Sections | Slots | Copies | Copied elements | Missing | Duplicate |',
  '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
]
let totalSlots = 0
let exceptions = 0

for (const vertical of TRADES) {
  const base = buildSpec({
    name: 'Cedar & Co',
    vertical,
    accent: '#2f4a3f',
    logo: 'CC',
    features: ['catalog', 'booking', 'quote'],
  })
  if (vertical === 'professional') {
    base.team = [{ name: 'Ada Okafor', role: 'Partner' }]
    base.staff = ['Ada Okafor']
    base.sampleContent = { ...base.sampleContent!, team: false, staff: false }
  }
  for (const direction of directionsFor(vertical)) {
    const spec = { ...base, direction: direction.id }
    const doc = flagshipDocFromSpec(spec)
    const html = renderApp(spec, { token: 'audit-probe', live: false, flagship: true, doc })
    const slots = elementSlots(html)
    const audit = auditElementCoverage(doc, html)
    totalSlots += slots.length
    exceptions += audit.missing.length + audit.duplicates.length
    lines.push(
      `| ${vertical} | ${direction.label} | ${audit.sections} | ${slots.length} | ${audit.copies} | ${audit.copiedElements} | ${audit.missing.length} | ${audit.duplicates.length} |`,
    )
    for (const key of audit.missing) lines.push(`| | | | | | | missing: ${key} | |`)
    for (const key of audit.duplicates) lines.push(`| | | | | | | | duplicate: ${key} |`)
  }
}

lines.push(
  '',
  `**Total rendered slots:** ${totalSlots}. **Exceptions:** ${exceptions}.`,
  '',
  '## Audit coverage',
  '',
  '| Area | What the audit checks |',
  '| --- | --- |',
  ...AUDIT_COVERAGE.map(([area, detail]) => `| ${area} | ${detail.replace(/\|/g, '\\|')} |`),
  '',
  '## System-controlled chrome',
  '',
  ...SYSTEM_CONTROLLED.map((entry) => `- ${entry}`),
  '',
  '## Appearance still editable on system chrome',
  '',
  ...APPEARANCE_CONTROLS.map((entry) => `- ${entry}`),
  '',
  '## Remaining uneditable elements',
  '',
  exceptions
    ? 'The exceptions above need a renderer or document fix before they can be called editable.'
    : 'None in page content. The chrome listed above is deliberately frame-owned; the appearance controls listed above remain editable.',
  '',
)

mkdirSync('docs/qa/editor2-2026-11-21', { recursive: true })
writeFileSync('docs/qa/editor2-2026-11-21/editability-audit.md', lines.join('\n'))
console.log(lines.join('\n'))
