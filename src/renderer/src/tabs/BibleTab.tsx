import { useEffect, useMemo, useRef, useState } from 'react'
import type { BibleClass } from '@shared/types'
import { lang } from '@shared/i18n'
import { groupLabel, GROUPS, groupOf, inCanonOrder } from '@shared/bookGroups'
import { ControlPanel } from '../components/ControlPanel'
import { SEPARATOR, useContextMenu, type MenuEntry } from '../components/ContextMenu'
import { PlanPanel } from '../components/PlanPanel'
import { Select } from '../components/Select'
import { SITE_NAME } from '@shared/site'
import { useUi } from '../state/ui'
import { Splitter } from '../components/Splitter'
import { columnsTemplate, useLayout } from '../state/layout'
import { SlideView } from '../components/SlideView'
import { useT, useTn } from '../state/i18n'
import { useShot } from '../state/screen'
import { useLive } from '../state/live'
import { useLook } from '../state/look'
import { useBible } from '../state/store'

const CLASSES: { id: BibleClass; key: 'bible.wholeBible' }[] = [
  { id: 'all', key: 'bible.wholeBible' },
  { id: 'ot', key: 'bible.oldTestament' as 'bible.wholeBible' },
  { id: 'nt', key: 'bible.newTestament' as 'bible.wholeBible' },
  { id: 'apocrypha', key: 'bible.apocrypha' as 'bible.wholeBible' }
]

type PreviewTab = 'both' | 'preview' | 'live'

export function BibleTab(): React.JSX.Element {
  const t = useT()

  const shot = useShot()
  const tn = useTn()
  const s = useBible()
  const live = useLive((x) => x.live)
  const look = useLook((x) => x.byTab.bible)
  const { setStyle, setBackground, resetLook } = useLook()
  const layout = useLayout((x) => x.byTab.bible)
  const { setTop, setCol, reset } = useLayout()

  const rootRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const resizeTop = (px: number): void =>
    setTop('bible', px, rootRef.current?.clientHeight ?? window.innerHeight)
  const resizeCol =
    (index: number) =>
    (px: number): void =>
      setCol(
        'bible',
        'bottomCols',
        index,
        px,
        bottomRef.current?.clientWidth ?? window.innerWidth
      )
  const { open, menu } = useContextMenu()
  const [previewTab, setPreviewTab] = useState<PreviewTab>('both')

  const dragAnchor = useRef<number | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (!dragging) return
    const stop = (): void => {
      dragAnchor.current = null
      setDragging(false)
    }
    window.addEventListener('mouseup', stop)
    return () => window.removeEventListener('mouseup', stop)
  }, [dragging])

  const onDragMove = (e: React.MouseEvent): void => {
    const anchor = dragAnchor.current
    if (anchor === null) return

    if (e.buttons === 0) {
      dragAnchor.current = null
      setDragging(false)
      return
    }

    const box = e.currentTarget as HTMLElement
    const rect = box.getBoundingClientRect()
    const edge = 22
    if (e.clientY < rect.top + edge) box.scrollTop -= 12
    else if (e.clientY > rect.bottom - edge) box.scrollTop += 12

    const row = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest<HTMLElement>('.verse')
    const n = Number(row?.dataset.verse)
    if (n) void s.selectRange(anchor, n)
  }

  const books = useMemo(() => {
    const all = s.meta?.books ?? []
    const total = all.length

    const visible =
      s.cls === 'all'
        ? all.filter((b) => b.testament !== 'apocrypha')
        : all.filter((b) => b.testament === s.cls)

    const ordered = inCanonOrder(visible)

    return ordered.map((book, i) => ({
      book,
      group: groupOf(book, total),

      newTestament: i > 0 && ordered[i - 1].testament !== book.testament
    }))
  }, [s.meta, s.cls])

  const hasApocrypha = useMemo(
    () => (s.meta?.books ?? []).some((b) => b.testament === 'apocrypha'),
    [s.meta]
  )
  const classes = hasApocrypha ? CLASSES : CLASSES.filter((c) => c.id !== 'apocrypha')

  useEffect(() => {
    if (s.cls === 'apocrypha' && !hasApocrypha) s.setClass('all')
  }, [hasApocrypha, s.cls, s.setClass])

  const chapters = useMemo(() => {
    const book = s.meta?.books[(s.book ?? 1) - 1]
    return Array.from({ length: book?.chapters ?? 0 }, (_, i) => i + 1)
  }, [s.meta, s.book])

  if (!s.ready) return <div className="loading">{t('bible.loading')}</div>

  if (s.catalog.length === 0) {
    return (
      <div className="empty">
        <p>{t('bible.noModules')}</p>
        <button onClick={() => useUi.getState().setDialog('modules')}>
          {t('bible.addModule')}
        </button>
      </div>
    )
  }

  const verseMenu = (n: number): MenuEntry[] => {
    const st = useBible.getState()
    const inSelection =
      st.selFrom !== null && n >= st.selFrom && n <= (st.selTo ?? st.selFrom)
    const count = inSelection ? (st.selTo ?? st.selFrom!) - st.selFrom! + 1 : 1
    const suffix = count > 1 ? ` (${tn('n.verse', count)})` : ''

    return [
      {
        label: `${t('common.showInHall')}${suffix}`,
        hint: t('common.twoClicks'),
        onClick: () => void useBible.getState().show()
      },
      {
        label: `${t('bible.addToPlan')}${suffix}`,
        onClick: () => void useBible.getState().addSelectionToPlan()
      },
      SEPARATOR,
      {
        label: t('bible.selectChapter'),
        onClick: () => void useBible.getState().selectRange(1, st.verses.length)
      },
      SEPARATOR,
      {
        label: t('common.copyText'),
        onClick: () => {
          const cur = useBible.getState()
          const from = cur.selFrom ?? n
          const to = cur.selTo ?? from
          const text = cur.verses
            .filter((v) => v.n >= from && v.n <= to)
            .map((v) => v.plain)
            .join(' ')
          void navigator.clipboard.writeText(text)
        }
      },
      {
        label: t('bible.copyRef'),
        onClick: () => {
          const cur = useBible.getState()
          void navigator.clipboard.writeText(cur.preview[0]?.reference ?? '')
        }
      }
    ]
  }

  return (
    <div
      className="bible"
      ref={rootRef}
      style={{ gridTemplateRows: `${layout.top}px auto auto auto 1fr` }}
    >

      <div className="columns">
        <Column title={t('bible.class')}>
          {classes.map((c) => (
            <Row
              key={c.id}
              active={s.cls === c.id}
              onClick={() => s.setClass(c.id)}
              label={t(c.key)}
            />
          ))}
        </Column>

        <Column title={t('bible.book')}>
          {books.length === 0 && <div className="hint">{t('bible.noSuchBooks')}</div>}
          {books.map(({ book, group, newTestament }) => (
            <div
              key={book.index}
              className={[
                'row row--book',
                s.book === book.index ? 'is-active' : '',
                newTestament ? 'row--testament' : ''
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ '--book-color': GROUPS[group].color } as React.CSSProperties}
              onClick={() => void s.selectBook(book.index)}
              title={t('bible.bookHint', {
                name: book.name,
                group: groupLabel(group),
                chapters: book.chapters
              })}
            >
              {book.name}
            </div>
          ))}
        </Column>

        <Column title={t('bible.chapter')} narrow>
          {chapters.map((n) => (
            <Row
              key={n}
              active={s.chapter === n}
              onClick={() => void s.selectChapter(n)}
              label={String(n)}
            />
          ))}
        </Column>

        <Column
          title={t('bible.verse')}
          hint={t('bible.dragHint')}
          scrollKey={`${s.book}:${s.chapter}`}
          dragging={dragging}
          onMouseMove={onDragMove}
        >
          {s.verses.map((v) => {
            const selected =
              s.selFrom !== null && v.n >= s.selFrom && v.n <= (s.selTo ?? s.selFrom)
            const onAir =
              live.slide?.kind === 'bible' &&
              live.slide.blocks.some((b) => b.verse === v.n) &&
              selected
            return (
              <div
                key={v.n}
                data-verse={v.n}
                className={`verse ${selected ? 'is-active' : ''} ${onAir ? 'is-live' : ''}`}
                onMouseDown={(e) => {
                  if (e.button !== 0) return

                  e.preventDefault()
                  const anchor = e.shiftKey && s.selFrom !== null ? s.selFrom : v.n
                  dragAnchor.current = anchor
                  setDragging(true)
                  void s.selectRange(anchor, v.n)
                }}
                onDoubleClick={() => void s.show()}
                onContextMenu={(e) => {
                  const inSelection =
                    s.selFrom !== null && v.n >= s.selFrom && v.n <= (s.selTo ?? s.selFrom)
                  if (!inSelection) void s.selectRange(v.n, v.n)
                  open(e, verseMenu(v.n))
                }}
                title={t('bible.verseHint')}
              >
                <span className="verse__n">{v.n}</span>
                <span className="verse__text">{v.plain}</span>
              </div>
            )
          })}
        </Column>
      </div>

      <Splitter
        axis="y"
        size={layout.top}
        onResize={resizeTop}
        title={t('bible.columnsHeight')}
      />

      <div className="toolbar">
        <Select
          className="select--translation"
          title={t('bible.translation')}
          value={s.translationId ?? ''}
          onChange={(id) => void s.setTranslation(id)}
          options={s.catalog.map((tr) => ({
            value: tr.id,
            label: tr.name,
            hint: t('bible.booksAndVerses', {
              books: tn('n.book', tr.books.length),

              verses: tn('n.verse', tr.verseCount, {
                n: tr.verseCount.toLocaleString(lang())
              })
            })
          }))}
          onRemove={(id) => void window.api.bible.remove(id)}
          removeTitle={t('bible.removeTranslation')}
          footer={
            <button
              className="link"
              onClick={() => useUi.getState().setDialog('modules')}
            >
              {t('bible.moreOnSite', { site: SITE_NAME })}
            </button>
          }
        />

        <label className="checkbox" title={t('bible.secondHint')}>
          <input
            type="checkbox"
            checked={s.secondaryId !== null}
            disabled={s.catalog.length < 2}
            onChange={(e) =>
              void s.setSecondary(
                e.target.checked
                  ? (s.catalog.find((t) => t.id !== s.translationId)?.id ?? null)
                  : null
              )
            }
          />
          {t('bible.second')}
        </label>

        {s.secondaryId && (
          <Select
            className="select--translation"
            title={t('bible.second')}
            value={s.secondaryId}
            onChange={(id) => void s.setSecondary(id)}
            options={s.catalog
              .filter((tr) => tr.id !== s.translationId)
              .map((tr) => ({ value: tr.id, label: tr.name }))}
          />
        )}

        <input
          className="search"
          value={s.query}
          placeholder={t('bible.search')}
          onChange={(e) => s.setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void s.runSearch()
            if (e.key === 'Escape') s.setQuery('')
          }}
        />
        <button onClick={() => void s.runSearch()} disabled={s.searching}>
          {s.searching ? t('bible.searching') : t('bible.find')}
        </button>

        <button
          className="ghost"
          onClick={() => useUi.getState().setDialog('modules')}
          title={t('bible.addTranslationHint')}
        >
          {t('bible.addTranslation')}
        </button>
      </div>

      {s.hits.length > 0 && (
        <div className="hits">
          <div className="hits__head">
            {t('bible.found', { n: s.hits.length })}
            <button className="link" onClick={() => useBible.setState({ hits: [] })}>
              {t('common.close')}
            </button>
          </div>
          <div className="hits__list">
            {s.hits.map((h) => (
              <div
                key={`${h.book}-${h.chapter}-${h.verse}`}
                className="hit"
                onClick={() => void s.goTo(h.book, h.chapter, h.verse, h.verse)}
                onDoubleClick={() =>
                  void s.goTo(h.book, h.chapter, h.verse, h.verse).then(s.show)
                }
                onContextMenu={(e) =>
                  open(e, [
                    {
                      label: t('common.showInHall'),
                      hint: t('common.twoClicks'),
                      onClick: () =>
                        void s.goTo(h.book, h.chapter, h.verse, h.verse).then(s.show)
                    },
                    {
                      label: t('bible.addToPlan'),
                      onClick: () =>
                        void s.addRefToPlan(h.book, h.chapter, h.verse, h.verse)
                    },
                    SEPARATOR,
                    {
                      label: t('common.copyText'),
                      onClick: () => void navigator.clipboard.writeText(h.plain)
                    }
                  ])
                }
              >
                <span className="hit__ref">{h.reference}</span>
                <span className="hit__text">{h.plain}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        className="panels"
        ref={bottomRef}
        style={{ gridTemplateColumns: columnsTemplate(layout.bottomCols) }}
      >
        <PlanPanel />
        <Splitter
          axis="x"
          size={layout.bottomCols[0]}
          onResize={resizeCol(0)}
          title={t('bible.planWidth')}
        />

        <section className="panel">
          <header className="panel__title">{t('bible.history')}</header>
          <div className="panel__body">
            <div className="history">
              {s.history.length === 0 && (
                <div className="hint">{t('bible.historyEmpty')}</div>
              )}
              {s.history.map((h) => (
                <div
                  key={h.label}
                  className="history__row"
                  onClick={() => void s.goTo(h.book, h.chapter, h.from, h.to)}
                  onDoubleClick={() =>
                    void s.goTo(h.book, h.chapter, h.from, h.to).then(s.show)
                  }
                  onContextMenu={(e) =>
                    open(e, [
                      {
                        label: t('common.showInHall'),
                        hint: t('common.twoClicks'),
                        onClick: () =>
                          void s.goTo(h.book, h.chapter, h.from, h.to).then(s.show)
                      },
                      {
                        label: t('bible.addToPlan'),
                        onClick: () => void s.addRefToPlan(h.book, h.chapter, h.from, h.to)
                      },
                      SEPARATOR,
                      {
                        label: t('common.copyText'),
                        onClick: () => void navigator.clipboard.writeText(h.text)
                      }
                    ])
                  }
                >
                  <span className="history__ref">{h.label}</span>
                  <span className="history__dash">—</span>
                  <span className="history__text">{h.text}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <Splitter
          axis="x"
          size={layout.bottomCols[1]}
          onResize={resizeCol(1)}
          title={t('bible.historyWidth')}
        />

        <section className="panel panel--preview">
          <div className="ptabs">
            <button
              className={`ptabs__item ${previewTab === 'both' ? 'is-active' : ''}`}
              onClick={() => setPreviewTab('both')}
            >
              {t('bible.bothWindows')}
            </button>
            <button
              className={`ptabs__item ${previewTab === 'preview' ? 'is-active' : ''}`}
              onClick={() => setPreviewTab('preview')}
            >
              {t('bible.previewOnly')}
            </button>
            <button
              className={`ptabs__item ${previewTab === 'live' ? 'is-active' : ''}`}
              onClick={() => setPreviewTab('live')}
            >
              {t('bible.liveOnly')}
            </button>
          </div>

          <div
            className={`previews previews--${previewTab}`}

            style={{ '--shot': shot } as React.CSSProperties}
          >
            {previewTab !== 'live' && (
              <figure className="preview">
                <div className="preview__frame">
                  <div className="preview__inner">
                    <SlideView
                      slide={s.preview[s.previewIndex] ?? null}
                      aspect={shot}
                      showSafeArea
                    />
                    <figcaption>
                      {t('songs.prepared')}
                      {s.preview.length > 1 && (
                        <span className="badge" title={t('bible.tooLong')}>
                          {t('songs.slideOf', {
                            at: s.previewIndex + 1,
                            total: s.preview.length
                          })}
                        </span>
                      )}
                    </figcaption>
                  </div>
                </div>
              </figure>
            )}

            {previewTab !== 'preview' && (
              <figure className="preview preview--live">
                <div className="preview__frame">
                  <div className="preview__inner">
                    <SlideView
                      slide={live.slide}
                      lowerThird={live.lowerThird}
                      blackout={live.blackout}
                      hideText={live.hideText}
                      aspect={shot}
                    />
                    <figcaption>
                      {t('bible.liveOnly')}
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
            )}
          </div>
        </section>

        <Splitter
          axis="x"
          size={layout.bottomCols[3]}
          inverted
          onResize={resizeCol(3)}
          title={t('bible.controlsWidth')}
        />

        <section className="panel">
          <header className="panel__title panel__title--row">
            <span>{t('common.controls')}</span>
            <button
              className="link"
              onClick={() => reset('bible')}
              title={t('common.resetPanels')}
            >
              {t('common.resetView')}
            </button>
          </header>
          <div className="panel__body">
            <ControlPanel
              canShow={s.preview.length > 0}
              target={{
                style: look.style,
                background: look.background,
                setStyle: (patch) => setStyle('bible', patch),
                setBackground: (bg) => setBackground('bible', bg),
                reset: () => resetLook('bible'),
                label: t('bible.wholeTab'),
                resetLabel: t('common.resetLook')
              }}
              onShow={() => void s.show()}
              nav={
                <div className="control__nav">
                  <button
                    className="icon-btn"
                    title={t('bible.prevVerse')}
                    onClick={() => void s.stepVerse(-1)}
                    disabled={!s.selFrom}
                  >
                    ◀
                  </button>
                  <button
                    className="icon-btn"
                    title={t('bible.prevSlide')}
                    onClick={() => void s.stepSlide(-1)}
                    disabled={s.preview.length < 2 || s.previewIndex === 0}
                  >
                    ▲
                  </button>
                  <button
                    className="icon-btn"
                    title={t('bible.nextSlide')}
                    onClick={() => void s.stepSlide(1)}
                    disabled={
                      s.preview.length < 2 || s.previewIndex >= s.preview.length - 1
                    }
                  >
                    ▼
                  </button>
                  <button
                    className="icon-btn"
                    title={t('bible.nextVerse')}
                    onClick={() => void s.stepVerse(1)}
                    disabled={!s.selFrom}
                  >
                    ▶
                  </button>
                </div>
              }
            />
          </div>
        </section>
      </div>

      {menu}
    </div>
  )
}

function Column({
  title,
  hint,
  children,
  narrow,
  scrollKey,
  dragging,
  onMouseMove
}: {
  title: string
  hint?: string
  children: React.ReactNode
  narrow?: boolean
  scrollKey?: string
  dragging?: boolean
  onMouseMove?: (e: React.MouseEvent) => void
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0
  }, [scrollKey])

  return (
    <div className={`column ${narrow ? 'column--narrow' : ''}`}>
      <div className="column__title column__title--row">
        <span>{title}</span>
        {hint && <span className="column__hint">{hint}</span>}
      </div>
      <div
        className={`column__body ${dragging ? 'is-dragging' : ''}`}
        ref={ref}
        onMouseMove={onMouseMove}
      >
        {children}
      </div>
    </div>
  )
}

function Row({
  label,
  active,
  onClick
}: {
  label: string
  active: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <div className={`row ${active ? 'is-active' : ''}`} onClick={onClick}>
      {label}
    </div>
  )
}
