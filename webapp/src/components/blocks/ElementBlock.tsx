import { useEffect, useRef } from 'react'
import '../../elements'
import type { ParsedBlock } from '../../workspace/markdown/types'
import { useWorkspace } from '../../workspace/store'

type ElementData = Extract<ParsedBlock['data'], { kind: 'callout' | 'diagram' | 'flashcards' | 'quiz' }>

/**
 * A `<space-*>` custom element driven from React: data goes in as a property, picks and reveals as
 * attributes. Its `space-change` / `space-answer` / `space-reveal` events are handled by the document.
 */
export function ElementBlock({ block, data, print = false }: { block: ParsedBlock; data: ElementData; print?: boolean }) {
  const ws = useWorkspace()
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current as (HTMLElement & { data: unknown }) | null
    if (!el) return
    const { kind: _kind, cites: _cites, ...payload } = data
    el.data = payload
  }, [data])

  const prefix = `${block.id}:`
  const answers = Object.entries(ws.quizAnswers)
    .filter(([k]) => k.startsWith(prefix))
    .map(([k, v]) => `${k.slice(prefix.length)}:${v}`)
    .join(' ')
  const revealed = Object.entries(ws.revealed)
    .filter(([k, v]) => v && k.startsWith(prefix))
    .map(([k]) => k.slice(prefix.length))
    .join(' ')
  const common = print ? { print: '' } : { editable: '', answers, revealed }

  switch (data.kind) {
    case 'callout':
      return <space-callout ref={ref} {...common} />
    case 'diagram':
      return <space-diagram ref={ref} {...common} />
    case 'flashcards':
      return <space-flashcards ref={ref} {...common} />
    case 'quiz':
      return <space-quiz ref={ref} {...common} />
  }
}
