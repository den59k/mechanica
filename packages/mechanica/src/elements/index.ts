import { defineComponent, h, type Component, type VNode } from 'vue'
import type { PageLink } from 'mechanica-shared'
import type { BlocksMap } from '../core/state'
import { Link } from '../core/link'
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
 * so a site ships its own via the composer manifest (`defineComposer`)
 * instead of inheriting a generic one. Kept as render functions (not SFCs) so
 * they never go through the block compiler. See PLAN.md § 4.1 / COMPOSER-REDESIGN §6.1.
 */

type Data = Record<string, unknown>

/** The content-node id `renderBlocks` stamps on each block, for editor mapping. */
const blockId = (data: Data): unknown => data['data-block-id']

// A valid CSS class token: a letter/underscore start, then word chars / hyphens.
const CLASS_TOKEN = /^[a-zA-Z_][\w-]*$/

/**
 * The element's class attribute: the base classes plus the design-system
 * `cls` the composer's Style select assigns (a space-separated string of class
 * names). Sanitized token-by-token so a bad value can never inject markup or a
 * malformed selector. `cls` is base-only (not responsive) — a class is
 * responsive inside its own CSS. See COMPOSER-MANIFEST.md.
 */
function classAttr(base: string, cls: unknown): string {
  if (typeof cls !== 'string' || !cls) return base
  const tokens = cls.split(/\s+/).filter((token) => CLASS_TOKEN.test(token))
  return tokens.length ? `${base} ${tokens.join(' ')}` : base
}

/**
 * The element's link target — a `smartLink`-shaped object with a non-empty url
 * (`{ url, title?, external?, openNewTab? }`). A linked frame renders as the
 * runtime `<Link>` (an `<a>` with SPA navigation + locale prefixing); a linked
 * text wraps its content in one. Behavior only — `a.mxel-frame` / `.mxel-text a`
 * inherit color/decoration (elements.scss) so linking never restyles.
 */
function linkTarget(data: Data): Partial<PageLink> | null {
  const link = data.link
  if (typeof link !== 'object' || link === null || Array.isArray(link)) return null
  const url = (link as Record<string, unknown>).url
  return typeof url === 'string' && url !== '' ? (link as Partial<PageLink>) : null
}

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
      const props = { class: classAttr('mxel mxel-frame', data.cls), style, 'data-block-id': blockId(data) }
      const children = slots.default ? slots.default() : undefined
      const link = linkTarget(data)
      // A linked frame *is* the anchor (a clickable card / CTA): <Link> renders
      // an <a>, and Vue's attr fallthrough merges class/style/data-block-id onto
      // it, so layout and editor mapping are identical to the <div> form.
      if (link) return h(Link, { to: link, activeClass: false, ...props }, () => children)
      return h('div', props, children)
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
      const content = String(data.content ?? '')
      const link = linkTarget(data)
      // A linked text keeps its tag (an <h2> stays an <h2>) and wraps the
      // content in the anchor, so heading semantics and typography knobs hold.
      const children: string | VNode = link ? h(Link, { to: link, activeClass: false }, () => content) : content
      return h(
        tag,
        { class: classAttr('mxel mxel-text', data.cls), style, 'data-block-id': blockId(data) },
        children,
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
          { class: classAttr('mxel mxel-image mxel-image--empty', data.cls), style, 'data-block-id': blockId(data) },
          'Image',
        )
      }
      return h('img', {
        class: classAttr('mxel mxel-image', data.cls),
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
