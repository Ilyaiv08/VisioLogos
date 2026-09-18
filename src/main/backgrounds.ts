import { app, dialog, nativeImage, net, protocol, BrowserWindow } from 'electron'
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Background, BackgroundItem } from '@shared/types'
import { t } from '@shared/i18n'
import { appIconPath } from './system'
import { voiceFile } from './voice'

const SCHEME = 'visio'

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.avif'])
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mkv', '.mov'])

const dir = (): string => join(app.getPath('userData'), 'backgrounds')

export function registerBackgroundScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,

      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true
      }
    }
  ])
}

export function serveBackgrounds(): void {
  protocol.handle(SCHEME, (request) => {
    const url = new URL(request.url)
    const path = decodeURIComponent(url.pathname.replace(/^\/+/, ''))

    const file =
      url.hostname === 'bg'
        ? join(dir(), basename(path))
        : url.hostname === 'deck'
          ? deckSlidePath(path)
          : url.hostname === 'voice'
            ? voiceFile(path)
            : url.hostname === 'app' && basename(path) === 'icon.png'
              ? appIconPath()
              : null

    if (!file || !existsSync(file)) {
      return new Response('not found', { status: 404 })
    }

    const forever = url.hostname === 'bg' || url.hostname === 'deck' || url.hostname === 'app'

    return withCors(net.fetch(pathToFileURL(file).toString()), forever)
  })
}

async function withCors(from: Promise<Response>, forever = false): Promise<Response> {
  const response = await from
  const headers = new Headers(response.headers)
  headers.set('Access-Control-Allow-Origin', '*')
  if (forever) headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  return new Response(response.body, { status: response.status, headers })
}

function deckSlidePath(path: string): string | null {
  const [deck, slide] = path.split('/')
  if (!deck || !slide) return null
  return join(app.getPath('userData'), 'decks', basename(deck), basename(slide))
}

const urlFor = (file: string): string => `${SCHEME}://bg/${encodeURIComponent(file)}`

interface SavedFill {
  id: string
  name: string
  background: Background
}

const fillsFile = (): string => join(dir(), 'fills.json')

async function readFills(): Promise<SavedFill[]> {
  try {
    const saved = JSON.parse(await readFile(fillsFile(), 'utf8')) as unknown
    return Array.isArray(saved) ? (saved as SavedFill[]) : []
  } catch {

    return []
  }
}

const fillKey = (background: Background): string =>
  background.kind === 'color'
    ? background.color.toLowerCase()
    : background.kind === 'gradient'
      ? background.css
      : ''

export async function keepBackgroundFill(
  name: string,
  background: Background
): Promise<KeptBackground> {
  const key = fillKey(background)
  if (!key) return { background, existed: true }

  await mkdir(dir(), { recursive: true })
  const fills = await readFills()

  const already = fills.find((one) => fillKey(one.background) === key)
  if (already) return { background: already.background, existed: true }

  const clean = name.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim()
  fills.push({
    id: `fill:${Date.now().toString(36)}-${fills.length}`,
    name: clean || t('bg.fromDeck'),
    background
  })

  await writeFile(fillsFile(), JSON.stringify(fills, null, 2), 'utf8')
  return { background, existed: false }
}

export async function listUserBackgrounds(): Promise<BackgroundItem[]> {
  await mkdir(dir(), { recursive: true })
  const files = await readdir(dir()).catch(() => [] as string[])

  const fills: BackgroundItem[] = (await readFills()).map((one) => ({
    id: one.id,
    name: one.name,
    builtin: false,
    background: one.background
  }))

  const pictures = files
    .filter((f) => IMAGE_EXT.has(extname(f).toLowerCase()) || VIDEO_EXT.has(extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'ru'))
    .map((file) => ({
      id: `user:${file}`,
      name: basename(file, extname(file)),
      builtin: false,
      background: VIDEO_EXT.has(extname(file).toLowerCase())
        ? { kind: 'video' as const, src: urlFor(file) }
        : { kind: 'image' as const, src: urlFor(file) }
    }))

  return [...fills, ...pictures]
}

export async function addBackgroundsFromDialog(
  parent: BrowserWindow | null
): Promise<BackgroundItem[]> {
  const result = await dialog.showOpenDialog(parent ?? undefined!, {
    title: 'Выберите картинки или видео для фона',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Картинки и видео', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'mp4', 'webm'] }
    ]
  })
  if (result.canceled) return listUserBackgrounds()

  await mkdir(dir(), { recursive: true })
  for (const source of result.filePaths) {
    await copyFile(source, uniqueTarget(basename(source)))
  }
  return listUserBackgrounds()
}

export interface KeptBackground {
  background: Background

  existed: boolean
}

export async function keepBackgroundImage(
  name: string,
  data: Uint8Array,
  ext: string
): Promise<KeptBackground> {
  await mkdir(dir(), { recursive: true })

  const tail = ` ${imageMark(data)}${ext}`

  const already = (await readdir(dir()).catch(() => [] as string[])).find((file) =>
    file.toLowerCase().endsWith(tail)
  )
  if (already) return { background: imageBackground(already), existed: true }

  const safe = name.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || t('bg.fromDeck')
  const file = `${safe}${tail}`
  await writeFile(join(dir(), file), data)
  return { background: imageBackground(file), existed: false }
}

const THUMB_W = 24
const THUMB_H = 14

function imageMark(data: Uint8Array): string {
  try {
    const small = nativeImage
      .createFromBuffer(Buffer.from(data))
      .resize({ width: THUMB_W, height: THUMB_H, quality: 'good' })
      .toBitmap()

    if (small.length > 0) {
      return createHash('sha1').update(small).digest('hex').slice(0, 8)
    }
  } catch (error) {
    console.error('[Фоны] Не удалось уменьшить картинку для сравнения:', error)
  }

  return createHash('sha1').update(data).digest('hex').slice(0, 8)
}

const imageBackground = (file: string): Background => ({
  kind: 'image',
  src: urlFor(file),
  fit: 'cover'
})

function uniqueTarget(name: string): string {
  const ext = extname(name)
  const base = basename(name, ext)
  let candidate = join(dir(), name)
  let i = 2
  while (existsSync(candidate)) {
    candidate = join(dir(), `${base} (${i++})${ext}`)
  }
  return candidate
}

export async function removeBackground(id: string): Promise<BackgroundItem[]> {
  if (id.startsWith('user:')) {
    const file = join(dir(), basename(id.slice('user:'.length)))
    await rm(file, { force: true })
  }

  if (id.startsWith('fill:')) {
    const left = (await readFills()).filter((one) => one.id !== id)
    await writeFile(fillsFile(), JSON.stringify(left, null, 2), 'utf8')
  }

  return listUserBackgrounds()
}
