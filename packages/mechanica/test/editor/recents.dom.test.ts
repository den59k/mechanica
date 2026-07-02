import { describe, it, expect, beforeEach } from 'vitest'
import { getRecents, recordRecent } from '@/editor/lib/recents'

beforeEach(() => localStorage.clear())

describe('recents', () => {
  it('records most-recent first, deduplicated', () => {
    recordRecent('pages', '/a')
    recordRecent('pages', '/b')
    recordRecent('pages', '/a')
    expect(getRecents('pages')).toEqual(['/a', '/b'])
  })

  it('caps the list', () => {
    for (let i = 0; i < 12; i++) recordRecent('blocks', `block-${i}`)
    const recents = getRecents('blocks')
    expect(recents).toHaveLength(8)
    expect(recents[0]).toBe('block-11')
  })

  it('keeps kinds separate and survives malformed storage', () => {
    recordRecent('pages', '/a')
    expect(getRecents('blocks')).toEqual([])
    localStorage.setItem('mechanica:recent-pages', 'not json')
    expect(getRecents('pages')).toEqual([])
  })
})
