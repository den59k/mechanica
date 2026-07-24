import { describe, it, expect } from 'vitest'
import { dataEntryAvailableIn } from '@/editor/lib/data-meta'
import type { DataEntry } from 'mechanica-shared'

const entry = (folder?: string): DataEntry => ({ id: 'e', title: 'E', folder })

describe('dataEntryAvailableIn', () => {
  it('offers unrestricted entries on every page', () => {
    expect(dataEntryAvailableIn(entry(), null)).toBe(true)
    expect(dataEntryAvailableIn(entry(), 'examples')).toBe(true)
  })

  it('restricts folder-pinned entries to their folder', () => {
    const pinned = entry('examples')
    expect(dataEntryAvailableIn(pinned, 'examples')).toBe(true)
    expect(dataEntryAvailableIn(pinned, 'blog')).toBe(false)
    expect(dataEntryAvailableIn(pinned, null)).toBe(false)
  })

  it('matches nested folders by prefix, not substring', () => {
    const pinned = entry('examples')
    expect(dataEntryAvailableIn(pinned, 'examples/advanced')).toBe(true)
    expect(dataEntryAvailableIn(pinned, 'examples-v2')).toBe(false)
  })

  it('ignores leading/trailing slashes on either side', () => {
    expect(dataEntryAvailableIn(entry('/examples/'), 'examples')).toBe(true)
    expect(dataEntryAvailableIn(entry('examples'), '/examples')).toBe(true)
  })
})
