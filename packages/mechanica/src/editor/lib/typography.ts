// Non-breaking typography: inserting and *seeing* the two invisible glue
// characters that matter for good (especially Russian) typography — the
// non-breaking space (U+00A0) and the non-breaking hyphen (U+2011). The pieces
// here are DOM-light and pure so they're unit-testable; the plain-field overlay
// (TypographyInput.vue) and the rich-text editor share them.

/** Non-breaking space — glues short words so a line never breaks between them. */
export const NBSP = ' '
/** Non-breaking hyphen — keeps hyphenated words (из-за, кто-то) on one line. */
export const NB_HYPHEN = '‑'

/**
 * The non-breaking character a keyboard event asks for, or `null`. Matches Word's
 * muscle memory: Ctrl/Cmd+Shift+Space → nbsp, Ctrl/Cmd+Shift+Minus → nb-hyphen.
 * Keyed off `event.code` (physical key) so it fires on any keyboard layout, the
 * same way the editor's other shortcuts stay layout-independent.
 */
export function typographyCharForEvent(event: KeyboardEvent): string | null {
  if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.altKey) return null
  if (event.code === 'Space') return NBSP
  if (event.code === 'Minus') return NB_HYPHEN
  return null
}

/**
 * Insert `char` at the caret of an `<input>`/`<textarea>`, replacing any
 * selection, and leave the caret after it. Returns the field's new value so the
 * caller can emit it. `setRangeText` keeps native undo working.
 */
export function insertAtCursor(el: HTMLInputElement | HTMLTextAreaElement, char: string): string {
  const start = el.selectionStart ?? el.value.length
  const end = el.selectionEnd ?? start
  el.setRangeText(char, start, end, 'end')
  return el.value
}

/** Whether the text carries any non-breaking character worth marking. */
export function hasTypographyChar(text: string): boolean {
  return text.includes(NBSP) || text.includes(NB_HYPHEN)
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' }

function escapeHtml(text: string): string {
  return text.replace(/[&<>]/g, (ch) => HTML_ESCAPES[ch] ?? ch)
}

/**
 * HTML that mirrors `text` for the plain-field marker overlay: every character
 * keeps its exact glyph advance (so the layer lines up with the real field), but
 * the two non-breaking characters are wrapped in marker spans the CSS lights up.
 * The characters themselves stay in the spans — that's what preserves the width.
 */
export function highlightTypographyHtml(text: string): string {
  return escapeHtml(text)
    .replaceAll(NBSP, `<span class="mech-typo__nbsp">${NBSP}</span>`)
    .replaceAll(NB_HYPHEN, `<span class="mech-typo__nbhyphen">${NB_HYPHEN}</span>`)
}

/** A display-only style span (vuewrite's `Style` shape, structurally typed). */
export interface TypographySpan {
  start: number
  end: number
  style: string
}

/**
 * vuewrite `parser`: scans a block's text and emits a one-character style span
 * over every non-breaking character. vuewrite merges these at *render* time only
 * — they never enter the stored model, so the Markdown on disk stays clean while
 * the editor still shows where the glue is.
 */
export function typographyParser(text: string): TypographySpan[] {
  const spans: TypographySpan[] = []
  for (let i = 0; i < text.length; i++) {
    if (text[i] === NBSP) spans.push({ start: i, end: i + 1, style: 'nbsp' })
    else if (text[i] === NB_HYPHEN) spans.push({ start: i, end: i + 1, style: 'nbHyphen' })
  }
  return spans
}
