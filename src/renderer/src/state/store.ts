import { create } from 'zustand'
import type { BibleClass, SearchHit, Slide, TranslationMeta } from '@shared/types'
import { planSlides } from '@shared/slide'
import { domFitTest } from '../lib/fitTest'
import { useScreen } from './screen'
import { remember } from './undo'
import { t } from '@shared/i18n'
import { useLive } from './live'
import { ownsScreen } from './output'
import { lookFor } from './look'
import {
  buildBookIndex,
  formatReference,
  formatSlideReference,
  parseReference,
  parseReferenceList,
  type BookIndex
} from '@shared/refs'

export interface Verse {
  n: number
  html: string
  plain: string
}

export interface HistoryItem {
  label: string

  text: string
  book: number
  chapter: number
  from: number
  to: number
}

export interface PlanItem {
  id: string
  label: string

  text: string
  book: number
  chapter: number
  from: number | null
  to: number | null

  shown: boolean
}

interface BibleState {
  ready: boolean
  catalog: TranslationMeta[]
  translationId: string | null
  meta: TranslationMeta | null
  bookIndex: BookIndex | null

  secondaryId: string | null

  cls: BibleClass
  book: number | null
  chapter: number | null
  verses: Verse[]
  selFrom: number | null
  selTo: number | null

  query: string
  hits: SearchHit[]
  searching: boolean

  plan: PlanItem[]
  history: HistoryItem[]

  preview: Slide[]
  previewIndex: number

}

interface BibleActions {
  init: () => Promise<void>
  setCatalog: (catalog: TranslationMeta[]) => Promise<void>
  setTranslation: (id: string) => Promise<void>
  setSecondary: (id: string | null) => Promise<void>
  setClass: (cls: BibleClass) => void
  selectBook: (book: number) => Promise<void>
  selectChapter: (chapter: number) => Promise<void>
  selectVerse: (n: number, extend: boolean) => Promise<void>
  selectRange: (a: number, b: number) => Promise<void>
  goTo: (book: number, chapter: number, from?: number | null, to?: number | null) => Promise<void>

  setQuery: (q: string) => void
  runSearch: () => Promise<void>

  addToPlan: (text: string) => void
  addSelectionToPlan: () => Promise<void>
  addRefToPlan: (book: number, chapter: number, from: number, to: number) => Promise<void>
  removeFromPlan: (id: string) => void
  reorderPlan: (fromIndex: number, toIndex: number) => void
  togglePlanShown: (id: string) => void
  clearPlan: () => void

  setPreviewIndex: (i: number) => void
  show: () => Promise<void>
  showVerse: (n: number) => Promise<void>
  stepVerse: (delta: number) => Promise<void>
  stepSlide: (delta: number) => Promise<void>
  showNext: () => Promise<void>
  showPrev: () => Promise<void>
  hide: () => Promise<void>
  toggleBlackout: () => Promise<void>
  toggleHideText: () => Promise<void>

  rebuild: () => Promise<void>

  advance: () => Promise<boolean>
}

export const useBible = create<BibleState & BibleActions>((set, get) => ({
  ready: false,
  catalog: [],
  translationId: null,
  meta: null,
  bookIndex: null,
  secondaryId: null,

  cls: 'all',
  book: null,
  chapter: null,
  verses: [],
  selFrom: null,
  selTo: null,

  query: '',
  hits: [],
  searching: false,

  plan: [],
  history: [],

  preview: [],
  previewIndex: 0,

  init: async () => {
    const [catalog, saved] = await Promise.all([
      window.api.bible.catalog(),
      window.api.settings.all()
    ])

    set({
      plan: ((saved.plan as PlanItem[] | undefined) ?? []).map((p) => ({
        ...p,
        text: p.text ?? '',
        shown: p.shown ?? false
      }))
    })

    await get().setCatalog(catalog)
  },

  setCatalog: async (catalog) => {
    set({ catalog, ready: true })
    const current = get().translationId
    if (!current && catalog.length > 0) {
      await get().setTranslation(catalog[0].id)
    } else if (current && !catalog.some((t) => t.id === current)) {
      await get().setTranslation(catalog[0]?.id ?? '')
    }
  },

  setTranslation: async (id) => {
    if (!id) return
    const meta = await window.api.bible.meta(id)
    set({ translationId: id, meta, bookIndex: buildBookIndex(meta.books) })

    const { book, chapter } = get()
    if (book && chapter) {
      await get().goTo(book, chapter, get().selFrom, get().selTo)
    } else {

      const john = meta.books.find((b) => b.abbrev.includes('Ин'))
      await get().goTo(john?.index ?? meta.books[0]?.index ?? 1, 1)
    }
  },

  setSecondary: async (id) => {
    set({ secondaryId: id })
    await rebuildPreview(set, get)
  },

  setClass: (cls) => set({ cls }),

  selectBook: async (book) => {
    set({ book, chapter: 1, selFrom: null, selTo: null, verses: [] })
    await get().selectChapter(1)
  },

  selectChapter: async (chapter) => {
    const { translationId, book } = get()
    if (!translationId || !book) return
    const verses = await window.api.bible.chapter(translationId, book, chapter)
    set({ chapter, verses, selFrom: null, selTo: null, preview: [], previewIndex: 0 })
  },

  selectVerse: async (n, extend) => {
    const { selFrom } = get()
    if (extend && selFrom !== null) {
      set({ selFrom: Math.min(selFrom, n), selTo: Math.max(selFrom, n) })
    } else {
      set({ selFrom: n, selTo: n })
    }
    await rebuildPreview(set, get)
  },

  selectRange: async (a, b) => {
    const from = Math.min(a, b)
    const to = Math.max(a, b)
    if (get().selFrom === from && get().selTo === to) return
    set({ selFrom: from, selTo: to })
    await rebuildPreview(set, get)
  },

  goTo: async (book, chapter, from = null, to = null) => {
    const { translationId } = get()
    if (!translationId) return
    const verses = await window.api.bible.chapter(translationId, book, chapter)
    set({
      book,
      chapter,
      verses,
      selFrom: from,
      selTo: to ?? from,
      preview: [],
      previewIndex: 0
    })
    if (from) await rebuildPreview(set, get)
  },

  setQuery: (query) => set({ query }),

  runSearch: async () => {
    const { query, translationId, bookIndex } = get()
    if (!translationId || !query.trim()) {
      set({ hits: [] })
      return
    }

    const ref = bookIndex ? parseReference(query, bookIndex) : null
    if (ref) {
      set({ hits: [] })
      await get().goTo(ref.book, ref.chapter, ref.from, ref.to)
      return
    }

    set({ searching: true })
    try {
      const hits = await window.api.bible.search(translationId, query)
      set({ hits })
    } finally {
      set({ searching: false })
    }
  },

  addToPlan: (text) => {
    const { bookIndex, meta } = get()
    if (!bookIndex || !meta) return

    const refs = parseReferenceList(text, bookIndex)
    if (refs.length === 0) return

    const items: PlanItem[] = refs.map((ref, i) => {
      const book = meta.books[ref.book - 1]
      return {
        id: `${Date.now()}-${i}`,
        label: formatReference(
          book?.abbrev[0] ?? book?.name ?? '?',
          ref.chapter,
          ref.from,
          ref.to
        ),
        text: '',
        book: ref.book,
        chapter: ref.chapter,
        from: ref.from,
        to: ref.to,
        shown: false
      }
    })
    commitPlan(set, get, [...get().plan, ...items], t('undo.planAdd', { n: items.length }))

    void fillPlanText(set, get)
  },

  addSelectionToPlan: async () => {
    const { book, chapter, selFrom, selTo } = get()
    if (!book || !chapter || !selFrom) return
    await get().addRefToPlan(book, chapter, selFrom, selTo ?? selFrom)
  },

  addRefToPlan: async (book, chapter, from, to) => {
    const { meta, translationId } = get()
    if (!meta || !translationId) return

    const bookMeta = meta.books[book - 1]
    const label = formatReference(
      bookMeta?.abbrev[0] ?? bookMeta?.name ?? '?',
      chapter,
      from,
      to
    )

    if (get().plan.some((p) => p.label === label)) return

    const passage = await window.api.bible.passage(translationId, book, chapter, from, to)
    const item: PlanItem = {
      id: `${Date.now()}`,
      label,
      text: passage?.verses.map((v) => v.plain).join(' ') ?? '',
      book,
      chapter,
      from,
      to,
      shown: false
    }
    commitPlan(set, get, [...get().plan, item], t('undo.planAdd', { n: 1 }))
  },

  removeFromPlan: (id) =>
    commitPlan(set, get, get().plan.filter((p) => p.id !== id), t('undo.planRemove')),

  reorderPlan: (fromIndex, toIndex) => {
    const plan = [...get().plan]
    const [moved] = plan.splice(fromIndex, 1)
    if (!moved) return
    plan.splice(toIndex, 0, moved)
    commitPlan(set, get, plan, t('undo.itemMove'))
  },

  togglePlanShown: (id) =>
    commitPlan(
      set,
      get,
      get().plan.map((p) => (p.id === id ? { ...p, shown: !p.shown } : p))
    ),

  clearPlan: () => commitPlan(set, get, [], t('undo.planClear')),

  setPreviewIndex: (i) => {
    const max = Math.max(0, get().preview.length - 1)
    set({ previewIndex: Math.min(Math.max(i, 0), max) })
  },

  show: async () => {
    const { preview, previewIndex, book, chapter, selFrom, selTo, meta, history, verses } =
      get()
    const slide = preview[previewIndex]
    if (!slide) return

    await useLive.getState().show(slide)

    ownsScreen((delta) => useBible.getState().stepSlide(delta))

    if (book && chapter && selFrom && meta) {
      const bookMeta = meta.books[book - 1]
      const label = formatReference(
        bookMeta?.abbrev[0] ?? bookMeta?.name ?? '?',
        chapter,
        selFrom,
        selTo
      )
      const item: HistoryItem = {
        label,
        text: verses.find((v) => v.n === selFrom)?.plain ?? '',
        book,
        chapter,
        from: selFrom,
        to: selTo ?? selFrom
      }
      set({ history: [item, ...history.filter((h) => h.label !== label)].slice(0, 50) })

      const plan = get().plan
      if (plan.some((p) => p.label === label && !p.shown)) {
        commitPlan(
          set,
          get,
          plan.map((p) => (p.label === label ? { ...p, shown: true } : p))
        )
      }
    }
  },

  showVerse: async (n) => {
    await get().selectVerse(n, false)
    await get().show()
  },

  stepVerse: async (delta) => {
    const { selFrom, selTo, verses, chapter, book, meta } = get()
    if (!selFrom || !book || !chapter || !meta) return

    const wasLive = useLive.getState().live.slide !== null
    const next = (delta > 0 ? (selTo ?? selFrom) : selFrom) + delta

    if (next >= 1 && next <= verses.length) {
      await get().selectVerse(next, false)
    } else if (next < 1 && chapter > 1) {

      const prev = await window.api.bible.chapter(get().translationId!, book, chapter - 1)
      await get().goTo(book, chapter - 1, prev.length, prev.length)
    } else if (next > verses.length && chapter < (meta.books[book - 1]?.chapters ?? 1)) {
      await get().goTo(book, chapter + 1, 1, 1)
    } else {
      return
    }

    if (wasLive) await get().show()
  },

  stepSlide: async (delta) => {
    const next = get().previewIndex + delta
    if (next < 0 || next >= get().preview.length) return

    const wasLive = useLive.getState().live.slide !== null
    set({ previewIndex: next })
    if (wasLive) await get().show()
  },

  showNext: async () => {
    const { previewIndex, preview } = get()
    if (previewIndex + 1 < preview.length) {
      set({ previewIndex: previewIndex + 1 })
      await get().show()
    }
  },

  showPrev: async () => {
    const { previewIndex } = get()
    if (previewIndex > 0) {
      set({ previewIndex: previewIndex - 1 })
      await get().show()
    }
  },

  hide: async () => useLive.getState().clear(),

  toggleBlackout: async () => useLive.getState().toggleBlackout(),

  toggleHideText: async () => useLive.getState().toggleHideText(),

  rebuild: async () => rebuildPreview(set, get),

  advance: async () => {
    if (get().previewIndex + 1 >= get().preview.length) return false
    await get().showNext()
    return true
  }
}))

type Setter = (partial: Partial<BibleState>) => void
type Getter = () => BibleState & BibleActions

async function rebuildPreview(set: Setter, get: Getter): Promise<void> {
  const { translationId, book, chapter, selFrom, selTo, secondaryId } = get()
  const { style, background } = lookFor('bible')

  if (!translationId || !book || !chapter || !selFrom) {
    set({ preview: [], previewIndex: 0 })
    return
  }

  const passage = await window.api.bible.passage(
    translationId,
    book,
    chapter,
    selFrom,
    selTo ?? selFrom
  )
  if (!passage) {
    set({ preview: [], previewIndex: 0 })
    return
  }

  const secondary =
    secondaryId && secondaryId !== translationId
      ? await window.api.bible.passage(secondaryId, book, chapter, selFrom, selTo ?? selFrom)
      : null
  const secondaryByVerse = new Map(secondary?.verses.map((v) => [v.n, v.html]) ?? [])

  const planned = planSlides(
    passage.verses.map((v) => ({ n: v.n, html: v.html })),
    style,
    domFitTest({
      style,

      aspect: useScreen.getState().aspect,
      secondaryFor: secondaryByVerse.size
        ? (verse) => secondaryByVerse.get(verse)
        : undefined
    })
  )

  const bookMeta = get().meta?.books[book - 1]

  const slides: Slide[] = planned.map((part, i) => ({
    id: `bible-${translationId}-${book}-${chapter}-${selFrom}-${i}`,
    kind: 'bible',
    blocks: part.blocks,
    reference: bookMeta
      ? formatSlideReference(
          bookMeta,
          chapter,
          part.verses[0] ?? selFrom,
          part.verses[part.verses.length - 1] ?? selTo,
          style.referenceFormat
        )
      : passage.reference,
    secondary: secondaryByVerse.size
      ? {
          blocks: part.verses.flatMap((n) => {
            const html = secondaryByVerse.get(n)
            return html ? [{ html, verse: n }] : []
          })
        }
      : undefined,
    background,
    style
  }))

  set({ preview: slides, previewIndex: 0 })
}

function commitPlan(
  set: Setter,
  get: Getter,
  plan: PlanItem[],
  label?: string
): void {
  const was = get().plan
  set({ plan })
  void window.api.settings.set('plan', plan)

  if (!label) return

  const put = (list: PlanItem[]): void => {
    useBible.setState({ plan: list })
    void window.api.settings.set('plan', list)
  }
  remember({ label, undo: () => put(was), redo: () => put(plan) })
}

async function fillPlanText(set: Setter, get: Getter): Promise<void> {
  const { translationId } = get()
  if (!translationId) return

  const filled = await Promise.all(
    get().plan.map(async (item) => {
      if (item.text) return item
      const passage = await window.api.bible.passage(
        translationId,
        item.book,
        item.chapter,
        item.from ?? 1,
        item.to ?? item.from ?? 1
      )
      return { ...item, text: passage?.verses.map((v) => v.plain).join(' ') ?? '' }
    })
  )
  commitPlan(set, get, filled)
}
