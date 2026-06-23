import { describe, it, expect } from 'vitest'
import { h } from 'vue'
import { defineMechanicaApp, createMechanicaApp } from './define-mechanica-app'

const Root = { render: () => h('main', 'hello') }

describe('defineMechanicaApp / createMechanicaApp', () => {
  it('returns the definition unchanged', () => {
    const def = defineMechanicaApp({ root: Root })
    expect(def.root).toBe(Root)
  })

  it('builds a mountable app with the runtime and user setup installed', () => {
    let setupRan = 0
    const def = defineMechanicaApp({ root: Root, setup: () => void setupRan++ })
    const app = createMechanicaApp(def, { mode: 'client', state: { content: [], data: {} } })

    const el = document.createElement('div')
    app.mount(el)

    expect(el.innerHTML).toContain('hello')
    expect(setupRan).toBe(1)
  })
})
