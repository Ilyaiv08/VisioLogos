import type { CatalogSong, CatalogTab } from './types'
import { t } from './i18n'
import { sameText } from './songs'

export function defaultTabs(): CatalogTab[] {
  return [
    { id: 'tab-revival', name: t('catalog.tabRevival') },
    { id: 'tab-kids', name: t('catalog.tabKids') },
    { id: 'tab-elder', name: t('catalog.tabElder') }
  ]
}

export const catalogKey = (title: string): string => sameText(title)

export function findSame(
  songs: CatalogSong[],
  title: string,
  exceptId?: string
): CatalogSong | null {
  const key = catalogKey(title)
  if (!key) return null
  return songs.find((s) => s.id !== exceptId && catalogKey(s.title) === key) ?? null
}

export function matches(song: CatalogSong, query: string): boolean {
  const q = sameText(query)
  if (!q) return true
  return catalogKey(song.title).includes(q) || song.number.toLowerCase() === query.trim().toLowerCase()
}

export const searchCatalog = (songs: CatalogSong[], query: string): CatalogSong[] =>
  query.trim() ? songs.filter((s) => matches(s, query)) : songs

export function tabAfterRemoved(tabs: CatalogTab[], id: string): CatalogTab | null {
  if (tabs.length < 2) return null
  return tabs.find((tab) => tab.id !== id) ?? null
}

export function movedTab(tabs: CatalogTab[], id: string, delta: number): CatalogTab[] {
  const at = tabs.findIndex((tab) => tab.id === id)
  const to = at + delta
  if (at < 0 || to < 0 || to >= tabs.length) return tabs

  const next = [...tabs]
  const [moved] = next.splice(at, 1)
  next.splice(to, 0, moved)
  return next
}

export function freeTabName(tabs: CatalogTab[], base: string): string {
  const taken = new Set(tabs.map((tab) => tab.name.trim().toLowerCase()))
  if (!taken.has(base.trim().toLowerCase())) return base

  for (let n = 2; n < 500; n++) {
    const name = `${base} ${n}`
    if (!taken.has(name.toLowerCase())) return name
  }
  return base
}
