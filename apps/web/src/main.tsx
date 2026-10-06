import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// No StrictMode: it would mount the Pixi scene and the event source twice in dev.
createRoot(document.getElementById('root')!).render(<App />)
