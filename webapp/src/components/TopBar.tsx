import { useSyncExternalStore } from 'react'
import { getStatus, subscribeStatus } from '../tools/webmcp'
import { useSources } from '../workspace/sources'
import { useWorkspace } from '../workspace/store'
import { EditableText } from './EditableText'
import './TopBar.css'

interface TopBarProps {
  showSources: boolean
  showContext: boolean
  onToggleSources: () => void
  onToggleContext: () => void
}

export function TopBar({ showSources, showContext, onToggleSources, onToggleContext }: TopBarProps) {
  const ws = useWorkspace()
  const { sources } = useSources()
  const webmcp = useSyncExternalStore(subscribeStatus, getStatus)

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span className="topbar-mark" aria-hidden="true" />
        <span className="topbar-name">saoku</span>
      </div>

      <div className="topbar-document">
        <EditableText value={ws.title} placeholder="name this space" className="topbar-title" onChange={ws.setTitle} />
        <span className="topbar-meta">
          {sources.length} {sources.length === 1 ? 'source' : 'sources'} · {ws.blocks.length} {ws.blocks.length === 1 ? 'block' : 'blocks'}
        </span>
      </div>

      <span
        className={`mono-label topbar-webmcp${webmcp.registered > 0 ? ' is-on' : ''}`}
        title={webmcp.registered > 0 ? `${webmcp.registered} tools registered on ${webmcp.api}` : (webmcp.error ?? 'WebMCP not registered')}
      >
        webmcp{webmcp.registered > 0 ? ` · ${webmcp.registered}` : ''}
      </span>

      <button type="button" className={`control${showSources ? '' : ' is-off'}`} onClick={onToggleSources} aria-pressed={showSources}>
        sources
      </button>
      <button type="button" className={`control${showContext ? '' : ' is-off'}`} onClick={onToggleContext} aria-pressed={showContext} disabled={ws.viewer !== null}>
        context
      </button>
    </header>
  )
}
