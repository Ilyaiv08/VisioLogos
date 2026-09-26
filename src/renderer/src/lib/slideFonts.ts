import { useEffect, useState } from 'react'

const SAMPLE = 'АаЯяЁё Aa 0123'

const BUNDLED = [
  "400 64px 'Onest Variable'",
  "700 64px 'Onest Variable'",
  "400 64px 'Inter Variable'",
  "700 64px 'Inter Variable'",
  "400 64px 'Literata Variable'",
  "700 64px 'Literata Variable'",
  "italic 400 64px 'Literata Variable'",
  "400 64px 'PT Serif'",
  "700 64px 'PT Serif'"
]

export function preloadSlideFonts(): void {
  if (typeof document === 'undefined' || !document.fonts) return
  for (const face of BUNDLED) void document.fonts.load(face, SAMPLE).catch(() => undefined)
}

export function askFont(family: string, bold: boolean): void {
  if (typeof document === 'undefined' || !document.fonts) return
  void document.fonts.load(`${bold ? 700 : 400} 64px ${family}`, SAMPLE).catch(() => undefined)
}

export function onFontsLoaded(listen: () => void): () => void {
  if (typeof document === 'undefined' || !document.fonts) return () => undefined
  document.fonts.addEventListener('loadingdone', listen)
  return () => document.fonts.removeEventListener('loadingdone', listen)
}

export const pixelRatio = (): number =>
  typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1

export function useDevicePixelRatio(): number {
  const [ratio, setRatio] = useState(pixelRatio)

  useEffect(() => {
    let query: MediaQueryList | null = null

    const update = (): void => {
      setRatio(pixelRatio())
      watch()
    }

    const watch = (): void => {
      query?.removeEventListener('change', update)
      query = window.matchMedia(`(resolution: ${pixelRatio()}dppx)`)
      query.addEventListener('change', update)
    }

    watch()
    return () => query?.removeEventListener('change', update)
  }, [])

  return ratio
}

export function useFontTick(): number {
  const [tick, setTick] = useState(0)
  useEffect(() => onFontsLoaded(() => setTick((n) => n + 1)), [])
  return tick
}
