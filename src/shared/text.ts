export function normalizeTranslatorTag(html: string): string {
  const trimmed = html.trim()
  if (!trimmed.startsWith('<t>') || !trimmed.endsWith('</t>')) return html

  const inner = trimmed.slice(3, -4)

  return inner.includes('</t>') ? html : inner
}

export function toPlain(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export function splitBySentences(text: string, parts: number): string[] {
  if (parts <= 1) return [text]

  const units = splitIntoUnits(text, parts)
  if (units.length <= parts) {
    return units.length ? units : [text]
  }

  const target = text.length / parts
  const chunks: string[] = []
  let current = ''

  for (let i = 0; i < units.length; i++) {
    const remainingUnits = units.length - i
    const remainingChunks = parts - chunks.length
    const mustTake = remainingUnits <= remainingChunks && current !== ''

    if (mustTake || (current && current.length + units[i].length > target * 1.35)) {
      chunks.push(current.trim())
      current = units[i]
    } else {
      current = current ? `${current} ${units[i]}` : units[i]
    }

    if (chunks.length === parts - 1) {
      current = [current, ...units.slice(i + 1)].join(' ')
      break
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks
}

function splitIntoUnits(text: string, parts: number): string[] {
  const bySentence = matchOrEmpty(text, /[^.!?…]+(?:[.!?…]+["»)]*)?\s*/g)
  if (bySentence.length >= parts) return bySentence

  const byClause = matchOrEmpty(text, /[^,;:—]+(?:[,;:—]+)?\s*/g)
  if (byClause.length >= parts) return byClause

  return text.split(/\s+/).filter(Boolean)
}

function matchOrEmpty(text: string, re: RegExp): string[] {
  return (text.match(re) ?? []).map((s) => s.trim()).filter(Boolean)
}

export function plural(n: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(n) % 100
  const mod10 = mod100 % 10
  if (mod100 >= 11 && mod100 <= 14) return many
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}
