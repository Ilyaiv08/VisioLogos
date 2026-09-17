export const DECK_EXTENSIONS = ['pptx', 'ppt', 'pdf']

export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif']

export function extensionOf(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? ''
  const at = name.lastIndexOf('.')
  return at > 0 ? name.slice(at + 1).toLowerCase() : ''
}

export const isDeckFile = (path: string): boolean =>
  DECK_EXTENSIONS.includes(extensionOf(path))

export const isImageFile = (path: string): boolean =>
  IMAGE_EXTENSIONS.includes(extensionOf(path))

export const isShowFile = (path: string): boolean => isDeckFile(path) || isImageFile(path)

export function folderOf(path: string): string {
  const at = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  return at > 0 ? path.slice(0, at) : ''
}

export const nameOf = (path: string): string => path.split(/[\\/]/).pop() ?? path

export const bareName = (path: string): string => nameOf(path).replace(/\.[^.]+$/, '')

export function splitDropped(paths: string[]): {
  decks: string[]
  photos: string[]
  bibles: string[]
  songs: string[]
} {
  return {
    decks: paths.filter(isDeckFile),
    photos: paths.filter(isImageFile),
    bibles: paths.filter(isBibleFile),
    songs: paths.filter((path) => !isShowFile(path) && !isBibleFile(path))
  }
}

export const isBibleFile = (path: string): boolean => extensionOf(path) === 'vlb'

export function photoGroups(paths: string[]): { name: string; files: string[] }[] {
  const groups = new Map<string, string[]>()

  for (const path of paths.filter(isImageFile)) {
    const folder = folderOf(path)
    const group = groups.get(folder)
    if (group) group.push(path)
    else groups.set(folder, [path])
  }

  return [...groups.entries()].map(([folder, files]) => ({

    name: files.length === 1 ? bareName(files[0]) : nameOf(folder) || bareName(files[0]),
    files: files.sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'ru', { numeric: true }))
  }))
}
