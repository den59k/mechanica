/**
 * Resolve a keyboard event to the letter/digit a shortcut should match,
 * independent of the active keyboard layout or language.
 *
 * `event.key` reports the *produced character*, which breaks shortcuts under
 * non-Latin layouts: with a Cyrillic layout the physical R key yields `'к'`, so
 * `key === 'r'` never matches. `event.code` names the *physical key* by its
 * US-QWERTY position (`'KeyR'`, `'Digit1'`), which is stable across languages.
 *
 * We prefer `key` while it's already a plain Latin letter — so Latin layouts
 * that merely relocate keys (AZERTY, QWERTZ) still trigger on the letter the
 * user sees printed — and fall back to the physical `code` only when `key` isn't
 * `a`–`z` (the non-Latin case). Returns a lowercase `a`–`z` / `0`–`9`, or `null`
 * for keys we don't treat as shortcut characters (Escape, arrows, …).
 */
export function shortcutChar(event: { key: string; code?: string }): string | null {
  const key = event.key
  if (key.length === 1) {
    const lower = key.toLowerCase()
    if (lower >= 'a' && lower <= 'z') return lower
    if (key >= '0' && key <= '9') return key
  }
  const code = event.code ?? ''
  // 'KeyR' → 'r'
  if (code.length === 4 && code.startsWith('Key')) return code[3]!.toLowerCase()
  // 'Digit1' → '1'
  if (code.length === 6 && code.startsWith('Digit')) return code[5]!
  return null
}
