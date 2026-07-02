import { parseArgs } from './args'
import { runBuild } from './build'
import { runExport } from './export'
import { runPush } from './push'
import { runShot } from './shot'

const HELP = `mechanica — build Vue 3 sites with a visual block editor

Usage:
  mechanica build           Build the client + SSR bundles into dist/
  mechanica export          Build, then statically render every page into export/
  mechanica push [--key]    Upload dist/ to a backend (--key, --host, --dir)
  mechanica shot <blockId>  Screenshot one block via the dev preview route
                            (--data <json|@file>, --width 1440,768, --out <path>,
                             --server <url>, --browser <path>, --full)
`

/** CLI entry: dispatch a command to its handler. */
export async function run(argv: string[]): Promise<void> {
  const { command, args, flags } = parseArgs(argv)
  const str = (value: string | boolean | undefined): string | undefined =>
    typeof value === 'string' ? value : undefined

  switch (command) {
    case 'build':
      return runBuild()
    case 'export':
      return runExport()
    case 'push':
      return runPush({ key: str(flags.key), host: str(flags.host), dir: str(flags.dir) })
    case 'shot':
      return runShot(args[0], {
        data: str(flags.data),
        width: str(flags.width),
        out: str(flags.out),
        server: str(flags.server),
        browser: str(flags.browser),
        full: flags.full === true,
      })
    default:
      console.info(HELP)
  }
}
