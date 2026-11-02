import { describe, expect, it } from 'vitest'
import {
  WIRELESS_CHECKSUM_INDEX,
  WIRELESS_REPORT_LENGTH,
  WirelessCmd,
  buildWirelessFrame,
  isWirelessReply,
  wirelessChecksum,
  wirelessLightingPayload,
  wirelessSleepPayload,
  wirelessTimePayload,
} from './wireless-protocol'

const sum = (bytes: number[]) => bytes.reduce((a, b) => a + b, 0) & 0xff

describe('buildWirelessFrame', () => {
  it('lays out cmd, length, addr, payload and checksum', () => {
    const f = buildWirelessFrame(WirelessCmd.SET_LED_EFFECT, new Uint8Array([1, 2, 3]))
    expect(f.length).toBe(WIRELESS_REPORT_LENGTH)
    expect(f[0]).toBe(0x05)
    expect(f[1]).toBe(3)
    expect(f[2]).toBe(0)
    expect([...f.slice(3, 6)]).toEqual([1, 2, 3])
    expect(f[WIRELESS_CHECKSUM_INDEX]).toBe(wirelessChecksum(f))
    expect(f[WIRELESS_CHECKSUM_INDEX]).toBe(sum([...f.slice(0, 31)]))
  })

  it('matches the captured GET_DEVICE_INFO request checksum', () => {
    const f = buildWirelessFrame(WirelessCmd.GET_DEVICE_INFO)
    expect([...f.slice(0, 4)]).toEqual([0x02, 0x00, 0x00, 0x00])
    expect(f[31]).toBe(0x02)
  })

  it('matches the captured ping frame', () => {
    const f = buildWirelessFrame(WirelessCmd.PING, new Uint8Array([0]))
    expect([...f.slice(0, 4)]).toEqual([0x20, 0x01, 0x00, 0x00])
    expect(f[31]).toBe(0x21)
  })

  it('honours addr and truncates oversized payloads', () => {
    const f = buildWirelessFrame(0x05, new Uint8Array(100).fill(7), {
      addr: 0x12,
      reportLength: 8,
    })
    expect(f.length).toBe(8)
    expect(f[1]).toBe(4) // 8 - 3 header - 1 checksum
    expect(f[2]).toBe(0x12)
    expect([...f.slice(3, 7)]).toEqual([7, 7, 7, 7])
    expect(f[7]).toBe(wirelessChecksum(f))
  })
})

describe('wirelessLightingPayload', () => {
  const base = {
    mode: 1,
    r: 255,
    g: 0,
    b: 0,
    rainbow: false,
    brightness: 5,
    speed: 3,
    direction: 0,
  }

  it('reproduces the captured static-red payload', () => {
    const p = wirelessLightingPayload(base)
    expect(p.length).toBe(16)
    expect([...p]).toEqual([
      1, 255, 0, 0, 0, 0, 0, 0, 0, 5, 3, 0, 0, 0, 0xaa, 0x55,
    ])
  })

  it('does not shift brightness/speed (unlike the wired protocol)', () => {
    const p = wirelessLightingPayload({ ...base, brightness: 0, speed: 0 })
    expect(p[9]).toBe(0)
    expect(p[10]).toBe(0)
    expect(wirelessLightingPayload({ ...base, brightness: 5, speed: 5 })[9]).toBe(5)
  })

  it('clamps brightness/speed to the 0-5 scale', () => {
    const p = wirelessLightingPayload({ ...base, brightness: 9, speed: -3 })
    expect(p[9]).toBe(5)
    expect(p[10]).toBe(0)
  })

  it('sets the colourful flag for rainbow', () => {
    expect(wirelessLightingPayload({ ...base, rainbow: true })[8]).toBe(1)
  })
})

describe('wirelessTimePayload', () => {
  it('reproduces the captured 2026-11-02 21:45:23 payload', () => {
    const p = wirelessTimePayload(new Date(2026, 10, 2, 21, 45, 23))
    expect([...p]).toEqual([
      0x00, 0x01, 0x5a, 0x1a, 0x0b, 0x02, 0x15, 0x2d, 0x17, 0x00, 0x01, 0x00,
      0x00, 0x00, 0xaa, 0x55,
    ])
  })

  it('encodes Sunday as 7 and Monday as 1', () => {
    // 2026-11-01 is a Sunday, 2026-11-02 a Monday.
    expect(wirelessTimePayload(new Date(2026, 10, 1))[10]).toBe(7)
    expect(wirelessTimePayload(new Date(2026, 10, 2))[10]).toBe(1)
  })
})

describe('wirelessSleepPayload', () => {
  it('reproduces the captured 30-minute payload', () => {
    const p = wirelessSleepPayload(3)
    expect([...p]).toEqual([
      0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x03, 0x00, 0x02, 0x00, 0x00, 0x00,
      0x00, 0x00, 0xaa, 0x55,
    ])
  })

  it('maps No Sleep to 0 and clamps out-of-range values', () => {
    expect(wirelessSleepPayload(0)[6]).toBe(0)
    expect(wirelessSleepPayload(9)[6]).toBe(3)
    expect(wirelessSleepPayload(-1)[6]).toBe(0)
  })

  it('builds a 32-byte frame with a valid checksum', () => {
    const f = buildWirelessFrame(WirelessCmd.SET_SLEEP, wirelessSleepPayload(1))
    expect(f[0]).toBe(0x07)
    expect(f[1]).toBe(16)
    expect(f[31]).toBe(wirelessChecksum(f))
  })
})

describe('isWirelessReply', () => {
  it('accepts the captured GET_DEVICE_INFO response', () => {
    const reply = new Uint8Array(32)
    reply.set([
      0x02, 0x00, 0x00, 0x40, 0x30, 0x00, 0x00, 0x45, 0x0c, 0x09, 0x80, 0x14,
      0x01, 0xff, 0xff,
    ])
    reply[31] = wirelessChecksum(reply)
    expect(isWirelessReply(reply, WirelessCmd.GET_DEVICE_INFO)).toBe(true)
    expect(isWirelessReply(reply, WirelessCmd.SET_LED_EFFECT)).toBe(false)
  })

  it('rejects a reply with a bad checksum', () => {
    const reply = buildWirelessFrame(WirelessCmd.SET_LED_EFFECT, new Uint8Array(16))
    reply[31] ^= 0xff
    expect(isWirelessReply(reply, WirelessCmd.SET_LED_EFFECT)).toBe(false)
  })
})
