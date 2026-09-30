import { describe, expect, it, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { blockingEntries, scaffold, toPackageName } from '../index.js'

const cleanups: string[] = []
const tmpDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'create-mechanica-'))
  cleanups.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of cleanups.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('toPackageName', () => {
  it('kebab-cases and sanitizes directory names', () => {
    expect(toPackageName('My Site')).toBe('my-site')
    expect(toPackageName('hello_world')).toBe('hello_world')
    expect(toPackageName('.hidden')).toBe('hidden')
    expect(toPackageName('weird!!chars')).toBe('weird--chars')
    expect(toPackageName('---')).toBe('mechanica-app')
    expect(toPackageName('')).toBe('mechanica-app')
  })
})

describe('template manifest', () => {
  const readManifest = (relative: string) => JSON.parse(fs.readFileSync(new URL(relative, import.meta.url), 'utf8'))
  const template = readManifest('../template/package.json')
  const mechanica = readManifest('../../mechanica/package.json')

  it('depends on published versions only', () => {
    // Scaffolded apps install from npm — a workspace: protocol can't resolve there.
    for (const group of ['dependencies', 'devDependencies'] as const) {
      for (const [dep, range] of Object.entries<string>(template[group] ?? {})) {
        expect(range, `${group}.${dep}`).not.toMatch(/^workspace:/)
      }
    }
  })

  it('keeps vuewrite in step with what mechanica requires', () => {
    expect(template.dependencies.vuewrite).toBe(mechanica.dependencies.vuewrite)
  })

  it('never pins vue to an exact version', () => {
    expect(template.dependencies.vue).toMatch(/^\^3\./)
  })
})

describe('scaffold', () => {
  it('copies the template and patches the project name', () => {
    const target = path.join(tmpDir(), 'My Blog')
    const { name } = scaffold(target)

    expect(name).toBe('my-blog')
    const manifest = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'))
    expect(manifest.name).toBe('my-blog')
    expect(manifest.dependencies.mechanica).toMatch(/^\^2\./)

    // The pieces a fresh app needs to boot.
    for (const file of [
      'vite.config.ts',
      'index.html',
      'tsconfig.json',
      'src/main.ts',
      'src/App.vue',
      'src/blocks/Hero.vue',
      'src/blocks/RichText.vue',
      'src/data/head.ts',
      '.mech/pages/index.page.md',
      // Agent guidance: AGENTS.md is read by Codex and, with no CLAUDE.md
      // beside it, by Claude Code too — so the template ships only this one.
      'AGENTS.md',
    ]) {
      expect(fs.existsSync(path.join(target, file)), file).toBe(true)
    }
  })

  it('renames _gitignore to .gitignore', () => {
    const target = path.join(tmpDir(), 'site')
    scaffold(target)
    expect(fs.existsSync(path.join(target, '.gitignore'))).toBe(true)
    expect(fs.existsSync(path.join(target, '_gitignore'))).toBe(false)
    expect(fs.readFileSync(path.join(target, '.gitignore'), 'utf8')).toContain('node_modules')
  })

  it('scaffolds into an existing empty directory', () => {
    const target = path.join(tmpDir(), 'empty')
    fs.mkdirSync(target)
    expect(() => scaffold(target)).not.toThrow()
    expect(fs.existsSync(path.join(target, 'package.json'))).toBe(true)
  })

  it('refuses a non-empty target directory', () => {
    const target = tmpDir()
    fs.writeFileSync(path.join(target, 'keep.txt'), 'hi')
    expect(() => scaffold(target)).toThrow(/not empty \(found keep\.txt\)/)
  })

  it('scaffolds into a directory that only holds dotfiles', () => {
    // What an agent or editor session starts from: a fresh repo, tool config.
    const target = tmpDir()
    fs.mkdirSync(path.join(target, '.git'))
    fs.writeFileSync(path.join(target, '.git', 'HEAD'), 'ref: refs/heads/main\n')
    fs.mkdirSync(path.join(target, '.claude'))
    fs.writeFileSync(path.join(target, '.DS_Store'), '')

    expect(blockingEntries(target)).toEqual([])
    scaffold(target, { name: 'site' })

    expect(fs.existsSync(path.join(target, 'package.json'))).toBe(true)
    expect(fs.readFileSync(path.join(target, '.git', 'HEAD'), 'utf8')).toBe('ref: refs/heads/main\n')
    expect(fs.existsSync(path.join(target, '.claude'))).toBe(true)
  })

  it('refuses dotfiles the template writes itself, leaving them untouched', () => {
    const target = tmpDir()
    fs.writeFileSync(path.join(target, '.gitignore'), 'mine\n')
    fs.mkdirSync(path.join(target, '.mech'))

    expect(blockingEntries(target).sort()).toEqual(['.gitignore', '.mech'])
    expect(() => scaffold(target)).toThrow(/not empty/)
    expect(fs.readFileSync(path.join(target, '.gitignore'), 'utf8')).toBe('mine\n')
    expect(fs.existsSync(path.join(target, 'package.json'))).toBe(false)
  })

  it('refuses a target that is a file', () => {
    const target = path.join(tmpDir(), 'file.txt')
    fs.writeFileSync(target, 'hi')
    expect(() => scaffold(target)).toThrow(/not a directory/)
  })

  it('honors an explicit name override', () => {
    const target = path.join(tmpDir(), 'dir-name')
    const { name } = scaffold(target, { name: 'custom-name' })
    expect(name).toBe('custom-name')
    const manifest = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'))
    expect(manifest.name).toBe('custom-name')
  })
})
