import { describe, expect, test } from 'bun:test'
import { isOperator, matchesOperatorKey, studioSession } from '../src/worker/studioAuth'

const KEY = 'a'.repeat(48)

describe('studio operator session', () => {
  test('the session is an HMAC of the key, not the key itself', async () => {
    const session = await studioSession(KEY)
    expect(session).toHaveLength(64)
    expect(session).not.toContain(KEY)
    expect(await studioSession(KEY)).toBe(session)
    expect(await studioSession('b'.repeat(48))).not.toBe(session)
  })

  test('a missing key never authenticates, even with a matching cookie', async () => {
    const forged = await studioSession('')
    expect(await isOperator(forged, '')).toBe(false)
    expect(await isOperator(forged, undefined)).toBe(false)
    expect(await isOperator(forged, '   ')).toBe(false)
  })

  test('only the session for the configured key opens the board', async () => {
    const good = await studioSession(KEY)
    expect(await isOperator(good, KEY)).toBe(true)
    expect(await isOperator(await studioSession('wrong'), KEY)).toBe(false)
    expect(await isOperator('', KEY)).toBe(false)
    expect(await isOperator(undefined, KEY)).toBe(false)
    expect(await isOperator(good.slice(0, -1), KEY)).toBe(false)
  })

  test('a submitted key is compared through the same digest', async () => {
    expect(await matchesOperatorKey(KEY, KEY)).toBe(true)
    expect(await matchesOperatorKey(KEY.slice(1), KEY)).toBe(false)
    expect(await matchesOperatorKey('', KEY)).toBe(false)
    expect(await matchesOperatorKey(KEY, undefined)).toBe(false)
  })
})
