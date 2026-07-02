/**
 * Recently-used tracking (pages switched to, blocks inserted), persisted in
 * localStorage per dev-server origin. Most recent first, capped, and safe to
 * call in environments without storage (SSR, some test setups).
 */

export type RecentKind = 'pages' | 'blocks'

const LIMIT = 8

const storageKey = (kind: RecentKind) => `mechanica:recent-${kind}`

export function getRecents(kind: RecentKind): string[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(kind)) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function recordRecent(kind: RecentKind, id: string): void {
  if (typeof localStorage === 'undefined') return
  const next = [id, ...getRecents(kind).filter((entry) => entry !== id)].slice(0, LIMIT)
  try {
    localStorage.setItem(storageKey(kind), JSON.stringify(next))
  } catch {
    /* storage full or blocked — recents are best-effort */
  }
}
