import { create } from 'zustand'
import type { UpdateNews, UpdateStep } from '@shared/update'

interface UpdateStore {
  news: UpdateNews | null

  step: UpdateStep | null

  asking: boolean

  check: (fresh?: boolean) => Promise<void>

  install: () => Promise<void>

  clearStep: () => void
}

export const useUpdate = create<UpdateStore>((set, get) => ({
  news: null,
  step: null,
  asking: false,

  check: async (fresh = false) => {
    if (get().asking) return
    set({ asking: true })
    try {
      set({ news: await window.api.update.check(fresh) })
    } catch {

    } finally {
      set({ asking: false })
    }
  },

  install: async () => {
    if (get().step) return
    set({ step: { stage: 'download', got: 0, total: get().news?.bytes ?? 0 } })
    const answer = await window.api.update.install()

    if (answer.ok) set({ step: null })
  },

  clearStep: () => set({ step: null })
}))

window.api.update.onProgress((step) => useUpdate.setState({ step }))
