import { create } from 'zustand'
import type { DisplayInfo } from '@shared/types'
import { DEFAULT_ASPECT } from '@shared/slide'
import { previewScreen, screenAspect } from '@shared/screens'

interface ScreenStore {

  aspect: number

  displays: DisplayInfo[]

  previewId: number | null

  init: () => Promise<void>
  refresh: () => Promise<void>

  pick: (id: number) => void
}

export const useScreen = create<ScreenStore>((set, get) => ({
  aspect: DEFAULT_ASPECT,
  displays: [],
  previewId: null,

  init: async () => {
    await measure(set, get)

    window.api.outputs.onChanged?.(() => void measure(set, get))
  },

  refresh: () => measure(set, get),

  pick: (previewId) => set({ previewId })
}))

export function useShot(): number {
  return useScreen((s) => {
    const chosen = s.displays.find((one) => one.id === s.previewId)
    return (chosen && screenAspect(chosen)) || s.aspect || DEFAULT_ASPECT
  })
}

type Set = (partial: Partial<ScreenStore>) => void
type Get = () => ScreenStore

async function measure(set: Set, get: Get): Promise<void> {
  try {
    const [outputs, displays] = await Promise.all([
      window.api.outputs.list(),
      window.api.outputs.displays()
    ])

    const hall = outputs.find((one) => one.role === 'hall') ?? outputs[0]
    const screen = hall ? displays.find((one) => one.id === hall.displayId) : null
    const size = screen?.bounds

    set({
      displays,

      previewId: previewScreen(displays, get().previewId, screen?.id ?? null),
      aspect:
        size && size.width > 0 && size.height > 0
          ? size.width / size.height
          : DEFAULT_ASPECT
    })
  } catch {

    set({ aspect: DEFAULT_ASPECT })
  }
}
