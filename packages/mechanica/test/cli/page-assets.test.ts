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

const blockFiles = {
  hero: { src: 'src/blocks/Hero.vue', chunk: 'assets/Hero-a1.js' },
  card: { src: 'src/blocks/Card.vue', chunk: 'assets/Card-b2.js' },
}

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

  it('resolves blocks sharing one bundled chunk (no per-block manifest keys)', () => {
    // `blockChunks: 'bundled'`: the merged chunk has no facade module, so the
    // manifest keys it by file name — the chunk file is the only join point.
    const bundled: ViteManifest = {
      '_blocks-h4sh.js': {
        file: 'assets/blocks-h4sh.js',
        css: ['assets/blocks-h4sh.css'],
        imports: ['index.html'],
      },
      'index.html': { file: 'assets/index-e5.js' },
    }
    const links = blockAssetLinks({
      blockIds: ['hero', 'card'],
      manifest: bundled,
      blockFiles: {
        hero: { src: 'src/blocks/Hero.vue', chunk: 'assets/blocks-h4sh.js' },
        card: { src: 'src/blocks/Card.vue', chunk: 'assets/blocks-h4sh.js' },
      },
      alreadyLinked: (file) => file.includes('index-e5'),
    })
    expect(links).toEqual([
      '<link rel="stylesheet" href="/assets/blocks-h4sh.css">',
      '<link rel="modulepreload" href="/assets/blocks-h4sh.js">',
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
