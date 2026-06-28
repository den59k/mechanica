import { blocksToMarkdown, markdownToBlocks, type Block } from 'vuewrite/markdown'
import type { RichTextCodec } from '@mechanica/shared'

/** Just the bits of a compiled block component the codec needs. */
interface BlockLike {
  blockId?: string
  blockSchema?: { props?: unknown }
}

/**
 * Build a {@link RichTextCodec} from compiled block components: it maps each
 * block's `richText` props (so the page codec knows which fields to store as
 * Markdown) and converts vuewrite `Block[]` ⇄ Markdown via `vuewrite/markdown`.
 *
 * `softBreaks: true` matches the vuewrite editor's own Markdown round-trip, so a
 * single newline survives as a soft break instead of collapsing paragraphs.
 */
export function buildRichTextCodec(blocks: Iterable<BlockLike>): RichTextCodec {
  const richTextProps = new Map<string, Set<string>>()
  for (const block of blocks) {
    if (!block.blockId) continue
    const props = findRichTextProps(block.blockSchema?.props)
    if (props.size) richTextProps.set(block.blockId, props)
  }

  return {
    isRichText: (blockId, prop) => richTextProps.get(blockId)?.has(prop) ?? false,
    toMarkdown: (value) => blocksToMarkdown(value as Block[], { softBreaks: true }),
    toBlocks: (markdown) => markdownToBlocks(markdown, [], { softBreaks: true }),
  }
}

/**
 * Top-level props whose (compact) schema is the `richText` alias — either the
 * shorthand string `'richText'` or an expanded node with `format: 'richText'`.
 */
function findRichTextProps(props: unknown): Set<string> {
  const found = new Set<string>()
  if (props && typeof props === 'object') {
    for (const [key, value] of Object.entries(props as Record<string, unknown>)) {
      if (value === 'richText') found.add(key)
      else if (value && typeof value === 'object' && (value as { format?: string }).format === 'richText') {
        found.add(key)
      }
    }
  }
  return found
}
