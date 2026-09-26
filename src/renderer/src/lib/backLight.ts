import type { Background } from '@shared/types'
import { flatLuminance } from '@shared/backgrounds'

const GRID_W = 64
const GRID_H = 36

interface Area {
  x0: number
  y0: number
  x1: number
  y1: number
}

const WHOLE: Area = { x0: 0, y0: 0, x1: 1, y1: 1 }

export async function brightnessOf(bg: Background): Promise<number | null> {
  const flat = flatLuminance(bg)
  if (flat !== null) return flat

  const cells = await cellsOf(bg, WHOLE)
  if (!cells) return null
  return cells.reduce((sum, one) => sum + one, 0) / cells.length
}

let kept: { src: string; ctx: CanvasRenderingContext2D } | null = null

async function cellsOf(bg: Background, area: Area): Promise<number[] | null> {
  try {
    const ctx = await grid(bg)
    if (!ctx) return null

    const x0 = Math.min(GRID_W - 1, Math.max(0, Math.round(area.x0 * GRID_W)))
    const y0 = Math.min(GRID_H - 1, Math.max(0, Math.round(area.y0 * GRID_H)))
    const width = Math.max(1, Math.round(area.x1 * GRID_W) - x0)
    const height = Math.max(1, Math.round(area.y1 * GRID_H) - y0)

    const { data } = ctx.getImageData(
      x0,
      y0,
      Math.min(width, GRID_W - x0),
      Math.min(height, GRID_H - y0)
    )
    const cells: number[] = []
    for (let i = 0; i < data.length; i += 4) {
      cells.push(
        0.2126 * channel(data[i]) + 0.7152 * channel(data[i + 1]) + 0.0722 * channel(data[i + 2])
      )
    }
    return cells
  } catch {
    return null
  }
}

async function grid(bg: Background): Promise<CanvasRenderingContext2D | null> {
  const src = bg.kind === 'image' || bg.kind === 'video' ? bg.src : null
  if (!src) return null
  if (kept && kept.src === src) return kept.ctx

  const source = bg.kind === 'image' ? await loadImage(src) : await loadVideoFrame(src)

  const canvas = document.createElement('canvas')
  canvas.width = GRID_W
  canvas.height = GRID_H

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(source, 0, 0, GRID_W, GRID_H)

  kept = { src, ctx }
  return ctx
}

const channel = (v: number): number => {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = src
  await img.decode()
  return img
}

async function loadVideoFrame(src: string): Promise<HTMLVideoElement> {
  const video = document.createElement('video')
  video.crossOrigin = 'anonymous'
  video.muted = true
  video.preload = 'auto'
  video.src = src

  await once(video, 'loadedmetadata')
  video.currentTime = Math.min(1, (video.duration || 2) / 2)
  await once(video, 'seeked')
  return video
}

function once(video: HTMLVideoElement, event: string): Promise<void> {
  return new Promise((done, fail) => {
    const timer = setTimeout(() => fail(new Error('долго')), 3000)
    const off = (): void => {
      clearTimeout(timer)
      video.removeEventListener(event, ok)
      video.removeEventListener('error', bad)
    }
    const ok = (): void => {
      off()
      done()
    }
    const bad = (): void => {
      off()
      fail(new Error('не открылось'))
    }
    video.addEventListener(event, ok, { once: true })
    video.addEventListener('error', bad, { once: true })
  })
}
