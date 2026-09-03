import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Asked for, not enforced: Vite still steps to the next free port when 5173 is taken.
  server: { port: 5173 },
})
