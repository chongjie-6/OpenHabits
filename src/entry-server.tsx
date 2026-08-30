import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { App } from './App'
import './index.css'

// Re-exported so scripts/prerender.mjs reads the route list from the app itself
// rather than keeping its own copy that could drift out of step.
export { ROUTES } from './route-list'

/**
 * Build-time rendering of the app shell.
 *
 * There is no IndexedDB here, so the store reports "not ready" and every screen
 * renders its skeleton — which is exactly what belongs in a static file. The
 * result is real HTML per route: nav, headings and layout paint immediately,
 * offline, before a single byte of JavaScript runs.
 */
export function render(url: string): string {
  return renderToString(
    <StrictMode>
      <StaticRouter location={url}>
        <App />
      </StaticRouter>
    </StrictMode>,
  )
}
