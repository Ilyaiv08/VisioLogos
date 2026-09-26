import { create } from 'zustand'
import type { LiveState, Slide, StageInfo } from '@shared/types'
import { releaseScreen } from './output'

const EMPTY: LiveState = {
  slide: null,
  lowerThird: null,
  stage: { nextTitle: null, nextLines: [], startedAt: null },
  blackout: false,
  hideText: false,
  revision: 0
}

interface LiveStore {
  live: LiveState
  init: () => Promise<void>
  setLive: (live: LiveState) => void
  show: (slide: Slide) => Promise<void>
  clear: () => Promise<void>
  toggleBlackout: () => Promise<void>
  toggleHideText: () => Promise<void>
  showLowerThird: (text: string) => Promise<void>
  clearLowerThird: () => Promise<void>
  setStage: (patch: Partial<StageInfo>) => Promise<void>
}

export const useLive = create<LiveStore>((set, get) => ({
  live: EMPTY,

  init: async () => set({ live: await window.api.live.get() }),

  setLive: (live) => set({ live }),

  show: async (slide) => set({ live: await window.api.live.show(slide) }),

  clear: async () => {

    releaseScreen()
    set({ live: await window.api.live.clear() })
  },

  toggleBlackout: async () =>
    set({ live: await window.api.live.blackout(!get().live.blackout) }),

  toggleHideText: async () =>
    set({ live: await window.api.live.hideText(!get().live.hideText) }),

  showLowerThird: async (text) =>
    set({ live: await window.api.live.lowerThird({ text }) }),

  clearLowerThird: async () => set({ live: await window.api.live.lowerThird(null) }),

  setStage: async (patch) => set({ live: await window.api.live.stage(patch) })
}))
