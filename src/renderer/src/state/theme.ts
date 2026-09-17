import { create } from 'zustand'
import { DEFAULT_THEME, isTheme, type Chrome, type ThemeId } from '@shared/themes'

interface ThemeStore {
  theme: ThemeId
  init: () => Promise<void>
  choose: (theme: ThemeId) => Promise<void>
}

export const useTheme = create<ThemeStore>((set) => ({
  theme: DEFAULT_THEME,

  init: async () => {
    const saved = (await window.api.settings.all()).theme
    const theme = isTheme(saved) ? saved : DEFAULT_THEME
    apply(theme)
    set({ theme })
  },

  choose: async (theme) => {
    apply(theme)
    set({ theme })
    await window.api.settings.set('theme', theme)
  }
}))

function apply(theme: ThemeId): void {
  document.documentElement.dataset.theme = theme

  requestAnimationFrame(() => {
    const chrome = readChrome()
    if (chrome) void window.api.app.chrome(chrome)
  })
}

function readChrome(): Chrome | null {
  const css = getComputedStyle(document.documentElement)
  const value = (name: string): string => css.getPropertyValue(name).trim()

  const chrome = {
    back: value('--surface-0'),
    bar: value('--surface-1'),
    symbol: value('--text-2')
  }

  const hex = /^#[0-9a-f]{6}$/i
  return Object.values(chrome).every((color) => hex.test(color)) ? chrome : null
}
