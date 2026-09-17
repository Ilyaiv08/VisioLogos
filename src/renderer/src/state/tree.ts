import { create } from 'zustand'
import { t } from '@shared/i18n'
import type { TreeFolder, TreeScope } from '@shared/types'
import { freeName, isInside, newFolder } from '@shared/tree'
import { remember } from './undo'

interface TreeStore {
  folders: TreeFolder[]

  open: Record<string, boolean>

  init: () => Promise<void>
  toggle: (id: string) => void
  expand: (id: string) => void

  create: (scope: TreeScope, parentId: string | null, name?: string) => Promise<TreeFolder>
  rename: (id: string, name: string) => Promise<void>

  move: (id: string, parentId: string | null) => Promise<boolean>

  remove: (id: string) => Promise<string[]>
}

export const useTree = create<TreeStore>((set, get) => ({
  folders: [],
  open: {},

  init: async () => set({ folders: await window.api.tree.list() }),

  toggle: (id) => set({ open: { ...get().open, [id]: !get().open[id] } }),
  expand: (id) => set({ open: { ...get().open, [id]: true } }),

  create: async (scope, parentId, name) => {
    const folder = newFolder(
      scope,
      freeName(get().folders, scope, parentId, name?.trim() || t('tree.untitledFolder')),
      parentId
    )
    set({ folders: await window.api.tree.save(folder) })

    if (parentId) get().expand(parentId)

    remember({
      label: t('undo.folderCreate'),
      undo: async () => {
        const { folders } = await window.api.tree.remove(folder.id)
        useTree.setState({ folders })
      },
      redo: async () => {
        useTree.setState({ folders: await window.api.tree.save(folder) })
      }
    })

    return folder
  },

  rename: async (id, name) => {
    const folder = get().folders.find((f) => f.id === id)
    if (!folder || !name.trim()) return

    const put = async (one: TreeFolder): Promise<void> => {
      useTree.setState({ folders: await window.api.tree.save(one) })
    }

    const next = { ...folder, name: name.trim() }
    await put(next)
    remember({
      label: t('undo.rename'),
      merge: 'tree-name-' + id,
      undo: () => put(folder),
      redo: () => put(next)
    })
  },

  move: async (id, parentId) => {
    const folder = get().folders.find((f) => f.id === id)
    if (!folder || (folder.parentId ?? null) === parentId) return false

    if (parentId && isInside(get().folders, parentId, id)) return false

    const put = async (one: TreeFolder): Promise<void> => {
      useTree.setState({ folders: await window.api.tree.save(one) })
    }

    const next = { ...folder, parentId }
    await put(next)
    remember({ label: t('undo.move'), undo: () => put(folder), redo: () => put(next) })

    if (parentId) get().expand(parentId)
    return true
  },

  remove: async (id) => {
    const before = get().folders
    const { folders, removed } = await window.api.tree.remove(id)
    set({ folders })

    const gone = before.filter((f) => removed.includes(f.id))
    remember({
      label: t('undo.folderRemove', { name: gone.find((f) => f.id === id)?.name ?? '' }),
      undo: async () => {
        let list = useTree.getState().folders
        for (const folder of [...gone].reverse()) {
          list = await window.api.tree.save(folder)
        }
        useTree.setState({ folders: list })
      },
      redo: async () => {
        const again = await window.api.tree.remove(id)
        useTree.setState({ folders: again.folders })
      }
    })

    return removed
  }
}))
