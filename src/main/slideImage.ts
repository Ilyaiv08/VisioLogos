import { app, BrowserWindow } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Background, SlideStyle } from '@shared/types'
import { backgroundCss } from '@shared/backgrounds'

const WIDTH = 1920
const HEIGHT = 1080

export interface RenderedBackground {
  data: Buffer

  format: 'png' | 'jpeg'
}

export async function renderBackground(
  background: Background
): Promise<RenderedBackground | null> {
  const css = backgroundCss(background)
  const video = background.kind === 'video' ? background.src : null

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; background: #000 }
  .bg { position: absolute; inset: 0; background: ${css} }
  video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover }
</style></head><body>
  ${video ? `<video src="${video}" autoplay muted></video>` : '<div class="bg"></div>'}
</body></html>`

  const path = join(app.getPath('temp'), `visiologos-bg-${Date.now()}.html`)
  await writeFile(path, html, 'utf8')

  const window = new BrowserWindow({
    show: false,
    width: WIDTH,
    height: HEIGHT,
    useContentSize: true,
    webPreferences: { offscreen: true }
  })

  try {
    await window.loadURL(pathToFileURL(path).href)

    await wait(video ? 700 : 120)

    const image = await window.webContents.capturePage()
    if (image.isEmpty()) return null

    const photo = background.kind === 'image' || background.kind === 'video'
    return photo
      ? { data: image.toJPEG(88), format: 'jpeg' }
      : { data: image.toPNG(), format: 'png' }
  } catch (error) {
    console.error('[Экспорт] Не удалось нарисовать фон:', error)
    return null
  } finally {
    window.destroy()
  }
}

const wait = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

export async function fitFontSizes(
  slides: string[][],
  style: SlideStyle,
  font: string,
  reservePct: number
): Promise<number[]> {
  const pad = (style.paddingPct / 100) * WIDTH

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden }
  #box { position: absolute; left: ${pad}px; right: ${pad}px; top: ${pad}px;
         bottom: ${pad + (reservePct / 100) * HEIGHT}px; overflow: hidden }
  #text { width: 100%; height: 100%; overflow: hidden;
          font-family: ${font}, serif; font-weight: ${style.bold ? 700 : 400};
          line-height: ${style.lineHeight}; text-align: ${style.align};
          text-transform: ${style.uppercase ? 'uppercase' : 'none'} }
  p { margin: 0 }
</style></head><body><div id="box"><div id="text"></div></div></body></html>`

  const path = join(app.getPath('temp'), `visiologos-fit-${Date.now()}.html`)
  await writeFile(path, html, 'utf8')

  const window = new BrowserWindow({
    show: false,
    width: WIDTH,
    height: HEIGHT,
    useContentSize: true,
    webPreferences: { offscreen: true }
  })

  try {
    await window.loadURL(pathToFileURL(path).href)
    return (await window.webContents.executeJavaScript(
      `(() => {
        const text = document.getElementById('text')
        const slides = ${JSON.stringify(slides)}
        const apply = (vh) => {
          text.style.fontSize = (${HEIGHT} * vh) / 100 + 'px'
          return text.scrollHeight <= text.clientHeight + 1
        }
        return slides.map((lines) => {
          text.innerHTML = lines
            .map((l) => '<p>' + l.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</p>')
            .join('')
          if (apply(${style.fontSizeVh})) return ${style.fontSizeVh}
          let lo = ${style.minFontSizeVh}, hi = ${style.fontSizeVh}
          for (let i = 0; i < 10; i++) {
            const mid = (lo + hi) / 2
            if (apply(mid)) lo = mid
            else hi = mid
          }
          return lo
        })
      })()`,
      true
    )) as number[]
  } catch (error) {
    console.error('[Экспорт] Не удалось подобрать кегль:', error)
    return slides.map(() => style.fontSizeVh)
  } finally {
    window.destroy()
  }
}
