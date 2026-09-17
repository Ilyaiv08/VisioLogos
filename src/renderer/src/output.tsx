import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { LiveState, OutputRole } from '@shared/types'
import { SlideView } from './components/SlideView'
import { StageView } from './components/StageView'
import './styles.css'

const params = new URLSearchParams(location.search)

document.body.classList.toggle('is-windowed', params.get('windowed') === 'true')

const WAIT_IMAGE_MS = 250

function useReadyLive(): LiveState | null {
  const [live, setLive] = useState<LiveState | null>(null)

  useEffect(() => {
    let alive = true
    let turn = 0
    let shown: string | null = null

    const take = async (next: LiveState): Promise<void> => {
      const my = ++turn
      const src = next.slide?.background.kind === 'image' ? next.slide.background.src : null

      if (src && src !== shown) {
        await ready(src)

        if (!alive || my !== turn) return
      }

      shown = src
      setLive(next)
    }

    void window.api.live.get().then(take)
    const off = window.api.live.onUpdate((state) => void take(state))
    return () => {
      alive = false
      off()
    }
  }, [])

  return live
}

function ready(src: string): Promise<void> {
  return new Promise((done) => {
    const timer = setTimeout(done, WAIT_IMAGE_MS)
    const end = (): void => {
      clearTimeout(timer)
      done()
    }

    const img = new Image()
    img.src = src

    img.decode().then(end, end)
  })
}

function Output(): React.JSX.Element {
  const live = useReadyLive()
  const role = (params.get('role') ?? 'hall') as OutputRole

  useRemoteKeys()

  if (role === 'stage') {
    return (
      <div className="output output--stage">
        <StageView live={live} />
      </div>
    )
  }

  return (
    <div className="output">
      <SlideView
        slide={live?.slide ?? null}
        lowerThird={live?.lowerThird ?? null}
        karaoke={live?.karaoke ?? null}
        karaokeWord={live?.karaokeWord ?? null}
        karaokeLook={live?.karaokeLook ?? null}
        blackout={live?.blackout ?? false}
        hideText={live?.hideText ?? false}
        className="slide--full"
      />
    </div>
  )
}

const REMOTE_KEYS = ['PageDown', 'PageUp', 'Period', 'NumpadDecimal']

function useRemoteKeys(): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (!REMOTE_KEYS.includes(e.code)) return
      e.preventDefault()
      window.api.remote.press(e.code)
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Output />
  </StrictMode>
)
