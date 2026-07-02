import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSaveQueue } from '@/editor/lib/save-queue'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

/** Flush microtasks so a resolved send settles the queue's status. */
const settle = () => Promise.resolve().then(() => Promise.resolve())

describe('createSaveQueue', () => {
  it('debounces pushes and reports saved on success', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const queue = createSaveQueue<number>({ send, delay: 500 })

    expect(queue.status).toBe('saved')
    queue.push(1)
    expect(queue.status).toBe('pending')
    queue.push(2)
    await vi.advanceTimersByTimeAsync(499)
    expect(send).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    await settle()
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(2)
    expect(queue.status).toBe('saved')
    expect(queue.hasUnsaved()).toBe(false)
  })

  it('keeps the failed snapshot and retries on demand', async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error('500')).mockResolvedValue(undefined)
    const queue = createSaveQueue<number>({ send, delay: 100 })

    queue.push(7)
    await vi.advanceTimersByTimeAsync(100)
    await settle()
    expect(queue.status).toBe('error')
    expect(queue.hasUnsaved()).toBe(true)

    queue.retry()
    await settle()
    expect(send).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenLastCalledWith(7)
    expect(queue.status).toBe('saved')
    expect(queue.hasUnsaved()).toBe(false)
  })

  it('re-sends a snapshot pushed while a save is in flight', async () => {
    let release!: () => void
    const first = new Promise<void>((resolve) => (release = resolve))
    const send = vi.fn().mockReturnValueOnce(first).mockResolvedValue(undefined)
    const queue = createSaveQueue<number>({ send, delay: 100 })

    queue.push(1)
    await vi.advanceTimersByTimeAsync(100)
    expect(queue.status).toBe('saving')

    // New edit while the request is in flight.
    queue.push(2)
    release()
    await settle()
    expect(queue.status).toBe('pending')

    await vi.advanceTimersByTimeAsync(100)
    await settle()
    expect(send).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenLastCalledWith(2)
    expect(queue.status).toBe('saved')
  })

  it('flushes on unload through the beacon and only nags when it fails', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const beacon = vi.fn().mockReturnValue(true)
    const queue = createSaveQueue<number>({ send, beacon, delay: 500 })

    // Nothing unsaved: leaving is safe, no beacon needed.
    expect(queue.flushOnUnload()).toBe(true)
    expect(beacon).not.toHaveBeenCalled()

    queue.push(3)
    expect(queue.flushOnUnload()).toBe(true)
    expect(beacon).toHaveBeenCalledWith(3)
    expect(queue.status).toBe('saved')
    // The debounced send was cancelled by the flush.
    await vi.advanceTimersByTimeAsync(1000)
    expect(send).not.toHaveBeenCalled()

    // A beacon that cannot queue means edits could be lost — caller must nag.
    beacon.mockReturnValue(false)
    queue.push(4)
    expect(queue.flushOnUnload()).toBe(false)
  })

  it('reports unsaved without a beacon so the caller can warn', () => {
    const queue = createSaveQueue<number>({ send: vi.fn().mockResolvedValue(undefined) })
    queue.push(1)
    expect(queue.flushOnUnload()).toBe(false)
    expect(queue.hasUnsaved()).toBe(true)
  })
})
