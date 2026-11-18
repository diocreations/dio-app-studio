import { describe, expect, test } from 'bun:test'
import {
  documentFor,
  extractPreset,
  fetchFigmaFile,
  parseFigmaTarget,
  upsertPresetSource,
  type FigmaFileResponse,
} from '../src/worker/figma'

const fixture = JSON.parse(
  await Bun.file(new URL('./fixtures/figma-frame.json', import.meta.url)).text(),
) as FigmaFileResponse

describe('figma preset import', () => {
  test('reads colours, type, radii and spacing from a frame', () => {
    const preset = extractPreset(documentFor(fixture, ['1:2']), 'studio')

    expect(preset.tokens.bg).toBe('#faf5ee')
    expect(preset.tokens.surface).toBe('#ffffff')
    expect(preset.tokens.ink).toBe('#1b1b1f')
    expect(preset.tokens.accent).toBe('#e4572e')
    expect(preset.tokens.onAccent).toBe('#ffffff')
    expect(preset.tokens.radius).toBe(12)
    expect(preset.tokens.cardRadius).toBe(13)
    expect(preset.tokens.mediaRadius).toBe(12)
    expect(preset.tokens.space).toBe(8)
    expect(preset.tokens.display).toContain('Playfair Display')
    expect(preset.tokens.body).toContain('Inter')
    expect(preset.tokens.weight).toBe(700)
    expect(preset.tokens.tracking).toBe('-0.021em')
  })

  test('emits one scoped stylesheet with the tokens and spacing it found', () => {
    const { css } = extractPreset(documentFor(fixture, ['1:2']), 'studio')
    for (const line of [
      'body[data-preset="studio"] {',
      '--bg: #faf5ee;',
      '--surface: #ffffff;',
      '--ink: #1b1b1f;',
      '--accent: #e4572e;',
      '--radius: 12px;',
      '--r-card: 13px;',
      '--space: 8px;',
      '--display: "Playfair Display", ui-serif, Georgia, serif;',
      '--body: "Inter", ui-sans-serif, system-ui, sans-serif;',
      'body[data-preset="studio"] .tiles { gap: var(--space); }',
      'body[data-preset="studio"] .r-row { padding-top: var(--space); padding-bottom: var(--space); }',
    ]) {
      expect(css).toContain(line)
    }
    // The base stylesheet derives these from --accent already.
    expect(css).not.toContain('--accent-soft')
    expect(css).not.toContain('--accent-deep')
  })

  test('takes a saturated ground from the frame fill instead of guessing the accent', () => {
    const frame = {
      type: 'FRAME',
      fills: [{ type: 'SOLID', color: { r: 0.96, g: 0.64, b: 0.24 } }],
      children: [{ type: 'FRAME', fills: [{ type: 'SOLID', color: { r: 0.91, g: 0.28, b: 0.37 } }] }],
    }
    const preset = extractPreset(frame, 'warm')
    expect(preset.tokens.bg).toBe('#f5a33d')
    expect(preset.tokens.accent).toBe('#e8475e')
  })

  test('rejects flattened frames and unusable ids', () => {
    expect(() => extractPreset({ type: 'FRAME' }, 'empty')).toThrow(/solid fills/)
    expect(() => extractPreset(documentFor(fixture, ['1:2']), 'Not An Id')).toThrow(/lowercase words/)
  })

  test('parses file keys and node ids from a Figma URL', () => {
    expect(parseFigmaTarget('https://www.figma.com/design/AbC123/Studio?node-id=12-34')).toEqual({
      fileKey: 'AbC123',
      nodeIds: ['12:34'],
    })
    expect(parseFigmaTarget('AbC123')).toEqual({ fileKey: 'AbC123', nodeIds: [] })
    expect(() => parseFigmaTarget('https://example.com/design/AbC123')).toThrow(/Figma file key/)
  })

  test('refuses to call Figma without a token', async () => {
    const calls: string[] = []
    const fetcher = async (url: string) => {
      calls.push(url)
      return { ok: true, status: 200, json: async () => ({}) }
    }
    await expect(fetchFigmaFile({ target: 'AbC123', token: '   ', fetcher })).rejects.toThrow(/FIGMA_TOKEN/)
    expect(calls).toEqual([])
  })

  test('sends the token header and asks only for the selected node', async () => {
    let seen: { url: string; headers: Record<string, string> } | undefined
    const fetcher = async (url: string, init: { headers: Record<string, string> }) => {
      seen = { url, headers: init.headers }
      return { ok: true, status: 200, json: async () => fixture }
    }
    const file = await fetchFigmaFile({ target: 'AbC123', token: 'figd_test', extraNodeIds: ['1:2'], fetcher })
    expect(seen?.url).toBe('https://api.figma.com/v1/files/AbC123/nodes?ids=1%3A2')
    expect(seen?.headers['X-Figma-Token']).toBe('figd_test')
    expect(file.nodes?.['1:2']?.document?.name).toBe('Home frame')
  })

  test('reports a Figma error without leaking the token', async () => {
    const fetcher = async () => ({ ok: false, status: 403, json: async () => ({}) })
    const error = await fetchFigmaFile({ target: 'AbC123', token: 'figd_secret', fetcher }).catch((cause) => cause)
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toContain('403')
    expect(error.message).toContain('file_content:read')
    expect(error.message).not.toContain('figd_secret')
  })

  test('upserts a preset once and preserves the others', () => {
    const source = `const before = 1
/* figma-generated:start */
const FIGMA_PRESETS: Record<string, string> = {}
/* figma-generated:end */
const after = 2`

    const first = upsertPresetSource(source, 'studio', 'body{color:red}')
    expect(first).toContain('"studio": "body{color:red}",')
    expect(first).toContain('const before = 1')
    expect(first).toContain('const after = 2')

    const second = upsertPresetSource(first, 'studio', 'body{color:blue}')
    expect(second.match(/"studio":/g)).toHaveLength(1)
    expect(second).toContain('"studio": "body{color:blue}",')
    expect(second).not.toContain('color:red')

    const third = upsertPresetSource(second, 'other', 'body{margin:0}')
    expect(third).toContain('"studio": "body{color:blue}",')
    expect(third).toContain('"other": "body{margin:0}",')
    expect(third).toContain('/* figma-generated:start */')
  })

  test('presets.ts keeps the generated block the writer targets', async () => {
    const presets = await Bun.file(new URL('../src/worker/presets.ts', import.meta.url)).text()
    expect(presets).toContain('/* figma-generated:start */')
    expect(presets).toContain('/* figma-generated:end */')
    expect(presets).toContain('...FIGMA_PRESETS')
  })
})
