/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** GA4 measurement id (G-XXXXXXXXXX). Unset in development, so nothing is loaded. */
  readonly VITE_GA_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
