import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import type { PluginOption } from 'vite'
import { defineConfig } from 'vitest/config'

const dist = fileURLToPath(new URL('./dist', import.meta.url))

/**
 * Serve the prerendered per-route HTML during `vite preview`.
 *
 * Preview defaults to an SPA fallback: every unknown path gets index.html. That
 * quietly hides whether prerendering worked — /stats would look fine while
 * actually being served Today's HTML — and it does not match how a static host
 * behaves, which is to serve /stats/index.html. This middleware runs ahead of the
 * fallback and prefers the real file, so what you test is what you deploy.
 *
 * Preview only: the dev server has no dist/ and needs the SPA fallback for
 * client-side routing.
 */
function servePrerendered(): PluginOption {
  return {
    name: 'openhabits:serve-prerendered',
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        const path = (req.url ?? '/').split('?')[0].replace(/\/$/, '')
        if (path && !path.includes('.') && existsSync(join(dist, path, 'index.html'))) {
          req.url = `${path}/index.html`
        }
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    servePrerendered(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // Node by default — the logic suites need no DOM and start instantly. Files
    // that do need one opt in with a `@vitest-environment jsdom` comment.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test-setup.ts'],
  },
})
