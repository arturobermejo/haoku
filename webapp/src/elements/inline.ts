import DOMPurify from 'dompurify'
import { Marked, type TokenizerAndRendererExtension } from 'marked'

/** `[^3]` → a clickable citation mark. Runs before the link tokenizer, so it never becomes a reference link. */
const cite: TokenizerAndRendererExtension = {
  name: 'cite',
  level: 'inline',
  start: (src) => src.indexOf('[^'),
  tokenizer(src) {
    const m = /^\[\^(\w+)\](?!:)/.exec(src)
    if (m) return { type: 'cite', raw: m[0], key: m[1] }
    return undefined
  },
  renderer: (token) => `<sup class="cite" data-key="${String(token.key)}" role="button" tabindex="0">${String(token.key)}</sup>`,
}

let imageResolver: (sourceId: string) => string | undefined = () => undefined
/** The app maps `space://<sourceId>` image URLs to object URLs; standalone they stay as they are. */
export function setImageResolver(fn: (sourceId: string) => string | undefined) {
  imageResolver = fn
}

const md = new Marked({ gfm: true, breaks: false, extensions: [cite] })
md.use({
  renderer: {
    image({ href, title, text }) {
      const m = /^space:\/\/([^\s/)#]+)/.exec(href)
      const src = m ? (imageResolver(m[1]) ?? '') : href
      const id = m ? ` data-source-id="${esc(m[1])}"` : ''
      return `<img src="${esc(src)}" alt="${esc(text)}"${title ? ` title="${esc(title)}"` : ''}${id}>`
    },
  },
})

const PURIFY = {
  CUSTOM_ELEMENT_HANDLING: {
    tagNameCheck: /^space-[a-z]+$/,
    attributeNameCheck: /^(tone|title|cites|editable|print)$/,
    allowCustomizedBuiltInElements: false,
  },
  ADD_ATTR: ['data-key', 'data-source-id', 'role', 'tabindex'],
  // The default also drops blob: object URLs and our space: scheme.
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|blob|space|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
}

export const sanitize = (html: string): string => DOMPurify.sanitize(html, PURIFY)

/** Inline markdown (bold, links, code, citation marks) to safe HTML. */
export function renderInline(text: string): string {
  return sanitize(md.parseInline(text, { async: false }) as string)
}

/** Block markdown (paragraphs, lists, tables, code) to safe HTML. */
export function renderMarkdown(text: string, options: { breaks?: boolean } = {}): string {
  return sanitize(md.parse(text, { async: false, breaks: options.breaks ?? false }) as string)
}

export const esc = (v: string): string => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
