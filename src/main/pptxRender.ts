import { execFile } from 'node:child_process'
import { copyFile, mkdir, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

const WIDTH = 1920
const HEIGHT = 1080

export interface RenderedBackground {
  data: Uint8Array
  ext: string
  slides: number
}

const POWERPOINT = ['.ppt', '.pptx', '.pptm', '.potx', '.pps', '.ppsx']

export async function renderPptxBackgrounds(path: string): Promise<RenderedBackground[]> {
  if (process.platform !== 'win32') return []
  if (!POWERPOINT.includes(extOf(path))) return []

  const stage = join(tmpdir(), `visiologos-bg-${Date.now().toString(36)}`)
  const copy = join(stage, `source${extOf(path)}`)

  try {
    await mkdir(stage, { recursive: true })
    await copyFile(path, copy)
    return await exportLayouts(copy, stage)
  } catch (error) {
    console.error('[Песни] Не удалось отрисовать фон презентации:', error)
    return []
  } finally {
    await rm(stage, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function exportLayouts(copy: string, stage: string): Promise<RenderedBackground[]> {
  const script = `
$ErrorActionPreference = 'Stop'
$app = New-Object -ComObject PowerPoint.Application
$busy = $app.Presentations.Count -gt 0
try {
  $pres = $app.Presentations.Open('${quote(copy)}', $false, $false, $false)
  try {
    $w = $pres.PageSetup.SlideWidth
    $h = $pres.PageSetup.SlideHeight
    $width = ${WIDTH}
    $height = ${HEIGHT}
    if ($w -gt 0 -and $h -gt 0) {
      $height = [int][Math]::Round($width * $h / $w)
      if ($height -gt ${HEIGHT}) {
        $height = ${HEIGHT}
        $width = [int][Math]::Round($height * $w / $h)
      }
    }

    $count = @{}
    $first = @{}
    $order = New-Object System.Collections.ArrayList
    foreach ($slide in $pres.Slides) {
      $key = [string]$slide.CustomLayout.Index + '|' + $slide.CustomLayout.Name
      if (-not $count.ContainsKey($key)) {
        $count[$key] = 0
        $first[$key] = $slide.SlideIndex
        [void]$order.Add($key)
      }
      $count[$key] = $count[$key] + 1
    }

    $n = 0
    foreach ($key in $order) {
      $n++
      if ($n -gt 6) { break }
      $slide = $pres.Slides.Item($first[$key])
      for ($i = $slide.Shapes.Count; $i -ge 1; $i--) {
        $shape = $slide.Shapes.Item($i)
        if ($shape.HasTextFrame -eq -1 -and $shape.TextFrame.HasText -eq -1) { $shape.Delete() }
      }
      $name = '{0:d2}.png' -f $n
      $slide.Export((Join-Path '${quote(stage)}' $name), 'PNG', $width, $height)
      Write-Output ($name + "\`t" + $count[$key])
    }
    $pres.Saved = -1
  } finally { $pres.Close() }
} finally { if (-not $busy) { $app.Quit() } }
`

  const { stdout } = await run(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', encode(script)],
    { windowsHide: true, timeout: 180_000, maxBuffer: 1 << 20, encoding: 'utf8' }
  )

  const made = new Set(await readdir(stage).catch(() => [] as string[]))
  const out: RenderedBackground[] = []

  for (const line of stdout.split(/\r?\n/)) {
    const [name, uses] = line.trim().split('\t')
    if (!name || !made.has(name)) continue
    out.push({
      data: new Uint8Array(await readFile(join(stage, name))),
      ext: '.png',
      slides: Number(uses) || 1
    })
  }

  return out
}

const extOf = (path: string): string => {
  const at = path.lastIndexOf('.')
  return at > 0 ? path.slice(at).toLowerCase() : '.pptx'
}

const quote = (text: string): string => text.replace(/'/g, "''")

const encode = (script: string): string => Buffer.from(script, 'utf16le').toString('base64')
