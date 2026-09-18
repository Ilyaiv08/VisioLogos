import { useEffect, useState } from 'react'

export const NOTICE_MS = 4500
export const NOTICE_TROUBLE_MS = 9000

const FADE_MS = 280

export function useAutoHide(
  shown: unknown,
  hide: () => void,
  ms: number = NOTICE_MS
): boolean {
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (shown === null || shown === undefined) {
      setLeaving(false)
      return
    }

    setLeaving(false)
    const fade = setTimeout(() => setLeaving(true), Math.max(0, ms - FADE_MS))
    const gone = setTimeout(hide, ms)

    return () => {
      clearTimeout(fade)
      clearTimeout(gone)
    }
  }, [shown, hide, ms])

  return leaving
}
