import os from 'node:os'
import readline from 'node:readline'
import { request } from './api'
import { hostOrigin, saveToken } from './credentials'

/** Ask one line on the terminal; with `hidden`, the typed characters are not echoed. */
function prompt(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    if (hidden) {
      // readline echoes through this method; once the question is out, swallow the rest.
      const write = (rl as any)._writeToOutput.bind(rl)
      let asked = false
      ;(rl as any)._writeToOutput = (text: string) => {
        if (!asked) write(text)
        asked = true
      }
    }
    rl.question(question, (answer) => {
      rl.close()
      if (hidden) process.stdout.write('\n')
      resolve(answer.trim())
    })
  })
}

/**
 * `mechanica login`: sign in to the platform and keep an access token for this
 * machine. With `--token` the given token is stored as is (CI, or a token made
 * in the dashboard); otherwise it asks for email + password and creates one.
 */
export async function runLogin(options: { host?: string; token?: string }): Promise<void> {
  const origin = hostOrigin(options.host)
  let token = options.token

  if (!token) {
    if (!process.stdin.isTTY) {
      throw new Error('No terminal to ask for credentials — pass --token <access token>')
    }
    console.info(`Signing in to ${origin}`)
    const login = await prompt('Email: ')
    const password = await prompt('Password: ', true)
    const session = await request<{ accessToken: string }>(origin, 'POST', '/api/account/login', {
      body: { login, password },
    })
    const created = await request<{ token: string }>(origin, 'POST', '/api/account/tokens', {
      token: session.accessToken,
      body: { name: `CLI on ${os.hostname()}` },
    })
    token = created.token
  }

  // Prove the token works before saving it.
  const account = await request<{ email: string }>(origin, 'GET', '/api/account', { token })
  const file = await saveToken(origin, token)
  console.info(`Logged in to ${origin} as ${account.email}`)
  console.info(`Access token saved to ${file}`)
}
