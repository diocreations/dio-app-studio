import { PHOTO_KEYWORDS } from './themes'
import type { VerticalId } from './types'
import { stockPhotos } from './flagshipImages'

export type PhotoSet = { wide: string[]; thumb: string[] }

const cache = new Map<string, { at: number; set: PhotoSet }>()
const TTL = 6 * 60 * 60 * 1000
const EMPTY: PhotoSet = { wide: [], thumb: [] }

/**
 * The five flagship trades ship a curated local library. It is the default so
 * an app always has real photography, even with no stock API key configured;
 * Pexels remains the wider pool when the owner supplies a key.
 */
function localPhotos(vertical: VerticalId): PhotoSet {
  const photos = stockPhotos(vertical)
  if (!photos.length) return EMPTY
  return {
    wide: photos.map((photo) => `/images/flagship/${photo.name}-1280.webp`),
    thumb: photos.map((photo) => `/images/flagship/${photo.name}-640.webp`),
  }
}

/** A Pexels key widens the pool; it is optional because flagship trades have
 *  their own local library. */
function stockKey(env?: { PEXELS_API_KEY?: string }): string {
  // A Worker binding wins; the local dev server only has process.env.
  if (env?.PEXELS_API_KEY) return env.PEXELS_API_KEY
  const local = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
  return local?.PEXELS_API_KEY ?? ''
}

function unique(values: string[]): string[] {
  return [...new Set(values)].filter((value) => value.startsWith('https://')).slice(0, 16)
}

export async function photosFor(
  vertical: VerticalId,
  env?: { PEXELS_API_KEY?: string },
): Promise<PhotoSet> {
  const key = stockKey(env)
  const keyword = PHOTO_KEYWORDS[vertical]
  const local = localPhotos(vertical)
  if (!key || !keyword) return local

  const hit = cache.get(keyword)
  if (hit && Date.now() - hit.at < TTL) return hit.set

  try {
    const response = await Promise.race([
      fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(keyword)}&per_page=20&orientation=landscape`,
        { headers: { Authorization: key } },
      ),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000)),
    ])
    if (!response.ok) throw new Error(`pexels ${response.status}`)
    const body = (await response.json()) as {
      photos?: { src?: { large2x?: string; large?: string; medium?: string } }[]
    }
    const wide = unique((body.photos ?? []).map((photo) => photo.src?.large2x ?? photo.src?.large ?? ''))
    const thumb = unique((body.photos ?? []).map((photo) => photo.src?.medium ?? ''))
    if (!wide.length || !thumb.length) throw new Error('no images')
    const set = { wide, thumb }
    cache.set(keyword, { at: Date.now(), set })
    return set
  } catch {
    return hit?.set ?? local
  }
}
