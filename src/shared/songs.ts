import type { Song, SongPart, SongPartKind } from './types'
import { t, type Key } from './i18n'

export const PART_KINDS: SongPartKind[] = [
  'verse',
  'prechorus',
  'chorus',
  'bridge',
  'tag',
  'ending'
]

export function partTitle(part: SongPart): string {
  const name = t(`part.${part.kind}` as Key)
  return part.kind === 'verse' && part.number ? `${name} ${part.number}` : name
}

export function partLabel(part: SongPart): string {
  if (part.kind === 'verse') return String(part.number ?? '?')
  return t(`part.short.${part.kind}` as Key)
}

export function orderLabel(song: Song): string {
  return song.order
    .map((id) => song.parts.find((p) => p.id === id))
    .filter((p): p is SongPart => Boolean(p))
    .map(partLabel)
    .join('-')
}

const REPEAT = String.raw`(?:\d+\s*раз(?:а)?|[xх]\s*\d+|\d+\s*[xх])`

const TAIL = String.raw`\s*[:.)\-]?\s*(?:[({[][^)}\]]{0,24}[)}\]]|${REPEAT})?\s*[:.]?\s*`

const heading = (body: string): RegExp => new RegExp(`^\\s*(?:${body})${TAIL}$`, 'i')

const HEADINGS: { re: RegExp; kind: SongPartKind }[] = [
  { re: heading(String.raw`(?:куплет|verse|стих)\s*(\d+)?`), kind: 'verse' },
  { re: heading(String.raw`предприпев|pre-?chorus`), kind: 'prechorus' },
  { re: heading(String.raw`(?:припев|chorus|refrain|реф(?:рен)?)\s*\d*`), kind: 'chorus' },
  { re: heading(String.raw`бридж|bridge|переход`), kind: 'bridge' },
  { re: heading(String.raw`повтор|tag`), kind: 'tag' },
  { re: heading(String.raw`концовка|окончание|ending|outro`), kind: 'ending' },

  { re: /^\s*(\d+)\s*[.)]\s*$/, kind: 'verse' }
]

interface Heading {
  kind: SongPartKind
  number: number | null
}

function readHeading(line: string): Heading | null {
  for (const { re, kind } of HEADINGS) {
    const m = line.match(re)
    if (m) return { kind, number: m[1] ? Number(m[1]) : null }
  }
  return null
}

let counter = 0
const newId = (): string => `p${Date.now().toString(36)}${(counter++).toString(36)}`

export function parseSongText(text: string): SongPart[] {
  const blocks = text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter(Boolean)

  const parts: SongPart[] = []
  let pendingHeading: Heading | null = null
  let verseNumber = 0

  for (const block of blocks) {
    const lines = block.split('\n')
    let heading: Heading | null = pendingHeading
    pendingHeading = null

    const first = readHeading(lines[0])
    if (first) {
      heading = first
      lines.shift()
    }

    if (lines.length === 0 || lines.every((l) => !l.trim())) {
      pendingHeading = heading
      continue
    }

    const kind = heading?.kind ?? 'verse'
    let number: number | null = null
    if (kind === 'verse') {
      verseNumber = heading?.number ?? verseNumber + 1
      number = verseNumber
    }

    parts.push({
      id: newId(),
      kind,
      number,
      text: lines.join('\n').trim()
    })
  }

  return markRepeats(parts)
}

export function partsFromBlocks(blocks: string[][]): SongPart[] {
  const parts: SongPart[] = []
  let pending: Heading | null = null
  let verseNumber = 0

  for (const block of blocks) {
    const lines = block.map((line) => line.trim()).filter(Boolean)
    if (lines.length === 0) continue

    let heading: Heading | null = pending
    pending = null

    const first = readHeading(lines[0])
    if (first) {
      heading = first
      lines.shift()
    }

    if (lines.length === 0) {
      pending = heading
      continue
    }

    const kind = heading?.kind ?? 'verse'
    let number: number | null = null
    if (kind === 'verse') {
      verseNumber = heading?.number ?? verseNumber + 1
      number = verseNumber
    }

    parts.push({ id: newId(), kind, number, text: lines.join('\n') })
  }

  return markRepeats(parts)
}

export function defaultOrder(parts: SongPart[]): string[] {
  const choruses = parts.filter((p) => p.kind === 'chorus')

  if (choruses.length > 1) return parts.map((p) => p.id)

  const chorus = choruses[0]
  const order: string[] = []

  const beforeChorus: SongPartKind[] = ['verse', 'prechorus', 'bridge']

  for (const part of parts) {
    if (part.kind === 'chorus') continue
    order.push(part.id)
    if (chorus && beforeChorus.includes(part.kind)) order.push(chorus.id)
  }

  return order.length ? order : parts.map((p) => p.id)
}

export function emptySong(): Song {
  return {
    id: `song-${Date.now()}`,
    title: '',
    author: '',
    number: '',
    key: '',
    tempo: null,
    tags: [],
    ccli: '',
    parts: [],
    order: [],
    updatedAt: Date.now(),
    playCount: 0,
    lastPlayedAt: null
  }
}

export function withKind(parts: SongPart[], id: string, kind: SongPartKind): SongPart[] {
  const changed = parts.map((part) =>
    part.id === id ? { ...part, kind, number: kind === 'verse' ? part.number : null } : part
  )

  let number = 0
  return changed.map((part) =>
    part.kind === 'verse' ? { ...part, number: ++number } : part
  )
}

export function newPart(kind: SongPartKind, parts: SongPart[]): SongPart {
  const number =
    kind === 'verse'
      ? Math.max(0, ...parts.filter((p) => p.kind === 'verse').map((p) => p.number ?? 0)) + 1
      : null
  return { id: newId(), kind, number, text: '' }
}

export const sameText = (text: string): string =>
  text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const ENOUGH = 8

export function markRepeats(parts: SongPart[]): SongPart[] {
  if (parts.length < 3 || parts.some((p) => p.kind !== 'verse')) return parts

  const groups = new Map<string, string[]>()
  for (const part of parts) {
    const key = sameText(part.text)
    if (key.length < ENOUGH) continue
    const same = groups.get(key)
    if (same) same.push(part.id)
    else groups.set(key, [part.id])
  }

  const repeated = [...groups.values()].filter((ids) => ids.length > 1)

  if (repeated.length === 0 || repeated.length === groups.size) return parts

  const byWeight = repeated
    .map((ids) => ({ ids, first: parts.findIndex((p) => p.id === ids[0]) }))
    .sort((a, b) => b.ids.length - a.ids.length || a.first - b.first)

  const kinds = new Map<string, SongPartKind>()
  byWeight.forEach(({ ids }, at) => {
    for (const id of ids) kinds.set(id, at === 0 ? 'chorus' : 'tag')
  })

  let number = 0
  return parts.map((part) => {
    const kind = kinds.get(part.id) ?? part.kind
    return { ...part, kind, number: kind === 'verse' ? ++number : null }
  })
}

export function songNumber(song: Pick<Song, 'number'>): number {
  const n = Number.parseInt(song.number, 10)
  return Number.isFinite(n) && n > 0 ? n : Number.MAX_SAFE_INTEGER
}

export function songOrder(a: Song, b: Song): number {
  const byNumber = songNumber(a) - songNumber(b)
  return byNumber !== 0 ? byNumber : a.title.localeCompare(b.title, 'ru')
}

const WITH_MARK = /^\s*(\d{1,4})\s*[.)\-–—_]+\s*(\S.*)$/

const WITH_ZERO = /^\s*(0\d{0,3})\s+(\S.*)$/

export function numberFromName(name: string): { number: string; title: string } {
  const m = name.match(WITH_MARK) ?? name.match(WITH_ZERO)
  if (!m) return { number: '', title: name.trim() }
  return { number: String(Number(m[1])), title: m[2].trim() }
}

export const renumbered = (ids: string[]): { id: string; number: string }[] =>
  ids.map((id, at) => ({ id, number: String(at + 1) }))

export function placedAt(ids: string[], id: string, number: number): string[] {
  const rest = ids.filter((x) => x !== id)
  const at = Math.min(Math.max(number - 1, 0), rest.length)
  return [...rest.slice(0, at), id, ...rest.slice(at)]
}

export function movedBefore(ids: string[], id: string, beforeId: string | null): string[] {

  if (id === beforeId) return ids

  const rest = ids.filter((x) => x !== id)
  const at = beforeId === null ? rest.length : rest.indexOf(beforeId)
  if (at < 0) return [...rest, id]
  return [...rest.slice(0, at), id, ...rest.slice(at)]
}
