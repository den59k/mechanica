import { mkdir, readFile, writeFile, chmod, rm } from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'

/** The hosted platform `mechanica login` / `link` / `push` talk to by default. */
export const DEFAULT_HOST = 'https://mechanica.jt3.ru'

/** Normalize a host argument to an origin (`https://example.com`, no trailing slash or path). */
export function hostOrigin(host: string | undefined): string {
  const value = host ?? process.env.MECHANICA_HOST ?? DEFAULT_HOST
  return new URL(/^https?:\/\//.test(value) ? value : `https://${value}`).origin
}

/** Where the CLI keeps what it knows about the user: one folder per user, outside any project. */
function configDir(): string {
  return process.env.MECHANICA_CONFIG_DIR ?? join(os.homedir(), '.mechanica')
}

/** Access tokens, by platform origin. */
const credentialsFile = () => join(configDir(), 'credentials.json')

/** Sign-ins started by `mechanica login` that wait for their approval, by platform origin. */
const pendingFile = () => join(configDir(), 'pending-logins.json')

async function readJson<T extends Record<string, unknown>>(file: string): Promise<T> {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf-8'))
    return parsed && typeof parsed === 'object' ? parsed : ({} as T)
  } catch {
    return {} as T
  }
}

/** Write one of the files, readable by the user alone. */
async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(join(file, '..'), { recursive: true })
  await writeFile(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
  // An existing file keeps its old mode on write; tighten it either way.
  await chmod(file, 0o600).catch(() => {})
}

/**
 * The access token for a platform origin: `MECHANICA_TOKEN` (CI) wins over the
 * one `mechanica login` saved.
 */
export async function getToken(origin: string): Promise<string | null> {
  if (process.env.MECHANICA_TOKEN) return process.env.MECHANICA_TOKEN
  return (await readJson<Record<string, string>>(credentialsFile()))[origin] ?? null
}

/** Remember the token for an origin, in a file only the user can read. */
export async function saveToken(origin: string, token: string): Promise<string> {
  const file = credentialsFile()
  const all = await readJson<Record<string, string>>(file)
  all[origin] = token
  await writeJson(file, all)
  return file
}

/**
 * A sign-in started by `mechanica login` and not yet approved in the browser.
 * The device code is the secret the platform hands the token to; the user
 * code is what the link carries. Kept so that the next command can finish
 * the sign-in once the link was approved — a coding agent runs `login`,
 * shows the link, and goes on with `link` or `push` after the user's click.
 */
export interface PendingLogin {
  deviceCode: string
  userCode: string
  verificationUrl: string
  /** ISO date: when the platform forgets the request. */
  expiresAt: string
  /** How often the platform wants to be asked, in seconds. */
  interval: number
}

/** The sign-in waiting for an origin, or null. An expired one is reported too: whoever reads it says so. */
export async function getPendingLogin(origin: string): Promise<PendingLogin | null> {
  const entry = (await readJson<Record<string, PendingLogin>>(pendingFile()))[origin]
  return entry && typeof entry.deviceCode === 'string' && typeof entry.verificationUrl === 'string' ? entry : null
}

/** Keep a started sign-in for an origin (replacing an earlier one). */
export async function savePendingLogin(origin: string, login: PendingLogin): Promise<void> {
  const file = pendingFile()
  const all = await readJson<Record<string, PendingLogin>>(file)
  all[origin] = login
  await writeJson(file, all)
}

/** Forget the sign-in waiting for an origin — it was finished, denied or has expired. */
export async function clearPendingLogin(origin: string): Promise<void> {
  const file = pendingFile()
  const all = await readJson<Record<string, PendingLogin>>(file)
  if (!(origin in all)) return
  delete all[origin]
  if (Object.keys(all).length) await writeJson(file, all)
  else await rm(file, { force: true })
}
