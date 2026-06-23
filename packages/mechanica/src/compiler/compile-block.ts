import { parse, babelParse } from '@vue/compiler-sfc'
import { walk } from 'estree-walker'
import MagicString from 'magic-string'

/**
 * The macro name authors call inside a block's `<script setup>`.
 * It is the only Mechanica macro the compiler rewrites.
 */
const MACRO = 'defineBlock'

export interface CompileBlockResult {
  /** The transformed SFC source. */
  code: string
  /** Source map for the edits. */
  map: ReturnType<MagicString['generateMap']>
  /** The resolved block id (explicit `id`, otherwise derived from the filename). */
  blockId: string
}

/**
 * Rewrites a Mechanica block SFC at the source level, turning the
 * `defineBlock(...)` macro into Vue's native `defineProps` + `defineOptions`
 * macros, then lets `@vitejs/plugin-vue` compile the result as usual.
 *
 *   const props = defineBlock({ id: 'x', props: { title: 'string' } })
 *     ↓
 *   const props = defineProps(["title"])
 *   defineOptions({ blockId: "x", blockSchema: { id: "x", props: { title: 'string' } } })
 *
 * Returns `null` when the file is not a block (no `defineBlock` call), so the
 * caller can leave it untouched.
 *
 * @param code     Raw `.vue` SFC source.
 * @param filename Absolute or relative path; used to derive the block id.
 */
export function compileBlock(code: string, filename: string): CompileBlockResult | null {
  // Cheap bail-out before any parsing.
  if (!code.includes(MACRO)) return null

  const { descriptor } = parse(code, { filename })
  const scriptSetup = descriptor.scriptSetup
  if (!scriptSetup || !scriptSetup.content.includes(MACRO)) return null

  const content = scriptSetup.content
  const ast = babelParse(content, { sourceType: 'module', plugins: ['typescript'] })

  // Find the `defineBlock(...)` call expression.
  let call: any = null
  walk(ast.program as any, {
    enter(node: any) {
      if (
        node.type === 'CallExpression' &&
        node.callee?.type === 'Identifier' &&
        node.callee.name === MACRO
      ) {
        call = node
      }
    },
  })
  if (!call) return null

  const arg = call.arguments[0]
  const hasDescriptor = arg?.type === 'ObjectExpression'

  // The authored descriptor object, preserved verbatim.
  const descriptorSource = hasDescriptor ? content.slice(arg.start, arg.end) : '{}'

  const explicitId = hasDescriptor ? getStringProp(arg, 'id') : null
  const blockId = explicitId ?? deriveBlockId(filename)

  // Prop names for `defineProps([...])`.
  const propsNode = hasDescriptor ? getProp(arg, 'props') : null
  const propKeys =
    propsNode?.type === 'ObjectExpression'
      ? propsNode.properties.map(propKeyName).filter((k: string | null): k is string => k !== null)
      : []

  // Slots: respect an author-provided `slots`, otherwise detect from the template.
  const authorSlots = hasDescriptor && hasProp(arg, 'slots')
  const slotNames = authorSlots ? [] : collectSlotNames(descriptor.template?.ast)

  // Build the merged blockSchema literal. Author keys come last so they win.
  const prelude: string[] = []
  if (!explicitId) prelude.push(`id: ${JSON.stringify(blockId)}`)
  if (slotNames.length) prelude.push(`slots: ${slotsLiteral(slotNames)}`)
  const inner = stripBraces(descriptorSource)
  const schemaParts = [...prelude, inner].filter((p) => p.length > 0)
  const blockSchema = `{ ${schemaParts.join(', ')} }`

  const defineOptions = `\ndefineOptions({ blockId: ${JSON.stringify(blockId)}, blockSchema: ${blockSchema} });`

  // Apply edits against the full SFC source.
  const scriptStart = scriptSetup.loc.start.offset
  const s = new MagicString(code)
  s.update(scriptStart + call.start, scriptStart + call.end, `defineProps(${JSON.stringify(propKeys)})`)
  s.appendLeft(scriptStart + content.length, defineOptions)

  return {
    code: s.toString(),
    map: s.generateMap({ source: filename, hires: true }),
    blockId,
  }
}

/** Derive a kebab-case block id from a file path: `OurFeatures.vue` → `our-features`. */
export function deriveBlockId(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename
  return base
    .replace(/\.\w+$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase()
}

function getProp(obj: any, name: string): any {
  const prop = obj.properties.find(
    (p: any) => p.type === 'ObjectProperty' && keyMatches(p, name),
  )
  return prop?.value ?? null
}

function getStringProp(obj: any, name: string): string | null {
  const value = getProp(obj, name)
  return value?.type === 'StringLiteral' ? value.value : null
}

function hasProp(obj: any, name: string): boolean {
  return obj.properties.some(
    (p: any) => p.type === 'ObjectProperty' && keyMatches(p, name),
  )
}

function keyMatches(prop: any, name: string): boolean {
  const key = prop.key
  return (
    (key?.type === 'Identifier' && key.name === name) ||
    (key?.type === 'StringLiteral' && key.value === name)
  )
}

function propKeyName(prop: any): string | null {
  if (prop.type !== 'ObjectProperty') return null
  const key = prop.key
  if (key?.type === 'Identifier') return key.name
  if (key?.type === 'StringLiteral') return key.value
  return null
}

function stripBraces(src: string): string {
  const trimmed = src.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed.slice(1, -1).trim().replace(/,\s*$/, '')
  }
  return trimmed
}

function slotsLiteral(names: string[]): string {
  const unique = [...new Set(names)]
  return `{ ${unique.map((n) => `${JSON.stringify(n)}: true`).join(', ')} }`
}

/** Walk the compiled template AST collecting `<slot>` names (`default` when unnamed). */
function collectSlotNames(templateAst: any): string[] {
  if (!templateAst) return []
  const names: string[] = []

  const visit = (node: any): void => {
    if (!node) return
    // NodeTypes.ELEMENT === 1
    if (node.type === 1 && node.tag === 'slot') {
      // NodeTypes.ATTRIBUTE === 6
      const nameAttr = (node.props ?? []).find(
        (p: any) => p.type === 6 && p.name === 'name',
      )
      names.push(nameAttr?.value?.content ?? 'default')
    }
    if (Array.isArray(node.children)) node.children.forEach(visit)
  }

  visit(templateAst)
  return names
}
