import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { startGameSounds } from './audio/gameSounds'
import { useGameStore } from './state/gameStore'

startGameSounds({ store: useGameStore })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
