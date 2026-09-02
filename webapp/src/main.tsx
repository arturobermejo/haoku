import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@fontsource/spectral/latin-400.css'
import '@fontsource/spectral/latin-400-italic.css'
import '@fontsource/spectral/latin-500.css'
import '@fontsource/spectral/latin-600.css'
import '@fontsource/space-grotesk/latin-400.css'
import '@fontsource/space-grotesk/latin-500.css'
import '@fontsource/space-grotesk/latin-600.css'
import '@fontsource/jetbrains-mono/latin-400.css'
import '@fontsource/jetbrains-mono/latin-500.css'

import './pdf/worker'
import './styles/global.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
