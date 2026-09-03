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
    window.saoku = bridge
    void register()
    return () => {
      unregister()
      setToolContext(null)
    }
  }, [])

  return null
}
