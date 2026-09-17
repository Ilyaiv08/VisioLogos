import type { FreeLine, SlideBlock, SlideStyle } from './types'
import { escapeHtml, splitBySentences, toPlain } from './text'

export const ptOfVh = (vh: number): number => Math.round(vh * 8.1)
export const vhOfPt = (pt: number): number => pt / 8.1

export const TEXT_SIZES = [
  20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 88, 96, 108, 120
]

export const MAX_FONT_VH = 15

export const DEFAULT_STYLE: SlideStyle = {
  fontFamily: "'Onest Variable', 'Segoe UI', sans-serif",
  fontSizeVh: 7,
  minFontSizeVh: 3.6,

  fitToScreen: true,
  maxFontSizeVh: MAX_FONT_VH,
  color: '#ffffff',
  align: 'center',
  shadow: true,
  bold: true,
  uppercase: false,
  lineHeight: 1.25,
  paddingPct: 6,
  showReference: true,
  referenceScale: 0.62,
  referenceFormat: 'full',
  showVerseNumbers: true,
  dividers: true
}

export function freeBlocks(lines: FreeLine[]): SlideBlock[] {
  return lines
    .filter((line) => line.clock || line.text.trim())
    .map((line) => ({
      html: line.clock ? '' : escapeHtml(line.text),
      scale: line.scale,
      clock: line.clock
    }))
}

export const DEFAULT_ASPECT = 16 / 9

export function estimateCapacity(
  style: SlideStyle,
  fontSizeVh: number,
  aspect = DEFAULT_ASPECT
): number {
  const inner = 1 - (style.paddingPct * 2) / 100
  const widthVh = 100 * aspect * inner
  const heightVh = 100 * inner

  const charsPerLine = widthVh / (fontSizeVh * 0.5)
  const lines = heightVh / (fontSizeVh * style.lineHeight)

  return Math.max(1, Math.floor(charsPerLine * lines * 0.88))
}

export interface PlannedSlide {

  blocks: SlideBlock[]

  verses: number[]
}

export interface PlanInput {
  n: number
  html: string
}

export type FitTest = (blocks: SlideBlock[]) => boolean

export function estimateFit(style: SlideStyle, aspect = DEFAULT_ASPECT): FitTest {
  const budget = estimateCapacity(style, style.minFontSizeVh, aspect)
  return (blocks) =>
    blocks.reduce((sum, b) => sum + toPlain(b.html).length, 0) + blocks.length - 1 <= budget
}

export function planSlides(
  verses: PlanInput[],
  style: SlideStyle,
  fits: FitTest = estimateFit(style)
): PlannedSlide[] {
  const slides: PlannedSlide[] = []
  let blocks: SlideBlock[] = []
  let nums: number[] = []

  const flush = (): void => {
    if (blocks.length) slides.push({ blocks, verses: nums })
    blocks = []
    nums = []
  }

  for (const verse of verses) {
    const block: SlideBlock = { html: verse.html, verse: verse.n }

    if (fits([...blocks, block])) {
      blocks.push(block)
      nums.push(verse.n)
      continue
    }

    flush()

    if (fits([block])) {
      blocks = [block]
      nums = [verse.n]
      continue
    }

    for (const part of splitOversized(block, fits)) {
      slides.push({ blocks: [part], verses: [verse.n] })
    }
  }
  flush()

  return slides
}

function splitOversized(block: SlideBlock, fits: FitTest): SlideBlock[] {
  for (let parts = 2; parts <= 12; parts++) {
    const pieces = splitBySentences(block.html, parts).map((html, i) => ({
      html,
      verse: i === 0 ? block.verse : undefined
    }))
    if (pieces.length > 1 && pieces.every((piece) => fits([piece]))) return pieces
  }

  return [block]
}

export const KARAOKE_LOOK = { color: '#6ec1ff', ms: 350 }

export const KARAOKE_LIGHT = [
  '#6ec1ff',
  '#4a9eff',
  '#5fe3c0',
  '#7ee787',
  '#ffe08a',
  '#ffb15a',
  '#ff8fb1',
  '#ffffff'
]

export const KARAOKE_DARK = [
  '#1d4ed8',
  '#0b6e5a',
  '#14602a',
  '#8a5a00',
  '#9a3412',
  '#9d174d',
  '#5b21b6',
  '#111111'
]

export const KARAOKE_COLORS = [...KARAOKE_LIGHT, ...KARAOKE_DARK]
