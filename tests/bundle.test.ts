import { describe, expect, test } from 'bun:test'
import { BUNDLES, buildSpec, quote, usd } from '../src/worker/pricing'
import { briefPage } from '../src/worker/views/brief'
import { marketingPage } from '../src/worker/views/marketing'

const bundle = BUNDLES[0]

describe('the marketplace bundle', () => {
  test('stands in for the base build, and is not a discount', () => {
    const withBundle = quote({
      features: ['ordering'],
      platforms: [],
      plan: 'onetime',
      bundle: 'marketplace',
    })
    // The bundle carries the customer app, so it replaces "Design and build"
    // rather than being added to it.
    expect(withBundle.lines[0]).toEqual({ label: bundle.label, amount: bundle.price })
    expect(withBundle.oneTime).toBe(bundle.price + 38000)
  })

  test('carries its platform fee whichever plan is chosen', () => {
    const once = quote({ features: [], platforms: [], plan: 'onetime', bundle: 'marketplace' })
    const month = quote({ features: [], platforms: [], plan: 'monthly', bundle: 'marketplace' })
    expect(once.monthly).toBe(bundle.monthly)
    // On the monthly plan the care retainer stacks on the platform fee.
    expect(month.monthly).toBeGreaterThan(bundle.monthly)
    expect(month.firstYear).toBe(month.setupFee + month.monthly * 12)
  })

  test('an unknown bundle id is ignored rather than priced', () => {
    const plain = quote({ features: [], platforms: [], plan: 'onetime' })
    const bogus = quote({ features: [], platforms: [], plan: 'onetime', bundle: 'nope' })
    expect(bogus.oneTime).toBe(plain.oneTime)
    expect(bogus.monthly).toBe(0)
  })

  test('the bundle and its fee are on the marketing page, with a way in', () => {
    const html = marketingPage()
    expect(html).toContain(bundle.label)
    expect(html).toContain(usd(bundle.price))
    expect(html).toContain(`${usd(bundle.monthly)}/mo`)
    expect(html).toContain('/brief?bundle=marketplace')
  })

  test('a bundle chosen on the brief is stored on the build', () => {
    const withBundle = buildSpec({
      name: 'Riverside Market',
      vertical: 'marketplace',
      accent: '#d98324',
      logo: 'RM',
      features: [],
      bundle: 'marketplace',
    })
    expect(withBundle.bundle).toBe('marketplace')
    const plain = buildSpec({ name: 'Riverside', vertical: 'gallery', accent: '#6a4a30', logo: 'RM', features: [] })
    expect(plain.bundle).toBeUndefined()
    const bogus = buildSpec({
      name: 'Riverside',
      vertical: 'gallery',
      accent: '#6a4a30',
      logo: 'RM',
      features: [],
      bundle: 'not-a-bundle',
    })
    expect(bogus.bundle).toBeUndefined()
  })

  test('the brief carries the selector the marketing link preselects', () => {
    const html = briefPage()
    expect(html).toContain('data-bundle="marketplace"')
    expect(html).toContain(`data-monthly="${bundle.monthly}"`)
    expect(html).toContain(bundle.label)
  })
})
