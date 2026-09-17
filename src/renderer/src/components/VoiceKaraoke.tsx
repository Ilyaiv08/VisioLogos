import { useMemo } from 'react'
import type { Key } from '@shared/i18n'
import { KARAOKE_COLORS, KARAOKE_LOOK } from '@shared/slide'
import { weighUpdate } from '@shared/update'
import { ColorPicker } from './ColorPicker'
import { Select } from './Select'
import { useT } from '../state/i18n'
import { useLive } from '../state/live'
import { useSongs } from '../state/songs'
import { grammarFor, useVoice, type VoiceStep } from '../state/voice'

const SLOWEST = 1200

export function VoiceKaraoke(): React.JSX.Element | null {
  const t = useT()
  const model = useVoice((s) => s.model)
  const busy = useVoice((s) => s.busy)
  const step = useVoice((s) => s.step)
  const error = useVoice((s) => s.error)
  const status = useVoice((s) => s.status)
  const devices = useVoice((s) => s.devices)
  const deviceId = useVoice((s) => s.deviceId)
  const on = useVoice((s) => s.on)
  const autoTurn = useVoice((s) => s.autoTurn)
  const autoColor = useVoice((s) => s.autoColor)
  const heard = useVoice((s) => s.heard)

  const slides = useSongs((s) => s.slides)
  const look = useLive((s) => s.live.karaokeLook) ?? KARAOKE_LOOK

  const grammar = useMemo(() => grammarFor(slides), [slides])
  const hasSong = slides.length > 0
  const ready = model?.installed === true

  if (!model) return null

  const chosen = devices.find((one) => one.id === deviceId)

  const overAir = /bluetooth|bt\b/i.test(`${chosen?.label ?? ''} ${status.using ?? ''}`)

  return (
    <div className="songctl">
      <div className="songctl__head">
        <span>{t('karaoke.title')}</span>
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
          <div className="control__pair">
            <button
              className={`chip ${on ? 'is-on' : ''}`}
              disabled={!hasSong}
              title={hasSong ? t('voice.hint') : t('voice.needSong')}
              onClick={() => void useVoice.getState().listen(!on, on ? null : grammar)}
            >
              {on ? t('voice.stop') : t('voice.listen')}
            </button>

            <label className="voice__turn" title={t('voice.autoTurnHint')}>
              <input
                type="checkbox"
                checked={autoTurn}
                onChange={(e) => useVoice.getState().setAutoTurn(e.target.checked)}
              />
              {t('voice.autoTurn')}
            </label>
          </div>

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

          <div className="field">
            {t('karaoke.color')}
            <ColorPicker
              value={look.color}
              presets={KARAOKE_COLORS}
              autoOn={autoColor}
              onChange={(hex) => void useVoice.getState().setLook({ color: hex })}
              onPickForBackground={() => void useVoice.getState().setAutoColor(true)}
            />
          </div>

          {autoColor && (
            <p className="voice__step">
              {(look.colors?.length ? look.colors : [look.color]).map((color, at) => (
                <span className="voice__chosen" key={at} style={{ background: color }} />
              ))}
              {t(look.colors && look.colors.length > 1 ? 'karaoke.autoLines' : 'karaoke.autoNow')}
            </p>
          )}

          <label className="voice__smooth">
            <span className="voice__label">{t('karaoke.smooth')}</span>
            <input
              type="range"
              min={0}
              max={SLOWEST}
              step={50}
              value={look.ms}
              onChange={(e) => void useVoice.getState().setLook({ ms: Number(e.target.value) })}
            />
            <b>
              {look.ms === 0
                ? t('karaoke.atOnce')
                : t('karaoke.seconds', { n: (look.ms / 1000).toFixed(2).replace('.', ',') })}
            </b>
          </label>
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
