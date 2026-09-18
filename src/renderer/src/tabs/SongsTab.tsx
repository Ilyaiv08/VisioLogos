import { useCallback, useMemo, useRef, useState } from 'react'
import type { SongPart, SongPartKind } from '@shared/types'
import { PART_KINDS, movedBefore, orderLabel, partLabel, partTitle, songOrder } from '@shared/songs'
import type { ControlTarget } from '../components/ControlPanel'
import { SongControlPanel } from '../components/SongControlPanel'
import { SEPARATOR, useContextMenu, type MenuEntry } from '../components/ContextMenu'
import { FORMATS, FORMAT_ORDER, type SongFormat } from '@shared/songFormats'
import { FolderTree, type TreeItem } from '../components/FolderTree'
import { GrowingText } from '../components/GrowingText'
import { SlideView } from '../components/SlideView'
import { Splitter } from '../components/Splitter'
import { droppedPaths, hasFiles } from '../lib/dropFiles'
import { NOTICE_MS, NOTICE_TROUBLE_MS, useAutoHide } from '../lib/fading'
import { useT } from '../state/i18n'
import { useShot } from '../state/screen'
import { useLive } from '../state/live'
import { columnsTemplate, useLayout } from '../state/layout'
import { useLook } from '../state/look'
import { useCatalog, backgroundNotice } from '../state/catalog'
import { useSongs, type ImportReport } from '../state/songs'
import { useService } from '../state/service'
import { useTree } from '../state/tree'

const KIND_KEY = (kind: SongPartKind): 'part.verse' => `part.${kind}` as 'part.verse'

export function SongsTab(): React.JSX.Element {
  const t = useT()

  const shot = useShot()
  const s = useSongs()
  const live = useLive((x) => x.live)
  const look = useLook((x) => x.byTab.songs)
  const { setStyle, setBackground, resetLook } = useLook()
  const layout = useLayout((x) => x.byTab.songs)
  const { setTop, setCol, reset } = useLayout()
  const { open, menu } = useContextMenu()

  const addSong = useService((x) => x.addSong)
  const plan = useService((x) => x.folders.find((f) => f.id === x.activeId) ?? null)

  const searching = s.query.trim().length > 0

  const treeItems: TreeItem[] = s.items.map((song) => ({
    id: song.id,
    title: song.title || t('common.untitled'),
    meta: song.number ? `№${song.number}` : song.key || undefined,
    folderId: song.folderId ?? null
  }))

  const liftSongs = async (removed: string[]): Promise<void> => {
    for (const song of s.items.filter((x) => removed.includes(x.folderId ?? ''))) {
      await s.moveTo(song.id, null)
    }
  }

  const partMenu = (part: SongPart): MenuEntry[] => [
    ...PART_KINDS.map((kind) => ({
      label: t(KIND_KEY(kind)),
      hint: part.kind === kind ? t('songs.currentKind') : undefined,
      disabled: part.kind === kind,
      onClick: () => s.setPartKind(part.id, kind)
    })),
    SEPARATOR,
    {
      label: t('songs.addToOrder'),
      onClick: () => s.appendToOrder(part.id)
    },
    {
      label: t('songs.duplicatePart'),
      hint: t('songs.duplicatePartHint'),
      onClick: () => s.duplicatePart(part.id)
    },
    { label: t('common.up'), onClick: () => s.movePart(part.id, -1) },
    { label: t('common.down'), onClick: () => s.movePart(part.id, 1) },
    { label: t('songs.removePart'), danger: true, onClick: () => s.removePart(part.id) }
  ]

  const songMenu = (id: string, title: string, rename?: () => void): MenuEntry[] => [
    { label: t('common.open'), onClick: () => s.open(id) },
    ...(rename
      ? [{ label: t('common.rename'), hint: t('common.twoClicks'), onClick: rename }]
      : []),
    {
      label: t('common.addToService'),
      hint: plan?.title ?? t('common.new'),
      onClick: () => void addSong(id)
    },
    {
      label: t('catalog.toCatalog'),
      hint: t('catalog.toCatalogHint'),
      onClick: () => void toCatalog(id)
    },
    SEPARATOR,
    {
      label: t('songs.deleteNamed', { title: title.slice(0, 24) }),
      danger: true,
      onClick: () => void s.remove(id)
    }
  ]

  const rootRef = useRef<HTMLDivElement>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const [report, setReport] = useState<ImportReport | null>(null)
  const hideReport = useCallback(() => setReport(null), [])
  const leavingReport = useAutoHide(
    report,
    hideReport,
    report && report.skipped.length > 0 ? NOTICE_TROUBLE_MS : NOTICE_MS
  )

  const runImport = async (): Promise<void> => {
    const result = await s.importFiles()

    setReport(result.added > 0 || result.skipped.length > 0 ? result : null)
  }

  const reorder = (id: string, beforeId: string | null, folderId: string | null): void => {
    void (async () => {
      const was = s.items.find((song) => song.id === id)
      if (!was) return
      if ((was.folderId ?? null) !== folderId) await s.moveTo(id, folderId)

      const family = useSongs
        .getState()
        .items.filter((song) => (song.folderId ?? null) === folderId)
        .map((song) => song.id)

      await s.reorder(movedBefore(family, id, beforeId))
    })()
  }

  const byNumber = (a: TreeItem, b: TreeItem): number => {
    const one = s.items.find((song) => song.id === a.id)
    const two = s.items.find((song) => song.id === b.id)
    return one && two ? songOrder(one, two) : a.title.localeCompare(b.title, 'ru')
  }

  const toCatalog = async (id: string): Promise<void> => {
    await useCatalog.getState().open()
    await useCatalog.getState().addFromLibrary(id)
  }

  const [dropping, setDropping] = useState(false)

  const takeFiles = async (files: string[], folderId: string | null): Promise<void> => {
    if (files.length === 0) return
    const result = await s.addFiles(files, folderId)
    setReport(result.added > 0 || result.skipped.length > 0 ? result : null)
  }
  const bottomRef = useRef<HTMLDivElement>(null)
  const [paste, setPaste] = useState('')

  const resizeTop = (px: number): void =>
    setTop('songs', px, rootRef.current?.clientHeight ?? window.innerHeight)
  const resizeCol =
    (row: 'topCols' | 'bottomCols', index: number) =>
    (px: number): void => {
      const box = row === 'topCols' ? topRef.current : bottomRef.current
      setCol('songs', row, index, px, box?.clientWidth ?? window.innerWidth)
    }

  const visible = useMemo(() => {
    const q = s.query.trim().toLowerCase()
    if (!q) return s.items
    return s.items.filter(
      (song) =>
        song.title.toLowerCase().includes(q) ||
        song.author.toLowerCase().includes(q) ||
        song.number.toLowerCase().includes(q) ||
        song.parts.some((p) => p.text.toLowerCase().includes(q))
    )
  }, [s.items, s.query])

  const draft = s.draft

  const ownBackground = draft?.background ?? null

  const target: ControlTarget = {
    style: look.style,
    background: ownBackground ?? look.background,
    setStyle: (patch) => setStyle('songs', patch),
    setBackground: (bg) =>
      ownBackground ? s.edit({ background: bg }) : setBackground('songs', bg),
    reset: () => resetLook('songs'),
    label: t('songs.wholeTab'),
    resetLabel: t('common.resetLook'),
    ownBackground: draft
      ? {
          on: ownBackground !== null,
          set: (on) => s.edit({ background: on ? (ownBackground ?? look.background) : null }),
          label: t('songs.ownBg'),
          hint: t('songs.ownBgHint')
        }
      : undefined
  }

  const flow = draft
    ? draft.order
        .map((id, position) => ({ position, part: draft.parts.find((p) => p.id === id) }))
        .filter((x): x is { position: number; part: SongPart } => Boolean(x.part))
    : []

  const currentPartId = s.slides[s.index]?.partId

  return (
    <div
      className="songs"
      ref={rootRef}
      style={{ gridTemplateRows: `${layout.top}px auto 1fr` }}
    >
      <div
        className="songs__top"
        ref={topRef}
        style={{ gridTemplateColumns: columnsTemplate(layout.topCols ?? []) }}
      >

        <section className="panel">
          <header className="panel__title panel__title--row">
            <span>
              {t('songs.title')}
              {s.items.length > 0 && ` · ${s.items.length}`}
            </span>
            <span className="panel__actions">
              <button className="link" onClick={() => s.create()}>
                {t('songs.add')}
              </button>
              <button
                className="link"
                title={t('tree.newFolderAtRoot')}
                onClick={() => void useTree.getState().create('song', null)}
              >
                {t('tree.addFolder')}
              </button>
              <button
                className="link"
                title={t('catalog.openHint')}
                onClick={() => void useCatalog.getState().open()}
              >
                {t('catalog.open')}
              </button>
              <button
                className="link"
                title={t('songs.importHint')}
                onClick={() => void runImport()}
              >
                {t('songs.import')}
              </button>
            </span>
          </header>
          <div
            className={`panel__body ${dropping ? 'is-dropping' : ''}`}
            onDragOver={(e) => {
              if (!hasFiles(e)) return
              e.preventDefault()
              setDropping(true)
            }}
            onDragLeave={(e) => {

              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setDropping(false)
              }
            }}
            onDrop={(e) => {

              if (!hasFiles(e)) return
              e.preventDefault()
              setDropping(false)
              void droppedPaths(e).then((paths) => takeFiles(paths, null))
            }}
          >
            {report && (
              <ImportReportView report={report} onClose={hideReport} leaving={leavingReport} />
            )}
            <input
              className="search"
              value={s.query}
              placeholder={t('songs.search')}
              onChange={(e) => s.setQuery(e.target.value)}
            />
            {searching ? (
              <div className="list">
                {visible.length === 0 && <div className="hint">{t('common.nothingFound')}</div>}
                {visible.map((song) => (
                  <div
                    key={song.id}
                    className={`songitem ${draft?.id === song.id ? 'is-active' : ''}`}
                    onClick={() => s.open(song.id)}
                    onContextMenu={(e) => open(e, songMenu(song.id, song.title))}
                  >
                    <span className="songitem__title">{song.title || t('common.untitled')}</span>
                    <span className="songitem__meta">
                      {song.number && <b>№{song.number}</b>}
                      {song.key && <span>{song.key}</span>}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <>

                {s.items.length === 0 && (
                  <div className="hint">{t('songs.emptyLibrary')}</div>
                )}
                <FolderTree
                  scope="song"
                  items={treeItems}
                  activeId={draft?.id ?? null}
                  rootLabel={t('songs.title')}
                  onOpen={(id) => s.open(id)}
                  itemMenu={(item, rename) => songMenu(item.id, item.title, rename)}
                  onRenameItem={(id, title) => void s.rename(id, title)}
                  onMoveItem={(id, folderId) => void s.moveTo(id, folderId)}
                  onReorder={reorder}
                  compare={byNumber}
                  onDropFiles={(files, folderId) => void takeFiles(files, folderId)}
                  onFoldersRemoved={(removed) => void liftSongs(removed)}
                />
              </>
            )}
          </div>
        </section>

        <Splitter
          axis="x"
          size={layout.topCols?.[0] ?? 300}
          onResize={resizeCol('topCols', 0)}
          title={t('songs.libraryWidth')}
        />

        <section className="panel panel--editor">
          <header className="panel__title panel__title--row">
            <span>{draft ? draft.title || t('songs.newSong') : t('songs.noSong')}</span>
            {draft && (
              <span className="panel__actions">
                {s.dirty && <span className="badge">{t('common.unsaved')}</span>}
                <button
                  className="link"
                  title={t('songs.exportHint')}
                  onClick={(e) => open(e, exportMenu(s.exportSong, draft.id))}
                >
                  {t('songs.export')}
                </button>
                <button className="link" onClick={() => s.closeDraft()}>
                  {t('common.close')}
                </button>
              </span>
            )}
          </header>

          <div className="panel__body panel__body--editor">
            {!draft ? (
              <div className="hint">{t('songs.pick')}</div>
            ) : (
              <div className="editor__fields">
                <div className="songmeta">
                  <input
                    placeholder={t('songs.name')}
                    value={draft.title}
                    onChange={(e) => s.edit({ title: e.target.value })}
                  />
                  <input
                    placeholder={t('songs.author')}
                    value={draft.author}
                    onChange={(e) => s.edit({ author: e.target.value })}
                  />
                  <input
                    placeholder={t('songs.number')}
                    title={t('songs.numberHint')}
                    inputMode="numeric"
                    value={draft.number}
                    onChange={(e) => s.edit({ number: e.target.value })}
                  />
                  <input
                    placeholder={t('songs.key')}
                    value={draft.key}
                    onChange={(e) => s.edit({ key: e.target.value })}
                  />
                  <input
                    placeholder={t('songs.tempo')}
                    inputMode="numeric"
                    value={draft.tempo ?? ''}
                    onChange={(e) =>
                      s.edit({ tempo: e.target.value ? Number(e.target.value) : null })
                    }
                  />
                  <input
                    placeholder={t('songs.ccli')}
                    title={t('songs.ccliHint')}
                    value={draft.ccli}
                    onChange={(e) => s.edit({ ccli: e.target.value })}
                  />
                </div>

                {draft.parts.length === 0 && (
                  <>
                    <GrowingText
                      className="editor"
                      placeholder={t('songs.pastePlaceholder')}
                      value={paste}
                      onChange={(e) => setPaste(e.target.value)}
                    />
                    <button
                      className="wide"
                      disabled={!paste.trim()}
                      onClick={() => {
                        s.parseInto(paste)
                        setPaste('')
                      }}
                    >
                      {t('songs.parse')}
                    </button>
                  </>
                )}

                {draft.parts.map((part) => (
                  <div
                    className="part"
                    key={part.id}
                    onContextMenu={(e) => open(e, partMenu(part))}
                  >
                    <div className="part__head">
                      <span className="part__title">{partTitle(part)}</span>
                      <span className="part__actions">

                        <button
                          className="link"
                          title={t('songs.changeKindHint')}
                          onClick={(e) => open(e, partMenu(part))}
                        >
                          {t('songs.changeKind')}
                        </button>
                        <button
                          className="link"
                          title={t('songs.toOrderHint')}
                          onClick={() => s.appendToOrder(part.id)}
                        >
                          {t('songs.toOrder')}
                        </button>

                        <button
                          className="link"
                          title={t('songs.movePartUp')}
                          onClick={() => s.movePart(part.id, -1)}
                        >
                          ↑
                        </button>
                        <button
                          className="link"
                          title={t('songs.movePartDown')}
                          onClick={() => s.movePart(part.id, 1)}
                        >
                          ↓
                        </button>
                        <button
                          className="link"
                          title={t('songs.duplicatePartHint')}
                          onClick={() => s.duplicatePart(part.id)}
                        >
                          {t('songs.duplicatePart')}
                        </button>
                        <button className="link" onClick={() => s.removePart(part.id)}>
                          {t('songs.removePartShort')}
                        </button>
                      </span>
                    </div>
                    <GrowingText
                      className="part__text"
                      placeholder={t('songs.partText')}
                      value={part.text}
                      onChange={(e) => s.editPart(part.id, { text: e.target.value })}
                    />
                  </div>
                ))}

                <div className="part__add">
                  {PART_KINDS.map((kind) => (
                    <button key={kind} onClick={() => s.addPart(kind)}>
                      + {t(KIND_KEY(kind))}
                    </button>
                  ))}
                </div>

                {draft.parts.length > 0 && (
                  <div className="field">
                    <span className="field__head">
                      {t('songs.order')} <b>{orderLabel(draft) || '—'}</b>
                    </span>
                    <div className="order">
                      {draft.order.map((id, at) => {
                        const part = draft.parts.find((p) => p.id === id)
                        if (!part) return null
                        return (
                          <button
                            key={`${id}-${at}`}
                            className="order__item"
                            title={t('songs.orderItemHint', { part: partTitle(part) })}
                            onClick={() => s.removeFromOrder(at)}
                          >
                            {partLabel(part)}
                          </button>
                        )
                      })}
                      <button className="link" onClick={() => s.resetOrder()}>
                        {t('songs.rebuildOrder')}
                      </button>
                    </div>
                  </div>
                )}

                <button className="wide" onClick={() => void s.save()} disabled={!s.dirty}>
                  {s.dirty ? t('common.save') : t('common.saved')}
                </button>
              </div>
            )}
          </div>
        </section>
      </div>

      <Splitter axis="y" size={layout.top} onResize={resizeTop} title={t('songs.libraryHeight')} />

      <div
        className="songs__bottom"
        ref={bottomRef}
        style={{ gridTemplateColumns: columnsTemplate(layout.bottomCols) }}
      >
        <section className="panel panel--preview">
          <div className="ptabs">
            <span className="ptabs__item is-active">{t('common.preview')}</span>
            {flow.length > 0 && (
              <span className="ptabs__hint">
                {t('songs.slideOf', { at: s.index + 1, total: s.slides.length })}
              </span>
            )}
          </div>

          {flow.length > 0 && (
            <div className="parts">
              {flow.map(({ part, position }) => (
                <button
                  key={`${part.id}-${position}`}
                  className={`parts__btn ${currentPartId === part.id ? 'is-current' : ''}`}
                  title={partTitle(part)}
                  onClick={() => void s.goToPart(part.id)}
                >
                  {partLabel(part)}
                </button>
              ))}
            </div>
          )}

          <div
            className="previews previews--both"
            style={{ '--shot': shot } as React.CSSProperties}
          >
            <figure className="preview">
              <div className="preview__frame">
                <div className="preview__inner">
                  <SlideView
                    slide={s.slides[s.index]?.slide ?? null}
                    aspect={shot}
                    showSafeArea
                  />
                  <figcaption>{t('songs.prepared')}</figcaption>
                </div>
              </div>
            </figure>

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
                    {t('songs.liveWindow')}
                    {live.karaoke !== null && (
                      <span className="badge">
                        {t('songs.karaokeBadge', { n: live.karaoke + 1 })}
                      </span>
                    )}
                  </figcaption>
                </div>
              </div>
            </figure>
          </div>
        </section>

        <Splitter
          axis="x"
          size={layout.bottomCols[1]}
          inverted
          onResize={resizeCol('bottomCols', 1)}
          title={t('songs.controlsWidth')}
        />

        <section className="panel">
          <header className="panel__title panel__title--row">
            <span>{t('common.controls')}</span>
            <button className="link" onClick={() => reset('songs')}>
              {t('common.resetView')}
            </button>
          </header>
          <div className="panel__body">
            <SongControlPanel target={target} />
          </div>
        </section>
      </div>

      {menu}
    </div>
  )
}

function exportMenu(
  save: (format: SongFormat, songId: string) => Promise<string | null>,
  songId: string
): MenuEntry[] {
  return FORMAT_ORDER.map((format) => ({
    label: `${FORMATS[format].name} · .${FORMATS[format].extension}`,
    onClick: () => void save(format, songId)
  }))
}

function ImportReportView({
  report,
  onClose,
  leaving
}: {
  report: ImportReport
  onClose: () => void
  leaving: boolean
}): React.JSX.Element {
  const t = useT()

  const formats = Object.entries(report.formats)
    .map(([name, count]) => `${name} — ${count}`)
    .join(', ')

  const backgrounds = backgroundNotice(report.backgrounds)

  return (
    <div className={`report fading ${leaving ? 'is-leaving' : ''}`}>
      <div className="report__row">
        <b>
          {report.added > 0 ? t('songs.imported', { n: report.added }) : t('songs.importedNothing')}
        </b>
        <button className="link" onClick={onClose} title={t('common.hide')}>
          ✕
        </button>
      </div>
      {formats && <p className="note">{formats}</p>}
      {backgrounds && <p className="note">{backgrounds}</p>}
      {report.skipped.map((item) => (
        <p className="note note--warn" key={item.file}>
          {item.file} — {item.reason}
        </p>
      ))}
    </div>
  )
}
