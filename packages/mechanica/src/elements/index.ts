import { defineComponent, h, type Component } from 'vue'
import type { BlocksMap } from '../core/state'
import { Link } from '../core/link'
import { responsiveVars, absStyle, compactStyle, FRAME_VARS, SIZE_VARS } from './style-vars'
import './elements.scss'

/**
 * Layout primitives for composed blocks (the Block Composer). They are ordinary
 * runtime components — placed in a composed template as `ContentBlock`s with the
 * ids below and rendered by `renderBlocks` like any block — so a composed block
 * previews, exports and screenshots through the exact same pipeline as a page.
 * Registered into every runtime `BlocksMap` by {@link registerElements}.
 *
 * Kept as render functions (not SFCs) so they never go through the block
 * compiler. See PLAN.md § 4.1.
 */

type Data = Record<string, unknown>

const px = (v: unknown): string | null =>
  typeof v === 'number' ? `${v}px` : typeof v === 'string' && v !== '' ? v : null

const SHADOWS: Record<string, string> = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.06)',
  md: '0 4px 12px rgba(0, 0, 0, 0.08)',
  lg: '0 12px 32px rgba(0, 0, 0, 0.12)',
}

/** The content-node id `renderBlocks` stamps on each block, for editor mapping. */
const blockId = (data: Data): unknown => data['data-block-id']

function frameStyle(data: Data): Record<string, string> {
  const out: Record<string, string> = {}
  if (typeof data.background === 'string' && data.background) out.background = data.background
  const radius = px(data.radius)
  if (radius) out.borderRadius = radius
  const minHeight = px(data.minHeight)
  if (minHeight) out.minHeight = minHeight
  if (typeof data.overflow === 'string') out.overflow = data.overflow
  if (typeof data.borderColor === 'string' && data.borderColor) {
    const width = typeof data.borderWidth === 'number' ? data.borderWidth : 1
    out.border = `${width}px solid ${data.borderColor}`
  }
  if (typeof data.shadow === 'string' && data.shadow in SHADOWS) out.boxShadow = SHADOWS[data.shadow]!
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

function textStyle(data: Data): Record<string, string> {
  const out: Record<string, string> = {}
  const size = px(data.size)
  if (size) out.fontSize = size
  if (data.weight != null) out.fontWeight = String(data.weight)
  if (data.lineHeight != null) out.lineHeight = String(data.lineHeight)
  if (typeof data.color === 'string' && data.color) out.color = data.color
  const maxWidth = px(data.maxWidth)
  if (maxWidth) out.maxWidth = maxWidth
  return out
}

/** Text — a heading/paragraph. Plain-string content in v1. */
const Text = defineComponent({
  name: 'MechText',
  inheritAttrs: false,
  setup(_props, { attrs }) {
    return () => {
      const data = attrs as Data
      const tag = typeof data.tag === 'string' && TEXT_TAGS.has(data.tag) ? data.tag : 'p'
      const style = compactStyle(responsiveVars(data, SIZE_VARS), textStyle(data), absStyle(data.$abs))
      return h(
        tag,
        { class: 'mxel mxel-text', style, 'data-block-id': blockId(data) },
        String(data.content ?? ''),
      )
    }
  },
})

function imageStyle(data: Data): Record<string, string> {
  const out: Record<string, string> = {}
  if (typeof data.fit === 'string') out.objectFit = data.fit
  if (data.ratio != null) out.aspectRatio = String(data.ratio)
  const radius = px(data.radius)
  if (radius) out.borderRadius = radius
  return out
}

/** Image — an uploaded asset. Renders a placeholder box when `src` is empty. */
const Image = defineComponent({
  name: 'MechImage',
  inheritAttrs: false,
  setup(_props, { attrs }) {
    return () => {
      const data = attrs as Data
      const style = compactStyle(responsiveVars(data, SIZE_VARS), imageStyle(data), absStyle(data.$abs))
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

const BUTTON_VARIANTS = new Set(['primary', 'secondary', 'ghost'])

/** Button — a labelled link. Uses the runtime `Link` so routing/link-following work. */
const Button = defineComponent({
  name: 'MechButton',
  inheritAttrs: false,
  setup(_props, { attrs }) {
    return () => {
      const data = attrs as Data
      const variant = typeof data.variant === 'string' && BUTTON_VARIANTS.has(data.variant) ? data.variant : 'primary'
      const style = compactStyle(responsiveVars(data, SIZE_VARS), absStyle(data.$abs))
      const cls = ['mxel', 'mxel-button', `mxel-button--${variant}`]
      const label = String(data.label ?? 'Button')
      const link = data.link as string | { url?: string } | undefined
      const hasTarget = typeof link === 'string' ? link !== '' : !!link?.url
      if (hasTarget) {
        return h(Link, { to: link!, class: cls, style, 'data-block-id': blockId(data) }, () => label)
      }
      return h('button', { type: 'button', class: cls, style, 'data-block-id': blockId(data) }, label)
    }
  },
})

/** Element blockId → component. The single source of truth for the id set. */
export const elements: Record<string, Component> = {
  'mech:frame': Frame,
  'mech:text': Text,
  'mech:image': Image,
  'mech:button': Button,
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
