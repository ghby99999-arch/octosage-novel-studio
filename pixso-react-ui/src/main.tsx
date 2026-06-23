import './assets/styles/global.css'
import { createRoot } from 'react-dom/client'
import './index.css'
import './assets/styles/font.css'
import './pixso-bridge'
import App from './App'

createRoot(document.getElementById('root')!).render(
    <App />
)
