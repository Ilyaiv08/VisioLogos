import { useEffect, useRef, useState } from 'react'
import { useT } from '../state/i18n'

interface Props {
  axis: 'x' | 'y'

  size: number
  onResize: (size: number) => void

  inverted?: boolean
  title?: string
}

export function Splitter({ axis, size, onResize, inverted, title }: Props): React.JSX.Element {
  const t = useT()
  const [dragging, setDragging] = useState(false)
  const start = useRef({ pos: 0, size: 0 })

  useEffect(() => {
    if (!dragging) return

    const move = (e: MouseEvent): void => {
      const now = axis === 'x' ? e.clientX : e.clientY
      const delta = (now - start.current.pos) * (inverted ? -1 : 1)
      onResize(start.current.size + delta)
    }
    const up = (): void => setDragging(false)

    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)

    document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'

    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [dragging, axis, inverted, onResize])

  return (
    <div
      className={`splitter splitter--${axis} ${dragging ? 'is-dragging' : ''}`}
      title={title ?? t('common.dragToResize')}
      onMouseDown={(e) => {
        e.preventDefault()
        start.current = { pos: axis === 'x' ? e.clientX : e.clientY, size }
        setDragging(true)
      }}
    >
      <span className="splitter__grip" />
    </div>
  )
}
