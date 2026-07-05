import { defineComponent, h, type Component } from 'vue'
import type { BlocksMap } from '../core/state'
import { responsiveVars, absStyle, compactStyle, FRAME_VARS, TEXT_VARS, IMAGE_VARS } from './style-vars'
import './elements.scss'

/**
 * Layout / content primitives for composed blocks (the Block Composer): the
 * container `mech:frame`, `mech:text` and `mech:image`. They are ordinary runtime
 * components — placed in a composed template as `ContentBlock`s and rendered by
 * `renderBlocks` like any block — so a composed block previews, exports and
 * screenshots through the exact same pipeline as a page. Registered into every
 * runtime `BlocksMap` by {@link registerElements}.
 *
 * Deliberately *no* Button element: a button's look is a design-system decision,
 * so a site ships its own via the components manifest (`defineComposerComponents`)
 * instead of inheriting a generic one. Kept as render functions (not SFCs) so
 * they never go through the block compiler. See PLAN.md § 4.1 / COMPOSER-REDESIGN §6.1.
 */

type Data = Record<string, unknown>

/** The content-node id `renderBlocks` stamps on each block, for editor mapping. */
const blockId = (data: Data): unknown => data['data-block-id']

// Visual style (background/radius/size/color/…) rides the same CSS-variable
// indirection as layout — see FRAME_VARS/TEXT_VARS/IMAGE_VARS — so every knob
// takes `$bp` breakpoint overrides. Only the rare compound knobs that have no
// editor UI (overflow, border) remain direct inline style, base-only.
function frameStyle(data: Data): Record<string, string> {
  const out: Record<string, string> = {}
  if (typeof data.overflow === 'string') out.overflow = data.overflow
  if (typeof data.borderColor === 'string' && data.borderColor) {
    const width = typeof data.borderWidth === 'number' ? data.borderWidth : 1
    out.border = `${width}px solid ${data.borderColor}`
  }
  return out
}

/** Frame — the only container. Flex is always on (a Figma autolayout frame). */
const Frame = defineComponent({
  name: 'MechFrame',
  inheritAttrs: false,
  setup(_props, { slots, attrs }) {
    return () => {
      const data = attrs as Data
      const style = compactStyle(responsiveVars(data, FRAME_VARS), frameStyle(data), absStyle(data.$abs))
      return h(
        'div',
        { class: 'mxel mxel-frame', style, 'data-block-id': blockId(data) },
        slots.default ? slots.default() : undefined,
      )
    }
  },
})

const TEXT_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p'])

/** Text — a heading/paragraph. Plain-string content in v1. */
const Text = defineComponent({
  name: 'MechText',
  inheritAttrs: false,
  setup(_props, { attrs }) {
    return () => {
      const data = attrs as Data
      const tag = typeof data.tag === 'string' && TEXT_TAGS.has(data.tag) ? data.tag : 'p'
      const style = compactStyle(responsiveVars(data, TEXT_VARS), absStyle(data.$abs))
      return h(
        tag,
        { class: 'mxel mxel-text', style, 'data-block-id': blockId(data) },
        String(data.content ?? ''),
      )
    }
  },
})

/** Image — an uploaded asset. Renders a placeholder box when `src` is empty. */
const Image = defineComponent({
  name: 'MechImage',
  inheritAttrs: false,
  setup(_props, { attrs }) {
    return () => {
      const data = attrs as Data
      const style = compactStyle(responsiveVars(data, IMAGE_VARS), absStyle(data.$abs))
      const src = typeof data.src === 'string' ? data.src : ''
      if (!src) {
        return h(
          'div',
          { class: 'mxel mxel-image mxel-image--empty', style, 'data-block-id': blockId(data) },
          'Image',
        )
      }
      return h('img', {
        class: 'mxel mxel-image',
        src,
        alt: typeof data.alt === 'string' ? data.alt : '',
        style,
        'data-block-id': blockId(data),
      })
    }
  },
})

/** Element blockId → component. The single source of truth for the id set. */
export const elements: Record<string, Component> = {
  'mech:frame': Frame,
  'mech:text': Text,
  'mech:image': Image,
}

/** Whether a block id is a built-in composer element (they ship with the runtime). */
export function isElementBlock(id: string): boolean {
  return id in elements
}

/** Register every element component into a blocks map (idempotent). Returns it. */
export function registerElements(blocks: BlocksMap): BlocksMap {
  for (const [id, component] of Object.entries(elements)) blocks.set(id, component)
  return blocks
}
