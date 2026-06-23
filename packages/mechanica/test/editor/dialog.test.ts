import { describe, it, expect } from 'vitest'
import { defineComponent, h } from 'vue'
import { createDialogStore } from '@/editor/ui/dialog'

const A = defineComponent({ render: () => h('div', 'A') })
const B = defineComponent({ render: () => h('div', 'B') })

describe('dialog store', () => {
  it('opens, stacks, steps back and closes', () => {
    const store = createDialogStore()
    expect(store.stack).toHaveLength(0)

    store.open(A, { x: 1 })
    expect(store.stack).toHaveLength(1)
    expect(store.stack[0]).toEqual({ component: A, props: { x: 1 } })

    store.open(B)
    expect(store.stack).toHaveLength(2)

    store.back()
    expect(store.stack).toHaveLength(1)
    expect(store.stack[0]!.component).toBe(A)

    store.open(B)
    store.close()
    expect(store.stack).toHaveLength(0)
  })
})
