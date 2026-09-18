import { create } from 'zustand'
import type { Slide, SlideStyle, Song, SongPart, SongPartKind } from '@shared/types'
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
}

export interface ImportReport {
  added: number

  backgrounds: { added: number; existed: number }

  ids: string[]
  formats: Record<string, number>
  skipped: { file: string; reason: string }[]
}

interface SongsStore {
  items: Song[]
  draft: Song | null
  dirty: boolean
  query: string

  slides: SongSlide[]
  index: number

  init: () => Promise<void>
  setQuery: (q: string) => void
  create: () => void
  open: (id: string) => void

  edit: (patch: Partial<Song>, note?: { label: string; merge?: string }) => void
  save: () => Promise<void>
  remove: (id: string) => Promise<void>

  rename: (id: string, title: string) => Promise<void>

  moveTo: (id: string, folderId: string | null) => Promise<void>
  closeDraft: () => void
  importFiles: () => Promise<ImportReport>

  addFiles: (files: string[], folderId?: string | null) => Promise<ImportReport>
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
  step: (delta: number) => Promise<void>
  show: () => Promise<void>

  advance: () => Promise<boolean>
}

export const useSongs = create<SongsStore>((set, get) => ({
  items: [],
  draft: null,
  dirty: false,
  query: '',
  slides: [],
  index: 0,

  init: async () => set({ items: await window.api.songs.list() }),

  setQuery: (query) => set({ query }),

  create: () => {
    set({ draft: emptySong(), dirty: false, index: 0 })
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
    const result = await window.api.songs.import()
    set({ items: result.songs })
    afterImport(result.ids, result.backgrounds)
    return report(result)
  },

  addFiles: async (files, folderId = null) => {
    const result = await window.api.songs.add(files, folderId)
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

const report = (result: {
  added: number
  backgrounds: { added: number; existed: number }
  ids: string[]
  formats: Record<string, number>
  skipped: { file: string; reason: string }[]
}): ImportReport => ({
  added: result.added,
  backgrounds: result.backgrounds,
  ids: result.ids,
  formats: result.formats,
  skipped: result.skipped
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

  order.forEach((partId, position) => {
    const part = byId.get(partId)
    if (!part || !part.text.trim()) return

    for (const [i, chunk] of splitPart(part.text, fits).entries()) {
      out.push({
        partId,
        indexInPart: i,
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
