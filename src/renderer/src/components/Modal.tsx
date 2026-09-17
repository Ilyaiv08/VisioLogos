import { useEffect } from 'react'
import { useHoldDrag } from '../lib/dragless'
import { useT } from '../state/i18n'
import { useUi } from '../state/ui'

export function Modal({
  title,
  children,
  wide
}: {
  title: string
  children: React.ReactNode

  wide?: boolean
}): React.JSX.Element {
  const t = useT()
  const close = (): void => useUi.getState().setDialog(null)

  useHoldDrag(true)

  useEffect(() => {
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close()
      }
    }
    window.addEventListener('keydown', esc, true)
    return () => window.removeEventListener('keydown', esc, true)
  }, [])

  return (
    <div className="modal" onMouseDown={close}>
      <div
        className={`modal__box ${wide ? 'modal__box--wide' : ''}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="modal__head">
          <b>{title}</b>
          <button className="link" onClick={close} title={t('about.closeHint')}>
            ✕
          </button>
        </header>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  )
}
