import { parseArgs } from './args'
import { runBuild } from './build'
import { runExport } from './export'
import { runPush } from './push'

const HELP = `mechanica — build Vue 3 sites with a visual block editor

Usage:
  mechanica build           Build the client + SSR bundles into dist/
  mechanica export          Build, then statically render every page into export/
  mechanica push [--key]    Upload dist/ to a backend (--key, --host, --dir)
`

/** CLI entry: dispatch a command to its handler. */
export async function run(argv: string[]): Promise<void> {
  const { command, flags } = parseArgs(argv)

  switch (command) {
    case 'build':
      return runBuild()
    case 'export':
      return runExport()
    case 'push':
      return runPush({
        key: typeof flags.key === 'string' ? flags.key : undefined,
        host: typeof flags.host === 'string' ? flags.host : undefined,
        dir: typeof flags.dir === 'string' ? flags.dir : undefined,
      })
    default:
      console.info(HELP)
  }
}
