/**
 * Map an element's `data` (layout config + `$bp` responsive overrides + `$abs`
 * absolute placement) to inline CSS custom properties and static style. Pure and
 * unit-tested. See PLAN.md § 4.3.
 *
 * The responsive trick: the element only ever sets *variables* inline
 * (`--el-dir`, `--el-dir-md`, …); the actual `flex-direction: var(--el-dir-…)`
 * declarations live in `elements.scss`, where media queries pick which variable
 * to read. Setting the property directly inline would beat any media query, so
 * responsive props MUST go through vars, never a direct inline property.
 */

/** Breakpoints, widest first — each narrower one overrides the wider fallback. */
export const BREAKPOINTS = ['md', 'sm'] as const
export type Breakpoint = (typeof BREAKPOINTS)[number]

type Style = Record<string, string>

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const px = (v: unknown): string | null =>
  typeof v === 'number' ? `${v}px` : typeof v === 'string' && v !== '' ? v : null

const size = (v: unknown): string | null =>
  v === 'hug' ? 'auto' : v === 'fill' ? '100%' : px(v)

const padding = (v: unknown): string | null => {
  if (Array.isArray(v)) {
    const parts = v.map((n) => (typeof n === 'number' ? `${n}px` : String(n)))
    return parts.length ? parts.join(' ') : null
  }
  return px(v)
}

const enumMap =
  (table: Record<string, string>) =>
  (v: unknown): string | null =>
    typeof v === 'string' && v in table ? table[v]! : null

const alignValue = enumMap({ start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' })
const justifyValue = enumMap({
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
  around: 'space-around',
  evenly: 'space-evenly',
})

/** A responsive-capable data key → CSS variable + value transform. */
interface VarSpec {
  cssVar: string
  to: (value: unknown) => string | null
}

/** Frame layout knobs that participate in breakpoint overrides. */
export const FRAME_VARS: Record<string, VarSpec> = {
  direction: { cssVar: '--el-dir', to: enumMap({ row: 'row', column: 'column' }) },
  gap: { cssVar: '--el-gap', to: px },
  align: { cssVar: '--el-align', to: alignValue },
  justify: { cssVar: '--el-justify', to: justifyValue },
  wrap: { cssVar: '--el-wrap', to: (v) => (v ? 'wrap' : 'nowrap') },
  padding: { cssVar: '--el-pad', to: padding },
  w: { cssVar: '--el-w', to: size },
  h: { cssVar: '--el-h', to: size },
  // Content width: cap the frame's own width and center it (the full-bleed
  // background + centered content-column section pattern, without a second box).
  maxWidth: { cssVar: '--el-maxw', to: px },
  grow: { cssVar: '--el-grow', to: (v) => (v ? '1' : '0') },
}

/** Size/grow knobs shared by leaf elements (text, image, button). */
export const SIZE_VARS: Record<string, VarSpec> = {
  w: FRAME_VARS.w!,
  h: FRAME_VARS.h!,
  grow: FRAME_VARS.grow!,
  align: { cssVar: '--el-self', to: alignValue },
  textAlign: { cssVar: '--el-text-align', to: enumMap({ left: 'left', center: 'center', right: 'right' }) },
}

/**
 * Build the inline CSS-variable style for an element: base values plus, for each
 * breakpoint present in `data.$bp`, the overriding `--<var>-<bp>` variables.
 */
export function responsiveVars(data: Record<string, unknown>, specs: Record<string, VarSpec>): Style {
  const out: Style = {}
  const apply = (source: Record<string, unknown>, suffix: string): void => {
    for (const [key, spec] of Object.entries(specs)) {
      if (!(key in source)) continue
      const value = spec.to(source[key])
      if (value != null) out[spec.cssVar + suffix] = value
    }
  }
  apply(data, '')
  const bp = data.$bp
  if (isObject(bp)) {
    for (const point of BREAKPOINTS) {
      const override = bp[point]
      if (isObject(override)) apply(override, `-${point}`)
    }
  }
  return out
}

/** Absolute placement (`$abs`) → position/inset/transform/z-index inline style. */
export function absStyle(abs: unknown): Style {
  if (!isObject(abs)) return {}
  const out: Style = { position: 'absolute' }
  const x = typeof abs.x === 'number' ? abs.x : 0
  const y = typeof abs.y === 'number' ? abs.y : 0
  const anchor = typeof abs.anchor === 'string' ? abs.anchor : 'top-left'
  const xUnit = `${x}px`
  const yUnit = `${y}px`

  switch (anchor) {
    case 'top-right':
      out.top = yUnit
      out.right = xUnit
      break
    case 'bottom-left':
      out.bottom = yUnit
      out.left = xUnit
      break
    case 'bottom-right':
      out.bottom = yUnit
      out.right = xUnit
      break
    case 'center':
      out.top = '50%'
      out.left = '50%'
      out.transform = `translate(calc(-50% + ${xUnit}), calc(-50% + ${yUnit}))`
      break
    case 'top-left':
    default:
      out.top = yUnit
      out.left = xUnit
      break
  }
  if (typeof abs.z === 'number') out.zIndex = String(abs.z)
  return out
}

/** Merge helper: drop null/undefined entries so callers can spread freely. */
export function compactStyle(...styles: (Style | undefined)[]): Style {
  const out: Style = {}
  for (const style of styles) {
    if (!style) continue
    for (const [key, value] of Object.entries(style)) {
      if (value != null && value !== '') out[key] = value
    }
  }
  return out
}
