import { app, dialog, BrowserWindow } from 'electron'
import { readFile, rename } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { Song, SongCategory } from '@shared/types'
import {
  cleanCategories,
  defaultCategories,
  mergeCatalog,
  sameSong,
  type OldCatalog
} from '@shared/categories'
import {
  defaultOrder,
  emptySong,
  importedName,
  parseSongText,
  STRUCTURED_FORMAT,
  placedAt,
  renumbered,
  songOrder
} from '@shared/songs'
import { expandFiles } from './dropped'
import { t } from '@shared/i18n'
import { jsonFile } from './jsonFile'
import { binOf, toTrash } from './bin'
import { keepBackgroundFill, keepBackgroundImage, type KeptBackground } from './backgrounds'
import { pptxBackgrounds } from './pptxMedia'
import { renderPptxBackgrounds } from './pptxRender'
import { importSongFile, type ImportResult } from './songImport'
import { isOldOffice, readOldPresentation, reasonForPowerPoint } from './pptText'
import { writeSongFile } from './songExport'
import { FORMATS, type SongFormat } from '@shared/songFormats'

interface SongsFile {
  items: Song[]
  trash: Song[]

  categories?: SongCategory[]

  catalogMerged?: boolean
}

const store = jsonFile<SongsFile>(
  () => join(app.getPath('userData'), 'songs.json'),
  () => ({ items: [], trash: [] })
)

export const flushSongs = store.flush

const KEEP_DELETED = 100

export const songsBin = binOf(store)

export async function mergeOldCatalog(): Promise<void> {
  const file = await store.read()
  if (file.catalogMerged) return

  const path = join(app.getPath('userData'), 'catalog.json')
  let old: OldCatalog | null = null
  try {
    old = JSON.parse(await readFile(path, 'utf8')) as OldCatalog
  } catch {
    old = null
  }

  const merged = mergeCatalog(file.items, cleanCategories(file.categories), old, Date.now())
  file.items = merged.items
  file.categories = merged.categories
  file.catalogMerged = true
  await store.write(file)
  await store.flush()

  if (old) {
    await rename(path, join(app.getPath('userData'), 'catalog.merged.json')).catch((error) =>
      console.error('[Песни] Не удалось отложить старый каталог:', error)
    )
  }
}

export async function listCategories(): Promise<SongCategory[]> {
  const file = await store.read()
  if (Array.isArray(file.categories)) return cleanCategories(file.categories)

  file.categories = defaultCategories()
  await store.write(file)
  return file.categories
}

export async function saveCategories(
  list: SongCategory[]
): Promise<{ categories: SongCategory[]; songs: Song[] }> {
  const file = await store.read()
  const clean = cleanCategories(list)
  file.categories = clean

  const known = new Set(clean.map((one) => one.id))
  file.items = file.items.map((song) =>
    !song.categoryId || known.has(song.categoryId) ? song : { ...song, categoryId: null }
  )

  await store.write(file)
  return { categories: clean, songs: await listSongs() }
}

export async function setSongsCategory(
  ids: string[],
  categoryId: string | null
): Promise<Song[]> {
  const file = await store.read()
  const known = cleanCategories(file.categories).some((one) => one.id === categoryId)
  const wanted = categoryId && known ? categoryId : null
  const picked = new Set(ids)

  let touched = false
  file.items = file.items.map((song) => {
    if (!picked.has(song.id) || (song.categoryId ?? null) === wanted) return song
    touched = true
    return { ...song, categoryId: wanted }
  })

  if (touched) await store.write(file)
  return listSongs()
}

export async function listSongs(): Promise<Song[]> {
  const { items } = await store.read()
  return [...items].sort(songOrder)
}

export async function renumberSongs(ids: string[]): Promise<Song[]> {
  const file = await store.read()
  const numbers = new Map(renumbered(ids).map((x) => [x.id, x.number]))

  let touched = false
  file.items = file.items.map((song) => {
    const number = numbers.get(song.id)
    if (number === undefined || song.number === number) return song
    touched = true
    return { ...song, number, updatedAt: Date.now() }
  })

  if (touched) await store.write(file)
  return listSongs()
}

export async function placeSongAt(id: string, number: number): Promise<Song[]> {
  const { items } = await store.read()
  const song = items.find((s) => s.id === id)
  if (!song || !Number.isFinite(number) || number < 1) return listSongs()

  const family = [...items]
    .filter((s) => (s.folderId ?? null) === (song.folderId ?? null))
    .sort(songOrder)
    .map((s) => s.id)

  return renumberSongs(placedAt(family, id, number))
}

export async function saveSong(song: Song): Promise<Song[]> {
  const file = await store.read()
  const known = cleanCategories(file.categories).some((one) => one.id === song.categoryId)
  const next = { ...song, categoryId: known ? song.categoryId : null, updatedAt: Date.now() }
  const at = file.items.findIndex((s) => s.id === song.id)

  if (at >= 0) file.items[at] = next
  else file.items.unshift(next)

  await store.write(file)
  return listSongs()
}

export async function deleteSong(id: string): Promise<Song[]> {
  const file = await store.read()
  const song = file.items.find((s) => s.id === id)
  if (song) {
    file.items = file.items.filter((s) => s.id !== id)
    file.trash = toTrash(file.trash, song, KEEP_DELETED)
    await store.write(file)
  }
  return listSongs()
}

export async function markSongPlayed(id: string): Promise<void> {
  const file = await store.read()
  const song = file.items.find((s) => s.id === id)
  if (!song) return

  song.playCount = (song.playCount ?? 0) + 1
  song.lastPlayedAt = Date.now()
  await store.write(file)
}

export interface BackgroundReport {

  added: number

  existed: number
}

export interface ImportReport {
  songs: Song[]
  added: number

  backgrounds: BackgroundReport

  ids: string[]

  formats: Record<string, number>

  skipped: { file: string; reason: string }[]

  duplicates: string[]
}

export async function importSongsFromDialog(
  parent: BrowserWindow | null,
  categoryId: string | null = null
): Promise<ImportReport> {
  const result = await dialog.showOpenDialog(parent ?? undefined!, {
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
  if (result.canceled) {
    return {
      songs: await listSongs(),
      added: 0,
      backgrounds: { added: 0, existed: 0 },
      ids: [],
      formats: {},
      skipped: [],
      duplicates: []
    }
  }

  return ingest(result.filePaths, null, categoryId)
}

export async function addSongFiles(
  files: string[],
  folderId: string | null = null,
  categoryId: string | null = null
): Promise<ImportReport> {
  return ingest(await expandFiles(files), folderId, categoryId)
}

export async function readSongFile(
  path: string,
  named: string = path
): Promise<{ result: ImportResult; media: Buffer }> {
  const buf = await readFile(path)

  if (isOldOffice(buf)) {
    try {
      const old = await readOldPresentation(path)
      const media = old.asPptx ?? buf

      if (old.asPptx) {
        const result = importSongFile(named, old.asPptx)
        if (result.ok) return { result, media }
      }

      const parts = parseSongText(old.text)
      if (parts.length === 0) {
        return { result: { ok: false, reason: t('reason.pptxNoText') }, media }
      }

      const song = emptySong()
      song.title = basename(named, extname(named)).trim()
      song.parts = parts
      song.order = defaultOrder(parts)
      return { result: { ok: true, song, format: 'PowerPoint' }, media }
    } catch (error) {
      return { result: { ok: false, reason: reasonForPowerPoint(error) }, media: buf }
    }
  }

  return { result: importSongFile(named, buf), media: buf }
}

export function songName(
  path: string,
  parsed: { song: Song; format: string }
): { title: string; number: string } {
  return importedName(
    basename(path, extname(path)),
    { title: parsed.song.title, number: parsed.song.number },
    STRUCTURED_FORMAT.test(parsed.format)
  )
}

async function ingest(
  paths: string[],
  folderId: string | null,
  categoryId: string | null
): Promise<ImportReport> {
  const file = await store.read()
  const formats: Record<string, number> = {}
  const skipped: { file: string; reason: string }[] = []
  const backgrounds: BackgroundReport = { added: 0, existed: 0 }
  const ids: string[] = []
  const duplicates: string[] = []
  const category = cleanCategories(file.categories).some((one) => one.id === categoryId)
    ? categoryId
    : null

  const ordered = [...paths].sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }))

  for (const path of ordered) {
    const name = basename(path)
    try {
      const { result: parsed, media } = await readSongFile(path)
      if (!parsed.ok) {
        skipped.push({ file: name, reason: parsed.reason })
        continue
      }

      const named = songName(path, parsed)
      const title = named.title || name
      const number = named.number

      if (sameSong(file.items, title, number)) {
        duplicates.push(title)
        continue
      }

      const kept = await backgroundOf(media, title, path)
      backgrounds.added += kept.added
      backgrounds.existed += kept.existed

      const id = `song-${Date.now()}-${ids.length}`
      file.items.unshift({
        ...parsed.song,
        id,
        title,
        number,
        folderId,
        categoryId: category,
        background: kept.main?.background ?? null
      })
      formats[parsed.format] = (formats[parsed.format] ?? 0) + 1
      ids.push(id)
    } catch (error) {
      console.error(`[Песни] Не удалось прочитать «${path}»:`, error)
      skipped.push({ file: name, reason: t('main.unreadable') })
    }
  }

  if (ids.length) await store.write(file)
  return {
    songs: await listSongs(),
    added: ids.length,
    backgrounds,
    ids,
    formats,
    skipped,
    duplicates
  }
}

export interface SongBackgrounds {

  main: KeptBackground | null

  added: number
  existed: number
}

export async function backgroundOf(
  buf: Buffer,
  name: string,
  path?: string
): Promise<SongBackgrounds> {
  const out: SongBackgrounds = { main: null, added: 0, existed: 0 }

  const drawn = path ? await renderPptxBackgrounds(path) : []
  if (drawn.length > 0) {
    for (const one of [...drawn].sort((a, b) => b.slides - a.slides)) {
      try {
        const kept = await keepBackgroundImage(name, one.data, one.ext)
        out[kept.existed ? 'existed' : 'added']++
        out.main ??= kept
      } catch (error) {
        console.error('[Песни] Не удалось сохранить отрисованный фон:', error)
      }
    }
    if (out.main) return out
  }

  for (const one of pptxBackgrounds(buf)) {
    try {
      const kept =
        one.kind === 'image'
          ? await keepBackgroundImage(name, one.image.data, one.image.ext)
          : await keepBackgroundFill(name, one.background)

      out[kept.existed ? 'existed' : 'added']++
      out.main ??= kept
    } catch (error) {

      console.error('[Песни] Не удалось сохранить фон презентации:', error)
    }
  }

  return out
}

export async function exportSong(
  parent: BrowserWindow | null,
  format: SongFormat,
  songId: string
): Promise<string | null> {
  const { items } = await store.read()
  const song = items.find((s) => s.id === songId)
  if (!song) return null

  const info = FORMATS[format]

  const result = await dialog.showSaveDialog(parent ?? undefined!, {
    title: t('main.saveSong'),
    defaultPath: `${safeName(song.title || t('main.songDefaultName'))}.${info.extension}`,
    filters: [{ name: info.name, extensions: [info.extension] }]
  })
  if (result.canceled || !result.filePath) return null

  await writeSongFile(result.filePath, format, [song])
  return result.filePath
}

const safeName = (text: string): string =>
  text.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || t('main.songsFilter')
