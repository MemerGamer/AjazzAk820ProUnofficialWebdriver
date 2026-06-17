import { describe, expect, it } from 'vitest'
import { LightingModes, type LightingModeName } from './protocol'
import {
  EFFECT_DESCRIPTIONS,
  MODE_EFFECT,
  brightnessMul,
  colorForKey,
  hsvToRgb,
  type EffectParams,
} from './effects'

const modeNames = Object.keys(LightingModes) as LightingModeName[]

describe('hsvToRgb', () => {
  it('maps primary hues', () => {
    expect(hsvToRgb(0, 1, 1)).toEqual([255, 0, 0])
    expect(hsvToRgb(1 / 3, 1, 1)).toEqual([0, 255, 0])
    expect(hsvToRgb(2 / 3, 1, 1)).toEqual([0, 0, 255])
  })
  it('value 0 is black', () => {
    expect(hsvToRgb(0.5, 1, 0)).toEqual([0, 0, 0])
  })
})

describe('brightnessMul', () => {
  it('is 0 when off and 1 at max', () => {
    expect(brightnessMul(0)).toBe(0)
    expect(brightnessMul(5)).toBe(1)
  })
  it('is monotonically increasing', () => {
    for (let l = 1; l < 5; l++) {
      expect(brightnessMul(l + 1)).toBeGreaterThan(brightnessMul(l))
    }
  })
})

describe('mode coverage', () => {
  it('every mode has an archetype and a description', () => {
    for (const name of modeNames) {
      expect(MODE_EFFECT[name]).toBeDefined()
      expect(EFFECT_DESCRIPTIONS[name]).toBeTruthy()
    }
  })
})

describe('colorForKey', () => {
  const params: EffectParams = {
    baseColor: [255, 255, 255],
    rainbow: false,
    brightness: 5,
    speed: 3,
    direction: 3,
    t: 1.23,
    active: [],
  }
  const key = { x: 0.5, y: 0.5, id: 7 }

  it('"off" is always black', () => {
    expect(colorForKey('off', key, params)).toEqual([0, 0, 0])
  })

  it('brightness 0 yields black for any archetype', () => {
    const dark = { ...params, brightness: 0 }
    for (const name of modeNames) {
      expect(colorForKey(MODE_EFFECT[name], key, dark)).toEqual([0, 0, 0])
    }
  })

  it('returns in-range channels for every archetype', () => {
    for (const name of modeNames) {
      const [r, g, b] = colorForKey(MODE_EFFECT[name], key, params)
      for (const c of [r, g, b]) {
        expect(c).toBeGreaterThanOrEqual(0)
        expect(c).toBeLessThanOrEqual(255)
      }
    }
  })
})
