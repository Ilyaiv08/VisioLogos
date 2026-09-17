import { app, BrowserWindow } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Song } from '@shared/types'
import type { SongFormat } from '@shared/songFormats'
import { songbookHtml, toOpenLyrics, toOpenSong, toPlainText } from '@shared/songExport'
import { officeFont, pptxOfSongs, reservePct, songSlides } from './pptx'
import { fitFontSizes, renderBackground } from './slideImage'
import { readSettings } from './settings'
import { DEFAULT_BACKGROUND } from '@shared/backgrounds'
import { DEFAULT_STYLE } from '@shared/slide'
import type { Background, SlideStyle } from '@shared/types'

export async function writeSongFile(
  path: string,
  format: SongFormat,
  songs: Song[]
): Promise<void> {
  if (format === 'pdf') {
    await writeFile(path, await songbookPdf(songs))
    return
  }

  if (format === 'pptx') {

    const look = await songsLook()
    const background = songs[0]?.background ?? look.background
    const slides = songSlides(songs)

    await writeFile(
      path,
      pptxOfSongs(slides, {
        style: look.style,
        background: await renderBackground(background),
        sizes: await fitFontSizes(
          slides.map((slide) => slide.lines),
          look.style,
          officeFont(look.style.fontFamily),
          reservePct(look.style)
        )
      })
    )
    return
  }

  const text =
    format === 'opensong'
      ? songs.map(toOpenSong).join('\n')
      : format === 'openlyrics'
        ? songs.map(toOpenLyrics).join('\n')
        : songs.map(toPlainText).join('\n\n\n')

  await writeFile(path, text, 'utf8')
}

async function songbookPdf(songs: Song[]): Promise<Buffer> {
  const html = songbookHtml(songs)
  const path = join(app.getPath('temp'), `visiologos-${Date.now()}.html`)
  await writeFile(path, html, 'utf8')

  const window = new BrowserWindow({ show: false, webPreferences: { javascript: false } })
  try {
    await window.loadURL(pathToFileURL(path).href)
    return await window.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: false,
      margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 }
    })
  } finally {
    window.destroy()
  }
}

async function songsLook(): Promise<{ style: SlideStyle; background: Background }> {
  const settings = await readSettings()
  const looks = settings.looks as Record<string, { style: SlideStyle; background: Background }>
  const songs = looks?.songs

  return {
    style: { ...DEFAULT_STYLE, ...songs?.style },
    background: songs?.background ?? DEFAULT_BACKGROUND
  }
}
