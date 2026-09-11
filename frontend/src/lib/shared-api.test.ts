import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ApiResponse } from '../types/cases'
import { fetchSharedSnapshot, prepareSharedData, publishSharedSnapshot } from './shared-api'

const data: ApiResponse = {
  meta: { fetched_at: '2026-09-11T10:00:00Z', data_source: 'local', total_rows: 2,
    resolved_count: 0, unresolved_count: 2, error_count: 0, warning_count: 2 },
  cases: [
    { id: 'row-2', customer_name: 'Fiktiv Bygninger', department: 'Bygninger Vest', address_raw: '', geocode_status: 'fejlet', source_row: 2 },
    { id: 'row-3', customer_name: 'Fiktiv Industri', department: 'Industri', address_raw: '', geocode_status: 'fejlet', source_row: 3 },
  ],
  issues: [{ row_number: 2, severity: 'advarsel', message: 'Adresse mangler' },
    { row_number: 3, severity: 'advarsel', message: 'Adresse mangler' }],
}
const snapshot = () => ({
  revision: 1, file_name: 'Salgsliste.xlsx', uploaded_at: data.meta.fetched_at, data: prepareSharedData(data),
})

beforeEach(() => vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/'))
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

it('shares only Bygninger cases and associated issues, with accurate counters', () => {
  const shared = prepareSharedData(data)
  expect(shared.cases.map(c => c.id)).toEqual(['row-2'])
  expect(shared.issues.map(issue => issue.row_number)).toEqual([2])
  expect(shared.meta).toMatchObject({ total_rows: 1, resolved_count: 0, unresolved_count: 1, warning_count: 1, error_count: 0 })
  expect(data.cases).toHaveLength(2)
})

it('does not let a workbook without Bygninger cases erase shared data', async () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  await expect(publishSharedSnapshot('test-code', 0, 'file.xlsx', { ...data, cases: [data.cases[1]] })).rejects.toThrow('ingen Bygninger-sager')
  expect(fetch).not.toHaveBeenCalled()
})

it('loads the shared snapshot with header authentication, no cookies or cache', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json(snapshot()))
  vi.stubGlobal('fetch', fetch)
  expect(await fetchSharedSnapshot('test-code')).toEqual(snapshot())
  expect(fetch).toHaveBeenCalledWith('https://api.example.test/api/shared/cases', expect.objectContaining({
    method: 'GET', credentials: 'omit', cache: 'no-store',
    headers: { Accept: 'application/json', Authorization: `Basic ${btoa('nrgi:test-code')}` },
  }))
})

it('distinguishes an empty shared store from demonstration data', async () => {
  vi.stubEnv('VITE_DEMO_MODE', 'true')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ revision: 0, file_name: null, uploaded_at: null, data: null })))
  expect((await fetchSharedSnapshot('test-code')).data).toBeNull()
})

it('sends the expected revision and scoped snapshot on publish', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json(snapshot()))
  vi.stubGlobal('fetch', fetch)
  await publishSharedSnapshot('test-code', 0, 'Salgsliste.xlsx', data)
  expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
    method: 'PUT', body: JSON.stringify({ expected_revision: 0, file_name: 'Salgsliste.xlsx', data: prepareSharedData(data) }),
  }))
})

it.each([401, 409, 413, 422, 429, 503])('surfaces shared API error %s without demo fallback', async status => {
  vi.stubEnv('VITE_DEMO_MODE', 'true')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status })))
  await expect(fetchSharedSnapshot('test-code')).rejects.toThrow()
})

it('explains version conflicts without retrying and overwriting a colleague', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 409 }))
  vi.stubGlobal('fetch', fetch)
  await expect(publishSharedSnapshot('test-code', 1, 'Salgsliste.xlsx', data)).rejects.toThrow('Hent seneste')
  expect(fetch).toHaveBeenCalledTimes(1)
})

it.each(['', 'http://api.example.test', 'https://nrgi:secret@api.example.test', 'https://api.example.test?code=secret'])(
  'fails closed for unsafe/missing production URL %s', async url => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_API_BASE_URL', url)
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(fetchSharedSnapshot('test-code')).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  },
)

it('rejects malformed data and out-of-scope server responses', async () => {
  for (const value of [{ ...snapshot(), data: {} }, { ...snapshot(), data }]) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(value)))
    await expect(fetchSharedSnapshot('test-code')).rejects.toThrow()
  }
})
