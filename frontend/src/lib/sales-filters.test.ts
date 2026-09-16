import { expect, it } from 'vitest'
import type { Case } from '../types/cases'
import { caseCompleted, caseSalesMonth, matchesSalesFilters, salesDateMonth, salesMonthLabel, salesMonthOptions } from './sales-filters'

const row: Case = { id: '1', address_raw: '', source_row: 2, geocode_status: 'fejlet' }

it('reads exact dates without locale guessing and respects Excel date systems', () => {
  expect(salesDateMonth('2026-01-31')).toBe('2026-01')
  expect(salesDateMonth('1/2/2026')).toBe('2026-02')
  expect(salesDateMonth('31.12.2025')).toBe('2025-12')
  expect(salesDateMonth('46025')).toBe('2026-01')
  expect(salesDateMonth('44563', true)).toBe('2026-01')
  for (const invalid of ['', '31/02/2026', '2026-13-01', '2026-02-29', 'januar', '60', '99999999']) {
    expect(salesDateMonth(invalid)).toBeUndefined()
  }
})

it('derives legacy sales months without conflating different years', () => {
  expect(caseSalesMonth({ ...row, created_date: '2025-01-05' })).toBe('2025-01')
  expect(salesMonthOptions([
    { ...row, sales_month: '2026-01' }, { ...row, created_date: '2025-01-05' },
    { ...row, created_date: '2026-01-02' }, row,
  ])).toEqual(['2026-01', '2025-01'])
  expect(salesMonthLabel('2026-01')).toBe('januar 2026')
})

it('preserves exact completion even when closed status overrides it', () => {
  expect(caseCompleted({ ...row, status: 'lukket', completed: false })).toBe(false)
  expect(caseCompleted({ ...row, status: 'lukket', completed: true })).toBe(true)
  expect(caseCompleted({ ...row, status: 'lukket' })).toBeUndefined()
  expect(caseCompleted({ ...row, status: 'ny' })).toBeUndefined()
  expect(caseCompleted({ ...row, status: 'fuldfoert' })).toBe(true)
  expect(caseCompleted({ ...row, status: 'delvist_faerdig' })).toBe(false)
})

it('combines both filters and excludes unknown flags from Ja and Nej', () => {
  const c = { ...row, sales_month: '2026-02', completed: false }
  expect(matchesSalesFilters(c, '2026-02', 'no')).toBe(true)
  expect(matchesSalesFilters(c, '2026-01', 'no')).toBe(false)
  expect(matchesSalesFilters(c, '2026-02', 'yes')).toBe(false)
  expect(matchesSalesFilters(c, '', '')).toBe(true)
  expect(matchesSalesFilters(row, '__missing', '__missing')).toBe(true)
  expect(matchesSalesFilters(row, '', 'no')).toBe(false)
  expect(matchesSalesFilters(row, '', 'yes')).toBe(false)
})
