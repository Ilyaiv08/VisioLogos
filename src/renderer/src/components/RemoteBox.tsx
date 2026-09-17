import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import { useT } from '../state/i18n'
import { useRemote } from '../state/remote'

export function RemoteBox(): React.JSX.Element {
  const t = useT()
  const { on, setOn, global: globalOn, setGlobal, devices, looking, scan, lastKey, lastAt } =
    useRemote()
  const [heard, setHeard] = useState(lastAt)

  useEffect(() => {
    void scan()

  }, [])

  const pressed = lastAt !== null && lastAt !== heard ? lastKey : null

  const likely = devices.filter((d) => d.likely)
  const rest = devices.filter((d) => !d.likely)

  return (
    <Modal title={t('remote.title')}>
      <p className="note">{t('remote.what')}</p>

      <div className="keys">
        <div className="keys__group">{t('remote.keysGroup')}</div>
        <div className="keys__row">
          <kbd>Page Down</kbd>
          <span>{t('remote.next')}</span>
        </div>
        <div className="keys__row">
          <kbd>Page Up</kbd>
          <span>{t('remote.prev')}</span>
        </div>
        <div className="keys__row">
          <kbd>F5</kbd>
          <span>{t('remote.show')}</span>
        </div>
        <div className="keys__row">
          <kbd>Esc</kbd>
          <span>{t('remote.clear')}</span>
        </div>
        <div className="keys__row">
          <kbd>.</kbd>
          <span>{t('remote.blackout')}</span>
        </div>
      </div>

      <label className="bgscope" title={t('remote.listenHint')}>
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
        <span>{t('remote.listen')}</span>
      </label>

      <label className="bgscope" title={t('remote.globalHint')}>
        <input
          type="checkbox"
          checked={globalOn}
          disabled={!on}
          onChange={(e) => setGlobal(e.target.checked)}
        />
        <span>{t('remote.global')}</span>
      </label>

      <p className="note">{t('remote.followsScreen')}</p>

      <div className="remote__test">
        <b>{pressed ? t('remote.works', { key: keyName(pressed) }) : t('remote.press')}</b>
        {pressed && (
          <button className="link" onClick={() => setHeard(lastAt)}>
            {t('remote.again')}
          </button>
        )}
      </div>

      <div className="keys">
        <div className="keys__group">{t('remote.devices')}</div>

        {looking && <p className="note">{t('remote.looking')}</p>}

        {!looking && likely.length === 0 && (
          <p className="note">{t('remote.nothingLikely')}</p>
        )}

        {likely.map((device) => (
          <p className="note" key={device.name}>
            <b>{device.name}</b>
          </p>
        ))}

        {rest.length > 0 && (
          <details className="remote__rest">
            <summary>{t('remote.others', { n: rest.length })}</summary>
            {rest.map((device) => (
              <p className="note" key={device.name}>
                {device.name}
              </p>
            ))}
          </details>
        )}

        <button className="wide" disabled={looking} onClick={() => void scan(true)}>
          {t('remote.refresh')}
        </button>
      </div>
    </Modal>
  )
}

function keyName(code: string): string {
  if (code === 'PageDown') return 'Page Down'
  if (code === 'PageUp') return 'Page Up'
  if (code === 'Period' || code === 'NumpadDecimal') return '.'
  return code
}
