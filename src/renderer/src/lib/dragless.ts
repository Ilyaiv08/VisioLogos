import { useEffect } from 'react'

let open = 0

export function holdDrag(): () => void {
  open++
  document.body.classList.add('is-popup')

  let released = false
  return () => {
    if (released) return
    released = true
    open = Math.max(0, open - 1)
    if (open === 0) document.body.classList.remove('is-popup')
  }
}

export function useHoldDrag(active: boolean): void {
  useEffect(() => {
    if (!active) return
    return holdDrag()
  }, [active])
}
