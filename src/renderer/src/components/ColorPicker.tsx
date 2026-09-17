import { useEffect, useRef, useState } from 'react'
import { useT } from '../state/i18n'

interface Props {
  value: string
  onChange: (hex: string) => void

  onPickForBackground?: () => void

  presets?: string[]

  autoOn?: boolean
}

const TEXT_PRESETS = [
  '#ffffff', '#f2e9d8', '#ffe9b0', '#ffd9a8',
  '#dff0ff', '#cfe3ff', '#e6d9ff', '#ffd9e4',
  '#d9ffe4', '#e9ffcf', '#b9c4d6', '#111111'
]

export function ColorPicker({
  value,
  onChange,
  onPickForBackground,
  presets = TEXT_PRESETS,
  autoOn = false
}: Props): React.JSX.Element {
  const t = useT()
  const [hsv, setHsv] = useState(() => hexToHsv(value))
  const [text, setText] = useState(value)
  const areaRef = useRef<HTMLDivElement>(null)
  const dragging = useRef<'area' | 'hue' | null>(null)

  useEffect(() => {
    if (value.toLowerCase() === hsvToHex(hsv).toLowerCase()) return
    setHsv(hexToHsv(value))
    setText(value)

  }, [value])

  const apply = (next: Hsv): void => {
    setHsv(next)
    const hex = hsvToHex(next)
    setText(hex)
    onChange(hex)
  }

  const fromArea = (e: { clientX: number; clientY: number }): void => {
    const box = areaRef.current?.getBoundingClientRect()
    if (!box) return
    apply({
      h: hsv.h,
      s: clamp01((e.clientX - box.left) / box.width),
      v: 1 - clamp01((e.clientY - box.top) / box.height)
    })
  }

  useEffect(() => {
    if (!dragging.current) return
    const move = (e: MouseEvent): void => {
      if (dragging.current === 'area') fromArea(e)
    }
    const up = (): void => {
      dragging.current = null
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  })

  return (
    <div className="picker">
      <div
        ref={areaRef}
        className="picker__area"
        style={{ '--hue': hsvToHex({ h: hsv.h, s: 1, v: 1 }) } as React.CSSProperties}
        onMouseDown={(e) => {
          e.preventDefault()
          dragging.current = 'area'
          fromArea(e)
        }}
      >
        <span
          className="picker__dot"
          style={{
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`,
            background: hsvToHex(hsv)
          }}
        />
      </div>

      <input
        className="picker__hue"
        type="range"
        min={0}
        max={359}
        value={Math.round(hsv.h)}
        onChange={(e) => apply({ ...hsv, h: Number(e.target.value) })}
        title={t('control.hue')}
      />

      <div className="picker__row">
        <span className="picker__preview" style={{ background: hsvToHex(hsv) }} />
        <input
          className="picker__hex"
          value={text}
          spellCheck={false}
          onChange={(e) => {
            const v = e.target.value
            setText(v)
            if (/^#[0-9a-f]{6}$/i.test(v)) {
              setHsv(hexToHsv(v))
              onChange(v)
            }
          }}
          onBlur={() => setText(hsvToHex(hsv))}
        />
        {onPickForBackground && (
          <button
            className={`picker__auto ${autoOn ? 'is-on' : ''}`}
            onClick={onPickForBackground}
            title={t('control.toBgHint')}
          >
            {t('control.toBg')}
          </button>
        )}
      </div>

      <div
        className="picker__presets"
        style={
          { '--preset-cols': presets.length % 8 === 0 ? 8 : 6 } as React.CSSProperties
        }
      >
        {presets.map((c) => (
          <button
            key={c}
            className={`swatch ${c.toLowerCase() === value.toLowerCase() ? 'is-active' : ''}`}
            style={{ background: c }}
            title={c}
            onClick={() => {
              setHsv(hexToHsv(c))
              setText(c)
              onChange(c)
            }}
          />
        ))}
      </div>
    </div>
  )
}

interface Hsv {
  h: number
  s: number
  v: number
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n))

function hexToHsv(hex: string): Hsv {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return { h: 0, s: 0, v: 1 }
  const n = parseInt(m[1], 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min

  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
    else if (max === g) h = ((b - r) / d + 2) * 60
    else h = ((r - g) / d + 4) * 60
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

function hsvToHex({ h, s, v }: Hsv): string {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  const seg = Math.floor(h / 60) % 6
  const [r, g, b] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x]
  ][seg]

  const to = (n: number): string =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}
