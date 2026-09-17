import { unzipSync } from 'fflate'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  cataloguePath,
  modulePath,
  type SiteCatalogue,
  type SiteModule
} from '@shared/site'
import { askSite, readAll } from '../siteFetch'
import { importModule } from './library'
import type { TranslationMeta } from '@shared/types'

const KEEP = 30 * 60_000

let cache: { at: number; data: SiteCatalogue } | null = null

const looksSane = (id: string): boolean =>
  /^[\p{L}\p{N} .+&~_-]{1,80}$/u.test(id) && !id.includes('..')

export async function siteCatalogue(fresh = false): Promise<SiteCatalogue> {
  if (!fresh && cache && Date.now() - cache.at < KEEP) return cache.data

  const answer = await askSite(cataloguePath())
  const data = (await answer.json()) as SiteCatalogue
  if (!Array.isArray(data?.modules)) throw new Error('Каталог не разобрать')

  const modules = data.modules.filter((one) => looksSane(one.id))
  cache = { at: Date.now(), data: { builtAt: data.builtAt ?? 0, modules } }
  return cache.data
}

export interface Progress {
  id: string

  got: number
  total: number
  stage: 'download' | 'unpack' | 'import' | 'done' | 'error'
  error?: string
}

export async function installFromSite(
  id: string,
  onStep: (progress: Progress) => void
): Promise<{ meta: TranslationMeta; warnings: string[] }> {
  if (!looksSane(id)) throw new Error(`Странное имя модуля: «${id}»`)

  const step = (stage: Progress['stage'], got = 0, total = 0): void =>
    onStep({ id, got, total, stage })

  step('download')
  const answer = await askSite(modulePath(id), 60_000)

  const zip = await readAll(answer, (got, total) => step('download', got, total))
  const got = zip.length

  step('unpack', got, got)
  const files = unzipSync(zip)

  const where = await mkdtemp(join(tmpdir(), 'visiologos-module-'))
  try {

    const names = Object.keys(files).filter((name) => !name.endsWith('/'))
    const prefix = `${id}/`
    const inside = names.every((name) => name.startsWith(prefix))

    for (const name of names) {
      const short = inside ? name.slice(prefix.length) : name

      if (!short || short.includes('..') || short.startsWith('/')) continue
      const target = join(where, short)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, files[name])
    }

    step('import', got, got)
    const result = await importModule(where, id)
    step('done', got, got)
    return result
  } finally {
    await rm(where, { recursive: true, force: true }).catch(() => undefined)
  }
}

export const installedIds = (metas: TranslationMeta[]): Set<string> =>
  new Set(metas.map((meta) => meta.id))

export type { SiteModule }
