import { app, BrowserWindow, Menu, shell } from 'electron'
import { join } from 'node:path'
import { registerBackgroundScheme, serveBackgrounds } from './backgrounds'
import { isLang, setLang } from '@shared/i18n'
import { appIcon, savedChrome, TITLE_BAR_HEIGHT } from './system'
import { flushSettings, readSettings } from './settings'
import { flushTexts } from './texts'
import { flushSongs } from './songs'
import { flushCatalog } from './catalog'
import { releaseGlobalRemote, remoteLiveChanged, setGlobalRemote, watchGlobalRemote } from './remote'
import { flushFolders } from './folders'
import { flushTree } from './tree'
import { initLibrary } from './bible/library'
import { flushDecks, sweepDecks } from './deck'
import { registerIpc, notifyControlOnOutputChanges } from './ipc'
import { closeVoice, voiceTalksTo } from './voice'
import {
  broadcastLive,
  closeAllOutputs,
  keepAssignments,
  restoreOutputs,
  watchDisplays
} from './outputs'
import { getLive, subscribeLive } from './state'

let controlWindow: BrowserWindow | null = null
let settingsFlushed = false

async function createControlWindow(): Promise<void> {

  const chrome = await savedChrome()

  controlWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: chrome.back,
    title: 'VisioLogos',

    ...(appIcon() ? { icon: appIcon()! } : {}),

    titleBarStyle: 'hidden',

    titleBarOverlay: {
      color: chrome.bar,
      symbolColor: chrome.symbol,
      height: TITLE_BAR_HEIGHT
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false
    }
  })

  controlWindow.on('ready-to-show', () => controlWindow?.show())

  controlWindow.on('closed', () => {
    controlWindow = null
    closeAllOutputs()

    closeVoice()
  })
  controlWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devServer = process.env.ELECTRON_RENDERER_URL
  if (devServer) {
    void controlWindow.loadURL(`${devServer}/index.html`)
  } else {
    void controlWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

registerBackgroundScheme()

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!controlWindow) return
    if (controlWindow.isMinimized()) controlWindow.restore()
    controlWindow.focus()
  })

  void app.whenReady().then(async () => {

    Menu.setApplicationMenu(null)

    const settings = await readSettings()
    const saved = settings.lang
    if (isLang(saved)) setLang(saved)

    setGlobalRemote(settings.presenterGlobal !== false)

    serveBackgrounds()
    registerIpc()
    notifyControlOnOutputChanges(() => controlWindow)
    watchGlobalRemote(() => controlWindow)

    voiceTalksTo(() => controlWindow)
    watchDisplays()

    subscribeLive((state) => {
      broadcastLive(state)

      remoteLiveChanged(state.slide !== null)
      if (controlWindow && !controlWindow.isDestroyed()) {
        controlWindow.webContents.send('live:update', state)
      }
    })

    await createControlWindow()

    await restoreOutputs()

    try {
      const catalog = await initLibrary()
      controlWindow?.webContents.send('bible:catalogReady', catalog)
    } catch (error) {
      console.error('[Библия] Не удалось подготовить библиотеку:', error)
      controlWindow?.webContents.send('bible:catalogReady', [])
    }

    void sweepDecks().catch(() => undefined)

    broadcastLive(getLive())

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void createControlWindow()
    })
  })

  app.on('before-quit', (event) => {

    keepAssignments()

    releaseGlobalRemote()
    if (settingsFlushed) return
    event.preventDefault()
    void Promise.all([
      flushSettings(),
      flushTexts(),
      flushSongs(),
      flushCatalog(),
      flushFolders(),
      flushTree(),
      flushDecks()
    ]).then(() => {
      settingsFlushed = true
      app.quit()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
