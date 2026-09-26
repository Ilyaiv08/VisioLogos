import type { Key } from '@shared/i18n'
import { weighUpdate } from '@shared/update'
import { Select } from './Select'
import { useT, useTn } from '../state/i18n'
import { MAX_TIMES, useSongs } from '../state/songs'
import { useVoice, type VoiceStep } from '../state/voice'

export function VoiceFollow(): React.JSX.Element | null {
  const t = useT()
  const tn = useTn()
  const model = useVoice((s) => s.model)
  const busy = useVoice((s) => s.busy)
  const step = useVoice((s) => s.step)
  const error = useVoice((s) => s.error)
  const status = useVoice((s) => s.status)
  const devices = useVoice((s) => s.devices)
  const deviceId = useVoice((s) => s.deviceId)
  const on = useVoice((s) => s.on)
  const heard = useVoice((s) => s.heard)
  const sung = useVoice((s) => s.sung)

  const slides = useSongs((s) => s.slides)
  const index = useSongs((s) => s.index)

  if (!model) return null

  const hasSong = slides.length > 0
  const ready = model.installed
  const times = slides[index]?.times ?? 1

  const chosen = devices.find((one) => one.id === deviceId)
  const overAir = /bluetooth|bt\b/i.test(`${chosen?.label ?? ''} ${status.using ?? ''}`)

  const setTimes = (value: number): void => useSongs.getState().setTimes(index, value)

  return (
    <div className="songctl">
      <div className="songctl__head">
        <span>{t('voice.panel')}</span>
        {on && <b>{t(status.state === 'loading' ? 'voice.loading' : 'voice.listening')}</b>}
      </div>

      {!ready ? (
        <div className="voice__need">
          <p className="voice__hint">{t('voice.needModel')}</p>
          <div className="control__pair">
            <button
              className="chip"
              disabled={busy}
              onClick={() => void useVoice.getState().install()}
            >
              {t('voice.download')}
            </button>

            <button
              className="chip"
              disabled={busy}
              onClick={() => void useVoice.getState().installFile()}
            >
              {t('voice.fromDisk')}
            </button>
          </div>
          {step && <p className="voice__step">{stepWord(step, t)}</p>}
        </div>
      ) : (
        <>
          <button
            className={`chip voice__listen ${on ? 'is-on' : ''}`}
            disabled={!hasSong && !on}
            title={hasSong ? t('voice.hint') : t('voice.needSong')}
            onClick={() => void useVoice.getState().toggle()}
          >
            {on ? t('voice.stop') : t('voice.listen')}
          </button>

          {hasSong && (
            <div className="voice__times" title={t('voice.timesHint')}>
              <span>{t('voice.times')}</span>
              <button
                className="icon-btn"
                aria-label={t('voice.fewer')}
                disabled={times <= 1}
                onClick={() => setTimes(times - 1)}
              >
                −
              </button>
              <b>{tn('n.times', times)}</b>
              <button
                className="icon-btn"
                aria-label={t('voice.more')}
                disabled={times >= MAX_TIMES}
                onClick={() => setTimes(times + 1)}
              >
                +
              </button>
            </div>
          )}

          {on && sung && sung.slide === index && sung.times > 1 && (
            <p className="voice__step">{t('voice.pass', { n: sung.pass + 1, of: sung.times })}</p>
          )}

          <div className="voice__device">
            <span>{t('voice.device')}</span>
            <Select
              value={deviceId ?? ''}
              onChange={(v) => useVoice.getState().setDevice(v || null)}
              options={[
                { value: '', label: t('voice.deviceDefault') },
                ...devices.map((one) => ({ value: one.id, label: one.label }))
              ]}
            />
          </div>

          {overAir && <p className="voice__warn">{t('voice.overAir')}</p>}
          {on && status.using && !chosen && (
            <p className="voice__step">{t('voice.using', { name: status.using })}</p>
          )}

          {on && (
            <>
              <div className="voice__level" title={t('voice.silent')}>
                <span style={{ width: `${Math.round((status.level ?? 0) * 100)}%` }} />
              </div>
              {heard && <p className="voice__heard">{t('voice.heard', { text: heard })}</p>}
            </>
          )}
        </>
      )}

      {error && <p className="voice__error">{t('voice.failed', { why: error })}</p>}
      {ready && !on && !error && model.bytes > 0 && (
        <p className="voice__step">
          {t('voice.installed', { size: weighUpdate(model.bytes) })}
        </p>
      )}
    </div>
  )
}

function stepWord(
  step: VoiceStep,
  t: (key: Key, params?: Record<string, string | number>) => string
): string {
  if (step.stage === 'download') {
    const done = step.total
      ? `${weighUpdate(step.got ?? 0)} / ${weighUpdate(step.total)}`
      : weighUpdate(step.got ?? 0)
    return t('voice.downloading', { done })
  }

  return step.stage === 'save' ? t('voice.saving') : t('voice.asking')
}
