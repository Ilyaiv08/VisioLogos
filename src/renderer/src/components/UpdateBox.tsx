import { useState } from 'react'
import { weighUpdate } from '@shared/update'
import { useT } from '../state/i18n'
import { useService } from '../state/service'
import { useUi } from '../state/ui'
import { useUpdate } from '../state/update'
import { Modal } from './Modal'

export function UpdateBox(): React.JSX.Element {
  const t = useT()
  const { news, step, install } = useUpdate()
  const running = useService((s) => s.running)
  const [sure, setSure] = useState(false)

  const busy = step !== null && step.stage !== 'error'
  const failed = step?.stage === 'error' ? step.error : null

  return (
    <Modal title={t('update.title')}>
      {!news ? (
        <p className="note">{t('update.none')}</p>
      ) : (
        <div className="update">
          <div className="update__version">
            {t('update.newVersion', { version: news.version })}
            <span className="update__size"> · {weighUpdate(news.bytes)}</span>
          </div>
          <p className="note dim">{t('update.yours', { version: news.current })}</p>

          {news.why ? (
            <>

              <p className="note note--warn">
                {news.why === 'portable' ? t('update.portable') : t('update.cantHere')}
              </p>
              <button onClick={() => void window.api.update.openPage()}>
                {t('update.openSite')}
              </button>
            </>
          ) : (
            <>
              <p className="note">{t('update.what')}</p>

              {running && !busy && (
                <p className="note note--warn">{t('update.running')}</p>
              )}

              {busy ? (
                <>
                  <div className="module__bar">
                    <div
                      className="module__bar-fill"
                      style={{
                        width:
                          step.total > 0
                            ? `${Math.min(100, (step.got / step.total) * 100)}%`
                            : '30%'
                      }}
                    />
                  </div>
                  <p className="note">
                    {step.stage === 'download'
                      ? t('update.downloading', {
                          got: weighUpdate(step.got),
                          total: weighUpdate(step.total || news.bytes)
                        })
                      : step.stage === 'check'
                        ? t('update.checking')
                        : t('update.starting')}
                  </p>
                </>
              ) : (
                <div className="update__act">
                  <button
                    className="btn-show"
                    onClick={() => {

                      if (running && !sure) {
                        setSure(true)
                        return
                      }
                      void install()
                    }}
                  >
                    {running && sure ? t('common.sure') : t('update.now')}
                  </button>
                  <button onClick={() => useUi.getState().setDialog(null)}>
                    {t('update.later')}
                  </button>
                </div>
              )}

              {failed && (
                <>
                  <p className="note note--warn">{failed}</p>
                  <button onClick={() => void window.api.update.showFile()}>
                    {t('update.showFile')}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  )
}

export function UpdateButton(): React.JSX.Element | null {
  const t = useT()
  const news = useUpdate((s) => s.news)
  if (!news) return null

  return (
    <button
      className="menubar__update"
      title={t('update.buttonHint', { version: news.version })}
      onClick={() => useUi.getState().setDialog('update')}
    >
      {t('update.button')}
    </button>
  )
}
