import { create } from 'zustand'

export interface TabLayout {

  top: number

  topCols?: number[]
  bottomCols: number[]
}

export type LayoutKey = 'bible' | 'texts' | 'songs' | 'home'
export type Row = 'topCols' | 'bottomCols'

const DEFAULTS: Record<LayoutKey, TabLayout> = {
  bible: {
    top: 300,

    bottomCols: [210, 230, 0, 252]
  },
  texts: {
    top: 380,

    topCols: [330, 0],

    bottomCols: [0, 252]
  },
  songs: {
    top: 400,

    topCols: [300, 0],

    bottomCols: [0, 252]
  },
  home: {
    top: 400,

    topCols: [300, 0],

    bottomCols: [0, 252]
  }
}

const MIN_FLEX = 320

const GUTTER = 18

const MINS: Record<LayoutKey, Partial<Record<Row, number[]>>> = {
  bible: {
    bottomCols: [160, 160, MIN_FLEX, 210]
  },
  texts: {
    topCols: [200, MIN_FLEX],
    bottomCols: [MIN_FLEX, 210]
  },
  songs: {
    topCols: [200, MIN_FLEX],
    bottomCols: [MIN_FLEX, 210]
  },
  home: {
    topCols: [200, MIN_FLEX],
    bottomCols: [MIN_FLEX, 210]
  }
}

interface LayoutStore {
  byTab: Record<LayoutKey, TabLayout>
  init: () => Promise<void>
  setTop: (tab: LayoutKey, px: number, available: number) => void
  setCol: (tab: LayoutKey, row: Row, index: number, px: number, available: number) => void
  reset: (tab: LayoutKey) => void
}

const clone = (): Record<LayoutKey, TabLayout> => ({
  bible: { ...DEFAULTS.bible, bottomCols: [...DEFAULTS.bible.bottomCols] },
  texts: {
    ...DEFAULTS.texts,
    topCols: [...(DEFAULTS.texts.topCols ?? [])],
    bottomCols: [...DEFAULTS.texts.bottomCols]
  },
  songs: {
    ...DEFAULTS.songs,
    topCols: [...(DEFAULTS.songs.topCols ?? [])],
    bottomCols: [...DEFAULTS.songs.bottomCols]
  },
  home: {
    ...DEFAULTS.home,
    topCols: [...(DEFAULTS.home.topCols ?? [])],
    bottomCols: [...DEFAULTS.home.bottomCols]
  }
})

export const useLayout = create<LayoutStore>((set, get) => ({
  byTab: clone(),

  init: async () => {
    const saved = (await window.api.settings.all()).layout as
      | Partial<Record<LayoutKey, Partial<TabLayout>>>
      | undefined
    if (!saved) return

    const base = clone()
    for (const key of Object.keys(base) as LayoutKey[]) {
      const s = saved[key]
      if (!s) continue
      base[key] = {

        top: typeof s.top === 'number' && s.top >= 180 ? s.top : base[key].top,

        topCols: base[key].topCols && sameShape(s.topCols, base[key].topCols),
        bottomCols: sameShape(s.bottomCols, base[key].bottomCols)
      }
    }
    set({ byTab: base })
  },

  setTop: (tab, px, available) => {

    const max = Math.max(200, available - 330)
    commit(set, get, tab, { top: clamp(Math.round(px), 180, max) })
  },

  setCol: (tab, row, index, px, available) => {
    const current = get().byTab[tab][row]
    if (!current) return

    const cols = [...current]
    if (cols[index] === undefined) return

    const min = MINS[tab][row]?.[index] ?? MIN_FLEX
    const others = cols.reduce(
      (sum, w, i) => (i === index || w === 0 ? sum : sum + w),
      0
    )
    const flexible = cols.some((w) => w === 0) ? MIN_FLEX : 0
    const gutters = (cols.length - 1) * GUTTER

    const max = Math.max(min, available - others - flexible - gutters)

    cols[index] = clamp(Math.round(px), min, max)
    commit(set, get, tab, { [row]: cols })
  },

  reset: (tab) => {
    const next = { ...get().byTab, [tab]: clone()[tab] }
    set({ byTab: next })
    void window.api.settings.set('layout', next)
  }
}))

function sameShape(saved: number[] | undefined, fallback: number[]): number[] {
  return Array.isArray(saved) && saved.length === fallback.length ? saved : fallback
}

const clamp = (n: number, min: number, max: number): number =>
  Math.min(Math.max(n, min), Math.max(min, max))

function commit(
  set: (partial: Partial<LayoutStore>) => void,
  get: () => LayoutStore,
  tab: LayoutKey,
  patch: Partial<TabLayout>
): void {
  const next = { ...get().byTab, [tab]: { ...get().byTab[tab], ...patch } }
  set({ byTab: next })
  void window.api.settings.set('layout', next)
}

export function columnsTemplate(cols: number[]): string {
  return cols.map((w) => (w === 0 ? `minmax(${MIN_FLEX}px, 1fr)` : `${w}px`)).join(' auto ')
}
