import ExcelJS from 'exceljs'
import { expect, it } from 'vitest'
import { readWorkbookFile } from './read-workbook-file'

it('rejects non-XLSX and oversized files before parsing', async () => {
  await expect(readWorkbookFile(new File(['x'], 'wrong.csv'))).rejects.toThrow('.xlsx')
  await expect(readWorkbookFile(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.xlsx'))).rejects.toThrow('10 MB')
})

it('reads the latest manually selected version, including the same filename', async () => {
  async function file(company: string) {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Opgaver')
    sheet.addRow(['Virksomhed', 'Adresse (Besigtiget)', 'Post nr.', 'Afdeling', 'Rådgiver'])
    sheet.addRow([company, 'Eksempelvej 1, 8000 Aarhus C', 8000, 'Bygninger Vest', 'Demo'])
    return new File([await workbook.xlsx.writeBuffer()], 'Salgsliste.xlsx')
  }
  const first = await readWorkbookFile(await file('Fiktiv version A'))
  const latest = await readWorkbookFile(await file('Fiktiv version B'))
  expect(first.cases[0].customer_name).toBe('Fiktiv version A')
  expect(latest.cases[0].customer_name).toBe('Fiktiv version B')
  expect(latest.meta.data_source).toBe('local')
})
