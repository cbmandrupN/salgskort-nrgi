import type { ApiResponse } from '../types/cases'

export async function readWorkbookFile(file: File): Promise<ApiResponse> {
  if (!file.name.toLowerCase().endsWith('.xlsx')) throw new Error('Vælg en Excel-fil i .xlsx-format.')
  if (file.size > 10 * 1024 * 1024) throw new Error('Filen må højst fylde 10 MB.')
  const { importWorkbook } = await import('./workbook')
  return importWorkbook(await file.arrayBuffer())
}
