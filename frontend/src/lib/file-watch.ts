import type { ApiResponse } from '../types/cases'

export const POLL_INTERVAL_MS = 60_000
export interface ReadableFileHandle { getFile(): Promise<File> }
export interface FilePickerWindow extends Window {
  showOpenFilePicker?: (options: {
    multiple: boolean
    excludeAcceptAllOption: boolean
    types: { description: string; accept: Record<string, string[]> }[]
  }) => Promise<ReadableFileHandle[]>
}
export interface WatchState {
  phase: 'checking' | 'watching' | 'paused' | 'error'
  checkedAt?: number
  modifiedAt?: number
  message?: string
}
interface WatchHandlers {
  onData: (data: ApiResponse, file: File, first: boolean) => void
  onState: (state: WatchState) => void
}

export async function readWorkbookFile(file: File): Promise<ApiResponse> {
  if (!file.name.toLowerCase().endsWith('.xlsx')) throw new Error('Vælg en Excel-fil i .xlsx-format.')
  if (file.size > 10 * 1024 * 1024) throw new Error('Filen må højst fylde 10 MB.')
  const { importWorkbook } = await import('./workbook')
  return importWorkbook(await file.arrayBuffer())
}

function messageFor(error: unknown): string {
  if (error instanceof Error && ['NotAllowedError', 'SecurityError'].includes(error.name)) {
    return 'Adgangen til filen er bortfaldet. Tilslut filen igen og giv læseadgang.'
  }
  if (error instanceof Error && error.name === 'NotFoundError') {
    return 'Filen er flyttet, slettet eller erstattet. Tilslut den igen fra OneDrive-mappen.'
  }
  if (error instanceof Error && error.name === 'NotReadableError') {
    return 'Filen kunne ikke læses. Vent, til Excel eller OneDrive er færdig med at gemme.'
  }
  return error instanceof Error ? error.message : 'Filen kunne ikke kontrolleres.'
}

// Holds only a user-granted read handle and version metadata, never workbook bytes.
export class WorkbookWatch {
  private running = false
  private disposed = false
  private busy = false
  private generation = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private version: string | undefined
  private state: WatchState = { phase: 'checking' }

  constructor(
    private readonly handle: ReadableFileHandle,
    private readonly handlers: WatchHandlers,
    private readonly parse: (file: File) => Promise<ApiResponse> = readWorkbookFile,
  ) {}

  start() {
    if (this.disposed || this.running) return
    this.running = true
    void this.check()
  }

  pause() {
    if (this.disposed) return
    this.running = false
    this.generation++
    clearTimeout(this.timer)
    this.emit({ ...this.state, phase: 'paused' })
  }

  refresh() {
    if (this.running && !this.disposed) void this.check()
  }

  dispose() {
    this.disposed = true
    this.running = false
    this.generation++
    clearTimeout(this.timer)
  }

  private emit(state: WatchState) {
    this.state = state
    this.handlers.onState(state)
  }

  private async check() {
    if (!this.running || this.disposed || this.busy) return
    clearTimeout(this.timer)
    this.busy = true
    const generation = this.generation
    const active = () => !this.disposed && this.running && this.generation === generation
    this.emit({ ...this.state, phase: 'checking' })
    try {
      const file = await this.handle.getFile()
      if (!active()) return
      const version = `${file.lastModified}:${file.size}`
      if (version !== this.version) {
        const result = await this.parse(file)
        if (!active()) return
        const latest = await this.handle.getFile()
        if (!active()) return
        if (`${latest.lastModified}:${latest.size}` !== version) {
          throw new Error('Filen ændrede sig under indlæsning. Den læses igen ved næste kontrol.')
        }
        this.handlers.onData(result, file, this.version === undefined)
        this.version = version
      }
      if (active()) this.emit({ phase: 'watching', checkedAt: Date.now(), modifiedAt: file.lastModified })
    } catch (error) {
      if (active()) this.emit({ ...this.state, phase: 'error', message: messageFor(error) })
    } finally {
      this.busy = false
      if (this.running && !this.disposed) {
        this.timer = setTimeout(() => void this.check(), generation === this.generation ? POLL_INTERVAL_MS : 0)
      }
    }
  }
}
