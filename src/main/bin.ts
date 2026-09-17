import type { JsonFile } from './jsonFile'

export interface Deletable {
  id: string
  deletedAt?: number
}

interface Store<T> {
  items: T[]
  trash: T[]
}

export interface Bin<T> {
  list: () => Promise<T[]>

  restore: (id: string) => Promise<boolean>

  purge: (id: string) => Promise<boolean>

  clear: () => Promise<number>
}

export function binOf<T extends Deletable>(store: JsonFile<Store<T>>): Bin<T> {
  return {
    async list() {
      const { trash } = await store.read()
      return trash
    },

    async restore(id) {
      const file = await store.read()
      const found = file.trash.find((item) => item.id === id)
      if (!found) return false

      const { deletedAt: _gone, ...rest } = found
      file.trash = file.trash.filter((item) => item.id !== id)
      file.items.unshift({ ...(rest as T), updatedAt: Date.now() } as T)
      await store.write(file)
      return true
    },

    async purge(id) {
      const file = await store.read()
      if (!file.trash.some((item) => item.id === id)) return false
      file.trash = file.trash.filter((item) => item.id !== id)
      await store.write(file)
      return true
    },

    async clear() {
      const file = await store.read()
      const had = file.trash.length
      if (had === 0) return 0
      file.trash = []
      await store.write(file)
      return had
    }
  }
}

export function toTrash<T extends Deletable>(trash: T[], item: T, keep: number): T[] {
  return [{ ...item, deletedAt: Date.now() }, ...trash].slice(0, keep)
}
