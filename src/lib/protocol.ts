/**
 * Packet builders for the Ajazz AK820 Pro vendor HID protocol.
 *
 * The keyboard (Sonix SN32F299 MCU) exposes a vendor control collection on
 * interface 3. All control traffic is sent as 64-byte *unnumbered* HID feature
 * reports (report ID 0x00), so `buf[0]` below is the first byte of the report
 * payload, not a HID report-ID.
 *
 * Reverse-engineering credit:
 *   - gohv/EPOMAKER-Ajazz-AK820-Pro (Rust) — lighting/time/sleep byte layouts
 *   - KyleBoyer/TFTTimeSync-node (Node.js) — verified command sequences
 *
 * Connect the keyboard via USB-C (wired) to configure it; the 2.4GHz dongle /
 * Bluetooth modes are not supported here.
 */

export const VENDOR_ID = 0x0c45
export const PRODUCT_ID = 0x8009

/** Vendor control collection (interface 3) — used to pick the right HID device. */
export const CONTROL_USAGE_PAGE = 0xff13 // 65299
export const CONTROL_USAGE = 0x01

export const PACKET_LENGTH = 64

// Command codes — payload byte 1 of control/preamble packets.
const CMD_RESET = 0x18
const CMD_SAVE = 0x02
const CMD_TIME = 0x28
const CMD_MODE = 0x13
const CMD_SLEEP = 0x17

export const MAX_BRIGHTNESS = 5
export const MAX_SPEED = 5

/** The 20 onboard lighting effects, keyed by display name. */
export const LightingModes = {
  Off: 0x00,
  Static: 0x01,
  'Single On': 0x02,
  'Single Off': 0x03,
  Glittering: 0x04,
  Falling: 0x05,
  Colourful: 0x06,
  Breath: 0x07,
  Spectrum: 0x08,
  Outward: 0x09,
  Scrolling: 0x0a,
  Rolling: 0x0b,
  Rotating: 0x0c,
  Explode: 0x0d,
  Launch: 0x0e,
  Ripples: 0x0f,
  Flowing: 0x10,
  Pulsating: 0x11,
  Tilt: 0x12,
  Shuttle: 0x13,
} as const
export type LightingModeName = keyof typeof LightingModes

export const Directions = { Left: 0, Down: 1, Up: 2, Right: 3 } as const
export type DirectionName = keyof typeof Directions

/** Auto-sleep timeout options (payload byte 8 of the sleep data packet). */
export const SleepTimers = {
  Never: 0,
  '1 minute': 1,
  '5 minutes': 2,
  '30 minutes': 3,
} as const
export type SleepTimerName = keyof typeof SleepTimers

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
// Backed by a plain ArrayBuffer so it satisfies WebHID's `BufferSource`.
const packet = (): Uint8Array<ArrayBuffer> => new Uint8Array(PACKET_LENGTH)

// --- Preamble / control packets (report payload byte 0 is always 0x04) ---

export const resetStatePacket = () => {
  const p = packet()
  p[0] = 0x04
  p[1] = CMD_RESET
  return p
}

export const savePacket = () => {
  const p = packet()
  p[0] = 0x04
  p[1] = CMD_SAVE
  return p
}

export const configureTimePacket = () => {
  const p = packet()
  p[0] = 0x04
  p[1] = CMD_TIME
  p[8] = 0x01
  return p
}

export const configureLightingPacket = () => {
  const p = packet()
  p[0] = 0x04
  p[1] = CMD_MODE
  p[8] = 0x01
  return p
}

export const configureSleepPacket = () => {
  const p = packet()
  p[0] = 0x04
  p[1] = CMD_SLEEP
  p[2] = 0x01
  p[8] = 0x01
  return p
}

// --- Data packets ---

/** Clock sync data: encodes a local Date for the keyboard's LCD clock. */
export const timeDataPacket = (date: Date) => {
  const p = packet()
  p[0] = 0x00
  p[1] = 0x01
  p[2] = 0x5a // magic marker
  p[3] = date.getFullYear() - 2000
  p[4] = date.getMonth() + 1
  p[5] = date.getDate()
  p[6] = date.getHours()
  p[7] = date.getMinutes()
  p[8] = date.getSeconds()
  p[9] = 0x00
  p[10] = 0x04
  p[62] = 0xaa
  p[63] = 0x55
  return p
}

export interface LightingOptions {
  mode: number
  r: number
  g: number
  b: number
  rainbow: boolean
  brightness: number
  speed: number
  direction: number
}

export const lightingDataPacket = ({
  mode,
  r,
  g,
  b,
  rainbow,
  brightness,
  speed,
  direction,
}: LightingOptions) => {
  const p = packet()
  p[0] = mode // report payload byte 0 carries the effect id
  p[1] = r
  p[2] = g
  p[3] = b
  p[8] = rainbow ? 1 : 0
  p[9] = clamp(brightness, 0, MAX_BRIGHTNESS)
  p[10] = clamp(speed, 0, MAX_SPEED)
  p[11] = direction
  p[14] = 0x55
  p[15] = 0xaa
  return p
}

export const sleepDataPacket = (timer: number) => {
  const p = packet()
  p[8] = timer
  p[62] = 0xaa
  p[63] = 0x55
  return p
}

/** "#rrggbb" -> [r, g, b]; tolerant of a leading "#" and short input. */
export const hexToRgb = (hex: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return [255, 255, 255]
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}
