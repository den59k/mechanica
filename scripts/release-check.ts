// `bun run release:check` — pack the three published packages exactly as
// `bun publish` would and verify the tarballs from a consumer's point of view,
// before anything reaches npm. Publishes nothing.
//
// `--out <dir>` keeps the verified tarballs there and writes `publish.json`:
// the ones whose version is not on npm yet, in publish order. The publish
// workflow (.github/workflows/publish.yml) uploads exactly those files.
//
// It exists because a manifest that still says `workspace:*`, or pins a stale
// sibling version out of `bun.lock`, only shows up inside the packed tarball.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outFlag = process.argv.indexOf('--out')
const outDir = outFlag === -1 ? undefined : path.resolve(process.argv[outFlag + 1] ?? '')
const failures: string[] = []
const check = (ok: boolean, message: string) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${message}`)
  if (!ok) failures.push(message)
}

function run(command: string, args: string[], cwd: string) {
  // shell: npm is a .cmd shim on Windows.
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' })
  return { ok: result.status === 0, out: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() }
}

/** Regular files of a `.tgz`, keyed by path. Enough tar for npm tarballs. */
function readTarball(file: string): Map<string, Buffer> {
  const tar = gunzipSync(fs.readFileSync(file))
  const field = (start: number, length: number) =>
    tar.subarray(start, start + length).toString('utf8').replace(/\0.*$/s, '')
  const files = new Map<string, Buffer>()
  for (let offset = 0; offset + 512 <= tar.length; ) {
    const name = field(offset, 100)
    if (!name) break
    const size = parseInt(field(offset + 124, 12).trim(), 8) || 0
    const type = field(offset + 156, 1)
    const prefix = field(offset + 345, 155)
    if (type === '0' || type === '') {
      files.set(prefix ? `${prefix}/${name}` : name, tar.subarray(offset + 512, offset + 512 + size))
    }
    offset += 512 + Math.ceil(size / 512) * 512
  }
  return files
}

function pack(dir: string, destination: string) {
  const out = path.join(destination, path.basename(dir))
  fs.mkdirSync(out, { recursive: true })
  const result = run('bun', ['pm', 'pack', '--destination', out], path.join(root, 'packages', dir))
  const tarball = fs.readdirSync(out).find((entry) => entry.endsWith('.tgz'))
  if (!result.ok || !tarball) throw new Error(`bun pm pack failed in packages/${dir}:\n${result.out}`)
  const files = readTarball(path.join(out, tarball))
  const manifest = JSON.parse(files.get('package/package.json')!.toString('utf8'))
  return { files, manifest, tarball: path.join(out, tarball) }
}

type Manifest = Record<string, any>
const DEP_GROUPS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']

function workspaceRanges(manifest: Manifest): string[] {
  return DEP_GROUPS.flatMap((group) =>
    Object.entries<string>(manifest[group] ?? {})
      .filter(([, range]) => range.startsWith('workspace:'))
      .map(([dep, range]) => `${group}.${dep}: ${range}`),
  )
}

/** Whether `^a.b.c` admits `version` (plain x.y.z on both sides, major ≥ 1). */
function caretAdmits(range: string, version: string): boolean {
  const base = /^\^(\d+)\.(\d+)\.(\d+)$/.exec(range)?.slice(1).map(Number)
  const actual = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)?.slice(1).map(Number)
  if (!base || !actual || base[0] !== actual[0]) return false
  return actual[1] > base[1] || (actual[1] === base[1] && actual[2] >= base[2])
}

/** Whether this exact version is on npm; `undefined` when the registry can't be asked. */
function isPublished(manifest: Manifest): boolean | undefined {
  const view = run('npm', ['view', `${manifest.name}@${manifest.version}`, 'version'], root)
  if (/E404/.test(view.out)) return false
  return view.ok ? view.out !== '' : undefined
}

console.log('Building dist…')
const build = run('bun', ['run', 'build'], root)
if (!build.ok) {
  console.error(build.out)
  process.exit(1)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mechanica-release-'))
try {
  const shared = pack('shared', tmp)
  const mechanica = pack('mechanica', tmp)
  const create = pack('create-mechanica', tmp)

  console.log(`\n${shared.manifest.name}@${shared.manifest.version}`)
  check(workspaceRanges(shared.manifest).length === 0, 'no workspace: ranges in the packed manifest')
  check(shared.files.has('package/dist/index.js'), 'ships dist/')
  check(![...shared.files.keys()].some((file) => file.startsWith('package/src/')), 'ships no src/')

  console.log(`\n${mechanica.manifest.name}@${mechanica.manifest.version}`)
  const leftovers = workspaceRanges(mechanica.manifest)
  check(leftovers.length === 0, `no workspace: ranges in the packed manifest${leftovers.length ? ` (${leftovers.join('; ')})` : ''}`)
  check(mechanica.manifest.version === shared.manifest.version, 'version in step with mechanica-shared')
  const sharedRange = mechanica.manifest.dependencies?.['mechanica-shared']
  check(
    sharedRange === shared.manifest.version,
    `depends on mechanica-shared ${shared.manifest.version}` +
      (sharedRange === shared.manifest.version ? '' : ` (packed: ${sharedRange} — fix the workspace versions in bun.lock by hand)`),
  )
  check(mechanica.files.has('package/dist/index.js') && mechanica.files.has('package/dist/plugin.js'), 'ships dist/')
  check(mechanica.files.has('package/bin/mechanica.js'), 'ships the CLI launcher')
  check(![...mechanica.files.keys()].some((file) => file.startsWith('package/src/')), 'ships no src/')

  console.log(`\n${create.manifest.name}@${create.manifest.version}`)
  for (const file of ['AGENTS.md', '_gitignore', 'package.json', '.mech/pages/index.page.md']) {
    check(create.files.has(`package/template/${file}`), `ships template/${file}`)
  }
  const template = JSON.parse(create.files.get('package/template/package.json')!.toString('utf8'))
  check(workspaceRanges(template).length === 0, 'template has no workspace: ranges')
  const templateRange = template.dependencies?.mechanica
  // A prerelease goes to npm's `next` tag and a caret range never resolves it —
  // scaffolded apps keep installing the stable release, so the template's range
  // is rightly left alone (`release:bump` skips it too).
  if (mechanica.manifest.version.includes('-')) {
    check(true, `template's mechanica range (${templateRange}) stays on the stable release`)
  } else {
    check(
      caretAdmits(templateRange, mechanica.manifest.version),
      `template's mechanica range (${templateRange}) admits ${mechanica.manifest.version}`,
    )
  }

  // What a release would upload. A version already on npm is skipped, so a
  // release that leaves create-mechanica alone — or a re-run after a publish
  // that stopped halfway — publishes only what is missing.
  console.log('\nRegistry')
  const packed = [shared, mechanica, create].map((pkg) => ({ ...pkg, published: isPublished(pkg.manifest) }))
  for (const pkg of packed) {
    const spec = `${pkg.manifest.name}@${pkg.manifest.version}`
    if (pkg.published === undefined) check(!outDir, `${spec}: couldn't ask the registry`)
    else console.log(`  ${pkg.published ? 'skip' : 'new '} ${spec}${pkg.published ? ' is already on npm' : ''}`)
  }
  const [sharedState, mechanicaState] = packed
  check(
    !(mechanicaState.published === true && sharedState.published === false),
    'mechanica is not on npm without the mechanica-shared version it depends on',
  )
  const pending = packed.filter((pkg) => pkg.published !== true)
  check(pending.length > 0, 'at least one version is not on npm yet (otherwise bump the versions)')

  if (failures.length) {
    console.error(`\n${failures.length} check(s) failed — do not publish.`)
    process.exitCode = 1
  } else if (outDir) {
    fs.mkdirSync(outDir, { recursive: true })
    const plan = pending.map((pkg) => {
      const tarball = path.join(outDir, path.basename(pkg.tarball))
      fs.copyFileSync(pkg.tarball, tarball)
      // A prerelease must never become what `npm install` resolves by default.
      const tag = pkg.manifest.version.includes('-') ? 'next' : 'latest'
      return { name: pkg.manifest.name, version: pkg.manifest.version, tag, tarball }
    })
    fs.writeFileSync(path.join(outDir, 'publish.json'), JSON.stringify(plan, null, 2) + '\n')
    console.log(`\nAll checks passed. To publish, in order (${path.join(outDir, 'publish.json')}):`)
    for (const entry of plan) console.log(`  ${entry.name}@${entry.version} → ${entry.tag}`)
  } else {
    console.log(
      [
        '\nAll checks passed. Push a v<version> tag to publish from GitHub Actions, or by hand, in this order:',
        '  cd packages/shared && bun publish',
        '  cd packages/mechanica && bun publish',
        '  cd packages/create-mechanica && npm publish',
        '',
      ].join('\n'),
    )
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}
