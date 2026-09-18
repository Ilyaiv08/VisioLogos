import { useCallback, useEffect, useState } from 'react'
import type { CatalogSong, CatalogTab } from '@shared/types'
import { Modal } from './Modal'
import { SEPARATOR, useContextMenu, type MenuEntry } from './ContextMenu'
import { droppedPaths, hasFiles } from '../lib/dropFiles'
import { NOTICE_MS, NOTICE_TROUBLE_MS, useAutoHide } from '../lib/fading'
import { useCatalog } from '../state/catalog'
import { useT } from '../state/i18n'

export function CatalogBox(): React.JSX.Element {
  const t = useT()
  const c = useCatalog()
  const { open, menu } = useContextMenu()

  const [editTab, setEditTab] = useState<string | null>(null)
  const [editSong, setEditSong] = useState<string | null>(null)

  const [over, setOver] = useState<string | null>(null)
  const [dropping, setDropping] = useState(false)

  useEffect(() => {
    void c.init()

  }, [])

  const hideNotice = useCallback(() => useCatalog.getState().say(null), [])
  const leavingNotice = useAutoHide(
    c.notice,
    hideNotice,
    c.notice && c.notice.includes('\n') ? NOTICE_TROUBLE_MS : NOTICE_MS
  )

  const searching = c.query.trim().length > 0
  const songs = c.visible()
  const tabName = (id: string): string => c.tabs.find((tab) => tab.id === id)?.name ?? ''

  const dropOnTab = (e: React.DragEvent, tabId: string): void => {
    e.preventDefault()
    e.stopPropagation()
    setOver(null)

    if (hasFiles(e)) {
      void droppedPaths(e).then((paths) => c.addFiles(paths, tabId))
      return
    }

    const data = e.dataTransfer.getData('text/plain')
    if (data.startsWith('cat:')) void c.moveSong(data.slice(4), tabId)
  }

  const tabMenu = (tab: CatalogTab, at: number): MenuEntry[] => [
    {
      label: t('common.rename'),
      hint: t('common.twoClicks'),
      onClick: () => setEditTab(tab.id)
    },
    { label: t('catalog.tabLeft'), disabled: at === 0, onClick: () => void c.moveTab(tab.id, -1) },
    {
      label: t('catalog.tabRight'),
      disabled: at === c.tabs.length - 1,
      onClick: () => void c.moveTab(tab.id, 1)
    },
    SEPARATOR,
    {
      label: t('catalog.removeTab'),
      hint: t('catalog.removeTabHint'),
      danger: true,
      disabled: c.tabs.length < 2,
      onClick: () => void c.removeTab(tab.id)
    }
  ]

  const songMenu = (song: CatalogSong): MenuEntry[] => [
    { label: t('catalog.take'), hint: t('catalog.takeHint'), onClick: () => void c.take(song.id) },
    {
      label: t('common.rename'),
      hint: t('common.twoClicks'),
      onClick: () => setEditSong(song.id)
    },
    {
      label: t('catalog.moveTo'),
      children: c.tabs.map((tab) => ({
        label: tab.name,
        disabled: tab.id === song.tabId,
        onClick: () => void c.moveSong(song.id, tab.id)
      }))
    },
    SEPARATOR,
    {
      label: t('catalog.removeNamed', { title: song.title.slice(0, 24) }),
      danger: true,
      onClick: () => void c.removeSong(song.id)
    }
  ]

  const commit = (value: string, was: string, save: (name: string) => void): void => {
    const name = value.trim()
    if (name && name !== was) save(name)
  }

  const nameField = (
    was: string,
    save: (name: string) => void,
    done: () => void
  ): React.JSX.Element => (
    <input
      className="cat__edit"
      autoFocus
      defaultValue={was}
      onFocus={(e) => e.target.select()}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => {
        commit(e.target.value, was, save)
        done()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()

        if (e.key === 'Escape') {
          e.currentTarget.value = was
          done()
        }
      }}
    />
  )

  return (
    <Modal title={t('catalog.title')} wide>
      <div className="cat">

        <div className="cat__bar">
          <input
            className="cat__search"
            value={c.query}
            placeholder={t('catalog.search')}
            title={t('catalog.searchAll')}
            onChange={(e) => c.setQuery(e.target.value)}
          />
          {c.query && (
            <button className="cat__clear" title={t('common.hide')} onClick={() => c.setQuery('')}>
              ✕
            </button>
          )}
          <span className="cat__total">
            {searching
              ? t('catalog.found', { n: songs.length, total: c.songs.length })
              : t('catalog.count', { n: c.songs.length })}
          </span>
        </div>

        <div className="cat__tabs">
          {c.tabs.map((tab, at) => {
            const inside = c.songs.filter((song) => song.tabId === tab.id).length
            return (
              <div
                key={tab.id}
                className={
                  `cat__tab ${c.tabId === tab.id && !searching ? 'is-active' : ''} ` +
                  `${over === tab.id ? 'is-over' : ''}`
                }
                title={t('catalog.tabDrop')}
                onClick={() => c.setTab(tab.id)}
                onDoubleClick={() => setEditTab(tab.id)}
                onContextMenu={(e) => open(e, tabMenu(tab, at))}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setOver(tab.id)
                }}
                onDragLeave={() => setOver((v) => (v === tab.id ? null : v))}
                onDrop={(e) => dropOnTab(e, tab.id)}
              >
                {editTab === tab.id ? (
                  nameField(
                    tab.name,
                    (name) => void c.renameTab(tab.id, name),
                    () => setEditTab(null)
                  )
                ) : (
                  <>
                    <span className="cat__tabname">{tab.name}</span>
                    <span className="cat__badge">{inside}</span>
                  </>
                )}
              </div>
            )
          })}

          <button className="cat__add" title={t('catalog.addTabHint')} onClick={() => void c.addTab()}>
            {t('catalog.addTab')}
          </button>
        </div>

        <div
          className={`cat__list ${dropping ? 'is-dropping' : ''}`}
          onDragOver={(e) => {
            if (!hasFiles(e)) return
            e.preventDefault()
            setDropping(true)
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false)
          }}
          onDrop={(e) => {
            if (!hasFiles(e)) return
            e.preventDefault()
            setDropping(false)
            void droppedPaths(e).then((paths) => c.addFiles(paths))
          }}
        >
          {songs.length === 0 && (
            <div className="cat__empty">
              {searching
                ? t('catalog.nothingFound')
                : c.songs.length === 0
                  ? t('catalog.empty')
                  : t('catalog.emptyTab')}
            </div>
          )}

          {songs.map((song) => (
            <div
              key={song.id}
              className={`cat__song ${c.pickedId === song.id ? 'is-picked' : ''}`}
              draggable={editSong !== song.id}
              onDragStart={(e) => e.dataTransfer.setData('text/plain', `cat:${song.id}`)}
              onClick={() => c.pick(song.id)}
              onDoubleClick={() => editSong !== song.id && void c.take(song.id)}
              onContextMenu={(e) => open(e, songMenu(song))}
            >
              {editSong === song.id ? (
                nameField(
                  song.title,
                  (name) => void c.renameSong(song.id, name),
                  () => setEditSong(null)
                )
              ) : (
                <>

                  <span className="cat__num">{song.number || '·'}</span>
                  <span className="cat__name">{song.title}</span>

                  {searching && <span className="cat__where">{tabName(song.tabId)}</span>}

                  <button
                    className="cat__take"
                    title={t('catalog.takeHint')}
                    onClick={(e) => {
                      e.stopPropagation()
                      void c.take(song.id)
                    }}
                  >
                    {t('catalog.take')}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        {c.notice && (
          <div className={`cat__notice fading ${leavingNotice ? 'is-leaving' : ''}`}>
            <div className="cat__noticerow">
              <b>{c.notice.split('\n')[0]}</b>
              <button className="link" onClick={() => c.say(null)} title={t('common.hide')}>
                ✕
              </button>
            </div>
            {c.notice
              .split('\n')
              .slice(1)
              .map((line, at) => (
                <p className="note" key={at}>
                  {line}
                </p>
              ))}
          </div>
        )}

        <button
          className="wide"
          disabled={c.busy || c.tabs.length === 0}
          title={t('catalog.importHint')}
          onClick={() => void c.importFiles()}
        >
          {t('catalog.import')}
        </button>
      </div>

      {menu}
    </Modal>
  )
}
