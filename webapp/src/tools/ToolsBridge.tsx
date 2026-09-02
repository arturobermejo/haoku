import { useEffect, useRef } from 'react'
import { useAugmentations } from '../augment/store'
import { useWorkspace } from '../components/workspaceContext'
import type { PdfDoc } from '../pdf/types'
import type { ToolContext } from './catalog'
import { indexPage } from './textIndex'
import { bridge, register, setToolContext, unregister } from './webmcp'

/** Mounts inside the workspace: keeps the tools pointed at the live reader and registers them with WebMCP. */
export function ToolsBridge({ doc }: { doc: PdfDoc }) {
  const aug = useAugmentations()
  const ws = useWorkspace()
  const ctx = useRef<ToolContext | null>(null)

  useEffect(() => {
    ctx.current = { doc, aug, ws, index: (page) => indexPage(doc.proxy, page) }
    setToolContext(ctx.current)
  }, [doc, aug, ws])

  useEffect(() => {
    window.saoku = bridge
    void register()
    return () => {
      unregister()
      setToolContext(null)
    }
  }, [doc])

  return null
}
