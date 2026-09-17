import type { TextItem } from './types'
import { escapeHtml } from './text'
import { listSections } from './textList'
import { lang, t } from './i18n'

export function textTitle(item: TextItem): string {
  const title = item.title.trim()
  if (title) return title

  const first = item.body
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean)

  return first ? first.slice(0, 60) : t('common.untitled')
}

export function toPlainText(item: TextItem): string {
  const head = textTitle(item)
  const body = item.kind === 'list' ? listText(item) : bodyText(item)
  const caption = item.caption.trim()

  return [head, '', body, caption && `\n${caption}`]
    .filter((part) => part !== undefined)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const bodyText = (item: TextItem): string =>
  item.body
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n\n')

function listText(item: TextItem): string {
  const sections = listSections(item.body)
  if (sections.length === 0) return ''

  return sections
    .map((section) => {
      const items = section.items.map(
        (one, i) => `${item.numbered ? `${i + 1}.` : '—'} ${one}`
      )
      return [section.heading && `${section.heading}:`, ...items].filter(Boolean).join('\n')
    })
    .join('\n\n')
}

export function textSlideLines(item: TextItem): string[][] {
  if (item.kind === 'list') {
    const perSlide = item.perSlide && item.perSlide > 0 ? item.perSlide : 6
    const slides: string[][] = []

    for (const section of listSections(item.body)) {
      const marked = section.items.map(
        (one, i) => `${item.numbered ? `${i + 1}.` : '•'} ${one}`
      )
      for (let at = 0; at < marked.length; at += perSlide) {
        const part = marked.slice(at, at + perSlide)
        slides.push(section.heading ? [`${section.heading}:`, ...part] : part)
      }
    }

    return slides.length > 0 ? slides : [[textTitle(item)]]
  }

  const parts = item.body
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)

  return parts.length > 0 ? parts.map((part) => part.split('\n')) : [[textTitle(item)]]
}

export function textsHtml(items: TextItem[]): string {
  const body = items
    .map((item) => {
      const parts =
        item.kind === 'list'
          ? listSections(item.body)
              .map(
                (section) =>
                  `<section class="part">` +
                  (section.heading ? `<h2>${xml(section.heading)}</h2>` : '') +
                  `<ul>${section.items.map((one) => `<li>${xml(one)}</li>`).join('')}</ul></section>`
              )
              .join('')
          : bodyText(item)
              .split('\n\n')
              .map((part) => `<p>${part.split('\n').map(xml).join('<br>')}</p>`)
              .join('')

      const caption = item.caption.trim()
      return (
        `<article><h1>${xml(textTitle(item))}</h1>` +
        parts +
        (caption ? `<p class="caption">${xml(caption)}</p>` : '') +
        '</article>'
      )
    })
    .join('')

  return `<!doctype html>
<html lang="${lang()}"><head><meta charset="utf-8"><title>${xml(t('main.printTexts'))}</title>
<style>
  body { font: 12pt/1.5 Georgia, 'Times New Roman', serif; color: #111; margin: 0 }
  article { page-break-after: always }
  article:last-child { page-break-after: auto }
  h1 { font-size: 19pt; margin: 0 0 10pt }
  h2 { font-size: 10pt; letter-spacing: .09em; text-transform: uppercase; color: #666;
       margin: 0 0 4pt; font-weight: 600 }
  .part { page-break-inside: avoid; margin-bottom: 16pt }
  ul { margin: 0; padding-left: 18pt }
  li { margin-bottom: 4pt }
  p { margin: 0 0 10pt }
  .caption { margin-top: 14pt; font-size: 10pt; color: #555 }
</style></head><body>${body}</body></html>`
}

const xml = (text: string): string => escapeHtml(text)
