import { create } from 'zustand'
import { isLang, lang as currentLang, setLang, t, tn, type Key, type Lang } from '@shared/i18n'

interface I18nStore {
  lang: Lang
  init: () => Promise<void>
  choose: (lang: Lang) => Promise<void>
}

export const useI18n = create<I18nStore>((set) => ({
  lang: currentLang(),

  init: async () => {
    const saved = (await window.api.settings.all()).lang
    const lang = isLang(saved) ? saved : 'ru'
    setLang(lang)
    set({ lang })
  },

  choose: async (lang) => {
    setLang(lang)
    set({ lang })
    await window.api.settings.set('lang', lang)
  }
}))

export function useT(): (key: Key, params?: Record<string, string | number>) => string {
  useI18n((s) => s.lang)
  return t
}

export function useTn(): (
  key: string,
  n: number,
  params?: Record<string, string | number>
) => string {
  useI18n((s) => s.lang)
  return tn
}
