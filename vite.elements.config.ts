import { defineConfig } from 'vite'

/** Standalone bundle of the space-* elements: drop `space-elements.js` next to an exported .md page. */
export default defineConfig({
  // Do not copy public/ into the bundle folder (it lives inside public/ itself).
  publicDir: false,
  build: {
    lib: {
      entry: 'src/elements/index.ts',
      name: 'SpaceElements',
      formats: ['iife'],
      fileName: () => 'space-elements.js',
      cssFileName: 'space-elements',
    },
    outDir: 'public/elements',
    emptyOutDir: true,
    cssCodeSplit: false,
  },
})
