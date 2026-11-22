import { describe, expect, test } from 'bun:test'
import { renderApp } from '../src/worker/app'
import { buildSpec } from '../src/worker/pricing'

function professional() {
  return buildSpec({
    name: 'Marlow & Finch',
    vertical: 'professional',
    accent: '#34495e',
    logo: 'MF',
    features: ['catalog', 'booking', 'quoting'],
    site: {
      phone: '555 0177',
      menu: [
        {
          name: 'Services',
          items: [
            {
              name: 'Annual accounts',
              desc: 'Year-end accounts and a clear summary.',
              price: 0,
              meta: 'Fixed fee after review',
            },
          ],
        },
      ],
    },
  })
}

describe('professional first action', () => {
  test('leads with the proposal path, not a confirmed intro call', () => {
    const html = renderApp(professional(), { token: 'pro-cta' })
    expect(html).toContain('"detailAction":"quote"')
    expect(html).toContain('Request a proposal')
    // The appointment screen still exists, but it is not the primary action.
    expect(html).toContain('Request a consultation')
  })
})
