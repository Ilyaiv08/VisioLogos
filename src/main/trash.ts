import type { TrashEntry, TrashKind } from '@shared/types'
import { songsBin } from './songs'
import { textsBin } from './texts'
import { foldersBin } from './folders'

export async function listTrash(): Promise<TrashEntry[]> {
  const [songs, texts, services] = await Promise.all([
    songsBin.list(),
    textsBin.list(),
    foldersBin.list()
  ])

  return [
    ...songs.map((song) => ({
      kind: 'song' as const,
      id: song.id,
      title: song.title,
      count: song.parts.length,
      deletedAt: song.deletedAt ?? null
    })),
    ...texts.map((text) => ({
      kind: 'text' as const,
      id: text.id,

      title: text.title || text.body.split('\n')[0].slice(0, 60),
      count: 0,
      deletedAt: text.deletedAt ?? null
    })),
    ...services.map((folder) => ({
      kind: 'service' as const,
      id: folder.id,
      title: folder.title,
      count: folder.items.length,
      deletedAt: folder.deletedAt ?? null
    }))
  ]
}

const bin = (kind: TrashKind): { restore: (id: string) => Promise<boolean>; purge: (id: string) => Promise<boolean>; clear: () => Promise<number> } =>
  kind === 'song' ? songsBin : kind === 'text' ? textsBin : foldersBin

export const restoreFromTrash = (kind: TrashKind, id: string): Promise<boolean> =>
  bin(kind).restore(id)

export const purgeFromTrash = (kind: TrashKind, id: string): Promise<boolean> =>
  bin(kind).purge(id)

export const clearTrash = (kind: TrashKind): Promise<number> => bin(kind).clear()
