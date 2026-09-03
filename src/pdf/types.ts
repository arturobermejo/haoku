import type { PDFDocumentProxy } from 'pdfjs-dist'

/** Size of a page at scale 1 with its /Rotate applied. Every bbox is expressed against this. */
export interface PageDims {
  width: number
  height: number
  /** PDF user unit; pdf.js text layer needs it alongside the scale. */
  userUnit: number
}

export interface PdfDoc {
  proxy: PDFDocumentProxy
  /** pdf.js fingerprint; keys everything persisted about this document. */
  fingerprint: string
  /** Metadata title, falling back to the file name. */
  title: string
  fileName: string
  pageCount: number
  /** Indexed by page number − 1. */
  pages: PageDims[]
}
