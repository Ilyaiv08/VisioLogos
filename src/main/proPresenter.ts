import type { Song, SongPart } from '@shared/types'
import { defaultOrder, emptySong, parseSongText } from '@shared/songs'
import { findRtfChunks, rtfToText } from './rtf'
import { headingFromLabel, looksLikePartLabel } from './songHeadings'
import { takeTitleBlock } from './songTitle'

export interface ProPresenterSong {
  song: Song
  format: string
}

interface Chunk {
  label: string | null
  text: string
}

export function fromProPresenter(buf: Buffer, fallbackTitle: string): ProPresenterSong | null {

  const xml = buf.toString('utf8')
  if (xml.includes('<RVPresentationDocument')) {
    const song = fromProPresenterXml(xml, fallbackTitle)
    return song ? { song, format: `ProPresenter ${xmlVersion(xml)}` } : null
  }

  const raw = buf.toString('latin1')
  if (raw.includes('{\\rtf')) {
    const song = fromProPresenter7(raw, fallbackTitle)
    return song ? { song, format: 'ProPresenter 7' } : null
  }
  return null
}

const xmlVersion = (data: string): string =>
  /versionNumber="(\d+)"/.exec(data)?.[1] === '500' ? '5' : '6'

function fromProPresenterXml(data: string, fallbackTitle: string): Song | null {
  const marks =
    /<RVSlideGrouping\b([^>]*)>|<RVDisplaySlide\b([^>]*)>|RTFData="([^"]*)"|<NSString rvXMLIvarName="RTFData">([\s\S]*?)<\/NSString>/g

  const chunks: Chunk[] = []
  let label: string | null = null
  let slideOpen = false

  for (const m of data.matchAll(marks)) {
    if (m[1] !== undefined) {
      label = attr(m[1], 'name')
      slideOpen = false
    } else if (m[2] !== undefined) {

      const own = attr(m[2], 'label')
      if (own) label = own
      slideOpen = true
    } else {
      const base64 = m[3] ?? m[4] ?? ''
      const text = rtfToText(Buffer.from(base64.trim(), 'base64').toString('latin1'))
      if (!text) continue

      const last = chunks[chunks.length - 1]
      if (!slideOpen && last) last.text += `\n${text}`
      else chunks.push({ label, text })
      slideOpen = false
    }
  }

  const { title, author, parts } = partsFromChunks(chunks, fallbackTitle)
  if (parts.length === 0) return null

  const head = headOf(data)
  const song = emptySong()
  song.title = attr(head, 'CCLISongTitle') || title || fallbackTitle
  song.author = attr(head, 'CCLIAuthor') || attr(head, 'CCLIArtistCredits') || author
  song.number = attr(head, 'CCLISongNumber')
  song.parts = parts
  song.order = defaultOrder(parts)
  return song
}

function headOf(data: string): string {
  const at = data.indexOf('<RVSlideGrouping')
  return data.slice(0, at < 0 ? 4000 : at)
}

function attr(attrs: string, name: string): string {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)
  return m ? decodeXml(m[1]) : ''
}

const decodeXml = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')

function fromProPresenter7(data: string, fallbackTitle: string): Song | null {
  const rtf = findRtfChunks(data)
  if (rtf.length === 0) return null

  const labels = findLabels(Buffer.from(data, 'latin1'))

  const chunks: Chunk[] = []
  for (const piece of rtf) {
    const text = rtfToText(piece.rtf)
    if (!text) continue

    const label = labels.filter((l) => l.at < piece.at).pop()?.text ?? null

    const last = chunks[chunks.length - 1]

    if (last && last.text === text) continue
    chunks.push({ label, text })
  }

  const { title, author, parts } = partsFromChunks(chunks, fallbackTitle)
  if (parts.length === 0) return null

  const song = emptySong()
  song.title = title || fallbackTitle
  song.author = author
  song.parts = parts
  song.order = defaultOrder(parts)
  return song
}

interface Label {
  at: number
  text: string
}

function findLabels(buf: Buffer): Label[] {
  const found: Label[] = []
  try {
    walk(buf, 0, buf.length, 0, found)
  } catch {
    return []
  }
  return found.filter((l) => looksLikePartLabel(l.text))
}

function walk(buf: Buffer, start: number, end: number, depth: number, out: Label[]): boolean {
  let at = start

  while (at < end) {
    const key = varint(buf, at, end)
    if (!key || key.value >>> 3 === 0) return false
    at = key.next

    const wire = key.value & 7
    if (wire === 0) {
      const v = varint(buf, at, end)
      if (!v) return false
      at = v.next
    } else if (wire === 1) {
      at += 8
    } else if (wire === 5) {
      at += 4
    } else if (wire === 2) {
      const len = varint(buf, at, end)
      if (!len) return false
      const from = len.next
      const to = from + len.value
      if (to > end) return false

      const text = readableText(buf.subarray(from, to))
      if (text !== null) {
        out.push({ at: from, text })
      } else if (len.value > 1 && depth < 12) {

        const nested: Label[] = []
        if (walk(buf, from, to, depth + 1, nested)) out.push(...nested)
      }
      at = to
    } else {

      return false
    }
    if (at > end) return false
  }
  return at === end
}

function varint(buf: Buffer, at: number, end: number): { value: number; next: number } | null {
  let value = 0
  let shift = 0

  while (at < end && shift <= 28) {
    const byte = buf[at++]
    value |= (byte & 0x7f) << shift
    if ((byte & 0x80) === 0) return { value: value >>> 0, next: at }
    shift += 7
  }
  return null
}

function readableText(slice: Uint8Array): string | null {
  if (slice.length === 0 || slice.length > 64) return null

  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(slice)
  } catch {
    return null
  }

  return /[\x00-\x1f\x7f]/.test(text) ? null : text
}

function partsFromChunks(chunks: Chunk[], fileName: string): FromChunks {
  const blocks: string[] = []
  let lastLabel: string | null = null

  const labelled: boolean[] = []

  for (const chunk of chunks) {
    const heading = chunk.label ? headingFromLabel(chunk.label) : null

    if (chunk.label !== null && chunk.label === lastLabel && blocks.length > 0) {
      blocks[blocks.length - 1] += `\n${chunk.text}`
      continue
    }
    lastLabel = chunk.label
    labelled.push(heading !== null)
    blocks.push(heading ? `${heading}\n${chunk.text}` : chunk.text)
  }

  const head = labelled[0]
    ? null
    : takeTitleBlock(
        blocks.map((block) => block.split('\n')),
        fileName
      )

  const body = head ? head.rest.map((lines) => lines.join('\n')) : blocks
  return {
    title: head?.title ?? '',
    author: head?.author ?? '',
    parts: parseSongText(body.join('\n\n'))
  }
}

interface FromChunks {
  title: string
  author: string
  parts: SongPart[]
}
