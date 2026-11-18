import { describe, expect, test } from 'bun:test'
import { renderApp } from '../src/worker/app'
import { buildSpec, money, moneyIn } from '../src/worker/pricing'
import type { FeatureId } from '../src/worker/types'

describe('money', () => {
  test('groups thousands, and keeps two decimals only when there are pence', () => {
    expect(money(185000)).toBe('$1,850')
    expect(money(64000)).toBe('$640')
    expect(money(0)).toBe('$0')
    expect(money(1250)).toBe('$12.50')
    expect(money(95)).toBe('$0.95')
    expect(money(123456789)).toBe('$1,234,567.89')
  })

  test('the currency follows the customer, not the trade', () => {
    expect(moneyIn(420000, 'GBP')).toBe('£4,200')
    expect(moneyIn(185000, 'eur')).toBe('€1,850')
    expect(moneyIn(1234567, 'INR')).toBe('₹12,345.67')
    // An unrecognised code falls back to dollars rather than printing nothing.
    expect(moneyIn(185000, 'XYZ')).toBe('$1,850')
  })
})

function app(vertical: string, features: FeatureId[]) {
  const spec = buildSpec({
    name: 'Test build',
    vertical,
    accent: '#6a4a30',
    logo: 'TB',
    features,
  })
  return renderApp(spec, { token: 'whats-on-check' })
}

describe("the What's on block", () => {
  test('each trade shows its own events, with the date first', () => {
    const gallery = app('gallery', ['catalog', 'events'])
    expect(gallery).toContain('<b>Thu 18:00</b> · Private view: Low Tide, High Window')
    expect(gallery).toContain('<b>Sun 10:00</b> · Members’ hour')

    const school = app('school', ['catalog', 'events'])
    expect(school).toContain('<b>Tue 12 Nov</b> · Parents’ evening')
    expect(school).toContain('<b>Sat 7 Dec</b> · Winter fair')

    const influencer = app('influencer', ['catalog', 'events'])
    expect(influencer).toContain('<b>Thu 20:00</b> · Live brand Q&amp;A')
  })

  test('a trade with no events says nothing rather than inventing them', () => {
    const restaurant = app('restaurant', ['catalog', 'events'])
    expect(restaurant).not.toContain('What’s on')
    expect(restaurant).not.toContain('Long lunch')
  })

  test('the block is tied to the events feature', () => {
    const withoutEvents = app('gallery', ['catalog'])
    expect(withoutEvents).not.toContain('What’s on')
    expect(withoutEvents).not.toContain('Private view')
  })
})
