import { create } from 'zustand'

export type TabId = 'home' | 'bible' | 'texts' | 'songs'

export type DialogId =
  | 'keys'
  | 'about'
  | 'trash'
  | 'modules'
  | 'update'
  | 'remote'
  | 'catalog'

interface UiStore {
  tab: TabId

  returnTo: TabId | null
  dialog: DialogId | null
  setTab: (tab: TabId) => void
  setDialog: (dialog: DialogId | null) => void

  goEdit: (tab: TabId) => void
  back: () => void
}

export const useUi = create<UiStore>((set, get) => ({
  tab: 'home',
  returnTo: null,
  dialog: null,

  setTab: (tab) => set({ tab, returnTo: null }),

  setDialog: (dialog) => set({ dialog }),

  goEdit: (tab) => set({ tab, returnTo: get().returnTo ?? 'home' }),

  back: () => {
    const to = get().returnTo
    if (to) set({ tab: to, returnTo: null })
  }
}))
