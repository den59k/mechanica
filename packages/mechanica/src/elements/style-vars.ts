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

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

/** Numbers pass as-is (unitless weight / line-height / ratio), strings verbatim. */
const numeric = (v: unknown): string | null =>
  typeof v === 'number' ? String(v) : str(v)

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

/** Named shadow presets (`shadow: 'md'`), resolved into the `--el-shadow` var. */
export const SHADOWS: Record<string, string> = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.06)',
  md: '0 4px 12px rgba(0, 0, 0, 0.08)',
  lg: '0 12px 32px rgba(0, 0, 0, 0.12)',
}

/** Frame layout + visual knobs that participate in breakpoint overrides. */
export const FRAME_VARS: Record<string, VarSpec> = {
  direction: { cssVar: '--el-dir', to: enumMap({ row: 'row', column: 'column' }) },
  gap: { cssVar: '--el-gap', to: px },
  align: { cssVar: '--el-align', to: alignValue },
  justify: { cssVar: '--el-justify', to: justifyValue },
  wrap: { cssVar: '--el-wrap', to: (v) => (v ? 'wrap' : 'nowrap') },
  padding: { cssVar: '--el-pad', to: padding },
  // Outer margin (same shorthand forms as padding; negatives allowed). On a
  // frame that also sets `maxWidth`, the horizontal part yields to the
  // centering `margin-inline: auto` (see elements.scss).
  margin: { cssVar: '--el-margin', to: padding },
  w: { cssVar: '--el-w', to: size },
  h: { cssVar: '--el-h', to: size },
  // Content width: cap the frame's own width and center it (the full-bleed
  // background + centered content-column section pattern, without a second box).
  maxWidth: { cssVar: '--el-maxw', to: px },
  grow: { cssVar: '--el-grow', to: (v) => (v ? '1' : '0') },
  // Visual style — variables too, so Fill/Radius/… take per-breakpoint overrides.
  background: { cssVar: '--el-bg', to: str },
  radius: { cssVar: '--el-radius', to: px },
  minHeight: { cssVar: '--el-minh', to: px },
  shadow: { cssVar: '--el-shadow', to: enumMap(SHADOWS) },
}

/** Size/grow knobs shared by leaf elements (text, image, button). */
export const SIZE_VARS: Record<string, VarSpec> = {
  w: FRAME_VARS.w!,
  h: FRAME_VARS.h!,
  grow: FRAME_VARS.grow!,
  margin: FRAME_VARS.margin!,
  align: { cssVar: '--el-self', to: alignValue },
  textAlign: { cssVar: '--el-text-align', to: enumMap({ left: 'left', center: 'center', right: 'right' }) },
}

/** Text knobs: size/grow plus typography, all breakpoint-capable. */
export const TEXT_VARS: Record<string, VarSpec> = {
  ...SIZE_VARS,
  size: { cssVar: '--el-fs', to: px },
  weight: { cssVar: '--el-fw', to: numeric },
  lineHeight: { cssVar: '--el-lh', to: numeric },
  color: { cssVar: '--el-color', to: str },
  maxWidth: FRAME_VARS.maxWidth!,
}

/** Image knobs: size/grow plus fit/ratio/radius, all breakpoint-capable. */
export const IMAGE_VARS: Record<string, VarSpec> = {
  ...SIZE_VARS,
  fit: { cssVar: '--el-fit', to: str },
  ratio: { cssVar: '--el-ratio', to: numeric },
  radius: FRAME_VARS.radius!,
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

// The 9 anchor points decompose into an independent horizontal + vertical edge
// (corners, the four edge-centres, and the middle). Edge-centres and the middle
// pull the element back over the anchor line with a translate. Exported so the
// composer shares one source of truth for anchor semantics (drag / labels).
export const ANCHOR_H: Record<string, 'left' | 'center' | 'right'> = {
  'top-left': 'left', left: 'left', 'bottom-left': 'left',
  top: 'center', center: 'center', bottom: 'center',
  'top-right': 'right', right: 'right', 'bottom-right': 'right',
}
export const ANCHOR_V: Record<string, 'top' | 'center' | 'bottom'> = {
  'top-left': 'top', top: 'top', 'top-right': 'top',
  left: 'center', center: 'center', right: 'center',
  'bottom-left': 'bottom', bottom: 'bottom', 'bottom-right': 'bottom',
}

/** Absolute placement (`$abs`) → position/inset/transform/z-index inline style. */
export function absStyle(abs: unknown): Style {
  if (!isObject(abs)) return {}
  const out: Style = { position: 'absolute' }
  const x = typeof abs.x === 'number' ? abs.x : 0
  const y = typeof abs.y === 'number' ? abs.y : 0
  const anchor = typeof abs.anchor === 'string' ? abs.anchor : 'top-left'
  const h = ANCHOR_H[anchor] ?? 'left'
  const v = ANCHOR_V[anchor] ?? 'top'

  if (h === 'left') out.left = `${x}px`
  else if (h === 'right') out.right = `${x}px`
  else out.left = '50%'

  if (v === 'top') out.top = `${y}px`
  else if (v === 'bottom') out.bottom = `${y}px`
  else out.top = '50%'

  // A centred axis pulls the element back by half its own size; the offset rides
  // in the translate. A non-centred axis contributes 0 on that side.
  if (h === 'center' || v === 'center') {
    const tx = h === 'center' ? `calc(-50% + ${x}px)` : '0'
    const ty = v === 'center' ? `calc(-50% + ${y}px)` : '0'
    out.transform = `translate(${tx}, ${ty})`
  }
  if (typeof abs.z === 'number') out.zIndex = String(abs.z)
  return out
}

/**
 * Placement knobs a *non-element* block carries when placed in a composed
 * template — margin + absolute `$abs`. Built-in elements read these inline; a
 * component (an arbitrary SFC whose root we can't style) is wrapped in a `.mxel`
 * div that carries this style instead (see `renderBlocks`).
 */
const PLACEMENT_VARS: Record<string, VarSpec> = { margin: FRAME_VARS.margin! }

/**
 * The placement style (responsive margin vars + `$abs` position) for a block, or
 * `null` when it carries none — so the renderer only wraps blocks that need it.
 * The `--el-margin*` vars pair with the `.mxel` rules in `elements.scss`.
 */
export function placementStyle(data: unknown): Style | null {
  if (!isObject(data)) return null
  const marginVars = responsiveVars(data, PLACEMENT_VARS)
  const abs = absStyle(data.$abs)
  const hasMargin = Object.keys(marginVars).length > 0
  const hasAbs = isObject(data.$abs)
  if (!hasMargin && !hasAbs) return null
  return compactStyle(marginVars, abs)
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
