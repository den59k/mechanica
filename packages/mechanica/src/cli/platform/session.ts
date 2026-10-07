import os from 'node:os'
import { PlatformError, request } from './api'
import {
  clearPendingLogin,
  getPendingLogin,
  getToken,
  savePendingLogin,
  saveToken,
  type PendingLogin,
} from './credentials'

/**
 * Signing in from the browser — the device flow (RFC 8628, as `gh auth login`
 * does it). The CLI asks the platform for a sign-in request and prints a link;
 * the user opens it (signing in or registering on the way), sees what asks for
 * access and approves; the CLI collects an access token with the request's
 * device code. Nothing of the user's — no password, no token — ever goes
 * through the terminal, which is what makes it work from a coding agent's
 * chat: the agent shows the link, the user clicks, the agent goes on.
 *
 * The CLI does not have to wait: a started request is kept (`PendingLogin`),
 * and {@link requireToken} — behind every command that needs the platform —
 * finishes the sign-in the first time it runs after the approval. An expired
 * or denied request is reported, never restarted on its own.
 */

/** What the platform answers a started request with. */
interface DeviceLoginStart {
  deviceCode: string
  userCode: string
  verificationUrl: string
  expiresAt: string
  interval?: number
}

/** Start a sign-in: the platform makes a request, its codes are kept for this origin. */
export async function startDeviceLogin(origin: string): Promise<PendingLogin> {
  const started = await request<DeviceLoginStart>(origin, 'POST', '/api/account/device', {
    body: { name: `CLI on ${os.hostname()}` },
  })
  const pending: PendingLogin = {
    deviceCode: started.deviceCode,
    userCode: started.userCode,
    verificationUrl: started.verificationUrl,
    expiresAt: new Date(started.expiresAt).toISOString(),
    interval: Math.max(1, Number(started.interval) || 3),
  }
  await savePendingLogin(origin, pending)
  return pending
}

/** What the user is shown: the link, and how long it stays open. */
export function describeDeviceLogin(origin: string, pending: PendingLogin): string {
  const minutes = Math.max(1, Math.round((Date.parse(pending.expiresAt) - Date.now()) / 60_000))
  return [
    `To sign in to ${origin}, open this link and approve the request:`,
    '',
    `  ${pending.verificationUrl}`,
    '',
    `The link is valid for ${minutes} minute${minutes === 1 ? '' : 's'}.`,
  ].join('\n')
}

export type DeviceLoginOutcome =
  | { status: 'pending' }
  | { status: 'approved'; token: string }
  | { status: 'denied' }
  | { status: 'expired' }

/** Ask the platform once whether the request was answered. */
export async function checkDeviceLogin(origin: string, pending: PendingLogin): Promise<DeviceLoginOutcome> {
  try {
    const answer = await request<{ status?: string; token?: string }>(origin, 'POST', '/api/account/device/token', {
      body: { deviceCode: pending.deviceCode },
    })
    if (answer?.status === 'approved' && typeof answer.token === 'string') return { status: 'approved', token: answer.token }
    if (answer?.status === 'denied') return { status: 'denied' }
    return { status: 'pending' }
  } catch (error) {
    // The platform forgets a request once it expires (or was collected): gone is gone.
    if (error instanceof PlatformError && error.status === 404) return { status: 'expired' }
    throw error
  }
}

/**
 * Finish a started sign-in if it was answered: save the token and say who
 * signed in. Null while the request still waits. A denied or expired request
 * is forgotten and reported — the user runs `mechanica login` for a new link.
 */
export async function completeDeviceLogin(origin: string, pending: PendingLogin): Promise<string | null> {
  const outcome = await checkDeviceLogin(origin, pending)
  if (outcome.status === 'pending') return null
  await clearPendingLogin(origin)
  if (outcome.status === 'denied') {
    throw new Error(`The sign-in request for ${origin} was denied in the browser. Run \`mechanica login\` for a new link.`)
  }
  if (outcome.status === 'expired') {
    throw new Error(
      `The sign-in link for ${origin} has expired (a link is valid for ten minutes). Run \`mechanica login\` for a new link.`,
    )
  }
  const account = await request<{ email: string }>(origin, 'GET', '/api/account', { token: outcome.token })
  const file = await saveToken(origin, outcome.token)
  console.info(`Signed in to ${origin} as ${account.email}`)
  console.info(`Access token saved to ${file}`)
  return outcome.token
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Wait for the approval, asking the platform every `interval` seconds until it comes or the link expires. */
export async function waitForDeviceLogin(origin: string, pending: PendingLogin): Promise<string> {
  for (;;) {
    const token = await completeDeviceLogin(origin, pending)
    if (token) return token
    await sleep(pending.interval * 1000)
  }
}

/**
 * The token for `origin`: the saved one, or — when `mechanica login` printed
 * a link that has been approved since — the one the platform now hands over.
 * Otherwise an error that says what to do next.
 */
export async function requireToken(origin: string): Promise<string> {
  const token = await getToken(origin)
  if (token) return token
  const pending = await getPendingLogin(origin)
  if (pending) {
    const collected = await completeDeviceLogin(origin, pending)
    if (collected) return collected
    throw new Error(
      `Not signed in to ${origin} yet — open ${pending.verificationUrl} and approve the request, then run this command again`,
    )
  }
  throw new Error(`Not logged in to ${origin} — run \`mechanica login\` first`)
}
