import { useEffect, useState } from 'react'
import { ContextPanel } from './components/ContextPanel'
import { Document } from './components/Document'
import { SourcesPanel } from './components/SourcesPanel'
import { SourceViewer } from './components/SourceViewer'
import { TopBar } from './components/TopBar'
import { useMediaQuery } from './hooks/useMediaQuery'
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

/**
 * Three layouts by width: wide keeps sources · document · context side by side; merged (under 1180px)
 * stacks sources over context in one rail; compact (under 760px) turns that rail into a drawer.
 */
function Shell() {
  const ws = useWorkspace()
  const sources = useSources()
  const merged = useMediaQuery('(max-width: 1179px)')
  const compact = useMediaQuery('(max-width: 759px)')
  const [showSources, setShowSources] = useState(true)
  const [showContext, setShowContext] = useState(true)

  // Derived during render: a phone-sized window starts with the drawer closed (leaving that size restores
  // the panels), and opening a source from the drawer closes the drawer so the viewer gets the width.
  const [seen, setSeen] = useState({ compact, viewerKey: ws.viewer?.key })
  if (seen.compact !== compact) {
    setSeen({ compact, viewerKey: ws.viewer?.key })
    setShowSources(!compact)
    setShowContext(!compact)
  } else if (seen.viewerKey !== ws.viewer?.key) {
    setSeen({ compact, viewerKey: ws.viewer?.key })
    if (compact && ws.viewer) {
      setShowSources(false)
      setShowContext(false)
    }
  }

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

  const viewer = ws.viewer ? <SourceViewer target={ws.viewer} /> : null
  const closeRail = () => {
    setShowSources(false)
    setShowContext(false)
  }

  let body: React.ReactNode
  let className: string
  if (merged) {
    // One rail carries both panels; with a source open it steps aside (or, when compact, so does the document).
    const railOpen = (showSources || showContext) && !(ws.viewer && !compact)
    className = ['app', compact ? 'app--compact' : 'app--merged', railOpen ? '' : 'app--no-rail', ws.viewer ? 'app--viewer' : ''].filter(Boolean).join(' ')
    body = (
      <>
        {railOpen && (
          <aside className="rail">
            {showSources && <SourcesPanel />}
            {showContext && <ContextPanel />}
          </aside>
        )}
        {railOpen && compact && <div className="rail-backdrop" onClick={closeRail} />}
        <Document />
        {viewer}
      </>
    )
  } else {
    const right = viewer ?? (showContext ? <ContextPanel /> : null)
    className = ['app', showSources ? '' : 'app--no-sources', right ? '' : 'app--no-right', ws.viewer ? 'app--viewer' : ''].filter(Boolean).join(' ')
    body = (
      <>
        {showSources && <SourcesPanel />}
        <Document />
        {right}
      </>
    )
  }

  return (
    <div className={className}>
      <TopBar showSources={showSources} showContext={showContext} onToggleSources={() => setShowSources((v) => !v)} onToggleContext={() => setShowContext((v) => !v)} />
      <div className="shell">{body}</div>
      <ToolsBridge />
      <ToolActivityBadge />
    </div>
  )
}
