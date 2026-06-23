import { describe, it, expect, vi } from 'vitest'
import { builtinFields, registerFieldSchemas, getFieldDefault, areFieldSchemasRegistered } from '@/fields'

describe('registerFieldSchemas', () => {
  it('registers every builtin field as an alias', () => {
    const register = vi.fn()
    registerFieldSchemas(register)
    expect(register).toHaveBeenCalledTimes(builtinFields.length)
    for (const field of builtinFields) {
      expect(register).toHaveBeenCalledWith(field.name, field.schema)
    }
    expect(areFieldSchemasRegistered()).toBe(true)
  })
})

describe('getFieldDefault', () => {
  it('returns defaults for fields that declare them', () => {
    registerFieldSchemas(vi.fn())
    expect(getFieldDefault('image')).toMatchObject({ src: expect.any(String) })
    expect(getFieldDefault('file')).toEqual({ src: '' })
    expect(getFieldDefault('richText')).toEqual([{ text: '' }])
  })

  it('returns undefined for fields without a default', () => {
    registerFieldSchemas(vi.fn())
    expect(getFieldDefault('color')).toBeUndefined()
    expect(getFieldDefault('multiselect')).toBeUndefined()
    expect(getFieldDefault('unknown')).toBeUndefined()
  })

  it('hands out fresh default instances (factories, not shared refs)', () => {
    registerFieldSchemas(vi.fn())
    expect(getFieldDefault('richText')).not.toBe(getFieldDefault('richText'))
  })
})
