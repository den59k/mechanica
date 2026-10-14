import { describe, it, expect } from 'vitest'
import {
  browserEnv,
  platformBrowserCandidates,
  startFirstBrowser,
  windowsKillCommands,
  type BrowserExecutable,
} from '@/cli/headless'

describe('platformBrowserCandidates', () => {
  const env = {
    ProgramFiles: 'C:\\Program Files',
    'ProgramFiles(x86)': 'C:\\Program Files (x86)',
    LOCALAPPDATA: 'C:\\Users\\Ann\\AppData\\Local',
  }

  it('tries Chrome before Edge on Windows, Edge (shipped with Windows) last', () => {
    expect(platformBrowserCandidates('win32', env, 'C:\\Users\\Ann')).toEqual([
      { label: 'Google Chrome', path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' },
      { label: 'Google Chrome', path: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe' },
      { label: 'Google Chrome', path: 'C:\\Users\\Ann\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe' },
      { label: 'Microsoft Edge', path: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' },
      { label: 'Microsoft Edge', path: 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe' },
    ])
  })

  it('falls back to the default Windows folders without the environment variables', () => {
    const paths = platformBrowserCandidates('win32', {}, 'C:\\Users\\Ann').map((c) => c.path)
    expect(paths[0]).toBe('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
    expect(paths[2]).toBe('C:\\Users\\Ann\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
    expect(paths[3]).toBe('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe')
  })

  it('keeps the macOS and Linux order', () => {
    expect(platformBrowserCandidates('darwin', {}).map((c) => c.label)).toEqual([
      'Google Chrome',
      'Microsoft Edge',
      'Chromium',
    ])
    expect(platformBrowserCandidates('linux', {}).map((c) => c.path)).toEqual([
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/microsoft-edge',
    ])
  })
})

describe('browserEnv', () => {
  it('drops the Windows compatibility layer that makes Edge relaunch itself, in any case', () => {
    const env = { PATH: 'x', __COMPAT_LAYER: 'RunAsInvoker', __compat_layer: 'RunAsInvoker' }
    expect(browserEnv(env, 'win32')).toEqual({ PATH: 'x' })
    expect(env.__COMPAT_LAYER).toBe('RunAsInvoker') // not mutated
  })

  it('passes the environment through elsewhere', () => {
    const env = { PATH: 'x', __COMPAT_LAYER: 'RunAsInvoker' }
    expect(browserEnv(env, 'linux')).toBe(env)
  })
})

describe('windowsKillCommands', () => {
  const profile = 'C:\\Users\\Ann\\AppData\\Local\\Temp\\mechanica-shot-Ab12Cd'

  function decode(args: string[]): string {
    return Buffer.from(args[args.length - 1]!, 'base64').toString('utf16le')
  }

  it('kills the process tree while it runs, then whatever still runs on the profile', () => {
    const commands = windowsKillCommands(4242, profile)
    expect(commands[0]).toEqual(['taskkill.exe', ['/T', '/F', '/PID', '4242']])
    const [command, args] = commands[1]!
    expect(command).toBe('powershell.exe')
    expect(args.slice(0, 3)).toEqual(['-NoProfile', '-NonInteractive', '-EncodedCommand'])
    const script = decode(args)
    expect(script).toContain(`-Filter "CommandLine LIKE '%mechanica-shot-Ab12Cd%'"`)
    // Never PowerShell itself.
    expect(script).toContain('$_.ProcessId -ne $PID')
    expect(script).toContain('Stop-Process -Id $_.ProcessId -Force')
    // The profile name stays out of PowerShell's own command line.
    expect(args.join(' ')).not.toContain('mechanica-shot-Ab12Cd')
  })

  it('only sweeps the profile once the spawned process has exited', () => {
    const commands = windowsKillCommands(undefined, profile)
    expect(commands.map(([command]) => command)).toEqual(['powershell.exe'])
  })

  it('never puts an unexpected profile name into the query', () => {
    expect(windowsKillCommands(undefined, "C:\\Temp\\it's%odd")).toEqual([])
  })
})

describe('startFirstBrowser', () => {
  const chrome: BrowserExecutable = { label: 'Google Chrome', path: 'C:\\chrome.exe' }
  const edge: BrowserExecutable = { label: 'Microsoft Edge', path: 'C:\\msedge.exe' }

  it('returns the first browser that starts, trying them in order', async () => {
    const tried: string[] = []
    const result = await startFirstBrowser([chrome, edge], async (candidate) => {
      tried.push(candidate.label)
      return candidate.label
    })
    expect(result).toBe('Google Chrome')
    expect(tried).toEqual(['Google Chrome'])
  })

  it('falls through to the next candidate when one fails', async () => {
    const tried: string[] = []
    const result = await startFirstBrowser([chrome, edge], async (candidate) => {
      tried.push(candidate.label)
      if (candidate === chrome) throw new Error('browser exited early (code 0)')
      return candidate.label
    })
    expect(result).toBe('Microsoft Edge')
    expect(tried).toEqual(['Google Chrome', 'Microsoft Edge'])
  })

  it('names every candidate and its reason when none starts', async () => {
    const reasons = new Map([
      [chrome, 'no DevTools endpoint within 20000ms'],
      [edge, 'browser exited early (code 0)'],
    ])
    await expect(
      startFirstBrowser([chrome, edge], async (candidate) => {
        throw new Error(reasons.get(candidate))
      }),
    ).rejects.toThrow(
      'No browser could be started. Tried:\n' +
        '  Google Chrome (C:\\chrome.exe): no DevTools endpoint within 20000ms\n' +
        '  Microsoft Edge (C:\\msedge.exe): browser exited early (code 0)\n' +
        'Pass --browser <path-to-executable> to use another Chromium-based browser.',
    )
  })
})
