import { expect, test } from 'bun:test'
import { renderServiceWorker } from '../src/worker/app'

test('the service worker keeps owner APIs out of its cache', () => {
  const worker = renderServiceWorker(3)
  expect(worker).toContain("if (url.pathname.startsWith('/api/'))")
  // The bypass must come before the cache-first branch.
  expect(worker.indexOf("url.pathname.startsWith('/api/')")).toBeLessThan(worker.indexOf('caches.match(request)'))
})

test('the service worker still keeps live order and booking status out of cache', () => {
  const worker = renderServiceWorker(3)
  expect(worker).toContain("(?:orders|bookings)")
  expect(worker).toContain('request.mode === \'navigate\'')
})
