import { readFile } from 'node:fs/promises'
import type { Song } from '@shared/types'
import { defaultOrder, emptySong, numberFromName, parseSongText } from '@shared/songs'
import { t } from '@shared/i18n'
import { deckFile, listDecks } from './deck'
import { importSongFile, type ImportResult } from './songImport'
import { isOldOffice, readOldPresentation, reasonForPowerPoint } from './pptText'
import { backgroundOf, listSongs, saveSong } from './songs'

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
  let buf: Buffer
  try {
    buf = await readFile(path)
  } catch {
    return { ok: false, reason: t('main.noDeckSource') }
  }

  const old = isOldOffice(buf) ? await readOld(path, deck.name) : null

  const parsed = old?.result ?? importSongFile(deck.source || deck.name, buf)
  if (!parsed.ok) return { ok: false, reason: parsed.reason }

  const named = numberFromName(parsed.song.title.trim() || deck.name)
  const title = named.title || deck.name

  const kept = await backgroundOf(old?.media ?? buf, title, path)
  const song: Song = {
    ...parsed.song,
    id: `song-${Date.now()}`,
    title,
    number: parsed.song.number.trim() || named.number,
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

async function readOld(
  path: string,
  fallbackTitle: string
): Promise<{ result: ImportResult; media: Buffer }> {
  try {
    const old = await readOldPresentation(path)
    const media = old.asPptx ?? Buffer.alloc(0)

    const parts = parseSongText(old.text)
    if (parts.length === 0) {
      return { result: { ok: false, reason: t('reason.pptxNoText') }, media }
    }

    const song = emptySong()
    song.title = fallbackTitle
    song.parts = parts
    song.order = defaultOrder(parts)
    return { result: { ok: true, song, format: 'PowerPoint' }, media }
  } catch (error) {
    return {
      result: { ok: false, reason: reasonForPowerPoint(error) },
      media: Buffer.alloc(0)
    }
  }
}
