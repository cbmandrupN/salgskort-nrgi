import { afterEach, expect, it, vi } from 'vitest'
import { fetchCases } from './api'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

it('loads explicit demo mode without requesting an API', async () => {
  vi.stubEnv('VITE_DEMO_MODE', 'true')
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  const data = await fetchCases()
  expect(fetch).not.toHaveBeenCalled()
  expect(data.meta.data_source).toBe('demo')
  expect(data.cases).toHaveLength(5)
  expect(data.cases.filter(c => c.geocode_status === 'ok')).toHaveLength(4)
  expect(data.issues).toHaveLength(1)
})

it('does not fall back to localhost or demo when live configuration is missing', async () => {
  vi.stubEnv('VITE_DEMO_MODE', 'false')
  vi.stubEnv('VITE_API_BASE_URL', '')
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  await expect(fetchCases()).rejects.toThrow('Backend-adressen mangler')
  expect(fetch).not.toHaveBeenCalled()
})

it('surfaces live API failures without returning demo data', async () => {
  vi.stubEnv('VITE_DEMO_MODE', 'false')
  vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/')
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 503 }))
  vi.stubGlobal('fetch', fetch)
  await expect(fetchCases()).rejects.toThrow('API-fejl (503)')
  expect(fetch).toHaveBeenCalledExactlyOnceWith('https://api.example.test/api/cases')
})
