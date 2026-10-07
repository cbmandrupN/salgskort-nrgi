import { describe, expect, it, vi } from 'vitest'
import { codeMatchesDigest, SCREEN_LOCK_DIGEST } from './screen-lock'

describe('screen lock code comparison', () => {
  const testDigest = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'

  it('accepts an exact matching code', async () => {
    expect(await codeMatchesDigest('hello', testDigest)).toBe(true)
  })

  it('rejects different case, extra whitespace and empty input', async () => {
    for (const code of ['Hello', 'hello ', ' hello', '']) {
      expect(await codeMatchesDigest(code, testDigest)).toBe(false)
    }
    expect(await codeMatchesDigest('', SCREEN_LOCK_DIGEST)).toBe(false)
    expect(await codeMatchesDigest('incorrect', SCREEN_LOCK_DIGEST)).toBe(false)
  })

  it('surfaces browser verification failures rather than unlocking', async () => {
    const digest = vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(new Error('Verification unavailable'))
    try {
      await expect(codeMatchesDigest('hello', testDigest)).rejects.toThrow('Verification unavailable')
    } finally {
      digest.mockRestore()
    }
  })
})
