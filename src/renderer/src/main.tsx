import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { preloadSlideFonts } from './lib/slideFonts'
import './styles.css'

preloadSlideFonts()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
