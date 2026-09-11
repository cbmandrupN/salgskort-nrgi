import type { ApiResponse } from '../types/cases'
const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
export async function fetchCases(): Promise<ApiResponse> {
  const response = await fetch(`${base}/api/cases`)
  if (!response.ok) throw new Error(`API-fejl (${response.status})`)
  return response.json() as Promise<ApiResponse>
}
