/** A serialized snapshot of the page produced by the editor on each edit. */
export interface EditorSnapshot {
  content: unknown[]
  data: Record<string, unknown>
}
