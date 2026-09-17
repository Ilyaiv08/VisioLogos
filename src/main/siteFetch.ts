import { net } from 'electron'
import { siteHosts } from '@shared/site'

export async function askSite(path: string, timeout = 15_000): Promise<Response> {
  let last: unknown = null

  for (const host of siteHosts()) {
    const stop = AbortSignal.timeout(timeout)
    try {
      const answer = await net.fetch(host + path, { signal: stop })
      if (answer.ok) return answer
      last = new Error(`${host}: ответил ${answer.status}`)
    } catch (error) {
      last = error
    }
  }
  throw last instanceof Error ? last : new Error('Сайт не отвечает')
}

export async function readAll(
  answer: Response,
  onStep?: (got: number, total: number) => void
): Promise<Uint8Array> {
  const total = Number(answer.headers.get('content-length')) || 0
  const reader = answer.body?.getReader()
  if (!reader) throw new Error('Пустой ответ сайта')

  const parts: Uint8Array[] = []
  let got = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(value)
    got += value.length
    onStep?.(got, total)
  }

  const all = new Uint8Array(got)
  let at = 0
  for (const part of parts) {
    all.set(part, at)
    at += part.length
  }
  return all
}
