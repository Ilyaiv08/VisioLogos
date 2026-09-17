import { execFile } from 'node:child_process'
import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { t } from '@shared/i18n'

const run = promisify(execFile)

export const isOldOffice = (buf: Buffer): boolean =>
  buf.length > 8 &&
  buf[0] === 0xd0 &&
  buf[1] === 0xcf &&
  buf[2] === 0x11 &&
  buf[3] === 0xe0

export interface OldPresentation {
  text: string

  asPptx: Buffer | null
}

export async function readOldPresentation(path: string): Promise<OldPresentation> {

  const copy = join(tmpdir(), `visiologos-${Date.now()}.pptx`)

  const script = `
$ErrorActionPreference = 'Stop'
$app = New-Object -ComObject PowerPoint.Application
$busy = $app.Presentations.Count -gt 0
try {
  $pres = $app.Presentations.Open('${quote(path)}', $true, $false, $false)
  try {
    try { $pres.SaveCopyAs('${quote(copy)}', 24) } catch { }
    $out = New-Object System.Text.StringBuilder
    foreach ($slide in $pres.Slides) {
      foreach ($shape in $slide.Shapes) {
        if ($shape.HasTextFrame -eq -1 -and $shape.TextFrame.HasText -eq -1) {
          [void]$out.AppendLine($shape.TextFrame.TextRange.Text)
        }
      }
      [void]$out.AppendLine('')
    }
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    [Console]::Out.Write($out.ToString())
  } finally { $pres.Close() }
} finally { if (-not $busy) { $app.Quit() } }
`

  const { stdout } = await run(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', encode(script)],
    { windowsHide: true, timeout: 120_000, maxBuffer: 8 << 20, encoding: 'utf8' }
  )

  const text = stdout.replace(/\r\n?/g, '\n').replace(//g, '\n').trim()

  let asPptx = null as Buffer | null
  try {
    asPptx = await readFile(copy)
  } catch {

  }

  await rm(copy, { force: true }).catch(() => {})

  return { text, asPptx }
}

export function reasonForPowerPoint(error: unknown): string {
  const text =
    String((error as { stderr?: string })?.stderr ?? '') ||
    (error instanceof Error ? error.message : String(error))

  return /80040154|не зарегистрирован|not registered|не удается создать|cannot create/i.test(
    text
  )
    ? t('main.noPowerPoint')
    : t('reason.pptxNoText')
}

const quote = (text: string): string => text.replace(/'/g, "''")
const encode = (script: string): string => Buffer.from(script, 'utf16le').toString('base64')
