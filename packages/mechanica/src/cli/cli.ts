import { parseArgs } from './args'
import { runBuild } from './build'
import { runExport } from './run-export'
import { runImages } from './images'
import { runMigrate } from './migrate'
import { runAssetsPull } from './platform/assets'
import { runLink } from './platform/link'
import { runLogin } from './platform/login'
import { runPush } from './platform/push'
import { runShot } from './shot'
import { runThumbs, runBlockThumbs } from './thumbs'

const HELP = `mechanica — build Vue 3 sites with a visual block editor

Usage:
  mechanica build           Build the client + SSR bundles into dist/
                            (--editor also builds dist/mechanica-editor/: the
                             site with the editor overlay, for a host that
                             serves editing without the dev server)
  mechanica export          Build, then statically render every page into export/
                            (a site url — the plugin's siteUrl option or
                             --site-url <origin> — also turns on the automatic
                             SEO tags and emits sitemap.xml + robots.txt;
                             --site-name <name> adds WebSite JSON-LD;
                             --assets-url <origin> serves /assets and /media from
                             a CDN base — files still land in export/)
  mechanica login           Sign in to the Mechanica platform and save an access
                            token for this machine (--host <url>, --token <token>)
  mechanica link <slug>     Point this repository at a site on the platform
                            (--create makes the site, --name "Site name")
  mechanica push            Publish the committed project: pull what was edited
                            online, git push, build + upload the bundle when the
                            code changed, and wait for the deploy
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
  mechanica images          Generate image metadata (dimensions + blur-up
                            previews) for .mech/assets into .mech/images.json —
                            for pages authored without the browser editor
                            (needs the optional sharp dependency; --force redoes all)
  mechanica assets pull     Download the site's uploads this project lacks into
                            .mech/assets (the dev server fetches them one by one
                            on demand; this gets all of them — for working offline
                            or a local export)
  mechanica migrate         Bring .mech content up to the current format: uploads
                            are referenced as /media/<file> (was /@mechanica/assets/)
`

/** CLI entry: dispatch a command to its handler. */
export async function run(argv: string[]): Promise<void> {
  const { command, args, flags } = parseArgs(argv)
  const str = (value: string | boolean | undefined): string | undefined =>
    typeof value === 'string' ? value : undefined

  switch (command) {
    case 'build':
      return runBuild({ editor: flags.editor === true })
    case 'export':
      return runExport({
        siteUrl: str(flags['site-url']),
        siteName: str(flags['site-name']),
        assetsUrl: str(flags['assets-url']),
      })
    case 'images':
      return runImages({ force: flags.force === true })
    case 'assets':
      if (args[0] !== 'pull') throw new Error('Usage: mechanica assets pull')
      return void (await runAssetsPull())
    case 'migrate':
      return void (await runMigrate())
    case 'login':
      return runLogin({ host: str(flags.host), token: str(flags.token) })
    case 'link':
      return runLink(args[0], { host: str(flags.host), create: flags.create === true, name: str(flags.name) })
    case 'push':
      return runPush()
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
