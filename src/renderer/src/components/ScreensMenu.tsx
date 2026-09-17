import { useEffect, useRef, useState } from 'react'
import type { DisplayInfo, OutputRole, OutputWindowInfo } from '@shared/types'
import { ROLES } from '@shared/screens'
import { useT } from '../state/i18n'
import { Select } from './Select'

export function ScreensMenu(): React.JSX.Element {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  const [outputs, setOutputs] = useState<OutputWindowInfo[]>([])
  const boxRef = useRef<HTMLDivElement>(null)

  const refresh = async (): Promise<void> => {
    setDisplays(await window.api.outputs.displays())
    setOutputs(await window.api.outputs.list())
  }

  useEffect(() => {
    void refresh()
    return window.api.outputs.onChanged(() => void refresh())
  }, [])

  useEffect(() => {
    if (open) void refresh()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const active = outputs.filter((o) => o.open)
  const single = displays.length < 2

  const show = (role: OutputRole, displayId: number): void => {
    void window.api.outputs.open(role, displayId)
  }
  const hide = (role: OutputRole): void => void window.api.outputs.close(role)

  return (
    <div className="screens" ref={boxRef}>
      <button
        className={`screens__button ${active.length ? 'is-on' : ''}`}
        onClick={() => setOpen(!open)}
      >
        {t('screens.button')}
        {active.length > 0 && <span className="screens__count">{active.length}</span>}
      </button>

      {open && (
        <div className="screens__menu">
          <div className="screens__head">{t('screens.where')}</div>

          {ROLES.map((role) => {
            const output = outputs.find((o) => o.role === role && o.open)
            return (
              <div className="screens__row" key={role}>
                <div className="screens__name">
                  {t(`screens.${role}`)}
                  <small>
                    {t(`screens.${role}Hint`)}

                    {!single && output?.windowed && ` · ${t('screens.windowed')}`}
                  </small>
                </div>

                {single ? (

                  <button
                    className={`screens__toggle ${output ? 'is-on' : ''}`}
                    onClick={() =>
                      output ? hide(role) : show(role, displays[0]?.id ?? 0)
                    }
                    disabled={displays.length === 0}
                  >
                    {output ? t('screens.turnOff') : t('screens.turnOn')}
                  </button>
                ) : (
                  <Select
                    value={String(output?.displayId ?? '')}
                    placeholder={t('screens.off')}
                    onChange={(v) => (v ? show(role, Number(v)) : hide(role))}
                    options={[
                      { value: '', label: t('screens.off') },
                      ...displays.map((d) => ({ value: String(d.id), label: d.label }))
                    ]}
                  />
                )}
              </div>
            )
          })}

          {single && <p className="note">{t('screens.single')}</p>}
        </div>
      )}
    </div>
  )
}
