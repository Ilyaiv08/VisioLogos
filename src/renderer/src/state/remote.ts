import { create } from 'zustand'
import { useLive } from './live'
import { stepOnScreen } from './output'
import { useService } from './service'
import { useSongs } from './songs'
import { useTexts } from './texts'
import { useBible } from './store'
import { useUi } from './ui'

export interface RemoteDevice {
  name: string
  likely: boolean
}

interface RemoteStore {

  on: boolean

  global: boolean
  devices: RemoteDevice[]

  looking: boolean

  lastKey: string | null
  lastAt: number | null

  init: () => Promise<void>
  setOn: (on: boolean) => void
  setGlobal: (on: boolean) => void
  scan: (fresh?: boolean) => Promise<void>
  noticed: (code: string) => void
}

export const useRemote = create<RemoteStore>((set, get) => ({
  on: true,
  global: true,
  devices: [],
  looking: false,
  lastKey: null,
  lastAt: null,

  init: async () => {
    const saved = await window.api.settings.all()

    if (saved.presenter === false) set({ on: false })
    if (saved.presenterGlobal === false) set({ global: false })
  },

  setOn: (on) => {
    set({ on })
    void window.api.settings.set('presenter', on)
  },

  setGlobal: (on) => {
    set({ global: on })
    void window.api.settings.set('presenterGlobal', on)
  },

  scan: async (fresh = false) => {
    if (get().looking) return
    set({ looking: true })
    try {
      set({ devices: await window.api.remote.list(fresh) })
    } finally {
      set({ looking: false })
    }
  },

  noticed: (code) => set({ lastKey: code, lastAt: Date.now() })
}))

export function pressRemote(code: string): boolean {
  if (!useRemote.getState().on) return false

  if (code === 'PageDown') {
    useRemote.getState().noticed(code)
    void step(1)
    return true
  }
  if (code === 'PageUp') {
    useRemote.getState().noticed(code)
    void step(-1)
    return true
  }

  if (code === 'Period' || code === 'NumpadDecimal') {
    useRemote.getState().noticed(code)
    void useLive.getState().toggleBlackout()
    return true
  }

  return false
}

async function step(delta: number): Promise<void> {
  if (await stepOnScreen(delta)) return

  const service = useService.getState()
  const tab = useUi.getState().tab

  if (service.running || tab === 'home') {
    await service.stepInside(delta)
    return
  }

  if (tab === 'songs') await useSongs.getState().step(delta)
  else if (tab === 'texts') await useTexts.getState().stepSlide(delta)
  else await useBible.getState().stepVerse(delta)
}
