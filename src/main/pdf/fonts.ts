import { PdfFile, type PdfObject } from './objects'

export interface PdfFont {

  bytes: number
  decode: (code: number) => string

  width: (code: number) => number

  space: number
}

export function readFont(pdf: PdfFile, ref: string | null): PdfFont {
  const object = pdf.object(ref)
  const dict = object?.dict ?? pdf.resolve(ref) ?? ''

  const composite = /\/Subtype\s*\/Type0\b/.test(dict)
  const toUnicode = readToUnicode(pdf, pdf.value(dict, 'ToUnicode'))
  const differences = readDifferences(pdf, dict)
  const single = singleByteDecoder(dict)
  const widths = composite ? compositeWidths(pdf, dict) : simpleWidths(pdf, dict)

  const width = (code: number): number => (widths.get(code) ?? widths.get(-1) ?? 500) / 1000

  return {
    bytes: composite ? (toUnicode?.bytes ?? 2) : 1,
    width,

    space: composite || width(32) <= 0 || width(32) > 0.6 ? 0.25 : width(32),
    decode: (code) => {
      const mapped = toUnicode?.map.get(code)
      if (mapped !== undefined) return mapped
      if (differences.has(code)) return differences.get(code) ?? ''

      return composite ? '' : single(code)
    }
  }
}

interface ToUnicode {
  bytes: number
  map: Map<number, string>
}

function readToUnicode(pdf: PdfFile, ref: string | null): ToUnicode | null {
  const data = pdf.decodeStream(pdf.object(ref))
  if (!data) return null

  const text = data.toString('latin1')
  const map = new Map<number, string>()

  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    const pairs = [...block[1].matchAll(/<([0-9a-fA-F]+)>\s*(?:<([0-9a-fA-F]*)>|\/(\w+))/g)]
    for (const [, from, to] of pairs) {
      if (to !== undefined) map.set(parseInt(from, 16), fromUtf16(to))
    }
  }

  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {

    const items = [
      ...block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]*>|\[[\s\S]*?\])/g)
    ]
    for (const [, fromHex, toHex, target] of items) {
      const from = parseInt(fromHex, 16)
      const to = parseInt(toHex, 16)
      if (!Number.isFinite(from) || !Number.isFinite(to) || to - from > 65535) continue

      if (target.startsWith('[')) {
        const list = [...target.matchAll(/<([0-9a-fA-F]*)>/g)]
        list.forEach(([, hex], i) => map.set(from + i, fromUtf16(hex)))
      } else {
        const base = target.slice(1, -1)
        for (let code = from; code <= to; code++) {
          map.set(code, shiftUtf16(base, code - from))
        }
      }
    }
  }

  const space = /begincodespacerange\s*<([0-9a-fA-F]+)>/.exec(text)
  const bytes = space ? Math.max(1, Math.round(space[1].length / 2)) : 2
  return map.size > 0 ? { bytes, map } : null
}

function fromUtf16(hex: string): string {
  let out = ''
  for (let i = 0; i + 3 < hex.length + 1; i += 4) {
    const unit = parseInt(hex.slice(i, i + 4), 16)
    if (Number.isFinite(unit)) out += String.fromCharCode(unit)
  }
  return out
}

function shiftUtf16(hex: string, shift: number): string {
  const text = fromUtf16(hex)
  if (text.length === 0) return ''
  return text.slice(0, -1) + String.fromCharCode(text.charCodeAt(text.length - 1) + shift)
}

function simpleWidths(pdf: PdfFile, dict: string): Map<number, number> {
  const widths = new Map<number, number>()
  const list = pdf.resolve(pdf.value(dict, 'Widths'))
  const first = Number(pdf.value(dict, 'FirstChar') ?? 0)

  const descriptor = pdf.resolve(pdf.value(dict, 'FontDescriptor')) ?? ''
  widths.set(-1, Number(pdf.value(descriptor, 'MissingWidth') ?? 500))

  if (list) {
    const numbers = [...list.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]))
    numbers.forEach((width, i) => widths.set(first + i, width))
  }
  return widths
}

function compositeWidths(pdf: PdfFile, dict: string): Map<number, number> {
  const widths = new Map<number, number>()

  const descendants = pdf.resolve(pdf.value(dict, 'DescendantFonts')) ?? ''
  const child = pdf.resolve(/\d+\s+\d+\s+R/.exec(descendants)?.[0] ?? null) ?? descendants

  widths.set(-1, Number(pdf.value(child, 'DW') ?? 1000))

  const list = pdf.resolve(pdf.value(child, 'W'))
  if (!list) return widths

  const tokens = [...list.matchAll(/\[|\]|-?\d+(?:\.\d+)?/g)].map((m) => m[0])
  let at = 0
  while (at < tokens.length) {
    const start = Number(tokens[at++])
    if (!Number.isFinite(start)) continue

    if (tokens[at] === '[') {
      at++
      for (let code = start; at < tokens.length && tokens[at] !== ']'; code++) {
        widths.set(code, Number(tokens[at++]))
      }
      at++
    } else {
      const end = Number(tokens[at++])
      const width = Number(tokens[at++])
      if (end - start > 65535) continue
      for (let code = start; code <= end; code++) widths.set(code, width)
    }
  }
  return widths
}

function singleByteDecoder(dict: string): (code: number) => string {
  const encoding = /\/(?:Base)?Encoding\s*\/(\w+)/.exec(dict)?.[1] ?? 'WinAnsiEncoding'
  const codepage = encoding === 'MacRomanEncoding' ? 'macintosh' : 'windows-1252'
  const decoder = new TextDecoder(codepage)
  return (code) => decoder.decode(Uint8Array.of(code))
}

function readDifferences(pdf: PdfFile, dict: string): Map<number, string> {
  const out = new Map<number, string>()
  const encoding = pdf.resolve(pdf.value(dict, 'Encoding'))
  const list = encoding ? /\/Differences\s*\[([\s\S]*?)\]/.exec(encoding)?.[1] : null
  if (!list) return out

  let code = 0
  for (const token of list.matchAll(/(\d+)|\/([^\s/[\]]+)/g)) {
    if (token[1] !== undefined) {
      code = Number(token[1])
      continue
    }
    const letter = glyphToChar(token[2])
    if (letter) out.set(code, letter)
    code++
  }
  return out
}

const AFII_UPPER = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ'
const AFII_LOWER = 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя'

const NAMED: Record<string, string> = {
  space: ' ',
  exclam: '!',
  quotedbl: '"',
  numbersign: '#',
  dollar: '$',
  percent: '%',
  ampersand: '&',
  quotesingle: "'",
  quoteright: '’',
  quoteleft: '‘',
  parenleft: '(',
  parenright: ')',
  asterisk: '*',
  plus: '+',
  comma: ',',
  hyphen: '-',
  period: '.',
  slash: '/',
  zero: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  colon: ':',
  semicolon: ';',
  less: '<',
  equal: '=',
  greater: '>',
  question: '?',
  at: '@',
  bracketleft: '[',
  backslash: '\\',
  bracketright: ']',
  underscore: '_',
  braceleft: '{',
  bar: '|',
  braceright: '}',
  endash: '–',
  emdash: '—',
  quotedblleft: '«',
  quotedblright: '»',
  quotedblbase: '„',
  bullet: '•',
  ellipsis: '…',
  guillemotleft: '«',
  guillemotright: '»',
  nbspace: ' ',
  currency: '¤'
}

function glyphToChar(name: string): string {
  if (name.length === 1) return name
  if (NAMED[name]) return NAMED[name]

  const uni = /^uni([0-9a-fA-F]{4,})$/.exec(name)
  if (uni) return fromUtf16(uni[1])

  const u = /^u([0-9a-fA-F]{4,6})$/.exec(name)
  if (u) return String.fromCodePoint(parseInt(u[1], 16))

  const afii = /^afii(\d+)$/.exec(name)
  if (afii) {
    const number = Number(afii[1])
    if (number >= 10017 && number <= 10049) return AFII_UPPER[number - 10017]
    if (number >= 10065 && number <= 10097) return AFII_LOWER[number - 10065]
  }
  return ''
}

export function pageFonts(pdf: PdfFile, resources: string | null): Map<string, PdfFont> {
  const fonts = new Map<string, PdfFont>()
  const dict = pdf.resolve(resources)
  const table = dict ? pdf.resolve(pdf.value(dict, 'Font')) : null
  if (!table) return fonts

  for (const m of table.matchAll(/\/([^\s/[\]<>]+)\s*(\d+\s+\d+\s+R|<<)/g)) {
    if (m[2] === '<<') continue
    fonts.set(m[1], readFont(pdf, m[2]))
  }
  return fonts
}

export type { PdfObject }
