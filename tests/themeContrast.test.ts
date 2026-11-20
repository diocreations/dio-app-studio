import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { themeFor } from '../src/worker/themes'
import { inkFor } from '../src/worker/pricing'
import type { VerticalId } from '../src/worker/types'

/**
 * Theme colours are measured, not trusted. The Gym call-to-action shipped as
 * near-black on near-black and the Salon price at 1.1:1 because a brand colour
 * was used as text on a dark surface. These checks pin the tokens that prevent
 * it: ink on the page, the paired on-accent colour, the deep accent on a light
 * page, and the lifted accent on a dark one.
 */

const hex = (value: string): [number, number, number] => {
  const clean = value.replace('#', '').trim()
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)]
}

const luminance = (rgb: [number, number, number]) => {
  const [r, g, b] = rgb.map((value) => {
    const channel = value / 255
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const contrast = (a: string, b: string) => {
  const first = luminance(hex(a))
  const second = luminance(hex(b))
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

/** `color-mix(in srgb, base, add)` with `add` taking `weight` of the result. */
const mix = (base: string, add: string, weight: number) => {
  const a = hex(base)
  const b = hex(add)
  const channel = (index: number) => Math.round(a[index] * (1 - weight) + b[index] * weight)
  return '#' + [0, 1, 2].map((index) => channel(index).toString(16).padStart(2, '0')).join('')
}

/** The five flagship apps, plus the brand colours real businesses brought. */
const TRADES: VerticalId[] = ['shop', 'restaurant', 'cafe', 'salon', 'gym']
const ACCENTS = ['#5f8a6a', '#7a2f2f', '#2f4a44', '#1f3a5f', '#c0632f', '#3b2f2a']

const READ = (file: string) => readFileSync(join(import.meta.dir, '..', file), 'utf8')

describe('theme contrast', () => {
  for (const trade of TRADES) {
    const theme = themeFor(trade)

    test(`${trade}: body text is readable on the page`, () => {
      expect(contrast(theme.ink, theme.bg)).toBeGreaterThanOrEqual(4.5)
    })

    test(`${trade}: a brand colour used as a button fill keeps its label readable`, () => {
      for (const accent of ACCENTS) {
        expect(contrast(inkFor(accent), accent)).toBeGreaterThanOrEqual(4.5)
      }
    })

    if (theme.dark) {
      test(`${trade} (dark): brand-coloured text is lifted to AA`, () => {
        for (const accent of ACCENTS) {
          const accentText = mix(accent, theme.ink, 0.58)
          expect(contrast(accentText, theme.bg)).toBeGreaterThanOrEqual(4.5)
        }
      })
    } else {
      test(`${trade} (light): the deep brand colour used for prices is AA`, () => {
        for (const accent of ACCENTS) {
          const deep = mix(accent, '#000000', 0.28)
          expect(contrast(deep, theme.bg)).toBeGreaterThanOrEqual(4.5)
        }
      })
    }
  }
})

describe('no brand colour is used as raw text colour', () => {
  test('the app stylesheet and flagship compositions use the accent text token', () => {
    for (const file of ['src/worker/appCss.ts', 'src/worker/flagship.ts']) {
      const source = READ(file)
      const raw = source.match(/(?<![\w-])color: var\(--accent\)/g) ?? []
      expect({ file, raw: raw.length }).toEqual({ file, raw: 0 })
    }
  })

  test('dark text is never hard-coded onto a brand-coloured surface', () => {
    const source = READ('src/worker/flagship.ts')
    expect(source.includes('color: #07130d')).toBe(false)
  })

  test('the accent text token exists for both themes', () => {
    const css = READ('src/worker/appCss.ts')
    expect(css).toContain('--accent-text: var(--accent);')
    expect(css).toContain('--accent-text: color-mix(in srgb, var(--accent) 42%, var(--ink));')
  })
})
