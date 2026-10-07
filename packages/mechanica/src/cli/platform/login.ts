import { request } from './api'
import { hostOrigin, saveToken } from './credentials'
import { describeDeviceLogin, startDeviceLogin, waitForDeviceLogin } from './session'

/**
 * `mechanica login`: sign in to the platform and keep an access token for this
 * machine. With `--token` the given token is stored as is (CI, or a token made
 * in the dashboard). Otherwise the sign-in happens in the browser (see
 * `session.ts`): a link is printed, and the token arrives once it is approved.
 *
 * In a terminal the command waits for the approval. Without one — a coding
 * agent runs it, and shows its output only once it has ended — it prints the
 * link and returns: the next `mechanica link` / `push` finishes the sign-in.
 * `--wait` / `--no-wait` decide either way.
 */
export async function runLogin(options: { host?: string; token?: string; wait?: boolean }): Promise<void> {
  const origin = hostOrigin(options.host)

  if (options.token) {
    // Prove the token works before saving it.
    const account = await request<{ email: string }>(origin, 'GET', '/api/account', { token: options.token })
    const file = await saveToken(origin, options.token)
    console.info(`Logged in to ${origin} as ${account.email}`)
    console.info(`Access token saved to ${file}`)
    return
  }

  const pending = await startDeviceLogin(origin)
  console.info(describeDeviceLogin(origin, pending))
  console.info('')

  const wait = options.wait ?? process.stdin.isTTY === true
  if (!wait) {
    console.info(
      'Once it is approved, run `mechanica link <slug>` or `mechanica push`: the next command finishes the sign-in.\n' +
        'Working through a coding agent? Show the link to the person you work for, and go on when they say it is approved.',
    )
    return
  }

  console.info('Waiting for the approval in the browser… (Ctrl+C to stop; the next `mechanica` command would finish the sign-in)')
  await waitForDeviceLogin(origin, pending)
}
