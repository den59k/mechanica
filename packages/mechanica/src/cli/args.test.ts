import { describe, it, expect } from 'vitest'
import { parseArgs } from './args'

describe('parseArgs', () => {
  it('reads the command and flags', () => {
    expect(parseArgs(['build'])).toEqual({ command: 'build', flags: {} })
  })

  it('parses --key=value and --key value', () => {
    expect(parseArgs(['push', '--key=abc', '--host', 'http://x'])).toEqual({
      command: 'push',
      flags: { key: 'abc', host: 'http://x' },
    })
  })

  it('treats a trailing flag as boolean', () => {
    expect(parseArgs(['export', '--minify'])).toEqual({
      command: 'export',
      flags: { minify: true },
    })
  })
})
