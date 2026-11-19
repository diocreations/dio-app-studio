import { existsSync, statSync } from 'node:fs'
import { describe, expect, test } from 'bun:test'
import { FLAGSHIP_PHOTOS, stockImageTag, stockPhotos } from '../src/worker/flagshipImages'
import { buildSpec } from '../src/worker/pricing'

describe('flagship photography', () => {
  test('every flagship has a distinct local scene set at all three widths', () => {
    for (const vertical of [
      'restaurant',
      'shop',
      'salon',
      'hotel',
      'professional',
      'cafe',
      'gym',
      'clinic',
      'property',
      'studio',
      'trades',
      'auto',
      'ecommerce',
      'courses',
      'finance',
    ] as const) {
      const photos = stockPhotos(vertical)
      expect(photos.length).toBeGreaterThanOrEqual(5)
      expect(new Set(photos.map((photo) => photo.name)).size).toBe(photos.length)
      for (const photo of photos) {
        for (const width of [320, 640, 1280]) {
          const file = `public/images/flagship/${photo.name}-${width}.webp`
          expect(existsSync(file)).toBe(true)
          expect(statSync(file).size).toBeGreaterThan(1000)
        }
      }
    }
    expect(Object.keys(FLAGSHIP_PHOTOS).sort()).toEqual([
      'auto',
      'cafe',
      'clinic',
      'courses',
      'ecommerce',
      'finance',
      'gym',
      'hotel',
      'professional',
      'property',
      'restaurant',
      'salon',
      'shop',
      'studio',
      'trades',
    ])
  })

  test('the image markup is responsive, described and local', () => {
    const html = stockImageTag('shop', 0)
    expect(html).toContain('src="/images/flagship/shop-ceramics-640.webp"')
    expect(html).toContain('srcset="/images/flagship/shop-ceramics-320.webp 320w')
    expect(html).toContain('/images/flagship/shop-ceramics-1280.webp 1280w')
    expect(html).toContain('alt="Stacked ceramic vessels in cream and sand"')
    expect(html).toContain('loading="lazy"')
    expect(stockImageTag('shop', 0, { priority: true })).toContain('fetchpriority="high"')
  })
})

describe('generated sample content', () => {
  test('a professional build carries sample team profiles and declares them', () => {
    const spec = buildSpec({ name: 'Northline Accounts', vertical: 'professional', accent: '#17110d', logo: 'NA', features: [] })
    expect(spec.team?.map((person) => person.name)).toEqual(['Maya Chen', 'Alex Reed'])
    expect(spec.staff).toContain('Priya Shah')
    expect(spec.sampleContent).toEqual({
      menu: true,
      contact: true,
      story: true,
      offers: true,
      team: true,
      staff: true,
      tagline: true,
    })
  })

  test('imported catalogue, contact and story stop being labelled sample', () => {
    const spec = buildSpec({
      name: 'Real Shop',
      vertical: 'shop',
      accent: '#2a5a8f',
      logo: 'RS',
      features: [],
      site: {
        menu: [{ name: 'Objects', items: [{ name: 'Mug', desc: 'Stoneware', price: 2800 }] }],
        hours: 'Mon–Sat 9–5',
        phone: '+1 555 0100',
        address: '1 High Street',
        story: 'A real shop with its own words.',
      },
    })
    expect(spec.sampleContent).toEqual({
      menu: false,
      contact: false,
      story: false,
      offers: true,
      team: false,
      staff: false,
      tagline: true,
    })
  })
})
