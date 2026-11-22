// Remove build metadata and source maps from the public deployment output, then
// stage a hosting-sized asset tree. WebP does not recompress, so the hosting
// budget is met by keeping every mobile/tablet photo and the 1280px hero only
// for the four launch trades (retail, restaurants, salons, professional).
import { cpSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

function clean(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.name.startsWith('.') || entry.name.endsWith('.map'))
      rmSync(path, { recursive: true, force: true })
    else if (entry.isDirectory()) clean(path)
  }
}

clean(new URL('../dist', import.meta.url).pathname)

const root = new URL('../dist', import.meta.url).pathname
const source = join(root, 'client')
const staged = join(root, 'client-deploy')
const wideTrades = new Set(['restaurant', 'shop', 'salon', 'professional'])
const photo = /^(?<name>.+)-(?<width>320|640|1280)\.webp$/

rmSync(staged, { recursive: true, force: true })
mkdirSync(staged, { recursive: true })
cpSync(source, staged, {
  recursive: true,
  filter(path) {
    if (!path.includes('/images/flagship/')) return true
    const match = photo.exec(path.split('/').pop() ?? '')
    if (!match?.groups) return false
    if (match.groups.width !== '1280') return true
    return wideTrades.has(match.groups.name.split('-')[0])
  },
})

function bytes(dir) {
  return readdirSync(dir, { withFileTypes: true }).reduce((total, entry) => {
    const path = join(dir, entry.name)
    return total + (entry.isDirectory() ? bytes(path) : statSync(path).size)
  }, 0)
}

const size = bytes(staged)
const limit = 10 * 1024 * 1024
if (size > limit) throw new Error(`Deploy assets are ${(size / 1048576).toFixed(1)} MiB; hosting limit is 10 MiB`)
console.log(`Deploy assets: ${(size / 1048576).toFixed(1)} MiB`)
