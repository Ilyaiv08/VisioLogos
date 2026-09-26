import {
  followFrom,
  hear,
  normalizeWord,
  phrasesOf,
  plainLine,
  tapeOf,
  tokensOf,
  type Follow,
  type Tape,
  type TapeSlide,
  type TapeWord
} from '@shared/singAlong'
import { useLive } from './live'
import { useSongs, type SongSlide } from './songs'
import { useVoice } from './voice'

interface Built {
  tape: Tape
  slides: TapeSlide[]
  grammar: string | null
  text: string
  song: string | null
}

const textKey = (slides: SongSlide[]): string =>
  slides.map((one) => one.slide.blocks.map((b) => b.html).join('\n')).join('\n\n')

const timesOf = (slides: SongSlide[]): string => slides.map((one) => one.times).join(',')

export function startVoiceFollow(): () => void {
  let built: Built | null = null
  let state: Follow | null = null
  let consumed = 0
  let expecting = -1
  let generation = 0

  const now = (): number => performance.now()

  const publish = (): void => {
    const mark = state && built ? built.tape.slides[state.slide] : undefined
    const sung = state && mark ? { slide: state.slide, pass: state.pass, times: mark.times } : null
    const was = useVoice.getState().sung
    if (
      was?.slide === sung?.slide &&
      was?.pass === sung?.pass &&
      was?.times === sung?.times
    ) {
      return
    }
    useVoice.setState({ sung })
  }

  async function build(): Promise<Built | null> {
    const my = ++generation
    const { slides, draft } = useSongs.getState()

    const lines = slides.map((one) => one.slide.blocks.map((b) => tokensOf(plainLine(b.html))))
    const tokens = [...new Set(lines.flat(2))]
    const spelled =
      tokens.length > 0 ? await window.api.voice.spell(tokens).catch(() => null) : null
    if (my !== generation) return null

    const parts = (token: string): string[] => (spelled ? (spelled[token] ?? []) : [token])

    const tapeSlides: TapeSlide[] = slides.map((one, index) => ({
      times: one.times,
      lines: lines[index].map((line) =>
        line.flatMap((token): TapeWord[] => {
          const known = parts(token)
          return known.length > 0
            ? known.map((word) => ({ norm: normalizeWord(word), hear: true }))
            : [{ norm: normalizeWord(token), hear: false }]
        })
      )
    }))

    const phrases = lines.flat().map((line) => line.flatMap(parts))

    return {
      tape: tapeOf(tapeSlides),
      slides: tapeSlides,
      grammar: phrases.some((one) => one.length > 0) ? phrasesOf(phrases) : null,
      text: textKey(slides),
      song: draft?.id ?? null
    }
  }

  async function refresh(): Promise<string | null> {
    const next = await build()
    if (!next) return built?.grammar ?? null

    built = next
    state = followFrom(next.tape, useSongs.getState().index, now())
    consumed = 0
    expecting = -1
    publish()

    await useVoice.getState().setGrammar(next.grammar)
    return next.grammar
  }

  function retime(slides: SongSlide[]): void {
    if (!built || built.slides.length !== slides.length) return

    const tapeSlides = built.slides.map((one, i) => ({ ...one, times: slides[i].times }))
    built = { ...built, slides: tapeSlides, tape: tapeOf(tapeSlides) }
    publish()
  }

  async function go(to: number): Promise<void> {
    const songs = useSongs.getState()
    if (to === songs.index || to < 0 || to >= songs.slides.length) return

    expecting = to
    const live = useLive.getState().live.slide
    const draft = songs.draft
    const ours = live !== null && draft !== null && live.id.startsWith(`song-${draft.id}-`)

    if (ours) await songs.goTo(to)
    else useSongs.setState({ index: to })
  }

  useVoice.setState({ prepare: refresh })

  const offSongs = useSongs.subscribe((after, before) => {
    if (!useVoice.getState().on) return

    if (after.draft?.id !== before.draft?.id || after.slides !== before.slides) {
      const text = textKey(after.slides)
      if (!built || built.song !== (after.draft?.id ?? null) || built.text !== text) {
        void refresh()
        return
      }
      if (timesOf(after.slides) !== built.slides.map((one) => one.times).join(',')) {
        retime(after.slides)
      }
    }

    if (after.index !== before.index) {
      if (after.index === expecting) {
        expecting = -1
        return
      }
      if (built) {
        state = followFrom(built.tape, after.index, now())
        publish()
      }
    }
  })

  const offHeard = window.api.voice.onHeard(({ text, final }) => {
    if (!useVoice.getState().on || !built || !state) {
      consumed = 0
      return
    }

    const words = text.split(/\s+/).filter(Boolean)
    if (words.length < consumed) consumed = words.length
    const fresh = words.slice(consumed)
    consumed = final ? 0 : words.length
    if (fresh.length === 0) return

    const result = hear(built.tape, state, fresh, now())
    state = result.state
    publish()

    if (result.step.kind === 'turn' || result.step.kind === 'jump') void go(result.step.to)
  })

  const offVoice = useVoice.subscribe((after, before) => {
    if (after.on === before.on) return
    consumed = 0
    expecting = -1
    if (!after.on) {
      state = null
      publish()
    }
  })

  return () => {
    offSongs()
    offHeard()
    offVoice()
    useVoice.setState({ prepare: null })
  }
}
