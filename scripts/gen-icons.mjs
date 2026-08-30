/**
 * Render the PWA icons from public/icon.svg.
 *
 * Run with `npm run icons` when the source SVG changes; the PNGs are committed,
 * so a normal build and a normal clone never need sharp at all.
 *
 * The maskable icon gets its own render at 80% scale on a solid ground: Android
 * crops maskable icons to a circle, and artwork drawn to the edges loses its
 * corners.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = join(root, 'public')
const source = await readFile(join(publicDir, 'icon.svg'))

await mkdir(publicDir, { recursive: true })

for (const size of [180, 192, 512]) {
  const name = size === 180 ? 'icon-180.png' : `icon-${size}.png`
  await writeFile(join(publicDir, name), await sharp(source).resize(size, size).png().toBuffer())
  console.log(`wrote public/${name}`)
}

const size = 512
const inner = Math.round(size * 0.8)
const pad = Math.round((size - inner) / 2)
const maskable = await sharp({
  create: { width: size, height: size, channels: 4, background: '#5b53d6' },
})
  .composite([{ input: await sharp(source).resize(inner, inner).png().toBuffer(), top: pad, left: pad }])
  .png()
  .toBuffer()
await writeFile(join(publicDir, 'icon-maskable-512.png'), maskable)
console.log('wrote public/icon-maskable-512.png')
