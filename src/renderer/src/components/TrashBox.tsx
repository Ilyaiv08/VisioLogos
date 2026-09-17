import { useEffect, useState } from 'react'
import type { TrashEntry, TrashKind } from '@shared/types'
import { Modal } from './Modal'
import { useT, useTn } from '../state/i18n'
import { useService } from '../state/service'
import { useSongs } from '../state/songs'
import { useTexts } from '../state/texts'

const KINDS: TrashKind[] = ['song', 'text', 'service']

export function TrashBox(): React.JSX.Element {
  const t = useT()
  const tn = useTn()
  const [kind, setKind] = useState<TrashKind>('song')
  const [entries, setEntries] = useState<TrashEntry[] | null>(null)

  const [sure, setSure] = useState(false)

  const refresh = async (): Promise<void> => setEntries(await window.api.trash.list())

  useEffect(() => {
    void refresh()
  }, [])

  useEffect(() => setSure(false), [kind])

  const reload = async (of: TrashKind): Promise<void> => {
    if (of === 'song') await useSongs.getState().init()
    else if (of === 'text') await useTexts.getState().init()
    else await useService.getState().init()
    await refresh()
  }

  const restore = async (entry: TrashEntry): Promise<void> => {
    await window.api.trash.restore(entry.kind, entry.id)
    await reload(entry.kind)
  }

  const purge = async (entry: TrashEntry): Promise<void> => {
    await window.api.trash.purge(entry.kind, entry.id)
    await refresh()
  }

  const clear = async (): Promise<void> => {
    if (!sure) {
      setSure(true)
      return
    }
    await window.api.trash.clear(kind)
    setSure(false)
    await refresh()
  }

  const count = (of: TrashKind): number =>
    entries?.filter((entry) => entry.kind === of).length ?? 0
  const rows = entries?.filter((entry) => entry.kind === kind) ?? []

  return (
    <Modal title={t('trash.title')}>
      <div className="subtabs subtabs--trash">
        {KINDS.map((item) => (
          <button
            key={item}
            className={`subtabs__item ${kind === item ? 'is-active' : ''}`}
            onClick={() => setKind(item)}
          >
            {t(`trash.${item}s` as 'trash.songs')}
            {count(item) > 0 && <i className="subtabs__count">{count(item)}</i>}
          </button>
        ))}
      </div>

      {entries === null ? (
        <div className="trash__box" />
      ) : rows.length === 0 ? (
        <div className="trash__box trash__empty">
          <BinMark />
          <b>{t('trash.emptyTitle')}</b>
          <span>{t('trash.empty')}</span>
        </div>
      ) : (
        <div className="trash__box trash">
          {rows.map((entry) => (
            <div className="trash__row" key={`${entry.kind}:${entry.id}`}>
              <div className="trash__what">
                <span className="trash__title">{entry.title || t('common.untitled')}</span>
                <small>
                  {[
                    entry.count > 0 &&
                      tn(entry.kind === 'song' ? 'n.part' : 'n.item', entry.count),
                    deletedWhen(entry, t)
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </small>
              </div>
              <div className="trash__acts">
                <button className="link" onClick={() => void restore(entry)}>
                  {t('trash.restore')}
                </button>
                <button
                  className="link is-danger"
                  title={t('trash.purgeHint')}
                  onClick={() => void purge(entry)}
                >
                  {t('trash.purge')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div className="trash__foot">
          <button
            className={`wide ${sure ? 'is-danger' : ''}`}
            onClick={() => void clear()}
            onMouseLeave={() => setSure(false)}
          >
            {sure ? t('trash.clearSure') : t('trash.clear')}
          </button>
          <p className="note">{t('trash.note')}</p>
        </div>
      )}
    </Modal>
  )
}

function BinMark(): React.JSX.Element {
  return (
    <svg
      className="trash__mark"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 7h16" />
      <path d="M9 7V5.6A1.6 1.6 0 0 1 10.6 4h2.8A1.6 1.6 0 0 1 15 5.6V7" />
      <path d="M6.6 7l.8 11.2A2 2 0 0 0 9.4 20h5.2a2 2 0 0 0 2-1.8L17.4 7" />
      <path d="M10.2 11v5M13.8 11v5" />
    </svg>
  )
}

function deletedWhen(entry: TrashEntry, t: (key: 'trash.deleted') => string): string {
  if (!entry.deletedAt) return ''
  const when = new Date(entry.deletedAt).toLocaleString(undefined, {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit'
  })
  return `${t('trash.deleted')} ${when}`
}
