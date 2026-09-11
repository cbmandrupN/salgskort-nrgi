import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ApiResponse } from '../types/cases'
import { loadSavedImport, removeSavedImport, saveImport } from './saved-import'

const data: ApiResponse = {
  meta: { fetched_at: '2026-09-11T10:00:00Z', data_source: 'local', total_rows: 1,
    resolved_count: 0, unresolved_count: 1, error_count: 0, warning_count: 1 },
  cases: [{ id: 'row-2', customer_name: 'Fiktiv A', address_raw: '', geocode_status: 'fejlet', source_row: 2 }],
  issues: [{ row_number: 2, severity: 'advarsel', message: 'Adresse mangler' }],
}

beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()))
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('starts empty, restores the complete snapshot and replaces the same filename', async () => {
  expect(await loadSavedImport()).toBeNull()
  await saveImport('Salgsliste.xlsx', data)
  expect(await loadSavedImport()).toEqual({ version: 1, fileName: 'Salgsliste.xlsx', data })
  const updated = { ...data, cases: [{ ...data.cases[0], customer_name: 'Fiktiv B' }] }
  await saveImport('Salgsliste.xlsx', updated)
  expect((await loadSavedImport())?.data).toEqual(updated)
})

it('removes the saved copy, including when already empty', async () => {
  await saveImport('Salgsliste.xlsx', data)
  await removeSavedImport()
  expect(await loadSavedImport()).toBeNull()
  await removeSavedImport()
})

it('never persists demo data or invalid timestamps over the previous copy', async () => {
  await saveImport('Salgsliste.xlsx', data)
  for (const meta of [{ ...data.meta, data_source: 'demo' }, { ...data.meta, fetched_at: 'invalid' }]) {
    await expect(saveImport('wrong.xlsx', { ...data, meta })).rejects.toThrow('gyldig')
  }
  expect((await loadSavedImport())?.data).toEqual(data)
})

it('reports denied storage explicitly', async () => {
  vi.stubGlobal('indexedDB', undefined)
  await expect(loadSavedImport()).rejects.toThrow('lokal lagring')
  await expect(saveImport('Salgsliste.xlsx', data)).rejects.toThrow('lokal lagring')
  await expect(removeSavedImport()).rejects.toThrow('lokal lagring')
})

it('does not replace the previous copy when a write aborts after request success', async () => {
  await saveImport('Salgsliste.xlsx', data)
  const original = IDBObjectStore.prototype.put
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
    const request = original.apply(this, args)
    request.onsuccess = () => this.transaction.abort()
    return request
  })
  await expect(saveImport('new.xlsx', data)).rejects.toThrow('afbrudt')
  expect((await loadSavedImport())?.fileName).toBe('Salgsliste.xlsx')
})

it('reports corrupted saved data rather than treating it as an empty database', async () => {
  await saveImport('Salgsliste.xlsx', data)
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('salgskort-nrgi-imports', 1)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction('imports', 'readwrite')
    transaction.objectStore('imports').put({ version: 99 }, 'latest')
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  database.close()
  await expect(loadSavedImport()).rejects.toThrow('beskadiget')
  await removeSavedImport()
  expect(await loadSavedImport()).toBeNull()
})
