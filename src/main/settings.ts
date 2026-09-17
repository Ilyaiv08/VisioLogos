import { app } from 'electron'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

type Settings = Record<string, unknown>

let cache: Settings | null = null
let pending: NodeJS.Timeout | null = null
let writing: Promise<void> = Promise.resolve()

const file = (): string => join(app.getPath('userData'), 'settings.json')

export async function readSettings(): Promise<Settings> {
  if (cache) return cache
  try {
    cache = JSON.parse(await readFile(file(), 'utf8')) as Settings
  } catch {

    cache = {}
  }
  return cache
}

export async function writeSetting(key: string, value: unknown): Promise<void> {
  const settings = await readSettings()
  if (value === undefined) delete settings[key]
  else settings[key] = value
  schedule()
}

function schedule(): void {
  if (pending) clearTimeout(pending)
  pending = setTimeout(() => {
    pending = null
    writing = writing.then(flush)
  }, 400)
}

async function flush(): Promise<void> {
  if (!cache) return
  const target = file()
  const tmp = `${target}.tmp`
  try {
    await writeFile(tmp, JSON.stringify(cache, null, 2), 'utf8')
    await rename(tmp, target)
  } catch (error) {
    console.error('[Настройки] Не удалось сохранить:', error)
  }
}

export async function flushSettings(): Promise<void> {
  if (pending) {
    clearTimeout(pending)
    pending = null
  }
  writing = writing.then(flush)
  await writing
}
