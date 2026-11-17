import React from 'react'
import { createRoot } from 'react-dom/client'
import './theme.css'
import App from './App'
import { UIProvider } from './ui'
import { noter } from './api'

// Filet de sécurité : un écran qui plante n'emporte plus toute l'appli
class Filet extends React.Component {
  constructor(p) { super(p); this.state = { err: null } }
  static getDerivedStateFromError(err) { return { err } }
  componentDidCatch(err, info) { console.error(err); noter('ecran', String(err?.message || err), { pile: String(err?.stack || '').slice(0, 800), composant: String(info?.componentStack || '').slice(0, 400) }) }
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

// Les plantages hors écran (promesses oubliées, scripts) partent aussi au journal
addEventListener('error', e => { if (e.message) noter('appli', e.message, { fichier: e.filename, ligne: e.lineno }) })
addEventListener('unhandledrejection', e => { const r = e.reason; if (r?.code !== 'hors_ligne') noter('appli', String(r?.message || r).slice(0, 300), { pile: String(r?.stack || '').slice(0, 800) }) })

// v79 · Sur iPhone, le clavier fait glisser toute la page vers le haut et l'y laisse parfois : dès qu'on quitte un champ
// (ou que l'appli revient au premier plan), la page est remise en place pour que la barre du bas reste collée en bas.
const recaler = () => setTimeout(() => {
  const a = document.activeElement
  if (!a || !['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName)) { if (scrollX || scrollY) scrollTo(0, 0) }
}, 60)
addEventListener('focusout', recaler)
addEventListener('pageshow', recaler)
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') recaler() })
visualViewport?.addEventListener('resize', recaler)

createRoot(document.getElementById('root')).render(<UIProvider><Filet><App /></Filet></UIProvider>)
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
