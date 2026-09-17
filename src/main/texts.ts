import { app } from 'electron'
import { join } from 'node:path'
import type { TextItem } from '@shared/types'
import { jsonFile } from './jsonFile'
import { binOf, toTrash } from './bin'

interface TextsFile {
  items: TextItem[]
  trash: TextItem[]
}

const store = jsonFile<TextsFile>(
  () => join(app.getPath('userData'), 'texts.json'),
  () => ({ items: [], trash: [] })
)

export const flushTexts = store.flush

const KEEP_DELETED = 50

export const textsBin = binOf(store)

export async function listTexts(): Promise<TextItem[]> {
  const { items } = await store.read()
  return [...items].sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function saveText(item: TextItem): Promise<TextItem[]> {
  const file = await store.read()
  const next = { ...item, updatedAt: Date.now() }
  const at = file.items.findIndex((i) => i.id === item.id)

  if (at >= 0) file.items[at] = next
  else file.items.unshift(next)

  await store.write(file)
  return listTexts()
}

export async function deleteText(id: string): Promise<TextItem[]> {
  const file = await store.read()
  const item = file.items.find((i) => i.id === id)
  if (item) {
    file.items = file.items.filter((i) => i.id !== id)

    file.trash = toTrash(file.trash, item, KEEP_DELETED)
    await store.write(file)
  }
  return listTexts()
}
