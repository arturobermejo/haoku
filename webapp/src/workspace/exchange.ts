import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import type { SourcesApi } from './sources'
import type { Block, Citation, Highlight, Source, WorkspaceDoc } from './types'

/** A space export: `space.json` plus every source file under `sources/`. */
export const SPACE_FORMAT = 'saoku-space'
export const SPACE_VERSION = 1

interface ExportedSource extends Source {
  /** Path inside the zip. */
  file: string
}

interface SpaceManifest {
  format: typeof SPACE_FORMAT
  version: number
  exportedAt: number
  title: string
  blocks: Block[]
  highlights: Highlight[]
  quizAnswers: Record<string, number>
  sources: ExportedSource[]
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
  const manifest: SpaceManifest = { format: SPACE_FORMAT, version: SPACE_VERSION, exportedAt: Date.now(), title: doc.title, blocks: doc.blocks, highlights: doc.highlights, quizAnswers: doc.quizAnswers, sources: exported }
  files['space.json'] = strToU8(JSON.stringify(manifest, null, 2))
  // Source files are already compressed (PDF, images); only the manifest is worth deflating.
  const zipped = zipSync(files, { level: 0 })
  return new Blob([zipped as BlobPart], { type: 'application/zip' })
}

export interface ImportedSpace {
  doc: WorkspaceDoc
  sources: { added: number; reused: number }
}

/** Reads a space export, restores its sources, and returns the document with citations pointing at the restored ids. */
export async function importSpace(file: File, sources: SourcesApi): Promise<ImportedSpace> {
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()))
  const raw = entries['space.json']
  if (!raw) throw new Error('not a saoku space: space.json is missing')
  const manifest = JSON.parse(strFromU8(raw)) as Partial<SpaceManifest>
  if (manifest.format !== SPACE_FORMAT || !Array.isArray(manifest.blocks)) throw new Error('not a saoku space: unexpected manifest')
  if ((manifest.version ?? 0) > SPACE_VERSION) throw new Error(`this space was exported by a newer saoku (format ${manifest.version})`)

  const restorable: { meta: Source; blob: Blob }[] = []
  for (const src of manifest.sources ?? []) {
    const data = entries[src.file]
    if (!data) continue
    const { file: _file, ...meta } = src
    restorable.push({ meta, blob: new Blob([data as BlobPart], { type: meta.mime }) })
  }
  const before = new Set(sources.sources.map((s) => s.id))
  const map = await sources.addImported(restorable)
  const remap = (c: Citation): Citation => ({ ...c, sourceId: map.get(c.sourceId) ?? c.sourceId })
  const blocks = manifest.blocks.map((b): Block => {
    const content = b.content
    const next =
      content.type === 'diagram'
        ? { ...content, nodes: content.nodes.map((n) => (n.citation ? { ...n, citation: remap(n.citation) } : n)) }
        : content.type === 'flashcards'
          ? { ...content, cards: content.cards.map((k) => (k.citation ? { ...k, citation: remap(k.citation) } : k)) }
          : content.type === 'image'
            ? { ...content, sourceId: map.get(content.sourceId) ?? content.sourceId }
            : content
    return { ...b, content: next, citations: (b.citations ?? []).map(remap) }
  })
  const highlights = (manifest.highlights ?? []).map((h) => ({ ...h, sourceId: map.get(h.sourceId) ?? h.sourceId }))
  let added = 0
  let reused = 0
  for (const id of map.values()) {
    if (before.has(id)) reused++
    else added++
  }
  return { doc: { title: manifest.title || 'Imported space', blocks, highlights, quizAnswers: manifest.quizAnswers ?? {} }, sources: { added, reused } }
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
