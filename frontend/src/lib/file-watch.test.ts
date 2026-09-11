import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiResponse } from '../types/cases'
import { POLL_INTERVAL_MS, readWorkbookFile, WorkbookWatch } from './file-watch'

const data: ApiResponse = {
  meta: { fetched_at: '2026-09-11T10:00:00Z', data_source: 'local', total_rows: 1, resolved_count: 0, unresolved_count: 1, error_count: 0, warning_count: 0 },
  cases: [{ id: '1', source_row: 2, address_raw: '', geocode_status: 'fejlet' }], issues: [],
}
const file = (lastModified = 1, content = 'test') => new File([content], 'Salgsliste.xlsx', { lastModified })
function fixture() {
  const handle = { getFile: vi.fn().mockResolvedValue(file()) }
  const handlers = { onData: vi.fn(), onState: vi.fn() }
  const parse = vi.fn().mockResolvedValue(data)
  const watch = new WorkbookWatch(handle, handlers, parse)
  return { handle, handlers, parse, watch }
}
beforeEach(() => vi.useFakeTimers())
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })
const settle = () => vi.advanceTimersByTimeAsync(0)

describe('automatic read-only workbook watching', () => {
  it('reads immediately, skips unchanged files, imports changes at 60 seconds', async () => {
    const { watch, parse, handle, handlers } = fixture()
    watch.start()
    await settle()
    expect(parse).toHaveBeenCalledTimes(1)
    expect(handlers.onData).toHaveBeenLastCalledWith(data, expect.any(File), true)
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    expect(parse).toHaveBeenCalledTimes(1)
    handle.getFile.mockResolvedValue(file(2))
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS - 1)
    expect(parse).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(parse).toHaveBeenCalledTimes(2)
    expect(handlers.onData).toHaveBeenLastCalledWith(data, expect.any(File), false)
    expect(handlers.onState).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'watching', modifiedAt: 2 }))
    watch.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('detects changed size even when the timestamp is unchanged', async () => {
    const { watch, handle, parse } = fixture()
    watch.start(); await settle()
    handle.getFile.mockResolvedValue(file(1, 'changed-size'))
    watch.refresh(); await settle()
    expect(parse).toHaveBeenCalledTimes(2)
    watch.dispose()
  })

  it('keeps the previous data on parse failure and retries the same changed version', async () => {
    const { watch, handle, parse, handlers } = fixture()
    watch.start(); await settle()
    handle.getFile.mockResolvedValue(file(2))
    parse.mockRejectedValueOnce(new Error('Excel-filen kunne ikke åbnes.'))
    watch.refresh(); await settle()
    expect(handlers.onData).toHaveBeenCalledTimes(1)
    expect(handlers.onState).toHaveBeenLastCalledWith(expect.objectContaining({
      phase: 'error', modifiedAt: 1, message: 'Excel-filen kunne ikke åbnes.',
    }))
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    expect(handlers.onData).toHaveBeenCalledTimes(2)
    expect(handlers.onState).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'watching', modifiedAt: 2 }))
    watch.dispose()
  })

  it.each(['NotAllowedError', 'NotFoundError', 'NotReadableError'])('reports %s without clearing the prior data', async name => {
    const { watch, handle, handlers } = fixture()
    watch.start(); await settle()
    handle.getFile.mockRejectedValue(new DOMException('unavailable', name))
    watch.refresh(); await settle()
    expect(handlers.onData).toHaveBeenCalledTimes(1)
    expect(handlers.onState).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'error', modifiedAt: 1, message: expect.any(String) }))
    watch.dispose()
  })

  it('rejects a file changed during parsing and retries instead of accepting partial data', async () => {
    const { watch, handle, handlers, parse } = fixture()
    handle.getFile.mockResolvedValueOnce(file(1)).mockResolvedValue(file(2))
    watch.start(); await settle()
    expect(handlers.onData).not.toHaveBeenCalled()
    expect(handlers.onState).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'error', message: expect.stringContaining('ændrede sig') }))
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    expect(parse).toHaveBeenCalledTimes(2)
    expect(handlers.onData).toHaveBeenCalledTimes(1)
    watch.dispose()
  })

  it('pauses and resumes with immediate reread, keeping only one poll timer', async () => {
    const { watch, handle, parse, handlers } = fixture()
    watch.start(); await settle()
    watch.pause()
    expect(handlers.onState).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'paused' }))
    handle.getFile.mockResolvedValue(file(2))
    watch.refresh()
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3)
    expect(parse).toHaveBeenCalledTimes(1)
    watch.start(); watch.start(); await settle()
    expect(parse).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(1)
    watch.dispose()
  })

  it('does not overlap parses or publish an old result after disconnection', async () => {
    const { watch, parse, handlers } = fixture()
    let finish!: (value: ApiResponse) => void
    parse.mockReturnValue(new Promise<ApiResponse>(resolve => { finish = resolve }))
    watch.start(); await settle()
    watch.refresh(); watch.refresh()
    expect(parse).toHaveBeenCalledTimes(1)
    watch.dispose()
    finish(data); await settle()
    expect(handlers.onData).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('discards in-flight results on pause and rechecks on resume', async () => {
    const { watch, parse, handlers } = fixture()
    let finish!: (value: ApiResponse) => void
    parse.mockReturnValueOnce(new Promise<ApiResponse>(resolve => { finish = resolve }))
    watch.start(); await settle()
    watch.pause()
    finish(data); await settle()
    expect(handlers.onData).not.toHaveBeenCalled()
    watch.start(); await settle()
    expect(handlers.onData).toHaveBeenCalledTimes(1)
    watch.dispose()
  })
})

it('validates the manual and automatic file inputs with the same reader', async () => {
  await expect(readWorkbookFile(new File(['x'], 'wrong.csv'))).rejects.toThrow('.xlsx')
  await expect(readWorkbookFile(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.xlsx'))).rejects.toThrow('10 MB')
})
