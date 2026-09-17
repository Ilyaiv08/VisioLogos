import type { BibleBook } from './types'
import { t, type Key } from './i18n'

export type BookGroup =
  | 'law'
  | 'history'
  | 'wisdom'
  | 'major'
  | 'minor'
  | 'gospels'
  | 'acts'
  | 'paul'
  | 'general'
  | 'revelation'
  | 'apocrypha'
  | 'other'

export interface GroupInfo {
  id: BookGroup
  color: string
}

export const groupLabel = (group: BookGroup): string => t(`group.${group}` as Key)

export const GROUPS: Record<BookGroup, GroupInfo> = {
  law: { id: 'law', color: '#92a8ff' },
  history: { id: 'history', color: '#d3a36c' },
  wisdom: { id: 'wisdom', color: '#7ed08d' },
  major: { id: 'major', color: '#e58fa0' },
  minor: { id: 'minor', color: '#c9c574' },
  gospels: { id: 'gospels', color: '#ff9b76' },
  acts: { id: 'acts', color: '#6fd0cb' },
  paul: { id: 'paul', color: '#d3a36c' },
  general: { id: 'general', color: '#7ed08d' },
  revelation: { id: 'revelation', color: '#ff8f8f' },
  apocrypha: { id: 'apocrypha', color: '#9aa4b8' },
  other: { id: 'other', color: '#99a0ab' }
}

export const GROUP_ORDER: BookGroup[] = [
  'law',
  'history',
  'wisdom',
  'major',
  'minor',
  'gospels',
  'acts',
  'paul',
  'general',
  'revelation',
  'apocrypha',
  'other'
]

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '')

const CANON: { group: BookGroup; abbrev: string[] }[] = [
  { group: 'law', abbrev: ['ge', 'gen', 'gn', 'genesis'] },
  { group: 'law', abbrev: ['ex', 'exo', 'exod', 'exodus'] },
  { group: 'law', abbrev: ['le', 'lev', 'lv', 'levit', 'leviticus'] },
  { group: 'law', abbrev: ['nu', 'num', 'nm', 'numb', 'numbers'] },
  { group: 'law', abbrev: ['de', 'deu', 'deut', 'dt', 'deuteron', 'deuteronomy'] },
  { group: 'history', abbrev: ['jos', 'josh', 'joshua'] },
  { group: 'history', abbrev: ['jdg', 'judg', 'judge', 'judges'] },
  { group: 'history', abbrev: ['ru', 'rut', 'ruth', 'rth', 'rt'] },
  { group: 'history', abbrev: ['1sa', '1s', '1sam', '1sm', '1sml', '1samuel'] },
  { group: 'history', abbrev: ['2sa', '2s', '2sam', '2sm', '2sml', '2samuel'] },
  { group: 'history', abbrev: ['1ki', '1k', '1kn', '1kg', '1king', '1kng', '1kings'] },
  { group: 'history', abbrev: ['2ki', '2k', '2kn', '2kg', '2king', '2kng', '2kings'] },
  { group: 'history', abbrev: ['1chr', '1ch', '1chron', '1chronicles'] },
  { group: 'history', abbrev: ['2chr', '2ch', '2chron', '2chronicles'] },
  { group: 'history', abbrev: ['ezr', 'ezra'] },
  { group: 'history', abbrev: ['ne', 'neh', 'nehem', 'nehemiah'] },
  { group: 'history', abbrev: ['esth', 'est', 'esther'] },
  { group: 'wisdom', abbrev: ['job', 'jb'] },
  { group: 'wisdom', abbrev: ['ps', 'psa', 'psal', 'psalm', 'psalms'] },
  { group: 'wisdom', abbrev: ['pr', 'pro', 'prov', 'proverb', 'proverbs'] },
  { group: 'wisdom', abbrev: ['ec', 'ecc', 'eccl', 'ecclesia', 'ecclesiastes'] },
  { group: 'wisdom', abbrev: ['song', 'songs', 'ss', 'sol'] },
  { group: 'major', abbrev: ['isa', 'is', 'isaiah'] },
  { group: 'major', abbrev: ['je', 'jer', 'jerem', 'jeremiah'] },
  { group: 'major', abbrev: ['la', 'lam', 'lament', 'lamentation', 'lamentations'] },
  { group: 'major', abbrev: ['ez', 'eze', 'ezek', 'ezekiel'] },
  { group: 'major', abbrev: ['da', 'dan', 'daniel'] },
  { group: 'minor', abbrev: ['hos', 'ho', 'hosea'] },
  { group: 'minor', abbrev: ['joel', 'joe'] },
  { group: 'minor', abbrev: ['am', 'amo', 'amos'] },
  { group: 'minor', abbrev: ['ob', 'oba', 'obad', 'obadiah'] },
  { group: 'minor', abbrev: ['jon', 'jnh', 'jona', 'jonah'] },
  { group: 'minor', abbrev: ['mi', 'mic', 'micah'] },
  { group: 'minor', abbrev: ['na', 'nah', 'nahum'] },
  { group: 'minor', abbrev: ['hab', 'habak', 'habakkuk'] },
  { group: 'minor', abbrev: ['zep', 'zeph', 'zephaniah'] },
  { group: 'minor', abbrev: ['hag', 'haggai'] },
  { group: 'minor', abbrev: ['ze', 'zec', 'zech', 'zechariah'] },
  { group: 'minor', abbrev: ['mal', 'malachi'] },

  { group: 'gospels', abbrev: ['mt', 'ma', 'mat', 'matt', 'matthew'] },
  { group: 'gospels', abbrev: ['mk', 'mar', 'mr', 'mrk', 'mark'] },
  { group: 'gospels', abbrev: ['lk', 'lu', 'luk', 'luke'] },
  { group: 'gospels', abbrev: ['jn', 'jno', 'joh', 'john'] },
  { group: 'acts', abbrev: ['ac', 'act', 'acts'] },

  { group: 'general', abbrev: ['jas', 'ja', 'jam', 'jms', 'james'] },
  { group: 'general', abbrev: ['1pe', '1pet', '1peter'] },
  { group: 'general', abbrev: ['2pe', '2pet', '2peter'] },
  { group: 'general', abbrev: ['1jn', '1jo', '1joh', '1jno', '1john'] },
  { group: 'general', abbrev: ['2jn', '2jo', '2joh', '2jno', '2john'] },
  { group: 'general', abbrev: ['3jn', '3jo', '3joh', '3jno', '3john'] },
  { group: 'general', abbrev: ['jud', 'jude', 'jd'] },

  { group: 'paul', abbrev: ['ro', 'rom', 'romans'] },
  { group: 'paul', abbrev: ['1co', '1cor', '1corinth', '1corinthians'] },
  { group: 'paul', abbrev: ['2co', '2cor', '2corinth', '2corinthians'] },
  { group: 'paul', abbrev: ['ga', 'gal', 'galat', 'galatians'] },
  { group: 'paul', abbrev: ['eph', 'ep', 'ephes', 'ephesians'] },
  { group: 'paul', abbrev: ['php', 'ph', 'phil', 'phi', 'philip', 'philippians'] },
  { group: 'paul', abbrev: ['col', 'colos', 'colossians'] },
  { group: 'paul', abbrev: ['1th', '1thes', '1thess', '1thessalonians'] },
  { group: 'paul', abbrev: ['2th', '2thes', '2thess', '2thessalonians'] },
  { group: 'paul', abbrev: ['1ti', '1tim', '1timothy'] },
  { group: 'paul', abbrev: ['2ti', '2tim', '2timothy'] },
  { group: 'paul', abbrev: ['tit', 'ti', 'titus'] },
  { group: 'paul', abbrev: ['phm', 'phile', 'phlm', 'philemon'] },
  { group: 'paul', abbrev: ['he', 'heb', 'hebr', 'hebrews'] },

  { group: 'revelation', abbrev: ['rev', 're', 'rv', 'revelation'] }
]

export const CANON_SIZE = CANON.length

const BY_ABBREV = new Map<string, { group: BookGroup; canon: number }>()

for (const [i, book] of CANON.entries()) {
  for (const abbrev of book.abbrev) BY_ABBREV.set(norm(abbrev), { group: book.group, canon: i + 1 })
}

export const canonAbbrevs = (): string[] => CANON.flatMap((book) => book.abbrev)

function latinHit(book: BibleBook): { group: BookGroup; canon: number } | null {
  for (const abbrev of book.abbrev) {
    if (!/^[0-9]?[A-Za-z]/.test(abbrev)) continue
    const hit = BY_ABBREV.get(norm(abbrev))
    if (hit) return hit
  }
  return null
}

export function canonOf(book: BibleBook): number | null {
  if (book.testament === 'apocrypha') return null
  return latinHit(book)?.canon ?? null
}

export function inCanonOrder(books: BibleBook[]): BibleBook[] {
  const keyed = books.map((book, i) => ({ book, i, canon: canonOf(book) }))

  const stranger = keyed.some((k) => k.canon === null && k.book.testament !== 'apocrypha')
  if (stranger) return books

  const key = (k: { i: number; canon: number | null }): number => k.canon ?? CANON_SIZE + 1 + k.i

  return keyed
    .slice()
    .sort((a, b) => key(a) - key(b))
    .map((k) => k.book)
}

const BY_INDEX: [number, BookGroup][] = [
  [5, 'law'],
  [17, 'history'],
  [22, 'wisdom'],
  [27, 'major'],
  [39, 'minor'],
  [43, 'gospels'],
  [44, 'acts'],
  [58, 'paul'],
  [65, 'general'],
  [66, 'revelation']
]

export function groupOf(book: BibleBook, totalBooks: number): BookGroup {

  if (book.testament === 'apocrypha') return 'apocrypha'

  const hit = latinHit(book)
  if (hit) return hit.group

  if (totalBooks === CANON_SIZE) {
    for (const [last, group] of BY_INDEX) {
      if (book.index <= last) return group
    }
  }
  return 'other'
}

export const groupColor = (group: BookGroup): string => GROUPS[group].color
