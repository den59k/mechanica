import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

interface FileEntry {
  type: 'file' | 'folder'
  name: string
  size?: number
  mtime: number
  offset?: number
  length?: number
  children?: FileEntry[]
}

/**
 * Upload a built project to a backend. Preserves v1's binary body format
 * (a JSON tree header + concatenated file buffers) so the existing backend
 * keeps working; the contract is redesigned later with the SAAS service.
 */
export async function runPush(options: { key?: string; host?: string; dir?: string }): Promise<void> {
  const apiKey = options.key ?? process.env.BUILDER_API_KEY
  const host = options.host ?? process.env.BUILDER_HOST ?? 'https://builder.jt3.ru'
  if (!apiKey) {
    console.error('[mechanica push] missing --key (or BUILDER_API_KEY)')
    process.exitCode = 1
    return
  }

  const root = join(process.cwd(), options.dir ?? 'dist')
  const buffers: Buffer[] = []
  let written = 0

  const walk = async (dir: string): Promise<FileEntry[]> => {
    const result: FileEntry[] = []
    for (const name of await readdir(dir)) {
      const full = join(dir, name)
      const info = await stat(full)
      if (info.isDirectory()) {
        result.push({ type: 'folder', name, mtime: info.mtimeMs, children: await walk(full) })
      } else {
        const file = await readFile(full)
        result.push({ type: 'file', name, size: info.size, mtime: info.mtimeMs, offset: written, length: file.byteLength })
        buffers.push(file)
        written += file.byteLength
      }
    }
    return result
  }

  const tree = await walk(root)
  const header = Buffer.from(JSON.stringify(tree), 'utf-8')
  const controls = new Uint32Array([header.length, written])
  const body = Buffer.concat([Buffer.from(controls.buffer), header, ...buffers])

  console.info(`Pushing ${root} → ${host}…`)
  const response = await fetch(`${host}/api/projects/push`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/octet-stream' },
    body,
  })

  const text = await response.text()
  if (!response.ok) throw new Error(`Push failed (${response.status}): ${text}`)
  console.info('Project pushed successfully.', text)
}
