import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { SongFormat } from '@shared/songFormats'
import type {
  KaraokeLook,
  LiveState,
  LowerThird,
  OutputRole,
  Deck,
  ServiceFolder,
  Slide,
  StageInfo,
  Song,
  TextItem,
  TrashKind,
  TreeFolder
} from '@shared/types'
import {
  exportFileName,
  exportTranslation,
  getBookIndexData,
  getCatalog,
  getChapter,
  getPassage,
  importBibleFile,
  importModule,
  removeTranslation,
  searchText
} from './bible/library'
import { BIBLE_EXT } from '@shared/bibleFile'
import { installFromSite, siteCatalogue, type Progress } from './bible/fromSite'
import { isOurSite } from '@shared/site'
import {
  addBackgroundsFromDialog,
  listUserBackgrounds,
  removeBackground
} from './backgrounds'
import {
  closeOutput,
  listDisplays,
  listOutputs,
  onOutputsChanged,
  openOutput
} from './outputs'
import { isLang, setLang } from '@shared/i18n'
import { t } from '@shared/i18n'
import { readSettings, writeSetting } from './settings'
import { deleteText, listTexts, saveText } from './texts'
import { exportText } from './textExport'
import type { TextFormat } from '@shared/textFormats'
import { clearTrash, listTrash, purgeFromTrash, restoreFromTrash } from './trash'
import { deleteFolder, listFolders, saveFolder } from './folders'
import {
  addDeckFiles,
  deleteDeck,
  importDecks,
  listDecks,
  restoreDeck,
  type PickWhat
} from './deck'
import { deckToSong } from './deckSong'
import { listRemotes, setGlobalRemote } from './remote'
import { checkUpdate, installUpdate, openDownloadPage, showDownloaded } from './update'
import {
  installVoice,
  installVoiceFromFile,
  voiceCommand,
  voiceModel,
  voiceToControl,
  type VoiceCommand
} from './voice'
import type { UpdateStep } from '@shared/update'
import { expandFiles } from './dropped'
import {
  appInfo,
  applyChrome,
  isFullScreen,
  openDataFolder,
  toggleFullScreen
} from './system'
import { saveSlideImage } from './snapshot'
import {
  deleteFolder as deleteTreeFolder,
  listFolders as listTreeFolders,
  saveFolder as saveTreeFolder
} from './tree'
import {
  addSongFiles,
  deleteSong,
  exportSong,
  importSongsFromDialog,
  listSongs,
  markSongPlayed,
  placeSongAt,
  renumberSongs,
  saveSong
} from './songs'
import {
  addCatalogFiles,
  addCatalogTab,
  addSongToCatalog,
  importToCatalog,
  listCatalog,
  moveCatalogSong,
  moveCatalogTab,
  removeCatalogSong,
  removeCatalogTab,
  renameCatalogSong,
  renameCatalogTab,
  takeFromCatalog
} from './catalog'
import {
  clearSlide,
  getLive,
  setBlackout,
  setHideText,
  setKaraoke,
  setKaraokeLook,
  setLowerThird,
  setStage,
  showSlide
} from './state'

export function registerIpc(): void {

  ipcMain.handle('bible:catalog', () => getCatalog())
  ipcMain.handle('bible:meta', (_e, id: string) => getBookIndexData(id))
  ipcMain.handle('bible:chapter', (_e, id: string, book: number, chapter: number) =>
    getChapter(id, book, chapter)
  )
  ipcMain.handle(
    'bible:passage',
    (_e, id: string, book: number, chapter: number, from: number, to: number) =>
      getPassage(id, book, chapter, from, to)
  )
  ipcMain.handle('bible:search', (_e, id: string, query: string) => searchText(id, query))

  ipcMain.handle('modules:catalogue', (_e, fresh: boolean) => siteCatalogue(fresh))

  ipcMain.handle('modules:install', async (event, id: string) => {
    const send = (progress: Progress): void => {
      if (!event.sender.isDestroyed()) event.sender.send('modules:progress', progress)
    }
    try {
      const result = await installFromSite(String(id), send)

      if (!event.sender.isDestroyed()) event.sender.send('bible:catalogReady', getCatalog())
      return { ok: true as const, meta: result.meta, warnings: result.warnings }
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error)
      send({ id: String(id), got: 0, total: 0, stage: 'error', error: why })
      return { ok: false as const, error: why }
    }
  })

  ipcMain.handle('bible:remove', async (event, id: string) => {
    const list = await removeTranslation(String(id))
    if (!event.sender.isDestroyed()) event.sender.send('bible:catalogReady', list)
    return list
  })

  ipcMain.handle('bible:openFile', async (event) => {
    const parent = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(parent ?? undefined!, {
      title: t('main.pickBibleFile'),
      properties: ['openFile'],
      filters: [
        { name: t('main.bibleFilter'), extensions: [BIBLE_EXT] },
        { name: t('main.allFiles'), extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return null

    try {
      const added = await importBibleFile(result.filePaths[0])
      tellCatalog(event.sender)
      return added
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('bible:addFile', async (event, path: string) => {
    try {
      const added = await importBibleFile(String(path))
      tellCatalog(event.sender)
      return added
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('bible:export', async (event, id: string) => {
    const parent = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showSaveDialog(parent ?? undefined!, {
      title: t('main.saveBible'),
      defaultPath: exportFileName(String(id)),
      filters: [{ name: t('main.bibleFilter'), extensions: [BIBLE_EXT] }]
    })
    if (result.canceled || !result.filePath) return null

    try {
      await exportTranslation(String(id), result.filePath)
      return { path: result.filePath }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('bible:importDialog', async (event) => {
    const parent = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(parent ?? undefined!, {
      title: t('main.pickBible'),
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return importModule(result.filePaths[0])
  })

  ipcMain.handle('outputs:displays', () => listDisplays())
  ipcMain.handle('outputs:list', () => listOutputs())
  ipcMain.handle('outputs:open', (_e, role: OutputRole, displayId: number) => {
    openOutput(role, displayId)
    return listOutputs()
  })
  ipcMain.handle('outputs:close', (_e, role: OutputRole) => {
    closeOutput(role)
    return listOutputs()
  })

  ipcMain.handle('backgrounds:list', () => listUserBackgrounds())
  ipcMain.handle('backgrounds:add', (event) =>
    addBackgroundsFromDialog(BrowserWindow.fromWebContents(event.sender))
  )
  ipcMain.handle('backgrounds:remove', (_e, id: string) => removeBackground(id))

  ipcMain.handle('settings:all', () => readSettings())
  ipcMain.handle('settings:set', (_e, key: string, value: unknown) => {

    if (key === 'lang' && isLang(value)) setLang(value)

    if (key === 'presenterGlobal') setGlobalRemote(value !== false)
    return writeSetting(key, value)
  })

  ipcMain.handle('texts:list', () => listTexts())
  ipcMain.handle('texts:save', (_e, item: TextItem) => saveText(item))
  ipcMain.handle('texts:delete', (_e, id: string) => deleteText(id))

  ipcMain.handle('texts:export', async (event, format: TextFormat, ids: string[]) => {
    const all = await listTexts()
    const wanted = Array.isArray(ids) ? ids : [String(ids)]
    const items = wanted
      .map((id) => all.find((one) => one.id === id))
      .filter((one): one is TextItem => Boolean(one))
    return exportText(BrowserWindow.fromWebContents(event.sender), format, items)
  })

  ipcMain.handle('trash:list', () => listTrash())
  ipcMain.handle('trash:restore', (_e, kind: TrashKind, id: string) =>
    restoreFromTrash(kind, id)
  )
  ipcMain.handle('trash:purge', (_e, kind: TrashKind, id: string) =>
    purgeFromTrash(kind, id)
  )
  ipcMain.handle('trash:clear', (_e, kind: TrashKind) => clearTrash(kind))

  ipcMain.handle('songs:list', () => listSongs())
  ipcMain.handle('songs:save', (_e, song: Song) => saveSong(song))
  ipcMain.handle('songs:delete', (_e, id: string) => deleteSong(id))
  ipcMain.handle('songs:played', (_e, id: string) => markSongPlayed(id))
  ipcMain.handle('songs:import', (event) =>
    importSongsFromDialog(BrowserWindow.fromWebContents(event.sender))
  )
  ipcMain.handle('songs:export', (event, format: SongFormat, songId: string) =>
    exportSong(BrowserWindow.fromWebContents(event.sender), format, songId)
  )
  ipcMain.handle('songs:add', (_e, files: string[], folderId: string | null) =>
    addSongFiles(files, folderId)
  )

  ipcMain.handle('songs:renumber', (_e, ids: string[]) => renumberSongs(ids))
  ipcMain.handle('songs:place', (_e, id: string, number: number) =>
    placeSongAt(id, Number(number))
  )

  ipcMain.handle('catalog:list', () => listCatalog())
  ipcMain.handle('catalog:tabAdd', (_e, name: string) => addCatalogTab(String(name)))
  ipcMain.handle('catalog:tabRename', (_e, id: string, name: string) =>
    renameCatalogTab(String(id), String(name))
  )
  ipcMain.handle('catalog:tabRemove', (_e, id: string) => removeCatalogTab(String(id)))
  ipcMain.handle('catalog:tabMove', (_e, id: string, delta: number) =>
    moveCatalogTab(String(id), Number(delta))
  )

  ipcMain.handle('catalog:import', (event, tabId: string) =>
    importToCatalog(BrowserWindow.fromWebContents(event.sender), String(tabId))
  )
  ipcMain.handle('catalog:addFiles', (_e, files: string[], tabId: string) =>
    addCatalogFiles(files, String(tabId))
  )

  ipcMain.handle('catalog:addSong', async (_e, songId: string, tabId: string) => {
    const song = (await listSongs()).find((one) => one.id === songId)
    if (!song) return { ok: false as const, reason: t('catalog.gone') }
    return addSongToCatalog(song, String(tabId))
  })
  ipcMain.handle('catalog:move', (_e, id: string, tabId: string) =>
    moveCatalogSong(String(id), String(tabId))
  )
  ipcMain.handle('catalog:rename', (_e, id: string, title: string) =>
    renameCatalogSong(String(id), String(title))
  )
  ipcMain.handle('catalog:remove', (_e, id: string) => removeCatalogSong(String(id)))
  ipcMain.handle('catalog:take', (_e, id: string, folderId: string | null) =>
    takeFromCatalog(String(id), folderId ?? null)
  )

  ipcMain.handle('folders:list', () => listFolders())
  ipcMain.handle('folders:save', (_e, folder: ServiceFolder) => saveFolder(folder))
  ipcMain.handle('folders:delete', (_e, id: string) => deleteFolder(id))

  ipcMain.handle('decks:list', () => listDecks())
  ipcMain.handle('decks:import', (event, what: PickWhat = 'decks') =>
    importDecks(BrowserWindow.fromWebContents(event.sender), what)
  )
  ipcMain.handle('decks:add', (_e, files: string[]) => addDeckFiles(files))
  ipcMain.handle('decks:delete', (_e, id: string) => deleteDeck(id))

  ipcMain.handle('decks:restore', (_e, deck: Deck) => restoreDeck(deck))

  ipcMain.handle('decks:toSong', (_e, id: string) => deckToSong(id))

  ipcMain.handle('remote:list', (_e, fresh: boolean) => listRemotes(Boolean(fresh)))

  ipcMain.on('remote:key', (event, code: string) => {
    const window = toControl?.()
    if (!window || window.isDestroyed()) return

    if (window.webContents === event.sender) return
    window.webContents.send('remote:key', String(code))
  })

  ipcMain.handle('voice:model', () => voiceModel())

  ipcMain.handle('voice:install', (event) =>
    installVoice((step) => {
      if (!event.sender.isDestroyed()) event.sender.send('voice:installStep', step)
    })
  )
  ipcMain.handle('voice:installFile', (event) =>
    installVoiceFromFile(BrowserWindow.fromWebContents(event.sender))
  )

  ipcMain.handle('voice:command', (_e, command: VoiceCommand) => voiceCommand(command))

  ipcMain.handle('voice:heard', (_e, text: string, final: boolean) =>
    voiceToControl('voice:heard', { text, final })
  )
  ipcMain.handle('voice:status', (_e, status: unknown) =>
    voiceToControl('voice:status', status)
  )

  ipcMain.handle('update:check', (_e, fresh: boolean) => checkUpdate(Boolean(fresh)))
  ipcMain.handle('update:page', () => openDownloadPage())

  ipcMain.handle('update:showFile', () => showDownloaded())

  ipcMain.handle('update:install', async (event) => {
    const send = (step: UpdateStep): void => {
      if (!event.sender.isDestroyed()) event.sender.send('update:progress', step)
    }
    try {
      await installUpdate(send)
      return { ok: true as const }
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error)
      send({ stage: 'error', got: 0, total: 0, error: why })
      return { ok: false as const, error: why }
    }
  })

  ipcMain.handle('app:info', () => appInfo())
  ipcMain.handle('app:openData', () => openDataFolder())

  ipcMain.handle('app:openSite', async (_e, url: string) => {
    if (!isOurSite(String(url))) return false
    await shell.openExternal(String(url))
    return true
  })
  ipcMain.handle('app:fullscreen', (event) =>
    toggleFullScreen(BrowserWindow.fromWebContents(event.sender))
  )
  ipcMain.handle('app:isFullscreen', (event) =>
    isFullScreen(BrowserWindow.fromWebContents(event.sender))
  )

  ipcMain.handle('app:chrome', (event, chrome: unknown) =>
    applyChrome(BrowserWindow.fromWebContents(event.sender), chrome)
  )
  ipcMain.handle('app:snapshot', (event) =>
    saveSlideImage(BrowserWindow.fromWebContents(event.sender))
  )

  ipcMain.handle('app:quit', () => app.quit())

  ipcMain.handle('files:expand', (_e, paths: string[]) => expandFiles(paths))

  ipcMain.handle('tree:list', () => listTreeFolders())
  ipcMain.handle('tree:save', (_e, folder: TreeFolder) => saveTreeFolder(folder))
  ipcMain.handle('tree:delete', (_e, id: string) => deleteTreeFolder(id))

  ipcMain.handle('live:get', (): LiveState => getLive())
  ipcMain.handle('live:show', (_e, slide: Slide) => showSlide(slide))
  ipcMain.handle('live:clear', () => clearSlide())
  ipcMain.handle('live:blackout', (_e, value: boolean) => setBlackout(value))
  ipcMain.handle('live:hideText', (_e, value: boolean) => setHideText(value))
  ipcMain.handle('live:lowerThird', (_e, value: LowerThird | null) => setLowerThird(value))
  ipcMain.handle('live:karaoke', (_e, value: number | null, word: number | null) =>
    setKaraoke(value, word)
  )
  ipcMain.handle('live:karaokeLook', (_e, look: KaraokeLook) => setKaraokeLook(look))
  ipcMain.handle('live:stage', (_e, patch: Partial<StageInfo>) => setStage(patch))
}

function tellCatalog(sender: Electron.WebContents): void {
  if (!sender.isDestroyed()) sender.send('bible:catalogReady', getCatalog())
}

let toControl: (() => BrowserWindow | null) | null = null

export function notifyControlOnOutputChanges(control: () => BrowserWindow | null): void {
  toControl = control

  onOutputsChanged(() => {
    const window = control()
    if (window && !window.isDestroyed()) {
      window.webContents.send('outputs:changed', listOutputs())
    }
  })
}
