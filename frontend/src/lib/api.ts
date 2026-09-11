import type { ApiResponse } from '../types/cases'
import demoCases from '../data/demo-cases.json'

// Demo mode is an explicit, build-time config switch (VITE_DEMO_MODE=true) — it is
// never used to mask a real backend/network error, so a live deployment failure
// still surfaces as an error state instead of silently showing sample data.

function buildDemoResponse(): ApiResponse {
  const cases = demoCases.cases as ApiResponse['cases']
  const issues = demoCases.issues as ApiResponse['issues']
  const resolved = cases.filter((c) => c.geocode_status === 'ok').length
  return {
    meta: {
      fetched_at: '2026-09-11T08:00:00Z',
      data_source: 'demo',
      total_rows: cases.length,
      resolved_count: resolved,
      unresolved_count: cases.length - resolved,
      error_count: issues.filter((i) => i.severity === 'fejl').length,
      warning_count: issues.filter((i) => i.severity === 'advarsel').length,
    },
    cases,
    issues,
  }
}

export async function fetchCases(): Promise<ApiResponse> {
  if (import.meta.env.VITE_DEMO_MODE === 'true') {
    return buildDemoResponse()
  }

  const base = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, '')
  if (!base) throw new Error('Backend-adressen mangler. Kontakt den ansvarlige for Salgskort.')
  const response = await fetch(`${base}/api/cases`)
  if (!response.ok) throw new Error(`API-fejl (${response.status})`)
  return response.json() as Promise<ApiResponse>
}
