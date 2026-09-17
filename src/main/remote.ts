import { globalShortcut, type BrowserWindow } from 'electron'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

export interface RemoteDevice {
  name: string

  likely: boolean
}

const WORDS = [
  'presenter',
  'presentation',
  'spotlight',
  'clicker',
  'wireless presenter',
  'презент',
  'пульт',
  'указк',
  'r400',
  'r500',
  'r700',
  'r800'
]

const KEEP = 20_000

let cache: { at: number; devices: RemoteDevice[] } | null = null

export async function listRemotes(fresh = false): Promise<RemoteDevice[]> {
  if (!fresh && cache && Date.now() - cache.at < KEEP) return cache.devices

  const devices = await askWindows()
  cache = { at: Date.now(), devices }
  return devices
}

async function askWindows(): Promise<RemoteDevice[]> {
  if (process.platform !== 'win32') return []

  const script = `
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue |
  Where-Object { $_.Status -eq 'OK' -and ($_.PNPClass -eq 'HIDClass' -or $_.PNPClass -eq 'Keyboard' -or $_.PNPClass -eq 'Mouse') } |
  ForEach-Object { $_.Name }
`

  try {
    const { stdout } = await run(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encode(script)],
      { windowsHide: true, timeout: 15_000, maxBuffer: 1 << 20 }
    )
    return read(stdout)
  } catch (error) {

    console.error('[Пульт] Не удалось спросить список устройств:', error)
    return []
  }
}

function read(stdout: string): RemoteDevice[] {
  const seen = new Set<string>()
  const devices: RemoteDevice[] = []

  for (const line of stdout.split(/\r?\n/)) {
    const name = line.trim()
    if (!name || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())

    const low = name.toLowerCase()
    devices.push({ name, likely: WORDS.some((word) => low.includes(word)) })
  }

  return devices.sort((a, b) => Number(b.likely) - Number(a.likely))
}

const encode = (script: string): string => Buffer.from(script, 'utf16le').toString('base64')

const GLOBAL_KEYS = ['PageDown', 'PageUp']

let toControl: (() => BrowserWindow | null) | null = null

let allowed = true

let onScreen = false
let armed = false

export function watchGlobalRemote(control: () => BrowserWindow | null): void {
  toControl = control
}

export function setGlobalRemote(on: boolean): void {
  allowed = on
  arm()
}

export function remoteLiveChanged(live: boolean): void {
  onScreen = live
  arm()
}

export function releaseGlobalRemote(): void {
  onScreen = false
  arm()
}

function arm(): void {
  const need = allowed && onScreen && toControl !== null
  if (need === armed) return
  armed = need

  if (!need) {
    for (const key of GLOBAL_KEYS) globalShortcut.unregister(key)
    return
  }

  for (const key of GLOBAL_KEYS) {
    try {
      globalShortcut.register(key, () => send(key))
    } catch (error) {

      console.error(`[Пульт] Не удалось занять ${key}:`, error)
    }
  }
}

function send(key: string): void {
  const window = toControl?.()
  if (window && !window.isDestroyed()) window.webContents.send('remote:key', key)
}
