import { create } from 'zustand'
import type { CatalogSong, CatalogTab } from '@shared/types'
import { searchCatalog } from '@shared/catalog'
import { t } from '@shared/i18n'
import { useLook } from './look'
import { useSongs } from './songs'
import { useUi } from './ui'

interface CatalogStore {
  tabs: CatalogTab[]
  songs: CatalogSong[]

  tabId: string | null

  pickedId: string | null
  query: string

  notice: string | null

  busy: boolean

  open: () => Promise<void>
  init: () => Promise<void>
  setTab: (id: string) => void
  pick: (id: string) => void
  setQuery: (query: string) => void
  say: (notice: string | null) => void

  addTab: () => Promise<void>
  renameTab: (id: string, name: string) => Promise<void>
  removeTab: (id: string) => Promise<void>
  moveTab: (id: string, delta: number) => Promise<void>

  importFiles: () => Promise<void>

  addFiles: (files: string[], tabId?: string) => Promise<void>

  addFromLibrary: (songId: string, tabId?: string) => Promise<void>

  moveSong: (id: string, tabId: string) => Promise<void>
  renameSong: (id: string, title: string) => Promise<void>
  removeSong: (id: string) => Promise<void>

  take: (id: string, folderId?: string | null) => Promise<void>

  visible: () => CatalogSong[]
}

export const useCatalog = create<CatalogStore>((set, get) => ({
  tabs: [],
  songs: [],
  tabId: null,
  pickedId: null,
  query: '',
  notice: null,
  busy: false,

  init: async () => {
    const { tabs, songs } = await window.api.catalog.list()
    set({ tabs, songs, tabId: get().tabId ?? tabs[0]?.id ?? null })
  },

  open: async () => {
    await get().init()
    set({ notice: null })
    useUi.getState().setDialog('catalog')
  },

  setTab: (tabId) => set({ tabId, notice: null }),

  pick: (pickedId) => set({ pickedId }),

  setQuery: (query) => set({ query }),

  say: (notice) => set({ notice }),

  addTab: async () => {
    const { tabs, songs } = await window.api.catalog.tabAdd(t('catalog.newTab'))
    set({ tabs, songs, tabId: tabs[tabs.length - 1]?.id ?? get().tabId, notice: null })
  },

  renameTab: async (id, name) => {
    set(await window.api.catalog.tabRename(id, name))
  },

  removeTab: async (id) => {
    if (get().tabs.length < 2) {
      set({ notice: t('catalog.lastTab') })
      return
    }
    const { tabs, songs } = await window.api.catalog.tabRemove(id)
    set({
      tabs,
      songs,
      tabId: get().tabId === id ? (tabs[0]?.id ?? null) : get().tabId,
      notice: null
    })
  },

  moveTab: async (id, delta) => {
    set(await window.api.catalog.tabMove(id, delta))
  },

  importFiles: async () => {
    const tabId = get().tabId
    if (!tabId || get().busy) return

    set({ busy: true })
    try {
      told(await window.api.catalog.import(tabId), set)
    } finally {
      set({ busy: false })
    }
  },

  addFiles: async (files, tabId) => {
    const where = tabId ?? get().tabId
    if (!where || files.length === 0 || get().busy) return

    set({ busy: true })
    try {
      told(await window.api.catalog.addFiles(files, where), set)
    } finally {
      set({ busy: false })
    }
  },

  addFromLibrary: async (songId, tabId) => {
    const where = tabId ?? get().tabId
    if (!where) return

    const result = await window.api.catalog.addSong(songId, where)
    if (!result.ok) {
      set({ notice: result.reason })
      return
    }

    const song = result.catalog.songs.find((one) => one.id === result.id)
    set({
      ...result.catalog,
      notice: t('catalog.added', { title: song?.title ?? t('common.untitled') })
    })
  },

  moveSong: async (id, tabId) => {
    set(await window.api.catalog.move(id, tabId))
  },

  renameSong: async (id, title) => {
    const result = await window.api.catalog.rename(id, title)
    if (result.ok) set({ ...result.catalog, notice: null })
    else set({ notice: result.reason })
  },

  removeSong: async (id) => {
    set({ ...(await window.api.catalog.remove(id)), notice: null })
  },

  take: async (id, folderId = null) => {
    const result = await window.api.catalog.take(id, folderId)
    if (!result.ok) {
      set({ notice: result.reason })
      return
    }

    useSongs.setState({ items: result.songs })
    useSongs.getState().open(result.id)

    const song = result.songs.find((one) => one.id === result.id)
    set({
      notice: result.existed
        ? t('catalog.takenExisting')
        : t('catalog.taken', { title: song?.title ?? t('common.untitled') })
    })
  },

  visible: () => {
    const { songs, query, tabId } = get()

    if (query.trim()) return searchCatalog(songs, query)
    return songs.filter((song) => song.tabId === tabId)
  }
}))

function told(
  result: {
    tabs: CatalogTab[]
    songs: CatalogSong[]
    added: number
    backgrounds: { added: number; existed: number }
    duplicates: string[]
    skipped: { file: string; reason: string }[]
  },
  set: (patch: Partial<CatalogStore>) => void
): void {
  const lines: string[] = [
    result.added > 0 ? t('catalog.imported', { n: result.added }) : t('catalog.importedNothing')
  ]

  if (result.duplicates.length > 0) {
    lines.push(t('catalog.duplicates', { list: result.duplicates.join(', ') }))
  }
  for (const item of result.skipped) lines.push(`${item.file} — ${item.reason}`)

  const kept = backgroundNotice(result.backgrounds)
  if (kept) lines.push(kept)

  if (result.backgrounds.added > 0) void useLook.getState().loadBackgrounds()

  set({ tabs: result.tabs, songs: result.songs, notice: lines.join('\n') })
}

export function backgroundNotice(bg: { added: number; existed: number }): string | null {
  const parts: string[] = []
  if (bg.added === 1) parts.push(t('bg.keptOne'))
  else if (bg.added > 1) parts.push(t('bg.keptMany', { n: bg.added }))

  if (bg.existed === 1) parts.push(t('bg.alreadyOne'))
  else if (bg.existed > 1) parts.push(t('bg.alreadyMany', { n: bg.existed }))

  return parts.length > 0 ? parts.join('. ') : null
}
