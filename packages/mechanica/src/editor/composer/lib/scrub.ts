/**
 * Value for a drag-to-scrub gesture on a numeric field (Figma-style): drag the
 * field's label/icon left/right to change its value. `dx` is the pixel delta from
 * where the drag started, `coarse` (Shift held) scrubs in steps of 10. Pure.
 */
export function scrubValue(base: number, dx: number, coarse: boolean, min?: number): number {
  const next = base + Math.round(dx) * (coarse ? 10 : 1)
  return min != null ? Math.max(min, next) : next
}
