import { app, BrowserWindow, dialog } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Background, SlideStyle, TextItem } from '@shared/types'
import type { TextFormat } from '@shared/textFormats'
import { TEXT_FORMATS } from '@shared/textFormats'
import { textSlideLines, textTitle, textsHtml, toPlainText } from '@shared/textExport'
import { t } from '@shared/i18n'
import { officeFont, pptxOfSongs, reservePct } from './pptx'
import { fitFontSizes, renderBackground } from './slideImage'
import { readSettings } from './settings'
import { DEFAULT_BACKGROUND } from '@shared/backgrounds'
import { DEFAULT_STYLE } from '@shared/slide'

export async function writeTextFile(
  path: string,
  format: TextFormat,
  items: TextItem[]
): Promise<void> {
  if (format === 'pdf') {
    await writeFile(path, await textsPdf(items))
    return
  }

  if (format === 'pptx') {

    const look = await textsLook()
    const slides = items.flatMap((item) =>
      textSlideLines(item).map((lines) => ({ lines, note: '', title: false }))
    )

    await writeFile(
      path,
      pptxOfSongs(
        slides.length > 0
          ? slides
          : [{ lines: [t('main.emptySlide')], note: '', title: true }],
        {
          style: look.style,
          background: await renderBackground(look.background),
          sizes: await fitFontSizes(
            slides.map((slide) => slide.lines),
            look.style,
            officeFont(look.style.fontFamily),
            reservePct(look.style)
          )
        }
      )
    )
    return
  }

  await writeFile(path, items.map(toPlainText).join('\n\n———\n\n'), 'utf8')
}

async function textsPdf(items: TextItem[]): Promise<Buffer> {
  const html = textsHtml(items)
  const path = join(app.getPath('temp'), `visiologos-texts-${Date.now()}.html`)
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

async function textsLook(): Promise<{ style: SlideStyle; background: Background }> {
  const settings = await readSettings()
  const looks = settings.looks as
    | Record<string, { style?: Partial<SlideStyle>; background?: Background }>
    | undefined
  const texts = looks?.texts

  return {
    style: { ...DEFAULT_STYLE, ...texts?.style },
    background: texts?.background ?? DEFAULT_BACKGROUND
  }
}

export async function exportText(
  parent: BrowserWindow | null,
  format: TextFormat,
  items: TextItem[]
): Promise<string | null> {
  if (items.length === 0) return null

  const info = TEXT_FORMATS[format]
  const name = items.length === 1 ? textTitle(items[0]) : t('main.textsDefaultName')

  const result = await dialog.showSaveDialog(parent ?? undefined!, {
    title: t('main.saveText'),
    defaultPath: `${safeName(name)}.${info.extension}`,
    filters: [{ name: info.name, extensions: [info.extension] }]
  })
  if (result.canceled || !result.filePath) return null

  await writeTextFile(result.filePath, format, items)
  return result.filePath
}

const safeName = (text: string): string =>
  text.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() ||
  t('main.textsDefaultName')
