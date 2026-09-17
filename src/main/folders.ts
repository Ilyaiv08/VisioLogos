import { app } from 'electron'
import { join } from 'node:path'
import type { ServiceFolder } from '@shared/types'
import { jsonFile } from './jsonFile'
import { binOf, toTrash } from './bin'

interface FoldersFile {
  items: ServiceFolder[]
  trash: ServiceFolder[]
}

const store = jsonFile<FoldersFile>(
  () => join(app.getPath('userData'), 'folders.json'),
  () => ({ items: [], trash: [] })
)

export const flushFolders = store.flush

const KEEP_DELETED = 50

export const foldersBin = binOf(store)

export async function listFolders(): Promise<ServiceFolder[]> {
  const { items } = await store.read()

  return [...items].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
}

export async function saveFolder(folder: ServiceFolder): Promise<ServiceFolder[]> {
  const file = await store.read()
  const next = { ...folder, updatedAt: Date.now() }
  const at = file.items.findIndex((f) => f.id === folder.id)

  if (at >= 0) file.items[at] = next
  else file.items.unshift(next)

  await store.write(file)
  return listFolders()
}

export async function deleteFolder(id: string): Promise<ServiceFolder[]> {
  const file = await store.read()
  const folder = file.items.find((f) => f.id === id)
  if (folder) {
    file.items = file.items.filter((f) => f.id !== id)
    file.trash = toTrash(file.trash, folder, KEEP_DELETED)
    await store.write(file)
  }
  return listFolders()
}
