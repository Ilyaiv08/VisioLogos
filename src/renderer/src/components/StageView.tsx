import { useEffect, useState } from 'react'
import type { LiveState } from '@shared/types'
import { SlideView } from './SlideView'
import { useT } from '../state/i18n'

export function StageView({ live }: { live: LiveState | null }): React.JSX.Element {
  const t = useT()
  const now = useClock()
  const stage = live?.stage

  return (
    <div className="stage">
      <div className="stage__main">
        <SlideView
          slide={live?.slide ?? null}
          lowerThird={live?.lowerThird ?? null}
          karaoke={live?.karaoke ?? null}
          karaokeWord={live?.karaokeWord ?? null}
          karaokeLook={live?.karaokeLook ?? null}
          blackout={live?.blackout ?? false}
          hideText={live?.hideText ?? false}
        />
      </div>

      <div className="stage__side">
        <div className="stage__clock">
          <b>{now.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}</b>
          {stage?.startedAt && <span>{elapsed(stage.startedAt, now)}</span>}
        </div>

        <div className="stage__block stage__block--next">
          <span className="stage__label">{t('home.next')}</span>
          {stage?.nextTitle ? (
            <>
              <b className="stage__next-title">{stage.nextTitle}</b>
              {stage.nextLines.map((line, i) => (
                <span key={i} className="stage__next-line">
                  {line}
                </span>
              ))}
            </>
          ) : (
            <span className="stage__next-line">—</span>
          )}
        </div>
      </div>
    </div>
  )
}

function useClock(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

function elapsed(from: number, now: Date): string {
  const total = Math.max(0, Math.floor((now.getTime() - from) / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}
