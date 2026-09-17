import type { SlideBlock } from './types'
import { escapeHtml } from './text'
import { t } from './i18n'

export const defaultHeadings = (): string[] => [t('list.thanks'), t('list.needs')]

export const MAX_ITEMS = 6

export interface ListSection {
  heading: string
  items: string[]
}

export interface RawSection {
  heading: string
  text: string
}

export function listSections(body: string): ListSection[] {
  const sections: ListSection[] = []

  for (const raw of body.split('\n')) {
    const line = raw.trim()
    if (!line) continue

    if (line.endsWith(':') && line.length <= 40) {
      sections.push({ heading: line.slice(0, -1).trim(), items: [] })
      continue
    }

    const item = line.replace(/^\s*(?:[-–—•*]|\d{1,2}[.)])\s+/, '').trim()
    if (!item) continue

    if (sections.length === 0) sections.push({ heading: '', items: [] })
    sections[sections.length - 1].items.push(item)
  }

  return sections
}

export const countItems = (body: string): number =>
  listSections(body).reduce((sum, section) => sum + section.items.length, 0)

export function rawSections(body: string): RawSection[] {
  const parts: RawSection[] = listSections(body).map((section) => ({
    heading: section.heading,
    text: section.items.join('\n')
  }))

  const spare = defaultHeadings().filter((h) => !parts.some((p) => p.heading === h))
  while (parts.length < 2) parts.push({ heading: spare.shift() ?? '', text: '' })

  return parts
}

export function writeSections(parts: RawSection[]): string {
  return parts
    .filter((part) => part.text.trim() || part.heading.trim())
    .map((part) => (part.heading.trim() ? `${part.heading.trim()}:\n${part.text}` : part.text))
    .join('\n\n')
}

export function listTitle(body: string): string {
  const headings = listSections(body)
    .filter((section) => section.items.length > 0)
    .map((section) => section.heading.trim())
    .filter(Boolean)

  return headings
    .map((heading, i) => (i === 0 ? heading : heading.toLowerCase()))
    .join(' и ')
}

export function packItems(
  items: string[],
  fits: (items: string[]) => boolean,
  limit: number
): string[][] {
  return balance(greedy(items, fits, limit), fits)
}

function greedy(
  items: string[],
  fits: (items: string[]) => boolean,
  limit: number
): string[][] {
  const slides: string[][] = []
  let current: string[] = []

  for (const item of items) {
    const next = [...current, item]

    if (current.length > 0 && (next.length > limit || !fits(next))) {
      slides.push(current)
      current = [item]
    } else {
      current = next
    }
  }
  if (current.length > 0) slides.push(current)

  return slides
}

function balance(slides: string[][], fits: (items: string[]) => boolean): string[][] {
  if (slides.length < 2) return slides

  const items = slides.flat()
  const per = Math.ceil(items.length / slides.length)

  const even: string[][] = []
  for (let at = 0; at < items.length; at += per) even.push(items.slice(at, at + per))

  if (even.length !== slides.length || !even.every(fits)) return slides
  return even
}

export function listBlocks(
  heading: string,
  items: string[],
  numbered: boolean,
  startAt: number
): SlideBlock[] {
  const blocks: SlideBlock[] = []

  const head = heading.trim()
  if (head) blocks.push({ html: `<span class="slide__lead">${escapeHtml(head)}</span>` })

  items.forEach((item, i) => {
    const marker = numbered ? `${startAt + i + 1}.` : '•'
    blocks.push({
      html:
        `<span class="slide__item"><span class="slide__marker">${marker}</span>` +
        `${escapeHtml(item)}</span>`
    })
  })

  return blocks
}
