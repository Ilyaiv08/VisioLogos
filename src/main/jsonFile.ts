import { readFile, rename, writeFile } from 'node:fs/promises'

export interface JsonFile<T> {
  read: () => Promise<T>
  write: (value: T) => Promise<void>

  flush: () => Promise<void>
}

export function jsonFile<T>(path: () => string, fallback: () => T): JsonFile<T> {
  let cache: T | null = null
  let pending: NodeJS.Timeout | null = null
  let queue: Promise<void> = Promise.resolve()

  const save = async (): Promise<void> => {
    if (cache === null) return
    const target = path()
    const tmp = `${target}.tmp`
    try {
      await writeFile(tmp, JSON.stringify(cache, null, 2), 'utf8')
      await rename(tmp, target)
    } catch (error) {
      console.error(`[Хранилище] Не удалось сохранить «${target}»:`, error)
    }
  }

  const schedule = (): void => {
    if (pending) clearTimeout(pending)
    pending = setTimeout(() => {
      pending = null
      queue = queue.then(save)
    }, 400)
  }

  return {
    async read(): Promise<T> {
      if (cache !== null) return cache
      try {
        cache = JSON.parse(await readFile(path(), 'utf8')) as T
      } catch {

        cache = fallback()
      }
      return cache
    },

    async write(value: T): Promise<void> {
      cache = value
      schedule()
    },

    async flush(): Promise<void> {
      if (pending) {
        clearTimeout(pending)
        pending = null
      }
      queue = queue.then(save)
      await queue
    }
  }
}
