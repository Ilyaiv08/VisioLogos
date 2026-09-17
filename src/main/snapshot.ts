import { app, BrowserWindow, dialog, type NativeImage } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { outputPageUrl } from './outputs'
import { t } from '@shared/i18n'

const WIDTH = 1920
const HEIGHT = 1080

const SETTLE = 500

export async function saveSlideImage(parent: BrowserWindow | null): Promise<string | null> {
  const image = await captureSlide()
  if (!image || image.isEmpty()) return null

  const now = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  const stamp =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    ` ${pad(now.getHours())}-${pad(now.getMinutes())}`

  const result = await dialog.showSaveDialog(parent ?? undefined!, {
    title: t('main.saveSnapshot'),
    defaultPath: join(app.getPath('pictures'), `${t('main.snapshotName', { stamp })}.png`),
    filters: [{ name: t('main.pngFilter'), extensions: ['png'] }]
  })
  if (result.canceled || !result.filePath) return null

  await writeFile(result.filePath, image.toPNG())
  return result.filePath
}

async function captureSlide(): Promise<NativeImage | null> {
  const window = new BrowserWindow({
    show: false,
    width: WIDTH,
    height: HEIGHT,
    useContentSize: true,
    webPreferences: {

      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      offscreen: true
    }
  })

  try {

    window.setContentSize(WIDTH, HEIGHT)
    await window.loadURL(outputPageUrl('hall'))
    await new Promise((done) => setTimeout(done, SETTLE))

    const shot = await window.webContents.capturePage({
      x: 0,
      y: 0,
      width: WIDTH,
      height: HEIGHT
    })
    return shot.isEmpty() ? shot : shot.resize({ width: WIDTH, height: HEIGHT })
  } catch (error) {
    console.error('[Снимок] Не удалось нарисовать слайд:', error)
    return null
  } finally {
    if (!window.isDestroyed()) window.destroy()
  }
}
