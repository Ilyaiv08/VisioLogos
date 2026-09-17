import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useHoldDrag } from '../lib/dragless'

export interface MenuItem {
  label: string

  hint?: string
  disabled?: boolean
  danger?: boolean

  checked?: boolean

  swatch?: React.ReactNode

  children?: MenuEntry[]
  onClick?: () => void
}

export const SEPARATOR = 'separator' as const

export interface MenuHeader {
  header: string
}

export type MenuEntry = MenuItem | MenuHeader | typeof SEPARATOR

interface MenuState {
  x: number
  y: number
  entries: MenuEntry[]
}

export function useContextMenu(): {
  open: (e: React.MouseEvent, entries: MenuEntry[]) => void
  menu: React.ReactNode
} {
  const [state, setState] = useState<MenuState | null>(null)

  const open = useCallback((e: React.MouseEvent, entries: MenuEntry[]) => {
    e.preventDefault()
    e.stopPropagation()
    if (entries.length === 0) return

    const noPointer = e.clientX === 0 && e.clientY === 0
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect()

    setState({
      x: noPointer ? box.left : e.clientX,
      y: noPointer ? box.bottom + 4 : e.clientY,
      entries
    })
  }, [])

  const close = useCallback(() => setState(null), [])

  useHoldDrag(state !== null)

  useEffect(() => {
    if (!state) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close()
      }
    }

    window.addEventListener('keydown', onKey, true)
    window.addEventListener('mousedown', close)
    window.addEventListener('wheel', close, { passive: true })
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mousedown', close)
      window.removeEventListener('wheel', close)
      window.removeEventListener('blur', close)
    }
  }, [state, close])

  return {
    open,
    menu: state ? <Menu state={state} onClose={close} /> : null
  }
}

export function MenuPanel({
  entries,
  onClose,
  nested = false,
  style
}: {
  entries: MenuEntry[]
  onClose: () => void
  nested?: boolean
  style?: React.CSSProperties
}): React.JSX.Element {
  const [sub, setSub] = useState<number | null>(null)

  const marks = entries.some((e) => e !== SEPARATOR && 'checked' in e && e.checked !== undefined)

  return (
    <div
      className={`ctxmenu ${nested ? 'ctxmenu--nested' : ''}`}
      style={style}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {entries.map((entry, i) => {
        if (entry === SEPARATOR) return <div key={i} className="ctxmenu__sep" />

        if ('header' in entry)
          return (
            <div key={i} className="ctxmenu__head">
              {entry.header}
            </div>
          )

        const label = (
          <span className="ctxmenu__label">
            {marks && <i className="ctxmenu__mark">{entry.checked ? '✓' : ''}</i>}
            {entry.swatch}
            {entry.label}
          </span>
        )

        if (entry.children) {
          return (
            <div
              key={i}
              className="ctxmenu__nest"
              onMouseEnter={() => setSub(i)}
              onMouseLeave={() => setSub((v) => (v === i ? null : v))}
            >
              <button className="ctxmenu__item" disabled={entry.disabled}>
                {label}
                <kbd>▸</kbd>
              </button>
              {sub === i && !entry.disabled && (
                <MenuPanel entries={entry.children} onClose={onClose} nested />
              )}
            </div>
          )
        }

        return (
          <button
            key={i}
            className={`ctxmenu__item ${entry.danger ? 'is-danger' : ''}`}
            disabled={entry.disabled}
            onMouseEnter={() => setSub(null)}
            onClick={() => {
              onClose()
              entry.onClick?.()
            }}
          >
            {label}
            {entry.hint && <kbd>{entry.hint}</kbd>}
          </button>
        )
      })}
    </div>
  )
}

function Menu({ state, onClose }: { state: MenuState; onClose: () => void }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: state.x, top: state.y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const pad = 8
    setPos({
      left: Math.min(state.x, window.innerWidth - width - pad),
      top:
        state.y + height + pad > window.innerHeight
          ? Math.max(pad, state.y - height)
          : state.y
    })
  }, [state])

  return (
    <div ref={ref} className="ctxmenu__at" style={pos}>
      <MenuPanel entries={state.entries} onClose={onClose} />
    </div>
  )
}
