/**
 * Render every route to its own static HTML file.
 *
 * `vite build` produces one index.html and leaves the rest to a server rewrite.
 * That is fine online and useless offline: a service worker asked for /stats has
 * nothing to serve unless /stats/index.html actually exists. So after the client
 * build, this does an SSR build of the same app and writes real HTML per route.
 *
 * The app renders its skeleton here — there is no IndexedDB at build time, so the
 * store reports "not ready" — which is exactly right: the static file carries the
 * nav, the headings and the layout, and the client fills in your data the moment
 * it boots.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const ssrDist = join(root, 'dist-ssr')

const PLACEHOLDER = '<!--app-html-->'

async function main() {
  const template = await readFile(join(dist, 'index.html'), 'utf8')
  if (!template.includes(PLACEHOLDER)) {
    throw new Error(
      `index.html is missing the ${PLACEHOLDER} marker, so there is nowhere to inject the rendered app.`,
    )
  }

  await build({
    root,
    logLevel: 'warn',
    build: {
      ssr: 'src/entry-server.tsx',
      outDir: 'dist-ssr',
      emptyOutDir: true,
      copyPublicDir: false,
    },
  })

  // The route list comes from the app itself, so adding a screen to the router
  // is all it takes for the build to emit its HTML.
  const { render, ROUTES } = await import(`file://${join(ssrDist, 'entry-server.js')}`)

  for (const route of ROUTES) {
    const html = template.replace(PLACEHOLDER, render(route))
    const target = route === '/' ? join(dist, 'index.html') : join(dist, route.slice(1), 'index.html')
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, html, 'utf8')
    console.log(`prerendered ${route} → ${target.replace(root, '.')}`)
  }

  await finaliseServiceWorker(ROUTES)

  // The SSR bundle is a build artefact, not something to deploy.
  await rm(ssrDist, { recursive: true, force: true })
}

/**
 * Stamp the cache version into the shipped service worker, and check its shell
 * list still covers every route.
 *
 * The version matters because the cache name is derived from it: without a new
 * name, a deploy leaves the old entries in place and `activate` has nothing to
 * clean up. The shell check matters because sw.js keeps its own copy of the
 * route list — it has to, it is plain JS served as-is — and a route added to the
 * router but not to the shell would silently stop working offline.
 */
async function finaliseServiceWorker(routes) {
  const swPath = join(dist, 'sw.js')
  const source = await readFile(swPath, 'utf8')

  const missing = routes.filter((route) => !source.includes(`'${route}'`))
  if (missing.length) {
    throw new Error(
      `public/sw.js does not precache ${missing.join(', ')} — add them to SHELL or they will not work offline.`,
    )
  }

  const version = `v${Date.now().toString(36)}`
  const stamped = source.replace(/const VERSION = '[^']*'/, `const VERSION = '${version}'`)
  if (stamped === source) {
    throw new Error('Could not find the VERSION constant in public/sw.js to stamp.')
  }

  await writeFile(swPath, stamped, 'utf8')
  console.log(`service worker cache version ${version}`)
}

await main()
