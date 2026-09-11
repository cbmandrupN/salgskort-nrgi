import type { ApiResponse, Case, RowIssue } from '../types/cases'

const DATABASE = 'salgskort-nrgi-imports'
const STORE = 'imports'
const KEY = 'latest'

interface SavedImport {
  version: 1
  fileName: string
  data: ApiResponse
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function validCase(value: unknown): value is Case {
  if (!record(value)) return false
  const strings = ['case_number', 'customer_name', 'address_normalized', 'advisor', 'department',
    'created_date', 'postal_code', 'city', 'product_type', 'status_basis']
  const numbers = ['estimated_value_dkk', 'latitude', 'longitude']
  return typeof value.id === 'string' && typeof value.address_raw === 'string' &&
    finite(value.source_row) &&
    strings.every(key => value[key] === undefined || typeof value[key] === 'string') &&
    numbers.every(key => value[key] === undefined || finite(value[key])) &&
    (value.invoiced === undefined || typeof value.invoiced === 'boolean') &&
    (value.status === undefined || (typeof value.status === 'string' &&
      ['ny', 'i_gang', 'tilbud_sendt', 'vundet', 'tabt', 'afventer',
        'delvist_faerdig', 'rapport_sendt', 'fuldfoert', 'lukket'].includes(value.status))) &&
    typeof value.geocode_status === 'string' && ['ok', 'delvis', 'fejlet', 'afventer'].includes(value.geocode_status)
}

function validIssue(value: unknown): value is RowIssue {
  return record(value) && finite(value.row_number) &&
    (value.severity === 'fejl' || value.severity === 'advarsel') &&
    typeof value.message === 'string' && (value.field === undefined || typeof value.field === 'string')
}

export function isSavedImport(value: unknown): value is SavedImport {
  if (!record(value) || value.version !== 1 || typeof value.fileName !== 'string' ||
    !record(value.data) || !record(value.data.meta)) return false
  const { meta, cases, issues } = value.data
  return meta.data_source === 'local' && typeof meta.fetched_at === 'string' &&
    Number.isFinite(Date.parse(meta.fetched_at)) &&
    ['total_rows', 'resolved_count', 'unresolved_count', 'error_count', 'warning_count']
      .every(key => finite(meta[key])) &&
    (meta.template_rows_skipped === undefined || finite(meta.template_rows_skipped)) &&
    Array.isArray(cases) && cases.every(validCase) &&
    Array.isArray(issues) && issues.every(validIssue)
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('Browseren tillader ikke lokal lagring.'))
      return
    }
    const request = indexedDB.open(DATABASE, 1)
    let blocked = false
    request.onupgradeneeded = () => { request.result.createObjectStore(STORE) }
    request.onerror = () => reject(request.error)
    request.onblocked = () => {
      blocked = true
      reject(new Error('Lokal lagring er blokeret. Luk andre faner med Salgskort og prøv igen.'))
    }
    request.onsuccess = () => {
      if (blocked) request.result.close()
      else resolve(request.result)
    }
  })
}

async function transact<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE, mode)
      const request = operation(transaction.objectStore(STORE))
      // A successful request is not a committed write: wait for the transaction.
      transaction.oncomplete = () => resolve(request.result)
      transaction.onabort = () => reject(transaction.error ?? request.error ?? new Error('Lokal lagring blev afbrudt.'))
      transaction.onerror = () => reject(transaction.error ?? request.error)
    })
  } finally {
    database.close()
  }
}

export async function loadSavedImport(): Promise<SavedImport | null> {
  const saved = await transact('readonly', store => store.get(KEY))
  if (saved === undefined) return null
  if (!isSavedImport(saved)) throw new Error('Den gemte kopi har et ukendt eller beskadiget format.')
  return saved
}

export async function saveImport(fileName: string, data: ApiResponse): Promise<void> {
  const saved = { version: 1, fileName, data }
  if (!isSavedImport(saved)) throw new Error('Kun en gyldig lokal Excel-import kan gemmes.')
  await transact('readwrite', store => store.put(saved, KEY))
}

export async function removeSavedImport(): Promise<void> {
  await transact('readwrite', store => store.delete(KEY))
}
