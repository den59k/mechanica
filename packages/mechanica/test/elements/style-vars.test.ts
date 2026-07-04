import { describe, it, expect } from 'vitest'
import { responsiveVars, absStyle, compactStyle, FRAME_VARS, SIZE_VARS } from '@/elements/style-vars'

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
