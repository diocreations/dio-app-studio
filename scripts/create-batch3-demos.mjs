// Creates the five batch-3 demo projects on the local dev server and records
// their tokens and owner cookies for the acceptance scripts.
import { access, mkdir, writeFile } from 'node:fs/promises'

const ORIGIN = process.env.PLATTR_ORIGIN || 'http://127.0.0.1:8795'

const PROJECTS = {
  trades: {
    name: 'Mercer & Okafor',
    vertical: 'trades',
    accent: '#a8741a',
    logo: 'MO',
    tagline: 'Turn up, fix it, clean up.',
    features: ['catalog', 'quote', 'booking', 'reviews', 'gallery', 'offers'],
  },
  auto: {
    name: 'Dock Road Motors',
    vertical: 'auto',
    accent: '#2a5a8f',
    logo: 'DRM',
    tagline: 'Fixed properly, explained plainly.',
    features: ['catalog', 'booking', 'quote', 'reviews', 'offers'],
  },
  ecommerce: {
    name: 'Fielding Goods',
    vertical: 'ecommerce',
    accent: '#b3391f',
    logo: 'FG',
    tagline: 'Small batches, shipped daily.',
    features: ['catalog', 'ordering', 'delivery', 'offers', 'reviews', 'loyalty'],
  },
  courses: {
    name: 'Goodwork Courses',
    vertical: 'courses',
    accent: '#3f4bd8',
    logo: 'GW',
    tagline: 'Learn it properly, at your own pace.',
    features: ['catalog', 'ordering', 'offers', 'reviews', 'loyalty'],
    // The public build route meters three builds per connection per day; QA
    // uses a distinct local attribution per demo rather than editing counters.
    ip: '10.0.0.5',
  },
  finance: {
    name: 'Marsh & Shah',
    vertical: 'finance',
    accent: '#145a4a',
    logo: 'MS',
    tagline: 'Plain numbers, no surprises.',
    features: ['catalog', 'quote', 'booking', 'reviews', 'offers'],
    ip: '10.0.0.6',
  },
}

await mkdir('.wrangler/qa-batch3', { recursive: true })
for (const [key, body] of Object.entries(PROJECTS)) {
  if (await access(`.wrangler/qa-batch3/${key}.json`).then(() => true, () => false)) {
    console.log(`${key} (exists)`)
    continue
  }
  const { ip, ...fields } = body
  const response = await fetch(`${ORIGIN}/api/projects`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: ORIGIN,
      ...(ip ? { 'cf-connecting-ip': ip } : {}),
    },
    body: JSON.stringify({ ...fields, platforms: ['pwa'], plan: 'onetime' }),
  })
  if (response.status !== 201) throw new Error(`${key}: ${response.status} ${await response.text()}`)
  const project = await response.json()
  const cookie = (response.headers.getSetCookie?.() ?? [])
    .map((entry) => entry.split(';')[0])
    .join('; ')
  await writeFile(`.wrangler/qa-batch3/${key}.json`, JSON.stringify({ ...project, cookie }, null, 2))
  console.log(`${key} ${project.token}`)
}
