import { app, BrowserWindow, nativeImage, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { isChrome, NIGHT_CHROME, type Chrome } from '@shared/themes'
import { readSettings, writeSetting } from './settings'

export function appIconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(app.getAppPath(), 'resources', 'icon.png')
}

export function appIcon(): Electron.NativeImage | null {
  const file = appIconPath()
  if (!existsSync(file)) return null
  const image = nativeImage.createFromPath(file)
  return image.isEmpty() ? null : image
}

export interface AppInfo {
  version: string
  electron: string
  chrome: string
  node: string

  dataFolder: string
}

export function appInfo(): AppInfo {
  return {
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    dataFolder: app.getPath('userData')
  }
}

export async function openDataFolder(): Promise<void> {
  await shell.openPath(app.getPath('userData'))
}

export const TITLE_BAR_HEIGHT = 35

export function applyChrome(window: BrowserWindow | null, chrome: unknown): void {
  if (!isChrome(chrome)) return
  void writeSetting('chrome', chrome)
  if (!window || window.isDestroyed()) return

  window.setBackgroundColor(chrome.back)

  if (process.platform !== 'win32') return
  try {
    window.setTitleBarOverlay({
      color: chrome.bar,
      symbolColor: chrome.symbol,
      height: TITLE_BAR_HEIGHT
    })
  } catch {

  }
}

export async function savedChrome(): Promise<Chrome> {
  const saved = (await readSettings()).chrome
  return isChrome(saved) ? saved : NIGHT_CHROME
}

export function isFullScreen(window: BrowserWindow | null): boolean {
  return Boolean(window && !window.isDestroyed() && window.isFullScreen())
}

export function toggleFullScreen(window: BrowserWindow | null): boolean {
  if (!window || window.isDestroyed()) return false

  window.focus()

  const next = !window.isFullScreen()
  window.setFullScreen(next)
  return next
}
