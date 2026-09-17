import { create } from 'zustand'
import type { Slide, SlideBlock, SlideStyle, TextItem, TextKind } from '@shared/types'
import { escapeHtml, splitBySentences } from '@shared/text'
import { freeBlocks } from '@shared/slide'
import { t, tn, type Key } from '@shared/i18n'
import type { TextFormat } from '@shared/textFormats'
import {
  listBlocks,
  listSections,
  listTitle,
  MAX_ITEMS,
  packItems
} from '@shared/textList'
import { domFitTest } from '../lib/fitTest'
import { useScreen } from './screen'
import { remember } from './undo'
import { useUi } from './ui'
import { useLive } from './live'
import { ownsScreen } from './output'
import { lookFor } from './look'

export const PRESETS: TextKind[] = [
  'announcement',
  'quote',
  'sermon',
  'list',
  'blank',
  'countdown'
]

export const presetLabel = (kind: TextKind): string => t(`preset.${kind}` as Key)
export const presetHint = (kind: TextKind): string =>
  t(`preset.${kind}Hint` as Key)

const LIST_STYLE: Partial<SlideStyle> = {
  align: 'left',
  fontSizeVh: 6,
  minFontSizeVh: 4,
  showReference: false,
  showVerseNumbers: false,
  dividers: false
}

const PRESET_STYLE: Record<TextKind, Partial<SlideStyle>> = {
  announcement: { align: 'center', showReference: false, showVerseNumbers: false },
  quote: { align: 'center', showReference: true, showVerseNumbers: false, dividers: true },
  sermon: {
    align: 'center',
    uppercase: true,
    fontSizeVh: 10,
    showReference: false,
    showVerseNumbers: false,
    dividers: false
  },

  list: LIST_STYLE,
  blank: { showReference: false, dividers: false },
  countdown: {
    align: 'center',
    fontSizeVh: 12,
    showReference: false,
    showVerseNumbers: false,
    dividers: false
  }
}

export function emptyText(kind: TextKind = 'announcement'): TextItem {
  return {
    id: `txt-${Date.now()}`,
    kind,
    title: '',
    body: '',
    caption: '',
    style: PRESET_STYLE[kind],
    background: null,
    asLowerThird: false,
    countdownMinutes: 5,
    numbered: false,
    perSlide: 0,
    updatedAt: Date.now()
  }
}

interface TextsStore {
  items: TextItem[]

  draft: TextItem | null

  dirty: boolean
  query: string

  preview: Slide[]
  previewIndex: number

  init: () => Promise<void>
  setQuery: (q: string) => void
  create: (kind: TextKind) => void
  open: (id: string) => void

  edit: (patch: Partial<TextItem>, note?: { label: string; merge?: string }) => void
  save: () => Promise<void>
  remove: (id: string) => Promise<void>

  rename: (id: string, title: string) => Promise<void>

  moveTo: (id: string, folderId: string | null) => Promise<void>
  closeDraft: () => void

  exportText: (format: TextFormat, id: string) => Promise<string | null>

  rebuild: () => void
  setPreviewIndex: (i: number) => void
  show: () => Promise<void>
  next: () => Promise<void>
  prev: () => Promise<void>
  stepSlide: (delta: number) => Promise<void>

  advance: () => Promise<boolean>
  showAsLowerThird: () => Promise<void>
}

export const useTexts = create<TextsStore>((set, get) => ({
  items: [],
  draft: null,
  dirty: false,
  query: '',
  preview: [],
  previewIndex: 0,

  init: async () => set({ items: await window.api.texts.list() }),

  setQuery: (query) => set({ query }),

  create: (kind) => {
    set({ draft: emptyText(kind), dirty: false })
    get().rebuild()
  },

  open: (id) => {
    const item = get().items.find((i) => i.id === id)
    if (!item) return
    set({ draft: { ...item }, dirty: false, previewIndex: 0 })
    get().rebuild()
  },

  edit: (patch, note) => {
    const draft = get().draft
    if (!draft) return

    const next = { ...draft, ...patch }
    remember({
      label: note?.label ?? t('undo.textEdit'),
      merge: note ? note.merge : `text-${draft.id}-${Object.keys(patch).sort().join(',')}`,
      undo: () => showDraft(draft),
      redo: () => showDraft(next)
    })

    set({ draft: next, dirty: true })
    get().rebuild()
  },

  save: async () => {
    const draft = get().draft
    if (!draft) return

    const title =
      draft.title.trim() ||
      (draft.kind === 'list' ? listTitle(draft.body) : '') ||
      firstLine(draft.body) ||
      t('common.untitled')
    const items = await window.api.texts.save({ ...draft, title })
    set({ items, draft: { ...draft, title }, dirty: false })
  },

  rename: async (id, title) => {
    const item = get().items.find((i) => i.id === id)
    if (!item || item.title === title) return

    const put = async (name: string): Promise<void> => {
      const one = get().items.find((i) => i.id === id)
      if (!one) return
      const items = await window.api.texts.save({ ...one, title: name })
      const draft = get().draft
      set({ items, draft: draft?.id === id ? { ...draft, title: name } : draft })
    }

    const was = item.title
    await put(title)
    remember({
      label: t('undo.rename'),
      merge: `text-name-${id}`,
      undo: () => put(was),
      redo: () => put(title)
    })
  },

  moveTo: async (id, folderId) => {
    const item = get().items.find((i) => i.id === id)
    if (!item || (item.folderId ?? null) === folderId) return

    const put = async (to: string | null): Promise<void> => {
      const one = get().items.find((i) => i.id === id)
      if (!one) return
      set({ items: await window.api.texts.save({ ...one, folderId: to }) })
    }

    const was = item.folderId ?? null
    await put(folderId)
    remember({ label: t('undo.move'), undo: () => put(was), redo: () => put(folderId) })
  },

  remove: async (id) => {
    const item = get().items.find((i) => i.id === id)

    const drop = async (): Promise<void> => {
      set({ items: await window.api.texts.remove(id) })
      if (get().draft?.id === id) set({ draft: null, preview: [], previewIndex: 0 })
    }

    await drop()
    if (!item) return

    remember({
      label: t('undo.textRemove', {
        title: item.title || firstLine(item.body) || t('common.untitled')
      }),
      undo: async () => {
        await window.api.trash.restore('text', id)
        set({ items: await window.api.texts.list() })
      },
      redo: drop
    })
  },

  closeDraft: () => set({ draft: null, dirty: false, preview: [], previewIndex: 0 }),

  exportText: (format, id) => window.api.texts.export(format, [id]),

  rebuild: () => {
    const draft = get().draft
    if (!draft) {
      set({ preview: [], previewIndex: 0 })
      return
    }

    const look = lookFor('texts')
    const style: SlideStyle = { ...look.style, ...(draft.style ?? {}) }
    const background = draft.background ?? look.background
    const slides = buildSlides(draft, style, background)

    set({
      preview: slides,
      previewIndex: Math.min(get().previewIndex, Math.max(0, slides.length - 1))
    })
  },

  setPreviewIndex: (i) => {
    const max = Math.max(0, get().preview.length - 1)
    set({ previewIndex: Math.min(Math.max(i, 0), max) })
  },

  show: async () => {
    const slide = get().preview[get().previewIndex]
    if (!slide) return
    if (get().draft?.asLowerThird) {
      await get().showAsLowerThird()
      return
    }
    await useLive.getState().show(slide)

    ownsScreen((delta) => useTexts.getState().stepSlide(delta))
  },

  next: async () => {
    const { previewIndex, preview } = get()
    if (previewIndex + 1 >= preview.length) return
    set({ previewIndex: previewIndex + 1 })
    await get().show()
  },

  prev: async () => {
    const { previewIndex } = get()
    if (previewIndex === 0) return
    set({ previewIndex: previewIndex - 1 })
    await get().show()
  },

  stepSlide: async (delta) => {
    const next = get().previewIndex + delta
    if (next < 0 || next >= get().preview.length) return

    const wasLive = useLive.getState().live.slide !== null
    set({ previewIndex: next })
    if (wasLive) await get().show()
  },

  advance: async () => {
    if (get().previewIndex + 1 >= get().preview.length) return false
    await get().next()
    return true
  },

  showAsLowerThird: async () => {
    const draft = get().draft
    if (!draft) return
    const text = draft.body.split(/\n\s*\n/)[0]?.replace(/\s+/g, ' ').trim()
    if (text) await useLive.getState().showLowerThird(text)
  }
}))

function showDraft(item: TextItem): void {
  useTexts.setState({ draft: item, dirty: true })
  useTexts.getState().rebuild()
  if (useUi.getState().tab !== 'texts') useUi.getState().goEdit('texts')
}

const firstLine = (body: string): string =>
  body.split('\n').find((l) => l.trim())?.trim().slice(0, 60) ?? ''

type SlideBase = Omit<Slide, 'id' | 'blocks'>

function buildSlides(
  item: TextItem,
  style: SlideStyle,
  background: TextItem['background'] extends infer B ? NonNullable<B> : never
): Slide[] {
  const base = {
    kind: 'text' as const,
    background,
    style,
    reference: item.caption || undefined
  }

  if (item.kind === 'countdown') {
    return [
      {
        ...base,
        id: `${item.id}-countdown`,
        kind: 'countdown' as const,
        blocks: [],
        reference: undefined,
        countdown: {
          endsAt: Date.now() + Math.max(0, item.countdownMinutes) * 60_000,
          caption: item.body.trim() || t('texts.startingIn'),
          finishedText: t('texts.starting')
        }
      }
    ]
  }

  if (item.kind === 'list') return listSlides(item, style, base)

  if (item.kind === 'blank') return [freeSlide(item, base)]

  const parts = item.body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)

  if (parts.length === 0) {
    return [{ ...base, id: `${item.id}-empty`, blocks: [], reference: undefined }]
  }

  const fits = domFitTest({ style, aspect: useScreen.getState().aspect })

  return parts.flatMap((part, i) => {
    const chunks = fitChunks(part, fits)

    return chunks.map((chunk, j) => ({
      ...base,
      id: `${item.id}-${i}-${j}`,
      blocks: chunk.split('\n').map((line) => ({ html: escapeHtml(line) })),

      reference: j === chunks.length - 1 ? base.reference : undefined
    }))
  })
}

function fitChunks(part: string, fits: ReturnType<typeof domFitTest>): string[] {
  if (fits([{ html: escapeHtml(part) }])) return [part]

  for (let count = 2; count <= 12; count++) {
    const pieces = splitBySentences(part, count)
    if (pieces.length > 1 && pieces.every((p) => fits([{ html: escapeHtml(p) }]))) {
      return pieces
    }
  }
  return [part]
}

function freeSlide(item: TextItem, base: SlideBase): Slide {
  const blocks = freeBlocks(item.free ?? [])
  const plate = item.freePlate && item.freePlate !== 'none' ? item.freePlate : undefined

  return {
    ...base,
    id: `${item.id}-free`,
    reference: undefined,
    blocks,
    vertical: item.freeVertical ?? 'center',

    plate: blocks.length > 0 ? plate : undefined
  }
}

function listSlides(item: TextItem, style: SlideStyle, base: SlideBase): Slide[] {
  const numbered = item.numbered ?? false
  const perSlide = item.perSlide ?? 0

  const sections = listSections(item.body).filter((section) => section.items.length > 0)
  if (sections.length === 0) return [{ ...base, id: `${item.id}-list`, blocks: [] }]

  const fits = domFitTest({
    style: perSlide > 0 ? style : { ...style, minFontSizeVh: style.fontSizeVh },
    aspect: useScreen.getState().aspect
  })
  const limit = perSlide > 0 ? perSlide : MAX_ITEMS

  const slides = sections.flatMap((section, at) => {
    let passed = 0
    const blocks = (items: string[]): SlideBlock[] =>
      listBlocks(section.heading, items, numbered, passed)

    return packItems(section.items, (items) => fits(blocks(items)), limit).map((items, i) => {
      const slide = {
        ...base,
        id: `${item.id}-${at}-${i}`,
        blocks: blocks(items),

        vertical: 'top' as const,

        style: { ...style, fitToScreen: false }
      }
      passed += items.length
      return { slide, count: items.length }
    })
  })

  return withTails(slides)
}

function withTails(slides: { slide: Slide; count: number }[]): Slide[] {
  if (slides.length < 2) return slides.map((s) => s.slide)

  const total = slides.reduce((sum, s) => sum + s.count, 0)
  let passed = 0

  return slides.map(({ slide, count }) => {
    passed += count
    const left = total - passed
    return {
      ...slide,
      tail:
        left > 0
          ? { kind: 'more' as const, label: t('list.more', { n: tn('n.item', left) }) }
          : { kind: 'end' as const }
    }
  })
}
