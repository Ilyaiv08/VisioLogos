import type { BibleBook } from './types'

export interface BookIndex {

  byName: Map<string, number>
  byNumber: Map<number, BibleBook>
}

export interface ParsedRef {
  book: number
  chapter: number

  from: number | null
  to: number | null
}

const key = (s: string): string =>
  s.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, '')

export function buildBookIndex(books: BibleBook[]): BookIndex {
  const byName = new Map<string, number>()
  const byNumber = new Map<number, BibleBook>()
  for (const book of books) {
    byNumber.set(book.index, book)
    for (const name of [book.name, ...book.abbrev]) {
      const k = key(name)

      if (k && !byName.has(k)) byName.set(k, book.index)
    }
  }
  return { byName, byNumber }
}

function findBook(input: string, index: BookIndex): number | undefined {
  const k = key(input)
  if (!k) return undefined

  const exact = index.byName.get(k)
  if (exact) return exact
  if (k.length < 3) return undefined

  let found: number | undefined
  for (const [name, book] of index.byName) {
    if (!name.startsWith(k)) continue
    if (found !== undefined && found !== book) return undefined
    found = book
  }
  return found
}

export function parseReference(input: string, index: BookIndex): ParsedRef | null {
  const m = input
    .trim()
    .match(/^(.+?)\s*(\d+)\s*(?:[:.,]\s*(\d+)\s*(?:[-–—]\s*(\d+))?)?\s*$/u)
  if (!m) {

    const bookOnly = findBook(input, index)
    return bookOnly ? { book: bookOnly, chapter: 1, from: null, to: null } : null
  }

  const [, rawBook, rawChapter, rawFrom, rawTo] = m
  const book = findBook(rawBook, index)
  if (!book) return null

  const meta = index.byNumber.get(book)
  const chapter = clamp(Number(rawChapter), 1, meta ? meta.chapters : Number(rawChapter))
  if (!rawFrom) return { book, chapter, from: null, to: null }

  const from = Math.max(1, Number(rawFrom))
  const to = rawTo ? Math.max(from, Number(rawTo)) : from
  return { book, chapter, from, to }
}

export function parseReferenceList(text: string, index: BookIndex): ParsedRef[] {
  const out: ParsedRef[] = []
  let last: ParsedRef | null = null

  for (const piece of text.split(/[;\n\r]+|(?<=\))\s+/u)) {
    for (const part of splitContinuations(piece)) {
      const trimmed = part.trim()
      if (!trimmed) continue

      const direct = parseReference(trimmed, index)
      if (direct) {
        out.push(direct)
        last = direct
        continue
      }

      const cont = trimmed.match(/^(\d+)(?:\s*[-–—]\s*(\d+))?$/u)
      if (cont && last) {
        const from = Number(cont[1])
        const to = cont[2] ? Number(cont[2]) : from
        const ref: ParsedRef = { book: last.book, chapter: last.chapter, from, to }
        out.push(ref)
        last = ref
      }
    }
  }
  return out
}

function splitContinuations(piece: string): string[] {
  const parts: string[] = []
  let buffer = ''
  for (const token of piece.split(',')) {
    const candidate = buffer ? `${buffer},${token}` : token

    if (/^\s*\d+(\s*[-–—]\s*\d+)?\s*$/u.test(token) && buffer) {
      parts.push(buffer)
      buffer = token
    } else {
      buffer = candidate
    }
  }
  if (buffer.trim()) parts.push(buffer)
  return parts
}

export function formatReference(
  bookAbbrev: string,
  chapter: number,
  from?: number | null,
  to?: number | null
): string {
  const base = `${bookAbbrev} ${chapter}`
  if (!from) return base
  return to && to !== from ? `${base}:${from}-${to}` : `${base}:${from}`
}

export function formatSlideReference(
  book: BibleBook,
  chapter: number,
  from?: number | null,
  to?: number | null,
  format: 'full' | 'short' | 'latin' = 'full'
): string {

  const latin = book.abbrev.find((a) => /^[0-9]?[A-Za-z]/.test(a))
  const name =
    format === 'short'
      ? (book.abbrev[0] ?? book.name)
      : format === 'latin' && latin
        ? `${book.name} (${latin})`
        : book.name

  const base = `${name} ${chapter}`
  if (!from) return base
  return to && to !== from ? `${base}:${from}-${to}` : `${base}:${from}`
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max)
}
