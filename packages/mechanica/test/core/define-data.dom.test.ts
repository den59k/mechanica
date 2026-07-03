import { describe, it, expect, beforeEach } from 'vitest'
import { createApp, defineComponent, h } from 'vue'
import { registerFieldSchemas } from 'mechanica-shared'
import { createMechanica } from '@/core/create-mechanica'
import { defineData } from '@/core/define-data'
import { getDataEntries, clearDataEntries } from '@/core/data-registry'

registerFieldSchemas()

beforeEach(() => clearDataEntries())

describe('defineData', () => {
  it('registers an introspectable data entry', () => {
    defineData({ id: 'header', title: 'Header', props: { title: 'string' } })
    const entries = getDataEntries()
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ id: 'header', title: 'Header' })
    expect(entries[0]!.props).toBeTypeOf('object')
  })

  it('exposes a hook returning the live data, filling defaults in dev mode', () => {
    const useHeader = defineData({ id: 'header', props: { title: 'string' } })
    let seen: any
    const Probe = defineComponent({
      setup() {
        seen = useHeader()
        return () => h('div')
      },
    })
    createApp(Probe)
      .use(createMechanica({ mode: 'dev', state: { content: [], data: {} } }))
      .mount(document.createElement('div'))

    expect(seen).toMatchObject({ title: '' })
  })

  it('serializes to a stable id reference', () => {
    const useHeader = defineData({ id: 'header', props: {} })
    expect(useHeader.id).toBe('header')
    expect(JSON.stringify(useHeader)).toBe('{"id":"header"}')
  })
})
