import { useEffect } from 'react'
import { MenuBar, MenuDialogs, showCurrent, snapshot } from './components/MenuBar'
import { ScreensMenu } from './components/ScreensMenu'
import { HomeTab } from './tabs/HomeTab'
import { BibleTab } from './tabs/BibleTab'
import { TextsTab } from './tabs/TextsTab'
import { SongsTab } from './tabs/SongsTab'
import { useLive } from './state/live'
import { useLayout } from './state/layout'
import { useLook } from './state/look'
import { useBible } from './state/store'
import { useTexts } from './state/texts'
import { useTheme } from './state/theme'
import { useSongs } from './state/songs'
import { useService } from './state/service'
import { useTree } from './state/tree'
import { useUpdate } from './state/update'
import { useDecks } from './state/decks'
import { useScreen } from './state/screen'
import { pressRemote, useRemote } from './state/remote'
import { useUndo } from './state/undo'
import { grammarFor, useVoice, watchKaraokeBackground } from './state/voice'
import {
  freshWords,
  locate,
  plainLine,
  songGrid,
  spotOf,
  startOfLine
} from '@shared/karaokeMatch'
import { useI18n, useT } from './state/i18n'
import { useUi, type TabId } from './state/ui'

const TABS: TabId[] = ['home', 'bible', 'texts', 'songs']

export function App(): React.JSX.Element {
  const t = useT()
  const tab = useUi((s) => s.tab)
  const returnTo = useUi((s) => s.returnTo)

  useEffect(() => {

    void useI18n.getState().init()

    void useTheme.getState().init()

    void useLook.getState().init()
    void useLayout.getState().init()
    void useLive.getState().init()
    void useBible.getState().init()
    void useTexts.getState().init()
    void useSongs.getState().init()
    void useService.getState().init()
    void useTree.getState().init()
    void useDecks.getState().init()

    void useScreen.getState().init()
    void useVoice.getState().init()
    void useRemote.getState().init()

    const askLater = setTimeout(() => void useUpdate.getState().check(), 6000)

    const offCatalog = window.api.bible.onCatalogReady((catalog) => {
      void useBible.getState().setCatalog(catalog)
    })
    const offLive = window.api.live.onUpdate((live) => useLive.getState().setLive(live))

    const offKaraoke = watchKaraokeBackground()

    const offRemote = window.api.remote.onKey((code) => pressRemote(code))

    const offLook = useLook.subscribe((now, before) => {
      if (now.byTab === before.byTab) return
      if (now.byTab.bible !== before.byTab.bible) void useBible.getState().rebuild()
      if (now.byTab.texts !== before.byTab.texts) useTexts.getState().rebuild()
      if (now.byTab.songs !== before.byTab.songs) useSongs.getState().rebuild()
    })

    const swallow = (e: DragEvent): void => e.preventDefault()
    window.addEventListener('dragover', swallow)
    window.addEventListener('drop', swallow)

    const offScreen = useScreen.subscribe((now, before) => {
      if (now.aspect === before.aspect) return
      void useBible.getState().rebuild()
      useTexts.getState().rebuild()
      useSongs.getState().rebuild()
    })

    const offLang = useI18n.subscribe((now, before) => {
      if (now.lang === before.lang) return
      void useBible.getState().rebuild()
      useTexts.getState().rebuild()
      useSongs.getState().rebuild()
    })

    return () => {
      clearTimeout(askLater)
      offCatalog()
      offLive()
      offRemote()
      offLook()
      offKaraoke()
      offScreen()
      offLang()
      window.removeEventListener('dragover', swallow)
      window.removeEventListener('drop', swallow)
    }
  }, [])

  useGlobalHotkeys(tab)
  useVoiceFollow()

  return (
    <div className="app">
      <MenuBar />

      <nav className="tabs">
        {TABS.map((id) => (
          <button
            key={id}
            className={`tabs__item ${tab === id ? 'is-active' : ''}`}
            onClick={() => useUi.getState().setTab(id)}
          >
            {t(`tab.${id}`)}
          </button>
        ))}
        <div className="tabs__spacer" />
        {returnTo && (
          <button className="tabs__back" onClick={() => useUi.getState().back()}>
            {t('app.back')}
          </button>
        )}
        <ScreensMenu />
        <LiveIndicator />
      </nav>

      <main className="content">
        {tab === 'home' && <HomeTab />}
        {tab === 'bible' && <BibleTab />}
        {tab === 'texts' && <TextsTab />}
        {tab === 'songs' && <SongsTab />}
      </main>

      <MenuDialogs />
      <UndoNotice />
    </div>
  )
}

const TRUST_HITS = 3

const HOLD = 4

function useVoiceFollow(): void {
  useEffect(() => {
    let previous = ''
    let recent: string[] = []
    let at = 0
    let wants = -1
    let asked = 0
    let cached: { key: string; grid: ReturnType<typeof songGrid> } | null = null

    const gridNow = (): ReturnType<typeof songGrid> => {
      const slides = useSongs.getState().slides
      const key = slides.map((one) => one.slide.id).join('|')
      if (cached?.key !== key) {
        cached = {
          key,
          grid: songGrid(
            slides.map((one) => ({ lines: one.slide.blocks.map((b) => plainLine(b.html)) }))
          )
        }
      }
      return cached.grid
    }

    const forget = (): void => {
      previous = ''
      recent = []
      wants = -1
      asked = 0
    }

    const offSongs = useSongs.subscribe((now, before) => {

      if (now.draft?.id !== before.draft?.id) {
        at = 0
        cached = null
        forget()
        void useVoice.getState().setGrammar(grammarFor(now.slides))
        return
      }

      if (now.index !== before.index) {
        const grid = gridNow()
        const line = grid.places.findIndex((place) => place.slide === now.index)
        if (line >= 0) at = startOfLine(grid, line)
        forget()
      }
    })

    const offHeard = window.api.voice.onHeard(({ text, final }) => {
      if (!useVoice.getState().on) return

      const grid = gridNow()
      if (grid.words.length === 0) return

      const fresh = freshWords(previous, text)

      previous = final ? '' : text
      if (fresh.length === 0) return

      recent = [...recent, ...fresh].slice(-8)

      const found = locate(grid, at, recent)
      if (found.hits === 0) return

      at = found.at
      void apply(grid, at, found.hits)
    })

    async function apply(
      grid: ReturnType<typeof songGrid>,
      now: number,
      hits: number
    ): Promise<void> {
      const spot = spotOf(grid, now)
      const place = grid.places[Math.min(spot.line, grid.places.length - 1)]
      if (!place) return

      await useLive.getState().startKaraoke()
      const songs = useSongs.getState()

      if (place.slide !== songs.index) {

        if (place.slide !== wants) {
          wants = place.slide
          asked = 1
          return
        }
        asked++
        if (asked < HOLD || hits < TRUST_HITS || !useVoice.getState().autoTurn) return
        await songs.goTo(place.slide)
      }

      wants = -1
      asked = 0
      await useLive.getState().karaokeAt(place.at, spot.word)
    }

    return () => {
      offSongs()
      offHeard()
    }
  }, [])
}

function UndoNotice(): React.JSX.Element | null {
  const notice = useUndo((s) => s.notice)
  const hide = useUndo((s) => s.hideNotice)

  useEffect(() => {
    if (!notice) return
    const id = setTimeout(hide, 2400)
    return () => clearTimeout(id)
  }, [notice, hide])

  if (!notice) return null

  return (
    <div className="undo-notice" key={notice.n}>
      {notice.text}
    </div>
  )
}

function LiveIndicator(): React.JSX.Element {
  const t = useT()
  const live = useLive((s) => s.live)
  const on = live.slide !== null && !live.blackout

  return (
    <div className={`live-dot ${on ? 'is-on' : ''}`} title={t('app.projector')}>
      <span className="live-dot__mark" />
      {on ? t('app.live') : t('app.screenEmpty')}
    </div>
  )
}

function useGlobalHotkeys(tab: TabId): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {

      if (windowKey(e)) return

      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }

      if (pressRemote(e.code)) {
        e.preventDefault()
        return
      }

      const live = useLive.getState()
      const bible = useBible.getState()
      const texts = useTexts.getState()
      const songs = useSongs.getState()
      const service = useService.getState()

      switch (e.code) {
        case 'Space':
          e.preventDefault()

          if (service.running) void service.next()
          else if (tab === 'home') void service.next()
          else if (tab === 'songs') void (live.live.slide ? songs.step(1) : songs.show())
          else if (tab === 'texts') void texts.next()
          else if (bible.previewIndex + 1 < bible.preview.length) void bible.showNext()
          else if (live.live.slide) void bible.stepVerse(1)
          else void bible.show()
          break

        case 'ArrowRight':
          e.preventDefault()
          if (tab === 'home') void service.stepInside(1)
          else if (tab === 'songs') void songs.step(1)
          else if (tab === 'texts') void texts.stepSlide(1)
          else void bible.stepVerse(1)
          break
        case 'ArrowLeft':
          e.preventDefault()
          if (tab === 'home') void service.stepInside(-1)
          else if (tab === 'songs') void songs.step(-1)
          else if (tab === 'texts') void texts.stepSlide(-1)
          else void bible.stepVerse(-1)
          break
        case 'ArrowDown':
          e.preventDefault()
          if (tab === 'home') void service.stepInside(1)
          else if (tab === 'songs') void songs.step(1)
          else void (tab === 'texts' ? texts.stepSlide(1) : bible.stepSlide(1))
          break
        case 'ArrowUp':
          e.preventDefault()
          if (tab === 'home') void service.stepInside(-1)
          else if (tab === 'songs') void songs.step(-1)
          else void (tab === 'texts' ? texts.stepSlide(-1) : bible.stepSlide(-1))
          break
        case 'KeyK':
          e.preventDefault()
          void useVoice.getState().toggle()
          break
        case 'KeyB':
          e.preventDefault()
          void live.toggleBlackout()
          break
        case 'KeyT':
          e.preventDefault()
          void live.toggleHideText()
          break
        case 'Escape':
          e.preventDefault()
          void live.clear()
          break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [tab])
}

const BY_NUMBER: TabId[] = ['home', 'bible', 'texts', 'songs']

function windowKey(e: KeyboardEvent): boolean {
  const live = useLive.getState()
  const ui = useUi.getState()

  if (e.code === 'F1') {
    e.preventDefault()
    ui.setDialog(ui.dialog === 'keys' ? null : 'keys')
    return true
  }
  if (e.code === 'F5') {
    e.preventDefault()
    if (e.ctrlKey) void live.toggleHideText()
    else showCurrent()
    return true
  }
  if (e.code === 'F11') {
    e.preventDefault()
    void window.api.app.fullscreen()
    return true
  }
  if (e.code === 'F12') {
    e.preventDefault()
    void live.toggleBlackout()
    return true
  }

  if (e.ctrlKey && !e.shiftKey && e.code === 'KeyZ') {
    e.preventDefault()
    void useUndo.getState().undo()
    return true
  }

  if (e.ctrlKey && (e.code === 'KeyY' || (e.shiftKey && e.code === 'KeyZ'))) {
    e.preventDefault()
    void useUndo.getState().redo()
    return true
  }

  if (e.ctrlKey && e.shiftKey && e.code === 'KeyS') {
    e.preventDefault()
    snapshot()
    return true
  }
  if (e.ctrlKey && !e.shiftKey && /^Digit[1-4]$/.test(e.code)) {
    e.preventDefault()
    ui.setTab(BY_NUMBER[Number(e.code.slice(5)) - 1])
    return true
  }
  return false
}
