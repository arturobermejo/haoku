import { useEffect, useState } from 'react'
import { ContextPanel } from './components/ContextPanel'
import { Document } from './components/Document'
import { SourcesPanel } from './components/SourcesPanel'
import { SourceViewer } from './components/SourceViewer'
import { TopBar } from './components/TopBar'
import { ToolActivityBadge } from './tools/ToolActivityBadge'
import { ToolsBridge } from './tools/ToolsBridge'
import { SourcesProvider, useSources } from './workspace/sources'
import { useWorkspace, WorkspaceProvider } from './workspace/store'
import './App.css'

export default function App() {
  return (
    <SourcesProvider>
      <WorkspaceProvider>
        <Shell />
      </WorkspaceProvider>
    </SourcesProvider>
  )
}

function Shell() {
  const ws = useWorkspace()
  const sources = useSources()
  const [showSources, setShowSources] = useState(true)
  const [showContext, setShowContext] = useState(true)

  // ⌘Z / ⌃Z undo, ⇧⌘Z / ⌃Y redo — unless the user is typing somewhere.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null
      if (target && (target.closest('input, textarea, [contenteditable="true"]') || target.isContentEditable)) return
      if (!(event.metaKey || event.ctrlKey)) return
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) {
        if (ws.undo()) event.preventDefault()
      } else if ((key === 'z' && event.shiftKey) || (key === 'y' && event.ctrlKey)) {
        if (ws.redo()) event.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ws])

  if (!ws.loaded || !sources.loaded) return <div className="app-restoring canvas-grid" />

  const right = ws.viewer ? <SourceViewer target={ws.viewer} /> : showContext ? <ContextPanel /> : null
  const className = ['app', showSources ? '' : 'app--no-sources', right ? '' : 'app--no-right', ws.viewer ? 'app--viewer' : ''].filter(Boolean).join(' ')

  return (
    <div className={className}>
      <TopBar showSources={showSources} showContext={showContext} onToggleSources={() => setShowSources((v) => !v)} onToggleContext={() => setShowContext((v) => !v)} />
      <div className="shell">
        {showSources && <SourcesPanel />}
        <Document />
        {right}
      </div>
      <ToolsBridge />
      <ToolActivityBadge />
    </div>
  )
}
