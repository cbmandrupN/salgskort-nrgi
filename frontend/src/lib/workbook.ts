import type { CellValue, Worksheet } from 'exceljs'
import type { ApiResponse, Case, CaseStatus, RowIssue } from '../types/cases'
import postcodeData from '../data/postcodes.json'

export const MAX_WORKBOOK_BYTES = 10 * 1024 * 1024
const MAX_ROWS = 5000
const postcodes: Record<string, { name: string; latitude: number; longitude: number }> = postcodeData

export const COLUMN_MAPPING = {
  department: 'Afdeling',
  created_date: 'Salgsdato',
  sales_month: 'Salgsmåned',
  customer_name: 'Virksomhed',
  address: 'Adresse (Besigtiget)',
  postal_code: 'Post nr.',
  product_type: 'Produkt type',
  estimated_value: 'Beløb',
  created_bc: 'Oprettet i BC',
  case_number: 'Projekt nr.',
  advisor: 'Rådgiver',
  report_sent: 'Rapport sendt til kunde & sælger',
  completed: 'Fuldført',
  invoiced: 'Faktureret',
  closed: 'Lukket i BC',
} as const

type Field = keyof typeof COLUMN_MAPPING
type Values = Partial<Record<Field, string>>
const normalized = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('da-DK')

function cellText(value: CellValue): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value).trim()
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if ('richText' in value) return value.richText.map(part => part.text).join('').trim()
  if ('text' in value) return value.text.trim()
  if ('error' in value) throw new Error('Excel-cellen indeholder en fejl.')
  if ('formula' in value || 'sharedFormula' in value) {
    if (value.result === undefined) throw new Error('Formlen mangler et gemt resultat. Gem filen i Excel og prøv igen.')
    return cellText(value.result)
  }
  throw new Error('Celletypen kunne ikke læses.')
}

export function parseDanishAmount(value: string | number): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (!value) return undefined
  const cleaned = value.replace(/\s|kr\.?|DKK/gi, '')
  const numeric = cleaned.includes(',') || /^-?\d{1,3}(?:\.\d{3})+$/.test(cleaned)
    ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned
  if (!/^-?\d+(?:\.\d+)?$/.test(numeric)) return undefined
  const result = Number(numeric)
  return Number.isFinite(result) ? result : undefined
}

export function normalizePostalCode(separate: string, address: string): { code?: string; conflict: boolean } {
  const fromField = separate.match(/^(?:DK[- ]?)?(\d{4})(?:\s|$)/i)?.[1]
  const fromAddress = address.match(/(?:^|[,\s])(?:DK[- ]?)?(\d{4})(?=\s+[^\d]|$)/i)?.[1]
  if (fromField && fromAddress && fromField !== fromAddress) return { conflict: true }
  return { code: fromField || fromAddress, conflict: false }
}

function statusFrom(values: Values): { status: CaseStatus; basis: string } {
  if (['ja', 'lukket'].includes(normalized(values.closed || ''))) return { status: 'lukket', basis: 'Lukket i BC' }
  if (normalized(values.completed || '') === 'ja') return { status: 'fuldfoert', basis: 'Fuldført = Ja' }
  if (normalized(values.completed || '') === 'delvist') return { status: 'delvist_faerdig', basis: 'Fuldført = Delvist' }
  if (normalized(values.report_sent || '') === 'ja') return { status: 'rapport_sendt', basis: 'Rapport sendt = Ja' }
  if (normalized(values.created_bc || '') === 'ja') return { status: 'i_gang', basis: 'Oprettet i BC = Ja' }
  return { status: 'ny', basis: 'Ingen senere fremdrift registreret i arket' }
}

export function parseWorksheet(sheet: Worksheet): ApiResponse {
  if (sheet.rowCount > MAX_ROWS) throw new Error(`Arket må højst indeholde ${MAX_ROWS} rækker.`)
  const headers = new Map<string, number>()
  sheet.getRow(1).eachCell((cell, column) => {
    const header = normalized(cellText(cell.value))
    if (headers.has(header)) throw new Error(`Kolonnen "${header}" findes flere gange.`)
    headers.set(header, column)
  })
  const fields: Partial<Record<Field, number>> = {}
  for (const [field, header] of Object.entries(COLUMN_MAPPING)) {
    fields[field as Field] = headers.get(normalized(header))
  }
  for (const field of ['customer_name', 'address', 'postal_code', 'advisor', 'department'] as const) {
    if (!fields[field]) throw new Error(`Fanen Opgaver mangler kolonnen "${COLUMN_MAPPING[field]}".`)
  }
  const cases: Case[] = []
  const issues: RowIssue[] = []
  let templateRows = 0
  const addIssue = (row: number, field: string, message: string, severity: 'fejl' | 'advarsel' = 'advarsel') =>
    issues.push({ row_number: row, field, message, severity })

  sheet.eachRow((row, sourceRow) => {
    if (sourceRow === 1) return
    let meaningful = false
    row.eachCell((cell, column) => {
      if (column !== fields.sales_month && cell.value !== null && cell.value !== '') meaningful = true
    })
    if (!meaningful) { templateRows++; return }
    const values: Values = {}
    for (const [field, column] of Object.entries(fields)) {
      if (!column || field === 'sales_month') continue
      try {
        values[field as Field] = cellText(row.getCell(column).value)
      } catch (error) {
        addIssue(sourceRow, field, error instanceof Error ? error.message : 'Cellen kunne ikke læses.', 'fejl')
      }
    }
    const address = (values.address || '').replace(/\s+/g, ' ').trim()
    const postal = normalizePostalCode(values.postal_code || '', address)
    const center = !postal.conflict && postal.code ? postcodes[postal.code] : undefined
    const rawAmount = fields.estimated_value ? row.getCell(fields.estimated_value).value : undefined
    const amount = parseDanishAmount(typeof rawAmount === 'number' ? rawAmount : values.estimated_value || '')
    if (values.estimated_value && amount === undefined) addIssue(sourceRow, 'estimated_value', 'Beløbet kunne ikke læses.')
    if (!values.customer_name) addIssue(sourceRow, 'customer_name', 'Virksomhedsnavnet mangler.')
    if (!address) addIssue(sourceRow, 'address', 'Adressen mangler; kontrollér sagens placering.')
    if (!center) addIssue(sourceRow, 'postal_code', postal.conflict
      ? 'Adresse og postnummerkolonne er uenige. Sagen er ikke placeret.'
      : 'Postnummeret mangler eller har intet kendt geografisk centrum. Sagen er ikke placeret.', 'fejl')
    for (const field of ['created_bc', 'report_sent', 'completed', 'invoiced', 'closed'] as const) {
      const value = normalized(values[field] || '')
      const allowed = field === 'closed' ? ['ja', 'nej', 'lukket'] : field === 'completed' ? ['ja', 'nej', 'delvist'] : ['ja', 'nej']
      if (value && !allowed.includes(value)) addIssue(sourceRow, field, `Ukendt værdi i "${COLUMN_MAPPING[field]}"; ikke brugt i status.`)
    }
    const progress = statusFrom(values)
    cases.push({
      id: `excel-row-${sourceRow}`, source_row: sourceRow,
      case_number: values.case_number || undefined,
      customer_name: values.customer_name || undefined,
      address_raw: address, address_normalized: address,
      advisor: values.advisor || undefined, department: values.department || undefined,
      postal_code: postal.code, city: center?.name,
      latitude: center?.latitude, longitude: center?.longitude,
      geocode_status: center ? 'delvis' : 'fejlet',
      status: progress.status, status_basis: progress.basis,
      estimated_value_dkk: amount, product_type: values.product_type || undefined,
      created_date: values.created_date || undefined,
      invoiced: normalized(values.invoiced || '') === 'ja' ? true : normalized(values.invoiced || '') === 'nej' ? false : undefined,
    })
  })
  if (!cases.length) throw new Error('Fanen Opgaver indeholder ingen sager.')
  const resolved = cases.filter(c => c.latitude !== undefined && c.longitude !== undefined).length
  return {
    meta: {
      fetched_at: new Date().toISOString(), data_source: 'local',
      total_rows: cases.length, resolved_count: resolved, unresolved_count: cases.length - resolved,
      error_count: issues.filter(i => i.severity === 'fejl').length,
      warning_count: issues.filter(i => i.severity === 'advarsel').length,
      template_rows_skipped: templateRows,
    },
    cases, issues,
  }
}

export async function importWorkbook(buffer: ArrayBuffer): Promise<ApiResponse> {
  if (buffer.byteLength > MAX_WORKBOOK_BYTES) throw new Error('Filen må højst fylde 10 MB.')
  if (!buffer.byteLength) throw new Error('Filen er tom.')
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(buffer)
  } catch {
    throw new Error('Excel-filen kunne ikke åbnes. Vælg en gyldig, ikke-krypteret .xlsx-fil.')
  }
  const sheet = workbook.getWorksheet('Opgaver')
  if (!sheet) throw new Error('Filen mangler fanen "Opgaver". Vælg Salgsliste-arket.')
  return parseWorksheet(sheet)
}
