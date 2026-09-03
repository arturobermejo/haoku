import { GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// Imported once from main.tsx so every getDocument() call finds the worker.
GlobalWorkerOptions.workerSrc = workerUrl
