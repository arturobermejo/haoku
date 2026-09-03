import { useEffect, useState, useSyncExternalStore } from 'react'
import { getActivity, subscribeActivity, type ToolRun } from './webmcp'
import './ToolActivityBadge.css'

/** How long a finished run stays on screen. */
const LINGER = 1800

/** A pill at the bottom of the workspace that shows which tool an agent is running. */
export function ToolActivityBadge() {
  const activity = useSyncExternalStore(subscribeActivity, getActivity)
  const [now, setNow] = useState(() => Date.now())

  const running = activity.running
  const latest: ToolRun | undefined = activity.finished[0]
  const lingering = latest && latest.endedAt !== undefined && now - latest.endedAt < LINGER ? latest : undefined

  // Re-render once the linger window closes so the badge can leave.
  useEffect(() => {
    if (!latest?.endedAt) return
    const remaining = LINGER - (Date.now() - latest.endedAt)
    if (remaining <= 0) return
    const timer = window.setTimeout(() => setNow(Date.now()), remaining + 20)
    return () => window.clearTimeout(timer)
  }, [latest])

  const current = running[running.length - 1] ?? lingering
  if (!current) return null

  const state = running.length > 0 ? 'running' : lingering?.ok ? 'done' : 'failed'
  const extra = running.length > 1 ? ` +${running.length - 1}` : ''

  return (
    <div className={`tool-badge tool-badge--${state}`} role="status" aria-live="polite" title={lingering?.summary ?? `running ${current.name}`}>
      <span className="tool-badge-dot" aria-hidden="true" />
      <span className="tool-badge-label">webmcp</span>
      <span className="tool-badge-name">
        {current.name}
        {extra}
      </span>
      <span className="tool-badge-state">{state === 'running' ? 'running…' : state === 'done' ? 'done' : 'failed'}</span>
    </div>
  )
}
