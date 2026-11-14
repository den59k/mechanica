import { parseArgs, flagValues } from './args'
import { runBuild } from './build'
import { runComments } from './comments'
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
  mechanica login           Sign in to the Mechanica platform: prints a link to
                            open and approve in the browser, and keeps the access
                            token for this machine. In a terminal it waits for the
                            approval; otherwise the next link/push finishes the
                            sign-in (--wait, --no-wait, --host <url>, or
                            --token <token> to store a token made in the dashboard)
  mechanica link <slug>     Point this repository at a site on the platform
                            (--create makes the site, --name "Site name")
  mechanica push            Publish the committed project: pull what was edited
                            online, git push, build + upload the bundle when the
                            code changed, and wait for the deploy. Pushes the
                            branch that is checked out: the first one pushed is
                            the site, any other gets an address of its own
  mechanica shot <blockId>  Screenshot one block via the dev preview route
  mechanica shot </path>    Screenshot a whole page (editor overlay stripped)
  mechanica shot <url | file.html>
                            Screenshot any URL or local HTML file (a design
                            handoff) the same way, without a dev server
                            (--page </path>, --data <json|@file>, --width 1440,768,
                             --section <css> (repeatable: one PNG per section;
                             looks inside open shadow roots, "host >>> inner"
                             crosses one; #name also finds [data-block-id=name]),
                             --scroll <px[,px…]> (viewport after scrolling),
                             --mark <x,y> (with --section: a ring at that point of
                             the section, as 0–1 fractions of its width and height),
                             --no-freeze, --full, --out <path>, --server <url>,
                             --browser <path>)
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
  mechanica comments        List the open review comments left in the editor, with
                            the file and line of the block each one is about
                            (--page </path>, --all adds the resolved ones, --json).
                            In a project linked to a site (mechanica link) these
                            are the site's comments, the ones left in its online
                            editor; --local reads .mech/comments/ instead
  mechanica comments add </path> "text"
                            Comment on a page (--block <content-block-id> pins it
                            to a block, --locale <code>)
  mechanica comments reply <id> "text"
  mechanica comments resolve <id>
                            Mark a comment done (--note "what changed" is posted
                            as a reply first); mechanica comments reopen <id> undoes it
                            (--as <name> signs any of these as someone else — in
                            .mech/comments/ only: a site names the author itself)
`

// Flags that never take a value: `shot --no-freeze design/index.html` keeps the target positional.
const PARSE_OPTIONS = { booleans: ['full', 'no-freeze', 'all', 'json', 'local'] }

/** CLI entry: dispatch a command to its handler. */
export async function run(argv: string[]): Promise<void> {
  const { command, args, flags } = parseArgs(argv, PARSE_OPTIONS)
  const str = (value: string | boolean | undefined): string | undefined =>
    typeof value === 'string' ? value : undefined
  // A value flag given bare (`--scroll` with nothing after it) reaches the
  // command as '' so it is rejected rather than silently ignored.
  const required = (value: string | boolean | undefined): string | undefined => (value === true ? '' : str(value))

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
    case 'comments':
      return runComments(args, {
        page: str(flags.page),
        all: flags.all === true,
        json: flags.json === true,
        local: flags.local === true,
        block: str(flags.block),
        locale: str(flags.locale),
        note: str(flags.note),
        as: str(flags.as),
      })
    case 'login':
      return runLogin({
        host: str(flags.host),
        token: str(flags.token),
        wait: flags.wait === true ? true : flags['no-wait'] === true ? false : undefined,
      })
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
        section: flagValues(argv, 'section', PARSE_OPTIONS).map((value) => required(value) ?? ''),
        scroll: required(flags.scroll),
        mark: required(flags.mark),
        noFreeze: flags['no-freeze'] === true,
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
