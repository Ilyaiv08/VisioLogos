import { inflateRawSync, inflateSync } from 'node:zlib'

export interface PdfObject {

  dict: string

  stream: Buffer | null
}

export class PdfFile {

  readonly raw: string
  readonly objects = new Map<number, PdfObject>()

  readonly encrypted: boolean

  constructor(private readonly buf: Buffer) {
    this.raw = buf.toString('latin1')
    this.readObjects()
    this.encrypted = /\/Encrypt\s+\d+\s+\d+\s+R/.test(this.raw)
    this.expandObjectStreams()
  }

  private readObjects(): void {
    const re = /(?:^|[^0-9])(\d+)\s+(\d+)\s+obj\b/g

    for (const m of this.raw.matchAll(re)) {
      const number = Number(m[1])
      const bodyAt = (m.index ?? 0) + m[0].length
      this.objects.set(number, this.readBody(bodyAt))
    }
  }

  private readBody(bodyAt: number): PdfObject {
    const endobj = this.raw.indexOf('endobj', bodyAt)
    const streamAt = this.raw.indexOf('stream', bodyAt)
    const hasStream = streamAt >= 0 && (endobj < 0 || streamAt < endobj)

    if (!hasStream) {
      return { dict: this.raw.slice(bodyAt, endobj < 0 ? bodyAt + 4096 : endobj), stream: null }
    }

    const dict = this.raw.slice(bodyAt, streamAt)

    let from = streamAt + 'stream'.length
    if (this.raw[from] === '\r') from++
    if (this.raw[from] === '\n') from++

    return { dict, stream: this.buf.subarray(from, this.streamEnd(dict, from)) }
  }

  private streamEnd(dict: string, from: number): number {
    const length = Number(/\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict)?.[1] ?? NaN)
    if (Number.isFinite(length) && this.raw.slice(from + length, from + length + 20).includes('endstream')) {
      return from + length
    }

    const at = this.raw.indexOf('endstream', from)
    if (at < 0) return this.raw.length

    let end = at
    if (this.raw[end - 1] === '\n') end--
    if (this.raw[end - 1] === '\r') end--
    return end
  }

  private expandObjectStreams(): void {
    for (const object of [...this.objects.values()]) {
      if (!/\/Type\s*\/ObjStm\b/.test(object.dict)) continue

      const data = this.decodeStream(object)
      if (!data) continue

      const text = data.toString('latin1')
      const count = Number(this.value(object.dict, 'N') ?? 0)
      const first = Number(this.value(object.dict, 'First') ?? 0)
      const header = text.slice(0, first).trim().split(/\s+/).map(Number)

      for (let i = 0; i < count; i++) {
        const number = header[i * 2]
        const at = header[i * 2 + 1]
        if (!Number.isFinite(number) || !Number.isFinite(at)) continue

        const nextAt = i + 1 < count ? header[i * 2 + 3] : text.length - first
        const dict = text.slice(first + at, first + (Number.isFinite(nextAt) ? nextAt : text.length))

        if (!this.objects.has(number)) this.objects.set(number, { dict, stream: null })
      }
    }
  }

  value(dict: string, key: string): string | null {
    const re = new RegExp(`/${key}\\b`, 'g')

    for (const m of dict.matchAll(re)) {
      const at = skipSpace(dict, (m.index ?? 0) + m[0].length)
      const token = readToken(dict, at)
      if (token) return token
    }
    return null
  }

  resolve(value: string | null): string | null {
    if (!value) return null
    const ref = /^(\d+)\s+\d+\s+R$/.exec(value.trim())
    return ref ? (this.objects.get(Number(ref[1]))?.dict ?? null) : value
  }

  object(value: string | null): PdfObject | null {
    const ref = /^(\d+)\s+\d+\s+R$/.exec((value ?? '').trim())
    return ref ? (this.objects.get(Number(ref[1])) ?? null) : null
  }

  decodeStream(object: PdfObject | null): Buffer | null {
    if (!object?.stream) return null

    const filters = names(this.resolve(this.value(object.dict, 'Filter')) ?? '')
    const parms = this.value(object.dict, 'DecodeParms') ?? ''
    let data: Buffer | null = object.stream

    for (const filter of filters) {
      if (!data) return null
      if (filter === 'FlateDecode' || filter === 'Fl') data = inflate(data)
      else if (filter === 'LZWDecode' || filter === 'LZW') data = lzwDecode(data)
      else if (filter === 'ASCIIHexDecode' || filter === 'AHx') data = hexDecode(data)
      else if (filter === 'ASCII85Decode' || filter === 'A85') data = ascii85Decode(data)
      else if (filter === 'RunLengthDecode' || filter === 'RL') data = runLengthDecode(data)

      else return null
    }

    if (data && /\/Predictor\s+(\d+)/.test(parms)) {
      const predictor = Number(/\/Predictor\s+(\d+)/.exec(parms)?.[1] ?? 1)
      if (predictor >= 10) {
        data = pngPredictor(
          data,
          Number(/\/Columns\s+(\d+)/.exec(parms)?.[1] ?? 1),
          Number(/\/Colors\s+(\d+)/.exec(parms)?.[1] ?? 1),
          Number(/\/BitsPerComponent\s+(\d+)/.exec(parms)?.[1] ?? 8)
        )
      }
    }
    return data
  }
}

export function skipSpace(text: string, at: number): number {
  while (at < text.length) {
    if (text[at] === '%') {
      while (at < text.length && text[at] !== '\n') at++
    } else if (/\s/.test(text[at])) at++
    else break
  }
  return at
}

export function readToken(text: string, at: number): string | null {
  const ch = text[at]
  if (ch === undefined) return null

  if (ch === '<' && text[at + 1] === '<') return text.slice(at, at + balanced(text, at, '<<', '>>'))
  if (ch === '[') return text.slice(at, at + balanced(text, at, '[', ']'))
  if (ch === '/') return /^\/[^\s/[\]<>(){}]*/.exec(text.slice(at))?.[0] ?? null
  if (ch === '(') return text.slice(at, at + literalStringLength(text, at))

  const ref = /^\d+\s+\d+\s+R\b/.exec(text.slice(at, at + 32))
  if (ref) return ref[0]

  return /^[-+.\d]+|^<[0-9a-fA-F\s]*>|^\w+/.exec(text.slice(at))?.[0] ?? null
}

function balanced(text: string, start: number, open: string, close: string): number {
  let depth = 0
  let at = start

  while (at < text.length) {
    if (text.startsWith(open, at)) {
      depth++
      at += open.length
    } else if (text.startsWith(close, at)) {
      depth--
      at += close.length
      if (depth === 0) return at - start
    } else if (text[at] === '(') {
      at += literalStringLength(text, at)
    } else at++
  }
  return text.length - start
}

export function literalStringLength(text: string, start: number): number {
  let depth = 0
  let at = start

  while (at < text.length) {
    const ch = text[at]
    if (ch === '\\') at += 2
    else if (ch === '(') {
      depth++
      at++
    } else if (ch === ')') {
      depth--
      at++
      if (depth === 0) return at - start
    } else at++
  }
  return text.length - start
}

const names = (value: string): string[] => [...value.matchAll(/\/(\w+)/g)].map((m) => m[1])

function inflate(data: Buffer): Buffer | null {
  const attempts: (() => Buffer)[] = [
    () => inflateSync(data),

    () => inflateSync(data, { finishFlush: 2 }),
    () => inflateRawSync(data.subarray(1), { finishFlush: 2 }),
    () => inflateSync(data.subarray(1), { finishFlush: 2 })
  ]

  for (const attempt of attempts) {
    try {
      const out = attempt()
      if (out.length > 0) return out
    } catch {
      continue
    }
  }
  return null
}

function hexDecode(data: Buffer): Buffer {
  const hex = data.toString('latin1').replace(/[^0-9a-fA-F]/g, '')
  return Buffer.from(hex.length % 2 ? `${hex}0` : hex, 'hex')
}

function ascii85Decode(data: Buffer): Buffer {
  const text = data.toString('latin1').replace(/\s/g, '').replace(/^<~/, '')
  const end = text.indexOf('~>')
  const body = end >= 0 ? text.slice(0, end) : text
  const out: number[] = []

  for (let i = 0; i < body.length; ) {
    if (body[i] === 'z') {
      out.push(0, 0, 0, 0)
      i++
      continue
    }
    const group = body.slice(i, i + 5)
    i += 5

    let value = 0
    for (let k = 0; k < 5; k++) {
      value = value * 85 + ((group.charCodeAt(k) || 'u'.charCodeAt(0)) - 33)
    }
    const bytes = [value >>> 24, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]
    out.push(...bytes.slice(0, group.length - 1))
  }
  return Buffer.from(out)
}

function runLengthDecode(data: Buffer): Buffer {
  const out: number[] = []

  for (let i = 0; i < data.length; ) {
    const length = data[i++]
    if (length === 128) break
    if (length < 128) {
      for (let k = 0; k <= length; k++) out.push(data[i++])
    } else {
      const byte = data[i++]
      for (let k = 0; k < 257 - length; k++) out.push(byte)
    }
  }
  return Buffer.from(out)
}

function lzwDecode(data: Buffer): Buffer {
  const out: number[] = []
  let table: number[][] = []
  const reset = (): void => {
    table = []
    for (let i = 0; i < 256; i++) table.push([i])
    table.push([], [])
  }
  reset()

  let bits = 9
  let buffer = 0
  let count = 0
  let previous: number[] | null = null

  for (const byte of data) {
    buffer = (buffer << 8) | byte
    count += 8

    while (count >= bits) {
      const code = (buffer >> (count - bits)) & ((1 << bits) - 1)
      count -= bits

      if (code === 256) {
        reset()
        bits = 9
        previous = null
        continue
      }
      if (code === 257) return Buffer.from(out)

      let entry: number[]
      if (code < table.length) entry = table[code]
      else if (previous) entry = [...previous, previous[0]]
      else return Buffer.from(out)

      out.push(...entry)
      if (previous) table.push([...previous, entry[0]])
      previous = entry

      if (table.length + 1 >= 1 << bits && bits < 12) bits++
    }
  }
  return Buffer.from(out)
}

function pngPredictor(data: Buffer, columns: number, colors: number, depth: number): Buffer {
  const bytesPerPixel = Math.max(1, (colors * depth) >> 3)
  const rowLength = Math.ceil((columns * colors * depth) / 8)
  const rows = Math.floor(data.length / (rowLength + 1))
  const out = Buffer.alloc(rows * rowLength)

  let previous = Buffer.alloc(rowLength)
  for (let r = 0; r < rows; r++) {
    const type = data[r * (rowLength + 1)]
    const row = Buffer.from(data.subarray(r * (rowLength + 1) + 1, (r + 1) * (rowLength + 1)))

    for (let i = 0; i < rowLength; i++) {
      const left = i >= bytesPerPixel ? row[i - bytesPerPixel] : 0
      const up = previous[i]
      const upLeft = i >= bytesPerPixel ? previous[i - bytesPerPixel] : 0

      if (type === 1) row[i] = (row[i] + left) & 0xff
      else if (type === 2) row[i] = (row[i] + up) & 0xff
      else if (type === 3) row[i] = (row[i] + ((left + up) >> 1)) & 0xff
      else if (type === 4) row[i] = (row[i] + paeth(left, up, upLeft)) & 0xff
    }
    row.copy(out, r * rowLength)
    previous = row
  }
  return out
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}
