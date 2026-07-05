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
      Object.values(specs).map((spec) => spec.cssVar.replace(/^--/, '')),
    )
    for (const varBase of specVars) expect(bases).toContain(varBase)
  })
})
