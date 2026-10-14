export interface ParsedArgs {
  command?: string
  /** Positional arguments after the command (excluding `--flag` values). */
  args: string[]
  /** Flag values; a flag given several times keeps its last value (see {@link flagValues}). */
  flags: Record<string, string | boolean>
}

export interface ParseOptions {
  /** Flags that never take a value, so `--full hero` keeps `hero` positional. */
  booleans?: string[]
}

/** Parse `argv` (without node/script) into a command, positionals and a `--flag[=value]` map. */
export function parseArgs(argv: string[], options: ParseOptions = {}): ParsedArgs {
  const [command, ...rest] = argv
  const args: string[] = []
  const flags: Record<string, string | boolean> = {}

  for (const token of scanArgs(rest, options)) {
    if (token.flag === undefined) args.push(token.value as string)
    else flags[token.flag] = token.value
  }

  return { command, args, flags }
}

/**
 * Every value a repeatable flag was given, in order — `--section a --section b`
 * → `['a', 'b']`; a bare `--section` contributes `true`. Takes the same `argv`
 * as {@link parseArgs} (command first).
 */
export function flagValues(argv: string[], name: string, options: ParseOptions = {}): Array<string | boolean> {
  return scanArgs(argv.slice(1), options)
    .filter((token) => token.flag === name)
    .map((token) => token.value)
}

interface Token {
  /** The flag name, or undefined for a positional argument. */
  flag?: string
  value: string | boolean
}

function scanArgs(rest: string[], { booleans = [] }: ParseOptions): Token[] {
  const tokens: Token[] = []
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!
    if (!arg.startsWith('--')) {
      tokens.push({ value: arg })
      continue
    }
    const key = arg.slice(2)

    if (key.includes('=')) {
      const eq = key.indexOf('=')
      tokens.push({ flag: key.slice(0, eq), value: key.slice(eq + 1) })
    } else if (!booleans.includes(key) && rest[i + 1] && !rest[i + 1]!.startsWith('--')) {
      tokens.push({ flag: key, value: rest[++i]! })
    } else {
      tokens.push({ flag: key, value: true })
    }
  }
  return tokens
}
