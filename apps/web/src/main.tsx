import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// No StrictMode: the simulated runtime is started in an effect and must run once.
createRoot(document.getElementById('root')!).render(<App />)
