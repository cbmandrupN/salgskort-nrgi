import type { Case, CaseStatus, SheetStatus } from '../types/cases'

export const isSalesMonth = (value: string) => /^(?:19|20|21)\d{2}-(?:0[1-9]|1[0-2])$/.test(value)
export const isSheetDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && sheetDate(value) === value

/** Reads an Excel serial, ISO or Danish day-first date as YYYY-MM-DD without locale guessing. */
export function sheetDate(value: string, date1904 = false): string | undefined {
  const text = value.trim()
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/)
  const danish = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (iso || danish) {
    const [year, month, day] = iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
      : [Number(danish![3]), Number(danish![2]), Number(danish![1])]
    const date = new Date(Date.UTC(year, month - 1, day))
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return
    const result = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return isSalesMonth(result.slice(0, 7)) ? result : undefined
  }
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const serial = Math.floor(Number(text))
    if ((!date1904 && serial < 61) || serial > 100000) return
    const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30)
    const result = new Date(epoch + serial * 86400000).toISOString().slice(0, 10)
    return isSalesMonth(result.slice(0, 7)) ? result : undefined
  }
}

export function salesDateMonth(value: string, date1904 = false): string | undefined {
  return sheetDate(value, date1904)?.slice(0, 7)
}

export function caseSalesMonth(c: Case): string | undefined {
  return c.sales_month || salesDateMonth(c.created_date || '')
}

export const sheetStatusLabels: Record<SheetStatus, string> = { nej: 'Nej', igang: 'I gang', afsluttet: 'Afsluttet' }
// Nej is deliberately not offered as a filter choice; those cases remain visible under Alle.
const SHEET_STATUS_ORDER: SheetStatus[] = ['igang', 'afsluttet']

export function caseSheetStatus(c: Case): SheetStatus | undefined {
  if (c.sheet_status) return c.sheet_status
  // Older imports only kept Fuldført: Ja equals Afsluttet; Nej/blank cannot be told apart from I gang.
  if (c.completed === true || (c.completed === undefined && c.status === 'fuldfoert')) return 'afsluttet'
  if (c.status === 'delvist_faerdig') return 'igang'
}

export type InspectionState = 'ja' | 'planlagt' | 'nej' | 'ikke_paakraevet'
export const inspectionLabels: Record<InspectionState, string> = {
  ja: 'Ja', planlagt: 'Planlagt', nej: 'Nej', ikke_paakraevet: 'Ikke påkrævet',
}
const INSPECTION_ORDER: InspectionState[] = ['ja', 'planlagt', 'nej', 'ikke_paakraevet']

export const todayIso = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

/** A future Besigtigelsesdato is a planned visit, evaluated against today rather than the import time. */
export function caseInspection(c: Case, today = todayIso()): InspectionState | undefined {
  if (c.inspection === 'ja' && c.inspection_date && c.inspection_date > today) return 'planlagt'
  return c.inspection
}

export const salesMonthLabel = (month: string) => new Intl.DateTimeFormat('da-DK', {
  month: 'long', year: 'numeric', timeZone: 'UTC',
}).format(new Date(`${month}-01T00:00:00Z`))

export function salesMonthOptions(cases: Case[]): string[] {
  return [...new Set(cases.flatMap(c => {
    const month = caseSalesMonth(c)
    return month ? [month] : []
  }))].sort().reverse()
}

export function sheetStatusOptions(cases: Case[]): SheetStatus[] {
  const present = new Set(cases.map(caseSheetStatus))
  return SHEET_STATUS_ORDER.filter(value => present.has(value))
}

export function inspectionOptions(cases: Case[], today = todayIso()): InspectionState[] {
  const present = new Set(cases.map(c => caseInspection(c, today)))
  return INSPECTION_ORDER.filter(value => present.has(value))
}

export interface SalesFilters { month: string; sheetStatus: string; inspection: string; today?: string }

export function matchesSalesFilters(c: Case, { month, sheetStatus, inspection, today }: SalesFilters): boolean {
  const sold = caseSalesMonth(c)
  const state = caseSheetStatus(c)
  const inspected = caseInspection(c, today)
  return (!month || (month === '__missing' ? !sold : sold === month)) &&
    (!sheetStatus || (sheetStatus === '__missing' ? state === undefined : state === sheetStatus)) &&
    (!inspection || (inspection === '__missing' ? inspected === undefined : inspected === inspection))
}

export const PROGRESS_ORDER: CaseStatus[] = ['ny', 'afventer', 'tilbud_sendt', 'i_gang', 'vundet',
  'rapport_sendt', 'delvist_faerdig', 'fuldfoert', 'lukket', 'tabt']

export type CaseSort = 'sale_desc' | 'sale_asc' | 'customer' | 'advisor' | 'postal'
export const caseSortLabels: Record<CaseSort, string> = {
  sale_desc: 'Nyeste salg først', sale_asc: 'Ældste salg først', customer: 'Virksomhed (A–Å)',
  advisor: 'Rådgiver (A–Å)', postal: 'Postnummer',
}

const collator = new Intl.Collator('da-DK', { sensitivity: 'base', numeric: true })

function compareText(a?: string, b?: string): number {
  const left = a?.trim(), right = b?.trim()
  if (!left || !right) return left ? -1 : right ? 1 : 0
  return collator.compare(left, right)
}

function saleKey(c: Case): string | undefined {
  const month = caseSalesMonth(c)
  return sheetDate(c.created_date || '') || (month ? `${month}-00` : undefined)
}

/** Missing values always sort last; ties fall back to company name and then Excel row. */
export function sortCases(cases: Case[], sort: CaseSort): Case[] {
  const primary = (a: Case, b: Case): number => {
    if (sort === 'advisor') return compareText(a.advisor, b.advisor)
    if (sort === 'postal') return compareText(a.postal_code, b.postal_code)
    if (sort === 'customer') return 0
    const left = saleKey(a), right = saleKey(b)
    if (!left || !right) return left ? -1 : right ? 1 : 0
    return sort === 'sale_desc' ? right.localeCompare(left) : left.localeCompare(right)
  }
  return [...cases].sort((a, b) => primary(a, b) || compareText(a.customer_name, b.customer_name) || a.source_row - b.source_row)
}
