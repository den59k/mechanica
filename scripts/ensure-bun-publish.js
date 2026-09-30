// `prepublishOnly` guard for packages that depend on a sibling via `workspace:*`.
//
// `npm publish` ships the manifest verbatim — `workspace:*` included — and the
// result can't be installed from the registry (mechanica 2.0.0 went out that
// way). `bun publish` rewrites the protocol to the sibling's real version, so
// it is the only supported way to publish these packages.
const agent = process.env.npm_config_user_agent ?? ''

if (!agent.startsWith('bun/')) {
  console.error(
    [
      '',
      `Refusing to publish ${process.env.npm_package_name ?? 'this package'} with ${agent.split(' ')[0] || 'an unknown client'}.`,
      'Its manifest has `workspace:*` dependencies that only `bun publish` rewrites',
      'to real versions — run `bun publish` instead (after `bun run release:check`).',
      '',
    ].join('\n'),
  )
  process.exit(1)
}
