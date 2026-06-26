import { describe, it, expect } from 'vitest'
import { createContextMenu, type ContextMenuItem } from '@/editor/lib/context-menu'

describe('context menu controller', () => {
  it('opens at the cursor with items (suppressing the native menu) and closes', () => {
    const menu = createContextMenu()
    expect(menu.open).toBe(false)

    let prevented = false
    const event = {
      clientX: 120,
      clientY: 60,
      preventDefault: () => {
        prevented = true
      },
    } as unknown as MouseEvent
    const items: ContextMenuItem[] = [{ label: 'Delete', danger: true, onClick: () => {} }]

    menu.openAt(event, items)
    expect(prevented).toBe(true)
    expect(menu.open).toBe(true)
    expect(menu.x).toBe(120)
    expect(menu.y).toBe(60)
    expect(menu.items).toEqual(items)

    menu.close()
    expect(menu.open).toBe(false)
  })
})
