// Builds the batch-3 flagship photo library at 320/640/1280 (4:3 WebP).
//
// Sources are the generated scene files (temporary URLs) and royalty-free
// Unsplash photographs, plus a few existing library scenes that genuinely match
// the new trade (professional meeting portraits, shop product photography).
// Run once; the committed .webp files are what the Worker serves.
import { access, mkdir, readFile } from 'node:fs/promises'
import sharp from 'sharp'

const GENERATED = 'https://www.codebuff.com/api/v1/generate-image'
const LOCAL = 'public/images/flagship'
const OUT = 'public/images/flagship'

/** Each entry: output scene name -> a generated URL or a local library scene. */
const SCENES = {
  'trades-van': { generated: '523c2a8a-1550-466d-ae0c-1e115650822d' },
  'trades-boiler': { generated: '451bfb7d-35e3-4673-a119-2b28df5c8c1e' },
  'trades-tools': { generated: '13bd2d66-fb61-4b32-b489-1bcc3d74a3b3' },
  'trades-engineer': { generated: '6f92cbbf-2c10-455b-898c-c21dcd3f98a0' },
  'trades-engineer2': { generated: '841fb7dc-b6d3-4a5a-bf04-386dd905cec8' },
  'trades-bathroom': { generated: '6f50accc-2f3c-45bd-958e-861c0eabc174' },

  'auto-bay': { generated: '2e2cd91b-5c80-466e-ad2b-835ab18d0fdd' },
  'auto-lift': { generated: '28321b59-b81d-419e-97c5-051aeeafb1d8' },
  'auto-diagnostics': { generated: '11fc7e63-cb5d-4eb1-862d-ef0fb7ea062f' },
  'auto-technician': { generated: '24c73b10-e738-4714-a38a-26bfc42e3a9c' },
  'auto-tools': { local: 'trades-tools' },

  'ecom-tote': { unsplash: '1591561954557-26941169b49e' },
  'ecom-ceramics': { local: 'shop-ceramics' },
  'ecom-pillow': { unsplash: '1584100936595-c0654b55a2e2' },
  'ecom-linen': { local: 'shop-stool' },
  'ecom-warehouse': { unsplash: '1587293852726-70cdb56c2866' },
  'ecom-sale': { unsplash: '1607083206968-13611e3d76db' },

  'courses-workshop': { unsplash: '1522202176988-66273c2fd55f' },
  'courses-notes': { unsplash: '1434030216411-0b793f4b4173' },
  'courses-online': { unsplash: '1516321318423-f06f85e504b3' },
  'courses-review': { unsplash: '1454165804606-c3d57bc86b40' },
  'courses-guide': { local: 'pro-desk' },

  'finance-meeting': { local: 'pro-meeting' },
  'finance-desk': { unsplash: '1554224155-6726b3ff858f' },
  'finance-adviser': { local: 'pro-adviser' },
  'finance-adviser2': { local: 'pro-portrait' },
  'finance-office': { local: 'pro-office' },
  'finance-consult': { local: 'pro-team' },
}

const WIDTHS = [
  { width: 320, quality: 68 },
  { width: 640, quality: 70 },
  { width: 1280, quality: 72 },
]

async function fetchWithRetry(url, attempts = 6) {
  let last = ''
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetch(url)
    if (response.ok) return Buffer.from(await response.arrayBuffer())
    last = `HTTP ${response.status}`
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)))
  }
  throw new Error(`${url}: ${last}`)
}

async function source(scene) {
  if (scene.generated) return fetchWithRetry(`${GENERATED}/${scene.generated}.jpg`)
  if (scene.unsplash) {
    const url = `https://images.unsplash.com/photo-${scene.unsplash}?w=1600&h=1200&fit=crop&crop=entropy&q=82&fm=jpg`
    return fetch(url).then(async (response) => {
      if (!response.ok) throw new Error(`unsplash ${scene.unsplash}: ${response.status}`)
      return Buffer.from(await response.arrayBuffer())
    })
  }
  return readFile(`${LOCAL}/${scene.local}-1280.webp`)
}

await mkdir(OUT, { recursive: true })
for (const [name, scene] of Object.entries(SCENES)) {
  const done = await Promise.all(
    WIDTHS.map(({ width }) => access(`${OUT}/${name}-${width}.webp`).then(() => true, () => false)),
  )
  if (done.every(Boolean)) {
    console.log(`${name} (exists)`)
    continue
  }
  const bytes = await source(scene)
  for (const { width, quality } of WIDTHS) {
    const height = Math.round((width * 3) / 4)
    await sharp(bytes)
      .resize(width, height, { fit: 'cover', position: 'centre' })
      .webp({ quality })
      .toFile(`${OUT}/${name}-${width}.webp`)
  }
  console.log(name)
}
