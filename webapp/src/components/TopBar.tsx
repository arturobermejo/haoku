import { useSyncExternalStore } from 'react'
import { useAugmentations } from '../augment/store'
import { getStatus, subscribeStatus } from '../tools/webmcp'
import './TopBar.css'

interface TopBarProps {
  title: string
  pageCount: number
  currentPage: number
  /** Effective zoom, 1 = PDF points at 96dpi. */
  scale: number
  onZoomIn: () => void
  onZoomOut: () => void
  onFitWidth: () => void
  onReadingWidth: () => void
  onClose: () => void
}

export function TopBar({ title, pageCount, currentPage, scale, onZoomIn, onZoomOut, onFitWidth, onReadingWidth, onClose }: TopBarProps) {
  const aug = useAugmentations()
  const webmcp = useSyncExternalStore(subscribeStatus, getStatus)

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span className="topbar-mark" aria-hidden="true" />
        <span className="topbar-name">saoku</span>
      </div>

      <div className="topbar-document">
        <span className="topbar-title" title={title}>
          {title}
        </span>
        <span className="topbar-meta">{pageCount} pp</span>
      </div>

      {aug.shownCount + aug.inTextCount > 0 && (
        <span className="mono-label topbar-counter">
          {aug.shownCount} shown · {aug.inTextCount} in text
        </span>
      )}
      <button type="button" className={`control${aug.threadsOn ? '' : ' is-off'}`} onClick={aug.toggleThreads} aria-pressed={aug.threadsOn}>
        threads
      </button>
      <button type="button" className="control" onClick={aug.tidy}>
        tidy up
      </button>

      <span
        className={`mono-label topbar-webmcp${webmcp.registered > 0 ? ' is-on' : ''}`}
        title={webmcp.registered > 0 ? `${webmcp.registered} tools registered on ${webmcp.api}` : (webmcp.error ?? 'WebMCP not registered')}
      >
        webmcp{webmcp.registered > 0 ? ` · ${webmcp.registered}` : ''}
      </span>

      <span className="mono-label topbar-page">
        p. {currentPage} / {pageCount}
      </span>

      <div className="topbar-zoom" role="group" aria-label="Zoom">
        <button type="button" className="control" onClick={onZoomOut} aria-label="Zoom out">
          −
        </button>
        <button type="button" className="control topbar-zoom-value" onClick={onReadingWidth} title="Reading width">
          {Math.round(scale * 100)}%
        </button>
        <button type="button" className="control" onClick={onZoomIn} aria-label="Zoom in">
          +
        </button>
        <button type="button" className="control" onClick={onFitWidth}>
          fit
        </button>
      </div>

      <button type="button" className="control" onClick={onClose}>
        close
      </button>
    </header>
  )
}
