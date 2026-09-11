import type { ApiResponse } from '../types/cases'
import demoCases from '../data/demo-cases.json'

const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
// Demo mode is an explicit, build-time config switch (VITE_DEMO_MODE=true) — it is
// never used to mask a real backend/network error, so a live deployment failure
// still surfaces as an error state instead of silently showing sample data.
const demoModeEnabled = import.meta.env.VITE_DEMO_MODE === 'true'

function buildDemoResponse(): ApiResponse {
  const cases = demoCases.cases as ApiResponse['cases']
  const issues = demoCases.issues as ApiResponse['issues']
  const resolved = cases.filter((c) => c.geocode_status === 'ok').length
  return {
    meta: {
      fetched_at: new Date().toISOString(),
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
  if (demoModeEnabled) return buildDemoResponse()
  const response = await fetch(`${base}/api/cases`)
  if (!response.ok) throw new Error(`API-fejl (${response.status})`)
  return response.json() as Promise<ApiResponse>
}
