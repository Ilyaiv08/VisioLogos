import { create } from 'zustand'

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

export interface Sung {
  slide: number

  pass: number
  times: number
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

  sung: Sung | null

  prepare: (() => Promise<string | null>) | null

  init: () => Promise<void>
  install: () => Promise<void>
  installFile: () => Promise<void>
  setDevice: (id: string | null) => void
  listen: (on: boolean) => Promise<void>
  toggle: () => Promise<void>
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
  sung: null,
  prepare: null,

  init: async () => {
    const [model, saved] = await Promise.all([
      window.api.voice.model(),
      window.api.settings.all()
    ])

    set({
      model,
      deviceId: typeof saved.voiceDevice === 'string' ? saved.voiceDevice : null
    })

    window.api.voice.onStatus((status) => {
      set({
        status: { ...get().status, ...status },
        ...(status.devices ? { devices: status.devices } : {}),
        ...(status.state === 'error' ? { on: false, error: status.error ?? null } : {}),
        ...(status.state === 'listening' ? { error: null } : {})
      })
    })
    window.api.voice.onHeard(({ text }) => {
      if (text !== get().heard) set({ heard: text })
    })
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

  listen: async (on) => {
    if (!on) {
      set({ on: false, error: null, heard: '', sung: null })
      await window.api.voice.command({ do: 'stop' })
      set({ status: { state: 'off' } })
      return
    }

    set({ on: true, error: null, heard: '' })
    await window.api.voice.command({
      do: 'start',
      deviceId: get().deviceId,
      grammar: get().grammar
    })

    const prepare = get().prepare
    if (prepare && get().on) await prepare()
  },

  toggle: () => get().listen(!get().on),

  setGrammar: async (grammar) => {
    if (grammar === get().grammar) return
    set({ grammar })
    if (!get().on) return

    await window.api.voice.command({ do: 'grammar', grammar })
  }
}))
