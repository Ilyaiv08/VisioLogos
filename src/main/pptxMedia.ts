import { unzipSync } from 'fflate'
import type { Background } from '@shared/types'
import { backgroundFromXml } from '@shared/pptxTheme'

export interface PptxImage {
  data: Uint8Array
  ext: string
}

const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif']

const SMALLEST = 12_000

export type PptxBack =
  | { kind: 'image'; image: PptxImage }
  | { kind: 'fill'; background: Background }

export function pptxBackgrounds(buf: Buffer): PptxBack[] {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(new Uint8Array(buf))
  } catch {
    return []
  }

  const found: PptxBack[] = []
  const image = pictureBackground(files)
  if (image) found.push({ kind: 'image', image })

  const seen = new Set<string>()
  for (const background of themeBackgrounds(files)) {
    const key = JSON.stringify(background)
    if (seen.has(key)) continue
    seen.add(key)
    found.push({ kind: 'fill', background })
  }

  return found
}

function themeBackgrounds(files: Record<string, Uint8Array>): Background[] {
  const text = (name: string): string | null =>
    files[name] ? new TextDecoder('utf-8').decode(files[name]) : null

  const slides = Object.keys(files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => slideNumber(a) - slideNumber(b))

  const out: Background[] = []
  for (const name of slides) {
    const layout = linked(files, name, 'slideLayout')
    const master = layout ? linked(files, layout, 'slideMaster') : null
    const theme = master ? linked(files, master, 'theme') : null

    const background = backgroundFromXml({
      slide: text(name),
      layout: layout ? text(layout) : null,
      master: master ? text(master) : null,
      theme: theme ? text(theme) : null
    })
    if (background) out.push(background)
  }

  return out
}

const slideNumber = (name: string): number => Number(name.match(/(\d+)\.xml$/)?.[1] ?? 0)

function linked(
  files: Record<string, Uint8Array>,
  from: string,
  what: string
): string | null {
  const at = from.lastIndexOf('/')
  const rels = `${from.slice(0, at)}/_rels/${from.slice(at + 1)}.rels`
  if (!files[rels]) return null

  const xml = new TextDecoder('utf-8').decode(files[rels])
  const target = xml.match(new RegExp(`Target="([^"]*${what}[^"]*)"`))?.[1]
  if (!target) return null

  const base = from.slice(0, at).split('/')
  for (const step of target.split('/')) {
    if (step === '..') base.pop()
    else if (step !== '.') base.push(step)
  }
  const full = base.join('/')
  return files[full] ? full : null
}

function pictureBackground(files: Record<string, Uint8Array>): PptxImage | null {
  const media = Object.keys(files).filter(
    (name) => name.startsWith('ppt/media/') && IMAGE_EXT.some((ext) => name.toLowerCase().endsWith(ext))
  )
  if (media.length === 0) return null

  const uses = countUses(files)

  const best = media
    .map((name) => ({
      name,
      size: files[name].length,

      weight: uses.get(shortName(name)) ?? 0
    }))
    .filter((item) => item.size >= SMALLEST)
    .sort((a, b) => b.weight - a.weight || b.size - a.size)[0]

  if (!best || best.weight === 0) return null

  return { data: files[best.name], ext: extOf(best.name) }
}

export function pptxBackground(buf: Buffer): PptxImage | null {
  try {
    return pictureBackground(unzipSync(new Uint8Array(buf)))
  } catch {
    return null
  }
}

function countUses(files: Record<string, Uint8Array>): Map<string, number> {
  const uses = new Map<string, number>()

  for (const name of Object.keys(files)) {
    if (!name.endsWith('.rels')) continue

    const weight = name.includes('slideMaster') ? 40 : name.includes('slideLayout') ? 20 : 1
    if (weight === 1 && !name.includes('/slides/')) continue

    const xml = new TextDecoder('utf-8').decode(files[name])
    for (const [, target] of xml.matchAll(/Target="([^"]*media\/[^"]+)"/gi)) {
      const image = shortName(target)
      uses.set(image, (uses.get(image) ?? 0) + weight)
    }
  }

  return uses
}

const shortName = (path: string): string => path.slice(path.lastIndexOf('/') + 1).toLowerCase()

function extOf(name: string): string {
  const at = name.lastIndexOf('.')
  const ext = at >= 0 ? name.slice(at).toLowerCase() : '.png'
  return ext === '.jpeg' ? '.jpg' : ext
}
