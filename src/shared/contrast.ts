import { luminance } from './backgrounds'

export interface Patch {

  mean: number

  darkest: number

  lightest: number
}

export const contrastOf = (a: number, b: number): number =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

export const NEEDED = 4.5

export function readability(color: string, patch: Patch): number {
  const front = luminance(color)
  return Math.min(contrastOf(front, patch.darkest), contrastOf(front, patch.lightest))
}

export function apartness(one: string, two: string): number {
  const a = rgb(one)
  const b = rgb(two)
  if (!a || !b) return 1

  const far = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

  return Math.min(1, far / 441)
}

const APART = 0.25

export function bestKaraokeColor(
  patch: Patch,
  baseColor: string,
  palette: string[]
): string | null {
  if (palette.length === 0) return null

  const scored = palette.map((color) => ({
    color,
    onBack: readability(color, patch),
    fromBase: apartness(color, baseColor)
  }))

  const readable = scored.filter((one) => one.onBack >= NEEDED)
  const pool = readable.length > 0 ? readable : scored
  const apart = pool.filter((one) => one.fromBase >= APART)

  return (apart.length > 0 ? apart : pool).reduce((best, one) =>
    one.onBack > best.onBack ? one : best
  ).color
}

export function bestKaraokeColors(
  whole: Patch,
  lines: Patch[],
  baseColor: string,
  palette: string[]
): string[] {
  const common = bestKaraokeColor(whole, baseColor, palette)
  if (!common) return []

  return lines.map((line) =>
    readability(common, line) >= NEEDED
      ? common
      : (bestKaraokeColor(line, baseColor, palette) ?? common)
  )
}

function rgb(hex: string): [number, number, number] | null {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return null
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
