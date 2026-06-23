#!/usr/bin/env bun
import { run } from '../src/cli/cli.ts'

run(process.argv.slice(2)).catch((error) => {
  console.error(error)
  process.exit(1)
})
