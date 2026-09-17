import type { DisplayInfo } from '@shared/types'
import { screenLabel } from '@shared/screens'
import { useT } from '../state/i18n'
import { useScreen } from '../state/screen'

export function ScreenPicker(): React.JSX.Element | null {
  const t = useT()
  const displays = useScreen((s) => s.displays)
  const previewId = useScreen((s) => s.previewId)
  const pick = useScreen((s) => s.pick)

  if (displays.length === 0) return null

  return (
    <div className="screenpick">
      <div className="screenpick__title">{t('screens.pickTitle')}</div>

      {displays.map((screen, at) => (
        <button
          key={screen.id}
          className={`screenpick__item ${screen.id === previewId ? 'is-active' : ''}`}
          title={t('screens.pickHint', { size: screenLabel(screen) })}
          onClick={() => pick(screen.id)}
        >
          <b>{screenLabel(screen)}</b>
          <span className="screenpick__where">{whose(screen, at, t)}</span>
        </button>
      ))}
    </div>
  )
}

type T = ReturnType<typeof useT>

function whose(screen: DisplayInfo, at: number, t: T): string {
  if (screen.assignedRole) return t(`screens.${screen.assignedRole}`)
  if (screen.isControl) return t('screens.here')
  return t('screens.nth', { n: at + 1 })
}
