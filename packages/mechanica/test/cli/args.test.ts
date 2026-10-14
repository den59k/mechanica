import { describe, it, expect } from 'vitest'
import { parseArgs, flagValues } from '@/cli/args'

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

  it('never gives a value to the flags declared boolean', () => {
    const argv = ['shot', '--no-freeze', 'design/index.html', '--full', 'x']
    expect(parseArgs(argv, { booleans: ['full', 'no-freeze'] })).toEqual({
      command: 'shot',
      args: ['design/index.html', 'x'],
      flags: { 'no-freeze': true, full: true },
    })
  })

  it('keeps the last value of a repeated flag', () => {
    expect(parseArgs(['shot', 'x.html', '--section', '#a', '--section', '#b']).flags).toEqual({ section: '#b' })
  })
})

describe('flagValues', () => {
  it('collects every value of a repeated flag, in order', () => {
    const argv = ['shot', 'x.html', '--section', '#hero', '--width', '390', '--section=.stage > .pin', '--section']
    expect(flagValues(argv, 'section')).toEqual(['#hero', '.stage > .pin', true])
    expect(flagValues(argv, 'width')).toEqual(['390'])
    expect(flagValues(argv, 'scroll')).toEqual([])
  })

  it('skips the command, like parseArgs', () => {
    expect(flagValues(['--section', 'x', '--section', 'y'], 'section')).toEqual(['y'])
  })
})
