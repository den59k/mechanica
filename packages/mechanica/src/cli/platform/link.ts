import { PlatformError, REMOTE_NAME, request, requireToken, type PlatformSite } from './api'
import { hostOrigin } from './credentials'
import { appendFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { git, gitOk } from './git'

/**
 * `mechanica link <slug>`: attach this project to a site on the platform by
 * pointing the `mechanica` git remote at it. With `--create` the site is made
 * first. The remote is the whole link — `mechanica push` reads the platform
 * origin and the site from its URL, so there is no extra config file.
 */
export async function runLink(
  slug: string | undefined,
  options: { host?: string; create?: boolean; name?: string },
): Promise<void> {
  if (!slug) throw new Error('Usage: mechanica link <slug> [--create] [--name "Site name"]')
  const cwd = process.cwd()
  const origin = hostOrigin(options.host)
  const token = await requireToken(origin)

  if ((await git(cwd, ['rev-parse', '--is-inside-work-tree'])).code !== 0) {
    throw new Error('This folder is not a git repository — run `git init` first')
  }

  const sites = await request<PlatformSite[]>(origin, 'GET', '/api/sites', { token })
  let site = sites.find((item) => item.slug === slug)

  if (!site) {
    if (!options.create) {
      const known = sites.length ? `Your sites: ${sites.map((item) => item.slug).join(', ')}.` : 'You have no sites yet.'
      throw new Error(`No site "${slug}" on ${origin}. ${known} Pass --create to make it.`)
    }
    try {
      site = await request<PlatformSite>(origin, 'POST', '/api/sites', {
        token,
        body: { slug, name: options.name ?? slug },
      })
    } catch (error) {
      if (error instanceof PlatformError) throw new Error(`Could not create "${slug}": ${error.message}`)
      throw error
    }
    console.info(`Created site ${site.slug}`)
  }

  const existing = await git(cwd, ['remote', 'get-url', REMOTE_NAME])
  if (existing.code === 0) await gitOk(cwd, ['remote', 'set-url', REMOTE_NAME, site.gitUrl])
  else await gitOk(cwd, ['remote', 'add', REMOTE_NAME, site.gitUrl])

  console.info(`Linked to ${site.slug} (${site.gitUrl})`)
  await ignoreUploads(cwd)
  console.info('Commit your work, then run `mechanica push` to deploy it.')
}

/** What a linked project keeps out of git: uploads live on the platform. */
const UPLOAD_IGNORES = ['.mech/assets/', '.mech/images.json']

/**
 * A linked project's uploads live on the platform, not in git: `push` sends
 * the files, the dev server fetches the ones made online. Make git ignore the
 * local copies, so a fetched file is never an uncommitted change. Uploads that
 * are already committed stay committed (git keeps tracking them) and keep
 * working — the hint says how to move them over.
 */
export async function ignoreUploads(cwd: string): Promise<void> {
  const file = join(cwd, '.gitignore')
  const current = await readFile(file, 'utf-8').catch(() => '')
  const lines = new Set(current.split(/\r?\n/).map((line) => line.trim()))
  const missing = UPLOAD_IGNORES.filter((entry) => !lines.has(entry) && !lines.has(entry.replace(/\/$/, '')))
  if (missing.length) {
    const block = `${current && !current.endsWith('\n') ? '\n' : ''}\n# Uploads live on the platform (mechanica push sends them, the dev server fetches them)\n${missing.join('\n')}\n`
    await appendFile(file, block)
    console.info(`Added ${missing.join(' and ')} to .gitignore — uploads are kept by the platform, not by git.`)
  }

  const tracked = await git(cwd, ['ls-files', '--', '.mech/assets', '.mech/images.json'])
  if (tracked.code === 0 && tracked.stdout) {
    console.info(
      'Uploads already committed in this repository keep working. To move them to the platform:\n' +
        '  git rm -r --cached .mech/assets .mech/images.json && git commit -m "Uploads live on the platform"',
    )
  }
}
