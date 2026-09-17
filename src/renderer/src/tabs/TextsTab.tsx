import { useEffect, useMemo, useRef, useState } from 'react'
import { ControlPanel, type ControlTarget } from '../components/ControlPanel'
import { SEPARATOR, useContextMenu, type MenuEntry } from '../components/ContextMenu'
import {
  TEXT_FORMATS,
  TEXT_FORMAT_ORDER,
  type TextFormat
} from '@shared/textFormats'
import { FolderTree, type TreeItem } from '../components/FolderTree'
import { GrowingText } from '../components/GrowingText'
import { SlideView } from '../components/SlideView'
import { Splitter } from '../components/Splitter'
import { useLive } from '../state/live'
import { columnsTemplate, useLayout } from '../state/layout'
import { useLook } from '../state/look'
import { PRESETS, presetHint, presetLabel, useTexts } from '../state/texts'
import { useService } from '../state/service'
import { useTree } from '../state/tree'
import type { FreeLine, TextItem } from '@shared/types'
import { countItems, rawSections, writeSections, type RawSection } from '@shared/textList'
import { t, tn } from '@shared/i18n'
import { useT } from '../state/i18n'
import { useShot } from '../state/screen'

export function TextsTab(): React.JSX.Element {
  const t = useT()

  const shot = useShot()
  const s = useTexts()
  const live = useLive((x) => x.live)
  const look = useLook((x) => x.byTab.texts)
  const { setStyle, setBackground, resetLook } = useLook()
  const layout = useLayout((x) => x.byTab.texts)
  const { setTop, setCol, reset } = useLayout()

  const rootRef = useRef<HTMLDivElement>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const resizeTop = (px: number): void =>
    setTop('texts', px, rootRef.current?.clientHeight ?? window.innerHeight)
  const resizeCol =
    (row: 'topCols' | 'bottomCols', index: number) =>
    (px: number): void => {
      const box = row === 'topCols' ? topRef.current : bottomRef.current
      setCol('texts', row, index, px, box?.clientWidth ?? window.innerWidth)
    }
  const { open, menu } = useContextMenu()

  const addText = useService((x) => x.addText)
  const plan = useService((x) => x.folders.find((f) => f.id === x.activeId) ?? null)

  const visible = useMemo(() => {
    const q = s.query.trim().toLowerCase()
    if (!q) return s.items
    return s.items.filter(
      (i) => i.title.toLowerCase().includes(q) || i.body.toLowerCase().includes(q)
    )
  }, [s.items, s.query])

  const draft = s.draft

  const searching = s.query.trim().length > 0

  const treeItems: TreeItem[] = s.items.map((item) => ({
    id: item.id,
    title: item.title || t('common.untitled'),
    meta: presetLabel(item.kind).toLowerCase(),
    folderId: item.folderId ?? null
  }))

  const liftTexts = async (removed: string[]): Promise<void> => {
    for (const item of s.items.filter((x) => removed.includes(x.folderId ?? ''))) {
      await s.moveTo(item.id, null)
    }
  }

  const textMenu = (id: string, rename?: () => void): MenuEntry[] => [
    {
      label: t('common.showInHall'),
      hint: t('common.twoClicks'),
      onClick: () => {
        s.open(id)
        setTimeout(() => void useTexts.getState().show(), 60)
      }
    },
    { label: t('common.open'), onClick: () => s.open(id) },
    ...(rename
      ? [{ label: t('common.rename'), hint: t('common.twoClicks'), onClick: rename }]
      : []),
    {
      label: t('common.addToService'),
      hint: plan?.title ?? t('common.new'),
      onClick: () => void addText(id)
    },
    SEPARATOR,
    { label: t('common.delete'), danger: true, onClick: () => void s.remove(id) }
  ]

  const target: ControlTarget = draft
    ? {
        style: { ...look.style, ...(draft.style ?? {}) },
        background: draft.background ?? look.background,
        setStyle: (patch) => s.edit({ style: { ...(draft.style ?? {}), ...patch } }),
        setBackground: (bg) => s.edit({ background: bg }),
        reset: () => s.edit({ style: null, background: null }),
        label: draft.title.trim() || t('texts.thisText'),
        resetLabel: t('menu.resetLook')
      }
    : {
        style: look.style,
        background: look.background,
        setStyle: (patch) => setStyle('texts', patch),
        setBackground: (bg) => setBackground('texts', bg),
        reset: () => resetLook('texts'),
        label: t('texts.allTexts'),
        resetLabel: t('common.resetLook')
      }

  return (
    <div
      className="texts"
      ref={rootRef}
      style={{ gridTemplateRows: `${layout.top}px auto 1fr` }}
    >

      <div
        className="texts__top"
        ref={topRef}
        style={{ gridTemplateColumns: columnsTemplate(layout.topCols ?? []) }}
      >
        <section className="panel">
          <header className="panel__title panel__title--row">
            <span>
              {t('texts.title')}
              {s.items.length > 0 && ` · ${s.items.length}`}
            </span>
            <span className="panel__actions">
              <button
                className="link"
                title={t('tree.newFolderAtRoot')}
                onClick={() => void useTree.getState().create('text', null)}
              >
                {t('tree.addFolder')}
              </button>
            </span>
          </header>
          <div className="panel__body">
            <input
              className="search"
              value={s.query}
              placeholder={t('texts.search')}
              onChange={(e) => s.setQuery(e.target.value)}
            />
            {searching ? (
              <div className="list">
                {visible.length === 0 && <div className="hint">{t('common.nothingFound')}</div>}
                {visible.map((item) => (
                  <div
                    key={item.id}
                    className={`textitem ${draft?.id === item.id ? 'is-active' : ''}`}
                    onClick={() => s.open(item.id)}
                    onContextMenu={(e) => open(e, textMenu(item.id))}
                  >
                    <span className="textitem__title">{item.title}</span>
                    <span className="textitem__kind">{presetLabel(item.kind)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <>

                {s.items.length === 0 && (
                  <div className="hint">{t('texts.empty')}</div>
                )}
                <FolderTree
                  scope="text"
                  items={treeItems}
                  activeId={draft?.id ?? null}
                  rootLabel={t('texts.title')}
                  onOpen={(id) => s.open(id)}
                  itemMenu={(item, rename) => textMenu(item.id, rename)}
                  onRenameItem={(id, title) => void s.rename(id, title)}
                  onMoveItem={(id, folderId) => void s.moveTo(id, folderId)}
                  onFoldersRemoved={(removed) => void liftTexts(removed)}
                />
              </>
            )}
          </div>
        </section>

        <Splitter
          axis="x"
          size={layout.topCols?.[0] ?? 330}
          onResize={resizeCol('topCols', 0)}
          title={t('texts.listWidth')}
        />

        <section className="panel panel--editor">
          <header className="panel__title panel__title--row">
            <span>{draft ? presetLabel(draft.kind) : t('texts.presets')}</span>
            {draft && (
              <span className="panel__actions">
                {s.dirty && <span className="badge">{t('common.unsaved')}</span>}

                <button
                  className="link"
                  title={t('texts.exportHint')}
                  onClick={(e) => open(e, exportMenu(s.exportText, draft.id))}
                >
                  {t('texts.export')}
                </button>
                <button className="link" onClick={() => s.closeDraft()}>
                  {t('common.close')}
                </button>
              </span>
            )}
          </header>

          <div className="panel__body panel__body--editor">
            {!draft ? (
              <div className="presets">
                {PRESETS.map((kind) => (
                  <button key={kind} className="preset" onClick={() => s.create(kind)}>
                    <b>{presetLabel(kind)}</b>
                    <small>{presetHint(kind)}</small>
                  </button>
                ))}
              </div>
            ) : (
              <div className="editor__fields">
                <input
                  placeholder={t('texts.nameForList')}
                  value={draft.title}
                  onChange={(e) => s.edit({ title: e.target.value })}
                />

                {draft.kind === 'countdown' ? (
                  <>
                    <input
                      placeholder={t('texts.countdownCaption')}
                      value={draft.body}
                      onChange={(e) => s.edit({ body: e.target.value })}
                    />
                    <label className="field">
                      <span className="field__head">
                        {t('texts.minutes')} <b>{draft.countdownMinutes}</b>
                      </span>
                      <input
                        type="range"
                        min={1}
                        max={30}
                        step={1}
                        value={draft.countdownMinutes}
                        onChange={(e) =>
                          s.edit({ countdownMinutes: Number(e.target.value) })
                        }
                      />
                    </label>
                    <p className="note">{t('texts.countdownHint')}</p>
                  </>
                ) : draft.kind === 'list' ? (
                  <>
                    <ListEditor item={draft} edit={s.edit} />
                    <label className="field">
                      <span className="field__head">
                        {t('texts.perSlide')}
                        <b>{draft.perSlide ? draft.perSlide : t('texts.fit')}</b>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={8}
                        step={1}
                        value={draft.perSlide ?? 0}
                        onChange={(e) => s.edit({ perSlide: Number(e.target.value) })}
                      />
                    </label>
                    <label className="checkbox" title={t('texts.numberedHint')}>
                      <input
                        type="checkbox"
                        checked={draft.numbered ?? false}
                        onChange={(e) => s.edit({ numbered: e.target.checked })}
                      />
                      {t('texts.numbered')}
                    </label>
                    <p className="note">{listNote(draft.body, s.preview.length)}</p>
                  </>
                ) : draft.kind === 'blank' ? (
                  <FreeEditor item={draft} edit={s.edit} />
                ) : (
                  <>
                    <GrowingText
                      className="editor"
                      placeholder={t('texts.bodyPlaceholder')}
                      value={draft.body}
                      onChange={(e) => s.edit({ body: e.target.value })}
                    />
                    <input
                      placeholder={
                        draft.kind === 'quote' ? t('texts.quoteAuthor') : t('texts.caption')
                      }
                      value={draft.caption}
                      onChange={(e) => s.edit({ caption: e.target.value })}
                    />
                    <label className="checkbox" title={t('texts.lowerHint')}>
                      <input
                        type="checkbox"
                        checked={draft.asLowerThird}
                        onChange={(e) => s.edit({ asLowerThird: e.target.checked })}
                      />
                      {t('texts.lower')}
                    </label>
                  </>
                )}

                <p className="note">{t('texts.lookHint')}</p>

              </div>
            )}

            {draft && (
              <button
                className="wide editor__save"
                onClick={() => void s.save()}
                disabled={!s.dirty}
              >
                {s.dirty ? t('common.save') : t('common.saved')}
              </button>
            )}
          </div>
        </section>
      </div>

      <Splitter
        axis="y"
        size={layout.top}
        onResize={resizeTop}
        title={t('texts.editorHeight')}
      />

      <div
        className="texts__bottom"
        ref={bottomRef}
        style={{ gridTemplateColumns: columnsTemplate(layout.bottomCols) }}
      >
        <section className="panel panel--preview">
          <div className="ptabs">
            <span className="ptabs__item is-active">{t('common.preview')}</span>
          </div>
          <div
            className="previews previews--both"
            style={{ '--shot': shot } as React.CSSProperties}
          >
            <figure className="preview">
              <div className="preview__frame">
                <div className="preview__inner">
                  <SlideView
                    slide={s.preview[s.previewIndex] ?? null}
                    aspect={shot}
                    showSafeArea
                  />
                  <figcaption>
                    Подготовка
                    {s.preview.length > 1 && (
                      <span className="badge">
                        слайд {s.previewIndex + 1} из {s.preview.length}
                      </span>
                    )}
                  </figcaption>
                </div>
              </div>
            </figure>

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
                    Окно слайда
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
          </div>
        </section>

        <Splitter
          axis="x"
          size={layout.bottomCols[1]}
          inverted
          onResize={resizeCol('bottomCols', 1)}
          title={t('texts.controlsWidth')}
        />

        <section className="panel">
          <header className="panel__title panel__title--row">
            <span>{t('common.controls')}</span>
            <button
              className="link"
              onClick={() => reset('texts')}
              title={t('common.resetPanels')}
            >
              {t('common.resetView')}
            </button>
          </header>
          <div className="panel__body">
            <ControlPanel
              canShow={s.preview.length > 0}
              target={target}
              onShow={() => void s.show()}
              nav={
                <div className="control__nav control__nav--pair">
                  <button
                    className="icon-btn"
                    title={t('common.prevSlide')}
                    onClick={() => void s.stepSlide(-1)}
                    disabled={s.previewIndex === 0}
                  >
                    ◀
                  </button>
                  <button
                    className="icon-btn"
                    title={t('common.nextSlide')}
                    onClick={() => void s.stepSlide(1)}
                    disabled={s.previewIndex >= s.preview.length - 1}
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

const SIZES: { value: number; key: 'texts.sizeSmall' }[] = [
  { value: 0.6, key: 'texts.sizeSmall' },
  { value: 1, key: 'texts.sizeNormal' as 'texts.sizeSmall' },
  { value: 1.7, key: 'texts.sizeBig' as 'texts.sizeSmall' },
  { value: 2.6, key: 'texts.sizeHuge' as 'texts.sizeSmall' }
]

const PLACES: {
  value: NonNullable<TextItem['freeVertical']>
  key: 'texts.alignTop'
}[] = [
  { value: 'top', key: 'texts.alignTop' },
  { value: 'center', key: 'texts.alignCenter' as 'texts.alignTop' },
  { value: 'bottom', key: 'texts.alignBottom' as 'texts.alignTop' }
]

const PLATES: {
  value: NonNullable<TextItem['freePlate']>
  key: 'texts.plateNone'
}[] = [
  { value: 'none', key: 'texts.plateNone' },
  { value: 'dark', key: 'texts.plateDark' as 'texts.plateNone' },
  { value: 'light', key: 'texts.plateLight' as 'texts.plateNone' }
]

function FreeEditor({
  item,
  edit
}: {
  item: TextItem
  edit: (patch: Partial<TextItem>) => void
}): React.JSX.Element {
  const t = useT()
  const lines = item.free ?? []

  const set = (next: FreeLine[]): void =>
    edit({
      free: next,
      body: next.map((line) => (line.clock ? t('texts.clock') : line.text)).join('\n')
    })

  const change = (at: number, patch: Partial<FreeLine>): void =>
    set(lines.map((line, i) => (i === at ? { ...line, ...patch } : line)))

  const move = (at: number, delta: number): void => {
    const to = at + delta
    if (to < 0 || to >= lines.length) return
    const next = [...lines]
    ;[next[at], next[to]] = [next[to], next[at]]
    set(next)
  }

  return (
    <>
      {lines.map((line, at) => (
        <div className="freeline" key={at}>
          <div className="freeline__row">
            {line.clock ? (
              <span className="freeline__clock">{t('texts.clock')}</span>
            ) : (
              <input
                placeholder={t('texts.line')}
                value={line.text}
                onChange={(e) => change(at, { text: e.target.value })}
              />
            )}
            <button
              className="icon-btn"
              title={t('common.up')}
              disabled={at === 0}
              onClick={() => move(at, -1)}
            >
              ▲
            </button>
            <button
              className="icon-btn"
              title={t('common.down')}
              disabled={at === lines.length - 1}
              onClick={() => move(at, 1)}
            >
              ▼
            </button>
            <button
              className="icon-btn"
              title={t('texts.removeLine')}
              onClick={() => set(lines.filter((_, i) => i !== at))}
            >
              ✕
            </button>
          </div>
          <div className="segmented">
            {SIZES.map((size) => (
              <button
                key={size.value}
                className={line.scale === size.value ? 'is-active' : ''}
                onClick={() => change(at, { scale: size.value })}
              >
                {t(size.key)}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="freeline__row">
        <button className="wide" onClick={() => set([...lines, { text: '', scale: 1 }])}>
          {t('texts.addLine')}
        </button>
        <button
          className="wide"
          title={t('texts.clockHint')}
          onClick={() => set([...lines, { text: '', scale: 1.7, clock: true }])}
        >
          {t('texts.addClock')}
        </button>
      </div>

      <div className="field">
        {t('texts.body')}
        <div className="segmented">
          {PLACES.map((place) => (
            <button
              key={place.value}
              className={(item.freeVertical ?? 'center') === place.value ? 'is-active' : ''}
              onClick={() => edit({ freeVertical: place.value })}
            >
              {t(place.key)}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        {t('texts.lowerBadge')}
        <div className="segmented">
          {PLATES.map((plate) => (
            <button
              key={plate.value}
              className={(item.freePlate ?? 'none') === plate.value ? 'is-active' : ''}
              onClick={() => edit({ freePlate: plate.value })}
            >
              {t(plate.key)}
            </button>
          ))}
        </div>
      </div>

      <p className="note">
        {lines.length === 0 ? t('texts.blankEmpty') : t('texts.blankHint')}
      </p>
    </>
  )
}

function ListEditor({
  item,
  edit
}: {
  item: TextItem
  edit: (patch: Partial<TextItem>) => void
}): React.JSX.Element {
  const t = useT()
  const [parts, setParts] = useState<RawSection[]>(() => rawSections(item.body))

  useEffect(() => setParts(rawSections(item.body)), [item.id])

  const change = (at: number, patch: Partial<RawSection>): void => {
    const next = parts.map((part, i) => (i === at ? { ...part, ...patch } : part))
    setParts(next)
    edit({ body: writeSections(next) })
  }

  return (
    <>
      {parts.map((part, at) => (
        <div className="listsec" key={at}>
          <input
            className="listsec__head"
            placeholder={t('texts.sectionHead')}
            value={part.heading}
            onChange={(e) => change(at, { heading: e.target.value })}
          />
          <GrowingText
            className="editor listsec__items"
            placeholder={t('texts.listHint')}
            value={part.text}
            onChange={(e) => change(at, { text: e.target.value })}
          />
        </div>
      ))}
    </>
  )
}

function listNote(body: string, slides: number): string {
  const items = countItems(body)
  if (items === 0) return t('texts.listEmpty')

  return t('texts.itemsAndSlides', {
    items: tn('n.item', items),
    slides: tn('n.slide', slides)
  })
}

function exportMenu(
  save: (format: TextFormat, id: string) => Promise<string | null>,
  id: string
): MenuEntry[] {
  return TEXT_FORMAT_ORDER.map((format) => ({
    label: `${TEXT_FORMATS[format].name} · .${TEXT_FORMATS[format].extension}`,
    onClick: () => void save(format, id)
  }))
}
