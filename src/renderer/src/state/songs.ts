import { create } from 'zustand'
import type {
  Slide,
  SlideStyle,
  Song,
  SongCategory,
  SongPart,
  SongPartKind
} from '@shared/types'
import { freeCategoryName, movedCategory, placedCategory } from '@shared/categories'
import {
  defaultOrder,
  emptySong,
  newPart,
  parseSongText,
  partTitle,
  withKind
} from '@shared/songs'
import type { SongFormat } from '@shared/songFormats'
import { splitBySentences } from '@shared/text'
import { readableStyleOn } from '@shared/backgrounds'
import { brightnessOf } from '../lib/backLight'
import { t } from '@shared/i18n'
import { domFitTest } from '../lib/fitTest'
import { useScreen } from './screen'
import { remember } from './undo'
import { useUi } from './ui'
import { useLive } from './live'
import { ownsScreen } from './output'
import { lookFor, useLook } from './look'

export interface SongSlide {
  slide: Slide
  partId: string

  indexInPart: number

  position: number

  key: string

  times: number
}

export const MAX_TIMES = 9

export interface ImportReport {
  added: number

  backgrounds: { added: number; existed: number }

  ids: string[]
  formats: Record<string, number>
  skipped: { file: string; reason: string }[]

  duplicates: string[]
}

interface SongsStore {
  items: Song[]

  categories: SongCategory[]

  categoryId: string | null
  draft: Song | null
  dirty: boolean
  query: string

  slides: SongSlide[]
  index: number

  init: () => Promise<void>
  setQuery: (q: string) => void

  pickCategory: (id: string | null) => void

  addCategory: () => Promise<string | null>
  renameCategory: (id: string, name: string) => Promise<void>
  moveCategory: (id: string, delta: number) => Promise<void>

  placeCategory: (id: string, targetId: string) => Promise<void>

  removeCategory: (id: string) => Promise<void>

  setCategory: (ids: string[], categoryId: string | null) => Promise<void>
  create: () => void
  open: (id: string) => void

  edit: (patch: Partial<Song>, note?: { label: string; merge?: string }) => void
  save: () => Promise<void>
  remove: (id: string) => Promise<void>

  rename: (id: string, title: string) => Promise<void>

  moveTo: (id: string, folderId: string | null) => Promise<void>
  closeDraft: () => void
  importFiles: () => Promise<ImportReport>

  addFiles: (
    files: string[],
    folderId?: string | null,
    categoryId?: string | null
  ) => Promise<ImportReport>
  exportSong: (format: SongFormat, songId: string) => Promise<string | null>

  reorder: (ids: string[]) => Promise<void>

  addPart: (kind: SongPartKind) => void
  editPart: (id: string, patch: Partial<SongPart>) => void

  setPartKind: (id: string, kind: SongPartKind) => void

  duplicatePart: (id: string) => void

  movePart: (id: string, delta: number) => void
  removePart: (id: string) => void
  setOrder: (order: string[]) => void
  appendToOrder: (partId: string) => void
  removeFromOrder: (at: number) => void
  resetOrder: () => void
  parseInto: (text: string) => void

  rebuild: () => void
  goTo: (index: number) => Promise<void>
  goToPart: (partId: string) => Promise<void>

  setTimes: (index: number, times: number) => void
  step: (delta: number) => Promise<void>
  show: () => Promise<void>

  advance: () => Promise<boolean>
}

export const useSongs = create<SongsStore>((set, get) => ({
  items: [],
  categories: [],
  categoryId: null,
  draft: null,
  dirty: false,
  query: '',
  slides: [],
  index: 0,

  init: async () => {
    const [items, categories, saved] = await Promise.all([
      window.api.songs.list(),
      window.api.categories.list(),
      window.api.settings.all()
    ])
    const kept = typeof saved.songCategory === 'string' ? saved.songCategory : null
    set({
      items,
      categories,
      categoryId: categories.some((one) => one.id === kept) ? kept : null
    })
  },

  setQuery: (query) => set({ query }),

  pickCategory: (categoryId) => {
    if (categoryId !== null && !get().categories.some((one) => one.id === categoryId)) return
    set({ categoryId })
    void window.api.settings.set('songCategory', categoryId)
  },

  addCategory: async () => {
    const was = get().categories
    const made: SongCategory = {
      id: `cat-${Date.now()}`,
      name: freeCategoryName(was, t('cats.new'))
    }
    const next = [...was, made]

    await putCategories(next)
    remember({
      label: t('undo.category'),
      undo: () => putCategories(was),
      redo: () => putCategories(next)
    })

    return made.id
  },

  renameCategory: async (id, name) => {
    const was = get().categories
    const clean = name.trim()
    if (!clean || !was.some((one) => one.id === id && one.name !== clean)) return

    const next = was.map((one) => (one.id === id ? { ...one, name: clean } : one))
    await putCategories(next)
    remember({
      label: t('undo.category'),
      merge: `category-name-${id}`,
      undo: () => putCategories(was),
      redo: () => putCategories(next)
    })
  },

  moveCategory: async (id, delta) => {
    const was = get().categories
    const next = movedCategory(was, id, delta)
    if (next === was) return

    await putCategories(next)
    remember({
      label: t('undo.category'),
      undo: () => putCategories(was),
      redo: () => putCategories(next)
    })
  },

  placeCategory: async (id, targetId) => {
    const was = get().categories
    const next = placedCategory(was, id, targetId)
    if (next === was) return

    await putCategories(next)
    remember({
      label: t('undo.category'),
      undo: () => putCategories(was),
      redo: () => putCategories(next)
    })
  },

  removeCategory: async (id) => {
    const was = get().categories
    const gone = was.find((one) => one.id === id)
    if (!gone) return

    const members = get()
      .items.filter((song) => song.categoryId === id)
      .map((song) => song.id)
    const next = was.filter((one) => one.id !== id)

    const drop = async (): Promise<void> => {
      await putCategories(next)
      followDraft(members, null)
    }

    await drop()
    remember({
      label: t('undo.categoryRemove', { name: gone.name }),
      undo: async () => {
        await putCategories(was)
        set({ items: await window.api.songs.setCategory(members, id) })
        followDraft(members, id)
      },
      redo: drop
    })
  },

  setCategory: async (ids, categoryId) => {
    const moving = get().items.filter(
      (song) => ids.includes(song.id) && (song.categoryId ?? null) !== categoryId
    )
    if (moving.length === 0) return

    const put = async (to: string | null, which: string[]): Promise<void> => {
      set({ items: await window.api.songs.setCategory(which, to) })
      followDraft(which, to)
    }

    const back = new Map<string | null, string[]>()
    for (const song of moving) {
      const was = song.categoryId ?? null
      back.set(was, [...(back.get(was) ?? []), song.id])
    }
    const all = moving.map((song) => song.id)

    await put(categoryId, all)
    remember({
      label: t('undo.songCategory'),
      undo: async () => {
        for (const [was, which] of back) await put(was, which)
      },
      redo: () => put(categoryId, all)
    })
  },

  create: () => {
    set({ draft: { ...emptySong(), categoryId: get().categoryId }, dirty: false, index: 0 })
    get().rebuild()
  },

  open: (id) => {
    const song = get().items.find((s) => s.id === id)
    if (!song) return
    set({ draft: structuredClone(song), dirty: false, index: 0 })
    get().rebuild()
  },

  edit: (patch, note) => {
    const draft = get().draft
    if (!draft) return

    const next = { ...draft, ...patch }
    remember({
      label: note?.label ?? t('undo.songEdit'),

      merge: note ? note.merge : `song-${draft.id}-${Object.keys(patch).sort().join(',')}`,
      undo: () => showDraft(draft),
      redo: () => showDraft(next)
    })

    set({ draft: next, dirty: true })
    get().rebuild()
  },

  save: async () => {
    const draft = get().draft
    if (!draft) return

    const title = draft.title.trim() || firstLine(draft) || t('common.untitled')
    const was = get().items.find((s) => s.id === draft.id)?.number ?? ''
    let items = await window.api.songs.save({ ...draft, title })

    const number = Number.parseInt(draft.number, 10)
    if (draft.number !== was && Number.isFinite(number) && number > 0) {
      items = await window.api.songs.place(draft.id, number)
    }

    set({ items, draft: { ...draft, title }, dirty: false })
  },

  reorder: async (ids) => {
    const was = get()
      .items.filter((s) => ids.includes(s.id))
      .map((s) => ({ id: s.id, number: s.number }))

    const put = async (numbers: { id: string; number: string }[]): Promise<void> => {
      let items = useSongs.getState().items
      for (const { id, number } of numbers) {
        const one = items.find((s) => s.id === id)
        if (one) items = await window.api.songs.save({ ...one, number })
      }
      useSongs.setState({ items })
    }

    const put1toN = async (): Promise<void> => {
      useSongs.setState({ items: await window.api.songs.renumber(ids) })
    }

    await put1toN()
    remember({ label: t('undo.songOrder'), undo: () => put(was), redo: put1toN })
  },

  rename: async (id, title) => {
    const song = get().items.find((s) => s.id === id)
    if (!song || song.title === title) return

    const put = async (name: string): Promise<void> => {
      const one = get().items.find((s) => s.id === id)
      if (!one) return
      const items = await window.api.songs.save({ ...one, title: name })

      const draft = get().draft
      set({ items, draft: draft?.id === id ? { ...draft, title: name } : draft })
    }

    const was = song.title
    await put(title)
    remember({
      label: t('undo.rename'),
      merge: `song-name-${id}`,
      undo: () => put(was),
      redo: () => put(title)
    })
  },

  moveTo: async (id, folderId) => {
    const song = get().items.find((s) => s.id === id)
    if (!song || (song.folderId ?? null) === folderId) return

    const put = async (to: string | null): Promise<void> => {
      const one = get().items.find((s) => s.id === id)
      if (!one) return
      set({ items: await window.api.songs.save({ ...one, folderId: to }) })
    }

    const was = song.folderId ?? null
    await put(folderId)
    remember({ label: t('undo.move'), undo: () => put(was), redo: () => put(folderId) })
  },

  remove: async (id) => {
    const song = get().items.find((s) => s.id === id)

    const drop = async (): Promise<void> => {
      set({ items: await window.api.songs.remove(id) })
      if (get().draft?.id === id) set({ draft: null, slides: [], index: 0 })
    }

    await drop()
    if (!song) return

    remember({
      label: t('undo.songRemove', { title: song.title || t('common.untitled') }),
      undo: async () => {
        await window.api.trash.restore('song', id)
        set({ items: await window.api.songs.list() })
      },
      redo: drop
    })
  },

  closeDraft: () => set({ draft: null, dirty: false, slides: [], index: 0 }),

  importFiles: async () => {
    const result = await window.api.songs.import(get().categoryId)
    set({ items: result.songs })
    afterImport(result.ids, result.backgrounds)
    return report(result)
  },

  addFiles: async (files, folderId = null, categoryId) => {
    const result = await window.api.songs.add(
      files,
      folderId,
      categoryId === undefined ? get().categoryId : categoryId
    )
    set({ items: result.songs })
    afterImport(result.ids, result.backgrounds)
    return report(result)
  },

  exportSong: (format, songId) => window.api.songs.export(format, songId),

  addPart: (kind) => {
    const draft = get().draft
    if (!draft) return
    const part = newPart(kind, draft.parts)
    get().edit(
      { parts: [...draft.parts, part], order: [...draft.order, part.id] },
      { label: t('undo.partAdd') }
    )
  },

  editPart: (id, patch) => {
    const draft = get().draft
    if (!draft) return
    get().edit(
      { parts: draft.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)) },

      { label: t('undo.partEdit'), merge: `song-part-${id}` }
    )
  },

  setPartKind: (id, kind) => {
    const draft = get().draft
    if (!draft) return
    get().edit({ parts: withKind(draft.parts, id, kind) }, { label: t('undo.partKind') })
  },

  duplicatePart: (id) => {
    const draft = get().draft
    if (!draft) return

    const at = draft.parts.findIndex((p) => p.id === id)
    if (at < 0) return

    const copy = { ...newPart(draft.parts[at].kind, draft.parts), text: draft.parts[at].text }
    const parts = [...draft.parts]
    parts.splice(at + 1, 0, copy)

    const orderAt = draft.order.indexOf(id)
    const order = [...draft.order]
    if (orderAt >= 0) order.splice(orderAt + 1, 0, copy.id)
    else order.push(copy.id)

    get().edit({ parts, order }, { label: t('undo.partCopy') })
  },

  movePart: (id, delta) => {
    const draft = get().draft
    if (!draft) return

    const at = draft.parts.findIndex((p) => p.id === id)
    const to = at + delta
    if (at < 0 || to < 0 || to >= draft.parts.length) return

    const parts = [...draft.parts]
    const [moved] = parts.splice(at, 1)
    parts.splice(to, 0, moved)
    get().edit({ parts }, { label: t('undo.partMove') })
  },

  removePart: (id) => {
    const draft = get().draft
    if (!draft) return
    get().edit(
      {
        parts: draft.parts.filter((p) => p.id !== id),
        order: draft.order.filter((x) => x !== id)
      },
      { label: t('undo.partRemove') }
    )
  },

  setOrder: (order) => get().edit({ order }, { label: t('undo.order') }),

  appendToOrder: (partId) => {
    const draft = get().draft
    if (!draft) return
    get().edit({ order: [...draft.order, partId] }, { label: t('undo.order') })
  },

  removeFromOrder: (at) => {
    const draft = get().draft
    if (!draft) return
    get().edit({ order: draft.order.filter((_, i) => i !== at) }, { label: t('undo.order') })
  },

  resetOrder: () => {
    const draft = get().draft
    if (!draft) return
    get().edit({ order: defaultOrder(draft.parts) }, { label: t('undo.order') })
  },

  parseInto: (text) => {
    const draft = get().draft
    if (!draft) return
    const parts = parseSongText(text)
    if (parts.length === 0) return
    get().edit({ parts, order: defaultOrder(parts) }, { label: t('undo.songParse') })
  },

  rebuild: () => {
    const draft = get().draft
    if (!draft) {
      set({ slides: [], index: 0 })
      return
    }

    const look = lookFor('songs')

    const background = draft.background ?? look.background

    const style = draft.background
      ? readableStyleOn(look.style, draft.background, measureLight(draft.background))
      : look.style

    const slides = buildSongSlides(draft, style, background)
    set({ slides, index: Math.min(get().index, Math.max(0, slides.length - 1)) })
  },

  goTo: async (index) => {
    const slides = get().slides
    if (index < 0 || index >= slides.length) return

    const wasLive = useLive.getState().live.slide !== null
    set({ index })
    if (wasLive) await get().show()
  },

  goToPart: async (partId) => {
    const at = get().slides.findIndex((s) => s.partId === partId)
    if (at >= 0) await get().goTo(at)
  },

  setTimes: (index, times) => {
    const draft = get().draft
    const slide = get().slides[index]
    if (!draft || !slide) return

    const count = Math.min(MAX_TIMES, Math.max(1, Math.round(times)))
    if (count === slide.times) return

    const repeats = { ...(draft.repeats ?? {}) }
    if (count === 1) delete repeats[slide.key]
    else repeats[slide.key] = count

    get().edit({ repeats }, { label: t('undo.times'), merge: `song-times-${draft.id}-${slide.key}` })
  },

  step: (delta) => get().goTo(get().index + delta),

  advance: async () => {
    if (get().index + 1 >= get().slides.length) return false
    await get().step(1)
    return true
  },

  show: async () => {
    const current = get().slides[get().index]
    if (!current) return

    const wasEmpty = useLive.getState().live.slide === null
    await useLive.getState().show(current.slide)

    ownsScreen((delta) => useSongs.getState().step(delta))

    const draft = get().draft
    if (wasEmpty && draft) void window.api.songs.played(draft.id)
  }
}))

function showDraft(song: Song): void {
  useSongs.setState({ draft: song, dirty: true })
  useSongs.getState().rebuild()
  if (useUi.getState().tab !== 'songs') useUi.getState().goEdit('songs')
}

async function putCategories(list: SongCategory[]): Promise<void> {
  const { categories, songs } = await window.api.categories.save(list)
  const picked = useSongs.getState().categoryId
  useSongs.setState({
    categories,
    items: songs,
    categoryId: picked && categories.some((one) => one.id === picked) ? picked : null
  })

  const draft = useSongs.getState().draft
  if (draft?.categoryId && !categories.some((one) => one.id === draft.categoryId)) {
    useSongs.setState({ draft: { ...draft, categoryId: null } })
  }
}

function followDraft(ids: string[], categoryId: string | null): void {
  const draft = useSongs.getState().draft
  if (draft && ids.includes(draft.id)) {
    useSongs.setState({ draft: { ...draft, categoryId } })
  }
}

export function backgroundNotice(bg: { added: number; existed: number }): string | null {
  const parts: string[] = []
  if (bg.added === 1) parts.push(t('bg.keptOne'))
  else if (bg.added > 1) parts.push(t('bg.keptMany', { n: bg.added }))

  if (bg.existed === 1) parts.push(t('bg.alreadyOne'))
  else if (bg.existed > 1) parts.push(t('bg.alreadyMany', { n: bg.existed }))

  return parts.length > 0 ? parts.join('. ') : null
}

const report = (result: {
  added: number
  backgrounds: { added: number; existed: number }
  ids: string[]
  formats: Record<string, number>
  skipped: { file: string; reason: string }[]
  duplicates: string[]
}): ImportReport => ({
  added: result.added,
  backgrounds: result.backgrounds,
  ids: result.ids,
  formats: result.formats,
  skipped: result.skipped,
  duplicates: result.duplicates
})

function afterImport(ids: string[], backgrounds: { added: number }): void {
  rememberImport(ids)
  if (backgrounds.added > 0) void useLook.getState().loadBackgrounds()
}

function rememberImport(ids: string[]): void {
  if (ids.length === 0) return

  remember({
    label: t('undo.songImport', { n: ids.length }),
    undo: async () => {
      for (const id of ids) await window.api.songs.remove(id)
      useSongs.setState({ items: await window.api.songs.list() })
    },
    redo: async () => {
      for (const id of ids) await window.api.trash.restore('song', id)
      useSongs.setState({ items: await window.api.songs.list() })
    }
  })
}

const firstLine = (song: Song): string =>
  song.parts[0]?.text.split('\n')[0]?.trim().slice(0, 60) ?? ''

const lightOfBackground = new Map<string, number | null>()

function measureLight(background: Song['background']): number | null {
  if (!background || (background.kind !== 'image' && background.kind !== 'video')) return null

  const src = background.src
  if (lightOfBackground.has(src)) return lightOfBackground.get(src) ?? null

  lightOfBackground.set(src, null)
  void brightnessOf(background).then((light) => {
    if (light === null) return
    lightOfBackground.set(src, light)
    useSongs.getState().rebuild()
  })

  return null
}

function buildSongSlides(
  song: Song,
  style: SlideStyle,
  background: Slide['background']
): SongSlide[] {
  const fits = domFitTest({ style, aspect: useScreen.getState().aspect })
  const byId = new Map(song.parts.map((p) => [p.id, p]))
  const out: SongSlide[] = []

  const order = song.order.length ? song.order : song.parts.map((p) => p.id)
  const seen = new Map<string, number>()

  order.forEach((partId, position) => {
    const part = byId.get(partId)
    if (!part || !part.text.trim()) return

    const occurrence = seen.get(partId) ?? 0
    seen.set(partId, occurrence + 1)

    for (const [i, chunk] of splitPart(part.text, fits).entries()) {
      const key = `${partId}#${occurrence}#${i}`
      out.push({
        partId,
        indexInPart: i,
        position,
        key,
        times: Math.min(MAX_TIMES, Math.max(1, Math.round(song.repeats?.[key] ?? 1))),
        slide: {
          id: `song-${song.id}-${position}-${i}`,
          kind: 'song',
          blocks: chunk.map((line) => ({ html: escapeHtml(line) })),
          reference: style.showReference ? partTitle(part) : undefined,
          background,
          style
        }
      })
    }
  })

  return out
}

function splitPart(text: string, fits: ReturnType<typeof domFitTest>): string[][] {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length === 0) return []

  const asBlocks = (group: string[]): { html: string }[] =>
    group.map((line) => ({ html: escapeHtml(line) }))

  for (let pieces = 1; pieces <= lines.length; pieces++) {
    const size = Math.ceil(lines.length / pieces)
    const groups: string[][] = []
    for (let i = 0; i < lines.length; i += size) groups.push(lines.slice(i, i + size))
    if (groups.every((g) => fits(asBlocks(g)))) return groups
  }

  return lines.map((line) => splitBySentences(line, 1))
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
