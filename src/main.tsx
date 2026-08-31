import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { App } from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { hydrate } from './lib/store'
import { registerServiceWorker } from './sw-register'
import './index.css'

const container = document.getElementById('root')!

/**
 * Read IndexedDB *before* the first render.
 *
 * The alternative — render, then fill in — makes every screen flash an empty
 * state on load. The read is a few milliseconds against a local database, so
 * waiting for it is cheaper than the flicker.
 */
async function start() {
  try {
    await hydrate()
  } catch (error) {
    // A blocked or corrupt IndexedDB must not leave a blank page: the app still
    // renders, just empty, and Settings can still export or reset.
    console.error('Could not open the local database', error)
  }

  // Deliberately createRoot rather than hydrateRoot. The prerendered HTML is the
  // *empty* shell — it was built with no database — while this first client
  // render already has your habits in hand. Those two trees do not match, and
  // pretending otherwise is what produces hydration errors. So the static HTML
  // does its job (instant paint, offline-ready) and React then replaces it.
  createRoot(container).render(
    <StrictMode>
      <ErrorBoundary where="OpenHabits">
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ErrorBoundary>
    </StrictMode>,
  )

  registerServiceWorker()
}

void start()
