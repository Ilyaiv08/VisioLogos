import type { BackgroundItem } from './types'
import { t, type Key } from './i18n'

const dark = (id: string, css: string): BackgroundItem => ({
  id,
  name: '',
  nameKey: `bg.${id}`,
  builtin: true,
  tone: 'dark',
  background: { kind: 'gradient', css }
})

const light = (id: string, css: string): BackgroundItem => ({
  id,
  name: '',
  nameKey: `bg.${id}`,
  builtin: true,
  tone: 'light',
  background: { kind: 'gradient', css }
})

const flat = (id: string, color: string, tone: 'dark' | 'light'): BackgroundItem => ({
  id,
  name: '',
  nameKey: `bg.${id}`,
  builtin: true,
  tone,
  background: { kind: 'color', color }
})

export const backgroundName = (item: BackgroundItem): string =>
  item.nameKey ? t(item.nameKey as Key) : item.name

const vignette = 'radial-gradient(120% 90% at 50% 45%, rgba(0,0,0,0) 40%, rgba(0,0,0,.55) 100%)'

const softVignette =
  'radial-gradient(120% 90% at 50% 45%, rgba(255,255,255,.5) 35%, rgba(88,104,130,.14) 100%)'

const noise = (
  size: number,
  frequency: number,
  octaves: number,
  seed: number,
  alphaRow: string
): string =>
  `%3Csvg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'%3E` +
  `%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='${frequency}' ` +
  `numOctaves='${octaves}' seed='${seed}' stitchTiles='stitch'/%3E` +
  `%3CfeColorMatrix type='matrix' values='0 0 0 0 .44 0 0 0 0 .35 0 0 0 0 .19 ${alphaRow}'/%3E` +
  `%3C/filter%3E%3Crect width='${size}' height='${size}' filter='url(%23n)'/%3E%3C/svg%3E`

const grain = `url("data:image/svg+xml,${noise(600, 0.85, 2, 3, '.13 .1 .04 0 -.08')}") repeat`

const blots = (seed: number, alphaRow: string): string =>
  `url("data:image/svg+xml,${noise(800, 0.006, 4, seed, alphaRow)}") center / cover no-repeat`

const edges = (alpha: number): string =>
  `linear-gradient(90deg, rgba(92,70,38,${alpha}) 0%, rgba(92,70,38,${alpha * 0.18}) 8%, ` +
  `rgba(92,70,38,0) 20%, rgba(92,70,38,0) 80%, rgba(92,70,38,${alpha * 0.18}) 92%, ` +
  `rgba(92,70,38,${alpha}) 100%)`

export const BUILTIN_BACKGROUNDS: BackgroundItem[] = [
  dark(
    'night',
    `${vignette}, linear-gradient(160deg, #16233f 0%, #0a1020 55%, #070b16 100%)`
  ),
  dark(
    'deep',
    `${vignette}, linear-gradient(160deg, #123040 0%, #071820 60%, #04101a 100%)`
  ),
  dark(
    'coal',
    `${vignette}, linear-gradient(180deg, #23262b 0%, #121417 60%, #0a0b0d 100%)`
  ),
  dark(
    'wine',
    `${vignette}, linear-gradient(160deg, #43121f 0%, #250a12 60%, #14060a 100%)`
  ),
  dark(
    'forest',
    `${vignette}, linear-gradient(160deg, #1b3320 0%, #0e1c12 60%, #07100a 100%)`
  ),
  dark(
    'dawn',
    `${vignette}, linear-gradient(160deg, #4a2a12 0%, #26150b 60%, #130a05 100%)`
  ),
  dark(
    'purple',
    `${vignette}, linear-gradient(160deg, #2e1a45 0%, #180d26 60%, #0d0715 100%)`
  ),
  dark(
    'steel',
    `${vignette}, linear-gradient(160deg, #2a3440 0%, #161d25 60%, #0c1016 100%)`
  ),
  dark(
    'wheat',
    `${vignette}, linear-gradient(160deg, #3d3316 0%, #201b0c 60%, #110e06 100%)`
  ),
  dark(
    'rays',
    `${vignette}, conic-gradient(from 210deg at 50% 120%, rgba(255,214,150,.16), rgba(0,0,0,0) 25%, rgba(255,214,150,.10) 50%, rgba(0,0,0,0) 75%), linear-gradient(180deg, #101a2c 0%, #070b14 100%)`
  ),
  dark(
    'glow',
    `radial-gradient(70% 55% at 50% 35%, rgba(120,170,255,.22) 0%, rgba(0,0,0,0) 70%), linear-gradient(180deg, #0d1220 0%, #05070d 100%)`
  ),
  flat('black', '#000000', 'dark'),

  flat('white', '#ffffff', 'light'),
  light(
    'paper',
    `${grain}, ${blots(11, '.18 .12 .04 0 -.14')}, ${edges(0.3)}, ` +
      'linear-gradient(160deg, #f2e8d2 0%, #e9dcbe 100%)'
  ),
  light(
    'parchment',
    `${grain}, ${blots(23, '.3 .2 .06 0 -.2')}, ${edges(0.44)}, ` +
      'linear-gradient(160deg, #ebdeb9 0%, #ddcb9f 100%)'
  ),
  light(
    'haze', `${softVignette}, linear-gradient(160deg, #f8f9fb 0%, #e4e8ef 100%)`),
  light(
    'sky', `${softVignette}, linear-gradient(160deg, #edf4ff 0%, #d3e2f6 100%)`),
  light(
    'mint', `${softVignette}, linear-gradient(160deg, #eef7f2 0%, #d5e8dd 100%)`)
]

export const DEFAULT_BACKGROUND = BUILTIN_BACKGROUNDS[0].background

export function backgroundCss(bg: BackgroundItem['background']): string {
  if (bg.kind === 'color') return bg.color
  if (bg.kind === 'gradient') return bg.css

  if (bg.kind === 'image') {
    return bg.fit === 'contain'
      ? `#000 center / contain no-repeat url("${bg.src}")`
      : `center / cover no-repeat url("${bg.src}")`
  }
  return '#000'
}

export function readableTextColor(bg: BackgroundItem['background']): string | null {
  const avg = flatLuminance(bg)
  return avg === null ? null : colorForLuminance(avg)
}

export const colorForLuminance = (back: number): string =>
  back > 0.45 ? '#111111' : '#ffffff'

export function readableOn(color: string, back: number): boolean {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return true

  const front = luminance(color)
  return (Math.max(front, back) + 0.05) / (Math.min(front, back) + 0.05) >= 4.5
}

export function flatLuminance(bg: BackgroundItem['background']): number | null {
  const colors =
    bg.kind === 'color'
      ? [bg.color]
      : bg.kind === 'gradient'
        ? [...bg.css.matchAll(/#([0-9a-f]{6})\b/gi)].map((m) => `#${m[1]}`)
        : []

  if (colors.length === 0) return null
  return colors.reduce((sum, c) => sum + luminance(c), 0) / colors.length
}

export function readableStyleOn<T extends { color: string }>(
  style: T,
  background: BackgroundItem['background'] | null
): T {
  if (!background) return style

  const back = flatLuminance(background)
  if (back === null || readableOn(style.color, back)) return style

  return { ...style, color: colorForLuminance(back) }
}

export const textShadowCss = (color: string): string =>
  lightText(color) ? '0 0.06em 0.14em rgba(0,0,0,.85)' : '0 0.06em 0.14em rgba(255,255,255,.9)'

export const shadowHex = (color: string): string => (lightText(color) ? '000000' : 'FFFFFF')

const lightText = (color: string): boolean =>
  !/^#[0-9a-f]{6}$/i.test(color) || luminance(color) > 0.45

export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const channel = (v: number): number => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  )
}
