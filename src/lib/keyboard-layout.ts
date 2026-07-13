/**
 * Approximate AK820 Pro 75% layout for the on-screen preview.
 *
 * This is a *visual* mock — legends and widths aim for recognizability, not
 * pixel accuracy.  The physical keyboard's right side has four zones rendered
 * separately in KeyboardPreview:
 *   1. Delete key — end of the function row in KEY_ROWS[0]
 *   2. C/W/B connection-mode LED strip
 *   3. Nav column (Home / PgUp / PgDn) + TFT screen below
 *   4. Encoder knob (top-right corner)
 * Home/PgUp/PgDn are therefore NOT at the end of rows 1-3 here.
 */

export interface KeyDef {
  label: string
  /** Width in key units (1u = a standard key). */
  w?: number
  /** Marks the wide/odd keys so we can de-emphasize their legend if needed. */
  wide?: boolean
  /** Extra left margin in key units — used for function-key group gaps and the nav-column separator. */
  gapBefore?: number
}

/**
 * Rows top-to-bottom.
 * - Function row: standard group gaps + Delete as the last key (matches physical board)
 * - Rows 1-3: no nav key at the end — Home/PgUp/PgDn live in the separate nav column
 * - Shift row: ends with ↑ only (no End)
 * - Bottom row: Ctrl before the arrow cluster (matches physical board)
 */
export const KEY_ROWS: KeyDef[][] = [
  // Function row — Esc | F1-F4 | F5-F8 | F9-F12 | Del
  [
    { label: 'Esc' },
    { label: 'F1', gapBefore: 0.34 }, { label: 'F2' }, { label: 'F3' }, { label: 'F4' },
    { label: 'F5', gapBefore: 0.34 }, { label: 'F6' }, { label: 'F7' }, { label: 'F8' },
    { label: 'F9', gapBefore: 0.34 }, { label: 'F10' }, { label: 'F11' }, { label: 'F12' },
    { label: 'Del', gapBefore: 0.34 },
  ],
  // Number row — no nav key; Home is in the separate nav column
  [
    { label: '`' }, { label: '1' }, { label: '2' }, { label: '3' },
    { label: '4' }, { label: '5' }, { label: '6' }, { label: '7' },
    { label: '8' }, { label: '9' }, { label: '0' }, { label: '-' },
    { label: '=' }, { label: 'Bksp', w: 2, wide: true },
  ],
  // QWERTY row — no nav key; PgUp is in the nav column
  [
    { label: 'Tab', w: 1.5, wide: true },
    { label: 'Q' }, { label: 'W' }, { label: 'E' }, { label: 'R' },
    { label: 'T' }, { label: 'Y' }, { label: 'U' }, { label: 'I' },
    { label: 'O' }, { label: 'P' }, { label: '[' }, { label: ']' },
    { label: '\\', w: 1.5, wide: true },
  ],
  // Home row — no nav key; PgDn is in the nav column
  [
    { label: 'Caps', w: 1.75, wide: true },
    { label: 'A' }, { label: 'S' }, { label: 'D' }, { label: 'F' },
    { label: 'G' }, { label: 'H' }, { label: 'J' }, { label: 'K' },
    { label: 'L' }, { label: ';' }, { label: "'" },
    { label: 'Enter', w: 2.25, wide: true },
  ],
  // Shift row — ends with ↑ (no End key; physical End is Fn+PgDn)
  [
    { label: 'Shift', w: 2.25, wide: true },
    { label: 'Z' }, { label: 'X' }, { label: 'C' }, { label: 'V' },
    { label: 'B' }, { label: 'N' }, { label: 'M' }, { label: ',' },
    { label: '.' }, { label: '/' },
    { label: 'Shift', w: 1.75, wide: true },
    { label: '↑', gapBefore: 0.25 },
  ],
  // Bottom row — Ctrl · Win · Alt · Space · Alt · Fn · Ctrl · ← ↓ →
  [
    { label: 'Ctrl', w: 1.25, wide: true },
    { label: 'Win', w: 1.25, wide: true },
    { label: 'Alt', w: 1.25, wide: true },
    { label: 'Space', w: 6.25, wide: true },
    { label: 'Alt' }, { label: 'Fn' }, { label: 'Ctrl' },
    { label: '←', gapBefore: 0.25 }, { label: '↓' }, { label: '→' },
  ],
]

export interface LayoutKey {
  id: number
  label: string
  w: number
  wide: boolean
  row: number
  col: number
  /** Normalized centre position in 0..1 (left→right, top→bottom). */
  x: number
  y: number
}

/**
 * Flatten `KEY_ROWS` into positioned keys. `x` is the unit-space centre of each
 * key normalized by the widest row; `y` is the row index normalized by row
 * count. Used by the effect engine for spatial (wave/radial/rotating) math.
 */
export function getKeys(): LayoutKey[] {
  const rowWidths = KEY_ROWS.map((row) =>
    row.reduce((sum, k) => sum + (k.w ?? 1), 0),
  )
  const maxWidth = Math.max(...rowWidths)
  const rows = KEY_ROWS.length

  const keys: LayoutKey[] = []
  let id = 0
  KEY_ROWS.forEach((row, r) => {
    let cursor = 0
    row.forEach((k, col) => {
      const w = k.w ?? 1
      keys.push({
        id: id++,
        label: k.label,
        w,
        wide: k.wide ?? false,
        row: r,
        col,
        x: (cursor + w / 2) / maxWidth,
        y: rows > 1 ? r / (rows - 1) : 0,
      })
      cursor += w
    })
  })
  return keys
}

/** Total key count (for sizing fixed-length ref arrays). */
export const KEY_COUNT = KEY_ROWS.reduce((sum, row) => sum + row.length, 0)

/** Percent-of-container rectangle (x/y = top-left corner), matching the
 * reference photo's own coordinate space (see KeyboardPreview). */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export const PANEL_IDS = ['knob', 'home', 'pgup', 'pgdn', 'tft'] as const
export type PanelId = (typeof PANEL_IDS)[number]

/**
 * Hand-calibrated key positions captured via the in-app calibration overlay
 * (drag each key/panel element over `/keyboard-ref.jpg` until it lines up,
 * then export). Raw drag data had mouse jitter on all three axes (position,
 * width and height from resize-handle drags), so it's been normalized before
 * hardcoding:
 *  - width snapped to one canonical value per nominal key-unit class (e.g.
 *    every plain 1u key shares the same width) — the median measured width
 *    for that class, so identically-sized keys render identically.
 *  - y/h snapped to a shared value per visual row (arrow-cluster sub-rows
 *    kept separate since they sit at a genuinely different height); the
 *    function row's F5–Del keys had drifted from a resize pass, so that
 *    row's y/h is anchored on its unaffected Esc–F4 keys instead of a plain
 *    median across the whole row.
 *  - x re-walked left-to-right per row using canonical widths plus each
 *    gap-class's median (normal key-to-key gap, the wider function-key
 *    group gap, and the arrow-cluster gap) instead of the noisy raw offsets.
 *  - left edges of every row snapped to one shared column (median of each
 *    row's first-key x), and the number/QWERTY/home rows' right edges
 *    (Bksp/backslash/Enter — all the same 15-unit width) snapped to a
 *    shared column too, rescaling each of those three rows' key positions
 *    and widths proportionally so both edges line up instead of one row
 *    (QWERTY) running wider than the others.
 */
export const KEY_RECTS: Record<number, Rect> = {
  0: { x: 2.37, y: 6.19, w: 5.1, h: 12.16 },
  1: { x: 9.59, y: 6.19, w: 5.1, h: 12.16 },
  2: { x: 15.4, y: 6.19, w: 5.1, h: 12.16 },
  3: { x: 21.21, y: 6.19, w: 5.1, h: 12.16 },
  4: { x: 27.02, y: 6.19, w: 5.1, h: 12.16 },
  5: { x: 34.24, y: 6.19, w: 5.1, h: 12.16 },
  6: { x: 40.05, y: 6.19, w: 5.1, h: 12.16 },
  7: { x: 45.86, y: 6.19, w: 5.1, h: 12.16 },
  8: { x: 51.67, y: 6.19, w: 5.1, h: 12.16 },
  9: { x: 58.89, y: 6.19, w: 5.1, h: 12.16 },
  10: { x: 64.7, y: 6.19, w: 5.1, h: 12.16 },
  11: { x: 70.51, y: 6.19, w: 5.1, h: 12.16 },
  12: { x: 76.32, y: 6.19, w: 5.1, h: 12.16 },
  13: { x: 83.54, y: 6.19, w: 5.1, h: 12.16 },
  14: { x: 2.37, y: 23.37, w: 5.105, h: 12.16 },
  15: { x: 8.19, y: 23.37, w: 5.105, h: 12.16 },
  16: { x: 14, y: 23.37, w: 5.105, h: 12.16 },
  17: { x: 19.82, y: 23.37, w: 5.105, h: 12.16 },
  18: { x: 25.63, y: 23.37, w: 5.105, h: 12.16 },
  19: { x: 31.45, y: 23.37, w: 5.105, h: 12.16 },
  20: { x: 37.27, y: 23.37, w: 5.105, h: 12.16 },
  21: { x: 43.08, y: 23.37, w: 5.105, h: 12.16 },
  22: { x: 48.9, y: 23.37, w: 5.105, h: 12.16 },
  23: { x: 54.71, y: 23.37, w: 5.105, h: 12.16 },
  24: { x: 60.53, y: 23.37, w: 5.105, h: 12.16 },
  25: { x: 66.35, y: 23.37, w: 5.105, h: 12.16 },
  26: { x: 72.16, y: 23.37, w: 5.105, h: 12.16 },
  27: { x: 77.98, y: 23.37, w: 10.841, h: 12.16 },
  28: { x: 2.37, y: 37.42, w: 8.296, h: 12.16 },
  29: { x: 11.38, y: 37.42, w: 5.058, h: 12.16 },
  30: { x: 17.14, y: 37.42, w: 5.058, h: 12.16 },
  31: { x: 22.9, y: 37.42, w: 5.058, h: 12.16 },
  32: { x: 28.66, y: 37.42, w: 5.058, h: 12.16 },
  33: { x: 34.42, y: 37.42, w: 5.058, h: 12.16 },
  34: { x: 40.19, y: 37.42, w: 5.058, h: 12.16 },
  35: { x: 45.95, y: 37.42, w: 5.058, h: 12.16 },
  36: { x: 51.71, y: 37.42, w: 5.058, h: 12.16 },
  37: { x: 57.47, y: 37.42, w: 5.058, h: 12.16 },
  38: { x: 63.24, y: 37.42, w: 5.058, h: 12.16 },
  39: { x: 69, y: 37.42, w: 5.058, h: 12.16 },
  40: { x: 74.76, y: 37.42, w: 5.058, h: 12.16 },
  41: { x: 80.52, y: 37.42, w: 8.296, h: 12.16 },
  42: { x: 2.37, y: 51.34, w: 9.531, h: 12.16 },
  43: { x: 12.61, y: 51.34, w: 5.095, h: 12.16 },
  44: { x: 18.42, y: 51.34, w: 5.095, h: 12.16 },
  45: { x: 24.22, y: 51.34, w: 5.095, h: 12.16 },
  46: { x: 30.02, y: 51.34, w: 5.095, h: 12.16 },
  47: { x: 35.83, y: 51.34, w: 5.095, h: 12.16 },
  48: { x: 41.63, y: 51.34, w: 5.095, h: 12.16 },
  49: { x: 47.44, y: 51.34, w: 5.095, h: 12.16 },
  50: { x: 53.24, y: 51.34, w: 5.095, h: 12.16 },
  51: { x: 59.05, y: 51.34, w: 5.095, h: 12.16 },
  52: { x: 64.85, y: 51.34, w: 5.095, h: 12.16 },
  53: { x: 70.66, y: 51.34, w: 5.095, h: 12.16 },
  54: { x: 76.46, y: 51.34, w: 12.359, h: 12.16 },
  55: { x: 2.37, y: 65.15, w: 12.37, h: 12.16 },
  56: { x: 15.45, y: 65.15, w: 5.1, h: 12.16 },
  57: { x: 21.26, y: 65.15, w: 5.1, h: 12.16 },
  58: { x: 27.07, y: 65.15, w: 5.1, h: 12.16 },
  59: { x: 32.88, y: 65.15, w: 5.1, h: 12.16 },
  60: { x: 38.69, y: 65.15, w: 5.1, h: 12.16 },
  61: { x: 44.5, y: 65.15, w: 5.1, h: 12.16 },
  62: { x: 50.31, y: 65.15, w: 5.1, h: 12.16 },
  63: { x: 56.12, y: 65.15, w: 5.1, h: 12.16 },
  64: { x: 61.93, y: 65.15, w: 5.1, h: 12.16 },
  65: { x: 67.74, y: 65.15, w: 5.1, h: 12.16 },
  66: { x: 73.55, y: 65.15, w: 9.54, h: 12.16 },
  67: { x: 85.29, y: 68.29, w: 5.1, h: 12.16 },
  68: { x: 2.37, y: 78.95, w: 6.38, h: 12.16 },
  69: { x: 9.46, y: 78.95, w: 6.38, h: 12.16 },
  70: { x: 16.55, y: 78.95, w: 6.38, h: 12.16 },
  71: { x: 23.64, y: 78.95, w: 36.06, h: 12.16 },
  72: { x: 60.41, y: 78.95, w: 5.1, h: 12.16 },
  73: { x: 66.22, y: 78.95, w: 5.1, h: 12.16 },
  74: { x: 72.03, y: 78.95, w: 5.1, h: 12.16 },
  75: { x: 79.33, y: 82.39, w: 5.1, h: 12.16 },
  76: { x: 85.14, y: 82.39, w: 5.1, h: 12.16 },
  77: { x: 90.95, y: 82.39, w: 5.1, h: 12.16 },
}

/** Right-panel element positions (knob, nav keys, TFT clock), calibrated
 * with the toolbar moved out of the way so the knob is fully visible. */
export const PANEL_RECTS: Partial<Record<PanelId, Rect>> = {
  knob: { x: 91.91, y: 4.82, w: 6.34, h: 14.74 },
  home: { x: 92.07, y: 22.84, w: 5.64, h: 12.9 },
  pgup: { x: 92.09, y: 37, w: 5.44, h: 12.95 },
  pgdn: { x: 92.12, y: 51.12, w: 5.53, h: 12.66 },
  tft: { x: 91.91, y: 66.44, w: 6.01, h: 13.32 },
}

/** C/W/B connection-mode LED positions, calibrated independently of their
 * nav key. */
export const LED_RECTS: Record<'ledC' | 'ledW' | 'ledB', Rect> = {
  ledC: { x: 89.66, y: 31.17, w: 2, h: 3 },
  ledW: { x: 89.62, y: 40.11, w: 2, h: 3 },
  ledB: { x: 89.63, y: 48.73, w: 2, h: 3 },
}
