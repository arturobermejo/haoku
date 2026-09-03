import { getDocument } from 'pdfjs-dist'
import type { PdfDoc, PageDims } from './types'

/** Titles that generators stamp on documents nobody named. */
const PLACEHOLDER_TITLES = new Set(['untitled', 'untitled document', 'document'])

function titleFromMetadata(info: unknown): string | null {
  if (!info || typeof info !== 'object') return null
  const title = (info as { Title?: unknown }).Title
  if (typeof title !== 'string') return null
  const trimmed = title.trim()
  if (trimmed.length === 0 || PLACEHOLDER_TITLES.has(trimmed.toLowerCase())) return null
  return trimmed
}

function titleFromFileName(fileName: string): string {
  return fileName.replace(/\.pdf$/i, '')
}

/** Parses a PDF blob and measures every page at scale 1, ready for the workspace. */
export async function openDocument(source: Blob, fileName: string): Promise<PdfDoc> {
  const data = await source.arrayBuffer()
  const proxy = await getDocument({ data }).promise

  const pageNumbers = Array.from({ length: proxy.numPages }, (_, i) => i + 1)
  const pages: PageDims[] = await Promise.all(
    pageNumbers.map(async (n) => {
      const page = await proxy.getPage(n)
      const viewport = page.getViewport({ scale: 1 })
      return { width: viewport.width, height: viewport.height, userUnit: page.userUnit }
    }),
  )

  let title: string | null = null
  try {
    const { info } = await proxy.getMetadata()
    title = titleFromMetadata(info)
  } catch {
    // Broken or missing metadata is common; the file name is a fine title.
  }

  return {
    proxy,
    fingerprint: proxy.fingerprints[0] ?? fileName,
    title: title ?? titleFromFileName(fileName),
    fileName,
    pageCount: proxy.numPages,
    pages,
  }
}

/** Releases the worker resources held by an open document. */
export function closeDocument(doc: PdfDoc): void {
  void doc.proxy.loadingTask.destroy()
}
