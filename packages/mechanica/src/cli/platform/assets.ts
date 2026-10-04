import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  isAssetName,
  readImageManifest,
  updateImageManifest,
  type ImageManifest,
  type ImageManifestEntry,
  type RemoteAssets,
} from '../../server/assets-store'
import { parseRemoteUrl, REMOTE_NAME, request, type PlatformSite } from './api'
import { getToken } from './credentials'
import { git } from './git'

/*
 * A linked project's uploads and the platform's. Uploads are not in git on the
 * platform: `mechanica push` sends the ones this project has and the platform
 * lacks, and the dev server (and `mechanica assets pull`) fetches the ones made
 * in the online editor. A name carries a hash of its content, so "the same
 * name" is "the same file" and nothing is ever compared or overwritten.
 */

/** A site this project can talk to: where it is, and as whom. */
export interface SiteLink {
  origin: string
  slug: string
  uuid: string
  token: string
}

/** An upload as the platform lists it. */
export interface RemoteAsset extends ImageManifestEntry {
  name: string
  size: number
  hash: string
}

const ASSETS_DIR = '.mech/assets'

/**
 * The site this project is linked to (the `mechanica` git remote) with the
 * saved token for it — or null when it is not linked, not logged in, or the
 * account has no access to the site. Never throws: an unlinked project is the
 * normal case for the dev server.
 */
export async function resolveLink(cwd: string): Promise<SiteLink | null> {
  try {
    const remote = await git(cwd, ['remote', 'get-url', REMOTE_NAME])
    const link = remote.code === 0 ? parseRemoteUrl(remote.stdout) : null
    if (!link) return null
    const token = await getToken(link.origin)
    if (!token) return null
    const sites = await request<PlatformSite[]>(link.origin, 'GET', '/api/sites', { token })
    const site = sites.find((item) => item.slug === link.slug)
    return site ? { ...link, uuid: site.uuid, token } : null
  } catch {
    return null
  }
}

/** The uploads the platform's store holds for the site. */
export const listRemoteAssets = (link: SiteLink): Promise<RemoteAsset[]> =>
  request<RemoteAsset[]>(link.origin, 'GET', `/api/sites/${link.uuid}/assets`, { token: link.token })

const fileUrl = (link: SiteLink, name: string) =>
  `${link.origin}/api/sites/${link.uuid}/assets/file?name=${encodeURIComponent(name)}`

/** One upload's bytes from the platform, or null when it has none of that name. */
export async function downloadRemoteAsset(link: SiteLink, name: string): Promise<Uint8Array | null> {
  const response = await fetch(fileUrl(link, name), { headers: { authorization: `Bearer ${link.token}` } })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Could not download ${name} (${response.status})`)
  return new Uint8Array(await response.arrayBuffer())
}

const imageInfoOf = ({ width, height, previewSrc }: ImageManifestEntry): ImageManifestEntry => ({
  ...(width ? { width } : {}),
  ...(height ? { height } : {}),
  ...(previewSrc ? { previewSrc } : {}),
})

/** The files in the project's uploads directory (flat: an upload is one file name). */
async function localAssets(cwd: string): Promise<string[]> {
  const dir = join(cwd, ASSETS_DIR)
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  return entries.filter((entry) => entry.isFile() && isAssetName(entry.name)).map((entry) => entry.name)
}

/** The uploads git already carries: those reach the platform with the push itself. */
async function trackedAssets(cwd: string): Promise<Set<string>> {
  const listed = await git(cwd, ['ls-files', '-z', '--', ASSETS_DIR])
  if (listed.code !== 0) return new Set()
  return new Set(
    listed.stdout
      .split('\0')
      .filter(Boolean)
      .map((path) => path.slice(ASSETS_DIR.length + 1)),
  )
}

/**
 * Send the platform the uploads this project has and it lacks — the files in
 * `.mech/assets` that are not committed (committed ones travel with git) — with
 * what `.mech/images.json` knows about them. Returns the names sent.
 */
export async function pushUploads(cwd: string, link: SiteLink, log: (message: string) => void = console.info): Promise<string[]> {
  const tracked = await trackedAssets(cwd)
  const candidates = (await localAssets(cwd)).filter((name) => !tracked.has(name))
  if (!candidates.length) return []

  const remote = new Set((await listRemoteAssets(link)).map((asset) => asset.name))
  const missing = candidates.filter((name) => !remote.has(name))
  if (!missing.length) return []

  log(`Uploading ${missing.length} file(s)…`)
  for (const name of missing) {
    const data = await readFile(join(cwd, ASSETS_DIR, name))
    await request(link.origin, 'POST', `/api/sites/${link.uuid}/assets/file?name=${encodeURIComponent(name)}`, {
      token: link.token,
      raw: new Uint8Array(data),
    })
  }

  const manifest = readImageManifest(join(cwd, '.mech'))
  const info: ImageManifest = {}
  for (const name of missing) if (manifest[name]) info[name] = manifest[name]
  if (Object.keys(info).length) {
    await request(link.origin, 'POST', `/api/sites/${link.uuid}/assets/info`, { token: link.token, body: info })
  }
  return missing
}

/**
 * Whether git ignores the project's uploads directory — i.e. whether a file
 * fetched into it stays out of `git status`. Decides if the dev server may
 * keep what it fetches (see `withRemoteAssets`).
 */
export async function uploadsIgnored(cwd: string): Promise<boolean> {
  return (await git(cwd, ['check-ignore', '-q', `${ASSETS_DIR}/probe.bin`]).catch(() => ({ code: 1 }))).code === 0
}

/**
 * The platform's uploads as the dev server sees them: resolved lazily, once —
 * a project that is not linked (or is offline) simply has none.
 */
export function remoteAssetsFor(cwd: string): RemoteAssets {
  let link: Promise<SiteLink | null> | null = null
  const linked = () => (link ??= resolveLink(cwd))
  // The listing carries every upload's image info; one request answers many names.
  let listing: { at: number; assets: Promise<RemoteAsset[]> } | null = null
  const assets = async (): Promise<RemoteAsset[]> => {
    const site = await linked()
    if (!site) return []
    if (!listing || Date.now() - listing.at > 30_000) {
      listing = { at: Date.now(), assets: listRemoteAssets(site).catch(() => []) }
    }
    return listing.assets
  }
  return {
    async fetch(name) {
      const site = await linked()
      if (!site) return null
      const data = await downloadRemoteAsset(site, name)
      if (!data) return null
      const entry = (await assets()).find((asset) => asset.name === name)
      return { data, ...(entry ? { info: imageInfoOf(entry) } : {}) }
    },
    list: async () => (await assets()).map((asset) => asset.name),
  }
}

/**
 * `mechanica assets pull` — download every upload the platform has and this
 * project lacks into `.mech/assets`, with its image info. What the dev server
 * does one file at a time, for all of them: before an offline session, a local
 * `mechanica export`, or leaving the platform. Returns the names downloaded.
 */
export async function runAssetsPull(options: { cwd?: string } = {}): Promise<string[]> {
  const cwd = options.cwd ?? process.cwd()
  const link = await resolveLink(cwd)
  if (!link) {
    throw new Error('This project is not linked to a site you can reach — run `mechanica login` and `mechanica link <slug>`')
  }
  const dir = join(cwd, ASSETS_DIR)
  const have = new Set(await localAssets(cwd))
  const missing = (await listRemoteAssets(link)).filter((asset) => isAssetName(asset.name) && !have.has(asset.name))
  if (!missing.length) {
    console.info('Nothing to download — every upload of the site is already here')
    return []
  }

  await mkdir(dir, { recursive: true })
  const info: ImageManifest = {}
  const done: string[] = []
  for (const asset of missing) {
    const data = await downloadRemoteAsset(link, asset.name)
    if (!data) continue
    await writeFile(join(dir, asset.name), data)
    const entry = imageInfoOf(asset)
    if (Object.keys(entry).length) info[asset.name] = entry
    done.push(asset.name)
    console.info(`✓ ${asset.name}`)
  }
  updateImageManifest(join(cwd, '.mech'), info)
  console.info(`Downloaded ${done.length} file(s) into ${ASSETS_DIR}`)
  if (!(await uploadsIgnored(cwd)) && (await stat(join(cwd, '.git')).catch(() => null))) {
    console.info(
      `Note: ${ASSETS_DIR} is not ignored by git, so these files show as changes. ` +
        'Uploads live on the platform — add `.mech/assets/` and `.mech/images.json` to .gitignore.',
    )
  }
  return done
}
