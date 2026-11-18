/**
 * Design presets taken from the reference boards. A preset is a whole visual
 * direction — palette, surface treatment, card shape, dock — layered on top of
 * the trade's own theme when a build opts into it. It is not the default build:
 * without a preset every trade keeps its own design system.
 */

export type PresetId = string

/**
 * Board 1: orange ground, white plates, black pill, rose action, serif food names.
 * Presets between the generated markers below are written by
 * `scripts/figma-preset.ts`; edit the Figma file or the script, not that block.
 */
const FEAST = `
body[data-preset="feast"] {
  --bg: #f5a23c;
  --surface: #ffffff;
  --surface-2: #fbe9d2;
  --ink: #1b1410;
  --muted: #7c6553;
  --line: rgba(27, 20, 16, 0.12);
  --accent: #e8485f;
  --on-accent: #ffffff;
  --accent-soft: #fbdde2;
  --accent-deep: #b1273c;
  --chip-on: #171210;
  --chip-on-ink: #ffffff;
}
body[data-preset="feast"] .app::before {
  background: radial-gradient(120% 80% at 12% -10%, rgba(255, 255, 255, 0.28), transparent 62%);
}
body[data-preset="feast"] .appbar {
  background: color-mix(in srgb, #f5a23c 92%, transparent);
  border-bottom-color: transparent;
}
body[data-preset="feast"] .appbar .kicker { color: #6b4a2f; }
body[data-preset="feast"] .appbar .mark { background: #171210; color: #fff; }
body[data-preset="feast"] .iconbtn {
  background: #fff; border-color: transparent;
  box-shadow: 0 10px 20px -16px rgba(0, 0, 0, 0.5);
}
body[data-preset="feast"] .sect .label {
  font-family: var(--display-serif); font-size: 24px; letter-spacing: -0.012em;
  text-transform: none; color: #1b1410;
}
body[data-preset="feast"] .sect .count { background: #fff; color: #b1273c; }
body[data-preset="feast"] .chip {
  background: #fff; border-color: transparent; color: #1b1410;
  box-shadow: 0 8px 18px -14px rgba(0, 0, 0, 0.5);
}
body[data-preset="feast"] .chip.on { background: #171210; color: #fff; }
body[data-preset="feast"] .h-row {
  background: #fff; border: 0; border-radius: 22px; padding: 16px 18px; margin-bottom: 10px;
  box-shadow: 0 16px 30px -24px rgba(0, 0, 0, 0.5);
}
body[data-preset="feast"] .h-row .name { font-family: var(--display-serif); font-size: 19px; }
body[data-preset="feast"] .h-row .desc { color: #8a705a; }
body[data-preset="feast"] .h-row .meta { color: #96755c; }
body[data-preset="feast"] .h-row .price { color: #e8485f; font-weight: 700; }
body[data-preset="feast"] .h-row .add { background: #e8485f; border-color: transparent; color: #fff; }
body[data-preset="feast"] .l-hero { background: linear-gradient(165deg, #f7b45c, #e8942f); }
body[data-preset="feast"] .btn.accent { background: #e8485f; box-shadow: 0 16px 30px -18px #e8485f; }
body[data-preset="feast"] .tabbar {
  background: #fff; border: 0; border-radius: 999px;
  box-shadow: 0 18px 34px -22px rgba(0, 0, 0, 0.55);
}
body[data-preset="feast"] .tab { color: #7c6553; }
body[data-preset="feast"] .tab.on { background: #171210; color: #fff; }
body[data-preset="feast"] .detail-line .price,
body[data-preset="feast"] .menu-price b { color: #e8485f; }
body[data-preset="feast"] .splash { background: linear-gradient(160deg, #f7b45c, #e8485f); }
`

/* figma-generated:start */
const FIGMA_PRESETS: Record<string, string> = {}
/* figma-generated:end */

export const PRESETS: Record<PresetId, string> = {
  feast: FEAST,
  ...FIGMA_PRESETS,
}

/** Unknown values fall through to the trade's own design system. */
export function presetFor(value: string | undefined): PresetId | undefined {
  return value && Object.hasOwn(PRESETS, value) ? (value as PresetId) : undefined
}

export function presetCss(id: string | undefined): string {
  const preset = presetFor(id)
  return preset ? PRESETS[preset] : ''
}
