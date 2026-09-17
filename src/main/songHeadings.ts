interface Rule {
  re: RegExp
  heading: (n: string) => string
}

const RULES: Rule[] = [
  { re: /^(?:припев|chorus|refrain|реф(?:рен)?|c)$/, heading: () => 'Припев:' },
  { re: /^(?:предприпев|pre[\s-]?chorus|pre|p)$/, heading: () => 'Предприпев' },
  { re: /^(?:бридж|bridge|переход|b)$/, heading: () => 'Бридж' },
  { re: /^(?:повтор|tag|t)$/, heading: () => 'Повтор' },
  { re: /^(?:концовка|окончание|ending|end|outro|o|e)$/, heading: () => 'Концовка' },
  { re: /^(?:куплет|verse|стих|v)$/, heading: (n) => `Куплет ${n || 1}` },

  { re: /^$/, heading: (n) => (n ? `Куплет ${n}` : '') }
]

export function headingFromLabel(label: string): string | null {
  const clean = label
    .trim()
    .toLowerCase()
    .replace(/^[[({]|[\])}]$/g, '')
    .replace(/[:.)\-–—]+$/, '')
    .trim()

  const m = /^([a-zа-яё\s-]*?)\s*(\d*)$/.exec(clean)
  if (!m) return null

  const word = m[1].trim()
  const number = m[2]

  for (const rule of RULES) {
    if (rule.re.test(word)) {
      const heading = rule.heading(number)
      return heading || null
    }
  }
  return null
}

export const looksLikePartLabel = (text: string): boolean =>
  text.length <= 24 && !text.includes('\n') && headingFromLabel(text) !== null
