import { describe, it, expect } from 'vitest'
import { mergeData, exposeRuntime, pushStateUpdate, hasRuntime } from './bridge'

describe('mergeData', () => {
  it('updates values, adds new keys and drops removed ones', () => {
    const target: Record<string, unknown> = { header: { a: 1, b: 2 } }
    mergeData(target, { header: { a: 9, c: 3 } })
    expect(target.header).toEqual({ a: 9, c: 3 })
  })

  it('keeps object identity for reactivity', () => {
    const target: Record<string, unknown> = { header: { a: 1 } }
    const ref = target.header
    mergeData(target, { header: { a: 2 } })
    expect(target.header).toBe(ref)
  })
})

describe('bridge round-trip', () => {
  it('delivers an editor update to the exposed runtime', async () => {
    const received: { content?: unknown[]; data?: Record<string, unknown> } = {}
    const dispose = exposeRuntime({
      setContent: (content) => void (received.content = content),
      mergeData: (data) => void (received.data = data),
    })

    expect(hasRuntime()).toBe(true)
    pushStateUpdate({ content: [{ id: '1', blockId: 'x', data: {} }], data: { h: { a: 1 } } })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(received.content).toHaveLength(1)
    expect(received.data).toEqual({ h: { a: 1 } })

    dispose()
    expect(hasRuntime()).toBe(false)
  })

  it('ignores unrelated window messages', async () => {
    let called = false
    const dispose = exposeRuntime({
      setContent: () => void (called = true),
      mergeData: () => {},
    })
    window.postMessage({ type: 'something-else' }, '*')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(called).toBe(false)
    dispose()
  })
})
