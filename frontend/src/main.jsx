import React from 'react'
import { createRoot } from 'react-dom/client'
import { SessionProvider } from './lib/session'
import App from './App'
import './style.css'
import './app.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SessionProvider>
      <App />
    </SessionProvider>
  </React.StrictMode>
)
