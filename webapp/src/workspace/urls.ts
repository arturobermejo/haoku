/** Web addresses the user pastes along with a text source. */

/** The http(s) URL as typed, with the scheme filled in; null when it is not a web address at all. */
export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(withScheme)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.hostname.includes('.') ? url.toString() : null
  } catch {
    return null
  }
}

/** The host of a URL, for a compact label. */
export function urlLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

const NAME_MAX = 64

/** The text's first line, trimmed of markdown ornament and cut at a word when it runs long. */
function firstLine(text: string): string {
  const line = text
    .split('\n')
    .map((l) => l.replace(/^\s*(#{1,6}|>|[-*+]|\d+[.)])\s*/, '').trim())
    .find(Boolean)
  if (!line) return ''
  const flat = line.replace(/\s+/g, ' ')
  if (flat.length <= NAME_MAX) return flat
  const cut = flat.slice(0, NAME_MAX)
  const at = cut.lastIndexOf(' ')
  return `${(at > NAME_MAX / 2 ? cut.slice(0, at) : cut).replace(/[\s,;:.]+$/, '')}…`
}

/** The page a URL points at, as "host · last path segment". */
function fromUrl(url: string): string {
  try {
    const u = new URL(url)
    const last = u.pathname.split('/').filter(Boolean).pop() ?? ''
    const slug = decodeURIComponent(last)
      .replace(/\.\w{1,5}$/, '')
      .replace(/[-_+]+/g, ' ')
      .trim()
    return [urlLabel(url), slug].filter(Boolean).join(' · ')
  } catch {
    return ''
  }
}

/** What to call pasted text: the title given, else its first line, else the page it came from. */
export function pastedName(input: { text: string; title?: string; url?: string }, taken: string[]): string {
  const base = (input.title?.trim().replace(/\s+/g, ' ').slice(0, NAME_MAX) || firstLine(input.text) || (input.url ? fromUrl(input.url) : '') || 'pasted text').trim()
  const names = new Set(taken)
  if (!names.has(base)) return base
  for (let n = 2; n < 500; n++) if (!names.has(`${base} (${n})`)) return `${base} (${n})`
  return `${base} (${Date.now()})`
}
