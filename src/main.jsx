import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { applyLegacyRedirect } from './lib/routes'
import './styles/index.css'

// Link lama (?view=kasir, /data-saya, /live-counter, ...) diarahkan ke rute baru sebelum render.
applyLegacyRedirect()

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
)
