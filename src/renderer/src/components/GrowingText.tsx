import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'

const ROOM_LINES = 2

const OPEN_LINES = 6

const CEILING_SHARE = 0.45
const CEILING_LEAST = 240

type Props = React.TextareaHTMLAttributes<HTMLTextAreaElement>

export function GrowingText({ onFocus, onBlur, ...rest }: Props): React.JSX.Element {
  const ref = useRef<HTMLTextAreaElement>(null)
  const working = useRef(false)

  const fit = useCallback(() => {
    const el = ref.current
    if (!el) return

    el.style.height = 'auto'

    const line = Number.parseFloat(getComputedStyle(el).lineHeight) || 20

    const frame = el.offsetHeight - el.clientHeight
    const ceiling = Math.max(CEILING_LEAST, window.innerHeight * CEILING_SHARE)

    const wanted = el.scrollHeight + frame + (working.current ? line * ROOM_LINES : 0)
    const floor = working.current ? line * OPEN_LINES : 0

    el.style.height = `${Math.min(Math.max(wanted, floor), ceiling)}px`
  }, [])

  useLayoutEffect(fit, [fit, rest.value])

  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return

    let width = el.clientWidth
    const eye = new ResizeObserver(() => {
      if (el.clientWidth === width) return
      width = el.clientWidth
      fit()
    })
    eye.observe(el)
    return () => eye.disconnect()
  }, [fit])

  return (
    <textarea
      {...rest}
      ref={ref}
      onFocus={(e) => {
        working.current = true
        fit()
        onFocus?.(e)
      }}
      onBlur={(e) => {
        working.current = false
        fit()
        onBlur?.(e)
      }}
    />
  )
}
