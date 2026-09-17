import type { StoredTranslation, TranslationMeta } from './types'

export const BIBLE_FORMAT = 'visiologos-bible'

export const BIBLE_FORMAT_VERSION = 1

export const BIBLE_EXT = 'vlb'

export const bibleFileName = (meta: TranslationMeta): string =>
  `${(meta.name || meta.id).replace(/[\\/:*?"<>|]/g, ' ').trim()}.${BIBLE_EXT}`

export interface PackedBible {
  format: string
  version: number
  id: string
  name: string
  shortName: string
  copyright?: string
  hasStrongs: boolean
  verseCount: number
  books: TranslationMeta['books']
  text: string[][][]
}

export function packTranslation(stored: StoredTranslation): PackedBible {
  const { meta } = stored

  return {
    format: BIBLE_FORMAT,
    version: BIBLE_FORMAT_VERSION,
    id: meta.id,
    name: meta.name,
    shortName: meta.shortName,
    ...(meta.copyright ? { copyright: meta.copyright } : {}),
    hasStrongs: meta.hasStrongs,
    verseCount: meta.verseCount,
    books: meta.books,
    text: stored.text
  }
}

export function unpackTranslation(raw: unknown): StoredTranslation {
  const data = raw as Partial<PackedBible> & Partial<StoredTranslation>

  if (!data || typeof data !== 'object') throw new Error('Файл не читается')

  if (data.meta && Array.isArray(data.text)) {
    return { meta: data.meta, text: data.text }
  }

  if (data.format !== BIBLE_FORMAT) {
    throw new Error('Это не файл перевода VisioLogos')
  }
  if (!Array.isArray(data.text) || !Array.isArray(data.books)) {
    throw new Error('В файле нет текста перевода')
  }
  if (Number(data.version) > BIBLE_FORMAT_VERSION) {
    throw new Error('Файл сделан более новой версией программы — обновите её')
  }

  const meta: TranslationMeta = {
    id: String(data.id ?? ''),
    name: String(data.name ?? data.id ?? ''),
    shortName: String(data.shortName ?? data.id ?? ''),
    copyright: data.copyright,
    hasStrongs: Boolean(data.hasStrongs),
    books: data.books,
    verseCount: Number(data.verseCount) || countVerses(data.text)
  }
  if (!meta.id) throw new Error('В файле не указано имя перевода')

  return { meta, text: data.text }
}

const countVerses = (text: string[][][]): number =>
  text.reduce(
    (all, book) => all + book.reduce((sum, chapter) => sum + chapter.length, 0),
    0
  )

export function storageName(id: string): string {
  const clean = String(id ?? '')

    .replace(/[<>:"/\|?*\u0000-\u001f]+/g, '_')

    .replace(/[. ]+$/, '')
    .trim()
  return clean || '_'
}

export const legacyStorageName = (id: string): string =>
  String(id ?? '').replace(/[^\w.+-]+/g, '_')
