import { describe, expect, it } from 'vitest'
import {
  MAGIC_OUT,
  PRODUCT_ID_DONGLE,
  PRODUCT_ID_WIRED,
  VendorCmd,
  buildVendorFrame,
  lightingEffectPayload,
} from './vendor-protocol'

describe('buildVendorFrame', () => {
  it('lays out the header like the official driver', () => {
    const f = buildVendorFrame(VendorCmd.SET_LED_EFFECT, new Uint8Array([1, 2]))
    expect(f.length).toBe(64)
    expect(f[0]).toBe(MAGIC_OUT)
    expect(f[1]).toBe(0x23)
    expect(f[2]).toBe(2)
    expect(f[3]).toBe(0)
    expect(f[4]).toBe(0)
    expect(f[6]).toBe(1) // last-packet flag
    expect(f[8]).toBe(1)
    expect(f[9]).toBe(2)
    expect(f[10]).toBe(0)
  })

  it('honours addr, last-packet and report length', () => {
    const f = buildVendorFrame(0x50, new Uint8Array([0xaa]), {
      addr: 0x1234,
      lastPacket: false,
      reportLength: 32,
    })
    expect(f.length).toBe(32)
    expect(f[3]).toBe(0x34)
    expect(f[4]).toBe(0x12)
    expect(f[6]).toBe(0)
  })

  it('truncates payloads longer than the frame', () => {
    const f = buildVendorFrame(1, new Uint8Array(100).fill(7), {
      reportLength: 16,
    })
    expect(f.length).toBe(16)
    expect(f[8]).toBe(7)
    expect(f[15]).toBe(7)
  })
})

describe('lightingEffectPayload', () => {
  const base = {
    mode: 1,
    r: 255,
    g: 0,
    b: 0,
    rainbow: false,
    brightness: 5,
    speed: 3,
    direction: 3,
  }

  it('encodes the 16-byte official payload', () => {
    const p = lightingEffectPayload(base)
    expect(p.length).toBe(16)
    expect([...p.slice(0, 5)]).toEqual([1, 255, 0, 0, 0xff])
    expect(p[8]).toBe(0) // mono
    expect(p[11]).toBe(3)
    expect(p[14]).toBe(0xaa)
    expect(p[15]).toBe(0x55)
  })

  it('maps the 0-5 UI scale onto the 1-6 hardware scale', () => {
    expect(lightingEffectPayload({ ...base, brightness: 0 }).at(9)).toBe(1)
    expect(lightingEffectPayload({ ...base, brightness: 5 }).at(9)).toBe(6)
    expect(lightingEffectPayload({ ...base, speed: 0 }).at(10)).toBe(1)
    expect(lightingEffectPayload({ ...base, speed: 5 }).at(10)).toBe(6)
  })

  it('sets colorMode for rainbow', () => {
    expect(lightingEffectPayload({ ...base, rainbow: true }).at(8)).toBe(1)
  })
})

describe('product ids', () => {
  it('covers wired and dongle', () => {
    expect(PRODUCT_ID_WIRED).toBe(0x8009)
    expect(PRODUCT_ID_DONGLE).toBe(0xfdfd)
  })
})
