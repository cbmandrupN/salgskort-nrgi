import type { ApiResponse } from '../types/cases'
import { DEFAULT_DEPARTMENT, matchesDepartment } from './departments'
import { hasPosition } from './map-groups'
import { isSavedImport } from './saved-import'

export interface SharedSnapshot {
  revision: number
  file_name: string | null
  uploaded_at: string | null
  data: ApiResponse | null
}
export interface SharedSession { accessCode: string; snapshot: SharedSnapshot }

function endpoint(): string {
  const base = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, '')
  if (!base) throw new Error('Fælles deling er ikke tilsluttet endnu. Backend-adressen mangler.')
  let url: URL
  try { url = new URL(base) } catch { throw new Error('Backend-adressen til fælles deling er ugyldig.') }
  const development = import.meta.env.DEV && url.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if ((url.protocol !== 'https:' && !development) || url.username || url.password || url.search || url.hash) {
    throw new Error('Fælles deling kræver en HTTPS-adresse uden adgangskode eller parametre.')
  }
  return `${base}/api/shared/cases`
}

function validSnapshot(value: unknown): value is SharedSnapshot {
  if (typeof value !== 'object' || value === null || !('revision' in value) ||
    typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision) || value.revision < 0 ||
    !('file_name' in value) || !('uploaded_at' in value) || !('data' in value)) return false
  if (value.data === null) return value.revision === 0 && value.file_name === null && value.uploaded_at === null
  return value.revision > 0 && typeof value.uploaded_at === 'string' &&
    Number.isFinite(Date.parse(value.uploaded_at)) &&
    isSavedImport({ version: 1, fileName: value.file_name, data: value.data })
}

export function prepareSharedData(data: ApiResponse): ApiResponse {
  const cases = data.cases.filter(c => matchesDepartment(c, DEFAULT_DEPARTMENT))
  if (!cases.length) throw new Error('Filen indeholder ingen Bygninger-sager. Den fælles kopi er ikke ændret.')
  const rows = new Set(cases.map(c => c.source_row))
  const issues = data.issues.filter(issue => rows.has(issue.row_number))
  const resolved = cases.filter(hasPosition).length
  return {
    cases, issues,
    meta: {
      ...data.meta, data_source: 'local', total_rows: cases.length,
      resolved_count: resolved, unresolved_count: cases.length - resolved,
      error_count: issues.filter(issue => issue.severity === 'fejl').length,
      warning_count: issues.filter(issue => issue.severity === 'advarsel').length,
    },
  }
}

async function sharedRequest(accessCode: string, upload?: { expected_revision: number; file_name: string; data: ApiResponse }): Promise<SharedSnapshot> {
  const url = endpoint()
  const headers: Record<string, string> = {
    Authorization: `Basic ${btoa(String.fromCharCode(...new TextEncoder().encode(`nrgi:${accessCode}`)))}`,
    Accept: 'application/json',
  }
  if (upload) headers['Content-Type'] = 'application/json'
  let response: Response
  try {
    response = await fetch(url, {
      method: upload ? 'PUT' : 'GET', headers,
      body: upload ? JSON.stringify(upload) : undefined,
      credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20_000),
    })
  } catch {
    throw new Error('Forbindelsen til det fælles kort mislykkedes. Kontrollér forbindelsen og prøv igen. Ved en afbrudt deling: hent seneste kopi, før du prøver igen.')
  }
  if (!response.ok) {
    const messages: Record<number, string> = {
      401: 'Adgangskoden er forkert eller ændret. Log ind igen med teamets aktuelle adgangskode.',
      409: 'En kollega har delt en nyere fil. Vælg Hent seneste, og kontrollér den, før du deler igen.',
      413: 'De delte sagsdata er for store. Backend tillader højst 10 MB.',
      422: 'Backend afviste sagsdataene. Den fælles kopi er ikke ændret.',
      429: 'For mange loginforsøg. Vent fem minutter, og prøv igen.',
      503: 'Fælles deling er ikke tilgængelig. Kontrollér backendens opsætning og lager.',
    }
    throw new Error(messages[response.status] || `Det fælles kort svarede med fejl ${response.status}. Prøv igen.`)
  }
  let value: unknown
  try { value = await response.json() } catch { throw new Error('Det fælles kort returnerede et ulæseligt svar. Prøv at hente igen.') }
  if (!validSnapshot(value)) throw new Error('Det fælles kort returnerede et ukendt dataformat. Data er ikke indlæst.')
  if (value.data && !value.data.cases.every(c => matchesDepartment(c, DEFAULT_DEPARTMENT))) {
    throw new Error('Det fælles datasæt indeholder sager uden for Bygninger. Data er ikke indlæst.')
  }
  return value
}

export const fetchSharedSnapshot = (accessCode: string) => sharedRequest(accessCode)

export async function publishSharedSnapshot(accessCode: string, expectedRevision: number, fileName: string, data: ApiResponse) {
  const snapshot = await sharedRequest(accessCode, {
    expected_revision: expectedRevision, file_name: fileName, data: prepareSharedData(data),
  })
  if (!snapshot.data || !snapshot.file_name || !snapshot.uploaded_at) throw new Error('Backend bekræftede ikke den delte fil. Hent seneste kopi, før du prøver igen.')
  return { ...snapshot, data: snapshot.data, file_name: snapshot.file_name, uploaded_at: snapshot.uploaded_at }
}
