import { app, shell } from 'electron'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { SITE } from '@shared/site'
import {
  isNewer,
  looksLikeInstaller,
  type NoUpdate,
  type SiteRelease,
  type UpdateNews,
  type UpdateStep
} from '@shared/update'
import { askSite, readAll } from './siteFetch'

const KEEP = 24 * 60 * 60_000

let cache: { at: number; news: UpdateNews | null } | null = null

function whyNot(): NoUpdate | null {
  if (process.platform !== 'win32') return 'os'
  if (!app.isPackaged) return 'dev'

  if (process.env.PORTABLE_EXECUTABLE_DIR) return 'portable'
  return null
}

export async function checkUpdate(fresh = false): Promise<UpdateNews | null> {
  if (!fresh && cache && Date.now() - cache.at < KEEP) return cache.news

  const news = await ask().catch(() => null)
  cache = { at: Date.now(), news }
  return news
}

async function ask(): Promise<UpdateNews | null> {
  const answer = await askSite('/api/release')
  const data = (await answer.json()) as { win?: SiteRelease | null }
  const release = data?.win
  if (!release?.version || !release.name) return null

  const current = app.getVersion()
  if (!isNewer(release.version, current)) return null
  if (!looksLikeInstaller(release.name)) return null

  return {
    version: release.version,
    current,
    name: release.name,
    bytes: Number(release.bytes) || 0,
    sha256: typeof release.sha256 === 'string' ? release.sha256 : null,
    why: whyNot()
  }
}

export const forgetUpdate = (): void => {
  cache = null
}

export async function installUpdate(onStep: (step: UpdateStep) => void): Promise<void> {
  const news = await checkUpdate(true)
  if (!news) throw new Error('Обновлений нет')
  if (news.why) throw new Error(`Здесь обновиться нельзя: ${news.why}`)

  const step = (stage: UpdateStep['stage'], got = 0, total = 0): void =>
    onStep({ stage, got, total })

  step('download')
  const answer = await askSite('/download/app', 15 * 60_000)
  const file = await readAll(answer, (got, total) =>
    step('download', got, total || news.bytes)
  )

  step('check', file.length, file.length)

  if (news.sha256) {
    const got = createHash('sha256').update(file).digest('hex')
    if (got !== news.sha256) {
      throw new Error('Файл скачался не полностью — попробуйте ещё раз')
    }
  } else if (news.bytes && file.length !== news.bytes) {
    throw new Error('Файл скачался не полностью — попробуйте ещё раз')
  }

  const where = join(app.getPath('temp'), 'visiologos-update')
  await mkdir(where, { recursive: true })
  const path = join(where, news.name)
  await writeFile(path, file)
  await chmod(path, 0o755).catch(() => undefined)

  step('run', file.length, file.length)
  await run(path)

  forgetUpdate()
  app.quit()
}

async function run(path: string): Promise<void> {
  const child = spawn(path, [], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false
  })

  let failed: Error | null = null
  child.on('error', (error) => (failed = error))
  child.unref()

  await new Promise((done) => setTimeout(done, 2000))

  if (failed) throw new Error(`Установщик не запустился: ${(failed as Error).message}`)
  if (!child.pid) throw new Error('Установщик не запустился')
  if (child.exitCode !== null && child.exitCode !== 0) {
    throw new Error(`Установщик закрылся с ошибкой (${child.exitCode})`)
  }
}

export async function openDownloadPage(): Promise<void> {
  await shell.openExternal(SITE)
}

export function showDownloaded(): void {
  void shell.openPath(join(app.getPath('temp'), 'visiologos-update'))
}
