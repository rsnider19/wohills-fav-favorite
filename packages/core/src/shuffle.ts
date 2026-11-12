// Seeded 32-bit hash of an entry id (FNV-1a). Combined with a per-session seed
// it gives each entry a well-mixed sort key: the order is random per page
// load, but stable for a given seed so it never reshuffles mid-vote.
export function hashId(id: string, seed: number): number {
  let h = (0x811c9dc5 ^ seed) >>> 0
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Returns a new array sorted by hashId(getId(item), seed). If `isPinned`
 *  matches an item, that item moves to the very top. The input is not mutated. */
export function shuffledOrder<T>(
  items: readonly T[],
  seed: number,
  getId: (item: T) => string,
  isPinned?: (item: T) => boolean,
): T[] {
  const sorted = [...items].sort((a, b) => hashId(getId(a), seed) - hashId(getId(b), seed))
  if (isPinned) {
    const idx = sorted.findIndex(isPinned)
    if (idx > 0) sorted.unshift(sorted.splice(idx, 1)[0])
  }
  return sorted
}
