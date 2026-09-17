export interface SiteRelease {
  os: string

  name: string
  version: string
  bytes: number
  builtAt: number

  sha256?: string
}

export type NoUpdate = 'portable' | 'dev' | 'os'

export interface UpdateNews {

  version: string

  current: string
  name: string
  bytes: number
  sha256: string | null

  why: NoUpdate | null
}

export interface UpdateStep {
  stage: 'download' | 'check' | 'run' | 'error'
  got: number
  total: number
  error?: string
}

export function isNewer(there: string, here: string): boolean {
  const parts = (text: string): number[] =>
    String(text ?? '')
      .split('-')[0]
      .split('.')
      .map((one) => Number.parseInt(one, 10))
      .map((one) => (Number.isFinite(one) ? one : 0))

  const a = parts(there)
  const b = parts(here)

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const left = a[i] ?? 0
    const right = b[i] ?? 0
    if (left !== right) return left > right
  }
  return false
}

export const looksLikeInstaller = (name: string): boolean =>
  /^VisioLogos-\d+\.\d+\.\d+-(setup|portable)\.exe$/i.test(name)

export function weighUpdate(bytes: number): string {
  const mb = bytes / 1048576
  if (mb >= 10) return `${Math.round(mb)} МБ`
  if (mb >= 1) return `${mb.toFixed(1).replace('.', ',')} МБ`
  return `${Math.max(1, Math.round(bytes / 1024))} КБ`
}
