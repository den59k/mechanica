import { shortcutChar } from './keyboard'

export type ShortcutAction =
  | 'undo'
  | 'redo'
  | 'delete'
  | 'duplicate'
  | 'copy'
  | 'cut'
  | 'paste'
  | 'deselect'
  | 'quickSwitch'

export interface ShortcutEvent {
  key: string
  /** Physical key position (`event.code`) — makes letter shortcuts layout-independent. */
  code?: string
  metaKey?: boolean
  ctrlKey?: boolean
  shiftKey?: boolean
  /** The user is typing in an input/textarea/contenteditable. */
  typing: boolean
  /** A block is currently selected. */
  hasSelection: boolean
}

/**
 * Map a keyboard event to an editor action. Pure, so it's easy to test. Typing
 * suppresses everything except Escape, so field editing (and native text undo)
 * isn't hijacked. Letter matches go through `shortcutChar`, so a Cyrillic/Greek/
 * other non-Latin layout triggers the same shortcuts as US-QWERTY.
 */
export function resolveShortcut(event: ShortcutEvent): ShortcutAction | null {
  if (event.key === 'Escape') return 'deselect'

  const mod = event.metaKey || event.ctrlKey
  const key = shortcutChar(event) ?? ''

  // The quick switcher opens even while typing (like every command palette).
  if (mod && key === 'k') return 'quickSwitch'
  if (event.typing) return null

  if (mod && key === 'z') return event.shiftKey ? 'redo' : 'undo'
  if (mod && key === 'y') return 'redo'
  if (mod && key === 'v') return 'paste' // paste appends even with no selection

  if (!event.hasSelection) return null
  if (event.key === 'Delete' || event.key === 'Backspace') return 'delete'
  if (mod && key === 'd') return 'duplicate'
  if (mod && key === 'c') return 'copy'
  if (mod && key === 'x') return 'cut'

  return null
}
