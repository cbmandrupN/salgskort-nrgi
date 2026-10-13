import { expect, it } from 'vitest'
import type { Case } from '../types/cases'
import { caseInspection, caseSalesMonth, caseSheetStatus, inspectionOptions, matchesSalesFilters, salesDateMonth,
  salesMonthLabel, salesMonthOptions, sheetDate, sheetStatusOptions, sortCases } from './sales-filters'

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
  expect(sheetDate('4.3.2026')).toBe('2026-03-04')
  expect(sheetDate('2026-03-04T00:00:00.000Z')).toBe('2026-03-04')
})

it('derives legacy sales months without conflating different years', () => {
  expect(caseSalesMonth({ ...row, created_date: '2025-01-05' })).toBe('2025-01')
  expect(salesMonthOptions([
    { ...row, sales_month: '2026-01' }, { ...row, created_date: '2025-01-05' },
    { ...row, created_date: '2026-01-02' }, row,
  ])).toEqual(['2026-01', '2025-01'])
  expect(salesMonthLabel('2026-01')).toBe('januar 2026')
})

it('maps Status, keeps legacy Fuldført compatible and never treats closed as Afsluttet', () => {
  expect(caseSheetStatus({ ...row, sheet_status: 'igang', completed: true })).toBe('igang')
  expect(caseSheetStatus({ ...row, status: 'lukket', completed: true })).toBe('afsluttet')
  expect(caseSheetStatus({ ...row, status: 'lukket', completed: false })).toBeUndefined()
  expect(caseSheetStatus({ ...row, status: 'lukket' })).toBeUndefined()
  expect(caseSheetStatus({ ...row, status: 'fuldfoert' })).toBe('afsluttet')
  expect(caseSheetStatus({ ...row, status: 'delvist_faerdig' })).toBe('igang')
  expect(sheetStatusOptions([{ ...row, sheet_status: 'afsluttet' }, row, { ...row, sheet_status: 'nej' }, { ...row, sheet_status: 'igang' }]))
    .toEqual(['igang', 'afsluttet'])
})

it('treats future inspection dates as planned relative to today', () => {
  const visited = { ...row, inspection: 'ja' as const, inspection_date: '2026-10-13' }
  expect(caseInspection(visited, '2026-10-13')).toBe('ja')
  expect(caseInspection(visited, '2026-10-12')).toBe('planlagt')
  expect(caseInspection(row)).toBeUndefined()
  expect(inspectionOptions([{ ...row, inspection: 'ikke_paakraevet' }, visited, { ...row, inspection: 'nej' }], '2026-10-01'))
    .toEqual(['planlagt', 'nej', 'ikke_paakraevet'])
})

it('combines month, status and inspection filters and keeps unknown values out of explicit options', () => {
  const c: Case = { ...row, sales_month: '2026-02', sheet_status: 'igang', inspection: 'nej' }
  const all = { month: '', sheetStatus: '', inspection: '' }
  expect(matchesSalesFilters(c, { ...all, month: '2026-02', sheetStatus: 'igang', inspection: 'nej' })).toBe(true)
  expect(matchesSalesFilters(c, { ...all, month: '2026-01' })).toBe(false)
  expect(matchesSalesFilters(c, { ...all, sheetStatus: 'afsluttet' })).toBe(false)
  expect(matchesSalesFilters(c, { ...all, inspection: 'ja' })).toBe(false)
  expect(matchesSalesFilters(c, all)).toBe(true)
  expect(matchesSalesFilters(row, { month: '__missing', sheetStatus: '__missing', inspection: '__missing' })).toBe(true)
  expect(matchesSalesFilters(row, { ...all, sheetStatus: 'nej' })).toBe(false)
  expect(matchesSalesFilters(row, { ...all, inspection: 'nej' })).toBe(false)
})

it('sorts cases predictably with missing values last and Danish alphabetical order', () => {
  const cases: Case[] = [
    { ...row, id: 'a', source_row: 5, customer_name: 'Ærø Energi', created_date: '2026-01-05', advisor: 'Øst', postal_code: '9000' },
    { ...row, id: 'b', source_row: 3, customer_name: 'aalborg varme', created_date: '2026-03-01', advisor: 'Anders', postal_code: '800' },
    { ...row, id: 'c', source_row: 4, customer_name: 'Bryggeriet', sales_month: '2026-03', postal_code: '2100' },
    { ...row, id: 'd', source_row: 2 },
  ]
  const ids = (sort: Parameters<typeof sortCases>[1]) => sortCases(cases, sort).map(c => c.id)
  expect(ids('sale_desc')).toEqual(['b', 'c', 'a', 'd'])
  expect(ids('sale_asc')).toEqual(['a', 'c', 'b', 'd'])
  expect(ids('customer')).toEqual(['c', 'a', 'b', 'd'])
  expect(ids('advisor')).toEqual(['b', 'a', 'c', 'd'])
  expect(ids('postal')).toEqual(['b', 'c', 'a', 'd'])
  expect(cases.map(c => c.id)).toEqual(['a', 'b', 'c', 'd'])
})
