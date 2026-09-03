import { useEffect, useRef } from 'react'
import { useSources } from '../workspace/sources'
import { useWorkspace } from '../workspace/store'
import type { ToolContext } from './catalog'
import { bridge, register, setToolContext, unregister } from './webmcp'

/** Keeps the tools pointed at the live workspace and registers them with WebMCP. */
export function ToolsBridge() {
  const ws = useWorkspace()
  const sources = useSources()
  const ctx = useRef<ToolContext | null>(null)

  useEffect(() => {
    ctx.current = { ws, sources }
    setToolContext(ctx.current)
  }, [ws, sources])

  useEffect(() => {
    // After a hot reload the cleanup below may have run last; point the tools at the live workspace again.
    if (ctx.current) setToolContext(ctx.current)
    window.haoku = bridge
    void register()
    return () => {
      unregister()
      setToolContext(null)
    }
  }, [])

  return null
}
