import { create } from 'zustand'
import type {
  Background,
  BackgroundItem,
  SlideStyle,
  SlideTemplate
} from '@shared/types'
import { BUILTIN_BACKGROUNDS, DEFAULT_BACKGROUND } from '@shared/backgrounds'
import { DEFAULT_STYLE } from '@shared/slide'
import { t } from '@shared/i18n'

export type LookScope = 'bible' | 'texts' | 'songs'

export interface Look {
  style: SlideStyle
  background: Background
}

interface LookStore {
  byTab: Record<LookScope, Look>
  templates: SlideTemplate[]

  userBackgrounds: BackgroundItem[]

  init: () => Promise<void>
  setStyle: (scope: LookScope, patch: Partial<SlideStyle>) => void
  setBackground: (scope: LookScope, background: Background) => void
  resetLook: (scope: LookScope) => void
  loadBackgrounds: () => Promise<void>
  addBackgrounds: () => Promise<void>
  deleteBackground: (id: string) => Promise<void>
  saveTemplate: (name: string, style: SlideStyle, background: Background) => void
  deleteTemplate: (id: string) => void
}

const defaults = (): Record<LookScope, Look> => ({
  bible: { style: { ...DEFAULT_STYLE }, background: DEFAULT_BACKGROUND },
  texts: {

    style: { ...DEFAULT_STYLE, fontSizeVh: 8, showVerseNumbers: false },
    background: DEFAULT_BACKGROUND
  },
  songs: { style: { ...DEFAULT_STYLE }, background: DEFAULT_BACKGROUND }
})

export const useLook = create<LookStore>((set, get) => ({
  byTab: defaults(),
  templates: [],
  userBackgrounds: [],

  init: async () => {
    const saved = await window.api.settings.all()
    const base = defaults()
    const stored = saved.looks as Partial<Record<LookScope, Partial<Look>>> | undefined

    const legacyStyle = saved.style as Partial<SlideStyle> | undefined
    const legacyBackground = saved.background as Background | undefined

    const byTab = Object.fromEntries(
      (Object.keys(base) as LookScope[]).map((scope) => [
        scope,
        {
          style: {
            ...base[scope].style,
            ...legacyStyle,
            ...stored?.[scope]?.style
          },
          background:
            stored?.[scope]?.background ?? legacyBackground ?? base[scope].background
        }
      ])
    ) as Record<LookScope, Look>

    set({ byTab, templates: (saved.templates as SlideTemplate[] | undefined) ?? [] })
    await get().loadBackgrounds()
  },

  setStyle: (scope, patch) => {
    const byTab = get().byTab
    const next = {
      ...byTab,
      [scope]: { ...byTab[scope], style: { ...byTab[scope].style, ...patch } }
    }
    set({ byTab: next })
    void window.api.settings.set('looks', next)
  },

  setBackground: (scope, background) => {
    const next = { ...get().byTab, [scope]: { ...get().byTab[scope], background } }
    set({ byTab: next })
    void window.api.settings.set('looks', next)
  },

  resetLook: (scope) => {
    const next = { ...get().byTab, [scope]: defaults()[scope] }
    set({ byTab: next })
    void window.api.settings.set('looks', next)
  },

  loadBackgrounds: async () =>
    set({ userBackgrounds: await window.api.backgrounds.list() }),

  addBackgrounds: async () =>
    set({ userBackgrounds: await window.api.backgrounds.add() }),

  deleteBackground: async (id) =>
    set({ userBackgrounds: await window.api.backgrounds.remove(id) }),

  saveTemplate: (name, style, background) => {
    const templates = [
      ...get().templates,
      {
        id: `tpl-${Date.now()}`,
        name: name.trim() || t('control.templateNo', { n: get().templates.length + 1 }),
        style,
        background
      }
    ]
    set({ templates })
    void window.api.settings.set('templates', templates)
  },

  deleteTemplate: (id) => {
    const templates = get().templates.filter((t) => t.id !== id)
    set({ templates })
    void window.api.settings.set('templates', templates)
  }
}))

export const lookFor = (scope: LookScope): Look => useLook.getState().byTab[scope]

export function allBackgrounds(userBackgrounds: BackgroundItem[]): BackgroundItem[] {
  return [...BUILTIN_BACKGROUNDS, ...userBackgrounds]
}
