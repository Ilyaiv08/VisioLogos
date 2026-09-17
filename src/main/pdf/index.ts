import { readContent } from './content'
import { pageFonts } from './fonts'
import { PdfFile } from './objects'

export interface PdfLine {
  text: string

  gapBefore: boolean

  size: number
}

export interface PdfPage {
  lines: PdfLine[]
}

export interface PdfText {
  pages: PdfPage[]

  problem: 'encrypted' | 'no-text' | null
}

export function extractPdfText(buf: Buffer): PdfText {
  const pdf = new PdfFile(buf)
  if (pdf.encrypted) return { pages: [], problem: 'encrypted' }

  const pages: PdfPage[] = []
  for (const page of findPages(pdf)) {
    const content = contentOf(pdf, page.dict)
    if (!content) continue

    const runs = readContent(content, pageFonts(pdf, page.resources))
    const lines = toLines(runs)
    if (lines.length > 0) pages.push({ lines })
  }

  return { pages, problem: pages.length > 0 ? null : 'no-text' }
}

export function pdfPageCount(buf: Buffer): number {
  const pdf = new PdfFile(buf)
  return pdf.encrypted ? 0 : findPages(pdf).length
}

interface Page {
  dict: string
  resources: string | null
}

function findPages(pdf: PdfFile): Page[] {
  const pages: Page[] = []
  const seen = new Set<string>()

  const root = [...pdf.raw.matchAll(/\/Root\s+(\d+)\s+\d+\s+R/g)].pop()?.[1]
  const catalog = root ? (pdf.objects.get(Number(root))?.dict ?? null) : null
  const tree = catalog ? pdf.value(catalog, 'Pages') : null

  const walk = (ref: string, inherited: string | null, depth: number): void => {
    if (depth > 32 || seen.has(ref)) return
    seen.add(ref)

    const dict = pdf.resolve(ref)
    if (!dict) return

    const resources = pdf.value(dict, 'Resources') ?? inherited
    const kids = pdf.value(dict, 'Kids')

    if (kids) {
      for (const kid of kids.matchAll(/(\d+)\s+\d+\s+R/g)) {
        walk(`${kid[1]} 0 R`, resources, depth + 1)
      }
    } else if (/\/Type\s*\/Page\b/.test(dict) || pdf.value(dict, 'Contents')) {
      pages.push({ dict, resources })
    }
  }

  if (tree) walk(tree, null, 0)

  if (pages.length === 0) {
    for (const [, object] of [...pdf.objects].sort((a, b) => a[0] - b[0])) {
      if (/\/Type\s*\/Page\b/.test(object.dict) && !/\/Type\s*\/Pages\b/.test(object.dict)) {
        pages.push({ dict: object.dict, resources: pdf.value(object.dict, 'Resources') })
      }
    }
  }
  return pages
}

function contentOf(pdf: PdfFile, dict: string): string | null {
  const contents = pdf.value(dict, 'Contents')
  if (!contents) return null

  const parts: string[] = []
  for (const ref of contents.matchAll(/(\d+)\s+\d+\s+R/g)) {
    const data = pdf.decodeStream(pdf.objects.get(Number(ref[1])) ?? null)
    if (data) parts.push(data.toString('latin1'))
  }
  return parts.length > 0 ? parts.join('\n') : null
}

interface Run {
  x: number
  right: number
  space: number
  y: number
  size: number
  text: string
}

function toLines(runs: Run[]): PdfLine[] {
  if (runs.length === 0) return []

  const sorted = runs.map((run, i) => ({ run, i })).sort((a, b) => b.run.y - a.run.y || a.i - b.i)

  const rows: { y: number; size: number; runs: { run: Run; i: number }[] }[] = []
  for (const item of sorted) {
    const row = rows[rows.length - 1]
    const tolerance = Math.max(1, item.run.size * 0.4)

    if (row && Math.abs(row.y - item.run.y) <= tolerance) {
      row.runs.push(item)
      row.size = Math.max(row.size, item.run.size)
    } else {
      rows.push({ y: item.run.y, size: item.run.size, runs: [item] })
    }
  }

  const texts = rows.map((row) => {
    const ordered = [...row.runs].sort((a, b) => a.run.x - b.run.x || a.i - b.i)
    let text = ''
    let right = -Infinity

    for (const { run } of ordered) {

      const gap = run.x - right
      if (text && gap > run.space * 0.5 && !text.endsWith(' ') && !run.text.startsWith(' ')) {
        text += ' '.repeat(Math.min(20, Math.max(1, Math.round(gap / run.space))))
      }
      text += run.text
      right = Math.max(right, run.right)
    }
    return { y: row.y, size: row.size, text: text.replace(/[\t\r\n]+/g, ' ').trim() }
  })

  const filled = texts.filter((row) => row.text.length > 0)
  const step = medianStep(filled.map((row) => row.y))

  return filled.map((row, i) => ({
    text: row.text,
    size: row.size,
    gapBefore: i > 0 && step > 0 && filled[i - 1].y - row.y > step * 1.6
  }))
}

function medianStep(ys: number[]): number {
  const steps = ys
    .slice(1)
    .map((y, i) => ys[i] - y)
    .filter((step) => step > 0)
    .sort((a, b) => a - b)

  return steps.length === 0 ? 0 : steps[Math.floor(steps.length / 2)]
}
