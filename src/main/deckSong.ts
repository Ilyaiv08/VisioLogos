import { access } from 'node:fs/promises'
import type { Song } from '@shared/types'
import { t } from '@shared/i18n'
import { deckFile, listDecks } from './deck'
import { backgroundOf, listSongs, readSongFile, saveSong, songName } from './songs'

export type DeckToSong =
  | {
      ok: true
      song: Song
      songs: Song[]

      background: { existed: boolean } | null
    }
  | { ok: false; reason: string }

export async function deckToSong(deckId: string): Promise<DeckToSong> {
  const deck = (await listDecks()).find((d) => d.id === deckId)
  if (!deck) return { ok: false, reason: t('main.deckGone') }

  if (deck.kind === 'photos') return { ok: false, reason: t('main.photosNotSong') }

  if (!deck.file) return { ok: false, reason: t('main.noDeckSource') }

  const path = deckFile(deck.id, deck.file)
  try {
    await access(path)
  } catch {
    return { ok: false, reason: t('main.noDeckSource') }
  }

  const source = deck.source || deck.name
  const { result: parsed, media } = await readSongFile(path, source)
  if (!parsed.ok) return { ok: false, reason: parsed.reason }

  const named = songName(source, parsed)
  const title = named.title || deck.name

  const kept = await backgroundOf(media, title, path)
  const song: Song = {
    ...parsed.song,
    id: `song-${Date.now()}`,
    title,
    number: named.number,
    background: kept.main?.background ?? null
  }

  await saveSong(song)
  return {
    ok: true,
    song,
    songs: await listSongs(),
    background: kept.main ? { existed: kept.main.existed } : null
  }
}
