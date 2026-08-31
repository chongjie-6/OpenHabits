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
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
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
 * route list — it has to, it is plain JS served as-is — and the two can drift in
 * both directions. A route added to the router but missing from the shell stops
 * working offline. A route deleted from the router but left in the shell is
 * worse, because it is silent: `cache.add` rejects on every single install and
 * `Promise.allSettled` swallows it, so nothing ever says so. Both are errors here.
 */
async function finaliseServiceWorker(routes) {
  const swPath = join(dist, 'sw.js')
  const source = await readFile(swPath, 'utf8')

  const shell = readShell(source)

  const missing = routes.filter((route) => !shell.includes(route))
  if (missing.length) {
    throw new Error(
      `public/sw.js does not precache ${missing.join(', ')} — add them to SHELL or they will not work offline.`,
    )
  }

  // Only route-shaped entries are compared: SHELL also lists the manifest, the
  // icon and anything else the shell references, none of which are routes.
  const stale = shell.filter((entry) => !entry.includes('.') && !routes.includes(entry))
  if (stale.length) {
    throw new Error(
      `public/sw.js precaches ${stale.join(', ')}, which the router no longer serves — remove them from SHELL. Every install would fail to cache them, silently.`,
    )
  }

  const version = `v${Date.now().toString(36)}`
  let stamped = source.replace(/const VERSION = '[^']*'/, `const VERSION = '${version}'`)
  if (stamped === source) {
    throw new Error('Could not find the VERSION constant in public/sw.js to stamp.')
  }

  // The bundle's filenames are hash-suffixed and change every build, so the
  // worker cannot name them itself — it gets told, here, what to precache.
  const assets = await readdir(join(dist, 'assets'))
  const list = assets.map((file) => `'/assets/${file}'`).join(', ')
  const withAssets = stamped.replace('const ASSETS = []', `const ASSETS = [${list}]`)
  if (withAssets === stamped) {
    throw new Error('Could not find the ASSETS placeholder in public/sw.js to stamp.')
  }
  stamped = withAssets

  await writeFile(swPath, stamped, 'utf8')
  console.log(`service worker cache version ${version}, ${assets.length} assets precached`)
}

/** The string entries of the SHELL array in sw.js, in source order. */
function readShell(source) {
  const open = source.indexOf('const SHELL = [')
  const close = open === -1 ? -1 : source.indexOf(']', open)
  if (close === -1) throw new Error('Could not find the SHELL array in public/sw.js to check.')
  const body = source.slice(open, close)
  return [...body.matchAll(/'([^']+)'/g)].map((match) => match[1])
}

await main()
