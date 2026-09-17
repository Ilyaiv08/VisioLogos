import { useState } from 'react'
import { SEPARATOR, useContextMenu } from './ContextMenu'
import { GrowingText } from './GrowingText'
import { useT } from '../state/i18n'
import { useBible } from '../state/store'

export function PlanPanel(): React.JSX.Element {
  const t = useT()
  const s = useBible()
  const { open, menu } = useContextMenu()
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  const parse = (): void => {
    s.addToPlan(draft)
    setDraft('')
    setAdding(false)
  }

  const finishDrag = (): void => {
    if (dragIndex !== null && overIndex !== null && dragIndex !== overIndex) {
      s.reorderPlan(dragIndex, overIndex)
    }
    setDragIndex(null)
    setOverIndex(null)
  }

  return (
    <section className="panel">
      <header className="panel__title panel__title--row">
        <span>
          {t('plan.title')}
          {s.plan.length > 0 && ` · ${s.plan.length}`}
        </span>
        <span className="panel__actions">
          <button
            className="link"
            title={t('plan.pasteHint')}
            onClick={() => setAdding(!adding)}
          >
            {adding ? t('plan.collapse') : t('plan.addList')}
          </button>
          {s.plan.length > 0 && (
            <button className="link" onClick={() => s.clearPlan()} title={t('plan.clearAll')}>
              {t('plan.clear')}
            </button>
          )}
        </span>
      </header>

      <div className="panel__body">
        {adding && (
          <>
            <GrowingText
              className="plan__input"
              value={draft}
              autoFocus
              placeholder={t('plan.pastePlaceholder')}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) parse()
              }}
            />
            <button className="wide" onClick={parse} disabled={!draft.trim()}>
              {t('plan.parse')}
            </button>
          </>
        )}

        {s.plan.length === 0 && !adding && (
          <div className="hint">{t('plan.empty')}</div>
        )}

        <div className="plan__list" onDragEnd={finishDrag}>
          {s.plan.map((p, i) => (
            <div
              key={p.id}
              draggable
              className={[
                'plan__item',
                p.shown ? 'is-shown' : '',
                dragIndex === i ? 'is-dragging' : '',
                overIndex === i && dragIndex !== null && dragIndex !== i ? 'is-over' : ''
              ]
                .filter(Boolean)
                .join(' ')}
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => {
                e.preventDefault()
                setOverIndex(i)
              }}
              onDrop={(e) => {
                e.preventDefault()
                finishDrag()
              }}
              onClick={() => void s.goTo(p.book, p.chapter, p.from, p.to)}
              onDoubleClick={() => void s.goTo(p.book, p.chapter, p.from, p.to).then(s.show)}
              onContextMenu={(e) =>
                open(e, [
                  {
                    label: t('common.showInHall'),
                    hint: t('common.twoClicks'),
                    onClick: () =>
                      void s.goTo(p.book, p.chapter, p.from, p.to).then(s.show)
                  },
                  {
                    label: t('plan.openQuiet'),
                    onClick: () => void s.goTo(p.book, p.chapter, p.from, p.to)
                  },
                  SEPARATOR,
                  {
                    label: p.shown ? t('plan.unmark') : t('plan.markDone'),
                    onClick: () => s.togglePlanShown(p.id)
                  },
                  {
                    label: t('common.copyText'),
                    disabled: !p.text,
                    onClick: () => void navigator.clipboard.writeText(`${p.label} — ${p.text}`)
                  },
                  SEPARATOR,
                  {
                    label: t('plan.remove'),
                    danger: true,
                    onClick: () => s.removeFromPlan(p.id)
                  }
                ])
              }
              title={t('plan.itemHint')}
            >
              <span className="plan__grip">⠿</span>
              <span className="plan__ref">{p.label}</span>
              {p.text && <span className="plan__text">{p.text}</span>}
              <button
                className="plan__x"
                title={t('plan.remove')}
                onClick={(e) => {
                  e.stopPropagation()
                  s.removeFromPlan(p.id)
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      {menu}
    </section>
  )
}
