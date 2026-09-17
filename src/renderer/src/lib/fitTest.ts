import type { SlideBlock, SlideStyle } from '@shared/types'
import { DEFAULT_ASPECT, type FitTest } from '@shared/slide'

const REF_WIDTH = 1920

let box: HTMLDivElement | null = null

function measurer(): HTMLDivElement {
  if (box) return box

  const host = document.createElement('div')

  host.setAttribute('aria-hidden', 'true')
  host.style.cssText =
    'position:fixed;left:-99999px;top:0;pointer-events:none;contain:layout size style'

  const text = document.createElement('div')
  text.className = 'slide__text'

  text.style.animation = 'none'
  host.appendChild(text)
  document.body.appendChild(host)

  box = text
  return text
}

export interface FitOptions {
  style: SlideStyle
  aspect?: number

  secondaryFor?: (verse: number) => string | undefined
}

export function domFitTest({
  style,
  aspect = DEFAULT_ASPECT,
  secondaryFor
}: FitOptions): FitTest {
  const boxW = REF_WIDTH
  const boxH = REF_WIDTH / aspect

  const pad = (style.paddingPct / 100) * boxW
  const refPx = (boxH * style.fontSizeVh * style.referenceScale) / 100
  const reserve = style.showReference ? refPx * 1.5 : 0

  const availW = boxW - pad * 2
  const availH = boxH - pad * 2 - reserve
  const fontPx = (boxH * style.minFontSizeVh) / 100

  const el = measurer()

  return (blocks: SlideBlock[]): boolean => {
    if (blocks.length === 0) return true

    el.style.width = `${availW}px`
    el.style.maxHeight = 'none'
    el.style.fontFamily = style.fontFamily
    el.style.fontSize = `${fontPx}px`
    el.style.fontWeight = style.bold ? '700' : '400'
    el.style.lineHeight = String(style.lineHeight)
    el.style.textAlign = style.align
    el.style.textTransform = style.uppercase ? 'uppercase' : 'none'
    el.innerHTML = markup(blocks, style, secondaryFor)

    return el.scrollHeight <= availH + 1
  }
}

function markup(
  blocks: SlideBlock[],
  style: SlideStyle,
  secondaryFor?: (verse: number) => string | undefined
): string {
  const divider = style.dividers ? '<div class="slide__divider"></div>' : ''

  const paragraphs = blocks
    .map((b) => {
      const number =
        style.showVerseNumbers && b.verse !== undefined
          ? `<span class="slide__vn">${b.verse}. </span>`
          : ''
      return `<p class="slide__block">${number}<span>${b.html}</span></p>`
    })
    .join('')

  let secondary = ''
  if (secondaryFor) {
    const rows = blocks
      .flatMap((b) => (b.verse === undefined ? [] : [secondaryFor(b.verse)]))
      .filter((html): html is string => Boolean(html))
      .map((html) => `<p class="slide__block"><span>${html}</span></p>`)
      .join('')
    if (rows) secondary = `${divider}<div class="slide__secondary">${rows}</div>`
  }

  return `${divider}${paragraphs}${secondary}${divider}`
}
