import { unzipSync } from 'fflate'
import { basename, extname } from 'node:path'
import type { Song, SongPart } from '@shared/types'
import { defaultOrder, emptySong, parseSongText, partsFromBlocks } from '@shared/songs'
import { t } from '@shared/i18n'
import { extractPdfText, type PdfPage } from './pdf'
import { fromProPresenter } from './proPresenter'
import { rtfToText } from './rtf'
import { headingFromLabel } from './songHeadings'
import { takeTitleBlock } from './songTitle'

export type ImportResult =
  | { ok: true; song: Song; format: string }
  | { ok: false; reason: string }

export interface ImportedSong {
  song: Song

  format: string
}

export function decodeText(buf: Buffer): string {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.subarray(3).toString('utf8')
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    return new TextDecoder('windows-1251').decode(buf)
  }
}

const unescapeXml = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')

const tagText = (xml: string, tag: string): string | null => {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}\\s*>`, 'i'))
  return m ? unescapeXml(m[1].trim()) : null
}

function fromOpenSong(xml: string, fallbackTitle: string): Song | null {
  if (!/<song[\s>]/i.test(xml) || !/<lyrics[\s>]/i.test(xml)) return null

  const lyrics = tagText(xml, 'lyrics')
  if (!lyrics) return null

  const text = lyrics
    .split(/\r?\n/)
    .map((line) => {
      const mark = line.match(/^\s*\[([^\]]+)\]\s*$/)
      if (mark) return `\n${openSongHeading(mark[1])}`

      if (/^\s*\./.test(line)) return ''
      return line.replace(/^[\s|]+/, '')
    })
    .join('\n')

  const parts = parseSongText(text)
  if (parts.length === 0) return null

  const song = emptySong()
  song.title = tagText(xml, 'title') ?? fallbackTitle
  song.author = tagText(xml, 'author') ?? ''
  song.key = tagText(xml, 'key') ?? ''
  song.number = tagText(xml, 'hymn_number') ?? ''
  song.ccli = tagText(xml, 'ccli') ?? ''
  song.parts = parts
  song.order = defaultOrder(parts)
  return song
}

function openSongHeading(mark: string): string {
  const m = mark.trim().match(/^([A-Za-zА-Яа-я]*)\s*(\d*)/)
  const letter = (m?.[1] ?? '').toUpperCase()
  const num = m?.[2] ?? ''
  if (letter.startsWith('C')) return 'Припев:'
  if (letter.startsWith('B')) return 'Бридж'
  if (letter.startsWith('P')) return 'Предприпев'
  if (letter.startsWith('E') || letter.startsWith('T')) return 'Концовка'
  return `Куплет ${num || 1}`
}

function fromOpenLyrics(xml: string, fallbackTitle: string): Song | null {
  if (!/<song[\s>]/i.test(xml) || !/<verse[\s>]/i.test(xml)) return null

  const verses = [...xml.matchAll(/<verse\b([^>]*)>([\s\S]*?)<\/verse>/gi)]
  if (verses.length === 0) return null

  const blocks: string[] = []
  for (const [, attrs, body] of verses) {
    const name = (attrs.match(/name\s*=\s*"([^"]+)"/i)?.[1] ?? 'v1').toLowerCase()
    const lines = [...body.matchAll(/<lines[^>]*>([\s\S]*?)<\/lines>/gi)]
      .map(([, inner]) =>
        unescapeXml(
          inner
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, '')
        ).trim()
      )
      .filter(Boolean)
      .join('\n')

    if (lines) blocks.push(`${openLyricsHeading(name)}\n${lines}`)
  }

  const parts = parseSongText(blocks.join('\n\n'))
  if (parts.length === 0) return null

  const song = emptySong()
  song.title = tagText(xml, 'title') ?? fallbackTitle
  song.author = tagText(xml, 'author') ?? ''
  song.ccli = xml.match(/ccliNo\s*=\s*"([^"]+)"/i)?.[1] ?? ''
  song.parts = parts
  song.order = defaultOrder(parts)
  return song
}

function openLyricsHeading(name: string): string {
  const num = name.replace(/\D/g, '')
  if (name.startsWith('c')) return 'Припев:'
  if (name.startsWith('b')) return 'Бридж'
  if (name.startsWith('p')) return 'Предприпев'
  if (name.startsWith('e') || name.startsWith('o')) return 'Концовка'
  return `Куплет ${num || 1}`
}

function fromPptx(buf: Buffer, fallbackTitle: string): Song | null {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(new Uint8Array(buf))
  } catch {
    return null
  }

  const slides = Object.keys(files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => slideNumber(a) - slideNumber(b))

  if (slides.length === 0) return null

  const blocks: string[][] = []
  for (const name of slides) {
    const xml = new TextDecoder('utf-8').decode(files[name])

    const lines = xml
      .replace(/<a:br\b[^>]*\/?>/g, '\n')
      .replace(/<\/a:p>/g, '\n')
      .match(/<a:t>([\s\S]*?)<\/a:t>|\n/g)
      ?.map((piece) => (piece === '\n' ? '\n' : unescapeXml(piece.slice(5, -6))))
      .join('')
      .split('\n')

      .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
      .filter(Boolean)

    if (lines && lines.length > 0) blocks.push(lines)
  }

  const head = takeTitleBlock(blocks, fallbackTitle)
  const body = head ? head.rest : blocks

  const parts: SongPart[] = partsFromBlocks(body)
  if (parts.length === 0) return null

  const song = emptySong()
  song.title = head?.title || fallbackTitle
  song.author = head?.author ?? ''
  song.parts = parts
  song.order = defaultOrder(parts)
  return song
}

const slideNumber = (name: string): number => Number(name.match(/(\d+)\.xml$/)?.[1] ?? 0)

interface PdfSongLine {
  text: string
  gapBefore: boolean
  size: number
  firstOnPage: boolean
}

function fromPdf(buf: Buffer, fallbackTitle: string): ImportResult {
  const { pages, problem } = extractPdfText(buf)

  if (problem === 'encrypted') {
    return { ok: false, reason: t('reason.pdfLocked') }
  }
  if (problem === 'no-text') {
    return { ok: false, reason: t('reason.pdfNoText') }
  }

  const lines = withoutRunningTitles(pages)
  if (lines.length === 0) return { ok: false, reason: t('reason.pdfNoLines') }

  const body = medianSize(lines)
  const song = emptySong()
  let at = 0

  const first = lines[0]
  if (first.size > body * 1.15 && first.text.split(/\s+/).length <= 8 && !isHeading(first.text)) {
    song.title = first.text
    at = 1
    const second = lines[1]
    if (second && second.size < body * 0.95 && !isHeading(second.text)) {
      song.author = second.text
      at = 2
    }
  }

  const text = blocksOf(lines.slice(at))
    .map((block) => block.filter((line) => !isChordLine(line)).join('\n'))
    .join('\n\n')

  const parts = parseSongText(text)
  if (parts.length === 0) return { ok: false, reason: t('reason.pdfNoSong') }

  song.title ||= fallbackTitle
  song.parts = parts
  song.order = defaultOrder(parts)
  return { ok: true, song, format: 'PDF' }
}

function withoutRunningTitles(pages: PdfPage[]): PdfSongLine[] {
  const seen = new Map<string, number>()
  if (pages.length >= 3) {
    for (const page of pages) {
      for (const line of [page.lines[0], page.lines[page.lines.length - 1]]) {
        if (!line) continue
        const key = line.text.replace(/\d+/g, '#')
        seen.set(key, (seen.get(key) ?? 0) + 1)
      }
    }
  }

  const repeats = (text: string): boolean =>
    (seen.get(text.replace(/\d+/g, '#')) ?? 0) >= pages.length * 0.6

  const out: PdfSongLine[] = []
  for (const page of pages) {
    page.lines.forEach((line, i) => {
      const edge = i === 0 || i === page.lines.length - 1
      if (/^[\s\-–—]*\d{1,3}[\s\-–—]*$/.test(line.text)) return
      if (edge && repeats(line.text)) return

      out.push({
        text: line.text,
        gapBefore: line.gapBefore,
        size: line.size,
        firstOnPage: out.length > 0 && i === 0
      })
    })
  }
  return out
}

function blocksOf(lines: PdfSongLine[]): string[][] {
  const blocks: string[][] = []
  let block: string[] = []

  for (const line of lines) {
    const boundary = line.gapBefore || line.firstOnPage || isHeading(line.text)
    if (boundary && block.length > 0) {
      blocks.push(block)
      block = []
    }
    block.push(line.text)
  }
  if (block.length > 0) blocks.push(block)

  const merged: string[][] = []
  for (const item of blocks) {
    const previous = merged[merged.length - 1]
    if (previous && previous.length === 1 && isHeading(previous[0])) previous.push(...item)
    else merged.push([...item])
  }
  return merged
}

const isHeading = (line: string): boolean => headingFromLabel(line) !== null

const CHORD = /^[A-H][#b]?(?:m|min|maj|dim|aug|sus[24]?|add\d+)?\d?(?:\/[A-H][#b]?)?$/

function isChordLine(line: string): boolean {
  const tokens = line.trim().split(/[\s|]+/).filter(Boolean)
  if (tokens.length === 0) return false
  return tokens.every((token) => CHORD.test(token) || /^[x\d()%-]+$/i.test(token))
}

function medianSize(lines: PdfSongLine[]): number {
  const sizes = lines.map((line) => line.size).sort((a, b) => a - b)
  return sizes[Math.floor(sizes.length / 2)] || 12
}

export function importSongFile(path: string, buf: Buffer): ImportResult {
  const fallbackTitle = basename(path, extname(path)).trim()

  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') {
    return fromPdf(buf, fallbackTitle)
  }

  if (buf[0] === 0x50 && buf[1] === 0x4b) {
    const song = fromPptx(buf, fallbackTitle)
    return song
      ? { ok: true, song, format: 'PowerPoint' }
      : { ok: false, reason: t('reason.pptxNoText') }
  }

  if (buf.subarray(0, 5).toString('latin1') === '{\rtf') {
    const parts = parseSongText(rtfToText(buf.toString('latin1')))
    return parts.length > 0
      ? { ok: true, song: songFrom(fallbackTitle, parts), format: 'RTF' }
      : { ok: false, reason: t('reason.rtfNoText') }
  }

  const pro = fromProPresenter(buf, fallbackTitle)
  if (pro) return { ok: true, song: pro.song, format: pro.format }

  const text = decodeText(buf)

  if (/<song[\s>]/i.test(text)) {
    const openLyrics = fromOpenLyrics(text, fallbackTitle)
    if (openLyrics) return { ok: true, song: openLyrics, format: 'OpenLyrics' }

    const openSong = fromOpenSong(text, fallbackTitle)
    if (openSong) return { ok: true, song: openSong, format: 'OpenSong' }
  }

  if (!looksLikeText(text)) return { ok: false, reason: t('reason.unknownFormat') }

  const head = readTextHead(text, fallbackTitle)
  const parts = parseSongText(head.rest)
  if (parts.length === 0) return { ok: false, reason: t('reason.fileNoText') }

  const song = songFrom(head.title || fallbackTitle, parts)
  song.author = head.author
  return { ok: true, song, format: t('format.text') }
}

function readTextHead(
  text: string,
  fileName: string
): { title: string; author: string; rest: string } {
  const blocks = text.replace(/\r\n?/g, '\n').split(/\n\s*\n+/)
  const first = (blocks[0] ?? '').trim().split('\n')
  const next = (blocks[1] ?? '').trim().split('\n')[0] ?? ''

  const byHeading =
    blocks.length > 1 &&
    first.length <= 2 &&
    first[0].length <= 60 &&
    !isHeading(first[0]) &&
    isHeading(next)

  if (byHeading) {
    return {
      title: first[0].trim(),
      author: (first[1] ?? '').trim(),
      rest: blocks.slice(1).join('\n\n')
    }
  }

  const head = takeTitleBlock(
    blocks.map((block) => block.trim().split('\n')),
    fileName
  )
  if (!head) return { title: '', author: '', rest: text }

  return {
    title: head.title,
    author: head.author,
    rest: head.rest.map((lines) => lines.join('\n')).join('\n\n')
  }
}

function looksLikeText(text: string): boolean {
  if (text.trim().length === 0) return false
  const odd = text.replace(/[^\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').length
  return odd < text.length * 0.02
}

function songFrom(title: string, parts: SongPart[]): Song {
  const song = emptySong()
  song.title = title
  song.parts = parts
  song.order = defaultOrder(parts)
  return song
}
