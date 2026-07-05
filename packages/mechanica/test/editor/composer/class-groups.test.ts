import { describe, it, expect } from 'vitest'
import type { ComposerClassDef } from 'mechanica-shared'
import { classGroupsFor, selectedClass, setGroupClass, DEFAULT_GROUP } from '@/editor/composer/lib/class-groups'

const DEFS: ComposerClassDef[] = [
  { cls: 'container', title: 'Container', kinds: ['frame'] },
  { cls: 'panel', title: 'Panel', kinds: ['frame'], group: 'surface' },
  { cls: 'panel-muted', title: 'Muted', kinds: ['frame'], group: 'surface' },
  { cls: 'raised', title: 'Raised', kinds: ['frame'], group: 'elevation' },
  { cls: 'lead', title: 'Lead', kinds: ['text'] },
]

describe('classGroupsFor', () => {
  it('splits a kind into the default group first, then named groups in order', () => {
    const groups = classGroupsFor(DEFS, 'frame')
    expect(groups.map((g) => [g.key, g.label])).toEqual([
      [DEFAULT_GROUP, 'Style'],
      ['surface', 'Surface'],
      ['elevation', 'Elevation'],
    ])
    expect(groups[0]!.defs.map((d) => d.cls)).toEqual(['container'])
    expect(groups[1]!.defs.map((d) => d.cls)).toEqual(['panel', 'panel-muted'])
  })

  it('filters by kind (text sees only its ungrouped Style group)', () => {
    const groups = classGroupsFor(DEFS, 'text')
    expect(groups.map((g) => g.key)).toEqual([DEFAULT_GROUP])
    expect(groups[0]!.defs.map((d) => d.cls)).toEqual(['lead'])
  })
})

describe('selectedClass', () => {
  const groups = classGroupsFor(DEFS, 'frame')
  const [style, surface] = groups

  it('reads the active class per group from the cls string', () => {
    expect(selectedClass('container panel', style!, DEFS)).toBe('container')
    expect(selectedClass('container panel', surface!, DEFS)).toBe('panel')
    expect(selectedClass('container', surface!, DEFS)).toBe('') // nothing from surface
  })

  it('assigns a stale token to the default group, marked by the caller', () => {
    expect(selectedClass('gone panel', style!, DEFS)).toBe('gone')
    expect(selectedClass('gone panel', surface!, DEFS)).toBe('panel')
  })
})

describe('setGroupClass', () => {
  const groups = classGroupsFor(DEFS, 'frame')
  const [style, surface] = groups

  it('sets a group without disturbing other groups', () => {
    expect(setGroupClass('container', surface!, 'panel', DEFS)).toBe('container panel')
    expect(setGroupClass('container panel', surface!, 'panel-muted', DEFS)).toBe('container panel-muted')
  })

  it('clears a group with an empty value', () => {
    expect(setGroupClass('container panel', surface!, '', DEFS)).toBe('container')
  })

  it('replacing the default group also drops a stale token', () => {
    expect(setGroupClass('gone panel', style!, 'container', DEFS)).toBe('panel container')
  })
})
