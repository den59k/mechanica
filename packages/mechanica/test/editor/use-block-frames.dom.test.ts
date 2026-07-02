import { describe, it, expect, vi } from 'vitest'
import { effectScope } from 'vue'
import {
  findBlockId,
  isEditorUI,
  findLink,
  linkClickAction,
  useBlockFrames,
} from '@/editor/lib/use-block-frames'
import type { EditorStore } from '@/editor/lib/store'

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

describe('findLink', () => {
  it('finds the nearest anchor with an href', () => {
    document.body.innerHTML = '<a href="/about"><span id="t">About</span></a>'
    expect(findLink(document.getElementById('t'))?.pathname).toBe('/about')
  })

  it('ignores anchors without an href', () => {
    document.body.innerHTML = '<a id="a">nope</a>'
    expect(findLink(document.getElementById('a'))).toBeNull()
  })
})

describe('linkClickAction', () => {
  const plain = { metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }
  const anchor = (attrs: string) => {
    document.body.innerHTML = `<a id="l" ${attrs}>x</a>`
    return document.getElementById('l') as HTMLAnchorElement
  }

  it('follows internal links', () => {
    expect(linkClickAction(anchor('href="/blog/2"'), plain)).toBe('follow')
  })

  it('leaves modified clicks to the browser', () => {
    expect(linkClickAction(anchor('href="/about"'), { ...plain, ctrlKey: true })).toBe('native')
    expect(linkClickAction(anchor('href="/about"'), { ...plain, metaKey: true })).toBe('native')
  })

  it('leaves new-tab, download and external links to the browser', () => {
    expect(linkClickAction(anchor('href="/about" target="_blank"'), plain)).toBe('native')
    expect(linkClickAction(anchor('href="/file.pdf" download'), plain)).toBe('native')
    expect(linkClickAction(anchor('href="https://example.com/x"'), plain)).toBe('native')
    expect(linkClickAction(anchor('href="mailto:hi@example.com"'), plain)).toBe('native')
  })

  it('leaves same-page hash jumps to the browser', () => {
    const path = location.pathname
    expect(linkClickAction(anchor(`href="${path}#team"`), plain)).toBe('native')
    // A hash on another page still follows (to that page).
    expect(linkClickAction(anchor('href="/other#team"'), plain)).toBe('follow')
  })
})

describe('useBlockFrames click handling', () => {
  const fakeStore = () =>
    ({ setHover: vi.fn(), select: vi.fn(), selectedId: null, hoverId: null }) as unknown as EditorStore

  const mount = (store: EditorStore, followLink?: (path: string) => void) => {
    const scope = effectScope()
    scope.run(() => useBlockFrames(store, { followLink }))
    return scope
  }

  // Record whether the frames handler prevented the click, then cancel the
  // event anyway so jsdom never attempts a real navigation on the anchor.
  const click = (id: string) => {
    let prevented = false
    const record = (event: Event) => {
      prevented = event.defaultPrevented
      event.preventDefault()
    }
    document.addEventListener('click', record, true)
    document.getElementById(id)!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    document.removeEventListener('click', record, true)
    return prevented
  }

  it('selects the block on a plain click', () => {
    const store = fakeStore()
    const scope = mount(store, vi.fn())
    document.body.innerHTML = '<section data-block-id="b1"><p id="p">text</p></section>'
    expect(click('p')).toBe(true)
    expect(store.select).toHaveBeenCalledWith('b1')
    scope.stop()
  })

  it('follows an internal link instead of selecting', () => {
    const store = fakeStore()
    const followed: string[] = []
    const scope = mount(store, (path) => followed.push(path))
    document.body.innerHTML =
      '<section data-block-id="b1"><a href="/blog/2"><span id="l">Read</span></a></section>'
    expect(click('l')).toBe(true)
    expect(followed).toEqual(['/blog/2'])
    expect(store.select).not.toHaveBeenCalled()
    scope.stop()
  })

  it('leaves external links to the browser without selecting the block', () => {
    const store = fakeStore()
    const followed: string[] = []
    const scope = mount(store, (path) => followed.push(path))
    document.body.innerHTML =
      '<section data-block-id="b1"><a id="l" href="https://example.com">Out</a></section>'
    expect(click('l')).toBe(false)
    expect(followed).toEqual([])
    expect(store.select).not.toHaveBeenCalled()
    scope.stop()
  })

  it('ignores clicks inside the editor UI', () => {
    const store = fakeStore()
    const followed: string[] = []
    const scope = mount(store, (path) => followed.push(path))
    document.body.innerHTML = '<div data-mech-ui><a id="l" href="/about">x</a></div>'
    expect(click('l')).toBe(false)
    expect(followed).toEqual([])
    scope.stop()
  })
})
