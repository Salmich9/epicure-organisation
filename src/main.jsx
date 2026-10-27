import React from 'react'
import { createRoot } from 'react-dom/client'
import './theme.css'
import App from './App'
import { UIProvider } from './ui'

// Filet de sécurité : un écran qui plante n'emporte plus toute l'appli
class Filet extends React.Component {
  constructor(p) { super(p); this.state = { err: null } }
  static getDerivedStateFromError(err) { return { err } }
  componentDidCatch(err) { console.error(err) }
  render() {
    if (!this.state.err) return this.props.children
    return (
      <div className="empty" style={{ paddingTop: 120, textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--display)', fontSize: 28, color: 'var(--ink)' }}>Cet écran a un souci</div>
        <p style={{ marginTop: 8 }}>Le reste de l'appli va bien.</p>
        <button className="btn primary" style={{ marginTop: 18 }} onClick={() => { this.setState({ err: null }); location.hash = '#/accueil' }}>Retour à l'accueil</button>
      </div>
    )
  }
}

createRoot(document.getElementById('root')).render(<UIProvider><Filet><App /></Filet></UIProvider>)
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
