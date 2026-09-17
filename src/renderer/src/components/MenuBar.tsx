import { useEffect, useRef, useState } from 'react'
import { LANGS } from '@shared/i18n'
import { HISTORY, releaseDate, releaseNotes } from '@shared/history'
import { FAMILIES, familyName, themeName, themesOf } from '@shared/themes'
import { MenuPanel, SEPARATOR, type MenuEntry } from './ContextMenu'
import { Modal } from './Modal'
import { TrashBox } from './TrashBox'
import { ModulesBox } from './ModulesBox'
import { CatalogBox } from './CatalogBox'
import { RemoteBox } from './RemoteBox'
import { UpdateBox, UpdateButton } from './UpdateBox'
import { SITE, SITE_NAME } from '@shared/site'
import { useHoldDrag } from '../lib/dragless'
import { useI18n, useT } from '../state/i18n'
import { useLayout } from '../state/layout'
import { useLive } from '../state/live'
import { useLook } from '../state/look'
import { useService } from '../state/service'
import { useSongs } from '../state/songs'
import { useTheme } from '../state/theme'
import { useBible } from '../state/store'
import { useTexts } from '../state/texts'
import { useUndo } from '../state/undo'
import { useVoice } from '../state/voice'
import { useUi, type TabId } from '../state/ui'

export function MenuBar(): React.JSX.Element {
  const t = useT()
  const [open, setOpen] = useState<string | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const buttonsRoom = useButtonsRoom()

  useHoldDrag(open !== null)

  const tab = useUi((s) => s.tab)
  const live = useLive((s) => s.live)
  const running = useService((s) => s.running)
  const lang = useI18n((s) => s.lang)
  const theme = useTheme((s) => s.theme)
  const listening = useVoice((s) => s.on)
  const undoDepth = useUndo((s) => s.past.length)
  const redoDepth = useUndo((s) => s.future.length)

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent): void => {
      if (!barRef.current?.contains(e.target as Node)) setOpen(null)
    }
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(null)
    }
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', esc, true)
    return () => {
      window.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', esc, true)
    }
  }, [open])

  const go = (to: TabId): void => useUi.getState().setTab(to)

  const menus: { id: string; label: string; entries: MenuEntry[] }[] = [
    {
      id: 'file',
      label: t('menu.file'),
      entries: [
        {
          label: t('menu.newService'),
          onClick: () => {
            void useService.getState().create(null)
            go('home')
          }
        },
        {
          label: t('menu.newSong'),
          onClick: () => {
            useSongs.getState().create()
            go('songs')
          }
        },
        {
          label: t('menu.newText'),
          hint: t('menu.newTextHint'),
          onClick: () => {
            useTexts.getState().closeDraft()
            go('texts')
          }
        },
        SEPARATOR,
        {
          label: t('menu.importSongs'),
          hint: t('menu.importSongsHint'),
          onClick: () => {
            go('songs')
            void useSongs.getState().importFiles()
          }
        },
        {
          label: t('menu.importDeck'),
          hint: t('menu.importDeckHint'),
          onClick: () => {
            go('home')
            void useService.getState().addDecks('decks')
          }
        },
        {
          label: t('menu.importPhotos'),
          hint: t('menu.importPhotosHint'),
          onClick: () => {
            go('home')
            void useService.getState().addDecks('photos')
          }
        },
        {

          label: t('menu.importFolder'),
          hint: t('menu.importFolderHint'),
          onClick: () => {
            go('home')
            void useService.getState().addDecks('folder')
          }
        },
        {

          label: t('menu.modulesFromSite'),
          hint: t('menu.modulesFromSiteHint'),
          onClick: () => useUi.getState().setDialog('modules')
        },
        {

          label: t('menu.openBibleFile'),
          hint: t('menu.openBibleFileHint'),
          onClick: () => void window.api.bible.openFile()
        },
        {
          label: t('menu.importBible'),
          hint: t('menu.importBibleHint'),
          onClick: () => void window.api.bible.importDialog()
        },
        SEPARATOR,
        {

          label: t('menu.exportSongs'),
          hint: t('menu.exportSongsHint'),
          onClick: () => go('songs')
        },
        {

          label: t('menu.exportTexts'),
          hint: t('menu.exportTextsHint'),
          onClick: () => go('texts')
        },
        {

          label: t('menu.exportBible'),
          hint: t('menu.exportBibleHint'),
          disabled: !useBible.getState().translationId,
          onClick: () => {
            const id = useBible.getState().translationId
            if (id) void window.api.bible.exportFile(id)
          }
        },
        SEPARATOR,
        {
          label: t('menu.trash'),
          hint: t('menu.trashHint'),
          onClick: () => useUi.getState().setDialog('trash')
        },
        {
          label: t('menu.dataFolder'),
          hint: t('menu.dataFolderHint'),
          onClick: () => void window.api.app.openData()
        },
        SEPARATOR,
        { label: t('menu.quit'), onClick: () => void window.api.app.quit() }
      ]
    },
    {
      id: 'live',
      label: t('menu.actions'),
      entries: [
        { label: t('menu.showSlide'), hint: 'F5', onClick: showCurrent },
        {
          label: t('menu.clearSlide'),
          hint: 'Esc',
          disabled: live.slide === null,
          onClick: () => void useLive.getState().clear()
        },
        SEPARATOR,
        {
          label: t('menu.blackout'),
          hint: 'F12',
          checked: live.blackout,
          onClick: () => void useLive.getState().toggleBlackout()
        },
        {
          label: t('menu.bgOnly'),
          hint: 'Ctrl+F5',
          checked: live.hideText,
          onClick: () => void useLive.getState().toggleHideText()
        },
        {
          label: t('menu.karaoke'),
          hint: 'K',
          checked: listening,
          onClick: () => void useVoice.getState().toggle()
        },
        SEPARATOR,
        running
          ? { label: t('menu.stopService'), onClick: () => useService.getState().stop() }
          : {
              label: t('menu.startService'),
              onClick: () => {
                go('home')
                void useService.getState().start()
              }
            },
        {
          label: t('menu.next'),
          hint: t('common.space'),
          disabled: !running,
          onClick: () => void useService.getState().next()
        },
        {
          label: t('menu.prev'),
          disabled: !running,
          onClick: () => void useService.getState().prev()
        },
        SEPARATOR,
        {

          label: t('menu.remote'),
          hint: t('menu.remoteHint'),
          onClick: () => useUi.getState().setDialog('remote')
        },
        { label: t('menu.snapshot'), hint: 'Ctrl+Shift+S', onClick: snapshot }
      ]
    },
    {

      id: 'edit',
      label: t('menu.edit'),
      entries: [
        {
          label: t('undo.undo'),
          hint: 'Ctrl+Z',
          disabled: undoDepth === 0,
          onClick: () => void useUndo.getState().undo()
        },
        {
          label: t('undo.redo'),
          hint: 'Ctrl+Shift+Z',
          disabled: redoDepth === 0,
          onClick: () => void useUndo.getState().redo()
        }
      ]
    },
    {
      id: 'view',
      label: t('menu.view'),
      entries: [
        {
          label: t('tab.home'),
          hint: 'Ctrl+1',
          checked: tab === 'home',
          onClick: () => go('home')
        },
        {
          label: t('tab.bible'),
          hint: 'Ctrl+2',
          checked: tab === 'bible',
          onClick: () => go('bible')
        },
        {
          label: t('tab.texts'),
          hint: 'Ctrl+3',
          checked: tab === 'texts',
          onClick: () => go('texts')
        },
        {
          label: t('tab.songs'),
          hint: 'Ctrl+4',
          checked: tab === 'songs',
          onClick: () => go('songs')
        },
        SEPARATOR,
        {
          label: t('menu.resetPanels'),
          hint: t(`tab.${tab}`),
          onClick: () => useLayout.getState().reset(tab)
        },
        {
          label: t('menu.resetLook'),
          hint: t(`tab.${tab}`),
          disabled: tab === 'home',
          onClick: () => void useLook.getState().resetLook(tab as 'bible' | 'texts' | 'songs')
        },
        SEPARATOR,
        {
          label: t('menu.fullscreen'),
          hint: 'F11',
          onClick: () => void window.api.app.fullscreen()
        }
      ]
    },
    {

      id: 'style',
      label: t('menu.styles'),
      entries: FAMILIES.flatMap((family) => [
        { header: familyName(family) },
        ...themesOf(family).map((item) => ({
          label: themeName(item.id),
          swatch: <i className="themedot" data-theme={item.id} />,
          checked: theme === item.id,
          onClick: () => void useTheme.getState().choose(item.id)
        }))
      ])
    },
    {

      id: 'lang',
      label: t('menu.language'),
      entries: LANGS.map((item) => ({
        label: item.label,
        checked: lang === item.id,
        onClick: () => void useI18n.getState().choose(item.id)
      }))
    },
    {
      id: 'help',
      label: t('menu.help'),
      entries: [
        {
          label: t('menu.hotkeys'),
          hint: 'F1',
          onClick: () => useUi.getState().setDialog('keys')
        },
        { label: t('menu.about'), onClick: () => useUi.getState().setDialog('about') }
      ]
    }
  ]

  return (
    <div className="menubar" ref={barRef} style={{ paddingRight: buttonsRoom }}>
      {menus.map((menu) => (
        <div className="menubar__box" key={menu.id}>
          <button
            className={`menubar__item ${open === menu.id ? 'is-open' : ''}`}
            onClick={() => setOpen(open === menu.id ? null : menu.id)}

            onMouseEnter={() => open && setOpen(menu.id)}
          >
            {menu.label}
          </button>
          {open === menu.id && (
            <MenuPanel entries={menu.entries} onClose={() => setOpen(null)} />
          )}
        </div>
      ))}

      <div className="menubar__spacer" />
      <UpdateButton />
      <Logo className="menubar__logo" />
      <span className="menubar__name">VisioLogos</span>
    </div>
  )
}

function Logo({ className }: { className: string }): React.JSX.Element | null {
  const [ok, setOk] = useState(true)
  if (!ok) return null

  return (
    <img className={className} src="visio://app/icon.png" alt="" onError={() => setOk(false)} />
  )
}

const BUTTONS_ROOM = 150

const EDGE = 12

function useButtonsRoom(): number {
  const [room, setRoom] = useState(BUTTONS_ROOM)

  useEffect(() => {

    let latest = 0

    const update = async (): Promise<void> => {
      const mine = ++latest

      const full = await window.api.app.isFullscreen()
      if (mine !== latest) return
      if (full) {
        setRoom(EDGE)
        return
      }

      const overlay = navigator.windowControlsOverlay
      if (!overlay || !overlay.visible) {
        setRoom(BUTTONS_ROOM)
        return
      }

      const area = overlay.getTitlebarAreaRect()
      const buttons = Math.round(window.innerWidth - area.width - area.x)

      setRoom(buttons > 0 ? buttons + EDGE : BUTTONS_ROOM)
    }

    const ask = (): void => void update()

    ask()

    window.addEventListener('resize', ask)
    navigator.windowControlsOverlay?.addEventListener('geometrychange', ask)

    const later = [120, 400, 1200].map((wait) => setTimeout(ask, wait))

    return () => {
      latest++
      window.removeEventListener('resize', ask)
      navigator.windowControlsOverlay?.removeEventListener('geometrychange', ask)
      later.forEach(clearTimeout)
    }
  }, [])

  return room
}

export function MenuDialogs(): React.JSX.Element | null {
  const dialog = useUi((s) => s.dialog)
  if (dialog === 'keys') return <HotkeysBox />
  if (dialog === 'about') return <AboutBox />
  if (dialog === 'trash') return <TrashBox />
  if (dialog === 'modules') return <ModulesBox />
  if (dialog === 'update') return <UpdateBox />
  if (dialog === 'remote') return <RemoteBox />
  if (dialog === 'catalog') return <CatalogBox />
  return null
}

export function showCurrent(): void {
  const tab = useUi.getState().tab
  if (tab === 'songs') void useSongs.getState().show()
  else if (tab === 'texts') void useTexts.getState().show()
  else if (tab === 'bible') void useBible.getState().show()
  else {

    const service = useService.getState()
    if (service.cursor >= 0) void service.showCurrent()
    else void service.next()
  }
}

export function snapshot(): void {
  void window.api.app.snapshot()
}

const KEYS: { group: string; rows: [string, string][] }[] = [
  {
    group: 'keys.groupLive',
    rows: [
      ['F5', 'keys.show'],
      ['Esc', 'keys.clear'],
      ['common.space', 'keys.next'],
      ['F12 · B', 'keys.blackout'],
      ['Ctrl+F5 · T', 'keys.bgOnly'],
      ['K', 'keys.karaoke']
    ]
  },
  {
    group: 'keys.groupStep',
    rows: [
      ['→ ←', 'keys.verse'],
      ['↓ ↑', 'keys.slide']
    ]
  },
  {

    group: 'keys.groupRemote',
    rows: [
      ['Page Down · Page Up', 'keys.remoteStep'],
      ['.', 'keys.remoteBlackout']
    ]
  },
  {
    group: 'keys.groupWindow',
    rows: [
      ['Ctrl+Z', 'keys.undo'],
      ['Ctrl+Shift+Z', 'keys.redo'],
      ['Ctrl+1…4', 'keys.tabs'],
      ['F11', 'keys.fullscreen'],
      ['Ctrl+Shift+S', 'keys.snapshot'],
      ['F1', 'keys.help']
    ]
  }
]

function HotkeysBox(): React.JSX.Element {
  const t = useT()

  const key = (name: string): string => (name === 'common.space' ? t('common.space') : name)

  return (
    <Modal title={t('menu.hotkeys')}>
      {KEYS.map((block) => (
        <div className="keys" key={block.group}>
          <div className="keys__group">{t(block.group as 'keys.groupLive')}</div>
          {block.rows.map(([name, what]) => (
            <div className="keys__row" key={name}>
              <kbd>{key(name)}</kbd>
              <span>{t(what as 'keys.show')}</span>
            </div>
          ))}
        </div>
      ))}
      <p className="note">{t('keys.note')}</p>
    </Modal>
  )
}

function AboutBox(): React.JSX.Element {
  const t = useT()
  const [page, setPage] = useState<'general' | 'history'>('general')

  const [version, setVersion] = useState('')

  useEffect(() => {
    void window.api.app.info().then((info) => setVersion(info.version))
  }, [])

  return (
    <Modal title={t('about.title')}>
      <div className="about__head">
        <Logo className="about__logo" />
        <p className="about__name">VisioLogos {version}</p>
      </div>

      <div className="subtabs subtabs--pair">
        <button
          className={`subtabs__item ${page === 'general' ? 'is-active' : ''}`}
          onClick={() => setPage('general')}
        >
          {t('about.tabGeneral')}
        </button>
        <button
          className={`subtabs__item ${page === 'history' ? 'is-active' : ''}`}
          onClick={() => setPage('history')}
        >
          {t('about.tabHistory')}
        </button>
      </div>

      {page === 'general' ? <AboutGeneral /> : <AboutHistory />}
    </Modal>
  )
}

function AboutGeneral(): React.JSX.Element {
  const t = useT()

  return (
    <>
      <p className="note">{t('about.what')}</p>

      <div className="about__does">
        <div className="keys__group">{t('about.does')}</div>
        <p className="note">{t('about.doesBible')}</p>
        <p className="note">{t('about.doesSongs')}</p>
        <p className="note">{t('about.doesTexts')}</p>
        <p className="note">{t('about.doesDecks')}</p>
        <p className="note">{t('about.doesScreens')}</p>
        <p className="note">{t('about.doesService')}</p>
      </div>

      <p className="note">{t('about.made')}</p>

      <div className="about__site">
        <button className="link" onClick={() => void window.api.app.openSite(SITE)}>
          {SITE_NAME}
        </button>
        <span className="dim">{t('about.siteHint')}</span>
      </div>
    </>
  )
}

function AboutHistory(): React.JSX.Element {
  return (
    <>
      {HISTORY.map((release) => (
        <div className="release" key={release.version}>
          <div className="release__head">
            <b>{release.version}</b>
            <span>{releaseDate(release)}</span>
          </div>
          <ul className="release__list">
            {releaseNotes(release).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ))}
    </>
  )
}
