import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useHoldDrag } from '../lib/dragless'
import { useT } from '../state/i18n'

export interface SelectOption {
  value: string
  label: string

  hint?: string

  style?: React.CSSProperties
  disabled?: boolean
}

interface Props {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  placeholder?: string
  title?: string
  className?: string
  disabled?: boolean

  footer?: React.ReactNode

  onRemove?: (value: string) => void
  removeTitle?: string
}

export function Select({
  value,
  options,
  onChange,
  placeholder,
  title,
  className,
  disabled,
  footer,
  onRemove,
  removeTitle
}: Props): React.JSX.Element {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [armed, setArmed] = useState<string | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.value === value)

  const openList = (): void => {
    if (disabled) return
    setActive(Math.max(0, options.findIndex((o) => o.value === value)))
    setArmed(null)
    setOpen(true)
  }

  const pick = (option: SelectOption): void => {
    if (option.disabled) return
    setOpen(false)
    if (option.value !== value) onChange(option.value)
  }

  useHoldDrag(open)

  useLayoutEffect(() => {
    if (!open) return
    const trigger = triggerRef.current
    const list = listRef.current
    if (!trigger || !list) return

    const t = trigger.getBoundingClientRect()
    const h = list.getBoundingClientRect().height
    const gap = 6
    const below = t.bottom + gap + h <= window.innerHeight - 8

    setPos({
      left: Math.min(t.left, window.innerWidth - t.width - 8),
      top: below ? t.bottom + gap : Math.max(8, t.top - gap - h),
      width: t.width
    })
  }, [open, options.length])

  useEffect(() => {
    if (!open) return
    const close = (): void => setOpen(false)

    const onWheel = (e: WheelEvent): void => {
      if (listRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }

    window.addEventListener('mousedown', close)
    window.addEventListener('resize', close)
    window.addEventListener('wheel', onWheel, { passive: true, capture: true })
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('wheel', onWheel, { capture: true })
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    listRef.current
      ?.querySelectorAll<HTMLElement>('.select__option')
      [active]?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        openList()
      }
      return
    }

    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        break
      case 'ArrowDown':
        e.preventDefault()
        setActive((i) => Math.min(options.length - 1, i + 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActive((i) => Math.max(0, i - 1))
        break
      case 'Home':
        e.preventDefault()
        setActive(0)
        break
      case 'End':
        e.preventDefault()
        setActive(options.length - 1)
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (options[active]) pick(options[active])
        break
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`select ${open ? 'is-open' : ''} ${className ?? ''}`}
        title={title ?? selected?.label}
        disabled={disabled}
        onMouseDown={(e) => {
          e.stopPropagation()
          open ? setOpen(false) : openList()
        }}
        onKeyDown={onKeyDown}
      >
        <span className="select__value" style={selected?.style}>
          {selected?.label ?? placeholder ?? t('common.notSelected')}
        </span>
        <span className="select__chevron" aria-hidden>
          ⌄
        </span>
      </button>

      {open && (
        <div
          ref={listRef}
          className="select__list"
          style={{
            left: pos?.left ?? -9999,
            top: pos?.top ?? -9999,
            minWidth: pos?.width,
            visibility: pos ? 'visible' : 'hidden'
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >

          <div className="select__scroll">
            {options.map((o, i) => (
              <div className="select__row" key={o.value}>
                <button
                  type="button"
                  className={[
                    'select__option',
                    o.value === value ? 'is-selected' : '',
                    i === active ? 'is-active' : ''
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  disabled={o.disabled}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(o)}
                >
                  <span className="select__label" style={o.style}>
                    {o.label}
                    {o.hint && <small>{o.hint}</small>}
                  </span>
                  {o.value === value && <span className="select__check">✓</span>}
                </button>

                {onRemove && (
                  <button
                    type="button"
                    className={`select__drop ${armed === o.value ? 'is-armed' : ''}`}
                    title={armed === o.value ? t('common.sure') : (removeTitle ?? '')}
                    onMouseEnter={() => setActive(i)}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (armed !== o.value) {
                        setArmed(o.value)
                        return
                      }
                      setArmed(null)
                      onRemove(o.value)
                    }}
                  >
                    {armed === o.value ? t('common.sure') : '✕'}
                  </button>
                )}
              </div>
            ))}
          </div>

          {footer && (
            <div className="select__foot" onClick={() => setOpen(false)}>
              {footer}
            </div>
          )}
        </div>
      )}
    </>
  )
}
