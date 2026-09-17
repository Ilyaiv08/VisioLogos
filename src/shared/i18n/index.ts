import { ru } from './ru'
import { en } from './en'

export type Lang = 'ru' | 'en'

export type Key = keyof typeof ru

export type Dict = Record<Key, string>

export const LANGS: { id: Lang; label: string }[] = [
  { id: 'ru', label: 'Русский' },
  { id: 'en', label: 'English' }
]

const DICTS: Record<Lang, Dict> = { ru, en }

export const isLang = (value: unknown): value is Lang =>
  value === 'ru' || value === 'en'

let current: Lang = 'ru'

export function setLang(lang: Lang): void {
  current = lang
}

export function lang(): Lang {
  return current
}

export function t(key: Key, params?: Record<string, string | number>): string {
  const line = DICTS[current][key] ?? DICTS.ru[key] ?? String(key)
  if (!params) return line

  return line.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole
  )
}

export function plural(n: number, lang = current): 'one' | 'few' | 'many' {
  const count = Math.abs(n)

  if (lang === 'en') return count === 1 ? 'one' : 'many'

  const ten = count % 10
  const hundred = count % 100
  if (ten === 1 && hundred !== 11) return 'one'
  if (ten >= 2 && ten <= 4 && (hundred < 12 || hundred > 14)) return 'few'
  return 'many'
}

export function tn(
  key: string,
  n: number,
  params?: Record<string, string | number>
): string {
  return t(`${key}.${plural(n)}` as Key, { n, ...params })
}
