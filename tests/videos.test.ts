import { describe, expect, test } from 'bun:test'
import { renderApp } from '../src/worker/app'
import { buildSpec } from '../src/worker/pricing'
import type { VideoLink } from '../src/worker/types'

function film(videos?: VideoLink[]) {
  return buildSpec({
    name: 'Salt & Ash',
    vertical: 'film',
    accent: '#b8862b',
    logo: 'SA',
    features: ['catalog', 'booking', 'gallery'],
    videos,
  })
}

describe('trailer links on a film build', () => {
  test("the project's own links are used, not the demo set", () => {
    const html = renderApp(film([{ label: 'Official trailer', url: 'https://vimeo.com/76979871' }]), {
      token: 'video-check',
    })
    expect(html).toContain('href="https://vimeo.com/76979871"')
    expect(html).not.toContain('youtube.com/results')
  })

  test('only http and https links survive', () => {
    const spec = film([
      { label: 'Trailer', url: 'https://vimeo.com/1' },
      { label: 'Script', url: 'javascript:alert(1)' },
      { label: 'Mail', url: 'mailto:hello@example.com' },
      { label: 'Data', url: 'data:text/html,hi' },
    ])
    expect(spec.videos).toEqual([{ label: 'Trailer', url: 'https://vimeo.com/1' }])
  })

  test('a link with no label falls back to "Watch"', () => {
    const spec = film([{ label: '   ', url: 'https://vimeo.com/2' }])
    expect(spec.videos).toEqual([{ label: 'Watch', url: 'https://vimeo.com/2' }])
    expect(renderApp(spec, { token: 'video-check' })).toContain('>Watch<')
  })

  test('a project with no links shows no Watch section at all', () => {
    const spec = film()
    expect(spec.videos).toBeUndefined()
    expect(renderApp(spec, { token: 'video-check' })).not.toContain('class="label">Watch<')
  })
})
