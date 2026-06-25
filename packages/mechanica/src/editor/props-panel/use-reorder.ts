import { ref, type Ref } from 'vue'

/**
 * Pure: given each row's vertical position and the dragged row's current index,
 * return the index it should move to for a pointer at `y`. Moving up returns the
 * first row whose midpoint we've crossed above; moving down, the last crossed.
 */
export function reorderTarget(rects: { top: number; height: number }[], from: number, y: number): number {
  let target = from
  for (let i = 0; i < rects.length; i++) {
    if (i === from) continue
    const mid = rects[i]!.top + rects[i]!.height / 2
    if (i < from && y < mid) return i
    if (i > from && y > mid) target = i
  }
  return target
}

export interface Reorder {
  /** Index currently being dragged, or null. Bind to a row's `is-dragging`. */
  dragging: Ref<number | null>
  /** Begin a pointer-drag reorder from a grip's `@pointerdown`. */
  start(index: number, event: PointerEvent): void
}

/**
 * Wire pointer-drag reordering over a vertical list. `container` holds the row
 * elements (one per item, in order); `list` is the live array to splice. The
 * array reorders live as the pointer passes each row's midpoint.
 */
export function useReorder(container: () => HTMLElement | null, list: () => unknown[]): Reorder {
  const dragging = ref<number | null>(null)

  function start(index: number, event: PointerEvent): void {
    event.preventDefault()
    const host = container()
    const row = host?.children[index] as HTMLElement | undefined
    if (!host || !row) return

    const rect = row.getBoundingClientRect()
    const grabDy = event.clientY - rect.top

    // A floating clone that follows the cursor — the "lifted" element. The real
    // row stays in place as a faded placeholder marking where it will land.
    const ghost = row.cloneNode(true) as HTMLElement
    ghost.classList.add('mech-array__ghost')
    ghost.classList.remove('is-dragging')
    Object.assign(ghost.style, {
      position: 'fixed',
      left: `${rect.left}px`,
      top: `${event.clientY - grabDy}px`,
      width: `${rect.width}px`,
      margin: '0',
      pointerEvents: 'none',
    })
    document.body.appendChild(ghost)
    document.body.style.userSelect = 'none'

    let from = index
    dragging.value = from

    const onMove = (e: PointerEvent) => {
      ghost.style.top = `${e.clientY - grabDy}px`
      const el = container()
      if (!el) return
      const rects = [...el.children].map((r) => {
        const b = (r as HTMLElement).getBoundingClientRect()
        return { top: b.top, height: b.height }
      })
      const target = reorderTarget(rects, from, e.clientY)
      if (target !== from) {
        const arr = list()
        const [moved] = arr.splice(from, 1)
        arr.splice(target, 0, moved)
        from = target
        dragging.value = from
      }
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      ghost.remove()
      document.body.style.userSelect = ''
      dragging.value = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
  }

  return { dragging, start }
}
