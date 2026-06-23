import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { getUniqueName, saveUpload, listImages } from '@/vite/dev/assets-store'

let mechDir: string

beforeEach(() => {
  mechDir = fs.mkdtempSync(join(os.tmpdir(), 'mech-'))
})
afterEach(() => fs.rmSync(mechDir, { recursive: true, force: true }))

describe('getUniqueName', () => {
  it('returns the name unchanged when free', () => {
    expect(getUniqueName(mechDir, 'logo.png')).toBe('logo.png')
  })
  it('suffixes colliding names', () => {
    fs.writeFileSync(join(mechDir, 'logo.png'), '')
    expect(getUniqueName(mechDir, 'logo.png')).toBe('logo_1.png')
    fs.writeFileSync(join(mechDir, 'logo_1.png'), '')
    expect(getUniqueName(mechDir, 'logo.png')).toBe('logo_2.png')
  })
})

describe('saveUpload / listImages', () => {
  it('stores an upload and lists it', async () => {
    const result = await saveUpload(mechDir, 'pic.png', Buffer.from('data'))
    expect(result).toEqual({ src: '/@mechanica/assets/pic.png', name: 'pic.png' })

    const images = listImages(mechDir)
    expect(images).toHaveLength(1)
    expect(images[0]).toMatchObject({ name: 'pic.png', src: '/@mechanica/assets/pic.png' })
  })

  it('lists nothing when no assets exist', () => {
    expect(listImages(mechDir)).toEqual([])
  })
})
