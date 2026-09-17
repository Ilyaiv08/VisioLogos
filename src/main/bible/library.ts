import { app } from 'electron'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { gunzipSync, gzipSync } from 'node:zlib'
import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import type {
  PassageText,
  SearchHit,
  StoredTranslation,
  TranslationMeta
} from '@shared/types'
import { normalize, normalizeTranslatorTag, toPlain } from '@shared/text'
import { buildBookIndex, formatReference, type BookIndex } from '@shared/refs'
import { importBibleQuoteModule } from './bqParser'
import {
  bibleFileName,
  legacyStorageName,
  packTranslation,
  storageName,
  unpackTranslation
} from '@shared/bibleFile'

interface LoadedTranslation {
  data: StoredTranslation
  index: BookIndex

  searchText: string[][][] | null
}

const loaded = new Map<string, LoadedTranslation>()
let catalog: TranslationMeta[] = []

const biblesDir = (): string => join(app.getPath('userData'), 'bibles')

const bundledModulesDir = (): string =>
  app.isPackaged
    ? join(process.resourcesPath, 'modules')
    : join(app.getAppPath(), 'modules')

export async function initLibrary(): Promise<TranslationMeta[]> {
  await mkdir(biblesDir(), { recursive: true })
  await importBundledModules()
  await refreshCatalog()
  return catalog
}

async function importBundledModules(): Promise<void> {
  const dir = bundledModulesDir()
  if (!existsSync(dir)) return

  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const id = entry.name
    if (existsSync(storagePath(id))) continue
    try {
      const { translation, warnings } = await importBibleQuoteModule(join(dir, id), id)
      await saveTranslation(translation)
      const suffix = warnings.length ? ` (замечаний: ${warnings.length})` : ''
      console.log(
        `[Библия] Импортирован модуль «${translation.meta.name}»: ` +
          `книг ${translation.meta.books.length}, стихов ${translation.meta.verseCount}${suffix}`
      )
      for (const w of warnings.slice(0, 10)) console.warn(`[Библия] ${id}: ${w}`)
    } catch (error) {
      console.error(`[Библия] Не удалось импортировать модуль «${id}»:`, error)
    }
  }
}

const storagePath = (id: string): string => join(biblesDir(), `${storageName(id)}.json`)

const legacyPath = (id: string): string =>
  join(biblesDir(), `${legacyStorageName(id)}.json`)

const findStored = (id: string): string => {
  const now = storagePath(id)
  if (existsSync(now)) return now
  const before = legacyPath(id)
  return existsSync(before) ? before : now
}

async function refreshCatalog(): Promise<void> {
  const files = await readdir(biblesDir()).catch(() => [] as string[])
  const metas: TranslationMeta[] = []
  for (const file of files) {
    if (!file.endsWith('.json')) continue
    try {
      const data = await loadTranslation(basename(file, '.json'))
      metas.push(data.meta)
    } catch (error) {
      console.error(`[Библия] Файл «${file}» повреждён:`, error)
    }
  }
  catalog = metas.sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

export function getCatalog(): TranslationMeta[] {
  return catalog
}

async function loadTranslation(id: string): Promise<StoredTranslation> {
  const cached = loaded.get(id)
  if (cached) return cached.data

  const raw = await readFile(findStored(id), 'utf8')
  const data = unpackTranslation(JSON.parse(raw))

  data.text = data.text.map((book) =>
    book.map((chapter) => chapter.map(normalizeTranslatorTag))
  )

  loaded.set(data.meta.id, {
    data,
    index: buildBookIndex(data.meta.books),
    searchText: null
  })

  if (id !== data.meta.id) loaded.set(id, loaded.get(data.meta.id)!)
  return data
}

async function saveTranslation(translation: StoredTranslation): Promise<void> {
  await mkdir(biblesDir(), { recursive: true })
  await writeFile(
    storagePath(translation.meta.id),

    JSON.stringify(packTranslation(translation)),
    'utf8'
  )
  loaded.set(translation.meta.id, {
    data: translation,
    index: buildBookIndex(translation.meta.books),
    searchText: null
  })
}

export async function importModule(
  dir: string,
  name?: string
): Promise<{
  meta: TranslationMeta
  warnings: string[]
}> {
  const id = name ?? basename(dir)
  const { translation, warnings } = await importBibleQuoteModule(dir, id)
  await saveTranslation(translation)
  await refreshCatalog()
  return { meta: translation.meta, warnings }
}

export async function removeTranslation(id: string): Promise<TranslationMeta[]> {
  await rm(storagePath(id), { force: true })

  await rm(legacyPath(id), { force: true })
  loaded.delete(id)
  await refreshCatalog()
  return catalog
}

export async function exportTranslation(id: string, path: string): Promise<string> {
  const data = await loadTranslation(id)
  const packed = gzipSync(Buffer.from(JSON.stringify(packTranslation(data)), 'utf8'), {
    level: 9
  })
  await writeFile(path, packed)
  return path
}

export function exportFileName(id: string): string {
  const meta = catalog.find((one) => one.id === id)
  return meta ? bibleFileName(meta) : `${storageName(id)}.vlb`
}

export async function importBibleFile(
  path: string
): Promise<{ meta: TranslationMeta; warnings: string[] }> {
  const bytes = await readFile(path)
  const text =
    bytes[0] === 0x1f && bytes[1] === 0x8b
      ? gunzipSync(bytes).toString('utf8')
      : bytes.toString('utf8')

  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('Файл не читается: это не перевод VisioLogos')
  }

  const translation = unpackTranslation(raw)
  await saveTranslation(translation)
  await refreshCatalog()
  return { meta: translation.meta, warnings: [] }
}

async function use(id: string): Promise<LoadedTranslation> {
  await loadTranslation(id)
  const entry = loaded.get(id)
  if (!entry) throw new Error(`Перевод «${id}» не загружен`)
  return entry
}

export async function getChapter(
  id: string,
  book: number,
  chapter: number
): Promise<{ n: number; html: string; plain: string }[]> {
  const { data } = await use(id)
  const verses = data.text[book - 1]?.[chapter - 1] ?? []
  return verses.map((html, i) => ({ n: i + 1, html, plain: toPlain(html) }))
}

export async function getPassage(
  id: string,
  book: number,
  chapter: number,
  from: number,
  to: number
): Promise<PassageText | null> {
  const { data } = await use(id)
  const meta = data.meta.books[book - 1]
  const chapterVerses = data.text[book - 1]?.[chapter - 1]
  if (!meta || !chapterVerses) return null

  const start = Math.max(1, Math.min(from, chapterVerses.length))
  const end = Math.max(start, Math.min(to, chapterVerses.length))
  const verses = chapterVerses.slice(start - 1, end).map((html, i) => ({
    n: start + i,
    html,
    plain: toPlain(html)
  }))

  return {
    translationId: id,
    book,
    chapter,
    from: start,
    to: end,
    bookName: meta.name,
    reference: formatReference(meta.abbrev[0] ?? meta.name, chapter, start, end),
    verses
  }
}

function ensureSearchText(entry: LoadedTranslation): string[][][] {
  if (!entry.searchText) {
    entry.searchText = entry.data.text.map((book) =>
      book.map((chapter) => chapter.map((verse) => normalize(toPlain(verse))))
    )
  }
  return entry.searchText
}

export async function searchText(
  id: string,
  query: string,
  limit = 200
): Promise<SearchHit[]> {
  const entry = await use(id)
  const words = normalize(query).split(' ').filter((w) => w.length > 1)
  if (words.length === 0) return []

  const haystack = ensureSearchText(entry)
  const hits: SearchHit[] = []

  for (let b = 0; b < haystack.length; b++) {
    const meta = entry.data.meta.books[b]
    for (let c = 0; c < haystack[b].length; c++) {
      for (let v = 0; v < haystack[b][c].length; v++) {
        const text = haystack[b][c][v]
        if (!words.every((w) => text.includes(w))) continue

        hits.push({
          book: b + 1,
          bookName: meta.name,
          chapter: c + 1,
          verse: v + 1,
          reference: formatReference(meta.abbrev[0] ?? meta.name, c + 1, v + 1),
          plain: toPlain(entry.data.text[b][c][v])
        })
        if (hits.length >= limit) return hits
      }
    }
  }
  return hits
}

export async function getBookIndexData(id: string): Promise<TranslationMeta> {
  const { data } = await use(id)
  return data.meta
}
