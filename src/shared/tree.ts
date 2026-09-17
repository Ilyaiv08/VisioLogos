import type { TreeFolder, TreeScope } from './types'

let counter = 0

export function newFolder(scope: TreeScope, name: string, parentId: string | null): TreeFolder {
  return {
    id: `fld-${Date.now().toString(36)}${(counter++).toString(36)}`,
    scope,
    parentId,
    name,
    createdAt: Date.now()
  }
}

export function childrenOf(
  folders: TreeFolder[],
  scope: TreeScope,
  parentId: string | null
): TreeFolder[] {
  return folders
    .filter((f) => f.scope === scope && (f.parentId ?? null) === parentId)
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

export function pathOf(folders: TreeFolder[], id: string | null): TreeFolder[] {
  const path: TreeFolder[] = []
  const seen = new Set<string>()

  let at = id
  while (at && !seen.has(at)) {
    seen.add(at)
    const folder = folders.find((f) => f.id === at)
    if (!folder) break
    path.unshift(folder)
    at = folder.parentId
  }
  return path
}

export function isInside(folders: TreeFolder[], id: string, parent: string): boolean {
  return pathOf(folders, id).some((f) => f.id === parent) || id === parent
}

export function subtree(folders: TreeFolder[], id: string): string[] {
  const found = [id]

  for (let at = 0; at < found.length; at++) {
    for (const folder of folders) {
      if (folder.parentId === found[at] && !found.includes(folder.id)) found.push(folder.id)
    }
  }
  return found
}

export function freeName(
  folders: TreeFolder[],
  scope: TreeScope,
  parentId: string | null,
  base: string
): string {
  const taken = new Set(childrenOf(folders, scope, parentId).map((f) => f.name.toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base

  for (let n = 2; n < 500; n++) {
    const name = `${base} ${n}`
    if (!taken.has(name.toLowerCase())) return name
  }
  return base
}
