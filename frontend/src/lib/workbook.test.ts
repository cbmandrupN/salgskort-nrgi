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
})

it('normalizes Danish postcodes and numbers without multiplying numeric Excel values', () => {
  expect(normalizePostalCode('', 'Testvej 2, DK 7182 Bredsten')).toEqual({ code: '7182', conflict: false })
  expect(parseDanishAmount(12000.5)).toBe(12000.5)
  expect(parseDanishAmount('12.000,50 kr.')).toBe(12000.5)
  expect(parseDanishAmount('12.000')).toBe(12000)
  expect(parseDanishAmount('ukendt')).toBeUndefined()
})
