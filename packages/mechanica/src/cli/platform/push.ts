import { realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { runBuild } from '../build'
import { parseRemoteUrl, REMOTE_NAME, request, type PlatformSite } from './api'
import { requireToken } from './session'
import { pushUploads } from './assets'
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
  /** The branch the status is of; absent on a platform from before branches. */
  branch?: string | null
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
 * Why a branch cannot be pushed under its name, or null when it can. On the platform a branch
 * is served at an address of its own (`<slug>--<branch>`), so its name must be able to be part
 * of one: lowercase letters, digits and single hyphens. The platform checks the same (and how
 * long the name may be for the site) — this only says it before anything is sent.
 */
export function branchProblem(name: string): string | null {
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(name) || name.length > 40 || name.includes('--') || name === 'edit') {
    return (
      `The branch "${name}" cannot be pushed under this name: on the platform a branch's name becomes part of ` +
      'its address, so it is up to 40 lowercase letters, digits and single hyphens (and not "edit"). ' +
      'Rename it — `git branch -m new-name` — and push again.'
    )
  }
  return null
}

/**
 * `mechanica push`: publish the committed project to the platform — the branch that is checked
 * out, under its own name. The first branch a site is pushed becomes the site itself; any
 * other is deployed to an address of its own, with its own online editor, and never touches
 * the site.
 *
 *   1. bring in what was published online since the last pull (`pull --rebase`),
 *   2. send the uploads the platform lacks (they are not in git), then `git push`
 *      the commits to the site's repository,
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

  const current = await git(cwd, ['symbolic-ref', '--quiet', '--short', 'HEAD'])
  if (current.code !== 0 || !current.stdout) {
    throw new Error('No branch is checked out (a detached HEAD) — switch to the branch you want to push')
  }
  const branch = current.stdout
  const problem = branchProblem(branch)
  if (problem) throw new Error(problem)
  const ref = `refs/heads/${branch}`
  const query = `?branch=${encodeURIComponent(branch)}`

  // 1. Content published online lives on the remote's branch; put our commits on top of it.
  const remoteHead = await gitOk(cwd, ['ls-remote', '--heads', REMOTE_NAME, ref], auth)
  if (remoteHead) {
    console.info('Pulling changes from the platform…')
    const pulled = await git(cwd, ['pull', '--rebase', REMOTE_NAME, branch], auth)
    if (pulled.code !== 0) {
      throw new Error(
        `Could not rebase onto the platform's changes:\n${pulled.stderr || pulled.stdout}\n` +
          'Resolve the conflict (`git rebase --continue`), then run `mechanica push` again.',
      )
    }
  }

  // 2. Uploads first: the push starts a deploy, and its pages refer to them.
  await pushUploads(cwd, { ...link, uuid: site.uuid, token })

  const head = await gitOk(cwd, ['rev-parse', 'HEAD'])
  console.info(`Pushing ${head.slice(0, 8)} to ${link.slug} (${branch})…`)
  const pushed = await git(cwd, ['push', REMOTE_NAME, `HEAD:${ref}`], auth)
  if (pushed.code !== 0) throw new Error(`git push failed:\n${pushed.stderr || pushed.stdout}`)

  // 3.
  const statusPath = `/api/sites/${site.uuid}/status${query}`
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
      `/api/sites/${site.uuid}/bundles${query}`,
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
  console.info(`\n${branch} is live at ${deploy.url ?? status.url} — ${deploy.pages} page(s)`)
}
