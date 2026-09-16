import type { Case } from '../types/cases'

export const isSalesMonth = (value: string) => /^(?:19|20|21)\d{2}-(?:0[1-9]|1[0-2])$/.test(value)

export function salesDateMonth(value: string, date1904 = false): string | undefined {
  const text = value.trim()
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/)
  const danish = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (iso || danish) {
    const [year, month, day] = iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
      : [Number(danish![3]), Number(danish![2]), Number(danish![1])]
    const date = new Date(Date.UTC(year, month - 1, day))
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return
    const result = `${year}-${String(month).padStart(2, '0')}`
    return isSalesMonth(result) ? result : undefined
  }
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const serial = Math.floor(Number(text))
    if ((!date1904 && serial < 61) || serial > 100000) return
    const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30)
    const result = new Date(epoch + serial * 86400000).toISOString().slice(0, 7)
    return isSalesMonth(result) ? result : undefined
  }
}

export function caseSalesMonth(c: Case): string | undefined {
  return c.sales_month || salesDateMonth(c.created_date || '')
}

export function caseCompleted(c: Case): boolean | undefined {
  if (c.completed !== undefined) return c.completed
  // Old snapshots retained only the derived status; closed does not prove Fuldført=Ja.
  if (c.status === 'fuldfoert') return true
  if (c.status === 'delvist_faerdig') return false
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

export function matchesSalesFilters(c: Case, month: string, completed: string): boolean {
  const sold = caseSalesMonth(c)
  const done = caseCompleted(c)
  return (!month || (month === '__missing' ? !sold : sold === month)) &&
    (!completed || (completed === '__missing' ? done === undefined : done === (completed === 'yes')))
}
