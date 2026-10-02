import { PlatformError, REMOTE_NAME, request, requireToken, type PlatformSite } from './api'
import { hostOrigin } from './credentials'
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
  console.info('Commit your work, then run `mechanica push` to deploy it.')
}
