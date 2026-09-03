/**
 * Registers the catalog on whichever WebMCP API the browser carries, and keeps
 * a direct bridge so the same tools can be driven without browser support.
 */
import { runTool, TOOLS, type ToolContext, type ToolResult } from './catalog'

interface ModelContextTool {
  name: string
  title?: string
  description: string
  inputSchema?: object
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean }
  execute: (input: object, options: { signal?: AbortSignal }) => Promise<unknown>
}

interface ModelContext {
  registerTool(tool: ModelContextTool, options?: { signal?: AbortSignal }): Promise<void>
  getTools?(): Promise<ModelContextTool[]>
  executeTool?(tool: ModelContextTool, input?: object): Promise<string>
}

declare global {
  interface Document {
    modelContext?: ModelContext
  }
  interface Navigator {
    modelContext?: ModelContext
  }
  interface Window {
    saoku?: SaokuBridge
  }
}

export interface WebMcpStatus {
  supported: boolean
  api: string | null
  registered: number
  failed: { name: string; reason: string }[]
  error: string | null
}

export interface SaokuBridge {
  tools: {
    list: () => Omit<ModelContextTool, 'execute'>[]
    call: (name: string, input?: unknown) => Promise<ToolResult>
    register: () => Promise<WebMcpStatus>
    unregister: () => WebMcpStatus
    status: () => WebMcpStatus
  }
}

/** What the tools are doing right now, for the floating badge. */
export interface ToolRun {
  id: number
  name: string
  /** The main argument, for display: open_source("s4"). */
  detail?: string
  startedAt: number
  endedAt?: number
  ok?: boolean
  summary?: string
}

export interface ToolActivity {
  running: ToolRun[]
  /** The last few finished runs, newest first. */
  finished: ToolRun[]
}

let activity: ToolActivity = { running: [], finished: [] }
let runSeq = 0
const activityListeners = new Set<() => void>()

function publishActivity(next: ToolActivity) {
  activity = next
  activityListeners.forEach((l) => l())
}

export function subscribeActivity(listener: () => void): () => void {
  activityListeners.add(listener)
  return () => activityListeners.delete(listener)
}

export function getActivity(): ToolActivity {
  return activity
}

/** Runs a tool and reports its start and end to the activity feed. Every entry point goes through here. */
const DETAIL_KEYS = ['block_id', 'source', 'source_id', 'query', 'quote', 'type', 'markdown', 'block_ids', 'steps']

function detailOf(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined
  const obj = input as Record<string, unknown>
  for (const key of DETAIL_KEYS) {
    const v = obj[key]
    if (typeof v === 'string') return v.length > 28 ? `${v.slice(0, 28)}…` : v
    if (typeof v === 'number') return String(v)
    if (Array.isArray(v) && v.length) return `${v.length} items`
  }
  return undefined
}

async function trackedRun(name: string, input: unknown): Promise<ToolResult> {
  const run: ToolRun = { id: ++runSeq, name, detail: detailOf(input), startedAt: Date.now() }
  publishActivity({ ...activity, running: [...activity.running, run] })
  const result = await runTool(name, input, currentContext)
  const done: ToolRun = { ...run, endedAt: Date.now(), ok: result.ok, summary: result.ok ? result.summary : result.error }
  publishActivity({ running: activity.running.filter((r) => r.id !== run.id), finished: [done, ...activity.finished].slice(0, 5) })
  return result
}

let status: WebMcpStatus = { supported: false, api: null, registered: 0, failed: [], error: null }
let controller: AbortController | null = null
let currentContext: ToolContext | null = null
const listeners = new Set<() => void>()

function publish(next: WebMcpStatus) {
  status = next
  listeners.forEach((l) => l())
}

export function subscribeStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getStatus(): WebMcpStatus {
  return status
}

/** The tools read the reader through this; it is swapped as the document or state changes. */
export function setToolContext(ctx: ToolContext | null) {
  currentContext = ctx
}

function detect(): { mc: ModelContext; api: string } | null {
  if (typeof document.modelContext?.registerTool === 'function') return { mc: document.modelContext, api: 'document.modelContext' }
  if (typeof navigator.modelContext?.registerTool === 'function') return { mc: navigator.modelContext, api: 'navigator.modelContext (deprecated)' }
  return null
}

export async function register(): Promise<WebMcpStatus> {
  if (controller) return status
  const ctx = detect()
  if (!ctx) {
    publish({ supported: false, api: null, registered: 0, failed: [], error: !window.isSecureContext ? 'WebMCP needs a secure context: HTTPS or localhost.' : 'This browser does not carry the WebMCP API.' })
    return status
  }
  controller = new AbortController()
  const next: WebMcpStatus = { supported: true, api: ctx.api, registered: 0, failed: [], error: null }
  for (const tool of TOOLS) {
    try {
      await ctx.mc.registerTool(
        {
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: tool.annotations ?? {},
          execute: (input) => trackedRun(tool.name, input),
        },
        { signal: controller.signal },
      )
      next.registered++
    } catch (err: unknown) {
      next.failed.push({ name: tool.name, reason: err instanceof Error ? err.message : String(err) })
    }
  }
  publish(next)
  return status
}

export function unregister(): WebMcpStatus {
  controller?.abort()
  controller = null
  publish({ ...status, registered: 0 })
  return status
}

export const bridge: SaokuBridge = {
  tools: {
    list: () => TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations })),
    call: (name, input) => trackedRun(name, input),
    register,
    unregister,
    status: getStatus,
  },
}
