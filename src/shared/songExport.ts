import type { Song, SongPart } from './types'
import { orderLabel, partTitle } from './songs'
import { lang, t } from './i18n'

export function toPlainText(song: Song): string {
  const about = [song.author, song.number && `№ ${song.number}`, song.key && `тон. ${song.key}`]
    .filter(Boolean)
    .join(' · ')

  const parts = ordered(song).map((part) => `${heading(part)}\n${part.text}`)

  const head = [song.title, about].filter(Boolean).join('\n')
  return `${head}\n\n${parts.join('\n\n')}`.trim()
}

const heading = (part: SongPart): string =>
  part.kind === 'chorus' ? `${t('part.chorus')}:` : partTitle(part)

function ordered(song: Song): SongPart[] {
  const seen = new Set<string>()
  const parts: SongPart[] = []

  for (const id of song.order) {
    if (seen.has(id)) continue
    const part = song.parts.find((p) => p.id === id)
    if (part) {
      seen.add(id)
      parts.push(part)
    }
  }

  return [...parts, ...song.parts.filter((p) => !seen.has(p.id))]
}

export function toOpenSong(song: Song): string {
  const marks = new Map(song.parts.map((part) => [part.id, openSongMark(part)]))

  const lyrics = ordered(song)
    .map((part) => {

      const lines = part.text.split('\n').map((line) => ` ${line}`)
      return [`[${marks.get(part.id)}]`, ...lines].join('\n')
    })
    .join('\n')

  const presentation = song.order.map((id) => marks.get(id)).filter(Boolean).join(' ')

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<song>',
    `  <title>${xml(song.title)}</title>`,
    `  <author>${xml(song.author)}</author>`,
    `  <hymn_number>${xml(song.number)}</hymn_number>`,
    `  <key>${xml(song.key)}</key>`,
    `  <ccli>${xml(song.ccli)}</ccli>`,
    `  <tempo>${song.tempo ?? ''}</tempo>`,
    `  <presentation>${xml(presentation)}</presentation>`,
    `  <lyrics>${xml(lyrics)}</lyrics>`,
    '</song>'
  ].join('\n')
}

const OPENSONG_MARK: Record<SongPart['kind'], string> = {
  verse: 'V',
  prechorus: 'P',
  chorus: 'C',
  bridge: 'B',
  tag: 'T',
  ending: 'E'
}

const openSongMark = (part: SongPart): string =>
  part.kind === 'verse' ? `V${part.number ?? 1}` : OPENSONG_MARK[part.kind]

export function toOpenLyrics(song: Song): string {
  const names = new Map(song.parts.map((part) => [part.id, openLyricsName(part)]))

  const verses = ordered(song)
    .map((part) => {
      const lines = part.text.split('\n').map(xml).join('<br/>')
      return `  <verse name="${names.get(part.id)}"><lines>${lines}</lines></verse>`
    })
    .join('\n')

  const order = song.order.map((id) => names.get(id)).filter(Boolean).join(' ')
  const date = new Date().toISOString().slice(0, 19)

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<song xmlns="http://openlyrics.info/namespace/2009/song" version="0.8"' +
      ` createdIn="VisioLogos" modifiedDate="${date}">`,
    ' <properties>',
    `  <titles><title>${xml(song.title)}</title></titles>`,
    song.author ? `  <authors><author>${xml(song.author)}</author></authors>` : '',
    order ? `  <verseOrder>${xml(order)}</verseOrder>` : '',
    song.number ? `  <songbooks><songbook name="" entry="${xml(song.number)}"/></songbooks>` : '',
    ' </properties>',
    ' <lyrics>',
    verses,
    ' </lyrics>',
    '</song>'
  ]
    .filter(Boolean)
    .join('\n')
}

const OPENLYRICS_NAME: Record<SongPart['kind'], string> = {
  verse: 'v',
  prechorus: 'p',
  chorus: 'c',
  bridge: 'b',
  tag: 't',
  ending: 'e'
}

const openLyricsName = (part: SongPart): string =>
  part.kind === 'verse' ? `v${part.number ?? 1}` : OPENLYRICS_NAME[part.kind]

const xml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

export function songbookHtml(songs: Song[]): string {
  const body = songs
    .map((song) => {
      const about = [song.author, song.number && `№ ${song.number}`, song.key && `тон. ${song.key}`]
        .filter(Boolean)
        .join(' · ')

      const parts = ordered(song)
        .map(
          (part) =>
            `<section class="part"><h2>${xml(heading(part))}</h2><p>${part.text
              .split('\n')
              .map(xml)
              .join('<br>')}</p></section>`
        )
        .join('')

      const order = orderLabel(song)
      return (
        `<article><h1>${xml(song.title || t('common.untitled'))}</h1>` +
        (about ? `<p class="about">${xml(about)}</p>` : '') +
        parts +
        (order ? `<p class="order">${xml(t('main.printOrder', { order }))}</p>` : '') +
        '</article>'
      )
    })
    .join('')

  return `<!doctype html>
<html lang="${lang()}"><head><meta charset="utf-8"><title>${xml(t('main.songbook'))}</title>
<style>
  body { font: 12pt/1.45 Georgia, 'Times New Roman', serif; color: #111; margin: 0 }
  article { page-break-after: always }
  article:last-child { page-break-after: auto }
  h1 { font-size: 19pt; margin: 0 0 2pt }
  .about { margin: 0 0 14pt; font-size: 10pt; color: #555 }
  .part { page-break-inside: avoid; margin-bottom: 16pt }
  h2 { font-size: 10pt; letter-spacing: .09em; text-transform: uppercase; color: #666; margin: 0 0 3pt; font-weight: 600 }
  p { margin: 0 }
  .order { margin-top: 16pt; font-size: 10pt; color: #555 }
</style></head><body>${body}</body></html>`
}
