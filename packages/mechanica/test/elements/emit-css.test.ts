import { describe, it, expect } from 'vitest'
import { emitElementsCss, ELEMENT_CSS_VAR_BASES } from '@/elements/emit-css'
import { FRAME_VARS, SIZE_VARS, TEXT_VARS, IMAGE_VARS } from '@/elements/style-vars'

describe('emitElementsCss', () => {
  const css = emitElementsCss({ md: 1024, sm: 640 })

  it('layers the yield floors so author classes can outrank them', () => {
    expect(css).toContain('@layer mechanica {')
    // A yield floor (font-size) sits inside the layer.
    const layer = css.slice(css.indexOf('@layer mechanica {'))
    expect(layer).toContain('font-size: var(--el-fs, revert);')
  })

  it('emits hard (structural) floors unlayered, with no knob rung', () => {
    // flex-direction is structural: a plain floor, and never a [style*] rung.
    expect(css).toContain('flex-direction: var(--el-dir, column);')
    expect(css).not.toContain("[style*='--el-dir:']")
  })

  it('emits an unlayered knob rung for each yield prop, matching only when set', () => {
    expect(css).toContain(".mxel-text[style*='--el-fs:'] { font-size: var(--el-fs); }")
    expect(css).toContain(".mxel[style*='--el-margin:'] { margin: var(--el-margin); }")
    // Breakpoint rungs use the suffixed var + a suffixed match.
    expect(css).toContain(".mxel-text[style*='--el-fs-md:'] { font-size: var(--el-fs-md); }")
    expect(css).toContain(".mxel-text[style*='--el-fs-sm:'] { font-size: var(--el-fs-sm); }")
  })

  it('caps the image max-width at 100% in both floor and rung', () => {
    expect(css).toContain('max-width: min(var(--el-maxw, 100%), 100%);')
    expect(css).toContain(".mxel-image[style*='--el-maxw:'] { max-width: min(var(--el-maxw), 100%); }")
  })

  it('uses the given breakpoint widths in the media queries', () => {
    expect(css).toContain('@media (max-width: 1024px) {')
    expect(css).toContain('@media (max-width: 640px) {')
    const custom = emitElementsCss({ md: 900, sm: 560 })
    expect(custom).toContain('@media (max-width: 900px) {')
    expect(custom).toContain('@media (max-width: 560px) {')
    expect(custom).not.toContain('1024px')
  })

  it('leaves the centering rule to elements.scss (not generated here)', () => {
    expect(css).not.toContain('margin-inline')
  })

  it('covers every style-vars CSS variable (no drift)', () => {
    const bases = new Set(ELEMENT_CSS_VAR_BASES)
    const specVars = [FRAME_VARS, SIZE_VARS, TEXT_VARS, IMAGE_VARS].flatMap((specs) =>
      Object.values(specs)
        .flatMap((entry) => (Array.isArray(entry) ? entry : [entry]))
        .map((spec) => spec.cssVar.replace(/^--/, '')),
    )
    for (const varBase of specVars) expect(bases).toContain(varBase)
  })

  it('emits display knob rungs per kind (the hide knob), floors restating the defaults', () => {
    expect(css).toContain(".mxel-frame[style*='--el-display:'] { display: var(--el-display); }")
    expect(css).toContain(".mxel-text[style*='--el-display:'] { display: var(--el-display); }")
    expect(css).toContain(".mxel-slot[style*='--el-display:'] { display: var(--el-display); }")
    expect(css).toContain(".mxel-frame[style*='--el-display-sm:'] { display: var(--el-display-sm); }")
    // Floors sit in the layer with the kind's own default as fallback.
    expect(css).toContain('display: var(--el-display, flex);')
    expect(css).toContain('display: var(--el-display, block);')
  })

  it('composes the background image with the overlay gradient, after the bg shorthand', () => {
    // Floor: gradient(overlay, overlay) over the image url, per suffix chain.
    expect(css).toContain(
      'background-image: linear-gradient(var(--el-bgoverlay, transparent), var(--el-bgoverlay, transparent)), var(--el-bgimg, none);',
    )
    // Knob rung, breakpoint-suffixed overlay chain inside the -sm block.
    expect(css).toContain(
      ".mxel-frame[style*='--el-bgimg-sm:'] { background-image: linear-gradient(var(--el-bgoverlay-sm, var(--el-bgoverlay-md, var(--el-bgoverlay, transparent))), var(--el-bgoverlay-sm, var(--el-bgoverlay-md, var(--el-bgoverlay, transparent)))), var(--el-bgimg-sm); }",
    )
    // The bg-image knob rung must come after the background shorthand's, so a
    // color + image fill keeps the image (the shorthand resets background-image).
    const bg = css.indexOf(".mxel-frame[style*='--el-bg:']")
    const bgimg = css.indexOf(".mxel-frame[style*='--el-bgimg:']")
    expect(bg).toBeGreaterThan(-1)
    expect(bgimg).toBeGreaterThan(bg)
    // Focal position floor + rung.
    expect(css).toContain('background-position: var(--el-bgpos, 50% 50%);')
    expect(css).toContain(".mxel-frame[style*='--el-bgpos:'] { background-position: var(--el-bgpos); }")
  })
})
