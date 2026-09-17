import { t, type Key } from './i18n'

export type ThemeId =
  | 'night'
  | 'graphite'
  | 'midnight'
  | 'pine'
  | 'plum'
  | 'coffee'
  | 'day'
  | 'paper'
  | 'mist'
  | 'sky'
  | 'vitrage'
  | 'sunset'
  | 'neon'

export type ThemeFamily = 'dark' | 'light' | 'bright'

export const FAMILIES: ThemeFamily[] = ['dark', 'light', 'bright']

export interface Theme {
  id: ThemeId
  family: ThemeFamily
}

export const THEMES: Theme[] = [
  { id: 'night', family: 'dark' },
  { id: 'graphite', family: 'dark' },
  { id: 'midnight', family: 'dark' },
  { id: 'pine', family: 'dark' },
  { id: 'plum', family: 'dark' },
  { id: 'coffee', family: 'dark' },

  { id: 'day', family: 'light' },
  { id: 'paper', family: 'light' },
  { id: 'mist', family: 'light' },
  { id: 'sky', family: 'light' },

  { id: 'vitrage', family: 'bright' },
  { id: 'sunset', family: 'bright' },
  { id: 'neon', family: 'bright' }
]

export const DEFAULT_THEME: ThemeId = 'night'

export const isTheme = (value: unknown): value is ThemeId =>
  THEMES.some((theme) => theme.id === value)

export const themeName = (id: ThemeId): string => t(`theme.${id}` as Key)

export const familyName = (family: ThemeFamily): string => t(`style.${family}` as Key)

export const themesOf = (family: ThemeFamily): Theme[] =>
  THEMES.filter((theme) => theme.family === family)

export interface Chrome {

  back: string

  bar: string

  symbol: string
}

export const NIGHT_CHROME: Chrome = {
  back: '#08090b',
  bar: '#0e0f12',
  symbol: '#99a0ab'
}

export function isChrome(value: unknown): value is Chrome {
  if (!value || typeof value !== 'object') return false
  const chrome = value as Record<string, unknown>
  return (['back', 'bar', 'symbol'] as const).every(
    (key) => typeof chrome[key] === 'string' && /^#[0-9a-f]{6}$/i.test(chrome[key])
  )
}
