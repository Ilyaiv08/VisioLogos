import type { PdfFont } from './fonts'
import { literalStringLength } from './objects'

export interface TextRun {
  x: number

  right: number

  space: number
  y: number
  size: number
  text: string
}

type Matrix = [number, number, number, number, number, number]

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]

const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[1] * n[2],
  m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2],
  m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4],
  m[4] * n[1] + m[5] * n[3] + n[5]
]

const WORD_GAP = 170

export function readContent(content: string, fonts: Map<string, PdfFont>): TextRun[] {
  const runs: TextRun[] = []
  const operands: unknown[] = []

  let ctm: Matrix = IDENTITY
  const stack: Matrix[] = []

  let tm: Matrix = IDENTITY
  let tlm: Matrix = IDENTITY
  let font: PdfFont | null = null
  let size = 12
  let leading = 0
  let rise = 0
  let horizontal = 1
  let charSpacing = 0
  let wordSpacing = 0

  const number = (at: number): number => {
    const value = operands[operands.length - at]
    return typeof value === 'number' ? value : 0
  }

  const show = (pieces: unknown[]): void => {
    if (!font) return

    let text = ''

    let advance = 0

    for (const piece of pieces) {
      if (typeof piece === 'number') {

        if (piece <= -WORD_GAP && text && !text.endsWith(' ')) text += ' '
        advance -= (piece / 1000) * size
        continue
      }
      if (!(piece instanceof Uint8Array)) continue

      for (let i = 0; i + font.bytes <= piece.length; i += font.bytes) {
        const code = font.bytes === 2 ? (piece[i] << 8) | piece[i + 1] : piece[i]
        text += font.decode(code)
        advance += font.width(code) * size + charSpacing
        if (code === 32 && font.bytes === 1) advance += wordSpacing
      }
    }
    advance *= horizontal

    const base = multiply(tm, ctm)
    const trm = multiply([size * horizontal, 0, 0, size, 0, rise], base)
    const scale = Math.sqrt(Math.abs(base[0] * base[3] - base[1] * base[2])) || 1

    tm = multiply([1, 0, 0, 1, advance, 0], tm)

    if (text.trim()) {
      runs.push({
        x: trm[4],
        right: multiply(tm, ctm)[4],
        space: font.space * size * horizontal * scale,
        y: trm[5],
        size: size * scale,
        text
      })
    }
  }

  const move = (tx: number, ty: number): void => {
    tlm = multiply([1, 0, 0, 1, tx, ty], tlm)
    tm = tlm
  }

  let at = 0
  while (at < content.length) {
    const ch = content[at]

    if (ch === undefined) break
    if (/\s/.test(ch)) {
      at++
      continue
    }
    if (ch === '%') {
      while (at < content.length && content[at] !== '\n') at++
      continue
    }

    if (ch === '(') {
      const length = literalStringLength(content, at)
      operands.push(literalBytes(content.slice(at + 1, at + length - 1)))
      at += length
      continue
    }

    if (ch === '<' && content[at + 1] !== '<') {
      const end = content.indexOf('>', at)
      operands.push(hexBytes(content.slice(at + 1, end < 0 ? content.length : end)))
      at = end < 0 ? content.length : end + 1
      continue
    }

    if (ch === '<') {

      const end = content.indexOf('>>', at)
      at = end < 0 ? content.length : end + 2
      operands.push(null)
      continue
    }

    if (ch === '[') {
      const end = arrayEnd(content, at)
      operands.push(readArray(content.slice(at + 1, end - 1)))
      at = end
      continue
    }

    if (ch === '/') {
      const name = /^\/([^\s/[\]<>(){}]*)/.exec(content.slice(at))
      operands.push(name ? name[1] : '')
      at += name ? name[0].length : 1
      continue
    }

    const num = /^[-+]?(?:\d+\.?\d*|\.\d+)/.exec(content.slice(at, at + 32))
    if (num) {
      operands.push(Number(num[0]))
      at += num[0].length
      continue
    }

    const op = /^(?:[A-Za-z*'"]+\d*|\d+)/.exec(content.slice(at, at + 16))
    if (!op) {
      at++
      continue
    }
    at += op[0].length

    switch (op[0]) {
      case 'q':
        stack.push(ctm)
        break
      case 'Q':
        ctm = stack.pop() ?? ctm
        break
      case 'cm':
        ctm = multiply(
          [number(6), number(5), number(4), number(3), number(2), number(1)],
          ctm
        )
        break
      case 'BT':
        tm = IDENTITY
        tlm = IDENTITY
        break
      case 'Tf': {
        size = number(1)
        const name = operands[operands.length - 2]
        font = (typeof name === 'string' ? fonts.get(name) : null) ?? font
        break
      }
      case 'Tm':
        tlm = [number(6), number(5), number(4), number(3), number(2), number(1)]
        tm = tlm
        break
      case 'Td':
        move(number(2), number(1))
        break
      case 'TD':
        leading = -number(1)
        move(number(2), number(1))
        break
      case 'TL':
        leading = number(1)
        break
      case 'Ts':
        rise = number(1)
        break
      case 'Tc':
        charSpacing = number(1)
        break
      case 'Tw':
        wordSpacing = number(1)
        break
      case 'Tz':
        horizontal = number(1) / 100
        break
      case 'T*':
        move(0, -leading)
        break
      case 'Tj':
        show([operands[operands.length - 1]])
        break
      case 'TJ':
        show((operands[operands.length - 1] as unknown[]) ?? [])
        break
      case "'":
        move(0, -leading)
        show([operands[operands.length - 1]])
        break
      case '"':
        wordSpacing = number(3)
        charSpacing = number(2)
        move(0, -leading)
        show([operands[operands.length - 1]])
        break
      case 'BI': {

        const end = content.indexOf('EI', content.indexOf('ID', at))
        at = end < 0 ? content.length : end + 2
        break
      }
      default:
        break
    }
    operands.length = 0
  }

  return runs
}

function literalBytes(text: string): Uint8Array {
  const out: number[] = []
  const ESCAPES: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12 }

  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '\\') {
      out.push(text.charCodeAt(i) & 0xff)
      continue
    }
    const next = text[++i]
    if (next === undefined) break

    const octal = /^[0-7]{1,3}/.exec(text.slice(i, i + 3))
    if (octal) {
      out.push(parseInt(octal[0], 8) & 0xff)
      i += octal[0].length - 1
    } else if (ESCAPES[next] !== undefined) out.push(ESCAPES[next])
    else if (next === '\n') continue
    else out.push(next.charCodeAt(0) & 0xff)
  }
  return Uint8Array.from(out)
}

function hexBytes(text: string): Uint8Array {
  const hex = text.replace(/[^0-9a-fA-F]/g, '')
  const padded = hex.length % 2 ? `${hex}0` : hex
  const out = new Uint8Array(padded.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(padded.slice(i * 2, i * 2 + 2), 16)
  return out
}

function arrayEnd(content: string, start: number): number {
  let depth = 0
  let at = start

  while (at < content.length) {
    const ch = content[at]
    if (ch === '(') at += literalStringLength(content, at)
    else if (ch === '[') {
      depth++
      at++
    } else if (ch === ']') {
      depth--
      at++
      if (depth === 0) return at
    } else at++
  }
  return content.length
}

function readArray(body: string): unknown[] {
  const out: unknown[] = []
  let at = 0

  while (at < body.length) {
    const ch = body[at]
    if (ch === '(') {
      const length = literalStringLength(body, at)
      out.push(literalBytes(body.slice(at + 1, at + length - 1)))
      at += length
      continue
    }
    if (ch === '<') {
      const end = body.indexOf('>', at)
      out.push(hexBytes(body.slice(at + 1, end < 0 ? body.length : end)))
      at = end < 0 ? body.length : end + 1
      continue
    }
    const num = /^[-+]?(?:\d+\.?\d*|\.\d+)/.exec(body.slice(at, at + 32))
    if (num) {
      out.push(Number(num[0]))
      at += num[0].length
      continue
    }
    at++
  }
  return out
}
