import { describe, it, expect } from 'vitest'
import type { ContentBlock } from 'mechanica-shared'
import {
  INSERT_ITEMS,
  insertItemForKey,
  elementKind,
  isContainerBlock,
  frameLabel,
  blockLabel,
  blockIcon,
} from '@/editor/composer/lib/elements-meta'

const node = (blockId: string, data: Record<string, unknown> = {}): ContentBlock => ({ id: 'x', blockId, data })

describe('INSERT_ITEMS', () => {
  it('offers Row, Column, Text, Image (no Button — it moved to userland)', () => {
    expect(INSERT_ITEMS.map((i) => i.key)).toEqual(['row', 'column', 'text', 'image'])
  })

  it('Row and Column both create a mech:frame with the right direction and no padding', () => {
    const row = INSERT_ITEMS.find((i) => i.key === 'row')!.create()
    const col = INSERT_ITEMS.find((i) => i.key === 'column')!.create()
    expect(row.blockId).toBe('mech:frame')
    expect(row.data).toMatchObject({ direction: 'row', padding: 0 })
    expect(col.data).toMatchObject({ direction: 'column', padding: 0 })
  })

  it('resolves single-key shortcuts (case-insensitive)', () => {
    expect(insertItemForKey('R')!.key).toBe('row')
    expect(insertItemForKey('c')!.key).toBe('column')
    expect(insertItemForKey('t')!.key).toBe('text')
    expect(insertItemForKey('i')!.key).toBe('image')
    expect(insertItemForKey('x')).toBeNull()
  })
})

describe('element kind + container', () => {
  it('classifies the built-in element ids', () => {
    expect(elementKind('mech:frame')).toBe('frame')
    expect(elementKind('mech:text')).toBe('text')
    expect(elementKind('mech:image')).toBe('image')
    expect(elementKind('some-component')).toBeNull()
    expect(isContainerBlock('mech:frame')).toBe(true)
    expect(isContainerBlock('mech:text')).toBe(false)
  })
})

describe('direction-derived labels + icons', () => {
  it('labels a frame by its base direction', () => {
    expect(frameLabel(node('mech:frame', { direction: 'row' }))).toBe('Row')
    expect(frameLabel(node('mech:frame', { direction: 'column' }))).toBe('Column')
    expect(frameLabel(node('mech:frame', {}))).toBe('Column') // default
  })

  it('blockLabel delegates to frameLabel for frames', () => {
    expect(blockLabel(node('mech:frame', { direction: 'row' }))).toBe('Row')
    expect(blockLabel(node('mech:text'))).toBe('Text')
    expect(blockLabel(node('custom'))).toBe('custom')
  })

  it('blockIcon is direction-aware for frames', () => {
    expect(blockIcon(node('mech:frame', { direction: 'row' }))).toBe('row')
    expect(blockIcon(node('mech:frame', { direction: 'column' }))).toBe('column')
    expect(blockIcon(node('mech:text'))).toBe('text')
    expect(blockIcon(node('custom'))).toBe('slot')
  })
})
