import { create } from 'zustand'
import { t } from '@shared/i18n'

const UNDO_LIMIT = 80

const MERGE_MS = 900

export interface UndoStep {

  label: string

  merge?: string
  undo: () => void | Promise<void>
  redo: () => void | Promise<void>

  at?: number
}

type Step = UndoStep & { at: number }

const joins = (previous: Step | undefined, next: UndoStep, now: number): boolean => {
  if (!previous || !next.merge) return false
  return previous.merge === next.merge && now - previous.at < MERGE_MS
}

function pushStep(past: Step[], step: Step, now = step.at): Step[] {
  const previous = past[past.length - 1]

  if (joins(previous, step, now)) {
    const merged: Step = { ...previous, at: step.at, redo: step.redo }
    return [...past.slice(0, -1), merged]
  }

  const next = [...past, step]
  return next.length > UNDO_LIMIT ? next.slice(next.length - UNDO_LIMIT) : next
}

interface UndoStore {
  past: Step[]
  future: Step[]

  applying: boolean

  notice: { text: string; n: number } | null

  remember: (step: UndoStep) => void

  extend: (more: Pick<UndoStep, 'undo' | 'redo'>) => void
  undo: () => Promise<void>
  redo: () => Promise<void>
  hideNotice: () => void
}

export const useUndo = create<UndoStore>((set, get) => ({
  past: [],
  future: [],
  applying: false,
  notice: null,

  remember: (step) => {
    if (get().applying) return
    const at = Date.now()

    set({ past: pushStep(get().past, { ...step, at }, at), future: [] })
  },

  extend: (more) => {
    const past = get().past
    const last = past[past.length - 1]
    if (!last || get().applying) return

    const merged: Step = {
      ...last,

      undo: async () => {
        await more.undo()
        await last.undo()
      },
      redo: async () => {
        await last.redo()
        await more.redo()
      }
    }
    set({ past: [...past.slice(0, -1), merged] })
  },

  undo: async () => {
    if (get().applying) return

    const past = get().past
    const step = past[past.length - 1]
    if (!step) {
      say(set, get, t('undo.nothing'))
      return
    }

    set({ applying: true })
    try {
      await step.undo()
    } finally {
      set({ applying: false })
    }

    set({ past: past.slice(0, -1), future: [...get().future, step] })
    say(set, get, t('undo.done', { what: step.label }))
  },

  redo: async () => {
    if (get().applying) return

    const future = get().future
    const step = future[future.length - 1]
    if (!step) {
      say(set, get, t('undo.nothingBack'))
      return
    }

    set({ applying: true })
    try {
      await step.redo()
    } finally {
      set({ applying: false })
    }

    set({ future: future.slice(0, -1), past: [...get().past, step] })
    say(set, get, t('undo.back', { what: step.label }))
  },

  hideNotice: () => set({ notice: null })
}))

type Set = (partial: Partial<UndoStore>) => void
type Get = () => UndoStore

function say(set: Set, get: Get, text: string): void {
  set({ notice: { text, n: (get().notice?.n ?? 0) + 1 } })
}

export function remember(step: UndoStep): void {
  useUndo.getState().remember(step)
}

export function alsoRemember(more: Pick<UndoStep, 'undo' | 'redo'>): void {
  useUndo.getState().extend(more)
}
