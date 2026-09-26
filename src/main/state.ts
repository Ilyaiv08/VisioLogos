import type { LiveState, LowerThird, Slide, StageInfo } from '@shared/types'

const EMPTY_STAGE: StageInfo = {
  nextTitle: null,
  nextLines: [],
  startedAt: null
}

let live: LiveState = {
  slide: null,
  lowerThird: null,
  stage: EMPTY_STAGE,
  blackout: false,
  hideText: false,
  revision: 0
}

type Listener = (state: LiveState) => void
const listeners = new Set<Listener>()

export function getLive(): LiveState {
  return live
}

export function subscribeLive(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function commit(next: Omit<LiveState, 'revision'>): LiveState {
  live = { ...next, revision: live.revision + 1 }
  for (const listener of listeners) listener(live)
  return live
}

export function showSlide(slide: Slide): LiveState {

  return commit({
    ...live,
    slide,
    blackout: false,
    hideText: false
  })
}

export function clearSlide(): LiveState {
  return commit({ ...live, slide: null })
}

export function setBlackout(value: boolean): LiveState {
  return commit({ ...live, blackout: value })
}

export function setHideText(value: boolean): LiveState {
  return commit({ ...live, hideText: value })
}

export function setLowerThird(value: LowerThird | null): LiveState {
  return commit({ ...live, lowerThird: value })
}

export function setStage(patch: Partial<StageInfo>): LiveState {
  return commit({ ...live, stage: { ...live.stage, ...patch } })
}
