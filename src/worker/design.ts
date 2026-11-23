/**
 * Reading a site's design language and its PWA metadata.
 *
 * We do not copy markup or assets — theirs are copyrighted and a rebuilt app
 * has to work offline. What makes a generated app feel like *their* app is the
 * palette, the typeface, the corner language and light/dark, so that is what we
 * measure: custom properties and body rules from their stylesheets, the first
 * real font family, the most common corner radius, and the manifest they hand a
 * browser that installs them.
 */

export type DesignKit = {
  bg: string
  surface: string
  surface2: string
  ink: string
  muted: string
  radius: number
  /** CSS font stack, family first, with a system fallback that survives offline. */
  display: string
  /** The family name, for the brief: "Inter". */
  fontLabel: string
  dark: boolean
  /** True only when bg/ink/surface really came from the site. When the site
   *  declared no colours we keep the trade theme and say so. */
  palette: boolean
  /** Where the values came from, in one line. */
  basis: string
}

export type PwaInfo = {
  manifest: string
  name: string
  display: string
  themeColor: string
  backgroundColor: string
  icon: string
  /** The site registers a service worker of its own. */
  serviceWorker: boolean
}

/* ------------------------------------------------------------------ */
/* Colour maths                                                        */
/* ------------------------------------------------------------------ */

export function hexOf(raw: string): string {
  const value = raw.trim().toLowerCase()
  const short = /^#([0-9a-f]{3})$/.exec(value)
  if (short)
    return `#${short[1]
      .split('')
      .map((part) => part + part)
      .join('')}`
  const long = /^#([0-9a-f]{6})$/.exec(value)
  if (long) return `#${long[1]}`
  const rgb = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/i.exec(value)
  if (rgb)
    return `#${rgb
      .slice(1)
      .map((part) => Math.min(255, Number(part)).toString(16).padStart(2, '0'))
      .join('')}`
  return ''
}

function channels(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

function channelLuminance(value: number): number {
  const channel = value / 255
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map(channelLuminance)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast, 1–21. */
export function contrast(a: string, b: string): number {
  const one = luminance(a)
  const two = luminance(b)
  return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05)
}

/** Blend two hexes; amount is how much of `to`. */
export function mix(from: string, to: string, amount: number): string {
  const a = channels(from)
  const b = channels(to)
  const out = a.map((value, index) => Math.round(value + (b[index] - value) * amount))
  return `#${out.map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

/* ------------------------------------------------------------------ */
/* Typefaces                                                           */
/* ------------------------------------------------------------------ */

const SANS = 'ui-sans-serif, system-ui, "Helvetica Neue", Arial, sans-serif'
const SERIF = 'ui-serif, "Iowan Old Style", Georgia, serif'

/** Families we know, quoted so they apply when present and fall back cleanly. */
const KNOWN: Record<string, { stack: string; serif?: boolean }> = {
  inter: { stack: `"Inter", ${SANS}` },
  poppins: { stack: `"Poppins", ${SANS}` },
  'dm sans': { stack: `"DM Sans", ${SANS}` },
  'space grotesk': { stack: `"Space Grotesk", ${SANS}` },
  manrope: { stack: `"Manrope", ${SANS}` },
  'plus jakarta sans': { stack: `"Plus Jakarta Sans", ${SANS}` },
  'work sans': { stack: `"Work Sans", ${SANS}` },
  figtree: { stack: `"Figtree", ${SANS}` },
  outfit: { stack: `"Outfit", ${SANS}` },
  montserrat: { stack: `"Montserrat", ${SANS}` },
  lato: { stack: `"Lato", ${SANS}` },
  rubik: { stack: `"Rubik", ${SANS}` },
  nunito: { stack: `"Nunito", ${SANS}` },
  sora: { stack: `"Sora", ${SANS}` },
  'playfair display': { stack: `"Playfair Display", ${SERIF}`, serif: true },
  playfair: { stack: `"Playfair Display", ${SERIF}`, serif: true },
  lora: { stack: `"Lora", ${SERIF}`, serif: true },
  'libre baskerville': { stack: `"Libre Baskerville", ${SERIF}`, serif: true },
  'cormorant garamond': { stack: `"Cormorant Garamond", ${SERIF}`, serif: true },
  'dm serif display': { stack: `"DM Serif Display", ${SERIF}`, serif: true },
  fraunces: { stack: `"Fraunces", ${SERIF}`, serif: true },
  'instrument serif': { stack: `"Instrument Serif", ${SERIF}`, serif: true },
  'eb garamond': { stack: `"EB Garamond", ${SERIF}`, serif: true },
}

const GENERIC =
  /^(?:inherit|initial|unset|revert|sans-serif|serif|monospace|cursive|fantasy|system-ui|-apple-system|ui-[a-z-]+)$/i

/** Icon and emoji faces are declared like text faces but are not type. */
const ICON_FONT =
  /glyphicon|font ?awesome|material (?:icons|symbols)|ionicons|feather|bootstrap-icons|icomoon|iconfont|emoji|symbols|themify/i

function stackFor(family: string): { display: string; label: string } | undefined {
  const label = family.replace(/["']/g, '').trim()
  if (!label || label.length > 40 || !/^[\w\s.&'-]+$/.test(label)) return undefined
  if (ICON_FONT.test(label)) return undefined
  const known = KNOWN[label.toLowerCase()]
  if (known) return { display: known.stack, label }
  // System faces already work anywhere: use them as they are, with a fallback
  // of the matching kind so a missing face does not change the mood.
  if (/^(?:helvetica|arial|futura|avenir|verdana|tahoma|trebuchet|segoe|roboto|sf pro)/i.test(label))
    return { display: `"${label}", ${SANS}`, label }
  if (/^(?:georgia|times|palatino|garamond|baskerville|caslon|didot|bodoni)/i.test(label))
    return { display: `"${label}", ${SERIF}`, label }
  const serif = /serif|garamond|baskerville|playfair|cormorant|times|georgia|caslon|didot|bodoni|sabon|minion/i.test(label)
  return { display: `"${label}", ${serif ? SERIF : SANS}`, label }
}

function firstFamily(value: string): string {
  const parts = value
    .split(',')
    .map((part) => part.replace(/["']/g, '').trim())
    .filter(Boolean)
  return parts.find((part) => !GENERIC.test(part)) ?? ''
}

/**
 * A type stack a generated design may use: a real family we know, quoted, with
 * fallbacks. Arbitrary CSS never passes, so a model cannot inject rules through
 * a font value. `ui-serif`-only stacks are refused: no family means no intent.
 */
export function isKnownFontStack(value: string): boolean {
  if (typeof value !== 'string' || value.length < 2 || value.length > 220) return false
  if (!/^[\w\s"',.\-()]+$/.test(value)) return false
  return Boolean(stackFor(firstFamily(value)))
}

/** Resolve a family a model named ("Fraunces") to a stack that works offline.
 *  Returns undefined rather than inventing a fallback: an unknown family is a
 *  design decision the renderer cannot honour. */
export function fontStackFor(family: string): string | undefined {
  return stackFor(family)?.display
}

/** A font family the site declares, from its markup or its stylesheet. */
function fontOf(html: string, css: string): { display: string; label: string } | undefined {
  const google = /fonts\.googleapis\.com\/css2?\?[^"'\s>]*family=([^"'&:>]+)/i.exec(html)
  if (google) {
    const family = decodeURIComponent(google[1].replace(/\+/g, ' ')).split('|')[0]
    const stack = stackFor(family)
    if (stack) return stack
  }
  const declared = [
    ...css.matchAll(/font-family\s*:\s*([^;{}]{2,120})/gi),
    ...html.matchAll(/font-family\s*:\s*([^;{}"']{2,120})/gi),
  ]
  for (const match of declared) {
    const family = firstFamily(match[1])
    const stack = family ? stackFor(family) : undefined
    if (stack) return stack
  }
  return undefined
}

/* ------------------------------------------------------------------ */
/* Palette + shape                                                     */
/* ------------------------------------------------------------------ */

function customProperties(css: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const match of css.matchAll(/--([a-z0-9-]+)\s*:\s*([^;{}]{3,80})/gi)) {
    const name = match[1].toLowerCase()
    if (!map.has(name)) map.set(name, match[2].trim())
  }
  return map
}

function pick(
  vars: Map<string, string>,
  names: string[],
  test: (value: string) => boolean,
): string {
  for (const name of names) {
    const raw = vars.get(name)
    if (!raw) continue
    const hex = hexOf(raw)
    if (hex && test(hex)) return hex
  }
  return ''
}

function bodyDeclarations(css: string): string {
  return /(?:^|\})\s*(?:html|body|:root|body[^{]{0,40})\s*\{([^}]{0,600})\}/gi
    .exec(css)?.[1] ?? ''
}

function radiusOf(css: string): number {
  const counts = new Map<number, number>()
  for (const match of css.matchAll(/border-radius\s*:\s*(\d{1,2})px/gi)) {
    const value = Number(match[1])
    if (value > 28) continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0
}

/**
 * The design kit, if the site gave us enough to be worth using. `fallbackInk`
 * and `fallbackBg` are the trade theme's own pair, used when the site's colours
 * fail contrast — a pretty clone nobody can read is not a design.
 */
export function readDesign(
  html: string,
  css: string,
  fallback: { bg: string; ink: string; muted: string },
  /** A background the site declared outside CSS — its manifest splash colour. */
  declaredBg = '',
): DesignKit | undefined {
  const vars = customProperties(css)
  const body = bodyDeclarations(css)
  const bodyBg = /background(?:-color)?\s*:\s*([^;}]+)/i.exec(body)?.[1] ?? ''
  const bodyInk = /(?:^|;)\s*color\s*:\s*([^;}]+)/i.exec(body)?.[1] ?? ''

  const isDark = (hex: string) => luminance(hex) < 0.42
  const siteBg =
    hexOf(bodyBg) ||
    pick(vars, ['background', 'bg', 'background-color', 'color-background', 'base', 'page'], () => true)
  const siteInk =
    hexOf(bodyInk) ||
    pick(
      vars,
      ['foreground', 'fg', 'text', 'ink', 'color-text', 'color-foreground', 'body-color'],
      (hex) => hex !== siteBg,
    )
  const manifestBg = hexOf(declaredBg)
  const radiusFound = radiusOf(css)
  const font = fontOf(html, css)
  // Nothing measurable means their theme is invisible in the CSS we could see:
  // better to leave the trade's own design intact than to overwrite it with ours.
  if (!siteBg && !siteInk && !radiusFound && !font && !manifestBg) return undefined

  let bg = siteBg || manifestBg
  let ink = siteInk
  const evidence: string[] = []
  // Their declared background needs a readable ink; a neutral one is disclosed
  // as ours in the basis rather than passed off as theirs.
  let derivedInk = false
  if (bg && !ink) {
    ink = contrast(bg, '#ffffff') >= 4.5 ? '#ffffff' : '#111111'
    derivedInk = true
  }

  if (bg && ink && contrast(bg, ink) < 4.5) {
    // One of the two is decoration rather than a surface. Trust the pair with
    // the better chance: white text on a colour, or the theme's own pairing.
    const whiteOnBg = contrast(bg, '#ffffff')
    if (whiteOnBg >= 4.5) ink = '#ffffff'
    else if (contrast(ink, '#ffffff') >= 4.5 && isDark(bg)) ink = ink
    else {
      bg = ''
      ink = ''
    }
  }
  // Decided before the fallback fill: only a pair the site gave us (or its
  // declared background) counts as their palette.
  const palette = Boolean(bg && ink)

  if (!bg || !ink) {
    bg = bg || fallback.bg
    ink = ink || fallback.ink
    if (contrast(bg, ink) < 4.5) {
      bg = fallback.bg
      ink = fallback.ink
    }
  }
  if (!/^#[0-9a-f]{6}$/.test(bg) || !/^#[0-9a-f]{6}$/.test(ink)) return undefined

  const dark = isDark(bg)
  // A card that is the same colour as the page is no card: lift the surface even
  // when the site paints everything white.
  const surface = dark ? mix(bg, '#ffffff', 0.06) : mix(bg, ink, 0.04)
  const surface2 = dark ? mix(bg, '#ffffff', 0.1) : mix(bg, ink, 0.085)
  const mutedGuess = dark ? mix(ink, bg, 0.3) : mix(ink, bg, 0.34)
  const muted = contrast(mutedGuess, bg) >= 3 ? mutedGuess : fallback.muted

  if (palette)
    evidence.push(
      `${siteBg ? 'palette' : 'splash colour'} ${bg}${derivedInk ? ' with a neutral ink' : `/${ink}`}`,
    )
  if (font) evidence.push(font.label)
  if (radiusFound) evidence.push(`${radiusFound}px corners`)
  if (palette) evidence.push(dark ? 'dark' : 'light')

  return {
    bg,
    surface,
    surface2,
    ink,
    muted,
    // 0 means "not declared": the trade's corner language stays.
    radius: radiusFound ? Math.min(26, radiusFound) : 0,
    display: font?.display ?? '',
    fontLabel: font?.label ?? '',
    dark,
    palette,
    basis: evidence.join(' · '),
  }
}

/* ------------------------------------------------------------------ */
/* Nav and hero                                                        */
/* ------------------------------------------------------------------ */

export type SiteStructure = {
  /** How their mobile navigation is presented: a drawer behind a button, or
   *  a row of tabs along the top. */
  nav: 'drawer' | 'tabs'
  stickyHeader: boolean
  /** Their own top-level labels, in their order. */
  navLabels: string[]
  /** The composition of the first screenful. */
  hero: 'image' | 'split' | 'centered' | 'none'
  basis: string
}

function textOfAnchor(fragment: string): string {
  return fragment
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (whole, entity: string) =>
      entity === 'amp' ? '&' : entity === 'lt' ? '<' : entity === 'gt' ? '>' : entity === 'quot' ? '"' : entity === '#39' ? "'" : ' ',
    )
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The shape of their site, not its paint: is the mobile nav a drawer or a row
 * of tabs, does the header stick, and how is the first screen composed — a
 * full-bleed image, words beside an image, or centred copy?
 */
export function readStructure(
  html: string,
  css: string,
  /** Their business name: a logo link is not a nav label. */
  siteName = '',
): SiteStructure | undefined {
  const header = /<header\b[\s\S]{0,7000}?<\/header>/i.exec(html)?.[0] ?? ''
  const navBlock = /<nav\b[\s\S]{0,5000}?<\/nav>/i.exec(header || html)?.[0] ?? ''
  const labels = [
    ...new Set(
      [...(navBlock || header).matchAll(/<a\b[^>]*>([\s\S]{1,80}?)<\/a>/gi)]
        .map((match) => textOfAnchor(match[1]))
        .filter((label) => label.length >= 2 && label.length <= 22)
        .filter((label) => !/^(?:skip|menu|search|cart|bag|login|account|sign in|sign up|close|home)$/i.test(label))
        .filter((label) => !siteName || label.toLowerCase() !== siteName.trim().toLowerCase()),
    ),
  ].slice(0, 5)

  const drawerMarkers =
    /aria-label=["'][^"']*\b(?:menu|navigation)\b[^"']*["']|aria-expanded=["']false|class=["'][^"']*\b(?:hamburger|burger|nav-toggle|menu-toggle|mobile-nav|navbar-toggler|menu-btn)\b/i
  const drawer = drawerMarkers.test(header || html) && labels.length <= 3

  const stickyHeader =
    /(?:^|[},])\s*(?:header|\.site-header|\.header|\.navbar|nav)\b[^{}]{0,60}\{[^}]*position\s*:\s*(?:sticky|fixed)/i.test(
      css,
    ) || /<header[^>]+class=["'][^"']*\b(?:sticky|fixed|is-stuck)\b/i.test(html)

  const heroTag =
    /<(?:section|div|header|main)[^>]+(?:class|id)=["'][^"']*\b(?:hero|banner|masthead|jumbotron|carousel|slider)\b[^"']*["'][^>]*>/i.exec(
      html,
    )
  const heroBlock = heroTag ? html.slice(heroTag.index!, heroTag.index! + 9000) : ''
  const heroMedia = heroBlock ? /<(?:img|picture|video)\b|background-image\s*:/i.test(heroBlock) : false
  const heroCentered = heroBlock
    ? /text-align\s*:\s*center|class=["'][^"']*\b(?:centered|text-center|center-align)\b/i.test(heroBlock)
    : false
  const heroSplit = heroBlock
    ? /class=["'][^"']*\b(?:split|two-col(?:umn)?s?|halves|side-by-side|grid-2)\b/i.test(heroBlock) ||
      /grid-template-columns\s*:\s*(?:1fr\s+1fr|repeat\(\s*2)/i.test(css)
    : false

  if (!header && !navBlock && !heroTag) return undefined

  const hero: SiteStructure['hero'] = heroSplit
    ? 'split'
    : heroCentered
      ? 'centered'
      : heroMedia
        ? 'image'
        : heroBlock
          ? 'centered'
          : 'none'

  const nav: SiteStructure['nav'] = drawer ? 'drawer' : 'tabs'
  const basis = [
    nav === 'drawer' ? 'nav in a drawer' : 'nav in a row',
    stickyHeader ? 'sticky header' : '',
    labels.length ? labels.slice(0, 3).join(', ') : '',
    `hero ${hero}`,
  ]
    .filter(Boolean)
    .join(' · ')

  return { nav, stickyHeader, navLabels: labels, hero, basis }
}

export function cleanStructure(input: unknown): SiteStructure | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined
  const source = input as Record<string, unknown>
  const nav = source.nav === 'drawer' ? 'drawer' : source.nav === 'tabs' ? 'tabs' : ''
  const hero = ['image', 'split', 'centered', 'none'].includes(String(source.hero))
    ? (source.hero as SiteStructure['hero'])
    : 'none'
  if (!nav) return undefined
  const labels = Array.isArray(source.navLabels)
    ? source.navLabels
        .filter((label): label is string => typeof label === 'string')
        .map((label) => label.replace(/[<>]/g, '').trim().slice(0, 22))
        .filter(Boolean)
        .slice(0, 5)
    : []
  return {
    nav,
    hero,
    navLabels: labels,
    stickyHeader: source.stickyHeader === true,
    basis: typeof source.basis === 'string' ? source.basis.slice(0, 90) : '',
  }
}

/* ------------------------------------------------------------------ */
/* PWA                                                                 */
/* ------------------------------------------------------------------ */

export function manifestHref(html: string): string {
  return (
    /<link[^>]+rel=["'][^"']*\bmanifest\b[^"']*["'][^>]*>/i
      .exec(html)?.[0]
      ?.match(/href=["']([^"']+)/i)?.[1] ?? ''
  )
}

export function registersServiceWorker(html: string): boolean {
  return /serviceWorker\s*\.\s*register|navigator\.serviceWorker/i.test(html)
}

/** The manifest a browser would use if someone installed this site. */
export function parseManifest(json: string, base: URL): PwaInfo | undefined {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    return undefined
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined
  const source = data as Record<string, unknown>
  const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')
  const icons = Array.isArray(source.icons) ? source.icons : []
  const icon = icons
    .map((entry) => (entry && typeof entry === 'object' ? text((entry as Record<string, unknown>).src) : ''))
    .find(Boolean)
  let iconUrl = ''
  if (icon) {
    try {
      const resolved = new URL(icon, base)
      if (/^https?:$/.test(resolved.protocol)) iconUrl = resolved.toString()
    } catch {
      iconUrl = ''
    }
  }
  const name = text(source.name) || text(source.short_name)
  if (!name && !iconUrl) return undefined
  return {
    manifest: base.toString(),
    name,
    display: text(source.display),
    themeColor: hexOf(text(source.theme_color)),
    backgroundColor: hexOf(text(source.background_color)),
    icon: iconUrl,
    serviceWorker: false,
  }
}

/* ------------------------------------------------------------------ */
/* Round trip                                                          */
/* ------------------------------------------------------------------ */

/** The brief posts this back; nothing in it is trusted. */
export function cleanDesign(input: unknown): DesignKit | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined
  const source = input as Record<string, unknown>
  const hex = (value: unknown): string => (typeof value === 'string' ? hexOf(value) : '')
  const bg = hex(source.bg)
  const ink = hex(source.ink)
  if (!bg || !ink) return undefined
  if (contrast(bg, ink) < 4.5) return undefined
  const text = (value: unknown, max: number): string =>
    typeof value === 'string' && value.length <= max && /^[\w\s"',.()\-]+$/.test(value)
      ? value.trim()
      : ''
  const radius = Number(source.radius)
  return {
    bg,
    ink,
    surface: hex(source.surface) || mix(bg, '#ffffff', luminance(bg) < 0.42 ? 0.06 : 0.62),
    surface2: hex(source.surface2) || mix(bg, ink, 0.07),
    muted: hex(source.muted) || ink,
    radius: Number.isFinite(radius) ? Math.max(0, Math.min(26, Math.round(radius))) : 10,
    display: text(source.display, 220),
    fontLabel: text(source.fontLabel, 40),
    dark: typeof source.dark === 'boolean' ? source.dark : luminance(bg) < 0.42,
    palette: source.palette === true,
    basis: text(source.basis, 90),
  }
}

export function cleanPwa(input: unknown): PwaInfo | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined
  const source = input as Record<string, unknown>
  const text = (value: unknown, max: number): string =>
    typeof value === 'string' ? value.slice(0, max) : ''
  const name = text(source.name, 80)
  const manifest = text(source.manifest, 300)
  if (!name && !manifest) return undefined
  return {
    manifest,
    name,
    display: text(source.display, 20),
    themeColor: hexOf(text(source.themeColor, 9)),
    backgroundColor: hexOf(text(source.backgroundColor, 9)),
    icon: /^https?:\/\//i.test(text(source.icon, 300)) ? text(source.icon, 300) : '',
    serviceWorker: source.serviceWorker === true,
  }
}
