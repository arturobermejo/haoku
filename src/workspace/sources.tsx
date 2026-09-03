import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { closeDocument, openDocument } from '../pdf/openDocument'
import type { PdfDoc } from '../pdf/types'
import { anchorForMatch, buildPlainIndex, findInPage, indexPage, type Anchor, type PageIndex } from '../tools/textIndex'
import { newId } from './ids'
import { deleteStoredSource, listStoredSources, putStoredSource } from './storage'
import { normalizeUrl, pastedName } from './urls'
import type { Citation, Source, SourceKind } from './types'

export interface SearchHit {
  sourceId: string
  page: number
  occurrence: number
  snippet: string
  quote: string
  start: number
  end: number
}

/** A citation resolved against its source: page, rects (PDF) and character range (text). */
export interface ResolvedCitation extends Anchor {
  sourceId: string
  start: number
  end: number
}

export interface SourcesApi {
  sources: Source[]
  loaded: boolean
  byId: (id: string) => Source | undefined
  /** Finds a source by id, exact name, or a unique name prefix (case-insensitive). */
  byRef: (ref: string) => Source | undefined
  add: (files: File[]) => Promise<{ added: Source[]; rejected: { name: string; reason: string }[] }>
  /** Adds text the user pasted (from a web page, a mail, anywhere) as a text source. */
  addText: (input: { text: string; title?: string; url?: string }) => Promise<Source>
  /** Restores sources from an export, keeping their ids when free; returns old id → new id. */
  addImported: (entries: { meta: Source; blob: Blob }[]) => Promise<Map<string, string>>
  /** The stored file of a source. */
  blob: (id: string) => Blob | undefined
  remove: (id: string) => Promise<void>
  /** Removes every source. */
  clear: () => Promise<void>
  pdf: (id: string) => Promise<PdfDoc>
  text: (id: string) => Promise<string>
  /** Object URL for an image source; stable for the session. */
  imageUrl: (id: string) => string | undefined
  /** Data URL of an image, downscaled, for agents that can look at it. */
  imageDataUrl: (id: string, maxSide?: number) => Promise<string>
  /** Text index of a page (PDF) or of the whole source (text). */
  index: (id: string, page?: number) => Promise<PageIndex>
  pageCount: (id: string) => number
  search: (query: string, ids?: string[], limit?: number) => Promise<SearchHit[]>
  resolve: (citation: Citation) => Promise<ResolvedCitation | null>
}

const Context = createContext<SourcesApi | null>(null)

function kindOf(file: File): SourceKind | null {
  const name = file.name.toLowerCase()
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('text/') || /\.(txt|md|markdown|csv|json)$/.test(name)) return 'text'
  return null
}

export function SourcesProvider({ children }: { children: ReactNode }) {
  const [sources, setSources] = useState<Source[]>([])
  const [loaded, setLoaded] = useState(false)
  const blobs = useRef(new Map<string, Blob>())
  const pdfs = useRef(new Map<string, Promise<PdfDoc>>())
  const texts = useRef(new Map<string, Promise<string>>())
  const plainIndexes = useRef(new Map<string, Promise<PageIndex>>())
  const urls = useRef(new Map<string, string>())

  useEffect(() => {
    let cancelled = false
    listStoredSources()
      .then((stored) => {
        if (cancelled) return
        for (const s of stored) blobs.current.set(s.meta.id, s.blob)
        setSources(stored.map((s) => s.meta).sort((a, b) => a.addedAt - b.addedAt))
      })
      .catch((err: unknown) => console.error('could not load sources', err))
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const pdf = useCallback((id: string): Promise<PdfDoc> => {
    let pending = pdfs.current.get(id)
    if (!pending) {
      const blob = blobs.current.get(id)
      const meta = sources.find((s) => s.id === id)
      if (!blob || !meta) return Promise.reject(new Error(`no source ${id}`))
      pending = openDocument(blob, meta.name)
      pdfs.current.set(id, pending)
    }
    return pending
  }, [sources])

  const text = useCallback((id: string): Promise<string> => {
    let pending = texts.current.get(id)
    if (!pending) {
      const blob = blobs.current.get(id)
      if (!blob) return Promise.reject(new Error(`no source ${id}`))
      pending = blob.text()
      texts.current.set(id, pending)
    }
    return pending
  }, [])

  const add = useCallback<SourcesApi['add']>(async (files) => {
    const added: Source[] = []
    const rejected: { name: string; reason: string }[] = []
    for (const file of files) {
      const kind = kindOf(file)
      if (!kind) {
        rejected.push({ name: file.name, reason: 'only PDF, text and image files are supported for now' })
        continue
      }
      const meta: Source = { id: newId('s'), kind, name: file.name, mime: file.type, bytes: file.size, addedAt: Date.now() }
      if (kind === 'pdf') {
        try {
          const doc = await openDocument(file, file.name)
          meta.pages = doc.pageCount
          if (doc.title !== file.name.replace(/\.pdf$/i, '')) meta.title = doc.title
          pdfs.current.set(meta.id, Promise.resolve(doc))
        } catch (err: unknown) {
          console.error(err)
          rejected.push({ name: file.name, reason: 'could not be parsed as a PDF' })
          continue
        }
      }
      blobs.current.set(meta.id, file)
      await putStoredSource(meta, file)
      added.push(meta)
    }
    if (added.length) setSources((prev) => [...prev, ...added])
    return { added, rejected }
  }, [])

  const addText = useCallback<SourcesApi['addText']>(async ({ text, title, url }) => {
    const body = text.replace(/\r\n/g, '\n').trim()
    if (!body) throw new Error('there is nothing to add: the text is empty')
    const origin = url?.trim() ? normalizeUrl(url) : undefined
    if (url?.trim() && !origin) throw new Error(`"${url.trim()}" is not a web address`)
    const blob = new Blob([body], { type: 'text/plain' })
    const meta: Source = { id: newId('s'), kind: 'text', name: pastedName({ text: body, title, url: origin ?? undefined }, sources.map((s) => s.name)), mime: 'text/plain', bytes: blob.size, addedAt: Date.now(), ...(origin ? { url: origin } : {}) }
    blobs.current.set(meta.id, blob)
    texts.current.set(meta.id, Promise.resolve(body))
    await putStoredSource(meta, blob)
    setSources((prev) => [...prev, meta])
    return meta
  }, [sources])

  const addImported = useCallback<SourcesApi['addImported']>(async (entries) => {
    const map = new Map<string, string>()
    const added: Source[] = []
    for (const { meta, blob } of entries) {
      const existing = sources.find((s) => s.id === meta.id)
      if (existing && existing.name === meta.name && existing.bytes === meta.bytes) {
        map.set(meta.id, meta.id)
        continue
      }
      const id = existing ? newId('s') : meta.id
      const next: Source = { ...meta, id, addedAt: Date.now() }
      blobs.current.set(id, blob)
      await putStoredSource(next, blob)
      added.push(next)
      map.set(meta.id, id)
    }
    if (added.length) setSources((prev) => [...prev, ...added])
    return map
  }, [sources])

  const remove = useCallback(async (id: string) => {
    const doc = pdfs.current.get(id)
    if (doc) doc.then(closeDocument).catch(() => {})
    pdfs.current.delete(id)
    texts.current.delete(id)
    plainIndexes.current.delete(id)
    blobs.current.delete(id)
    const url = urls.current.get(id)
    if (url) URL.revokeObjectURL(url)
    urls.current.delete(id)
    setSources((prev) => prev.filter((s) => s.id !== id))
    await deleteStoredSource(id)
  }, [])

  const clear = useCallback(async () => {
    await Promise.all(sources.map((s) => remove(s.id)))
  }, [sources, remove])

  const api = useMemo<SourcesApi>(() => {
    const byId = (id: string) => sources.find((s) => s.id === id)
    const byRef = (ref: string) => {
      const exact = byId(ref) ?? sources.find((s) => s.name.toLowerCase() === ref.toLowerCase())
      if (exact) return exact
      const prefix = sources.filter((s) => s.name.toLowerCase().startsWith(ref.toLowerCase()) || (s.title ?? '').toLowerCase().startsWith(ref.toLowerCase()))
      return prefix.length === 1 ? prefix[0] : undefined
    }
    const blob = (id: string) => blobs.current.get(id)
    const imageUrl = (id: string) => {
      const blob = blobs.current.get(id)
      if (!blob) return undefined
      let url = urls.current.get(id)
      if (!url) {
        url = URL.createObjectURL(blob)
        urls.current.set(id, url)
      }
      return url
    }
    const imageDataUrl = async (id: string, maxSide = 1024) => {
      const url = imageUrl(id)
      if (!url) throw new Error(`no source ${id}`)
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image()
        el.onload = () => resolve(el)
        el.onerror = () => reject(new Error('could not decode image'))
        el.src = url
      })
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.naturalWidth * scale)
      canvas.height = Math.round(img.naturalHeight * scale)
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/jpeg', 0.85)
    }
    const index = async (id: string, page = 1): Promise<PageIndex> => {
      const meta = byId(id)
      if (!meta) throw new Error(`no source ${id}`)
      if (meta.kind === 'pdf') return indexPage((await pdf(id)).proxy, page)
      if (meta.kind === 'text') {
        let pending = plainIndexes.current.get(id)
        if (!pending) {
          pending = text(id).then(buildPlainIndex)
          plainIndexes.current.set(id, pending)
        }
        return pending
      }
      throw new Error(`${meta.name} is an image and has no text`)
    }
    const pageCount = (id: string) => {
      const meta = byId(id)
      return meta?.kind === 'pdf' ? (meta.pages ?? 1) : 1
    }
    const search = async (query: string, ids?: string[], limit = 50): Promise<SearchHit[]> => {
      const hits: SearchHit[] = []
      const targets = sources.filter((s) => s.kind !== 'image' && (!ids || ids.includes(s.id)))
      for (const source of targets) {
        for (let page = 1; page <= pageCount(source.id); page++) {
          const idx = await index(source.id, page)
          const matches = findInPage(idx, query)
          matches.forEach((m, i) => {
            if (hits.length >= limit) return
            const from = Math.max(0, m.start - 60)
            const to = Math.min(idx.text.length, m.end + 60)
            hits.push({ sourceId: source.id, page, occurrence: i + 1, snippet: idx.text.slice(from, to).replace(/\s+/g, ' '), quote: m.text.replace(/\s+/g, ' ').trim(), start: m.start, end: m.end })
          })
          if (hits.length >= limit) return hits
        }
      }
      return hits
    }
    const resolve = async (citation: Citation): Promise<ResolvedCitation | null> => {
      const meta = byId(citation.sourceId)
      if (!meta || meta.kind === 'image' || !citation.quote) return null
      const page = citation.page ?? 1
      const idx = await index(citation.sourceId, page)
      const matches = findInPage(idx, citation.quote)
      const match = matches[(citation.occurrence ?? 1) - 1]
      if (!match) return null
      const anchor = anchorForMatch(idx, match)
      return { ...anchor, sourceId: citation.sourceId, start: match.start, end: match.end }
    }
    return { sources, loaded, byId, byRef, add, addText, addImported, blob, remove, clear, pdf, text, imageUrl, imageDataUrl, index, pageCount, search, resolve }
  }, [sources, loaded, add, addText, addImported, remove, clear, pdf, text])

  return <Context.Provider value={api}>{children}</Context.Provider>
}

// oxlint-disable-next-line react/only-export-components
export function useSources(): SourcesApi {
  const api = useContext(Context)
  if (!api) throw new Error('useSources must be used inside SourcesProvider')
  return api
}
