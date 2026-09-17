import { BrowserWindow, screen, shell } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { DisplayInfo, LiveState, OutputRole, OutputWindowInfo } from '@shared/types'
import { t } from '@shared/i18n'
import {
  fallbackScreen,
  movable,
  restorePlan,
  showsWindowed,
  type Assignment
} from '@shared/screens'
import { appIcon } from './system'
import { readSettings, writeSetting } from './settings'

interface OutputEntry {
  window: BrowserWindow
  role: OutputRole
  displayId: number

  windowed: boolean
}

const roleTitle = (role: OutputRole): string => t(`main.${role}Title` as 'main.hallTitle')

const outputs = new Map<OutputRole, OutputEntry>()

let notifyControl: (() => void) | null = null

let remembering = true

function controlWindow(): BrowserWindow | null {
  const own = new Set([...outputs.values()].map((o) => o.window))
  return BrowserWindow.getAllWindows().find((w) => !own.has(w) && !w.isDestroyed()) ?? null
}

function controlDisplayId(): number | null {
  const window = controlWindow()
  return window ? screen.getDisplayMatching(window.getBounds()).id : null
}

export function onOutputsChanged(callback: () => void): void {
  notifyControl = callback
}

export function listDisplays(): DisplayInfo[] {
  const primaryId = screen.getPrimaryDisplay().id
  const controlId = controlDisplayId()

  return screen.getAllDisplays().map((display, i) => {
    const role =
      [...outputs.values()].find((o) => o.displayId === display.id)?.role ?? null
    return {
      id: display.id,

      label:
        t('main.screen', {
          n: i + 1,
          size: `${display.size.width}×${display.size.height}`
        }) + (display.id === controlId ? t('main.here') : ''),
      bounds: display.bounds,

      resolution: {
        width: Math.round(display.size.width * display.scaleFactor),
        height: Math.round(display.size.height * display.scaleFactor)
      },
      scaleFactor: display.scaleFactor,
      isPrimary: display.id === primaryId,
      isControl: display.id === controlId,
      assignedRole: role
    }
  })
}

export function listOutputs(): OutputWindowInfo[] {
  return [...outputs.values()].map((o) => ({
    role: o.role,
    displayId: o.displayId,
    open: !o.window.isDestroyed(),
    windowed: o.windowed
  }))
}

function rendererUrl(page: string, params: Record<string, string>): string {
  const query = new URLSearchParams(params).toString()
  const devServer = process.env.ELECTRON_RENDERER_URL
  if (devServer) return `${devServer}/${page}?${query}`

  const url = pathToFileURL(join(__dirname, `../renderer/${page}`))
  url.search = query
  return url.toString()
}

export const outputPageUrl = (role: OutputRole): string =>
  rendererUrl('output.html', { role })

export function openOutput(role: OutputRole, displayId: number): void {
  closeOutput(role)

  const display =
    screen.getAllDisplays().find((d) => d.id === displayId) ?? screen.getPrimaryDisplay()
  const windowed = showsWindowed(display.id, controlDisplayId())

  const window = new BrowserWindow({
    ...(windowed
      ? {
          width: Math.round(display.workArea.width * 0.5),
          height: Math.round((display.workArea.width * 0.5 * 9) / 16),
          x: display.workArea.x + Math.round(display.workArea.width * 0.45),
          y: display.workArea.y + Math.round(display.workArea.height * 0.45),
          frame: true,
          fullscreen: false,
          title: t('main.outputSingle', { role: roleTitle(role) })
        }
      : {
          x: display.bounds.x,
          y: display.bounds.y,
          width: display.bounds.width,
          height: display.bounds.height,
          frame: false,
          fullscreen: true
        }),

    backgroundColor: '#000000',
    show: false,
    autoHideMenuBar: true,
    skipTaskbar: false,

    ...(appIcon() ? { icon: appIcon()! } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      backgroundThrottling: false
    }
  })

  window.setMenuBarVisibility(false)

  window.on('page-title-updated', (event) => event.preventDefault())
  if (!windowed) window.setTitle(t('main.outputTitle', { role: roleTitle(role) }))

  window.once('ready-to-show', () => {
    window.showInactive()
    if (windowed) controlWindow()?.moveTop()
  })
  window.on('closed', () => {

    outputs.delete(role)
    remember()
    notifyControl?.()
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  void window.loadURL(rendererUrl('output.html', { role, windowed: String(windowed) }))
  outputs.set(role, { window, role, displayId: display.id, windowed })
  remember()
  notifyControl?.()
}

export function closeOutput(role: OutputRole): void {
  const entry = outputs.get(role)
  if (!entry) return
  outputs.delete(role)
  if (!entry.window.isDestroyed()) entry.window.destroy()
  remember()
  notifyControl?.()
}

export function closeAllOutputs(): void {
  keepAssignments()
  for (const role of [...outputs.keys()]) closeOutput(role)
}

export function keepAssignments(): void {
  remembering = false
}

const assignments = (): Assignment[] =>
  [...outputs.values()].map((o) => ({ role: o.role, displayId: o.displayId }))

function remember(): void {
  if (remembering) void writeSetting('outputs', assignments())
}

export async function restoreOutputs(): Promise<void> {
  const saved = (await readSettings()).outputs
  const plan = restorePlan(saved, screen.getAllDisplays(), controlDisplayId())
  for (const item of plan) openOutput(item.role, item.displayId)
}

export function broadcastLive(state: LiveState): void {
  for (const { window } of outputs.values()) {
    if (!window.isDestroyed()) window.webContents.send('live:update', state)
  }
}

export function watchDisplays(): void {

  let settle: NodeJS.Timeout | null = null
  const later = (): void => {
    if (settle) clearTimeout(settle)
    settle = setTimeout(rebalance, 500)
  }

  const rebalance = (): void => {
    settle = null
    const displays = screen.getAllDisplays()
    const controlId = controlDisplayId()

    const open = [...outputs.values()].map((o) => ({
      role: o.role,
      displayId: o.displayId,
      windowed: o.windowed
    }))

    for (const entry of open) {
      if (displays.some((d) => d.id === entry.displayId)) continue

      const fallback = fallbackScreen(displays, controlId)
      if (fallback) openOutput(entry.role, fallback.id)
      else closeOutput(entry.role)
    }

    for (const move of movable(open, displays, controlId)) {
      openOutput(move.role, move.displayId)
    }

    notifyControl?.()
  }

  screen.on('display-added', later)
  screen.on('display-removed', later)
  screen.on('display-metrics-changed', later)
}
