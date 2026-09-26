import { readFile } from 'node:fs/promises'
import { unzip, unzipSync, type Unzipped } from 'fflate'
import { spellWith, vocabularyFromFst, vocabularyFromText } from '@shared/singAlong'

let loading: { path: string; words: Promise<Set<string> | null> } | null = null

export function forgetVocabulary(): void {
  loading = null
}

const wanted = (name: string): boolean =>
  name.endsWith('/words.txt') || name.endsWith('graph/Gr.fst')

function open(data: Uint8Array): Promise<Unzipped> {
  return new Promise((done) => {
    try {
      unzip(data, { filter: (file) => wanted(file.name) }, (error, files) => {
        if (!error) {
          done(files)
          return
        }
        try {
          done(unzipSync(data, { filter: (file) => wanted(file.name) }))
        } catch {
          done({})
        }
      })
    } catch {
      try {
        done(unzipSync(data, { filter: (file) => wanted(file.name) }))
      } catch {
        done({})
      }
    }
  })
}

async function load(path: string): Promise<Set<string> | null> {
  const zip = await readFile(path)
  const files = await open(new Uint8Array(zip.buffer, zip.byteOffset, zip.byteLength))

  const list = Object.entries(files)
  const text = list.find(([name]) => name.endsWith('/words.txt'))
  if (text) return vocabularyFromText(new TextDecoder('utf-8').decode(text[1]))

  const fst = list.find(([name]) => name.endsWith('graph/Gr.fst'))
  return fst ? vocabularyFromFst(fst[1]) : null
}

function vocabulary(path: string): Promise<Set<string> | null> {
  if (loading?.path === path) return loading.words

  const words = load(path).catch((error) => {
    console.error('[Голос] Не удалось прочитать словарь модуля:', error)
    return null
  })
  loading = { path, words }
  return words
}

export async function spellForVoice(
  path: string,
  tokens: string[]
): Promise<Record<string, string[]> | null> {
  const known = await vocabulary(path)
  if (!known || known.size === 0) return null

  const out: Record<string, string[]> = {}
  for (const token of tokens) {
    if (typeof token === 'string' && token) out[token] = spellWith(known, token)
  }
  return out
}
