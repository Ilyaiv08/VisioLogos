import type { Background } from './types'

export interface SlideParts {
  slide?: string | null
  layout?: string | null
  master?: string | null
  theme?: string | null
}

export function backgroundFromXml(parts: SlideParts): Background | null {
  const bg =
    tagOf(parts.slide, 'p:bg') ?? tagOf(parts.layout, 'p:bg') ?? tagOf(parts.master, 'p:bg')
  if (!bg) return null

  const map = colorMap(parts.master)

  const own = tagOf(bg, 'p:bgPr')
  if (own) return fillToBackground(own, null, parts.theme, map)

  const ref = tagOf(bg, 'p:bgRef')
  if (!ref) return null

  const idx = Number(ref.match(/\bidx="(\d+)"/)?.[1] ?? 0)
  const fill = themeFill(parts.theme, idx)
  if (!fill) return null

  const accent = colorOf(ref, parts.theme, map, null)
  return fillToBackground(fill, accent, parts.theme, map)
}

function fillToBackground(
  xml: string,
  phClr: string | null,
  theme: string | null | undefined,
  map: Record<string, string>
): Background | null {
  const solid = tagOf(xml, 'a:solidFill')
  if (solid) {
    const color = colorOf(solid, theme, map, phClr)
    return color ? { kind: 'color', color } : null
  }

  const grad = tagOf(xml, 'a:gradFill')
  if (grad) {
    const css = gradientCss(grad, theme, map, phClr)
    return css ? { kind: 'gradient', css } : null
  }

  return null
}

function gradientCss(
  xml: string,
  theme: string | null | undefined,
  map: Record<string, string>,
  phClr: string | null
): string | null {
  const stops: string[] = []

  for (const [, at, body] of xml.matchAll(/<a:gs\s+pos="(\d+)"\s*>([\s\S]*?)<\/a:gs>/g)) {
    const color = colorOf(body, theme, map, phClr)
    if (color) stops.push(`${color} ${Math.round(Number(at) / 1000)}%`)
  }
  if (stops.length < 2) return null

  const round = tagOf(xml, 'a:path')
  if (round) {

    const box = round.match(/<a:fillToRect\b[^>]*>/)?.[0] ?? ''
    const side = (name: string): number =>
      Number(box.match(new RegExp(`\\b${name}="(-?\\d+)"`))?.[1] ?? 0) / 1000

    const x = middle(side('l'), side('r'))
    const y = middle(side('t'), side('b'))

    return `radial-gradient(farthest-corner at ${x}% ${y}%, ${stops.join(', ')})`
  }

  const ang = Number(tagOf(xml, 'a:lin')?.match(/\bang="(-?\d+)"/)?.[1] ?? 0) / 60000
  return `linear-gradient(${Math.round(ang + 90)}deg, ${stops.join(', ')})`
}

function middle(from: number, to: number): number {
  const near = from
  const far = 100 - to
  const at = near <= far ? (near + far) / 2 : near
  return Math.min(100, Math.max(0, Math.round(at)))
}

function colorOf(
  xml: string,
  theme: string | null | undefined,
  map: Record<string, string>,
  phClr: string | null
): string | null {

  const found = xml.match(/<a:(srgbClr|schemeClr)\b([^>]*?)(\/>|>([\s\S]*?)<\/a:\1>)/)
  if (!found) return null

  const kind = found[1]
  const value = found[2].match(/\bval="([^"]+)"/)?.[1]
  if (!value) return null

  const base =
    kind === 'srgbClr'
      ? `#${value.toLowerCase()}`
      : value === 'phClr'
        ? phClr
        : schemeColor(theme, map, value)

  return base ? transform(base, found[4] ?? '') : null
}

function schemeColor(
  theme: string | null | undefined,
  map: Record<string, string>,
  name: string
): string | null {
  const real = map[name] ?? name
  const scheme = tagOf(theme, 'a:clrScheme')
  if (!scheme) return null

  const slot = tagOf(scheme, `a:${real}`)
  if (!slot) return null

  const direct = slot.match(/<a:srgbClr\s+val="([0-9A-Fa-f]{6})"/)
  if (direct) return `#${direct[1].toLowerCase()}`

  const sys = slot.match(/<a:sysClr\b[^>]*\blastClr="([0-9A-Fa-f]{6})"/)
  return sys ? `#${sys[1].toLowerCase()}` : null
}

function colorMap(master: string | null | undefined): Record<string, string> {
  const tag = master?.match(/<p:clrMap\b[^>]*>/)?.[0]
  if (!tag) return {}

  const map: Record<string, string> = {}
  for (const [, from, to] of tag.matchAll(/(\w+)="(\w+)"/g)) map[from] = to
  return map
}

const share = (xml: string, name: string): number | null => {
  const found = xml.match(new RegExp(`<a:${name}\\s+val="(-?\\d+)"`))
  return found ? Number(found[1]) / 100000 : null
}

function transform(hex: string, xml: string): string {
  let [r, g, b] = rgb(hex)

  const tint = share(xml, 'tint')
  if (tint !== null) {
    r = r * tint + 255 * (1 - tint)
    g = g * tint + 255 * (1 - tint)
    b = b * tint + 255 * (1 - tint)
  }

  const shade = share(xml, 'shade')
  if (shade !== null) {
    r *= shade
    g *= shade
    b *= shade
  }

  const lumMod = share(xml, 'lumMod')
  const lumOff = share(xml, 'lumOff')
  const satMod = share(xml, 'satMod')

  if (lumMod !== null || lumOff !== null || satMod !== null) {
    const [h, s, l] = toHsl(r, g, b)
    const light = Math.min(1, Math.max(0, l * (lumMod ?? 1) + (lumOff ?? 0)))
    const sat = Math.min(1, Math.max(0, s * (satMod ?? 1)))
    ;[r, g, b] = fromHsl(h, sat, light)
  }

  return toHex(r, g, b)
}

const rgb = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const toHex = (r: number, g: number, b: number): string => {
  const one = (v: number): string =>
    Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, '0')
  return `#${one(r)}${one(g)}${one(b)}`
}

function toHsl(r: number, g: number, b: number): [number, number, number] {
  const R = r / 255
  const G = g / 255
  const B = b / 255
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const l = (max + min) / 2

  if (max === min) return [0, 0, l]

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h =
    max === R
      ? ((G - B) / d + (G < B ? 6 : 0)) / 6
      : max === G
        ? ((B - R) / d + 2) / 6
        : ((R - G) / d + 4) / 6

  return [h, s, l]
}

function fromHsl(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255]

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const one = (t: number): number => {
    let v = t
    if (v < 0) v += 1
    if (v > 1) v -= 1
    if (v < 1 / 6) return p + (q - p) * 6 * v
    if (v < 1 / 2) return q
    if (v < 2 / 3) return p + (q - p) * (2 / 3 - v) * 6
    return p
  }

  return [one(h + 1 / 3) * 255, one(h) * 255, one(h - 1 / 3) * 255]
}

function themeFill(theme: string | null | undefined, idx: number): string | null {
  if (!theme || idx <= 0) return null

  const list = tagOf(theme, idx >= 1000 ? 'a:bgFillStyleLst' : 'a:fillStyleLst')
  if (!list) return null

  return nth(list, idx >= 1000 ? idx - 1000 : idx)
}

function nth(list: string, n: number): string | null {
  const kinds = ['solidFill', 'gradFill', 'blipFill', 'pattFill', 'noFill']
  let at = 0
  let seen = 0

  while (at < list.length) {
    const rest = list.slice(at)

    let start = -1
    let kind = ''
    for (const one of kinds) {
      const found = rest.search(new RegExp(`<a:${one}(\\s|/|>)`))
      if (found >= 0 && (start < 0 || found < start)) {
        start = found
        kind = one
      }
    }
    if (start < 0) return null

    const piece = tagOf(rest.slice(start), `a:${kind}`)
    if (!piece) return null

    if (++seen === n) return piece
    at += start + piece.length
  }

  return null
}

function tagOf(xml: string | null | undefined, name: string): string | null {
  if (!xml) return null

  const open = xml.match(new RegExp(`<${name}(\\s[^>]*?)?(/)?>`))
  if (!open || open.index === undefined) return null
  if (open[2]) return open[0]

  const end = xml.indexOf(`</${name}>`, open.index)
  return end < 0 ? null : xml.slice(open.index, end + name.length + 3)
}
