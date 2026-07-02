import { describe, it, expect } from 'vitest'
import { parseArgs } from '@/cli/args'

describe('parseArgs', () => {
  it('reads the command and flags', () => {
    expect(parseArgs(['build'])).toEqual({ command: 'build', args: [], flags: {} })
  })

  it('parses --key=value and --key value', () => {
    expect(parseArgs(['push', '--key=abc', '--host', 'http://x'])).toEqual({
      command: 'push',
      args: [],
      flags: { key: 'abc', host: 'http://x' },
    })
  })

  it('treats a trailing flag as boolean', () => {
    expect(parseArgs(['export', '--minify'])).toEqual({
      command: 'export',
      args: [],
      flags: { minify: true },
    })
  })

  it('collects positional arguments after the command', () => {
    expect(parseArgs(['shot', 'hero', '--width', '390', '--full'])).toEqual({
      command: 'shot',
      args: ['hero'],
      flags: { width: '390', full: true },
    })
  })

  it('does not treat a flag value as a positional', () => {
    expect(parseArgs(['shot', '--out', 'shots', 'hero'])).toEqual({
      command: 'shot',
      args: ['hero'],
      flags: { out: 'shots' },
    })
  })
})
