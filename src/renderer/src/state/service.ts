import { create } from 'zustand'
import type { ServiceFolder, ServiceItem } from '@shared/types'
import {
  bibleItem,
  copyFolder,
  deckItem,
  defaultFolderTitle,
  emptyFolder,
  noteItem,
  reorder,
  songItem,
  textItem,
  usageCount
} from '@shared/service'
import { splitDropped } from '@shared/drop'
import { t } from '@shared/i18n'
import { useDecks } from './decks'
import { useTree } from './tree'
import { useLook } from './look'
import { useBible } from './store'
import { useLive } from './live'
import { ownsScreen } from './output'
import { useSongs } from './songs'
import { useTexts } from './texts'
import { alsoRemember, remember } from './undo'
import { useUi } from './ui'

interface ServiceStore {
  folders: ServiceFolder[]

  activeId: string | null

  cursor: number

  liveAt: number

  running: boolean

  init: () => Promise<void>
  select: (id: string) => void

  create: (folderId: string | null) => Promise<void>

  duplicate: (id: string) => Promise<void>
  rename: (title: string) => Promise<void>

  renameFolder: (id: string, title: string) => Promise<void>

  moveTo: (id: string, folderId: string | null) => Promise<void>
  removeFolder: (id: string) => Promise<void>

  onFoldersRemoved: (removed: string[], parentId: string | null) => Promise<void>

  addItem: (item: ServiceItem) => Promise<void>
  addNote: (title: string) => Promise<void>
  addCurrentPassage: () => Promise<void>
  addSong: (songId: string) => Promise<void>
  addText: (textId: string) => Promise<void>

  addOpenSong: () => Promise<void>

  addOpenText: () => Promise<void>

  addDecks: (what?: 'decks' | 'photos' | 'folder') => Promise<DropReport>

  addFiles: (files: string[]) => Promise<DropReport>
  removeItem: (itemId: string) => Promise<void>
  moveItem: (from: number, to: number) => Promise<void>

  openItem: (index: number, opts?: { edit?: boolean }) => Promise<void>

  focusItem: (index: number) => void

  songFromDeck: (
    index: number
  ) => Promise<{ ok: boolean; reason?: string; background?: { existed: boolean } | null }>

  showCurrent: () => Promise<void>

  stepInside: (delta: number) => Promise<void>

  stepShown: (delta: number) => Promise<void>
  start: () => Promise<void>
  stop: () => void
  next: () => Promise<void>
  prev: () => Promise<void>

  usedIn: (refId: string) => number
}

export interface DropReport {
  added: number

  names: string[]
  skipped: { file: string; reason: string }[]
}

async function keepFolder(
  next: ServiceFolder,
  label: string,
  merge?: string
): Promise<void> {
  const was = useService.getState().folders.find((f) => f.id === next.id) ?? null

  const put = async (folder: ServiceFolder): Promise<void> => {
    useService.setState({ folders: await window.api.folders.save(folder) })
  }

  await put(next)
  if (was) remember({ label, merge, undo: () => put(was), redo: () => put(next) })
}

function rememberNew(id: string, label: string): void {
  remember({
    label,
    undo: async () => {
      const folders = await window.api.folders.remove(id)
      useService.setState({
        folders,
        activeId: folders[0]?.id ?? null,
        cursor: -1,
        liveAt: -1,
        running: false
      })
    },
    redo: async () => {
      await window.api.trash.restore('service', id)
      useService.setState({ folders: await window.api.folders.list(), activeId: id })
    }
  })
}

const active = (s: ServiceStore): ServiceFolder | null =>
  s.folders.find((f) => f.id === s.activeId) ?? null

export const useService = create<ServiceStore>((set, get) => ({
  folders: [],
  activeId: null,
  cursor: -1,
  liveAt: -1,
  running: false,

  init: async () => {
    const folders = await window.api.folders.list()
    set({ folders, activeId: get().activeId ?? folders[0]?.id ?? null })
  },

  select: (id) => set({ activeId: id, cursor: -1, liveAt: -1, running: false }),

  create: async (folderId) => {
    const folder = emptyFolder(defaultFolderTitle(), [], folderId)
    const folders = await window.api.folders.save(folder)
    set({ folders, activeId: folder.id, cursor: -1, liveAt: -1, running: false })
    if (folderId) useTree.getState().expand(folderId)
    rememberNew(folder.id, t('undo.serviceCreate'))
  },

  duplicate: async (id) => {
    const source = get().folders.find((f) => f.id === id)
    if (!source) return

    const copy = copyFolder(source, t('home.copySuffix', { title: source.title }))
    const folders = await window.api.folders.save(copy)
    set({ folders, activeId: copy.id, cursor: -1, liveAt: -1, running: false })
    rememberNew(copy.id, t('undo.serviceCopy'))
  },

  moveTo: async (id, folderId) => {
    const folder = get().folders.find((f) => f.id === id)
    if (!folder || (folder.folderId ?? null) === folderId) return
    await keepFolder({ ...folder, folderId }, t('undo.move'))
    if (folderId) useTree.getState().expand(folderId)
  },

  onFoldersRemoved: async (removed, parentId) => {
    let folders = get().folders
    const lifted = folders.filter((f) => removed.includes(f.folderId ?? ''))
    for (const folder of lifted) {
      folders = await window.api.folders.save({ ...folder, folderId: parentId })
    }
    set({ folders })

    if (lifted.length > 0) {
      const put = async (list: ServiceFolder[]): Promise<void> => {
        let next = useService.getState().folders
        for (const folder of list) next = await window.api.folders.save(folder)
        useService.setState({ folders: next })
      }

      const back = lifted
      const now = back.map((f) => ({ ...f, folderId: parentId }))
      alsoRemember({ undo: () => put(back), redo: () => put(now) })
    }
  },

  rename: async (title) => {
    const folder = active(get())
    if (!folder) return
    await keepFolder({ ...folder, title }, t('undo.rename'), 'service-name-' + folder.id)
  },

  renameFolder: async (id, title) => {
    const folder = get().folders.find((f) => f.id === id)
    if (!folder || folder.title === title) return
    await keepFolder({ ...folder, title }, t('undo.rename'), 'service-name-' + id)
  },

  removeFolder: async (id) => {
    const gone = get().folders.find((f) => f.id === id)

    const drop = async (): Promise<void> => {
      const folders = await window.api.folders.remove(id)
      useService.setState({
        folders,
        activeId:
          useService.getState().activeId === id
            ? (folders[0]?.id ?? null)
            : useService.getState().activeId,
        cursor: -1,
        liveAt: -1,
        running: false
      })
    }

    await drop()
    if (!gone) return

    remember({
      label: t('undo.serviceRemove', { title: gone.title || t('common.untitled') }),
      undo: async () => {
        await window.api.trash.restore('service', id)
        useService.setState({ folders: await window.api.folders.list(), activeId: id })
      },
      redo: drop
    })
  },

  addItem: async (item) => {
    const folder = active(get())
    if (!folder) {

      const fresh = emptyFolder(defaultFolderTitle(), [item])
      const folders = await window.api.folders.save(fresh)
      set({ folders, activeId: fresh.id })
      rememberNew(fresh.id, t('undo.serviceCreate'))
      return
    }

    await keepFolder(
      { ...folder, items: [...folder.items, item] },
      t('undo.itemAdd', { title: item.title || t('common.untitled') })
    )
  },

  addNote: (title) => get().addItem(noteItem(title)),

  addCurrentPassage: async () => {
    const b = useBible.getState()
    if (!b.translationId || !b.book || !b.chapter || !b.selFrom) return

    const title = b.preview[0]?.reference ?? t('bible.passage')
    await get().addItem(
      bibleItem(
        {
          translationId: b.translationId,
          book: b.book,
          chapter: b.chapter,
          from: b.selFrom,
          to: b.selTo ?? b.selFrom
        },
        title
      )
    )
  },

  addSong: async (songId) => {
    const song = useSongs.getState().items.find((s) => s.id === songId)
    if (song) await get().addItem(songItem(song.id, song.title || t('common.untitled')))
  },

  addText: async (textId) => {
    const text = useTexts.getState().items.find((t) => t.id === textId)
    if (text) await get().addItem(textItem(text.id, text.title || t('common.untitled')))
  },

  addOpenSong: async () => {
    const songs = useSongs.getState()
    const id = songs.draft?.id ?? songs.items[0]?.id
    if (id) await get().addSong(id)
  },

  addOpenText: async () => {
    const texts = useTexts.getState()
    const id = texts.draft?.id ?? texts.items[0]?.id
    if (id) await get().addText(id)
  },

  addDecks: async (what = 'decks') => {

    const result = await useDecks.getState().importFiles(what)
    await putDecks(result.ids, get().addItem)
    return { added: result.added, names: result.names, skipped: result.skipped }
  },

  addFiles: async (files) => {
    const { decks, photos, bibles, songs } = splitDropped(files)
    const skipped: { file: string; reason: string }[] = []
    const names: string[] = []
    let added = 0

    if (decks.length + photos.length > 0) {
      const result = await useDecks.getState().addFiles([...decks, ...photos])
      await putDecks(result.ids, get().addItem)
      added += result.added
      names.push(...result.names)
      skipped.push(...result.skipped)
    }

    for (const path of bibles) {
      const answer = await window.api.bible.addFile(path)
      const name = path.split(/[\\/]/).pop() ?? path

      if ('error' in answer) skipped.push({ file: name, reason: answer.error })
      else {
        names.push(t('home.bibleAdded', { name: answer.meta.name }))
        added++
      }
    }

    if (songs.length > 0) {
      const result = await useSongs.getState().addFiles(songs)
      for (const id of result.ids) await get().addSong(id)
      added += result.added
      skipped.push(...result.skipped)
    }

    return { added, names, skipped }
  },

  removeItem: async (itemId) => {
    const folder = active(get())
    if (!folder) return

    const gone = folder.items.find((i) => i.id === itemId)
    await keepFolder(
      { ...folder, items: folder.items.filter((i) => i.id !== itemId) },
      t('undo.itemRemove', { title: gone?.title || t('common.untitled') })
    )
  },

  moveItem: async (from, to) => {
    const folder = active(get())
    if (!folder) return
    const items = reorder(folder.items, from, to)
    if (items === folder.items) return
    await keepFolder({ ...folder, items }, t('undo.itemMove'))
  },

  openItem: async (index, opts) => {
    const folder = active(get())
    const item = folder?.items[index]
    if (!item) return

    set({ cursor: index })
    if (item.note) return

    await loadItem(item)

    const ui = useUi.getState()
    const goTo = opts?.edit ? ui.goEdit : ui.setTab

    goTo(TAB_OF[item.kind])
  },

  showCurrent: async () => {
    const at = get().cursor
    const item = active(get())?.items[at]
    if (!item || item.note) return

    await loadItem(item)
    await showFirst(item, { keepPlace: true })
    set({ liveAt: at })
  },

  focusItem: (index) => {
    const folder = active(get())
    const item = folder?.items[index]
    if (!item) return

    set({ cursor: index })

    if (item.kind === 'deck' && item.refId) {
      if (useDecks.getState().deckId !== item.refId) useDecks.getState().open(item.refId)
    }
  },

  songFromDeck: async (index) => {
    const folder = active(get())
    const item = folder?.items[index]
    if (!folder || !item || item.kind !== 'deck' || !item.refId) return { ok: false }

    const result = await window.api.decks.toSong(item.refId)
    if (!result.ok) return { ok: false, reason: result.reason }

    useSongs.setState({ items: result.songs })

    const items = [...folder.items]
    items.splice(index, 1, songItem(result.song.id, result.song.title))
    await keepFolder({ ...folder, items }, t('undo.deckToSong'))

    if (result.background) void useLook.getState().loadBackgrounds()

    useSongs.getState().open(result.song.id)
    useUi.getState().goEdit('songs')
    return { ok: true, background: result.background }
  },

  stepInside: async (delta) => {

    await stepItem(active(get())?.items[get().cursor], delta)
  },

  stepShown: async (delta) => {
    const folder = active(get())

    const item = folder?.items[get().liveAt] ?? folder?.items[get().cursor]
    await stepItem(item, delta)
  },

  start: async () => {
    const folder = active(get())
    if (!folder || folder.items.length === 0) return

    let at = Math.max(0, get().cursor)

    while (at < folder.items.length && folder.items[at].note) at++
    if (at >= folder.items.length) return

    set({ running: true })

    await useLive.getState().setStage({ startedAt: Date.now() })

    await get().openItem(at)
    await showFirst(folder.items[at])
    set({ liveAt: at })
    await announceNext(folder.items, at)
  },

  stop: () => {
    set({ running: false })
    void useLive.getState().setStage({ startedAt: null })
  },

  next: async () => {
    const folder = active(get())
    if (!folder) return

    const cursor = get().cursor
    if (cursor >= 0 && (await advanceCurrent(folder.items[cursor]))) return

    if (cursor >= 0 && deckIsOver(folder.items[cursor])) {
      await useLive.getState().clear()
      return
    }

    let at = cursor + 1
    while (at < folder.items.length && folder.items[at].note) at++
    if (at >= folder.items.length) return

    await get().openItem(at)
    await showFirst(folder.items[at])
    set({ liveAt: at })
    await announceNext(folder.items, at)
  },

  prev: async () => {
    const folder = active(get())
    if (!folder) return

    let at = get().cursor - 1
    while (at >= 0 && folder.items[at].note) at--
    if (at < 0) return

    await get().openItem(at)
    await showFirst(folder.items[at])
    set({ liveAt: at })
  },

  usedIn: (refId) => usageCount(get().folders, refId)
}))

async function putDecks(
  ids: string[],
  add: (item: ServiceItem) => Promise<void>
): Promise<void> {
  const decks = useDecks.getState().items
  for (const id of ids) {
    const deck = decks.find((d) => d.id === id)
    if (deck) await add(deckItem(deck.id, deck.name))
  }
}

async function announceNext(items: ServiceItem[], at: number): Promise<void> {
  const upcoming = items.slice(at + 1).find((i) => !i.note)
  await useLive.getState().setStage({
    nextTitle: upcoming?.title ?? null,
    nextLines: []
  })
}

const TAB_OF: Record<ServiceItem['kind'], 'home' | 'songs' | 'texts' | 'bible'> = {
  deck: 'home',
  song: 'songs',
  text: 'texts',
  bible: 'bible',
  note: 'home'
}

async function loadItem(item: ServiceItem): Promise<void> {
  if (item.note || isOpen(item)) return

  if (item.kind === 'deck' && item.refId) {
    useDecks.getState().open(item.refId)
  } else if (item.kind === 'song' && item.refId) {
    useSongs.getState().open(item.refId)
  } else if (item.kind === 'text' && item.refId) {
    useTexts.getState().open(item.refId)
  } else if (item.kind === 'bible' && item.bible) {
    const b = item.bible
    const bible = useBible.getState()
    if (bible.translationId !== b.translationId) await bible.setTranslation(b.translationId)
    await bible.goTo(b.book, b.chapter, b.from, b.to)
  }
}

function isOpen(item: ServiceItem): boolean {
  if (item.kind === 'deck') return useDecks.getState().deckId === item.refId
  if (item.kind === 'song') return useSongs.getState().draft?.id === item.refId
  if (item.kind === 'text') return useTexts.getState().draft?.id === item.refId

  if (item.kind === 'bible' && item.bible) {
    const b = item.bible
    const bible = useBible.getState()
    return (
      bible.translationId === b.translationId &&
      bible.book === b.book &&
      bible.chapter === b.chapter &&
      bible.selFrom === b.from &&
      bible.selTo === b.to
    )
  }

  return true
}

async function stepItem(item: ServiceItem | undefined, delta: number): Promise<void> {
  if (!item) return
  await loadItem(item)

  if (item.kind === 'song') {
    const songs = useSongs.getState()
    await songs.goTo(songs.index + delta)
  } else if (item.kind === 'text') {
    await useTexts.getState().stepSlide(delta)
  } else if (item.kind === 'bible') {
    await useBible.getState().stepSlide(delta)
  } else if (item.kind === 'deck') {

    const decks = useDecks.getState()
    if (item.refId && decks.deckId !== item.refId) decks.open(item.refId)
    await useDecks.getState().step(delta)
  }
}

async function advanceCurrent(item: ServiceItem | undefined): Promise<boolean> {
  if (!item || item.note) return false
  if (useLive.getState().live.slide === null) return false

  if (!isOpen(item)) return false

  if (item.kind === 'song') return useSongs.getState().advance()
  if (item.kind === 'text') return useTexts.getState().advance()
  if (item.kind === 'bible') return useBible.getState().advance()
  if (item.kind === 'deck') return useDecks.getState().advance()
  return false
}

function deckIsOver(item: ServiceItem | undefined): boolean {
  if (!item || item.kind !== 'deck' || !isOpen(item)) return false
  if (useLive.getState().live.slide === null) return false

  const decks = useDecks.getState()
  return decks.index + 1 >= decks.slides().length
}

async function showFirst(
  item: ServiceItem,
  opts?: { keepPlace?: boolean }
): Promise<void> {
  const place = opts?.keepPlace ?? false

  if (item.kind === 'deck') {
    if (!place) useDecks.getState().setIndex(0)
    await useDecks.getState().show()
  } else if (item.kind === 'song') {
    if (!place) await useSongs.getState().goTo(0)
    await useSongs.getState().show()
  } else if (item.kind === 'text') {
    if (!place) useTexts.getState().setPreviewIndex(0)
    await useTexts.getState().show()
  } else if (item.kind === 'bible') {
    if (!place) useBible.getState().setPreviewIndex(0)
    await useBible.getState().show()
  }

  ownsScreen((delta) => useService.getState().stepShown(delta))
}
