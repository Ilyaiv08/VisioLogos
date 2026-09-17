import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { BibleBook, StoredTranslation, Testament } from '@shared/types'

export interface ImportReport {
  translation: StoredTranslation
  warnings: string[]
}

interface IniBook {
  path: string
  fullName: string
  shortNames: string[]
  chapterQty: number
}

function decode(buf: Buffer): string {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.subarray(3).toString('utf8')
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    return new TextDecoder('windows-1251').decode(buf)
  }
}

async function readText(path: string): Promise<string> {
  return decode(await readFile(path))
}

interface IniData {
  meta: Record<string, string>
  books: IniBook[]
}

function parseIni(raw: string): IniData {
  const meta: Record<string, string> = {}
  const books: IniBook[] = []
  let current: Partial<IniBook> | null = null

  const push = (): void => {
    if (current?.path) {
      books.push({
        path: current.path,
        fullName: current.fullName ?? current.path,
        shortNames: current.shortNames ?? [],
        chapterQty: current.chapterQty ?? 0
      })
    }
    current = null
  }

  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z]\w*)\s*=\s*(.*?)\s*$/)
    if (!m) continue
    const [, keyRaw, value] = m
    const key = keyRaw.toLowerCase()

    if (key === 'pathname') {
      push()
      current = { path: value }
    } else if (current) {
      if (key === 'fullname') current.fullName = value
      else if (key === 'shortname') current.shortNames = value.split(/\s+/).filter(Boolean)
      else if (key === 'chapterqty') current.chapterQty = Number(value) || 0
    } else {
      meta[key] = value
    }
  }
  push()
  return { meta, books }
}

const norm = (s: string): string =>
  s.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, '')

const NT_NAMES = new Set(
  [
    'отматфея', 'матфея', 'мф', 'отмарка', 'марка', 'мк', 'отлуки', 'луки', 'лк',
    'отиоанна', 'иоанна', 'ин', 'деяния', 'деян', 'иакова', 'иак',
    '1петра', '2петра', '1пет', '2пет', '1иоанна', '2иоанна', '3иоанна',
    '1ин', '2ин', '3ин', 'иуды', 'иуд', 'кримлянам', 'римлянам', 'рим',
    '1коринфянам', '2коринфянам', '1кор', '2кор', 'кгалатам', 'галатам', 'гал',
    'кефесянам', 'ефесянам', 'еф', 'кфилиппийцам', 'филиппийцам', 'флп',
    'кколоссянам', 'колоссянам', 'кол', '1фессалоникийцам', '2фессалоникийцам',
    '1фес', '2фес', '1тимофею', '2тимофею', '1тим', '2тим', 'ктиту', 'титу', 'тит',
    'кфилимону', 'филимону', 'флм', 'кевреям', 'евреям', 'евр',
    'откровение', 'откр', 'апокалипсис'
  ].map(norm)
)

const APOCRYPHA_NAMES = new Set(
  [
    'товит', 'иудифь', 'премудростьсоломона', 'премудростьиисусасынасирахова',
    'сирах', 'варух', 'посланиеиеремии', '1маккавейская', '2маккавейская',
    '3маккавейская', '2ездры', '3ездры', 'молитваманассии',
    'премудростисоломона', '1ямаккавейская', '2ямаккавейская', '3ямаккавейская',
    '2яездры', '3яездры'
  ].map(norm)
)

function detectTestament(book: IniBook): Testament {
  const marked = /^\s*\(\s*неканон/i.test(book.fullName)
  const stripped = book.fullName.replace(/^\s*\([^)]*\)\s*/, '')
  const candidates = [stripped, book.fullName, ...book.shortNames].map(norm)

  if (marked || candidates.some((c) => APOCRYPHA_NAMES.has(c))) return 'apocrypha'
  return candidates.some((c) => NT_NAMES.has(c)) ? 'nt' : 'ot'
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

interface Marker {

  start: number

  end: number
  num: number
}

function findMarkers(text: string, sign: string): Marker[] {
  const trimmed = sign.trim()
  if (!trimmed) return []

  const re = new RegExp(`${escapeRe(trimmed)}[^0-9]{0,40}?(\\d+)`, 'gi')
  const out: Marker[] = []
  for (const m of text.matchAll(re)) {
    out.push({ start: m.index, end: m.index + m[0].length, num: Number(m[1]) })
  }
  return out
}

const ENTITIES: Record<string, string> = {
  nbsp: ' ', mdash: '—', ndash: '–', laquo: '«', raquo: '»',
  hellip: '…', amp: '&', lt: '<', gt: '>', quot: '"', apos: '\''
}

function cleanVerse(raw: string): string {
  return raw
    .replace(/<s>\s*\d+\s*<\/s>/gi, '')
    .replace(/<pb\s*\/?>/gi, ' ')
    .replace(/<\/?(?:br|div|p|font|span|a|h\d)\b[^>]*>/gi, ' ')
    .replace(/<\/?i\b[^>]*>/gi, '')
    .replace(/<(?!\/?[jt]\b)[^>]*>/g, '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
      if (code.toLowerCase().startsWith('#x')) {
        return String.fromCodePoint(parseInt(code.slice(2), 16))
      }
      if (code.startsWith('#')) return String.fromCodePoint(Number(code.slice(1)))
      return ENTITIES[code.toLowerCase()] ?? whole
    })
    .replace(/\s+/g, ' ')
    .trim()
}

function parseBookHtml(html: string, chapterSign: string, verseSign: string): string[][] {
  const body = html.replace(/^[\s\S]*?<body[^>]*>/i, '')
  const chapters: string[][] = []
  const marks = findMarkers(body, chapterSign)

  for (let i = 0; i < marks.length; i++) {
    const chunk = body.slice(
      marks[i].end,
      i + 1 < marks.length ? marks[i + 1].start : body.length
    )

    const verses: string[] = []
    const vmarks = findMarkers(chunk, verseSign)
    for (let j = 0; j < vmarks.length; j++) {
      const end = j + 1 < vmarks.length ? vmarks[j + 1].start : chunk.length
      verses.push(cleanVerse(chunk.slice(vmarks[j].end, end)))
    }
    chapters.push(verses)
  }
  return chapters
}

async function findIni(dir: string): Promise<string | null> {
  const entries = await readdir(dir)
  const hit = entries.find((e) => e.toLowerCase() === 'bibleqt.ini')
  return hit ? join(dir, hit) : null
}

export async function importBibleQuoteModule(
  dir: string,
  id: string
): Promise<ImportReport> {
  const iniPath = await findIni(dir)
  if (!iniPath) throw new Error(`В папке «${dir}» нет файла bibleqt.ini`)

  const { meta, books: iniBooks } = parseIni(await readText(iniPath))
  if (iniBooks.length === 0) throw new Error('В bibleqt.ini не описано ни одной книги')

  const warnings: string[] = []
  const declared = Number(meta.bookqty)
  if (declared && declared !== iniBooks.length) {
    warnings.push(`BookQty = ${declared}, а описано книг: ${iniBooks.length}`)
  }

  const chapterSign = meta.chaptersign || '<strong>'
  const verseSign = meta.versesign || '<sup>'
  const books: BibleBook[] = []
  const text: string[][][] = []
  let verseCount = 0

  for (let i = 0; i < iniBooks.length; i++) {
    const iniBook = iniBooks[i]
    let chapters: string[][] = []
    try {
      chapters = parseBookHtml(
        await readText(join(dir, iniBook.path)),
        chapterSign,
        verseSign
      )
    } catch {
      warnings.push(`Не удалось прочитать «${iniBook.path}» (${iniBook.fullName})`)
    }

    if (iniBook.chapterQty && chapters.length !== iniBook.chapterQty) {
      warnings.push(
        `${iniBook.fullName}: в ini указано глав ${iniBook.chapterQty}, разобрано ${chapters.length}`
      )
    }

    const empty = chapters.filter((c) => c.length === 0).length
    if (empty) warnings.push(`${iniBook.fullName}: пустых глав — ${empty}`)

    const testament = detectTestament(iniBook)
    const name =
      testament === 'apocrypha'
        ? iniBook.fullName.replace(/^\s*\(\s*неканон[^)]*\)\s*/i, '')
        : iniBook.fullName

    books.push({
      index: i + 1,
      name,
      abbrev: iniBook.shortNames,
      testament,
      chapters: chapters.length
    })
    text.push(chapters)
    verseCount += chapters.reduce((sum, c) => sum + c.length, 0)
  }

  if (verseCount === 0) {
    throw new Error(
      `Модуль «${meta.biblename || id}» разобрался, но в нём не нашлось ни одного ` +
        `стиха. Проверьте ChapterSign («${chapterSign}») и VerseSign («${verseSign}») ` +
        'в bibleqt.ini — возможно, это формат, который программа пока не понимает.'
    )
  }

  if (verseCount === 0) {
    throw new Error(
      `Модуль «${meta.biblename || id}» прочитан, но в нём не нашлось ни одного стиха. ` +
        `Проверьте ChapterSign («${chapterSign}») и VerseSign («${verseSign}») ` +
        'в bibleqt.ini — возможно, это формат, который программа пока не понимает.'
    )
  }

  return {
    warnings,
    translation: {
      meta: {
        id,
        name: meta.biblename || id,
        shortName: meta.bibleshortname || id.toUpperCase(),
        copyright: meta.copyright,
        hasStrongs: /^y/i.test(meta.strongnumbers ?? ''),
        books,
        verseCount
      },
      text
    }
  }
}
