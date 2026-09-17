import { create } from 'zustand'
import type { Deck, Slide } from '@shared/types'
import { deckSlides } from '@shared/decks'
import { DEFAULT_STYLE } from '@shared/slide'
import { t } from '@shared/i18n'
import { remember } from './undo'
import { useLive } from './live'
import { ownsScreen } from './output'

export interface DeckReport {
  added: number

  ids: string[]
  names: string[]
  skipped: { file: string; reason: string }[]
}

interface DecksStore {
  items: Deck[]

  deckId: string | null
  index: number

  init: () => Promise<void>

  importFiles: (what?: 'decks' | 'photos' | 'folder') => Promise<DeckReport>
  addFiles: (files: string[]) => Promise<DeckReport>
  remove: (id: string) => Promise<void>

  open: (id: string) => void
  slides: () => Slide[]
  setIndex: (i: number) => void
  show: () => Promise<void>
  step: (delta: number) => Promise<void>

  advance: () => Promise<boolean>
}

export const useDecks = create<DecksStore>((set, get) => ({
  items: [],
  deckId: null,
  index: 0,

  init: async () => set({ items: await window.api.decks.list() }),

  importFiles: async (what = 'decks') => {
    const result = await window.api.decks.import(what)
    set({ items: result.decks })
    return report(result)
  },

  addFiles: async (files) => {
    const result = await window.api.decks.add(files)
    set({ items: result.decks })
    return report(result)
  },

  remove: async (id) => {
    const gone = get().items.find((d) => d.id === id)

    const drop = async (): Promise<void> => {
      const items = await window.api.decks.remove(id)
      useDecks.setState({
        items,
        deckId: useDecks.getState().deckId === id ? null : useDecks.getState().deckId
      })
    }

    await drop()
    if (!gone) return

    remember({
      label: t('undo.deckRemove', { name: gone.name }),
      undo: async () => {
        useDecks.setState({ items: await window.api.decks.restore(gone) })
      },
      redo: drop
    })
  },

  open: (id) => set({ deckId: id, index: 0 }),

  slides: () => {
    const deck = get().items.find((d) => d.id === get().deckId)
    return deck ? deckSlides(deck, DEFAULT_STYLE) : []
  },

  setIndex: (i) => {
    const max = Math.max(0, get().slides().length - 1)
    set({ index: Math.min(Math.max(i, 0), max) })
  },

  show: async () => {
    const slide = get().slides()[get().index]
    if (!slide) return
    await useLive.getState().show(slide)

    ownsScreen((delta) => useDecks.getState().step(delta))
  },

  step: async (delta) => {
    const next = get().index + delta
    if (next < 0 || next >= get().slides().length) return

    const wasLive = useLive.getState().live.slide !== null
    set({ index: next })
    if (wasLive) await get().show()
  },

  advance: async () => {
    if (get().index + 1 >= get().slides().length) return false
    await get().step(1)
    return true
  }
}))

const report = (result: {
  added: Deck[]
  skipped: { file: string; reason: string }[]
}): DeckReport => ({
  added: result.added.length,
  ids: result.added.map((d) => d.id),
  names: result.added.map((d) =>
    t(d.kind === 'photos' ? 'home.photoSlides' : 'home.deckSlides', {
      name: d.name,
      n: d.slides.length
    })
  ),
  skipped: result.skipped
})
