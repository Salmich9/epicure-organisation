import React from 'react'
import { createRoot } from 'react-dom/client'
import './theme.css'
import App from './App'
import { UIProvider } from './ui'

createRoot(document.getElementById('root')).render(<UIProvider><App /></UIProvider>)
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
