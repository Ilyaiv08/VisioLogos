import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { SiteCatalogue } from '@shared/site'
import type { UpdateNews, UpdateStep } from '@shared/update'

interface AppInfo {
  version: string
  electron: string
  chrome: string
  node: string
  dataFolder: string
}

interface ModuleProgress {
  id: string
  got: number
  total: number
  stage: 'download' | 'unpack' | 'import' | 'done' | 'error'
  error?: string
}

interface BackgroundReport {

  added: number

  existed: number
}

interface SongImport {
  songs: Song[]
  added: number
  backgrounds: BackgroundReport

  ids: string[]
  formats: Record<string, number>
  skipped: { file: string; reason: string }[]
}

type BibleFileResult =
  | { meta: TranslationMeta; warnings: string[] }
  | { error: string }

type DeckToSong =
  | {
      ok: true
      song: Song
      songs: Song[]

      background: { existed: boolean } | null
    }
  | { ok: false; reason: string }

interface CatalogState {
  tabs: CatalogTab[]
  songs: CatalogSong[]
}

interface CatalogImport extends CatalogState {
  added: number
  backgrounds: BackgroundReport

  duplicates: string[]
  formats: Record<string, number>
  skipped: { file: string; reason: string }[]
}

type CatalogAdd =
  | { ok: true; catalog: CatalogState; id: string }
  | { ok: false; reason: string }

type CatalogTake =
  | { ok: true; songs: Song[]; id: string; existed: boolean }
  | { ok: false; reason: string }

interface RemoteDevice {
  name: string

  likely: boolean
}

interface VoiceModel {
  installed: boolean
  bytes: number
}

interface VoiceStep {
  stage: 'ask' | 'download' | 'save' | 'done'
  got?: number
  total?: number
}

interface VoiceStatus {
  state: string
  error?: string

  using?: string

  level?: number
  devices?: { id: string; label: string }[]
}

interface VoiceCommand {
  do: 'start' | 'stop' | 'devices' | 'grammar'
  deviceId?: string | null
  grammar?: string | null
}

interface DeckImport {
  decks: Deck[]
  added: Deck[]
  skipped: { file: string; reason: string }[]
}
import type { SongFormat } from '@shared/songFormats'
import type { TextFormat } from '@shared/textFormats'
import type { Chrome } from '@shared/themes'
import type {
  BackgroundItem,
  CatalogSong,
  CatalogTab,
  DisplayInfo,
  KaraokeLook,
  LiveState,
  LowerThird,
  OutputRole,
  OutputWindowInfo,
  PassageText,
  SearchHit,
  ServiceFolder,
  Slide,
  Song,
  StageInfo,
  Deck,
  TextItem,
  TrashEntry,
  TrashKind,
  TreeFolder,
  TranslationMeta
} from '@shared/types'

const api = {
  bible: {
    catalog: (): Promise<TranslationMeta[]> => ipcRenderer.invoke('bible:catalog'),
    meta: (id: string): Promise<TranslationMeta> => ipcRenderer.invoke('bible:meta', id),
    chapter: (
      id: string,
      book: number,
      chapter: number
    ): Promise<{ n: number; html: string; plain: string }[]> =>
      ipcRenderer.invoke('bible:chapter', id, book, chapter),
    passage: (
      id: string,
      book: number,
      chapter: number,
      from: number,
      to: number
    ): Promise<PassageText | null> =>
      ipcRenderer.invoke('bible:passage', id, book, chapter, from, to),
    search: (id: string, query: string): Promise<SearchHit[]> =>
      ipcRenderer.invoke('bible:search', id, query),
    importDialog: (): Promise<{ meta: TranslationMeta; warnings: string[] } | null> =>
      ipcRenderer.invoke('bible:importDialog'),

    openFile: (): Promise<BibleFileResult | null> => ipcRenderer.invoke('bible:openFile'),
    addFile: (path: string): Promise<BibleFileResult> =>
      ipcRenderer.invoke('bible:addFile', path),
    exportFile: (id: string): Promise<{ path: string } | { error: string } | null> =>
      ipcRenderer.invoke('bible:export', id),

    remove: (id: string): Promise<TranslationMeta[]> => ipcRenderer.invoke('bible:remove', id),
    onCatalogReady: (cb: (catalog: TranslationMeta[]) => void): (() => void) =>
      on('bible:catalogReady', cb)
  },

  modules: {

    catalogue: (fresh = false): Promise<SiteCatalogue> =>
      ipcRenderer.invoke('modules:catalogue', fresh),

    install: (
      id: string
    ): Promise<
      | { ok: true; meta: TranslationMeta; warnings: string[] }
      | { ok: false; error: string }
    > => ipcRenderer.invoke('modules:install', id),
    onProgress: (cb: (progress: ModuleProgress) => void): (() => void) =>
      on('modules:progress', cb)
  },

  update: {

    check: (fresh = false): Promise<UpdateNews | null> =>
      ipcRenderer.invoke('update:check', fresh),

    install: (): Promise<{ ok: true } | { ok: false; error: string }> =>
      ipcRenderer.invoke('update:install'),
    onProgress: (cb: (step: UpdateStep) => void): (() => void) =>
      on('update:progress', cb),

    openPage: (): Promise<void> => ipcRenderer.invoke('update:page'),

    showFile: (): Promise<void> => ipcRenderer.invoke('update:showFile')
  },

  outputs: {
    displays: (): Promise<DisplayInfo[]> => ipcRenderer.invoke('outputs:displays'),
    list: (): Promise<OutputWindowInfo[]> => ipcRenderer.invoke('outputs:list'),
    open: (role: OutputRole, displayId: number): Promise<OutputWindowInfo[]> =>
      ipcRenderer.invoke('outputs:open', role, displayId),
    close: (role: OutputRole): Promise<OutputWindowInfo[]> =>
      ipcRenderer.invoke('outputs:close', role),
    onChanged: (cb: (outputs: OutputWindowInfo[]) => void): (() => void) =>
      on('outputs:changed', cb)
  },

  backgrounds: {
    list: (): Promise<BackgroundItem[]> => ipcRenderer.invoke('backgrounds:list'),
    add: (): Promise<BackgroundItem[]> => ipcRenderer.invoke('backgrounds:add'),
    remove: (id: string): Promise<BackgroundItem[]> =>
      ipcRenderer.invoke('backgrounds:remove', id)
  },

  settings: {
    all: (): Promise<Record<string, unknown>> => ipcRenderer.invoke('settings:all'),
    set: (key: string, value: unknown): Promise<void> =>
      ipcRenderer.invoke('settings:set', key, value)
  },

  texts: {
    list: (): Promise<TextItem[]> => ipcRenderer.invoke('texts:list'),
    save: (item: TextItem): Promise<TextItem[]> => ipcRenderer.invoke('texts:save', item),
    remove: (id: string): Promise<TextItem[]> => ipcRenderer.invoke('texts:delete', id),

    export: (format: TextFormat, ids: string[]): Promise<string | null> =>
      ipcRenderer.invoke('texts:export', format, ids)
  },

  trash: {
    list: (): Promise<TrashEntry[]> => ipcRenderer.invoke('trash:list'),
    restore: (kind: TrashKind, id: string): Promise<boolean> =>
      ipcRenderer.invoke('trash:restore', kind, id),
    purge: (kind: TrashKind, id: string): Promise<boolean> =>
      ipcRenderer.invoke('trash:purge', kind, id),

    clear: (kind: TrashKind): Promise<number> => ipcRenderer.invoke('trash:clear', kind)
  },

  songs: {
    list: (): Promise<Song[]> => ipcRenderer.invoke('songs:list'),
    save: (song: Song): Promise<Song[]> => ipcRenderer.invoke('songs:save', song),
    remove: (id: string): Promise<Song[]> => ipcRenderer.invoke('songs:delete', id),
    played: (id: string): Promise<void> => ipcRenderer.invoke('songs:played', id),
    import: (): Promise<SongImport> => ipcRenderer.invoke('songs:import'),

    add: (files: string[], folderId: string | null = null): Promise<SongImport> =>
      ipcRenderer.invoke('songs:add', files, folderId),
    export: (format: SongFormat, songId: string): Promise<string | null> =>
      ipcRenderer.invoke('songs:export', format, songId),

    renumber: (ids: string[]): Promise<Song[]> => ipcRenderer.invoke('songs:renumber', ids),

    place: (id: string, number: number): Promise<Song[]> =>
      ipcRenderer.invoke('songs:place', id, number)
  },

  catalog: {
    list: (): Promise<CatalogState> => ipcRenderer.invoke('catalog:list'),

    tabAdd: (name: string): Promise<CatalogState> =>
      ipcRenderer.invoke('catalog:tabAdd', name),
    tabRename: (id: string, name: string): Promise<CatalogState> =>
      ipcRenderer.invoke('catalog:tabRename', id, name),
    tabRemove: (id: string): Promise<CatalogState> =>
      ipcRenderer.invoke('catalog:tabRemove', id),
    tabMove: (id: string, delta: number): Promise<CatalogState> =>
      ipcRenderer.invoke('catalog:tabMove', id, delta),

    import: (tabId: string): Promise<CatalogImport> =>
      ipcRenderer.invoke('catalog:import', tabId),

    addFiles: (files: string[], tabId: string): Promise<CatalogImport> =>
      ipcRenderer.invoke('catalog:addFiles', files, tabId),

    addSong: (songId: string, tabId: string): Promise<CatalogAdd> =>
      ipcRenderer.invoke('catalog:addSong', songId, tabId),

    move: (id: string, tabId: string): Promise<CatalogState> =>
      ipcRenderer.invoke('catalog:move', id, tabId),
    rename: (id: string, title: string): Promise<CatalogAdd> =>
      ipcRenderer.invoke('catalog:rename', id, title),
    remove: (id: string): Promise<CatalogState> => ipcRenderer.invoke('catalog:remove', id),

    take: (id: string, folderId: string | null = null): Promise<CatalogTake> =>
      ipcRenderer.invoke('catalog:take', id, folderId)
  },

  folders: {
    list: (): Promise<ServiceFolder[]> => ipcRenderer.invoke('folders:list'),
    save: (folder: ServiceFolder): Promise<ServiceFolder[]> =>
      ipcRenderer.invoke('folders:save', folder),
    remove: (id: string): Promise<ServiceFolder[]> =>
      ipcRenderer.invoke('folders:delete', id)
  },

  decks: {
    list: (): Promise<Deck[]> => ipcRenderer.invoke('decks:list'),

    import: (what: 'decks' | 'photos' | 'folder' = 'decks'): Promise<DeckImport> =>
      ipcRenderer.invoke('decks:import', what),
    add: (files: string[]): Promise<DeckImport> => ipcRenderer.invoke('decks:add', files),
    remove: (id: string): Promise<Deck[]> => ipcRenderer.invoke('decks:delete', id),

    restore: (deck: Deck): Promise<Deck[]> => ipcRenderer.invoke('decks:restore', deck),

    toSong: (id: string): Promise<DeckToSong> => ipcRenderer.invoke('decks:toSong', id)
  },

  tree: {
    list: (): Promise<TreeFolder[]> => ipcRenderer.invoke('tree:list'),
    save: (folder: TreeFolder): Promise<TreeFolder[]> =>
      ipcRenderer.invoke('tree:save', folder),
    remove: (id: string): Promise<{ folders: TreeFolder[]; removed: string[] }> =>
      ipcRenderer.invoke('tree:delete', id)
  },

  app: {
    info: (): Promise<AppInfo> => ipcRenderer.invoke('app:info'),

    openData: (): Promise<void> => ipcRenderer.invoke('app:openData'),

    openSite: (url: string): Promise<boolean> => ipcRenderer.invoke('app:openSite', url),

    fullscreen: (): Promise<boolean> => ipcRenderer.invoke('app:fullscreen'),

    isFullscreen: (): Promise<boolean> => ipcRenderer.invoke('app:isFullscreen'),

    chrome: (chrome: Chrome): Promise<void> => ipcRenderer.invoke('app:chrome', chrome),

    snapshot: (): Promise<string | null> => ipcRenderer.invoke('app:snapshot'),
    quit: (): Promise<void> => ipcRenderer.invoke('app:quit')
  },

  files: {
    pathFor: (file: File): string => {
      try {
        return webUtils.getPathForFile(file)
      } catch {
        return ''
      }
    },
    expand: (paths: string[]): Promise<string[]> =>
      ipcRenderer.invoke('files:expand', paths)
  },

  remote: {
    list: (fresh = false): Promise<RemoteDevice[]> => ipcRenderer.invoke('remote:list', fresh),
    press: (code: string): void => ipcRenderer.send('remote:key', code),
    onKey: (cb: (code: string) => void): (() => void) => on('remote:key', cb)
  },

  voice: {
    model: (): Promise<VoiceModel> => ipcRenderer.invoke('voice:model'),
    install: (): Promise<VoiceModel> => ipcRenderer.invoke('voice:install'),
    installFile: (): Promise<VoiceModel | null> => ipcRenderer.invoke('voice:installFile'),
    onInstallStep: (cb: (step: VoiceStep) => void): (() => void) =>
      on('voice:installStep', cb),

    command: (command: VoiceCommand): Promise<void> =>
      ipcRenderer.invoke('voice:command', command),

    heard: (text: string, final: boolean): Promise<void> =>
      ipcRenderer.invoke('voice:heard', text, final),
    status: (status: VoiceStatus): Promise<void> =>
      ipcRenderer.invoke('voice:status', status),

    onHeard: (cb: (heard: { text: string; final: boolean }) => void): (() => void) =>
      on('voice:heard', cb),
    onStatus: (cb: (status: VoiceStatus) => void): (() => void) => on('voice:status', cb),
    onCommand: (cb: (command: VoiceCommand) => void): (() => void) =>
      on('voice:command', cb)
  },

  live: {
    get: (): Promise<LiveState> => ipcRenderer.invoke('live:get'),
    show: (slide: Slide): Promise<LiveState> => ipcRenderer.invoke('live:show', slide),
    clear: (): Promise<LiveState> => ipcRenderer.invoke('live:clear'),
    blackout: (value: boolean): Promise<LiveState> =>
      ipcRenderer.invoke('live:blackout', value),
    hideText: (value: boolean): Promise<LiveState> =>
      ipcRenderer.invoke('live:hideText', value),
    lowerThird: (value: LowerThird | null): Promise<LiveState> =>
      ipcRenderer.invoke('live:lowerThird', value),
    karaoke: (value: number | null, word: number | null = null): Promise<LiveState> =>
      ipcRenderer.invoke('live:karaoke', value, word),
    karaokeLook: (look: KaraokeLook): Promise<LiveState> =>
      ipcRenderer.invoke('live:karaokeLook', look),
    stage: (patch: Partial<StageInfo>): Promise<LiveState> =>
      ipcRenderer.invoke('live:stage', patch),
    onUpdate: (cb: (state: LiveState) => void): (() => void) => on('live:update', cb)
  }
}

function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_e: Electron.IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
