import { parseArgs } from './args'
import { runBuild } from './build'
import { runExport } from './export'
import { runPush } from './push'
import { runShot } from './shot'
import { runThumbs, runBlockThumbs } from './thumbs'

const HELP = `mechanica — build Vue 3 sites with a visual block editor

Usage:
  mechanica build           Build the client + SSR bundles into dist/
  mechanica export          Build, then statically render every page into export/
                            (a site url — the plugin's siteUrl option or
                             --site-url <origin> — also turns on the automatic
                             SEO tags and emits sitemap.xml + robots.txt;
                             --site-name <name> adds WebSite JSON-LD)
  mechanica push [--key]    Upload dist/ to a backend (--key, --host, --dir)
  mechanica shot <blockId>  Screenshot one block via the dev preview route
  mechanica shot </path>    Screenshot a whole page (editor overlay stripped)
                            (--page </path>, --data <json|@file>, --width 1440,768,
                             --out <path>, --server <url>, --browser <path>, --full)
  mechanica thumbs [/path]  Thumbnail every page (or those under /path) into
                            .mech/thumbs/ for the editor's page browser
                            (--out <dir>, --server <url>, --browser <path>)
  mechanica thumbs --blocks [id]
                            Thumbnail every block (or ids starting with [id])
                            into .mech/thumbs/blocks/ for the palette cards
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
      return runExport({ siteUrl: str(flags['site-url']), siteName: str(flags['site-name']) })
    case 'push':
      return runPush({ key: str(flags.key), host: str(flags.host), dir: str(flags.dir) })
    case 'shot':
      return runShot(args[0], {
        page: str(flags.page),
        data: str(flags.data),
        width: str(flags.width),
        out: str(flags.out),
        server: str(flags.server),
        browser: str(flags.browser),
        full: flags.full === true,
      })
    case 'thumbs': {
      const thumbsOptions = { out: str(flags.out), server: str(flags.server), browser: str(flags.browser) }
      // `--blocks` alone switches mode; `--blocks <id>` also narrows the target
      // (the parser reads a bare value after a flag as that flag's value).
      if (flags.blocks) return runBlockThumbs(str(flags.blocks) ?? args[0], thumbsOptions)
      return runThumbs(args[0], thumbsOptions)
    }
    default:
      console.info(HELP)
  }
}
