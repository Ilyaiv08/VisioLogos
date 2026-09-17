import { useEffect } from 'react'
import { partTitle } from '@shared/songs'
import { LookTabs, ScreenChips, type ControlTarget } from './ControlPanel'
import { VoiceKaraoke } from './VoiceKaraoke'
import { useT } from '../state/i18n'
import { useLive } from '../state/live'
import { useSongs } from '../state/songs'

interface Props {
  target: ControlTarget
}

export function SongControlPanel({ target }: Props): React.JSX.Element {
  const t = useT()
  const s = useSongs()
  const live = useLive((x) => x.live)
  const clear = useLive((x) => x.clear)

  const setStage = useLive((x) => x.setStage)

  const nextSlide = s.slides[s.index + 1]
  const nextPart = nextSlide
    ? s.draft?.parts.find((p) => p.id === nextSlide.partId)
    : undefined
  const nextTitle = nextPart ? partTitle(nextPart) : null
  const nextLines = (nextSlide?.slide.blocks ?? []).map((b) => b.html).join('\n')

  useEffect(() => {
    void setStage({
      nextTitle,
      nextLines: nextLines ? nextLines.split('\n') : []
    })

  }, [nextTitle, nextLines, setStage])

  return (
    <div className="control">
      <div className="control__nav control__nav--pair">
        <button
          className="icon-btn"
          title={t('common.prevSlide')}
          onClick={() => void s.step(-1)}
          disabled={s.index === 0}
        >
          ◀
        </button>
        <button
          className="icon-btn"
          title={t('common.nextSlide')}
          onClick={() => void s.step(1)}
          disabled={s.index >= s.slides.length - 1}
        >
          ▶
        </button>
      </div>

      <div className="control__main">
        <button
          className="btn-show"
          onClick={() => void s.show()}
          disabled={s.slides.length === 0}
          title={t('common.space')}
        >
          {t('common.show')}
        </button>
        <button
          className="btn-hide"
          onClick={() => void clear()}
          disabled={!live.slide}
          title="Esc"
        >
          {t('common.hide')}
        </button>
      </div>

      <ScreenChips />

      <VoiceKaraoke />

      <LookTabs target={target} />
    </div>
  )
}
