const LOOK_AHEAD = 12

const ENOUGH = 2

const LATE = 4

const MIN_WORD = 3

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

export function wordsOf(line: string): string[] {
  return line.split(/\s+/).map(normalizeWord).filter(Boolean)
}

export interface GridPlace {
  slide: number
  at: number
}

export interface SongGrid {
  words: { norm: string; line: number }[]

  lengths: number[]

  places: GridPlace[]
}

export function songGrid(slides: { lines: string[] }[]): SongGrid {
  const words: SongGrid['words'] = []
  const lengths: number[] = []
  const places: GridPlace[] = []

  slides.forEach((slide, slideIndex) => {
    slide.lines.forEach((text, at) => {
      const line = places.length
      const parts = wordsOf(text)
      places.push({ slide: slideIndex, at })
      lengths.push(parts.length)
      for (const norm of parts) words.push({ norm, line })
    })
  })

  return { words, lengths, places }
}

function allowedSlips(length: number): number {
  if (length <= 5) return 0
  if (length <= 9) return 1
  return 2
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

interface Run {
  at: number
  hits: number

  late: number

  tail: boolean
}

function follow(grid: SongGrid, from: number, heard: string[], look = LOOK_AHEAD): Run {
  let at = Math.max(0, Math.min(from, grid.words.length))
  let hits = 0
  let late = 0
  let tail = false

  const words = heard.map(normalizeWord).filter((one) => one.length >= MIN_WORD)

  for (const [n, word] of words.entries()) {
    tail = false
    const edge = Math.min(grid.words.length, at + look)

    let best = -1
    let bestSlips = Infinity

    for (let i = at; i < edge; i++) {
      const expected = grid.words[i].norm
      if (expected.length < MIN_WORD) continue

      const limit = allowedSlips(Math.max(word.length, expected.length))
      const distance = slips(word, expected, limit)
      if (distance <= limit && distance < bestSlips) {
        bestSlips = distance
        best = i
        if (distance === 0) break
      }
    }

    if (best >= 0) {
      at = best + 1
      hits++
      tail = true
      if (n >= words.length - LATE) late++
    }
  }

  return { at, hits, late, tail }
}

export interface Found extends Run {

  back: boolean
}

export function locate(grid: SongGrid, from: number, recent: string[]): Found {
  const heard = recent.map(normalizeWord).filter((word) => word.length >= MIN_WORD)
  const nothing: Found = { at: from, hits: 0, late: 0, tail: false, back: false }
  if (heard.length === 0) return nothing

  let best: Found = nothing
  let bestScore = 0
  let bestGap = Infinity

  const worth = (run: Run): number => run.hits + 3 * run.late

  for (let start = 0; start <= grid.words.length; start++) {
    const run = follow(grid, start, heard)
    if (run.hits === 0 || !run.tail) continue

    const back = run.at < from
    const gap = Math.abs(run.at - from)
    const score = worth(run)

    const better =
      score > bestScore ||
      (score === bestScore &&
        ((best.back && !back) || (back === best.back && gap < bestGap)))

    if (better) {
      best = { at: run.at, hits: run.hits, late: run.late, tail: true, back }
      bestScore = score
      bestGap = gap
    }
  }

  const wasLine = spotOf(grid, from).line
  const nowLine = spotOf(grid, best.at).line
  const jumped = Math.abs(nowLine - wasLine) > 1
  const need = jumped || best.back ? ENOUGH + 1 : ENOUGH

  return best.hits < need ? nothing : best
}

export function spotOf(grid: SongGrid, at: number): { line: number; word: number } {
  const edge = Math.min(Math.max(at, 0), grid.words.length)
  if (edge === 0) return { line: 0, word: 0 }

  const word = grid.words[edge - 1]
  let start = edge - 1
  while (start > 0 && grid.words[start - 1].line === word.line) start--

  const inLine = edge - start

  const whole = inLine >= grid.lengths[word.line]
  return whole ? { line: word.line + 1, word: 0 } : { line: word.line, word: inLine }
}

export function startOfLine(grid: SongGrid, line: number): number {
  let at = 0
  for (let i = 0; i < line && i < grid.lengths.length; i++) at += grid.lengths[i]
  return at
}

export function grammarOf(lines: string[]): string {
  const phrases = new Set<string>()
  for (const line of lines) {
    const words = wordsOf(line)
    if (words.length > 0) phrases.add(words.join(' '))
  }
  return JSON.stringify([...phrases, '[unk]'])
}

export function freshWords(previous: string, current: string): string[] {
  const was = previous.split(/\s+/).filter(Boolean)
  const now = current.split(/\s+/).filter(Boolean)

  let same = 0
  while (same < was.length && same < now.length && was[same] === now[same]) same++

  return now.slice(same)
}
