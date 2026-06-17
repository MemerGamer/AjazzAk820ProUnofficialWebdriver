/**
 * Pure lighting-effect engine for the keyboard preview.
 *
 * These are *plausible approximations* of how each onboard effect looks — not
 * byte-exact reproductions of the firmware. Every function is pure (no DOM, no
 * time source of its own): the caller passes the current time `t` and the
 * preview drives a `requestAnimationFrame` loop. This keeps the engine
 * unit-testable.
 */

import type { LightingModeName } from './protocol'

export type Rgb = [number, number, number]

/** A recent key press, used by reactive/ripple effects. */
export interface ActivePress {
  x: number
  y: number
  /** Time (seconds) the press happened. */
  t: number
}

export interface EffectParams {
  /** Chosen colour for non-rainbow effects, 0–255 per channel. */
  baseColor: Rgb
  rainbow: boolean
  /** 0–5 (0 = off). */
  brightness: number
  /** 0–5. */
  speed: number
  /** Direction enum: 0=Left, 1=Down, 2=Up, 3=Right. */
  direction: number
  /** Animation time in seconds. */
  t: number
  /** Recent presses (newest last) for ripple/reactive effects. */
  active: ActivePress[]
}

export interface KeyPos {
  x: number
  y: number
  /** Stable per-key id for deterministic sparkle. */
  id: number
}

export type Archetype =
  | 'off'
  | 'solid'
  | 'breathe'
  | 'spectrum'
  | 'wave'
  | 'radial'
  | 'rotating'
  | 'sparkle'
  | 'colourful'
  | 'reactiveOn'
  | 'reactiveOff'

// --- small math helpers ---

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)
const frac = (n: number) => n - Math.floor(n)
const TAU = Math.PI * 2

/** Brightness level 0–5 → 0..1 multiplier (0 is fully off). */
export function brightnessMul(level: number): number {
  if (level <= 0) return 0
  return 0.2 + 0.8 * (Math.min(level, 5) - 1) / 4
}

/** Speed level 0–5 → animation rate multiplier. */
function speedMul(level: number): number {
  return 0.15 + Math.min(Math.max(level, 0), 5) * 0.35
}

export function hsvToRgb(h: number, s: number, v: number): Rgb {
  h = frac(h) * 6
  const i = Math.floor(h)
  const f = h - i
  const p = v * (1 - s)
  const q = v * (1 - s * f)
  const u = v * (1 - s * (1 - f))
  let r = 0
  let g = 0
  let b = 0
  switch (i % 6) {
    case 0: r = v; g = u; b = p; break
    case 1: r = q; g = v; b = p; break
    case 2: r = p; g = v; b = u; break
    case 3: r = p; g = q; b = v; break
    case 4: r = u; g = p; b = v; break
    default: r = v; g = p; b = q; break
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
}

const scaleRgb = (c: Rgb, v: number): Rgb => [
  Math.round(c[0] * v),
  Math.round(c[1] * v),
  Math.round(c[2] * v),
]

/**
 * Final colour from an intensity (0..1) and the params. If `hue` is given the
 * effect is treated as inherently chromatic; otherwise rainbow cycles globally
 * or the base colour is modulated.
 */
function colorize(p: EffectParams, intensity: number, hue?: number): Rgb {
  const v = clamp01(intensity) * brightnessMul(p.brightness)
  if (hue !== undefined) return hsvToRgb(hue, 1, v)
  if (p.rainbow) return hsvToRgb(frac(p.t * speedMul(p.speed) * 0.1), 1, v)
  return scaleRgb(p.baseColor, v)
}

/** Direction enum → unit vector for wave travel. */
function dirVec(direction: number): [number, number] {
  switch (direction) {
    case 0: return [-1, 0] // Left
    case 1: return [0, 1] // Down
    case 2: return [0, -1] // Up
    default: return [1, 0] // Right
  }
}

// Deterministic hash → 0..1 (for sparkle).
function hash(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453
  return s - Math.floor(s)
}

// --- archetypes ---

function solid(key: KeyPos, p: EffectParams): Rgb {
  // Rainbow static = a fixed gradient across the board; otherwise a flat colour.
  return p.rainbow ? colorize(p, 1, frac(key.x)) : colorize(p, 1)
}

function breathe(_key: KeyPos, p: EffectParams): Rgb {
  const phase = p.t * speedMul(p.speed) * 0.5
  const intensity = 0.15 + 0.85 * (0.5 + 0.5 * Math.sin(TAU * phase))
  return colorize(p, intensity)
}

function spectrum(_key: KeyPos, p: EffectParams): Rgb {
  return colorize(p, 1, frac(p.t * speedMul(p.speed) * 0.12))
}

function wave(key: KeyPos, p: EffectParams): Rgb {
  const [dx, dy] = dirVec(p.direction)
  const phase = key.x * dx + key.y * dy
  const rate = speedMul(p.speed)
  const intensity = 0.5 + 0.5 * Math.sin(TAU * (phase * 1.5 - p.t * rate))
  if (p.rainbow) return colorize(p, 0.6 + 0.4 * intensity, frac(phase - p.t * rate * 0.2))
  return colorize(p, intensity)
}

function ripples(active: ActivePress[], key: KeyPos, t: number, rate: number): number {
  let boost = 0
  for (const a of active) {
    const age = t - a.t
    if (age < 0 || age > 1.2) continue
    const d = Math.hypot(key.x - a.x, key.y - a.y)
    const ring = age * rate * 0.9
    boost = Math.max(boost, clamp01(1 - Math.abs(d - ring) * 8) * clamp01(1 - age / 1.2))
  }
  return boost
}

function radial(key: KeyPos, p: EffectParams): Rgb {
  const dist = Math.hypot(key.x - 0.5, key.y - 0.5)
  const rate = speedMul(p.speed)
  const base = 0.5 + 0.5 * Math.sin(TAU * (dist * 2 - p.t * rate))
  const intensity = clamp01(base * 0.8 + ripples(p.active, key, p.t, rate))
  if (p.rainbow) return colorize(p, intensity, frac(dist - p.t * rate * 0.2))
  return colorize(p, intensity)
}

function rotating(key: KeyPos, p: EffectParams): Rgb {
  const angle = Math.atan2(key.y - 0.5, key.x - 0.5) / TAU + 0.5
  return colorize(p, 1, frac(angle - p.t * speedMul(p.speed) * 0.2))
}

function sparkle(key: KeyPos, p: EffectParams): Rgb {
  const rate = speedMul(p.speed)
  const tick = Math.floor(p.t * rate * 2)
  // Two consecutive ticks crossfade so twinkles fade rather than pop.
  const a = hash(key.id + tick * 31.7)
  const b = hash(key.id + (tick + 1) * 31.7)
  const f = frac(p.t * rate * 2)
  const lit = a > 0.78 ? 1 : 0
  const litNext = b > 0.78 ? 1 : 0
  const intensity = lit * (1 - f) + litNext * f
  if (p.rainbow) return colorize(p, intensity, hash(key.id * 7.3))
  return colorize(p, intensity)
}

function colourful(key: KeyPos, p: EffectParams): Rgb {
  const hue = frac(key.x * 0.5 + key.y * 0.5 + p.t * speedMul(p.speed) * 0.05)
  return colorize(p, 1, hue)
}

function reactive(key: KeyPos, p: EffectParams, lit: boolean): Rgb {
  const decay = 0.6
  let pulse = 0
  for (const a of p.active) {
    const d = Math.hypot(key.x - a.x, key.y - a.y)
    if (d > 0.04) continue // only the pressed key
    const age = p.t - a.t
    if (age < 0 || age > decay) continue
    pulse = Math.max(pulse, 1 - age / decay)
  }
  const intensity = lit ? 1 - pulse : pulse
  return colorize(p, intensity)
}

const ARCHETYPES: Record<Archetype, (key: KeyPos, p: EffectParams) => Rgb> = {
  off: () => [0, 0, 0],
  solid,
  breathe,
  spectrum,
  wave,
  radial,
  rotating,
  sparkle,
  colourful,
  reactiveOn: (k, p) => reactive(k, p, false),
  reactiveOff: (k, p) => reactive(k, p, true),
}

export function colorForKey(
  archetype: Archetype,
  key: KeyPos,
  p: EffectParams,
): Rgb {
  return ARCHETYPES[archetype](key, p)
}

/** Maps each of the 20 onboard effects to a preview archetype. */
export const MODE_EFFECT: Record<LightingModeName, Archetype> = {
  Off: 'off',
  Static: 'solid',
  'Single On': 'reactiveOn',
  'Single Off': 'reactiveOff',
  Glittering: 'sparkle',
  Falling: 'wave',
  Colourful: 'colourful',
  Breath: 'breathe',
  Spectrum: 'spectrum',
  Outward: 'radial',
  Scrolling: 'wave',
  Rolling: 'wave',
  Rotating: 'rotating',
  Explode: 'radial',
  Launch: 'wave',
  Ripples: 'radial',
  Flowing: 'wave',
  Pulsating: 'breathe',
  Tilt: 'wave',
  Shuttle: 'wave',
}

export const EFFECT_DESCRIPTIONS: Record<LightingModeName, string> = {
  Off: 'Lighting off.',
  Static: 'A single steady colour across all keys.',
  'Single On': 'Keys light up as you press them, then fade.',
  'Single Off': 'All keys lit; pressed keys briefly go dark.',
  Glittering: 'Random twinkling sparkles.',
  Falling: 'A travelling wave (use Direction to aim it).',
  Colourful: 'A slowly drifting multi-colour gradient.',
  Breath: 'The whole board fades in and out.',
  Spectrum: 'All keys cycle through the colour spectrum together.',
  Outward: 'Rings pulse out from the centre.',
  Scrolling: 'A colour band scrolls across the keys.',
  Rolling: 'A rolling wave across the board.',
  Rotating: 'Colours sweep around like a clock hand.',
  Explode: 'Bursts radiate outward — press keys to detonate.',
  Launch: 'A wave launches across the keys.',
  Ripples: 'Press keys to send ripples outward.',
  Flowing: 'A smooth flowing colour wave.',
  Pulsating: 'Rhythmic pulsing of the whole board.',
  Tilt: 'A tilted travelling wave.',
  Shuttle: 'A band shuttles back and forth.',
}
