import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { isLegacyDoc, migrateLegacy, parseDocument, serializeDocument, type LegacyDoc } from './markdown'
import type { SourcesApi } from './sources'
import type { BlockMeta, Highlight, Source, WorkspaceDoc } from './types'

/**
 * A space export: `document.md` (the markdown, title first, footnotes renumbered), `space.json`
 * (metadata, highlights, quiz progress, sources) and every source file under `sources/`, plus the
 * `space-elements.js` bundle so the markdown is interactive outside saoku.
 */
export const SPACE_FORMAT = 'saoku-space'
export const SPACE_VERSION = 2

interface ExportedSource extends Source {
  /** Path inside the zip. */
  file: string
}

interface SpaceManifest {
  format: typeof SPACE_FORMAT
  version: number
  exportedAt: number
  title: string
  /** v2: path of the markdown document inside the zip. */
  document?: string
  highlights: Highlight[]
  quizAnswers: Record<string, number>
  blockIds?: string[]
  blockMeta?: Record<string, BlockMeta>
  sources: ExportedSource[]
  /** v1 only. */
  blocks?: LegacyDoc['blocks']
}

const safeName = (name: string) => name.replace(/[^\w.-]+/g, '_')

export function fileSlug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'space'
  )
}

const ELEMENT_FILES = ['space-elements.js', 'space-elements.css']

/** The exported markdown: title first, footnotes renumbered, source names refreshed. */
export function exportMarkdown(doc: WorkspaceDoc, sources: SourcesApi): string {
  const parsed = parseDocument(doc.markdown, { ids: doc.blockIds })
  const md = serializeDocument(parsed.blocks, parsed.footnotes, { renumber: true, title: doc.title, sourceName: (id) => sources.byId(id)?.name ?? id })
  return `${md}\n<!-- interactive blocks (space-quiz, space-flashcards, space-diagram, space-callout) need space-elements.js from saoku -->\n`
}

export async function exportSpace(doc: WorkspaceDoc, sources: SourcesApi): Promise<Blob> {
  const files: Record<string, Uint8Array> = {}
  const exported: ExportedSource[] = []
  for (const meta of sources.sources) {
    const blob = sources.blob(meta.id)
    if (!blob) continue
    const file = `sources/${meta.id}__${safeName(meta.name)}`
    files[file] = new Uint8Array(await blob.arrayBuffer())
    exported.push({ ...meta, file })
  }
  files['document.md'] = strToU8(exportMarkdown(doc, sources))
  for (const name of ELEMENT_FILES) {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}elements/${name}`)
      if (res.ok) files[`elements/${name}`] = new Uint8Array(await res.arrayBuffer())
    } catch {
      // The bundle is a convenience; the export is complete without it.
    }
  }
  const manifest: SpaceManifest = { format: SPACE_FORMAT, version: SPACE_VERSION, exportedAt: Date.now(), title: doc.title, document: 'document.md', highlights: doc.highlights, quizAnswers: doc.quizAnswers, blockIds: doc.blockIds, blockMeta: doc.blockMeta, sources: exported }
  files['space.json'] = strToU8(JSON.stringify(manifest, null, 2))
  // Source files are already compressed (PDF, images); only the text is worth deflating.
  const zipped = zipSync(files, { level: 0 })
  return new Blob([zipped as BlobPart], { type: 'application/zip' })
}

export interface ImportedSpace {
  doc: WorkspaceDoc
  sources: { added: number; reused: number }
}

/** `space://old` → `space://new` everywhere in the markdown (footnotes, images). */
export function remapSourceIds(markdown: string, map: Map<string, string>): string {
  return markdown.replace(/space:\/\/([^\s/)#]+)/g, (m, id: string) => (map.has(id) ? `space://${map.get(id)}` : m))
}

/** Reads a space export (v1 blocks or v2 markdown), restores its sources, and returns the document with citations pointing at the restored ids. */
export async function importSpace(file: File, sources: SourcesApi): Promise<ImportedSpace> {
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()))
  const raw = entries['space.json']
  if (!raw) throw new Error('not a saoku space: space.json is missing')
  const manifest = JSON.parse(strFromU8(raw)) as Partial<SpaceManifest>
  if (manifest.format !== SPACE_FORMAT) throw new Error('not a saoku space: unexpected manifest')
  if ((manifest.version ?? 0) > SPACE_VERSION) throw new Error(`this space was exported by a newer saoku (format ${manifest.version})`)

  const restorable: { meta: Source; blob: Blob }[] = []
  const names = new Map<string, string>()
  for (const src of manifest.sources ?? []) {
    names.set(src.id, src.name)
    const data = entries[src.file]
    if (!data) continue
    const { file: _file, ...meta } = src
    restorable.push({ meta, blob: new Blob([data as BlobPart], { type: meta.mime }) })
  }
  const before = new Set(sources.sources.map((s) => s.id))
  const map = await sources.addImported(restorable)
  const nameOf = (id: string) => names.get(id) ?? sources.byId(id)?.name ?? id

  let doc: WorkspaceDoc
  if (manifest.document && entries[manifest.document]) {
    const md = strFromU8(entries[manifest.document]).replace(/\n<!--[^]*?-->\n?$/, '')
    const parsed = parseDocument(md, { extractTitle: true, ids: manifest.blockIds })
    const markdown = remapSourceIds(serializeDocument(parsed.blocks, parsed.footnotes, { sourceName: nameOf }), map)
    doc = { version: 2, title: manifest.title || parsed.title || 'Imported space', markdown, highlights: manifest.highlights ?? [], quizAnswers: manifest.quizAnswers ?? {}, blockIds: parsed.blocks.map((b) => b.id), blockMeta: manifest.blockMeta ?? {} }
  } else if (isLegacyDoc({ blocks: manifest.blocks })) {
    const legacy = migrateLegacy({ title: manifest.title ?? 'Imported space', blocks: manifest.blocks ?? [], highlights: manifest.highlights, quizAnswers: manifest.quizAnswers }, nameOf)
    doc = { ...legacy, markdown: remapSourceIds(legacy.markdown, map) }
  } else throw new Error('not a saoku space: no document inside')
  doc.highlights = doc.highlights.map((h) => ({ ...h, sourceId: map.get(h.sourceId) ?? h.sourceId }))

  let added = 0
  let reused = 0
  for (const id of map.values()) {
    if (before.has(id)) reused++
    else added++
  }
  return { doc, sources: { added, reused } }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
