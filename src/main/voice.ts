import { app, BrowserWindow, dialog, net } from 'electron'
import { copyFile, mkdir, rename, stat, writeFile } from 'node:fs/promises'
import { join, normalize, sep } from 'node:path'
import { t } from '@shared/i18n'
import { askSite, readAll } from './siteFetch'

const SOURCE = 'https://alphacephei.com/vosk/models/vosk-model-small-ru-0.22.zip'

const ON_SITE = '/download/voice/vosk-model-small-ru.zip'

const MIN_BYTES = 20 * 1024 * 1024

const SERVED_AS = 'model.zip'

const dir = (): string => join(app.getPath('userData'), 'voice')
const modelPath = (): string => join(dir(), 'model-ru.zip')

export interface VoiceModel {
  installed: boolean
  bytes: number
}

export async function voiceModel(): Promise<VoiceModel> {
  try {
    const info = await stat(modelPath())
    return { installed: info.size >= MIN_BYTES, bytes: info.size }
  } catch {
    return { installed: false, bytes: 0 }
  }
}

export interface VoiceStep {
  stage: 'ask' | 'download' | 'save' | 'done'
  got?: number
  total?: number
}

export async function installVoice(
  onStep: (step: VoiceStep) => void
): Promise<VoiceModel> {
  await mkdir(dir(), { recursive: true })
  onStep({ stage: 'ask' })

  const answer = await fromSite().catch(() => fromVosk())
  const data = await readAll(answer, (got, total) =>
    onStep({ stage: 'download', got, total })
  )

  if (data.length < MIN_BYTES) throw new Error(t('voice.tooSmall'))

  onStep({ stage: 'save' })

  const tmp = `${modelPath()}.part`
  await writeFile(tmp, data)
  await rename(tmp, modelPath())

  onStep({ stage: 'done' })
  return voiceModel()
}

const fromSite = (): Promise<Response> => askSite(ON_SITE, 8000)

async function fromVosk(): Promise<Response> {
  const answer = await net.fetch(SOURCE, { signal: AbortSignal.timeout(60_000) })
  if (!answer.ok) throw new Error(`${SOURCE}: ответил ${answer.status}`)
  return answer
}

export async function installVoiceFromFile(
  parent: BrowserWindow | null
): Promise<VoiceModel | null> {
  const picked = await dialog.showOpenDialog(parent ?? undefined!, {
    title: t('voice.pickFile'),
    properties: ['openFile'],
    filters: [
      { name: t('voice.fileFilter'), extensions: ['zip'] },
      { name: t('main.allFiles'), extensions: ['*'] }
    ]
  })

  const from = picked.filePaths[0]
  if (picked.canceled || !from) return null

  const info = await stat(from)
  if (info.size < MIN_BYTES) throw new Error(t('voice.tooSmall'))

  await mkdir(dir(), { recursive: true })
  await copyFile(from, modelPath())
  return voiceModel()
}

export function voiceFile(path: string): string | null {
  const wanted = path.replace(/^\/+/, '') || 'voice.html'
  if (wanted === SERVED_AS) return modelPath()

  const root = join(__dirname, '../renderer')
  const full = normalize(join(root, wanted))
  return full.startsWith(root + sep) ? full : null
}

let page: BrowserWindow | null = null
let toControl: (() => BrowserWindow | null) | null = null

export function voiceTalksTo(control: () => BrowserWindow | null): void {
  toControl = control
}

function listener(): BrowserWindow {
  if (page && !page.isDestroyed()) return page

  page = new BrowserWindow({
    show: false,
    skipTaskbar: true,
    width: 420,
    height: 320,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,

      backgroundThrottling: false
    }
  })

  const devServer = process.env.ELECTRON_RENDERER_URL
  if (devServer) void page.loadURL(`${devServer}/voice.html`)
  else void page.loadURL('visio://voice/voice.html')

  page.on('closed', () => {
    page = null
  })

  return page
}

export interface VoiceCommand {
  do: 'start' | 'stop' | 'devices' | 'grammar'
  deviceId?: string | null
  grammar?: string | null
}

export function voiceCommand(command: VoiceCommand): void {
  const where = listener()

  if (where.webContents.isLoading()) {
    where.webContents.once('did-finish-load', () =>
      where.webContents.send('voice:command', command)
    )
  } else {
    where.webContents.send('voice:command', command)
  }
}

export function voiceToControl(channel: string, payload: unknown): void {
  const control = toControl?.()
  if (control && !control.isDestroyed()) control.webContents.send(channel, payload)
}

export function closeVoice(): void {
  if (page && !page.isDestroyed()) page.destroy()
  page = null
}
