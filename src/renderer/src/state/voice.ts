import { create } from 'zustand'
import type { KaraokeLook } from '@shared/types'
import { KARAOKE_COLORS, KARAOKE_LOOK } from '@shared/slide'
import { bestKaraokeColor, bestKaraokeColors } from '@shared/contrast'
import { patchesUnderLines, patchUnderText } from '../lib/backLight'
import { grammarOf, plainLine } from '@shared/karaokeMatch'
import { useLive } from './live'
import { useSongs, type SongSlide } from './songs'

export interface VoiceModel {
  installed: boolean
  bytes: number
}

export interface VoiceStep {
  stage: 'ask' | 'download' | 'save' | 'done'
  got?: number
  total?: number
}

export interface VoiceStatus {
  state: string
  error?: string
  using?: string
  level?: number
  devices?: { id: string; label: string }[]
}

interface VoiceStore {
  model: VoiceModel | null

  step: VoiceStep | null
  busy: boolean
  error: string | null
  status: VoiceStatus
  devices: { id: string; label: string }[]
  deviceId: string | null

  heard: string

  grammar: string | null
  on: boolean

  autoTurn: boolean

  autoColor: boolean

  init: () => Promise<void>
  install: () => Promise<void>
  installFile: () => Promise<void>
  setDevice: (id: string | null) => void
  setAutoTurn: (value: boolean) => void
  listen: (on: boolean, grammar: string | null) => Promise<void>
  toggle: () => Promise<void>
  setLook: (patch: Partial<KaraokeLook>) => Promise<void>
  setAutoColor: (on: boolean) => Promise<void>

  refitColor: () => Promise<void>
  setGrammar: (grammar: string | null) => Promise<void>
}

export const useVoice = create<VoiceStore>((set, get) => ({
  model: null,
  step: null,
  busy: false,
  error: null,
  status: { state: 'off' },
  devices: [],
  deviceId: null,
  heard: '',
  grammar: null,
  on: false,
  autoTurn: true,
  autoColor: true,

  init: async () => {
    const [model, saved] = await Promise.all([
      window.api.voice.model(),
      window.api.settings.all()
    ])

    set({
      model,
      deviceId: typeof saved.voiceDevice === 'string' ? saved.voiceDevice : null,
      autoTurn: saved.voiceAutoTurn !== false,
      autoColor: saved.karaokeAutoColor !== false
    })

    const kept = saved.karaokeLook as Partial<KaraokeLook> | undefined
    if (kept && (typeof kept.color === 'string' || typeof kept.ms === 'number')) {
      await useLive.getState().setKaraokeLook({ ...KARAOKE_LOOK, ...kept })
    }

    window.api.voice.onStatus((status) => {
      set({
        status: { ...get().status, ...status },
        ...(status.devices ? { devices: status.devices } : {}),
        ...(status.state === 'error' ? { on: false, error: status.error ?? null } : {}),
        ...(status.state === 'listening' ? { error: null } : {})
      })
    })
    window.api.voice.onHeard(({ text }) => set({ heard: text }))
    window.api.voice.onInstallStep((step) => set({ step }))
  },

  install: async () => {
    set({ busy: true, error: null, step: { stage: 'ask' } })
    try {
      set({ model: await window.api.voice.install() })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    } finally {
      set({ busy: false, step: null })
    }
  },

  installFile: async () => {
    set({ busy: true, error: null })
    try {
      const model = await window.api.voice.installFile()
      if (model) set({ model })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    } finally {
      set({ busy: false })
    }
  },

  setDevice: (id) => {
    set({ deviceId: id })
    void window.api.settings.set('voiceDevice', id)

    if (get().on) {
      void window.api.voice.command({ do: 'start', deviceId: id, grammar: get().grammar })
    }
  },

  setAutoTurn: (value) => {
    set({ autoTurn: value })
    void window.api.settings.set('voiceAutoTurn', value)
  },

  listen: async (on, grammar) => {
    set({ on, error: null, grammar, heard: '' })

    if (on) {
      await window.api.voice.command({ do: 'start', deviceId: get().deviceId, grammar })
    } else {
      await window.api.voice.command({ do: 'stop' })
      set({ status: { state: 'off' } })
      await useLive.getState().stopKaraoke()
    }
  },

  toggle: async () => {
    const on = get().on
    await get().listen(!on, on ? null : grammarFor(useSongs.getState().slides))
  },

  setLook: async (patch) => {
    const now = useLive.getState().live.karaokeLook ?? KARAOKE_LOOK
    const look = { ...now, ...patch }
    await useLive.getState().setKaraokeLook(look)
    void window.api.settings.set('karaokeLook', look)

    if (patch.color !== undefined && get().autoColor) {
      set({ autoColor: false })
      void window.api.settings.set('karaokeAutoColor', false)
    }
  },

  setAutoColor: async (on) => {
    set({ autoColor: on })
    void window.api.settings.set('karaokeAutoColor', on)
    if (on) await get().refitColor()
  },

  refitColor: async () => {
    if (!get().autoColor) return

    const slide = useLive.getState().live.slide
    if (!slide) return

    const whole = await patchUnderText(slide.background, slide.style)
    if (!whole) return

    const color = bestKaraokeColor(whole, slide.style.color, KARAOKE_COLORS)
    if (!color) return

    const bands = await patchesUnderLines(
      slide.background,
      slide.style,
      slide.blocks.length
    )
    const colors = bestKaraokeColors(whole, bands, slide.style.color, KARAOKE_COLORS)

    const look = useLive.getState().live.karaokeLook ?? KARAOKE_LOOK
    if (look.color === color && sameColors(look.colors, colors)) return

    await useLive.getState().setKaraokeLook({ ...look, color, colors })
  },

  setGrammar: async (grammar) => {
    set({ grammar, heard: '' })
    if (!get().on) return

    await window.api.voice.command({ do: 'grammar', grammar })
  }
}))

export function grammarFor(slides: SongSlide[]): string | null {
  const lines = slides.flatMap((one) => one.slide.blocks.map((b) => plainLine(b.html)))
  return lines.length > 0 ? grammarOf(lines) : null
}

export function watchKaraokeBackground(): () => void {
  let shown = ''

  return useLive.subscribe((now) => {
    const slide = now.live.slide

    const key = slide ? JSON.stringify(slide.background) + '|' + slide.blocks.length : ''
    if (key === shown) return

    shown = key
    void useVoice.getState().refitColor()
  })
}

function sameColors(was: string[] | undefined, now: string[]): boolean {
  if (!was) return now.length === 0
  return was.length === now.length && was.every((one, i) => one === now[i])
}
