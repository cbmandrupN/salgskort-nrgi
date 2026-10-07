// Public verifier for a bypassable UI lock, never a server authentication secret.
export const SCREEN_LOCK_DIGEST = '461055b201cce8fd1418e30c6c2c36e892e756c9db0db038f66d6f71caaf312e'

export async function codeMatchesDigest(code: string, expectedDigest: string): Promise<boolean> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code))
  const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  return hex === expectedDigest
}
