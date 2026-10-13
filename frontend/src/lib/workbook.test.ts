import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { COLUMN_MAPPING, importWorkbook, MAX_WORKBOOK_BYTES, normalizePostalCode, parseDanishAmount, parseWorksheet } from './workbook'

function fixture() {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Opgaver')
  sheet.addRow(Object.values(COLUMN_MAPPING))
  return { workbook, sheet }
}
const row = (overrides: Partial<Record<keyof typeof COLUMN_MAPPING, ExcelJS.CellValue>> = {}) =>
  Object.keys(COLUMN_MAPPING).map(key => ({
    department: 'Testafdeling', customer_name: 'Fiktiv virksomhed', address: 'Testvej 2, 8000 Aarhus C',
    postal_code: 8000, advisor: 'Testrådgiver', estimated_value: 12000, created_bc: 'Ja',
    ...overrides,
  }[key]))

describe('Opgaver mapping', () => {
  it('maps exact headers, retains all cases and explicitly counts template rows', () => {
    const { sheet } = fixture()
    sheet.addRow(row({ case_number: 'S001', completed: ' Ja ', invoiced: 'Nej' }))
    sheet.addRow(row({ address: '', postal_code: '', customer_name: 'Adresse mangler' }))
    sheet.addRow(Object.keys(COLUMN_MAPPING).map(k => k === 'sales_month' ? '1900-01' : null))
    const data = parseWorksheet(sheet)
    expect(data.cases).toHaveLength(2)
    expect(data.meta.template_rows_skipped).toBe(1)
    expect(data.meta.resolved_count).toBe(1)
    expect(data.meta.unresolved_count).toBe(1)
    expect(data.cases[0]).toMatchObject({
      case_number: 'S001', estimated_value_dkk: 12000, status: 'fuldfoert',
      invoiced: false, postal_code: '8000', geocode_status: 'delvis', source_row: 2,
    })
    expect(data.issues.some(i => i.row_number === 3 && i.severity === 'fejl')).toBe(true)
  })

  it('never collapses duplicate project numbers or imports contact fields', () => {
    const { sheet } = fixture()
    sheet.getRow(1).getCell(20).value = 'Mail'
    sheet.addRow(row({ case_number: 'S001' })).getCell(20).value = 'private@example.test'
    sheet.addRow(row({ case_number: 'S001' }))
    const data = parseWorksheet(sheet)
    expect(new Set(data.cases.map(c => c.id)).size).toBe(2)
    expect(JSON.stringify(data)).not.toContain('private@example.test')
  })

  it('flags conflicting postcodes rather than claiming a location', () => {
    const { sheet } = fixture()
    sheet.addRow(row({ postal_code: 9000, closed: 'Liste' }))
    const data = parseWorksheet(sheet)
    expect(data.cases[0].latitude).toBeUndefined()
    expect(data.issues.some(i => i.field === 'closed')).toBe(true)
    expect(data.issues.some(i => i.message.includes('uenige'))).toBe(true)
  })

  it('does not substitute another worksheet or guess missing columns', async () => {
    const workbook = new ExcelJS.Workbook()
    workbook.addWorksheet('Pivot')
    await expect(importWorkbook(await workbook.xlsx.writeBuffer())).rejects.toThrow('Opgaver')
    const { sheet } = fixture()
    sheet.getRow(1).getCell(4).value = 'Wrong column'
    expect(() => parseWorksheet(sheet)).toThrow('Virksomhed')
  })

  it('loads a real XLSX buffer with cached formula values and zero amounts', async () => {
    const { workbook, sheet } = fixture()
    sheet.addRow(row({ estimated_value: 0, completed: { formula: '"Ja"', result: 'Ja' } }))
    const data = await importWorkbook(await workbook.xlsx.writeBuffer())
    expect(data.cases[0].status).toBe('fuldfoert')
    expect(data.cases[0].estimated_value_dkk).toBe(0)
  })

  it('rejects empty, corrupt, too large and case-free files', async () => {
    await expect(importWorkbook(new ArrayBuffer(0))).rejects.toThrow('tom')
    await expect(importWorkbook(new Uint8Array([1, 2, 3]).buffer)).rejects.toThrow('kunne ikke åbnes')
    await expect(importWorkbook(new ArrayBuffer(MAX_WORKBOOK_BYTES + 1))).rejects.toThrow('10 MB')
    const { sheet } = fixture()
    expect(() => parseWorksheet(sheet)).toThrow('ingen sager')
  })

  it('uses Salgsdato ahead of cached months and falls back only to a month with a year', () => {
    const { sheet } = fixture()
    sheet.addRow(row({ created_date: new Date('2026-01-31T00:00:00Z'), sales_month: '2025-12' }))
    sheet.addRow(row({ created_date: '1/2/2026', sales_month: { formula: 'TEXT(B3,"yyyy-mm")' } }))
    sheet.addRow(row({ sales_month: { formula: '"2025-11"', result: '2025-11' } }))
    sheet.addRow(row({ created_date: '31/02/2026', sales_month: '2026-02' }))
    sheet.addRow(row({ sales_month: 'januar' }))
    const data = parseWorksheet(sheet)
    expect(data.cases.map(c => c.sales_month)).toEqual(['2026-01', '2026-02', '2025-11', '2026-02', undefined])
    expect(data.issues.some(i => i.row_number === 5 && i.field === 'created_date')).toBe(true)
    expect(data.issues.some(i => i.row_number === 6 && i.field === 'sales_month')).toBe(true)
    expect(data.issues.some(i => i.row_number === 3 && i.field === 'sales_month')).toBe(false)
  })

  it('reads raw serial dates in both workbook epochs', () => {
    const { workbook, sheet } = fixture()
    sheet.addRow(row({ created_date: 46025 }))
    expect(parseWorksheet(sheet).cases[0].sales_month).toBe('2026-01')
    workbook.properties.date1904 = true
    sheet.getRow(2).getCell(2).value = 44563
    expect(parseWorksheet(sheet).cases[0].sales_month).toBe('2026-01')
  })

  it('keeps the completed column independent of closed status, treating blank and partial as not marked complete', () => {
    const { sheet } = fixture()
    for (const completed of [' Ja ', 'Nej', 'Delvist', '', 'Ukendt', { formula: '"Ja"' }]) {
      sheet.addRow(row({ completed, closed: 'Ja' }))
    }
    const data = parseWorksheet(sheet)
    expect(data.cases.every(c => c.status === 'lukket')).toBe(true)
    expect(data.cases.map(c => c.completed)).toEqual([true, false, false, false, undefined, undefined])
    expect(data.issues.some(i => i.row_number === 6 && i.field === 'completed')).toBe(true)
    expect(data.issues.some(i => i.row_number === 7 && i.field === 'completed' && i.severity === 'fejl')).toBe(true)
    sheet.getRow(1).getCell(Object.keys(COLUMN_MAPPING).indexOf('completed') + 1).value = 'Fjernet'
    expect(parseWorksheet(sheet).cases.every(c => c.completed === undefined)).toBe(true)
  })

  it('reads the new Status column ahead of Fuldført and derives completion from Afsluttet', () => {
    const { sheet } = fixture()
    for (const work_status of ['Afsluttet', 'Igang ', 'i gang', 'Nej ', '', 'Måske']) {
      sheet.addRow(row({ work_status, completed: 'Ja', created_bc: '' }))
    }
    const data = parseWorksheet(sheet)
    expect(data.cases.map(c => c.sheet_status)).toEqual(['afsluttet', 'igang', 'igang', 'nej', 'afsluttet', undefined])
    expect(data.cases.map(c => c.completed)).toEqual([true, false, false, false, true, undefined])
    expect(data.cases.map(c => c.status)).toEqual(['fuldfoert', 'fuldfoert', 'fuldfoert', 'fuldfoert', 'fuldfoert', 'fuldfoert'])
    expect(data.issues.some(i => i.row_number === 7 && i.field === 'work_status')).toBe(true)
  })

  it('maps legacy Fuldført to Status when the Status column is absent', () => {
    const { sheet } = fixture()
    sheet.getRow(1).getCell(Object.keys(COLUMN_MAPPING).indexOf('work_status') + 1).value = 'Fjernet'
    for (const completed of ['Ja', 'Delvist', 'Nej', '']) sheet.addRow(row({ completed }))
    expect(parseWorksheet(sheet).cases.map(c => c.sheet_status)).toEqual(['afsluttet', 'igang', 'nej', undefined])
  })

  it('derives Besigtiget from Besigtigelsesdato and reports unreadable values', () => {
    const { sheet } = fixture()
    for (const inspection_date of [new Date('2026-03-04T00:00:00Z'), '5.3.2026', '', '-', 'ingen påkrævet', 'snart']) {
      sheet.addRow(row({ inspection_date }))
    }
    const data = parseWorksheet(sheet)
    expect(data.cases.map(c => [c.inspection, c.inspection_date])).toEqual([
      ['ja', '2026-03-04'], ['ja', '2026-03-05'], ['nej', undefined], ['nej', undefined],
      ['ikke_paakraevet', undefined], [undefined, undefined],
    ])
    expect(data.issues.some(i => i.row_number === 7 && i.field === 'inspection_date')).toBe(true)
    sheet.getRow(1).getCell(Object.keys(COLUMN_MAPPING).indexOf('inspection_date') + 1).value = 'Fjernet'
    expect(parseWorksheet(sheet).cases.every(c => c.inspection === undefined)).toBe(true)
  })

  it('accepts the renamed CHAT/CHPI headers and older short headers', () => {
    const { sheet } = fixture()
    const closedColumn = Object.keys(COLUMN_MAPPING).indexOf('closed') + 1
    const invoicedColumn = Object.keys(COLUMN_MAPPING).indexOf('invoiced') + 1
    sheet.getRow(1).getCell(closedColumn).value = 'Lukket i BC\n(CHAT/CHPI)'
    sheet.addRow(row({ closed: 'Lukket', invoiced: 'Ja ', report_sent: 'Igang' }))
    let data = parseWorksheet(sheet)
    expect(data.cases[0]).toMatchObject({ status: 'lukket', invoiced: true })
    expect(data.issues.some(i => i.field === 'report_sent')).toBe(false)
    sheet.getRow(1).getCell(closedColumn).value = 'Lukket i BC'
    sheet.getRow(1).getCell(invoicedColumn).value = 'Faktureret'
    data = parseWorksheet(sheet)
    expect(data.cases[0]).toMatchObject({ status: 'lukket', invoiced: true })
  })
})

it('normalizes Danish postcodes and numbers without multiplying numeric Excel values', () => {
  expect(normalizePostalCode('', 'Testvej 2, DK 7182 Bredsten')).toEqual({ code: '7182', conflict: false })
  expect(parseDanishAmount(12000.5)).toBe(12000.5)
  expect(parseDanishAmount('12.000,50 kr.')).toBe(12000.5)
  expect(parseDanishAmount('12.000')).toBe(12000)
  expect(parseDanishAmount('ukendt')).toBeUndefined()
})
