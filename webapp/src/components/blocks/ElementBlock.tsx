import { useEffect, useRef } from 'react'
import '../../elements'
import type { ParsedBlock } from '../../workspace/markdown/types'

type ElementData = Extract<ParsedBlock['data'], { kind: 'callout' | 'diagram' }>

/**
 * A `<space-*>` custom element driven from React: data goes in as a property, editing is on while the
 * document is editable. Its `space-change` event is handled by the document.
 */
export function ElementBlock({ data, print = false }: { data: ElementData; print?: boolean }) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current as (HTMLElement & { data: unknown }) | null
    if (!el) return
    const { kind: _kind, cites: _cites, ...payload } = data
    el.data = payload
  }, [data])

  const common = print ? { print: '' } : { editable: '' }

  switch (data.kind) {
    case 'callout':
      return <space-callout ref={ref} {...common} />
    case 'diagram':
      return <space-diagram ref={ref} {...common} />
  }
}
