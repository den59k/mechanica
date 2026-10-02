import { spawn } from 'node:child_process'

export interface GitResult {
  code: number
  stdout: string
  stderr: string
}

/**
 * Environment that makes git send the access token to one origin only, as HTTP
 * Basic credentials. Passed through `GIT_CONFIG_*` variables so the token never
 * appears on a command line (visible to other processes) or in the repo config.
 */
export function gitAuthEnv(origin: string, token: string): Record<string, string> {
  const basic = Buffer.from(`mechanica:${token}`).toString('base64')
  return {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: `http.${origin}/.extraHeader`,
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}`,
    // Never fall back to an interactive prompt: a rejected token is an error to report.
    GIT_TERMINAL_PROMPT: '0',
  }
}

/** Run git in `cwd` and collect its output; never throws on a non-zero exit. */
export function git(cwd: string, args: string[], env: Record<string, string> = {}): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, env: { ...process.env, ...env }, windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', (error: NodeJS.ErrnoException) =>
      reject(error.code === 'ENOENT' ? new Error('git is not installed (or not on PATH)') : error),
    )
    child.on('close', (code) => resolve({ code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() }))
  })
}

/** Like {@link git}, but a non-zero exit throws with git's own message. */
export async function gitOk(cwd: string, args: string[], env: Record<string, string> = {}): Promise<string> {
  const result = await git(cwd, args, env)
  if (result.code !== 0) throw new Error(result.stderr || result.stdout || `git ${args[0]} failed`)
  return result.stdout
}
