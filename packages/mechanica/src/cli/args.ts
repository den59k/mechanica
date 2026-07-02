export interface ParsedArgs {
  command?: string
  /** Positional arguments after the command (excluding `--flag` values). */
  args: string[]
  flags: Record<string, string | boolean>
}

/** Parse `argv` (without node/script) into a command, positionals and a `--flag[=value]` map. */
export function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv
  const args: string[] = []
  const flags: Record<string, string | boolean> = {}

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!
    if (!arg.startsWith('--')) {
      args.push(arg)
      continue
    }
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

  return { command, args, flags }
}
