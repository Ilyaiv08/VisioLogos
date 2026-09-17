import { app, BrowserWindow, dialog, nativeImage, type NativeImage } from 'electron'
import { execFile } from 'node:child_process'
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import type { Deck } from '@shared/types'
import { expandFiles } from './dropped'
import {
  DECK_EXTENSIONS,
  IMAGE_EXTENSIONS,
  bareName,
  isDeckFile,
  nameOf,
  photoGroups
} from '@shared/drop'
import { t } from '@shared/i18n'
import { jsonFile } from './jsonFile'
import { pdfPageCount } from './pdf'

const run = promisify(execFile)

const WIDTH = 1920
const HEIGHT = 1080

interface DecksFile {
  items: Deck[]
}

const store = jsonFile<DecksFile>(
  () => join(app.getPath('userData'), 'decks.json'),
  () => ({ items: [] })
)

export const flushDecks = store.flush

const decksDir = (): string => join(app.getPath('userData'), 'decks')

export async function listDecks(): Promise<Deck[]> {
  const { items } = await store.read()
  return items
}

export const deckFile = (id: string, name: string): string => join(decksDir(), id, name)

export interface DeckImport {
  decks: Deck[]
  added: Deck[]
  skipped: { file: string; reason: string }[]
}

export type PickWhat = 'decks' | 'photos' | 'folder'

export async function importDecks(
  parent: BrowserWindow | null,
  what: PickWhat = 'decks'
): Promise<DeckImport> {
  const picked = await dialog.showOpenDialog(parent ?? undefined!, pickOptions(what))
  if (picked.canceled || picked.filePaths.length === 0) {
    return { decks: await listDecks(), added: [], skipped: [] }
  }

  return addDeckFiles(picked.filePaths)
}

function pickOptions(what: PickWhat): Electron.OpenDialogOptions {
  if (what === 'folder') {
    return {
      title: t('main.pickFolder'),

      properties: ['openDirectory']
    }
  }

  if (what === 'photos') {
    return {
      title: t('main.pickPhotos'),
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: t('main.photosFilter'), extensions: [...IMAGE_EXTENSIONS] },
        { name: t('main.allFiles'), extensions: ['*'] }
      ]
    }
  }

  return {
    title: t('main.pickDecks'),
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: t('main.decksFilter'), extensions: [...DECK_EXTENSIONS] },
      { name: t('main.allFiles'), extensions: ['*'] }
    ]
  }
}

export async function addDeckFiles(files: string[]): Promise<DeckImport> {
  const saved = await store.read()
  const added: Deck[] = []
  const skipped: { file: string; reason: string }[] = []

  const paths = await expandFiles(files)

  for (const path of paths.filter(isDeckFile)) {
    const name = nameOf(path)
    try {
      const deck = await renderDeck(path, name)
      if (deck.slides.length === 0) {
        skipped.push({ file: name, reason: t('main.noSlides') })
        continue
      }
      saved.items.unshift(deck)
      added.push(deck)
    } catch (error) {
      skipped.push({ file: name, reason: reasonOf(error) })
    }
  }

  for (const group of photoGroups(paths)) {
    try {
      const deck = await photoDeck(group.files, group.name)
      if (deck.slides.length === 0) {
        skipped.push({ file: group.name, reason: t('main.noPhotos') })
        continue
      }
      saved.items.unshift(deck)
      added.push(deck)
    } catch (error) {
      skipped.push({ file: group.name, reason: reasonOf(error) })
    }
  }

  if (added.length > 0) await store.write(saved)
  return { decks: saved.items, added, skipped }
}

function reasonOf(error: unknown): string {
  const text = String((error as { stderr?: string })?.stderr ?? '') ||
    (error instanceof Error ? error.message : String(error))

  const errors = [...text.matchAll(/<S S="Error">([\s\S]*?)<\/S>/g)]
    .map((m) => m[1])
    .join(' ')

  const clean = (errors || text)
    .replace(/<[^>]*>/g, ' ')
    .replace(/_x000D__x000A_|_x000D_|_x000A_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (/80040154|не зарегистрирован|not registered|не удается создать|cannot create/i.test(clean)) {
    return t('main.noPowerPoint')
  }
  return clean.slice(0, 160) || t('main.cantOpen')
}

const newDeckId = (): string =>
  `deck-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

async function renderDeck(path: string, name: string): Promise<Deck> {
  const id = newDeckId()
  const dir = join(decksDir(), id)
  await mkdir(dir, { recursive: true })

  let slides: string[] = []
  try {
    slides = path.toLowerCase().endsWith('.pdf')
      ? await renderPdf(path, dir)
      : await renderPowerPoint(path, dir)
  } finally {

    if (slides.length === 0) await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }

  return {
    id,
    name: bareName(name),
    source: name,
    kind: 'slides',
    slides,
    file: slides.length > 0 ? await keepSource(path, dir) : undefined,
    createdAt: Date.now()
  }
}

async function keepSource(path: string, dir: string): Promise<string | undefined> {
  const name = `source${extname(path).toLowerCase()}`
  try {
    await copyFile(path, join(dir, name))
    return name
  } catch (error) {
    console.error('[Показ] Не удалось сохранить исходный файл:', path, error)
    return undefined
  }
}

async function photoDeck(files: string[], name: string): Promise<Deck> {
  const id = newDeckId()
  const dir = join(decksDir(), id)
  await mkdir(dir, { recursive: true })

  const slides: string[] = []
  try {
    for (const path of files) {
      const slide = await placePhoto(path, dir, slides.length + 1)
      if (slide) slides.push(slide)
    }
  } finally {
    if (slides.length === 0) await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }

  return {
    id,
    name,
    source: files.length === 1 ? nameOf(files[0]) : name,
    kind: 'photos',
    slides,
    createdAt: Date.now()
  }
}

async function placePhoto(path: string, dir: string, at: number): Promise<string | null> {
  const no = String(at).padStart(3, '0')
  const ext = extname(path).toLowerCase()

  try {
    const image = ext === '.gif' ? null : nativeImage.createFromPath(path)
    const size = image?.getSize()

    if (image && size && (size.width > WIDTH || size.height > HEIGHT)) {
      const scale = Math.min(WIDTH / size.width, HEIGHT / size.height)
      const small = image.resize({
        width: Math.round(size.width * scale),
        height: Math.round(size.height * scale),
        quality: 'good'
      })

      const clear = ext === '.png' || ext === '.webp' || ext === '.avif'
      const name = clear ? `${no}.png` : `${no}.jpg`
      await writeFile(join(dir, name), clear ? small.toPNG() : small.toJPEG(90))
      return name
    }

    const name = `${no}${ext || '.jpg'}`
    await copyFile(path, join(dir, name))
    return name
  } catch (error) {
    console.error('[Фото] Не удалось положить снимок:', path, error)
    return null
  }
}

export async function sweepDecks(): Promise<void> {
  const known = new Set((await listDecks()).map((d) => d.id))
  const dirs = await readdir(decksDir()).catch(() => [] as string[])

  for (const dir of dirs) {
    if (!known.has(dir)) await rm(join(decksDir(), dir), { recursive: true, force: true }).catch(() => undefined)
  }
}

export async function deleteDeck(id: string): Promise<Deck[]> {
  const file = await store.read()
  file.items = file.items.filter((d) => d.id !== id)
  await store.write(file)
  return file.items
}

export async function restoreDeck(deck: Deck): Promise<Deck[]> {
  const file = await store.read()

  if (!file.items.some((d) => d.id === deck.id)) {
    const at = file.items.findIndex((d) => d.createdAt < deck.createdAt)
    file.items.splice(at < 0 ? file.items.length : at, 0, deck)
    await store.write(file)
  }

  return file.items
}

async function renderPowerPoint(path: string, dir: string): Promise<string[]> {
  const stage = join(tmpdir(), `visiologos-pp-${Date.now().toString(36)}`)
  await mkdir(stage, { recursive: true })

  try {
    return await exportSlides(path, stage, dir)
  } finally {
    await rm(stage, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function exportSlides(path: string, stage: string, dir: string): Promise<string[]> {
  const script = `
$ErrorActionPreference = 'Stop'
$app = New-Object -ComObject PowerPoint.Application
$busy = $app.Presentations.Count -gt 0
try {
  $pres = $app.Presentations.Open('${quote(path)}', $true, $false, $false)
  try {
    $count = $pres.Slides.Count

    $w = $pres.PageSetup.SlideWidth
    $h = $pres.PageSetup.SlideHeight
    $width = ${WIDTH}
    $height = ${HEIGHT}
    if ($w -gt 0 -and $h -gt 0) {
      $height = [int][Math]::Round($width * $h / $w)
      if ($height -gt ${HEIGHT}) {
        $height = ${HEIGHT}
        $width = [int][Math]::Round($height * $w / $h)
      }
    }

    for ($i = 1; $i -le $count; $i++) {
      $name = '{0:d3}.png' -f $i
      $pres.Slides.Item($i).Export((Join-Path '${quote(stage)}' $name), 'PNG', $width, $height)
    }
    Write-Output $count
  } finally { $pres.Close() }
} finally { if (-not $busy) { $app.Quit() } }
`

  await run(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', encode(script)],
    { windowsHide: true, timeout: 180_000, maxBuffer: 1 << 20 }
  )

  const files = (await readdir(stage)).filter((f) => f.endsWith('.png')).sort()
  for (const file of files) await copyFile(join(stage, file), join(dir, file))
  return files
}

const quote = (text: string): string => text.replace(/'/g, "''")

const encode = (script: string): string => Buffer.from(script, 'utf16le').toString('base64')

async function renderPdf(path: string, dir: string): Promise<string[]> {
  const pages = pdfPageCount(await readFile(path))
  if (pages === 0) return []

  const window = new BrowserWindow({
    show: false,
    width: WIDTH / 2,
    height: HEIGHT / 2,
    useContentSize: true,
    webPreferences: { plugins: true, offscreen: true }
  })

  const names: string[] = []

  const seen = new Set<string>()

  try {
    const url = pathToFileURL(path).href
    for (let page = 1; page <= pages; page++) {

      await open(window, 'about:blank')
      await open(window, `${url}#toolbar=0&navpanes=0&view=Fit&page=${page}`)

      const shot = await settled(window)
      if (!shot) continue

      const name = `${String(page).padStart(3, '0')}.png`
      await writeFile(join(dir, name), shot.toPNG())
      names.push(name)
      seen.add(fingerprint(shot))
    }
  } finally {
    window.destroy()
  }

  if (names.length > 2 && seen.size === 1) {
    throw new Error('страницы вышли одинаковыми — файл не удалось пролистать')
  }

  return names
}

async function open(window: BrowserWindow, url: string): Promise<void> {
  try {
    await window.loadURL(url)
  } catch {

  }
}

const STEP = 140

const PATIENCE = 5000

async function settled(window: BrowserWindow): Promise<NativeImage | null> {
  let previous = ''

  for (let waited = 0; waited < PATIENCE; waited += STEP) {
    await wait(STEP)

    const shot = await window.webContents.capturePage()
    if (shot.isEmpty()) continue

    const key = fingerprint(shot)

    if (key === previous && hasContent(shot)) {
      const box = pageBox(shot)
      return box ? shot.crop(box) : shot
    }
    previous = key
  }
  return null
}

function fingerprint(image: NativeImage): string {
  const data = image.toBitmap()
  let sum = 0
  let mix = 7

  for (let i = 0; i < data.length; i += 401) {
    sum += data[i]
    mix = (mix * 31 + data[i]) >>> 0
  }
  return `${data.length}:${sum}:${mix}`
}

const wait = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

function hasContent(shot: NativeImage): boolean {
  const { width, height } = shot.getSize()
  const data = shot.toBitmap()
  const back = [data[0], data[1], data[2]]

  for (let y = 4; y < height; y += Math.max(1, height >> 5)) {
    for (let x = 4; x < width; x += Math.max(1, width >> 5)) {
      const i = (y * width + x) * 4
      if (
        Math.abs(data[i] - back[0]) > 12 ||
        Math.abs(data[i + 1] - back[1]) > 12 ||
        Math.abs(data[i + 2] - back[2]) > 12
      ) {
        return true
      }
    }
  }
  return false
}

function pageBox(shot: NativeImage): { x: number; y: number; width: number; height: number } | null {
  const { width, height } = shot.getSize()
  const data = shot.toBitmap()
  if (width < 16 || height < 16) return null

  const back = [data[0], data[1], data[2]]
  const isBack = (x: number, y: number): boolean => {
    const i = (y * width + x) * 4
    return (
      Math.abs(data[i] - back[0]) < 12 &&
      Math.abs(data[i + 1] - back[1]) < 12 &&
      Math.abs(data[i + 2] - back[2]) < 12
    )
  }

  const RUN = Math.max(5, Math.round(width / 200))

  const edge = (x0: number, y0: number, dx: number, dy: number): number => {
    const along = (x: number, y: number): number => (dx !== 0 ? x : y)
    let x = x0
    let y = y0
    let last = along(x0, y0)

    while (x >= 0 && x < width && y >= 0 && y < height) {
      if (isBack(x, y)) {

        let run = 0
        let cx = x
        let cy = y
        while (run < RUN && cx >= 0 && cx < width && cy >= 0 && cy < height && isBack(cx, cy)) {
          run++
          cx += dx
          cy += dy
        }
        if (run >= RUN) break
        x = cx
        y = cy
        continue
      }
      last = along(x, y)
      x += dx
      y += dy
    }
    return last
  }

  const midX = Math.floor(width / 2)
  const midY = Math.floor(height / 2)
  const shares = [0.35, 0.45, 0.5, 0.55, 0.65]

  let left = midX
  let right = midX
  for (const share of shares) {
    const y = Math.floor(height * share)
    if (isBack(midX, y)) continue
    left = Math.min(left, edge(midX, y, -1, 0))
    right = Math.max(right, edge(midX, y, 1, 0))
  }

  let top = midY
  let bottom = midY
  for (const share of shares) {
    const x = Math.floor(width * share)
    if (isBack(x, midY)) continue
    top = Math.min(top, edge(x, midY, 0, -1))
    bottom = Math.max(bottom, edge(x, midY, 0, 1))
  }

  const box = { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
  const tooSmall = box.width < width * 0.2 || box.height < height * 0.2
  const wholeFrame = box.width >= width - 2 && box.height >= height - 2

  return tooSmall || wholeFrame ? null : box
}
