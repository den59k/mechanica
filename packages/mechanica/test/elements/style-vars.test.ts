import { describe, it, expect } from 'vitest'
import {
  responsiveVars,
  absStyle,
  compactStyle,
  placementStyle,
  FRAME_VARS,
  SIZE_VARS,
  TEXT_VARS,
  IMAGE_VARS,
  SHADOWS,
} from '@/elements/style-vars'

describe('responsiveVars: base mapping', () => {
  it('maps frame layout knobs to CSS variables', () => {
    const vars = responsiveVars(
      { direction: 'row', gap: 16, align: 'center', justify: 'between', wrap: true, padding: [24, 48] },
      FRAME_VARS,
    )
    expect(vars).toEqual({
      '--el-dir': 'row',
      '--el-gap': '16px',
      '--el-align': 'center',
      '--el-justify': 'space-between',
      '--el-wrap': 'wrap',
      '--el-pad': '24px 48px',
    })
  })

  it('maps size modes (hug/fill/number)', () => {
    expect(responsiveVars({ w: 'hug' }, FRAME_VARS)['--el-w']).toBe('auto')
    expect(responsiveVars({ w: 'fill' }, FRAME_VARS)['--el-w']).toBe('100%')
    expect(responsiveVars({ w: 320 }, FRAME_VARS)['--el-w']).toBe('320px')
    expect(responsiveVars({ grow: true }, FRAME_VARS)['--el-grow']).toBe('1')
  })

  it('maps content width (maxWidth → --el-maxw)', () => {
    expect(responsiveVars({ maxWidth: 720 }, FRAME_VARS)['--el-maxw']).toBe('720px')
    expect(responsiveVars({ maxWidth: '60ch' }, FRAME_VARS)['--el-maxw']).toBe('60ch')
  })

  it('maps margin (padding shorthand forms, negatives allowed) on frames and leaves', () => {
    expect(responsiveVars({ margin: 16 }, FRAME_VARS)['--el-margin']).toBe('16px')
    expect(responsiveVars({ margin: [8, 0] }, FRAME_VARS)['--el-margin']).toBe('8px 0px')
    expect(responsiveVars({ margin: -12 }, SIZE_VARS)['--el-margin']).toBe('-12px')
    expect(responsiveVars({ margin: 16, $bp: { sm: { margin: 8 } } }, SIZE_VARS)['--el-margin-sm']).toBe('8px')
  })

  it('ignores unknown keys and invalid enum values', () => {
    const vars = responsiveVars({ direction: 'diagonal', unknown: 1 }, FRAME_VARS)
    expect(vars).toEqual({})
  })
})

describe('responsiveVars: breakpoint overrides', () => {
  it('emits suffixed variables per breakpoint present in $bp', () => {
    const vars = responsiveVars(
      { direction: 'row', gap: 24, $bp: { md: { gap: 16 }, sm: { direction: 'column', gap: 12 } } },
      FRAME_VARS,
    )
    expect(vars).toEqual({
      '--el-dir': 'row',
      '--el-gap': '24px',
      '--el-gap-md': '16px',
      '--el-dir-sm': 'column',
      '--el-gap-sm': '12px',
    })
  })

  it('ignores a malformed $bp', () => {
    expect(responsiveVars({ gap: 8, $bp: 'nope' }, FRAME_VARS)).toEqual({ '--el-gap': '8px' })
  })
})

describe('SIZE_VARS', () => {
  it('maps self-align and text-align', () => {
    const vars = responsiveVars({ align: 'end', textAlign: 'center' }, SIZE_VARS)
    expect(vars).toEqual({ '--el-self': 'flex-end', '--el-text-align': 'center' })
  })
})

describe('visual style vars (breakpoint-capable)', () => {
  it('maps frame fill/radius/minHeight/shadow', () => {
    const vars = responsiveVars({ background: '#fafafa', radius: 12, minHeight: 320, shadow: 'md' }, FRAME_VARS)
    expect(vars).toEqual({
      '--el-bg': '#fafafa',
      '--el-radius': '12px',
      '--el-minh': '320px',
      '--el-shadow': SHADOWS.md,
    })
  })

  it('maps text typography (size/weight/lineHeight/color/maxWidth)', () => {
    const vars = responsiveVars({ size: 48, weight: 600, lineHeight: 1.3, color: '#111', maxWidth: '60ch' }, TEXT_VARS)
    expect(vars).toEqual({
      '--el-fs': '48px',
      '--el-fw': '600',
      '--el-lh': '1.3',
      '--el-color': '#111',
      '--el-maxw': '60ch',
    })
  })

  it('maps image fit/ratio/radius', () => {
    const vars = responsiveVars({ fit: 'contain', ratio: '16/9', radius: 8 }, IMAGE_VARS)
    expect(vars).toEqual({ '--el-fit': 'contain', '--el-ratio': '16/9', '--el-radius': '8px' })
  })

  it('maps min/max limits on frames and leaves, with $bp overrides', () => {
    expect(responsiveVars({ minWidth: 120, maxWidth: 960, minHeight: 240, maxHeight: 600 }, FRAME_VARS)).toEqual({
      '--el-minw': '120px',
      '--el-maxw': '960px',
      '--el-minh': '240px',
      '--el-maxh': '600px',
    })
    // Leaves get every limit too (SIZE_VARS → TEXT_VARS/IMAGE_VARS).
    expect(responsiveVars({ minHeight: 64, maxHeight: 320 }, SIZE_VARS)).toEqual({
      '--el-minh': '64px',
      '--el-maxh': '320px',
    })
    expect(responsiveVars({ maxWidth: 960, $bp: { sm: { maxWidth: 480 } } }, FRAME_VARS)['--el-maxw-sm']).toBe('480px')
  })

  it('emits suffixed overrides from $bp for style knobs', () => {
    const vars = responsiveVars(
      { size: 48, background: '#fff', $bp: { md: { size: 36 }, sm: { size: 28 } } },
      { ...FRAME_VARS, ...TEXT_VARS },
    )
    expect(vars['--el-fs']).toBe('48px')
    expect(vars['--el-fs-md']).toBe('36px')
    expect(vars['--el-fs-sm']).toBe('28px')
    expect(vars['--el-bg']).toBe('#fff')
  })

  it('ignores an unknown shadow preset and empty strings', () => {
    expect(responsiveVars({ shadow: 'xxl' }, FRAME_VARS)).toEqual({})
    expect(responsiveVars({ background: '' }, FRAME_VARS)).toEqual({})
    expect(responsiveVars({ color: '' }, TEXT_VARS)).toEqual({})
  })
})

describe('absStyle', () => {
  it('returns nothing for a non-object', () => {
    expect(absStyle(undefined)).toEqual({})
  })
  it('anchors to corners with offsets', () => {
    expect(absStyle({ anchor: 'top-left', x: 10, y: 20 })).toEqual({
      position: 'absolute',
      top: '20px',
      left: '10px',
    })
    expect(absStyle({ anchor: 'bottom-right', x: 5, y: 8, z: 3 })).toEqual({
      position: 'absolute',
      bottom: '8px',
      right: '5px',
      zIndex: '3',
    })
  })
  it('centers with a translate transform', () => {
    expect(absStyle({ anchor: 'center', x: 0, y: 0 })).toEqual({
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(calc(-50% + 0px), calc(-50% + 0px))',
    })
  })
  it('pins to an edge-centre, translating only the centred axis', () => {
    // Top edge-centre: horizontal is centred (translate X), vertical rides `top`.
    expect(absStyle({ anchor: 'top', x: 4, y: 6 })).toEqual({
      position: 'absolute',
      top: '6px',
      left: '50%',
      transform: 'translate(calc(-50% + 4px), 0)',
    })
    // Right edge-centre: horizontal rides `right`, vertical is centred (translate Y).
    expect(absStyle({ anchor: 'right', x: 12, y: 0 })).toEqual({
      position: 'absolute',
      top: '50%',
      right: '12px',
      transform: 'translate(0, calc(-50% + 0px))',
    })
  })
  it('pins to the bottom edge-centre', () => {
    expect(absStyle({ anchor: 'bottom', x: 0, y: 10 })).toEqual({
      position: 'absolute',
      bottom: '10px',
      left: '50%',
      transform: 'translate(calc(-50% + 0px), 0)',
    })
  })
  it('defaults a missing anchor to top-left with zero offsets', () => {
    expect(absStyle({})).toEqual({ position: 'absolute', top: '0px', left: '0px' })
  })
})

describe('compactStyle', () => {
  it('merges and drops empty values', () => {
    expect(compactStyle({ a: '1', b: '' }, undefined, { c: '2' })).toEqual({ a: '1', c: '2' })
  })
})

describe('placementStyle (component / composed placement wrapper)', () => {
  it('returns null when the block carries no placement data', () => {
    expect(placementStyle({ text: 'Hi' })).toBeNull()
    expect(placementStyle('nope')).toBeNull()
    expect(placementStyle(undefined)).toBeNull()
  })

  it('maps a margin (shorthand forms) to the --el-margin var', () => {
    expect(placementStyle({ margin: 16 })).toEqual({ '--el-margin': '16px' })
    expect(placementStyle({ margin: [8, 0] })).toEqual({ '--el-margin': '8px 0px' })
  })

  it('includes responsive margin overrides from $bp', () => {
    expect(placementStyle({ margin: 16, $bp: { sm: { margin: 8 } } })).toEqual({
      '--el-margin': '16px',
      '--el-margin-sm': '8px',
    })
  })

  it('maps $abs to absolute positioning, merged with margin', () => {
    expect(placementStyle({ $abs: { anchor: 'top-right', x: 12, y: 4 } })).toEqual({
      position: 'absolute',
      right: '12px',
      top: '4px',
    })
    expect(placementStyle({ margin: 8, $abs: { anchor: 'top-left', x: 0, y: 0 } })).toMatchObject({
      '--el-margin': '8px',
      position: 'absolute',
    })
  })
})
