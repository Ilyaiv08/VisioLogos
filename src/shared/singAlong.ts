export const MIN_WORD = 3

const LOOK_HERE = 6

const LOOK_FIND = 8

const STRAY = 6

export const DWELL = 1200

export const QUIET = 1500

const SLACK = 2

const NEXT_START = 6

export function normalizeWord(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

export function plainLine(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function tokensOf(line: string): string[] {
  return line
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((word) => /[\p{L}\p{N}]/u.test(word))
}

function knownForm(known: Set<string>, word: string): string | null {
  if (known.has(word)) return word

  const plain = word.replace(/ё/g, 'е')
  if (known.has(plain)) return plain

  for (let i = 0; i < plain.length; i++) {
    if (plain[i] !== 'е') continue
    const dotted = plain.slice(0, i) + 'ё' + plain.slice(i + 1)
    if (known.has(dotted)) return dotted
  }
  return null
}

export function spellWith(known: Set<string>, token: string): string[] {
  const word = token.toLowerCase()
  const whole = knownForm(known, word)
  if (whole) return [whole]

  if (!word.includes('-')) return []
  return word
    .split('-')
    .filter(Boolean)
    .map((part) => knownForm(known, part))
    .filter((part): part is string => part !== null)
}

const SPECIAL = new Set(['<eps>', '!sil', '[unk]', '<s>', '</s>', '<unk>', '#0'])

const usable = (word: string): boolean => word.length > 0 && !SPECIAL.has(word.toLowerCase())

export function vocabularyFromText(text: string): Set<string> {
  const out = new Set<string>()
  for (const line of text.split('\n')) {
    const word = line.trim().split(/\s+/)[0] ?? ''
    if (usable(word)) out.add(word)
  }
  return out
}

const FST_MAGIC = 2125659606
const SYMBOLS_MAGIC = 2125658996

export function vocabularyFromFst(bytes: Uint8Array): Set<string> | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const utf8 = new TextDecoder('utf-8')
  let at = 0

  const int32 = (): number => {
    const value = view.getInt32(at, true)
    at += 4
    return value
  }
  const skip64 = (): void => {
    at += 8
  }
  const text = (): string => {
    const length = int32()
    if (length < 0 || at + length > bytes.byteLength) throw new Error('bad string')
    const value = utf8.decode(bytes.subarray(at, at + length))
    at += length
    return value
  }

  try {
    if (int32() !== FST_MAGIC) return null
    text()
    text()
    int32()
    const flags = int32()
    skip64()
    skip64()
    skip64()
    skip64()
    if ((flags & 1) === 0) return null

    if (int32() !== SYMBOLS_MAGIC) return null
    text()
    skip64()
    const size = Number(view.getBigInt64(at, true))
    at += 8

    const out = new Set<string>()
    for (let i = 0; i < size; i++) {
      const word = text()
      skip64()
      if (usable(word)) out.add(word)
    }
    return out
  } catch {
    return null
  }
}

export interface TapeWord {
  norm: string

  hear: boolean
}

export interface TapeSlide {
  lines: TapeWord[][]
  times: number
}

export interface TapeMark {
  from: number
  to: number

  cue: number

  gate: number

  need: number
  times: number
}

export interface Tape {
  words: (TapeWord & { slide: number })[]
  slides: TapeMark[]
}

const matchable = (word: TapeWord): boolean => word.hear && word.norm.length >= MIN_WORD

export function tapeOf(slides: TapeSlide[]): Tape {
  const words: Tape['words'] = []
  const marks: TapeMark[] = []

  slides.forEach((slide, index) => {
    const from = words.length
    const starts: number[] = []

    for (const line of slide.lines) {
      starts.push(words.length)
      for (const word of line) words.push({ ...word, slide: index })
    }

    const to = words.length
    let cue = -1
    let count = 0
    for (let i = from; i < to; i++) {
      if (!matchable(words[i])) continue
      cue = i
      count++
    }

    const gate = cue < 0 ? to : Math.max(from, ...starts.filter((start) => start <= cue))

    marks.push({
      from,
      to,
      cue,
      gate,
      need: Math.min(3, count),
      times: Math.max(1, Math.floor(slide.times) || 1)
    })
  })

  return { words, slides: marks }
}

export function slips(a: string, b: string, limit: number): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > limit) return limit + 1

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)

  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const value = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + cost)
      row.push(value)
      if (value < best) best = value
    }
    if (best > limit) return limit + 1
    previous = row
  }

  return previous[b.length]
}

function allowedSlips(length: number): number {
  if (length <= 5) return 0
  if (length <= 9) return 1
  return 2
}

const alike = new Map<string, boolean>()

export function sameWord(heard: string, expected: string): boolean {
  if (heard === expected) return true

  const key = `${heard}|${expected}`
  const known = alike.get(key)
  if (known !== undefined) return known

  const limit = allowedSlips(Math.max(heard.length, expected.length))
  const same = limit > 0 && slips(heard, expected, limit) <= limit

  if (alike.size > 20_000) alike.clear()
  alike.set(key, same)
  return same
}

function nearest(tape: Tape, word: string, from: number, to: number): number {
  let loose = -1
  for (let i = Math.max(0, from); i < to; i++) {
    const expected = tape.words[i]
    if (!matchable(expected)) continue
    if (expected.norm === word) return i
    if (loose < 0 && sameWord(word, expected.norm)) loose = i
  }
  return loose
}

export interface Follow {
  slide: number

  at: number

  pass: number

  hits: number

  since: number

  stray: string[]

  quiet: number

  hold: number

  holds: number
}

export type Step =
  | { kind: 'stay' }
  | { kind: 'again'; pass: number }
  | { kind: 'turn'; to: number }
  | { kind: 'jump'; to: number }

export function followFrom(tape: Tape, slide: number, now: number): Follow {
  const index = Math.min(Math.max(0, slide), Math.max(0, tape.slides.length - 1))
  return {
    slide: index,
    at: tape.slides[index]?.from ?? 0,
    pass: 0,
    hits: 0,
    since: now,
    stray: [],
    quiet: 0,
    hold: -1,
    holds: 0
  }
}

export function hear(
  tape: Tape,
  was: Follow,
  heard: string[],
  now: number
): { state: Follow; step: Step } {
  let state: Follow = { ...was, stray: [...was.stray] }
  let step: Step = { kind: 'stay' }

  for (const raw of heard) {
    const word = normalizeWord(raw)
    if (word.length < MIN_WORD || word === 'unk') continue

    const slide = tape.slides[state.slide]
    if (!slide) break

    const found = nearest(tape, word, state.at, Math.min(slide.to, state.at + LOOK_HERE))

    if (found >= 0) {
      const before = state.at
      state = { ...state, at: found + 1, hits: state.hits + 1, stray: [], hold: -1, holds: 0 }

      const done =
        slide.cue >= 0 &&
        found >= slide.cue &&
        before >= slide.gate - SLACK &&
        state.hits >= slide.need &&
        now - state.since >= DWELL

      if (!done) continue

      const pass = state.pass + 1
      if (pass < slide.times) {
        state = { ...state, at: slide.from, pass, hits: 0, since: now }
        step = { kind: 'again', pass }
      } else if (state.slide + 1 < tape.slides.length) {
        state = { ...followFrom(tape, state.slide + 1, now), quiet: now + QUIET }
        step = { kind: 'turn', to: state.slide }
      } else {
        state = { ...state, pass, since: now }
      }
      continue
    }

    state.stray = [...state.stray, word].slice(-STRAY)
    if (now < state.quiet) continue

    const moved = relocate(tape, state, now)
    if (moved) {
      state = moved.state
      if (moved.step.kind !== 'stay') step = moved.step
    }
  }

  return { state, step }
}

interface Run {
  first: number
  at: number
  hits: number
}

function follow(tape: Tape, from: number, heard: string[]): Run | null {
  let at = from
  let first = -1
  let hits = 0
  let tail = false

  for (const word of heard) {
    tail = false
    const found = nearest(tape, word, at, Math.min(tape.words.length, at + LOOK_FIND))
    if (found < 0) continue
    if (first < 0) first = found
    at = found + 1
    hits++
    tail = true
  }

  return tail && first >= 0 ? { first, at, hits } : null
}

function relocate(
  tape: Tape,
  state: Follow,
  now: number
): { state: Follow; step: Step } | null {
  const heard = state.stray
  if (heard.length < 2) return null

  const current = state.slide
  const next = current + 1

  let best: (Run & { slide: number }) | null = null
  const rank = (run: Run & { slide: number }): number[] => [
    run.hits,
    run.slide === current ? 2 : run.slide === next ? 1 : 0,
    -Math.abs(run.at - state.at)
  ]
  const better = (a: number[], b: number[]): boolean => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i]
    return false
  }

  for (let skip = 0; skip < Math.min(2, heard.length - 1); skip++) {
    const words = heard.slice(skip)
    for (let start = 0; start < tape.words.length; start++) {
      const expected = tape.words[start]
      if (!matchable(expected) || !sameWord(words[0], expected.norm)) continue

      const run = follow(tape, start, words)
      if (!run || run.hits < 2) continue

      const found = { ...run, slide: tape.words[run.at - 1].slide }
      if (!best || better(rank(found), rank(best))) best = found
    }
  }

  if (!best) return null

  const mark = tape.slides[best.slide]
  const fromStart = best.first - mark.from < NEXT_START
  const need = best.slide === next && fromStart ? 2 : 3
  if (best.hits < need) return null

  if (best.slide === current) {
    const ahead = best.at > state.at
    if (!ahead && best.at === state.at) return null

    const repeated = !ahead && state.at >= mark.gate - SLACK
    const pass = repeated ? Math.min(state.pass + 1, mark.times - 1) : state.pass
    return {
      state: {
        ...state,
        at: best.at,
        hits: ahead ? state.hits + best.hits : best.hits,
        pass,
        since: repeated ? now : state.since,
        stray: [],
        hold: -1,
        holds: 0
      },
      step: pass > state.pass ? { kind: 'again', pass } : { kind: 'stay' }
    }
  }

  if (best.slide !== next) {
    const holds = state.hold === best.slide ? state.holds + 1 : 1
    if (holds < 2) return { state: { ...state, hold: best.slide, holds }, step: { kind: 'stay' } }
  }

  return {
    state: {
      slide: best.slide,
      at: best.at,
      pass: 0,
      hits: best.hits,
      since: now,
      stray: [],
      quiet: now + QUIET,
      hold: -1,
      holds: 0
    },
    step: best.slide === next ? { kind: 'turn', to: next } : { kind: 'jump', to: best.slide }
  }
}

export function phrasesOf(lines: string[][]): string {
  const phrases = new Set<string>()
  for (const line of lines) {
    const phrase = line.join(' ').trim()
    if (phrase) phrases.add(phrase)
  }
  return JSON.stringify([...phrases, '[unk]'])
}
