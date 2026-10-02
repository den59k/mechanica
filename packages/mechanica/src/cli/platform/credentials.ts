import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'

/** The hosted platform `mechanica login` / `link` / `push` talk to by default. */
export const DEFAULT_HOST = 'https://mechanica.jt3.ru'

/** Normalize a host argument to an origin (`https://example.com`, no trailing slash or path). */
export function hostOrigin(host: string | undefined): string {
  const value = host ?? process.env.MECHANICA_HOST ?? DEFAULT_HOST
  return new URL(/^https?:\/\//.test(value) ? value : `https://${value}`).origin
}

/** Where access tokens are kept: one file per user, outside any project. */
function credentialsFile(): string {
  return join(process.env.MECHANICA_CONFIG_DIR ?? join(os.homedir(), '.mechanica'), 'credentials.json')
}

async function readAll(): Promise<Record<string, string>> {
  try {
    const parsed = JSON.parse(await readFile(credentialsFile(), 'utf-8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * The access token for a platform origin: `MECHANICA_TOKEN` (CI) wins over the
 * one `mechanica login` saved.
 */
export async function getToken(origin: string): Promise<string | null> {
  if (process.env.MECHANICA_TOKEN) return process.env.MECHANICA_TOKEN
  return (await readAll())[origin] ?? null
}

/** Remember the token for an origin, in a file only the user can read. */
export async function saveToken(origin: string, token: string): Promise<string> {
  const file = credentialsFile()
  const all = await readAll()
  all[origin] = token
  await mkdir(join(file, '..'), { recursive: true })
  await writeFile(file, JSON.stringify(all, null, 2) + '\n', { mode: 0o600 })
  // An existing file keeps its old mode on write; tighten it either way.
  await chmod(file, 0o600).catch(() => {})
  return file
}
