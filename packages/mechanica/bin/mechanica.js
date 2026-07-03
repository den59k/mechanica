#!/usr/bin/env node
// Under Bun, run the TS source directly (monorepo dev, Bun-native installs —
// always live, no build needed). Under Node, use the compiled CLI from dist/.
const entry = process.versions.bun ? '../src/cli/cli.ts' : '../dist/cli.js'

const { run } = await import(entry)

run(process.argv.slice(2)).catch((error) => {
  console.error(error)
  process.exit(1)
})
