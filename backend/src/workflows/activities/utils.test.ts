import { describe, it, expect, vi, afterEach } from 'vitest'
import { verifyEmail } from './utils'

describe('verifyEmail', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns false for john.doe addresses', async () => {
    await expect(verifyEmail('john.doe@example.com')).resolves.toBe(false)
  })

  it('returns false for addresses containing a plus tag', async () => {
    await expect(verifyEmail('someone+tag@example.com')).resolves.toBe(false)
  })

  it('returns true for a plain address', async () => {
    await expect(verifyEmail('regular.person@example.com')).resolves.toBe(true)
  })

  it('resolves jane.smith addresses after the simulated delay instead of hanging', async () => {
    vi.useFakeTimers()
    const resultPromise = verifyEmail('jane.smith@example.com')

    await vi.advanceTimersByTimeAsync(20000)

    await expect(resultPromise).resolves.toBe(true)
  })
})
