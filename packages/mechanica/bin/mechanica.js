#!/usr/bin/env node
// In the repo checkout (src/ present) under Bun, run the TS source directly —
// monorepo dev stays live with no build. Published tarballs ship dist/ only,
// so installed packages always run the compiled CLI, under Node and Bun alike.
import { existsSync } from 'node:fs'

const srcEntry = new URL('../src/cli/cli.ts', import.meta.url)
const entry = process.versions.bun && existsSync(srcEntry) ? '../src/cli/cli.ts' : '../dist/cli.js'

const { run } = await import(entry)

run(process.argv.slice(2)).catch((error) => {
  // A plain Error is a message for the user (bad usage, a refused push);
  // anything else is a bug worth its stack trace.
  console.error(error?.constructor === Error ? `mechanica: ${error.message}` : error)
  process.exit(1)
})
