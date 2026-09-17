import { useEffect, useRef, useState } from 'react'
import type { ServiceItem } from '@shared/types'
import { dropIndex, itemKindLabel } from '@shared/service'
import { pathOf } from '@shared/tree'
import { SEPARATOR, useContextMenu, type MenuEntry } from '../components/ContextMenu'
import { ScreenChips } from '../components/ControlPanel'
import { FolderTree, type TreeItem } from '../components/FolderTree'
import { SlideView } from '../components/SlideView'
import { Splitter } from '../components/Splitter'
import { droppedPaths, hasFiles } from '../lib/dropFiles'
import { deckSlideUrl } from '@shared/decks'
import { useDecks } from '../state/decks'
import { useT, useTn } from '../state/i18n'
import { useShot } from '../state/screen'
import { ScreenPicker } from '../components/ScreenPicker'
import { useLive } from '../state/live'
import { columnsTemplate, useLayout } from '../state/layout'
import { useService, type DropReport } from '../state/service'
import { useSongs } from '../state/songs'
import { useBible } from '../state/store'
import { useTexts } from '../state/texts'
import { useTree } from '../state/tree'
import { useUi } from '../state/ui'

export function HomeTab(): React.JSX.Element {
  const t = useT()

  const shot = useShot()
  const s = useService()
  const live = useLive((x) => x.live)
  const songs = useSongs((x) => x.items)
  const texts = useTexts((x) => x.items)
  const folders = useTree((x) => x.folders)
  const layout = useLayout((x) => x.byTab.home)
  const { setTop, setCol, reset } = useLayout()
  const { open, menu } = useContextMenu()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const [trouble, setTrouble] = useState<string | null>(null)
  const [report, setReport] = useState<DropReport | null>(null)

  const [dropping, setDropping] = useState(false)

  const [drag, setDrag] = useState<{ from: number; at: number } | null>(null)

  const rootRef = useRef<HTMLDivElement>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const resizeCol =
    (row: 'topCols' | 'bottomCols', index: number) =>
    (px: number): void => {
      const box = row === 'topCols' ? topRef.current : bottomRef.current
      setCol('home', row, index, px, box?.clientWidth ?? window.innerWidth)
    }

  const folder = s.folders.find((f) => f.id === s.activeId) ?? null

  const stripAt = s.cursor
  const where = folder ? pathOf(folders, folder.folderId ?? null) : []

  const goPick = (tab: 'songs' | 'texts' | 'bible'): void => useUi.getState().goEdit(tab)

  const tell = (result: DropReport): void => {
    setReport(result.added > 0 || result.skipped.length > 0 ? result : null)
  }

  const take = (what: 'decks' | 'photos' | 'folder'): void => {
    setBusy(true)
    void s
      .addDecks(what)
      .then(tell)
      .finally(() => setBusy(false))
  }

  const takeFiles = (e: React.DragEvent): void => {
    if (!hasFiles(e) || s.running) return
    e.preventDefault()
    setDropping(false)
    setBusy(true)
    void droppedPaths(e)
      .then((paths) => (paths.length > 0 ? s.addFiles(paths) : null))
      .then((result) => result && tell(result))
      .finally(() => setBusy(false))
  }

  const dropHere = (): void => {
    if (!drag) return
    const { from, at } = drag
    setDrag(null)
    if (!s.running) void s.moveItem(from, dropIndex(from, at))
  }

  const lineAt = (index: number, last: boolean): 'before' | 'after' | null => {
    if (!drag) return null
    if (drag.at === index) return 'before'
    if (last && drag.at === index + 1) return 'after'
    return null
  }

  const items: TreeItem[] = s.folders.map((f) => ({
    id: f.id,
    title: f.title,
    meta: f.items.length > 0 ? String(f.items.length) : undefined,
    folderId: f.folderId ?? null
  }))

  const planMenu = (item: TreeItem, rename: () => void): MenuEntry[] => [
    { label: t('common.open'), onClick: () => s.select(item.id) },
    {
      label: t('common.rename'),
      hint: t('common.twoClicks'),
      disabled: s.running,
      onClick: rename
    },
    {
      label: t('home.duplicate'),
      hint: t('home.duplicateHint'),
      onClick: () => void s.duplicate(item.id)
    },
    SEPARATOR,
    {
      label: t('home.deleteService'),
      danger: true,
      disabled: s.running,
      onClick: () => void s.removeFolder(item.id)
    }
  ]

  return (
    <div
      className="home"
      ref={rootRef}
      style={{ gridTemplateRows: `${layout.top}px auto 1fr` }}
    >

      <div
        className="home__top"
        ref={topRef}
        style={{ gridTemplateColumns: columnsTemplate(layout.topCols ?? []) }}
      >
        <section className="panel">
          <header className="panel__title panel__title--row">
            <span>
              {t('home.services')}
              {s.folders.length > 0 && ` · ${s.folders.length}`}
            </span>
            <span className="panel__actions">
              <button
                className="link"
                title={t('tree.newFolderAtRoot')}
                onClick={() => void useTree.getState().create('service', null)}
              >
                {t('tree.addFolder')}
              </button>
              <button
                className="link"
                title={t('home.newServiceHint')}
                onClick={() => void s.create(folder?.folderId ?? null)}
              >
                {t('home.addService')}
              </button>
            </span>
          </header>
          <div className="panel__body">
            {s.folders.length === 0 && folders.length === 0 && (
              <div className="hint">{t('home.emptyTree')}</div>
            )}
            <FolderTree
              scope="service"
              items={items}
              activeId={s.activeId}
              rootLabel={t('home.services')}
              onOpen={(id) => s.select(id)}
              itemMenu={planMenu}
              onRenameItem={
                s.running ? undefined : (id, title) => void s.renameFolder(id, title)
              }
              onMoveItem={(id, folderId) => void s.moveTo(id, folderId)}
              onCreate={(folderId) => void s.create(folderId)}
              onFoldersRemoved={(removed, parentId) =>
                void s.onFoldersRemoved(removed, parentId)
              }
            />
          </div>
        </section>

        <Splitter
          axis="x"
          size={layout.topCols?.[0] ?? 300}
          onResize={resizeCol('topCols', 0)}
          title={t('home.treeWidth')}
        />

        <section
          className={`panel panel--editor ${dropping ? 'is-dropping' : ''}`}
          onDragOver={(e) => {
            if (!hasFiles(e) || s.running) return
            e.preventDefault()
            setDropping(true)
          }}
          onDragLeave={(e) => {

            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false)
          }}
          onDrop={takeFiles}
        >
          <header className="panel__title panel__title--row">
            <span>{folder ? folder.title : t('home.noService')}</span>
            {folder && (
              <span className="panel__actions">
                {s.running && <span className="badge badge--warn">{t('home.running')}</span>}
                <button
                  className="link"
                  title={t('home.copyHint')}
                  onClick={() => void s.duplicate(folder.id)}
                >
                  {t('home.copy')}
                </button>
              </span>
            )}
          </header>

          <div className="panel__body panel__body--editor">
            {!folder ? (
              <div className="hint">{t('home.pickService')}</div>
            ) : (
              <div className="editor__fields">
                {where.length > 0 && (
                  <div className="home__path">{where.map((f) => f.name).join(' / ')}</div>
                )}

                <input
                  className="home__title"
                  value={folder.title}
                  disabled={s.running}
                  onChange={(e) => void s.rename(e.target.value)}
                />

                <div
                  className="items"
                  onDragOver={(e) => {
                    if (!drag) return
                    e.preventDefault()

                    const rows = e.currentTarget.querySelectorAll('.item')
                    const last = rows[rows.length - 1]
                    if (last && e.clientY <= last.getBoundingClientRect().bottom) return
                    setDrag((d) => (d ? { ...d, at: folder.items.length } : d))
                  }}
                  onDrop={(e) => {
                    if (!drag) return
                    e.preventDefault()
                    dropHere()
                  }}
                >
                  {folder.items.length === 0 && (
                    <div className="hint">{t('home.emptyPlan')}</div>
                  )}
                  {folder.items.map((item, i) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      index={i}
                      total={folder.items.length}

                      current={i === s.liveAt && live.slide !== null}
                      next={i === s.cursor + 1}
                      selected={i === s.cursor}
                      running={s.running}
                      moving={drag !== null}
                      dragged={drag?.from === i}
                      line={lineAt(i, i === folder.items.length - 1)}
                      onDragStart={() => setDrag({ from: i, at: i })}
                      onDragOver={(at) =>
                        setDrag((d) => (d && d.at !== at ? { ...d, at } : d))
                      }
                      onDrop={dropHere}
                      onDragEnd={() => setDrag(null)}
                      onSelect={() => s.focusItem(i)}
                      onOpen={() => void s.openItem(i, { edit: true })}
                      onMenu={(e) =>
                        open(e, [
                          {
                            label: t('common.showInHall'),
                            disabled: item.note,
                            onClick: () => {

                              s.focusItem(i)
                              void s.showCurrent()
                            }
                          },
                          {
                            label: t('home.openForEdit'),
                            disabled: item.note,
                            onClick: () => void s.openItem(i, { edit: true })
                          },
                          ...(item.kind === 'deck'
                            ? [
                                {
                                  label: t('home.toSong'),
                                  hint: t('home.toSongHint'),
                                  onClick: () =>
                                    void s.songFromDeck(i).then((r) => {
                                      if (!r.ok && r.reason) setTrouble(r.reason)
                                    })
                                }
                              ]
                            : []),
                          SEPARATOR,
                          {
                            label: t('common.up'),
                            disabled: i === 0 || s.running,
                            onClick: () => void s.moveItem(i, i - 1)
                          },
                          {
                            label: t('common.down'),
                            disabled: i === folder.items.length - 1 || s.running,
                            onClick: () => void s.moveItem(i, i + 1)
                          },
                          SEPARATOR,
                          {
                            label: t('home.removeItem'),
                            danger: true,
                            onClick: () => void s.removeItem(item.id)
                          }
                        ])
                      }
                    />
                  ))}
                </div>

                {deckOf(folder.items[stripAt]) && (
                  <DeckStrip deckId={deckOf(folder.items[stripAt])!} index={stripAt} />
                )}

                {dropping && <p className="note">{t('home.dropHere')}</p>}
                {busy && <p className="note">{t('home.spreadingFiles')}</p>}
                {trouble && (
                  <p className="note note--warn" onClick={() => setTrouble(null)}>
                    {trouble}
                  </p>
                )}
                {report && <DropReportView report={report} onClose={() => setReport(null)} />}

                {!s.running && (
                  <div className="add">

                    <button
                      onClick={() => goPick('songs')}
                      disabled={songs.length === 0}
                      title={t('home.addSongHint')}
                    >
                      {t('home.addSong')}
                    </button>
                    <button
                      onClick={() => goPick('texts')}
                      disabled={texts.length === 0}
                      title={t('home.addTextHint')}
                    >
                      {t('home.addText')}
                    </button>
                    <button
                      onClick={() => goPick('bible')}
                      title={t('home.addBibleHint')}
                    >
                      {t('home.addBible')}
                    </button>
                    <button
                      disabled={busy}
                      title={t('home.addDeckHint')}
                      onClick={() => take('decks')}
                    >
                      {busy ? t('home.spreading') : t('home.addDeck')}
                    </button>
                    <button
                      disabled={busy}
                      title={t('home.addPhotosHint')}
                      onClick={() => take('photos')}
                    >
                      {t('home.addPhotos')}
                    </button>
                    <button
                      disabled={busy}
                      title={t('home.addFolderHint')}
                      onClick={() => take('folder')}
                    >
                      {t('home.addFolder')}
                    </button>
                    <input
                      placeholder={t('home.addNote')}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter' || !note.trim()) return
                        void s.addNote(note.trim())
                        setNote('')
                      }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      <Splitter
        axis="y"
        size={layout.top}
        onResize={(px) => setTop('home', px, rootRef.current?.clientHeight ?? window.innerHeight)}
        title={t('home.planHeight')}
      />

      <div
        className="home__bottom"
        ref={bottomRef}
        style={{ gridTemplateColumns: columnsTemplate(layout.bottomCols) }}
      >
        <section className="panel panel--preview">
          <div className="ptabs">
            <span className="ptabs__item is-active">{t('common.preview')}</span>
          </div>
          <div className="previews" style={{ '--shot': shot } as React.CSSProperties}>
            <figure className="preview preview--live">
              <div className="preview__frame">
                <div className="preview__inner">
                  <SlideView
                    slide={live.slide}
                    lowerThird={live.lowerThird}
                    karaoke={live.karaoke}
                    karaokeWord={live.karaokeWord}
                    karaokeLook={live.karaokeLook}
                    blackout={live.blackout}
                    hideText={live.hideText}
                    aspect={shot}
                  />
                  <figcaption>
                    {live.slide ? t('home.inHall') : t('app.screenEmpty')}
                    {live.blackout && (
                      <span className="badge badge--warn">{t('common.blackout')}</span>
                    )}
                    {live.hideText && (
                      <span className="badge badge--warn">{t('common.bgOnly')}</span>
                    )}
                  </figcaption>
                </div>
              </div>
            </figure>

            <ScreenPicker />
          </div>
        </section>

        <Splitter
          axis="x"
          size={layout.bottomCols[1]}
          inverted
          onResize={resizeCol('bottomCols', 1)}
          title={t('home.consoleWidth')}
        />

        <section className="panel">
          <header className="panel__title panel__title--row">
            <span>{t('common.controls')}</span>
            <button
              className="link"
              onClick={() => reset('home')}
              title={t('common.resetPanels')}
            >
              {t('common.resetView')}
            </button>
          </header>
          <div className="panel__body">
            <Pult />
          </div>
        </section>
      </div>

      {menu}
    </div>
  )
}

function DropReportView({
  report,
  onClose
}: {
  report: DropReport
  onClose: () => void
}): React.JSX.Element {
  const t = useT()

  return (
    <div className="report">
      <div className="report__row">
        <b>
          {report.added > 0
            ? t('home.added', { n: report.added })
            : t('home.addedNothing')}
        </b>
        <button className="link" onClick={onClose} title={t('common.hide')}>
          ✕
        </button>
      </div>

      {report.names.map((name) => (
        <p className="note" key={name}>
          {name}
        </p>
      ))}
      {report.skipped.map((item) => (
        <p className="note note--warn" key={item.file}>
          {item.file} — {item.reason}
        </p>
      ))}
    </div>
  )
}

const deckOf = (item: ServiceItem | undefined): string | null =>
  item && item.kind === 'deck' ? item.refId : null

function useKindLabel(item: ServiceItem | null | undefined): string {
  const t = useT()
  const photos = useDecks((x) =>
    item && item.kind === 'deck' && item.refId
      ? x.items.find((d) => d.id === item.refId)?.kind === 'photos'
      : false
  )

  if (!item) return ''
  return photos ? t('home.photosKind') : itemKindLabel(item.kind)
}

function DeckStrip({
  deckId,
  index
}: {
  deckId: string

  index: number
}): React.JSX.Element {
  const t = useT()
  const decks = useDecks()
  const deck = decks.items.find((d) => d.id === deckId)
  const stripRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const box = stripRef.current
    if (!box) return

    const roll = (e: WheelEvent): void => {
      if (box.scrollWidth <= box.clientWidth) return

      const step = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      if (!step) return

      box.scrollLeft += step
      e.preventDefault()
    }

    box.addEventListener('wheel', roll, { passive: false })
    return () => box.removeEventListener('wheel', roll)
  }, [])

  const at = decks.deckId === deckId ? decks.index : -1
  useEffect(() => {
    const box = stripRef.current
    if (!box || at < 0) return

    const thumb = box.children[at]
    if (thumb instanceof HTMLElement) {
      thumb.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }, [at])

  if (!deck) {
    return (
      <p className="note note--warn">{t('home.deckMissing')}</p>
    )
  }

  const active = decks.deckId === deck.id

  return (
    <div className="deckstrip" ref={stripRef}>
      {deck.slides.map((slide, i) => (
        <button
          key={slide}
          className={`deckstrip__slide ${active && i === decks.index ? 'is-active' : ''}`}
          title={t('home.deckSlide', { n: i + 1, total: deck.slides.length })}
          onClick={() => {
            useService.getState().focusItem(index)
            decks.open(deck.id)
            decks.setIndex(i)
          }}

          onDoubleClick={() => void useService.getState().showCurrent()}
        >
          <img src={deckSlideUrl(deck.id, slide)} alt="" loading="lazy" />
          <span>{i + 1}</span>
        </button>
      ))}
    </div>
  )
}

function Pult(): React.JSX.Element {
  const t = useT()
  const s = useService()
  const liveSlide = useLive((x) => x.live.slide)
  const folder = s.folders.find((f) => f.id === s.activeId) ?? null
  const item = folder?.items[s.cursor] ?? null

  const onAir = s.liveAt === s.cursor && liveSlide !== null

  const songAt = useSongs((x) => x.index)
  const songTotal = useSongs((x) => x.slides.length)
  const textAt = useTexts((x) => x.previewIndex)
  const textTotal = useTexts((x) => x.preview.length)
  const bibleAt = useBible((x) => x.previewIndex)
  const bibleTotal = useBible((x) => x.preview.length)
  const deckAt = useDecks((x) => x.index)
  const deckTotal = useDecks((x) => x.slides().length)

  const inside =
    item?.kind === 'song'
      ? { at: songAt, total: songTotal, what: t('home.part') }
      : item?.kind === 'text'
        ? { at: textAt, total: textTotal, what: t('home.slide') }
        : item?.kind === 'bible'
          ? { at: bibleAt, total: bibleTotal, what: t('home.slide') }
          : item?.kind === 'deck'
            ? { at: deckAt, total: deckTotal, what: t('home.slide') }
            : null

  const nowKind = useKindLabel(item)
  const next = folder?.items.slice(s.cursor + 1).find((i) => !i.note) ?? null
  const nextKind = useKindLabel(next)
  const done = folder ? folder.items.filter((i) => !i.note).length : 0
  const passed = folder
    ? folder.items.slice(0, Math.max(0, s.cursor + 1)).filter((i) => !i.note).length
    : 0

  return (
    <div className="control pult">
      <div className="pult__run">
        {s.running ? (
          <>
            <button
              className="btn-show"
              onClick={() => void s.next()}
              title={t('common.space')}
            >
              {t('home.nextButton')}
            </button>
            <button onClick={() => void s.prev()} disabled={s.cursor <= 0}>
              {t('home.back')}
            </button>
          </>
        ) : (
          <button
            className="btn-show"
            disabled={!folder || folder.items.length === 0}
            onClick={() => void s.start()}
          >
            {t('home.start')}
          </button>
        )}
      </div>

      {s.running && <Elapsed passed={passed} total={done} />}

      <div className="pult__now">

        <span className="pult__label">{onAir ? t('home.now') : t('home.picked')}</span>
        {item ? (
          <>
            <b className="pult__title">{item.title}</b>
            <span className="pult__kind">{nowKind}</span>
            {inside && inside.total > 0 && (
              <div className="pult__step">

                <span>
                  {t('home.inside', {
                    what: inside.what,
                    at: inside.at + 1,
                    total: inside.total
                  })}
                </span>
                <span className="pult__arrows">
                  <button
                    className="icon-btn"
                    title={t('home.stepBack')}
                    disabled={inside.at === 0}
                    onClick={() => void s.stepInside(-1)}
                  >
                    ◀
                  </button>
                  <button
                    className="icon-btn"
                    title={t('home.stepForward')}
                    disabled={inside.at >= inside.total - 1}
                    onClick={() => void s.stepInside(1)}
                  >
                    ▶
                  </button>
                </span>
              </div>
            )}
          </>
        ) : (
          <b className="pult__title pult__title--idle">{t('home.notStarted')}</b>
        )}
      </div>

      <div className="pult__next">
        <span className="pult__label">{t('home.next')}</span>
        <b className="pult__title">{next ? next.title : t('home.serviceOver')}</b>
        {next && <span className="pult__kind">{nextKind}</span>}
      </div>

      <ScreenChips />

      {s.running && (
        <button className="chip chip--wide" onClick={() => s.stop()}>
          {t('home.stop')}
        </button>
      )}
    </div>
  )
}

function Elapsed({ passed, total }: { passed: number; total: number }): React.JSX.Element {
  const t = useT()
  const startedAt = useLive((x) => x.live.stage.startedAt)
  const [, tick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 15_000)
    return () => clearInterval(id)
  }, [])

  const minutes = startedAt ? Math.floor((Date.now() - startedAt) / 60_000) : 0

  return (
    <div className="pult__state">{t('home.elapsed', { minutes, passed, total })}</div>
  )
}

function ItemRow({
  item,
  index,
  total,
  current,
  next,
  selected,
  running,
  moving,
  dragged,
  line,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onSelect,
  onOpen,
  onMenu
}: {
  item: ServiceItem
  index: number
  total: number
  current: boolean
  next: boolean
  selected: boolean
  running: boolean

  moving: boolean

  dragged: boolean

  line: 'before' | 'after' | null
  onDragStart: () => void
  onDragOver: (at: number) => void
  onDrop: () => void
  onDragEnd: () => void
  onSelect: () => void
  onOpen: () => void
  onMenu: (e: React.MouseEvent) => void
}): React.JSX.Element {
  const t = useT()
  const tn = useTn()
  const kind = useKindLabel(item)
  const used = useService((s) => (item.refId ? s.usedIn(item.refId) : 0))

  return (
    <div
      className={[
        'item',
        item.note ? 'item--note' : '',
        current ? 'is-current' : '',
        next && !current ? 'is-next' : '',
        selected ? 'is-selected' : '',
        dragged ? 'is-dragging' : '',
        line === 'before' ? 'is-dropbefore' : '',
        line === 'after' ? 'is-dropafter' : ''
      ]
        .filter(Boolean)
        .join(' ')}
      draggable={!running}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'

        e.dataTransfer.setData('text/plain', item.title)
        onDragStart()
      }}
      onDragOver={(e) => {

        if (!moving) return
        e.preventDefault()
        e.stopPropagation()
        const box = e.currentTarget.getBoundingClientRect()
        onDragOver(e.clientY < box.top + box.height / 2 ? index : index + 1)
      }}
      onDrop={(e) => {
        if (!moving) return
        e.preventDefault()
        e.stopPropagation()
        onDrop()
      }}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onContextMenu={onMenu}
      title={item.note ? t('home.noteHint') : t('home.itemHint', { kind })}
    >
      <span className="item__no">{index + 1}</span>
      <span className="item__title">{item.title}</span>
      <span className="item__kind">
        {item.note ? t('home.noteKind') : kind}
        {used > 1 && <b title={tn('n.folder', used)}> · {used}</b>}
      </span>
      {!running && index < total && <span className="item__grip">⠿</span>}
    </div>
  )
}
