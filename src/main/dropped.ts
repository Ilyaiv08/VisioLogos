import { readdir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'

const MAX_DEPTH = 4

const MAX_FILES = 200

export async function expandFiles(paths: string[], depth = MAX_DEPTH): Promise<string[]> {
  const out: string[] = []

  for (const path of paths) {
    if (out.length >= MAX_FILES) break

    if (basename(path).startsWith('.')) continue

    let info: Awaited<ReturnType<typeof stat>>
    try {
      info = await stat(path)
    } catch {
      continue
    }

    if (info.isFile()) {
      out.push(path)
    } else if (info.isDirectory() && depth > 0) {
      const inside = await readdir(path)

      const nested = await expandFiles(
        inside
          .sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }))
          .map((name) => join(path, name)),
        depth - 1
      )
      out.push(...nested)
    }
  }

  return out.slice(0, MAX_FILES)
}
