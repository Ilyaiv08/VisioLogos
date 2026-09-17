/// <reference types="vite/client" />

import type { Api } from '../../preload'

interface WindowControlsOverlay extends EventTarget {
  readonly visible: boolean
  getTitlebarAreaRect(): DOMRect
}

declare global {
  interface Window {
    api: Api
  }

  interface Navigator {
    readonly windowControlsOverlay?: WindowControlsOverlay
  }
}

export {}
