import { describe, it, expect } from 'vitest'
import { resolveChunkAssets, blockAssetLinks, type ViteManifest } from '@/cli/page-assets'

// A client-build manifest: two block chunks sharing a common chunk (which the
// entry also imports), each with its own CSS.
const manifest: ViteManifest = {
  'src/blocks/Hero.vue': {
    file: 'assets/Hero-a1.js',
    css: ['assets/Hero-a1.css'],
    imports: ['_shared-x9.js'],
  },
  'src/blocks/Card.vue': {
    file: 'assets/Card-b2.js',
    css: ['assets/Card-b2.css'],
    imports: ['_shared-x9.js'],
  },
  '_shared-x9.js': {
    file: 'assets/shared-x9.js',
    css: ['assets/shared-x9.css'],
  },
}

const blockFiles = { hero: 'src/blocks/Hero.vue', card: 'src/blocks/Card.vue' }

describe('resolveChunkAssets', () => {
  it('collects the chunk, its css and transitive imports', () => {
    const assets = resolveChunkAssets(manifest, 'src/blocks/Hero.vue')
    expect(assets.js).toEqual(['assets/Hero-a1.js', 'assets/shared-x9.js'])
    expect(assets.css).toEqual(['assets/Hero-a1.css', 'assets/shared-x9.css'])
  })

  it('handles unknown keys and import cycles', () => {
    const cyclic: ViteManifest = {
      a: { file: 'a.js', imports: ['b'] },
      b: { file: 'b.js', imports: ['a', 'missing'] },
    }
    const assets = resolveChunkAssets(cyclic, 'a')
    expect(assets.js).toEqual(['a.js', 'b.js'])
  })
})

describe('blockAssetLinks', () => {
  it('emits stylesheet links before modulepreload, deduped across blocks', () => {
    const links = blockAssetLinks({ blockIds: ['hero', 'card'], manifest, blockFiles })
    expect(links).toEqual([
      '<link rel="stylesheet" href="/assets/Hero-a1.css">',
      '<link rel="stylesheet" href="/assets/shared-x9.css">',
      '<link rel="stylesheet" href="/assets/Card-b2.css">',
      '<link rel="modulepreload" href="/assets/Hero-a1.js">',
      '<link rel="modulepreload" href="/assets/shared-x9.js">',
      '<link rel="modulepreload" href="/assets/Card-b2.js">',
    ])
  })

  it('skips files the html already references and unknown block ids', () => {
    const links = blockAssetLinks({
      blockIds: ['hero', 'retired'],
      manifest,
      blockFiles,
      // The entry already links the shared chunk + its css from index.html.
      alreadyLinked: (file) => file.includes('shared-x9'),
    })
    expect(links).toEqual([
      '<link rel="stylesheet" href="/assets/Hero-a1.css">',
      '<link rel="modulepreload" href="/assets/Hero-a1.js">',
    ])
  })
})
