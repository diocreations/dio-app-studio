/**
 * Figma REST → design preset.
 *
 * Reads one file (or one frame) through the REST API, keeps the styles a preset
 * actually needs — palette, type, corner radii, spacing — and writes a scoped
 * stylesheet into the generated block in `presets.ts`.
 *
 * What this does not do: recreate the Figma layout. Screens still map onto the
 * trade shells; the import only carries the visual language across.
 */

export type FigmaColor = { r: number; g: number; b: number }
export type FigmaPaint = { type?: string; visible?: boolean; color?: FigmaColor }
export type FigmaTextStyle = {
  fontFamily?: string
  fontSize?: number
  fontWeight?: number
  letterSpacing?: number
}
export type FigmaNode = {
  name?: string
  type?: string
  fills?: FigmaPaint[]
  cornerRadius?: number
  rectangleCornerRadii?: number[]
  itemSpacing?: number
  style?: FigmaTextStyle
  children?: FigmaNode[]
}
export type FigmaFileResponse = {
  document?: FigmaNode
  nodes?: Record<string, { document?: FigmaNode }>
}

export type PresetTokens = {
  bg: string
  surface: string
  surface2: string
  ink: string
  muted: string
  line: string
  accent: string
  onAccent: string
  radius: number
  cardRadius: number
  mediaRadius: number
  display: string
  body: string
  weight: number
  tracking: string
  space: number
}

export type ExtractedPreset = {
  id: string
  css: string
  tokens: PresetTokens
  counts: { fills: number; text: number; radii: number; gaps: number }
}

type Fetcher = (url: string, init: { headers: Record<string, string> }) => Promise<{
  ok: boolean
  status: number
  json(): Promise<unknown>
}>

const ID = /^[a-z][a-z0-9-]*$/
const START = '/* figma-generated:start */'
const END = '/* figma-generated:end */'
const ENTRY = /"([a-z0-9-]+)":\s*("(?:[^"\\]|\\.)*")/g

const clamp = (value: number) => Math.min(1, Math.max(0, value))

function walk(node: FigmaNode, visit: (node: FigmaNode) => void) {
  visit(node)
  for (const child of node.children ?? []) walk(child, visit)
}

function hexOf(color: FigmaColor): string {
  const channel = (value: number) => Math.round(clamp(value) * 255).toString(16).padStart(2, '0')
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`
}

function channels(hex: string): [number, number, number] {
  const value = hex.replace('#', '')
  return [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16) / 255) as [number, number, number]
}

/** WCAG relative luminance, enough to separate grounds, ink and accents. */
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function saturation(hex: string): number {
  const [r, g, b] = channels(hex)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return max === 0 ? 0 : (max - min) / max
}

/** `amount` is how much of `b` ends up in the result. */
function mix(a: string, b: string, amount: number): string {
  const [ar, ag, ab] = channels(a)
  const [br, bg, bb] = channels(b)
  const blend = (x: number, y: number) => (x * (1 - amount) + y * amount) * 255
  return `#${[blend(ar, br), blend(ag, bg), blend(ab, bb)]
    .map((value) => Math.round(value).toString(16).padStart(2, '0'))
    .join('')}`
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = channels(hex).map((value) => Math.round(value * 255))
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function fontStack(family: string): string {
  const trimmed = family.trim()
  const serif = /serif|georgia|times|playfair|merriweather|lora|source serif/i.test(trimmed)
  return serif ? `"${trimmed}", ui-serif, Georgia, serif` : `"${trimmed}", ui-sans-serif, system-ui, sans-serif`
}

function tally(values: string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return counts
}

function mostCommon(values: string[]): string | undefined {
  let best: string | undefined
  let bestCount = 0
  for (const [value, count] of tally(values)) {
    if (count > bestCount) {
      best = value
      bestCount = count
    }
  }
  return best
}

function commonSize(values: number[]): number | undefined {
  let best: number | undefined
  let bestCount = 0
  for (const value of new Set(values)) {
    const count = values.filter((other) => other === value).length
    if (count > bestCount || (count === bestCount && best !== undefined && value > best)) {
      best = value
      bestCount = count
    }
  }
  return best
}

function median(values: number[]): number | undefined {
  if (!values.length) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** `figma.com/file/<key>?node-id=1-2`, `/design/<key>…`, or a bare key. */
export function parseFigmaTarget(input: string): { fileKey: string; nodeIds: string[] } {
  const trimmed = input.trim()
  const fileKey = trimmed.match(/figma\.com\/(?:file|design|proto)\/([A-Za-z0-9]+)/)?.[1] ?? trimmed
  if (!/^[A-Za-z0-9]+$/.test(fileKey)) throw new Error(`Not a Figma file key or URL: ${input}`)
  const node = trimmed.match(/node-id=([0-9]+[-:][0-9]+)/)?.[1]
  return { fileKey, nodeIds: node ? [node.replace('-', ':')] : [] }
}

export function documentFor(file: FigmaFileResponse, nodeIds: string[] = []): FigmaNode {
  for (const id of nodeIds) {
    const node = file.nodes?.[id]?.document
    if (node) return node
  }
  if (file.document) return file.document
  throw new Error('The Figma response has no document. Pass a frame id with node-id=… or --node.')
}

/** Pure: build the token set and scoped stylesheet for one frame. */
export function extractPreset(root: FigmaNode, id: string): ExtractedPreset {
  if (!ID.test(id)) throw new Error(`Preset ids are lowercase words with hyphens, got "${id}"`)

  const fills: string[] = []
  const radii: number[] = []
  const gaps: number[] = []
  const text: { family: string; size: number; weight: number; tracking: number }[] = []

  walk(root, (node) => {
    for (const paint of node.fills ?? []) {
      if (paint.type === 'SOLID' && paint.visible !== false && paint.color) fills.push(hexOf(paint.color))
    }
    if ((node.cornerRadius ?? 0) > 0) radii.push(node.cornerRadius!)
    for (const radius of node.rectangleCornerRadii ?? []) if (radius > 0) radii.push(radius)
    if ((node.itemSpacing ?? 0) > 0) gaps.push(node.itemSpacing!)
    if (node.type === 'TEXT' && node.style?.fontFamily) {
      text.push({
        family: node.style.fontFamily,
        size: node.style.fontSize ?? 16,
        weight: node.style.fontWeight ?? 400,
        tracking: node.style.letterSpacing ?? 0,
      })
    }
  })

  if (!fills.length) {
    throw new Error('No solid fills in this frame. Pick a frame with real layers, not a flattened image.')
  }

  const perColor = tally(fills)
  const colors = [...perColor.keys()]
  // The frame's own fill is its ground, however saturated. Only guess from the
  // lightest colours when the frame itself has none.
  const rootFill = (root.fills ?? []).find((paint) => paint.type === 'SOLID' && paint.visible !== false && paint.color)
  const bg = rootFill?.color
    ? hexOf(rootFill.color)
    : (mostCommon(colors.filter((color) => luminance(color) > 0.82)) ?? '#ffffff')
  const ink = mostCommon(colors.filter((color) => luminance(color) < 0.32)) ?? '#111111'
  const surface =
    mostCommon(colors.filter((color) => color !== bg && luminance(color) > 0.93)) ?? mix(bg, '#ffffff', 0.55)
  const accent = colors
    .filter(
      (color) =>
        color !== bg &&
        color !== surface &&
        saturation(color) > 0.22 &&
        luminance(color) > 0.08 &&
        luminance(color) < 0.88,
    )
    .sort((a, b) => (perColor.get(b) ?? 0) - (perColor.get(a) ?? 0) || saturation(b) - saturation(a))[0] ?? ink

  const displayNode = [...text].sort((a, b) => b.size - a.size || b.weight - a.weight)[0]
  const bodyFamily = mostCommon(text.map((node) => node.family)) ?? displayNode?.family
  const display = displayNode?.family ?? bodyFamily ?? 'ui-sans-serif'
  const body = bodyFamily ?? display

  const radius = median(radii) ?? 14
  const space = commonSize(gaps) ?? 12
  const tracking = displayNode && displayNode.size > 0
    ? `${Math.round((displayNode.tracking / displayNode.size) * 1000) / 1000}em`
    : '-0.01em'

  const tokens: PresetTokens = {
    bg,
    surface,
    surface2: mix(bg, ink, 0.07),
    ink,
    muted: mix(ink, bg, 0.52),
    line: rgba(ink, 0.12),
    accent,
    onAccent: luminance(accent) > 0.55 ? '#111111' : '#ffffff',
    radius: Math.round(radius),
    cardRadius: Math.round(radius * 1.1),
    mediaRadius: Math.max(12, Math.round(radius * 0.78)),
    display: fontStack(display),
    body: fontStack(body),
    weight: displayNode?.weight ?? 650,
    tracking,
    space,
  }

  return {
    id,
    tokens,
    counts: { fills: fills.length, text: text.length, radii: radii.length, gaps: gaps.length },
    css: presetCss(id, tokens),
  }
}

function presetCss(id: string, tokens: PresetTokens): string {
  const scope = `body[data-preset="${id}"]`
  return `${scope} {
  --bg: ${tokens.bg};
  --surface: ${tokens.surface};
  --surface-2: ${tokens.surface2};
  --ink: ${tokens.ink};
  --muted: ${tokens.muted};
  --line: ${tokens.line};
  --accent: ${tokens.accent};
  --on-accent: ${tokens.onAccent};
  --radius: ${tokens.radius}px;
  --r-card: ${tokens.cardRadius}px;
  --r-media: ${tokens.mediaRadius}px;
  --display: ${tokens.display};
  --body: ${tokens.body};
  --weight: ${tokens.weight};
  --tracking: ${tokens.tracking};
  --space: ${tokens.space}px;
}
${scope} .tiles { gap: var(--space); }
${scope} .r-row { padding-top: var(--space); padding-bottom: var(--space); }`
}

export async function fetchFigmaFile(options: {
  target: string
  token: string
  extraNodeIds?: string[]
  fetcher?: Fetcher
}): Promise<FigmaFileResponse> {
  if (!options.token.trim()) {
    throw new Error(
      'FIGMA_TOKEN is missing. Create a personal access token with file_content:read and put it in .env as FIGMA_TOKEN.',
    )
  }
  const { fileKey, nodeIds } = parseFigmaTarget(options.target)
  const ids = [...new Set([...nodeIds, ...(options.extraNodeIds ?? []).map((id) => id.replace('-', ':'))])]
  const url = `https://api.figma.com/v1/files/${encodeURIComponent(fileKey)}${
    ids.length ? `/nodes?ids=${encodeURIComponent(ids.join(','))}` : ''
  }`
  const fetcher = options.fetcher ?? ((input, init) => fetch(input, init))
  const response = await fetcher(url, { headers: { 'X-Figma-Token': options.token } })
  if (!response.ok) {
    throw new Error(
      `Figma API returned ${response.status}. Check the token has file_content:read and that the file is duplicated into your drafts.`,
    )
  }
  return (await response.json()) as FigmaFileResponse
}

/** Insert or replace one preset in the generated block, leaving the rest alone. */
export function upsertPresetSource(source: string, id: string, css: string): string {
  if (!ID.test(id)) throw new Error(`Preset ids are lowercase words with hyphens, got "${id}"`)
  const start = source.indexOf(START)
  const end = source.indexOf(END)
  if (start < 0 || end < 0 || end < start) {
    throw new Error('presets.ts is missing the figma-generated markers')
  }
  const entries = new Map<string, string>()
  for (const match of source.slice(start + START.length, end).matchAll(ENTRY)) {
    entries.set(match[1], JSON.parse(match[2]) as string)
  }
  entries.set(id, css)
  const lines = [...entries.keys()].sort().map((key) => `  ${JSON.stringify(key)}: ${JSON.stringify(entries.get(key))},`)
  const block = `${START}
// Written by scripts/figma-preset.ts. Edit the Figma file or the script, not this block.
const FIGMA_PRESETS: Record<string, string> = ${lines.length ? `{\n${lines.join('\n')}\n}` : '{}'}
${END}`
  return `${source.slice(0, start)}${block}${source.slice(end + END.length)}`
}
