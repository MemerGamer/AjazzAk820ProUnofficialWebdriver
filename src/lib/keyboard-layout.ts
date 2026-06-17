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
    { label: 'F1', gapBefore: 0.5 }, { label: 'F2' }, { label: 'F3' }, { label: 'F4' },
    { label: 'F5', gapBefore: 0.5 }, { label: 'F6' }, { label: 'F7' }, { label: 'F8' },
    { label: 'F9', gapBefore: 0.5 }, { label: 'F10' }, { label: 'F11' }, { label: 'F12' },
    { label: 'Del', gapBefore: 0.5 },
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
