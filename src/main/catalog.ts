import { app, dialog, BrowserWindow } from 'electron'
import { basename, extname, join } from 'node:path'
import type { CatalogSong, CatalogTab, Song } from '@shared/types'
import {
  defaultTabs,
  findSame,
  freeTabName,
  movedTab,
  tabAfterRemoved
} from '@shared/catalog'
import { numberFromName, songOrder } from '@shared/songs'
import { t } from '@shared/i18n'
import { jsonFile } from './jsonFile'
import { expandFiles } from './dropped'
import {
  backgroundOf,
  listSongs,
  readSongFile,
  saveSong,
  type BackgroundReport
} from './songs'

interface CatalogFile {
  tabs: CatalogTab[]
  songs: CatalogSong[]
}

const store = jsonFile<CatalogFile>(
  () => join(app.getPath('userData'), 'catalog.json'),
  () => ({ tabs: [], songs: [] })
)

export const flushCatalog = store.flush

export interface CatalogState {
  tabs: CatalogTab[]
  songs: CatalogSong[]
}

export interface CatalogImport extends CatalogState {
  added: number
  backgrounds: BackgroundReport

  duplicates: string[]
  formats: Record<string, number>
  skipped: { file: string; reason: string }[]
}

export type CatalogAdd =
  | { ok: true; catalog: CatalogState; id: string }
  | { ok: false; reason: string }

export type CatalogTake =
  | { ok: true; songs: Song[]; id: string; existed: boolean }
  | { ok: false; reason: string }

async function read(): Promise<CatalogFile> {
  const file = await store.read()
  if (file.tabs.length === 0) {
    file.tabs = defaultTabs()
    await store.write(file)
  }
  return file
}

const sorted = (songs: CatalogSong[]): CatalogSong[] => [...songs].sort(songOrder)

const state = (file: CatalogFile): CatalogState => ({
  tabs: file.tabs,
  songs: sorted(file.songs)
})

export async function listCatalog(): Promise<CatalogState> {
  return state(await read())
}

export async function addCatalogTab(name: string): Promise<CatalogState> {
  const file = await read()
  const wanted = name.trim() || t('catalog.newTab')
  file.tabs = [
    ...file.tabs,
    { id: `tab-${Date.now()}`, name: freeTabName(file.tabs, wanted) }
  ]
  await store.write(file)
  return state(file)
}

export async function renameCatalogTab(id: string, name: string): Promise<CatalogState> {
  const file = await read()
  const clean = name.trim()
  if (clean) {
    file.tabs = file.tabs.map((tab) => (tab.id === id ? { ...tab, name: clean } : tab))
    await store.write(file)
  }
  return state(file)
}

export async function removeCatalogTab(id: string): Promise<CatalogState> {
  const file = await read()
  const moveTo = tabAfterRemoved(file.tabs, id)
  if (!moveTo) return state(file)

  file.tabs = file.tabs.filter((tab) => tab.id !== id)
  file.songs = file.songs.map((song) =>
    song.tabId === id ? { ...song, tabId: moveTo.id } : song
  )
  await store.write(file)
  return state(file)
}

export async function moveCatalogTab(id: string, delta: number): Promise<CatalogState> {
  const file = await read()
  file.tabs = movedTab(file.tabs, id, delta)
  await store.write(file)
  return state(file)
}

const tabFor = (file: CatalogFile, tabId: string): string =>
  file.tabs.some((tab) => tab.id === tabId) ? tabId : file.tabs[0].id

export async function addSongToCatalog(song: Song, tabId: string): Promise<CatalogAdd> {
  const file = await read()
  const title = song.title.trim() || t('common.untitled')

  const same = findSame(file.songs, title)
  if (same) return { ok: false, reason: t('catalog.already', { title: same.title }) }

  const id = `cat-${Date.now()}`
  file.songs.push({ ...song, id, title, tabId: tabFor(file, tabId) })
  await store.write(file)
  return { ok: true, catalog: state(file), id }
}

export async function moveCatalogSong(id: string, tabId: string): Promise<CatalogState> {
  const file = await read()
  file.songs = file.songs.map((song) =>
    song.id === id ? { ...song, tabId: tabFor(file, tabId) } : song
  )
  await store.write(file)
  return state(file)
}

export async function renameCatalogSong(id: string, title: string): Promise<CatalogAdd> {
  const file = await read()
  const clean = title.trim()
  if (!clean) return { ok: true, catalog: state(file), id }

  const same = findSame(file.songs, clean, id)
  if (same) return { ok: false, reason: t('catalog.already', { title: same.title }) }

  file.songs = file.songs.map((song) =>
    song.id === id ? { ...song, title: clean } : song
  )
  await store.write(file)
  return { ok: true, catalog: state(file), id }
}

export async function removeCatalogSong(id: string): Promise<CatalogState> {
  const file = await read()
  file.songs = file.songs.filter((song) => song.id !== id)
  await store.write(file)
  return state(file)
}

export async function takeFromCatalog(
  id: string,
  folderId: string | null
): Promise<CatalogTake> {
  const file = await read()
  const song = file.songs.find((s) => s.id === id)
  if (!song) return { ok: false, reason: t('catalog.gone') }

  const library = await listSongs()
  const same = findSame(
    library.map((one) => ({ ...one, tabId: '' })),
    song.title
  )
  if (same) return { ok: true, songs: library, id: same.id, existed: true }

  const { tabId: _tab, ...rest } = song
  const copy: Song = {
    ...rest,
    id: `song-${Date.now()}`,
    folderId,
    updatedAt: Date.now(),
    playCount: 0,
    lastPlayedAt: null
  }

  return { ok: true, songs: await saveSong(copy), id: copy.id, existed: false }
}

export async function importToCatalog(
  parent: BrowserWindow | null,
  tabId: string
): Promise<CatalogImport> {
  const picked = await dialog.showOpenDialog(parent ?? undefined!, {
    title: t('main.pickSongs'),
    properties: ['openFile', 'multiSelections'],
    filters: [
      {
        name: t('main.songsFilter'),
        extensions: [
          'txt',
          'text',
          'md',
          'rtf',
          'xml',
          'pptx',
          'ppt',
          'pdf',
          'song',
          'osz',
          'pro',
          'pro4',
          'pro5',
          'pro6'
        ]
      },
      { name: t('main.allFiles'), extensions: ['*'] }
    ]
  })

  if (picked.canceled) return empty(await read())
  return ingest(picked.filePaths, tabId)
}

export async function addCatalogFiles(
  files: string[],
  tabId: string
): Promise<CatalogImport> {
  return ingest(await expandFiles(files), tabId)
}

const empty = (file: CatalogFile): CatalogImport => ({
  ...state(file),
  added: 0,
  backgrounds: { added: 0, existed: 0 },
  duplicates: [],
  formats: {},
  skipped: []
})

async function ingest(paths: string[], tabId: string): Promise<CatalogImport> {
  const file = await read()
  const tab = tabFor(file, tabId)

  const formats: Record<string, number> = {}
  const skipped: { file: string; reason: string }[] = []
  const backgrounds: BackgroundReport = { added: 0, existed: 0 }
  const duplicates: string[] = []
  let added = 0

  for (const path of paths) {
    const name = basename(path)
    try {
      const { result: parsed, media } = await readSongFile(path)
      if (!parsed.ok) {
        skipped.push({ file: name, reason: parsed.reason })
        continue
      }

      const named = numberFromName(
        parsed.song.title.trim() || basename(path, extname(path))
      )
      const title = named.title || name

      if (findSame(file.songs, title)) {
        duplicates.push(title)
        continue
      }

      const kept = await backgroundOf(media, title)
      backgrounds.added += kept.added
      backgrounds.existed += kept.existed

      file.songs.push({
        ...parsed.song,
        id: `cat-${Date.now()}-${added}`,
        title,
        number: parsed.song.number.trim() || named.number,
        tabId: tab,
        background: kept.main?.background ?? null
      })
      formats[parsed.format] = (formats[parsed.format] ?? 0) + 1
      added++
    } catch (error) {
      console.error(`[Каталог] Не удалось прочитать «${path}»:`, error)
      skipped.push({ file: name, reason: t('main.unreadable') })
    }
  }

  if (added > 0) await store.write(file)
  return { ...state(file), added, backgrounds, duplicates, formats, skipped }
}
