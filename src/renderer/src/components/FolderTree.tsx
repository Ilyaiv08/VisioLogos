import { useState } from 'react'
import type { TreeScope } from '@shared/types'
import { childrenOf } from '@shared/tree'
import { SEPARATOR, useContextMenu, type MenuEntry } from './ContextMenu'
import { droppedPaths, hasFiles } from '../lib/dropFiles'
import { useT } from '../state/i18n'
import { useTree } from '../state/tree'

export interface TreeItem {
  id: string
  title: string

  meta?: string
  folderId: string | null
}

interface Props {
  scope: TreeScope
  items: TreeItem[]
  activeId: string | null
  rootLabel: string
  onOpen: (id: string) => void

  itemMenu: (item: TreeItem, rename: () => void) => MenuEntry[]

  onRenameItem?: (id: string, name: string) => void
  onMoveItem: (id: string, folderId: string | null) => void

  onReorder?: (id: string, beforeId: string | null, folderId: string | null) => void

  compare?: (a: TreeItem, b: TreeItem) => number

  onDropFiles?: (files: string[], folderId: string | null) => void

  onCreate?: (folderId: string | null) => void

  onFoldersRemoved?: (removed: string[], parentId: string | null) => void
}

export function FolderTree({
  scope,
  items,
  activeId,
  rootLabel,
  onOpen,
  itemMenu,
  onRenameItem,
  onMoveItem,
  onReorder,
  compare,
  onDropFiles,
  onCreate,
  onFoldersRemoved
}: Props): React.JSX.Element {
  const t = useT()
  const tree = useTree()
  const { open: openMenu, menu } = useContextMenu()
  const [editing, setEditing] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)

  const folders = tree.folders

  const drop = (e: React.DragEvent, folderId: string | null): void => {
    e.preventDefault()
    e.stopPropagation()
    setOver(null)

    if (hasFiles(e)) {
      if (!onDropFiles) return
      if (folderId) tree.expand(folderId)
      void droppedPaths(e).then((paths) => {
        if (paths.length > 0) onDropFiles(paths, folderId)
      })
      return
    }

    const data = e.dataTransfer.getData('text/plain')
    if (data.startsWith('folder:')) void tree.move(data.slice(7), folderId)
    else if (data.startsWith('item:')) onMoveItem(data.slice(5), folderId)
  }

  const dropBefore = (
    e: React.DragEvent,
    beforeId: string,
    folderId: string | null
  ): void => {
    e.preventDefault()
    e.stopPropagation()
    setOver(null)

    if (hasFiles(e)) {
      if (!onDropFiles) return
      void droppedPaths(e).then((paths) => {
        if (paths.length > 0) onDropFiles(paths, folderId)
      })
      return
    }

    const data = e.dataTransfer.getData('text/plain')
    if (!data.startsWith('item:')) return

    const id = data.slice(5)
    if (id !== beforeId) onReorder?.(id, beforeId, folderId)
  }

  const allow = (e: React.DragEvent, key: string): void => {
    e.preventDefault()
    e.stopPropagation()
    setOver(key)
  }

  const commit = (value: string, was: string, save: (name: string) => void): void => {
    const name = value.trim()
    if (name && name !== was) save(name)
  }

  const folderMenu = (id: string, parentId: string | null): MenuEntry[] => [
    { label: t('tree.newFolderInside'), onClick: () => void tree.create(scope, id) },
    ...(onCreate ? [{ label: t('tree.newServiceHere'), onClick: () => onCreate(id) }] : []),
    SEPARATOR,
    { label: t('common.rename'), hint: t('common.twoClicks'), onClick: () => setEditing(id) },
    {
      label: t('tree.deleteFolder'),
      danger: true,
      onClick: () => {
        void tree.remove(id).then((removed) => onFoldersRemoved?.(removed, parentId))
      }
    }
  ]

  const row = (folderId: string | null, depth: number): React.JSX.Element[] => {
    const nested = childrenOf(folders, scope, folderId).map((folder) => {
      const expanded = tree.open[folder.id] ?? false
      const inside = items.filter((i) => (i.folderId ?? null) === folder.id).length
      const subfolders = childrenOf(folders, scope, folder.id).length

      return (
        <div key={folder.id}>
          <div
            className={`treerow treerow--folder ${over === folder.id ? 'is-over' : ''}`}
            style={{ paddingLeft: 6 + depth * 13 }}
            draggable={editing !== folder.id}
            onDragStart={(e) => e.dataTransfer.setData('text/plain', `folder:${folder.id}`)}
            onDragOver={(e) => allow(e, folder.id)}
            onDragLeave={() => setOver((v) => (v === folder.id ? null : v))}
            onDrop={(e) => drop(e, folder.id)}
            onClick={() => tree.toggle(folder.id)}
            onDoubleClick={() => setEditing(folder.id)}
            onContextMenu={(e) => openMenu(e, folderMenu(folder.id, folderId))}
          >
            <span className={`treerow__arrow ${expanded ? 'is-open' : ''}`}>
              {subfolders + inside > 0 ? '▸' : '·'}
            </span>
            {editing === folder.id ? (
              <input
                className="treerow__edit"
                autoFocus
                defaultValue={folder.name}
                onFocus={(e) => e.target.select()}
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => {
                  commit(e.target.value, folder.name, (name) => void tree.rename(folder.id, name))
                  setEditing(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()

                  if (e.key === 'Escape') {
                    e.currentTarget.value = folder.name
                    setEditing(null)
                  }
                }}
              />
            ) : (
              <>
                <span className="treerow__name">{folder.name}</span>
                {inside > 0 && <span className="treerow__meta">{inside}</span>}
              </>
            )}
          </div>

          {expanded && row(folder.id, depth + 1)}
        </div>
      )
    })

    const own = items
      .filter((i) => (i.folderId ?? null) === folderId)
      .sort(compare ?? ((a, b) => a.title.localeCompare(b.title, 'ru')))
      .map((item) => (
        <div
          key={item.id}
          className={
            `treerow treerow--item ${item.id === activeId ? 'is-active' : ''} ` +
            `${over === item.id ? 'is-over' : ''}`
          }
          style={{ paddingLeft: 6 + depth * 13 + 15 }}
          draggable={editing !== item.id}
          onDragStart={(e) => e.dataTransfer.setData('text/plain', `item:${item.id}`)}
          onDragOver={(e) => onReorder && allow(e, item.id)}
          onDragLeave={() => setOver((v) => (v === item.id ? null : v))}
          onDrop={(e) => onReorder && dropBefore(e, item.id, folderId)}
          onClick={() => editing !== item.id && onOpen(item.id)}
          onDoubleClick={() => onRenameItem && setEditing(item.id)}
          onContextMenu={(e) => openMenu(e, itemMenu(item, () => setEditing(item.id)))}
        >
          {editing === item.id ? (
            <input
              className="treerow__edit"
              autoFocus
              defaultValue={item.title}
              onFocus={(e) => e.target.select()}
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => {
                commit(e.target.value, item.title, (name) => onRenameItem?.(item.id, name))
                setEditing(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') {
                  e.currentTarget.value = item.title
                  setEditing(null)
                }
              }}
            />
          ) : (
            <>
              <span className="treerow__name">{item.title}</span>
              {item.meta && <span className="treerow__meta">{item.meta}</span>}
            </>
          )}
        </div>
      ))

    return [...nested, ...own]
  }

  return (
    <div
      className={`tree ${over === 'root' ? 'is-over' : ''}`}
      onDragOver={(e) => allow(e, 'root')}
      onDragLeave={() => setOver((v) => (v === 'root' ? null : v))}
      onDrop={(e) => drop(e, null)}
      onContextMenu={(e) =>
        openMenu(e, [
          { label: t('tree.newFolder'), onClick: () => void tree.create(scope, null) },
          ...(onCreate
            ? [{ label: t('tree.newIn', { where: rootLabel }), onClick: () => onCreate(null) }]
            : [])
        ])
      }
    >
      {row(null, 0)}
      {menu}
    </div>
  )
}
