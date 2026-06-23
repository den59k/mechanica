export interface ParsedArgs {
  command?: string
  flags: Record<string, string | boolean>
}

/** Parse `argv` (without node/script) into a command and `--flag[=value]` map. */
export function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv
  const flags: Record<string, string | boolean> = {}

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!
    if (!arg.startsWith('--')) continue
    const key = arg.slice(2)

    if (key.includes('=')) {
      const eq = key.indexOf('=')
      flags[key.slice(0, eq)] = key.slice(eq + 1)
    } else if (rest[i + 1] && !rest[i + 1]!.startsWith('--')) {
      flags[key] = rest[++i]!
    } else {
      flags[key] = true
    }
  }

  return { command, flags }
}
