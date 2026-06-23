import { describe, it, expect } from 'vitest'
import { findBlockId, isEditorUI } from '@/editor/lib/use-block-frames'

describe('findBlockId', () => {
  it('finds the nearest data-block-id ancestor', () => {
    document.body.innerHTML = '<section data-block-id="b1"><h1><span id="t">Hi</span></h1></section>'
    expect(findBlockId(document.getElementById('t'))).toBe('b1')
  })

  it('returns null when there is no block ancestor', () => {
    document.body.innerHTML = '<div><span id="x">y</span></div>'
    expect(findBlockId(document.getElementById('x'))).toBeNull()
  })
})

describe('isEditorUI', () => {
  it('detects elements inside the editor UI', () => {
    document.body.innerHTML = '<div data-mech-ui><button id="b">x</button></div><span id="o">o</span>'
    expect(isEditorUI(document.getElementById('b'))).toBe(true)
    expect(isEditorUI(document.getElementById('o'))).toBe(false)
  })
})
