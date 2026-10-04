import { realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { runBuild } from '../build'
import { parseRemoteUrl, REMOTE_NAME, request, requireToken, type PlatformSite } from './api'
import { packBundle } from './bundle-format'
import { engineVersion } from './engine-version'
import { git, gitAuthEnv, gitOk } from './git'

interface DeployInfo {
  id: number
  status: 'rendering' | 'live' | 'failed' | 'superseded'
  bundleCommit: string
  contentCommit: string
  pages: number | null
  error: string | null
  warnings?: string[] | null
  log?: string | null
  url?: string
}

interface SiteStatus {
  url: string
  head: string | null
  needsBundle: boolean
  latestDeploy: DeployInfo | null
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const POLL_MS = 1000
const DEPLOY_TIMEOUT_MS = 5 * 60 * 1000
// A content-only push is deployed by the platform itself, a moment after git returns.
const AUTO_DEPLOY_WAIT_MS = 10_000

/**
 * `mechanica push`: publish the committed project to the platform.
 *
 *   1. bring in what was published online since the last pull (`pull --rebase`),
 *   2. `git push` the commits to the site's repository,
 *   3. if the code changed, build locally and upload the bundle for that commit
 *      (content-only pushes reuse the bundle already there — no build at all),
 *   4. wait for the deploy and report it.
 *
 * The build runs on this machine; the platform only ever renders the bundle.
 */
export async function runPush(): Promise<void> {
  const cwd = process.cwd()

  if ((await git(cwd, ['rev-parse', '--is-inside-work-tree'])).code !== 0) {
    throw new Error('This folder is not a git repository — run `git init`, commit, then `mechanica link <slug>`')
  }
  // The platform reads `.mech/` from the repository root, so that is where the project must be.
  const top = await realpath(await gitOk(cwd, ['rev-parse', '--show-toplevel']))
  if (top !== (await realpath(cwd))) {
    throw new Error(`Run \`mechanica push\` from the repository root (${top}) — the site must be the whole repository`)
  }

  const remote = await git(cwd, ['remote', 'get-url', REMOTE_NAME])
  const link = remote.code === 0 ? parseRemoteUrl(remote.stdout) : null
  if (!link) throw new Error('This project is not linked to a site — run `mechanica link <slug>` first')
  const token = await requireToken(link.origin)
  const auth = gitAuthEnv(link.origin, token)

  const sites = await request<PlatformSite[]>(link.origin, 'GET', '/api/sites', { token })
  const site = sites.find((item) => item.slug === link.slug)
  if (!site) throw new Error(`You have no access to the site "${link.slug}" on ${link.origin}`)

  if ((await git(cwd, ['rev-parse', '--verify', '--quiet', 'HEAD'])).code !== 0) {
    throw new Error('Nothing to push yet — commit your project first')
  }
  // The bundle is tagged with the commit it was built from; uncommitted changes would make
  // that a lie (and a rebase refuses a dirty tree anyway).
  const dirty = await gitOk(cwd, ['status', '--porcelain'])
  if (dirty) {
    throw new Error(`Commit or stash your changes first — the working tree is not clean:\n${dirty}`)
  }

  // 1. Content published online lives on the remote's main; put our commits on top of it.
  const remoteHead = await gitOk(cwd, ['ls-remote', '--heads', REMOTE_NAME, 'main'], auth)
  if (remoteHead) {
    console.info('Pulling changes from the platform…')
    const pulled = await git(cwd, ['pull', '--rebase', REMOTE_NAME, 'main'], auth)
    if (pulled.code !== 0) {
      throw new Error(
        `Could not rebase onto the platform's changes:\n${pulled.stderr || pulled.stdout}\n` +
          'Resolve the conflict (`git rebase --continue`), then run `mechanica push` again.',
      )
    }
  }

  // 2.
  const head = await gitOk(cwd, ['rev-parse', 'HEAD'])
  console.info(`Pushing ${head.slice(0, 8)} to ${link.slug}…`)
  const pushed = await git(cwd, ['push', REMOTE_NAME, 'HEAD:refs/heads/main'], auth)
  if (pushed.code !== 0) throw new Error(`git push failed:\n${pushed.stderr || pushed.stdout}`)

  // 3.
  const statusPath = `/api/sites/${site.uuid}/status`
  let status = await request<SiteStatus>(link.origin, 'GET', statusPath, { token })
  let deployId: number | null = null

  if (status.needsBundle) {
    // With the editor build: the platform serves the online editor from the bundle.
    await runBuild({ editor: true })
    const body = await packBundle(join(cwd, 'dist'), { commit: head, engine: engineVersion() })
    console.info(`Uploading the bundle (${(body.length / 1024 / 1024).toFixed(1)} MB)…`)
    const uploaded = await request<{ deployId: number | null; reason?: string }>(
      link.origin,
      'POST',
      `/api/sites/${site.uuid}/bundles`,
      { token, raw: body },
    )
    if (uploaded.deployId === null) throw new Error(`The bundle was not deployed: ${uploaded.reason}`)
    deployId = uploaded.deployId
  } else {
    console.info('Only content changed — the platform reuses the current bundle.')
    const deadline = Date.now() + AUTO_DEPLOY_WAIT_MS
    while (status.latestDeploy?.contentCommit !== head && Date.now() < deadline) {
      await sleep(POLL_MS / 2)
      status = await request<SiteStatus>(link.origin, 'GET', statusPath, { token })
    }
    if (status.latestDeploy?.contentCommit !== head) {
      throw new Error('The platform did not start a deploy for this push — try `mechanica push` again')
    }
    deployId = status.latestDeploy.id
  }

  // 4.
  const deployPath = `/api/sites/${site.uuid}/deploys/${deployId}`
  const deadline = Date.now() + DEPLOY_TIMEOUT_MS
  let deploy = await request<DeployInfo>(link.origin, 'GET', deployPath, { token })
  if (deploy.status === 'rendering') console.info('Rendering…')
  while (deploy.status === 'rendering') {
    if (Date.now() > deadline) throw new Error('Timed out waiting for the deploy — check the site later')
    await sleep(POLL_MS)
    deploy = await request<DeployInfo>(link.origin, 'GET', deployPath, { token })
  }

  for (const warning of deploy.warnings ?? []) console.warn(warning)

  if (deploy.status === 'failed') {
    if (deploy.log) console.error(`\n${deploy.log}\n`)
    throw new Error(`Deploy failed: ${deploy.error ?? 'unknown error'}. The previous version stays live.`)
  }
  console.info(`\nLive at ${deploy.url ?? status.url} — ${deploy.pages} page(s)`)
}
