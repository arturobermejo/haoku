import type { ParsedBlock } from './types'

/**
 * Keeps block ids stable across a re-parse: a block whose markdown is unchanged keeps its id; when the
 * block count is unchanged the rest match by position; anything left keeps the fresh id it was parsed with.
 */
export function reconcileIds(prev: ParsedBlock[], next: ParsedBlock[]): ParsedBlock[] {
  const free = prev.map((b) => ({ id: b.id, raw: b.raw, taken: false }))
  const out: (ParsedBlock | null)[] = next.map(() => null)
  next.forEach((b, i) => {
    const hit = free.find((f) => !f.taken && f.raw === b.raw)
    if (hit) {
      hit.taken = true
      out[i] = { ...b, id: hit.id }
    }
  })
  if (prev.length === next.length) {
    next.forEach((b, i) => {
      if (out[i]) return
      const f = free[i]
      if (!f.taken) {
        f.taken = true
        out[i] = { ...b, id: f.id }
      }
    })
  }
  const used = new Set(out.filter((b): b is ParsedBlock => b !== null).map((b) => b.id))
  return next.map((b, i) => {
    if (out[i]) return out[i]!
    if (used.has(b.id)) return { ...b, id: `${b.id}_${i}` }
    used.add(b.id)
    return b
  })
}
