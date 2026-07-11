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

/** One data key may emit several vars (`bgImage` → image url + focal position). */
export type VarSpecs = Record<string, VarSpec | VarSpec[]>

/** `hide: true` → `display: none`; an explicit `false` restores the kind's
 *  default display (how a base-hidden element un-hides at a breakpoint). */
const hideValue =
  (shown: string) =>
  (v: unknown): string | null =>
    v === true ? 'none' : v === false ? shown : null

// A CSS url() value from an image-field-shaped object ({ src, croppedSrc?, … }).
// Quotes + escapes so a hostile src can never break out of the declaration.
const bgUrl = (v: unknown): string | null => {
  if (typeof v !== 'object' || v === null) return null
  const img = v as Record<string, unknown>
  const src = typeof img.croppedSrc === 'string' && img.croppedSrc ? img.croppedSrc : img.src
  if (typeof src !== 'string' || !src) return null
  return `url("${src.replace(/[\\"]/g, '\\$&').replace(/\n/g, '')}")`
}

// The focal point of a background image → a background-position value.
const bgPosition = (v: unknown): string | null => {
  if (typeof v !== 'object' || v === null) return null
  const img = v as Record<string, unknown>
  if (typeof img.focalX !== 'number' && typeof img.focalY !== 'number') return null
  const pct = (n: unknown): string => `${Math.round((typeof n === 'number' ? n : 0.5) * 100)}%`
  return `${pct(img.focalX)} ${pct(img.focalY)}`
}

/** Named shadow presets (`shadow: 'md'`), resolved into the `--el-shadow` var. */
export const SHADOWS: Record<string, string> = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.06)',
  md: '0 4px 12px rgba(0, 0, 0, 0.08)',
  lg: '0 12px 32px rgba(0, 0, 0, 0.12)',
}

/** Frame layout + visual knobs that participate in breakpoint overrides. */
export const FRAME_VARS: VarSpecs = {
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
  grow: { cssVar: '--el-grow', to: (v) => (v ? '1' : '0') },
  // Size limits — min/max on each axis, independent of the Hug/Fill/Fixed mode.
  // maxWidth on a frame ALSO centers it (the full-bleed-bg + centered
  // content-column pattern — the `margin-inline: auto` rule in elements.scss).
  minWidth: { cssVar: '--el-minw', to: px },
  maxWidth: { cssVar: '--el-maxw', to: px },
  minHeight: { cssVar: '--el-minh', to: px },
  maxHeight: { cssVar: '--el-maxh', to: px },
  // Visual style — variables too, so Fill/Radius/… take per-breakpoint overrides.
  background: { cssVar: '--el-bg', to: str },
  // Background image fill: one data key (an image-field-shaped object) emits the
  // url + the focal-point position; `bgOverlay` is a color painted over the
  // image (a linear-gradient composed in the generated CSS — see emit-css.ts).
  bgImage: [
    { cssVar: '--el-bgimg', to: bgUrl },
    { cssVar: '--el-bgpos', to: bgPosition },
  ],
  bgOverlay: { cssVar: '--el-bgoverlay', to: str },
  radius: { cssVar: '--el-radius', to: px },
  shadow: { cssVar: '--el-shadow', to: enumMap(SHADOWS) },
  // Per-breakpoint visibility ("hide on mobile") — see hideValue above.
  hide: { cssVar: '--el-display', to: hideValue('flex') },
}

/** Size/grow knobs shared by leaf elements (text, image, button). */
export const SIZE_VARS: VarSpecs = {
  w: FRAME_VARS.w!,
  h: FRAME_VARS.h!,
  grow: FRAME_VARS.grow!,
  margin: FRAME_VARS.margin!,
  minWidth: FRAME_VARS.minWidth!,
  maxWidth: FRAME_VARS.maxWidth!,
  minHeight: FRAME_VARS.minHeight!,
  maxHeight: FRAME_VARS.maxHeight!,
  align: { cssVar: '--el-self', to: alignValue },
  textAlign: { cssVar: '--el-text-align', to: enumMap({ left: 'left', center: 'center', right: 'right' }) },
  hide: { cssVar: '--el-display', to: hideValue('block') },
}

/** Text knobs: size/grow/limits plus typography, all breakpoint-capable. */
export const TEXT_VARS: VarSpecs = {
  ...SIZE_VARS,
  size: { cssVar: '--el-fs', to: px },
  weight: { cssVar: '--el-fw', to: numeric },
  lineHeight: { cssVar: '--el-lh', to: numeric },
  color: { cssVar: '--el-color', to: str },
}

/** Image knobs: size/grow plus fit/ratio/radius, all breakpoint-capable. */
export const IMAGE_VARS: VarSpecs = {
  ...SIZE_VARS,
  fit: { cssVar: '--el-fit', to: str },
  ratio: { cssVar: '--el-ratio', to: numeric },
  radius: FRAME_VARS.radius!,
}

/**
 * Build the inline CSS-variable style for an element: base values plus, for each
 * breakpoint present in `data.$bp`, the overriding `--<var>-<bp>` variables.
 */
export function responsiveVars(data: Record<string, unknown>, specs: VarSpecs): Style {
  const out: Style = {}
  const apply = (source: Record<string, unknown>, suffix: string): void => {
    for (const [key, entry] of Object.entries(specs)) {
      if (!(key in source)) continue
      for (const spec of Array.isArray(entry) ? entry : [entry]) {
        const value = spec.to(source[key])
        if (value != null) out[spec.cssVar + suffix] = value
      }
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
const PLACEMENT_VARS: VarSpecs = {
  margin: FRAME_VARS.margin!,
  hide: { cssVar: '--el-display', to: hideValue('block') },
}

/**
 * The placement style (responsive margin/visibility vars + `$abs` position) for
 * a block, or `null` when it carries none — so the renderer only wraps blocks
 * that need it. The `--el-*` vars pair with the `.mxel` rules in `elements.scss`.
 */
export function placementStyle(data: unknown): Style | null {
  if (!isObject(data)) return null
  const vars = responsiveVars(data, PLACEMENT_VARS)
  const abs = absStyle(data.$abs)
  const hasVars = Object.keys(vars).length > 0
  const hasAbs = isObject(data.$abs)
  if (!hasVars && !hasAbs) return null
  return compactStyle(vars, abs)
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
