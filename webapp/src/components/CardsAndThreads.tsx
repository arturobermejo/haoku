import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { anchorPoint, CARD_WIDTH, defaultPlacement } from '../augment/geometry'
import { useAugmentations } from '../augment/store'
import { anchorsOf, hasCard, KIND_META, kindOf, pageOf, type Augmentation } from '../augment/types'
import { Card } from './Card'
import { useWorkspace } from './workspaceContext'

interface Laid {
  item: Augmentation
  left: number
  top: number
}

interface Drag {
  id: string
  startX: number
  startY: number
  originLeft: number
  originTop: number
  left: number
  top: number
}

/** The two workspace layers above the document: floating cards and the threads tying them to their anchors. */
export function CardsAndThreads() {
  const aug = useAugmentations()
  const ws = useWorkspace()
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  useEffect(() => {
    dragRef.current = drag
  }, [drag])

  const indexByPage = new Map<number, number>()
  const laid: Laid[] = aug.items
    .filter((i) => hasCard(i) && !i.folded)
    .map((item) => {
      const page = pageOf(item)
      const index = indexByPage.get(page) ?? 0
      indexByPage.set(page, index + 1)
      const placement = item.placement ?? defaultPlacement(anchorsOf(item)[0], ws.pageDims(page).width, index, ws.scale)
      const p = ws.pageToInner(placement.page, placement.dx, placement.dy)
      if (drag && drag.id === item.id) return { item, left: drag.left, top: drag.top }
      return { item, left: p.x, top: p.y }
    })

  const startDrag = (laidItem: Laid) => (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as Element
    if (target.closest('button, textarea, input, .editable')) return
    event.preventDefault()
    aug.select(laidItem.item.id)
    setDrag({ id: laidItem.item.id, startX: event.clientX, startY: event.clientY, originLeft: laidItem.left, originTop: laidItem.top, left: laidItem.left, top: laidItem.top })
  }

  useEffect(() => {
    if (!drag) return
    const onMove = (event: PointerEvent) => {
      setDrag((d) => (d ? { ...d, left: d.originLeft + event.clientX - d.startX, top: d.originTop + event.clientY - d.startY } : d))
    }
    const onUp = () => {
      const d = dragRef.current
      if (d) {
        const item = aug.byId(d.id)
        if (item) {
          const page = pageOf(item)
          const p = ws.innerToPage(page, d.left, d.top)
          aug.place(d.id, { page, dx: p.x, dy: p.y })
        }
      }
      setDrag(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [drag !== null, aug, ws]) // eslint-disable-line react-hooks/exhaustive-deps

  const threads: { d: string; ax: number; ay: number; dot: string; selected: boolean; key: string }[] = []
  if (aug.threadsOn) {
    for (const { item, left, top } of laid) {
      const anchors = anchorsOf(item)
      if (anchors.length === 0 || anchors.length > 2) continue
      const dot = KIND_META[kindOf(item)].accent
      anchors.forEach((anchor, i) => {
        const frame = ws.frames.get(anchor.page)
        if (!frame) return
        const cardCenter = left + CARD_WIDTH / 2
        const side = cardCenter < frame.left + frame.width / 2 ? 'left' : 'right'
        const p = anchorPoint(anchor, side)
        const a = ws.pageToInner(anchor.page, p.x, p.y)
        const toRight = left > a.x
        const cx = toRight ? left : left + CARD_WIDTH
        const cy = top + 26 + i * 16
        const mid = (a.x + cx) / 2
        threads.push({
          key: `${item.id}-${i}`,
          d: `M ${a.x} ${a.y} C ${mid} ${a.y}, ${mid} ${cy}, ${cx} ${cy}`,
          ax: a.x,
          ay: a.y,
          dot,
          selected: aug.selectedId === item.id,
        })
      })
    }
  }

  return (
    <>
      <svg className="workspace-threads" aria-hidden="true">
        {threads.map((t) => (
          <g key={t.key}>
            <path d={t.d} fill="none" stroke={t.selected ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.17)'} strokeWidth="1.3" strokeDasharray={t.selected ? '0' : '3 4'} />
            <circle cx={t.ax} cy={t.ay} r="3.5" fill={t.dot} />
          </g>
        ))}
        {ws.halo && <circle key={ws.halo.key} className="halo" cx={ws.halo.x} cy={ws.halo.y} r="16" fill="none" stroke="var(--link)" strokeWidth="1.5" />}
      </svg>
      <div className="workspace-cards">
        {laid.map((l, index) => (
          <Card
            key={l.item.id}
            item={l.item}
            left={l.left}
            top={l.top}
            zIndex={aug.selectedId === l.item.id ? 100 : 6 + index}
            dragging={drag?.id === l.item.id}
            onDragStart={startDrag(l)}
          />
        ))}
      </div>
    </>
  )
}
