import { app } from 'electron'
import { join } from 'node:path'
import type { TreeFolder } from '@shared/types'
import { subtree } from '@shared/tree'
import { jsonFile } from './jsonFile'

interface TreeFile {
  folders: TreeFolder[]
}

const store = jsonFile<TreeFile>(
  () => join(app.getPath('userData'), 'tree.json'),
  () => ({ folders: [] })
)

export const flushTree = store.flush

export async function listFolders(): Promise<TreeFolder[]> {
  const { folders } = await store.read()
  return folders
}

export async function saveFolder(folder: TreeFolder): Promise<TreeFolder[]> {
  const file = await store.read()
  const at = file.folders.findIndex((f) => f.id === folder.id)

  if (at >= 0) file.folders[at] = folder
  else file.folders.push(folder)

  await store.write(file)
  return file.folders
}

export async function deleteFolder(id: string): Promise<{ folders: TreeFolder[]; removed: string[] }> {
  const file = await store.read()
  const removed = subtree(file.folders, id)

  file.folders = file.folders.filter((f) => !removed.includes(f.id))
  await store.write(file)

  return { folders: file.folders, removed }
}
