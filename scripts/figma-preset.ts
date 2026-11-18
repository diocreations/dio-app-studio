/**
 * Import one Figma frame as a Plattr design preset.
 *
 *   FIGMA_TOKEN=… bun scripts/figma-preset.ts <figma-url-or-key> [--node 1:2] [--name studio] [--dry]
 *
 * The token needs the file_content:read scope, and the file must be in your
 * drafts or shared with you. Without --dry the preset is written into the
 * generated block in src/worker/presets.ts, where the app picks it up as
 * `?preset=<name>`.
 */
import { parseArgs } from 'node:util'
import { documentFor, extractPreset, fetchFigmaFile, parseFigmaTarget, upsertPresetSource } from '../src/worker/figma'

const USAGE =
  'usage: FIGMA_TOKEN=… bun scripts/figma-preset.ts <figma-url-or-key> [--node 1:2] [--name studio] [--dry]'

function parseCli() {
  try {
    return parseArgs({
      args: Bun.argv.slice(2),
      options: { node: { type: 'string' }, name: { type: 'string' }, dry: { type: 'boolean' } },
      allowPositionals: true,
    })
  } catch (error) {
    console.error(`${(error as Error).message}\n${USAGE}`)
    process.exit(1)
  }
}

const { values, positionals } = parseCli()
const target = positionals[0]
if (!target) {
  console.error(USAGE)
  process.exit(1)
}

const { fileKey, nodeIds } = parseFigmaTarget(target)
const extra = values.node ? [values.node] : []
const fallbackName = `figma-${fileKey}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-')
const name = (values.name ?? fallbackName).replace(/^-+|-+$/g, '')
const ids = [...nodeIds, ...extra.map((id) => id.replace('-', ':'))]

const file = await fetchFigmaFile({ target, token: process.env.FIGMA_TOKEN ?? '', extraNodeIds: extra }).catch(
  (error: Error) => {
    console.error(`figma import failed: ${error.message}`)
    process.exit(1)
  },
)
const preset = extractPreset(documentFor(file, ids), name)

console.log(`figma → ${preset.id}`)
console.log(
  `  palette   ${preset.tokens.bg} / ${preset.tokens.surface} / ${preset.tokens.ink} / ${preset.tokens.accent}`,
)
console.log(`  type      ${preset.tokens.display.split(',')[0]} · ${preset.tokens.weight} · ${preset.tokens.tracking}`)
console.log(`  radius    ${preset.tokens.radius}px (card ${preset.tokens.cardRadius}, media ${preset.tokens.mediaRadius})`)
console.log(`  spacing   ${preset.tokens.space}px`)
console.log(
  `  sampled   ${preset.counts.fills} fills · ${preset.counts.text} text · ${preset.counts.radii} radii · ${preset.counts.gaps} gaps`,
)

if (values.dry) {
  console.log(`\n${preset.css}`)
  process.exit(0)
}

const presetPath = new URL('../src/worker/presets.ts', import.meta.url)
const source = await Bun.file(presetPath).text()
await Bun.write(presetPath, upsertPresetSource(source, preset.id, preset.css))
console.log(`\nwrote ${preset.id} to src/worker/presets.ts — open /demo/app?preset=${preset.id}&biz=restaurant`)
