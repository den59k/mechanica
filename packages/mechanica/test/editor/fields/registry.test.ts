import { describe, it, expect, beforeEach } from 'vitest'
import { registerFieldEditor, resolveFieldEditor, clearFieldEditors } from '@/editor/fields/registry'

const component = (name: string) => ({ name }) as any

beforeEach(() => clearFieldEditors())

describe('resolveFieldEditor', () => {
  it('prefers format over type', () => {
    registerFieldEditor('string', component('str'))
    registerFieldEditor('color', component('color'))
    expect(resolveFieldEditor({ type: 'string', format: 'color' })).toMatchObject({ name: 'color' })
  })

  it('resolves enum fields', () => {
    registerFieldEditor('string', component('str'))
    registerFieldEditor('enum', component('enum'))
    expect(resolveFieldEditor({ type: 'string', enum: ['a', 'b'] })).toMatchObject({ name: 'enum' })
  })

  it('falls back to type, then to string', () => {
    registerFieldEditor('string', component('str'))
    registerFieldEditor('number', component('num'))
    expect(resolveFieldEditor({ type: 'number' })).toMatchObject({ name: 'num' })
    expect(resolveFieldEditor({ type: 'mystery' })).toMatchObject({ name: 'str' })
  })
})
