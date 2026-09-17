import { headingFromLabel } from './songHeadings'

export interface TitleBlock {
  title: string
  author: string

  rest: string[][]
}

const AUTHOR = /перевод|музык|слова|автор|сл\.|муз\.|обраб/i

export function takeTitleBlock(blocks: string[][], fileName: string): TitleBlock | null {

  if (blocks.length < 3) return null

  const first = blocks[0].map((line) => line.trim()).filter(Boolean)
  if (first.length === 0 || first.length > 2) return null

  const head = first[0]
  const author = first[1] ?? ''

  if (!looksLikeTitle(head, fileName)) return null

  if (author && !looksLikeAuthor(author, head, fileName)) return null

  return { title: head, author, rest: blocks.slice(1) }
}

function looksLikeTitle(line: string, fileName: string): boolean {
  if (same(line, fileName)) return true

  return (
    line.length <= 60 &&
    line.split(/\s+/).length <= 6 &&

    !/[,;:.…]$/.test(line) &&
    headingFromLabel(line) === null
  )
}

const looksLikeAuthor = (line: string, title: string, fileName: string): boolean =>
  AUTHOR.test(line) || line.includes(',') || same(title, fileName)

const same = (a: string, b: string): boolean =>
  a.toLowerCase().replace(/[\s_-]+/g, ' ').trim() ===
  b.toLowerCase().replace(/[\s_-]+/g, ' ').trim()
