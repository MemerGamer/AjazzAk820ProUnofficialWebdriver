/**
 * Vendor HID protocol used by the official AJAZZ web driver for wired units.
 *
 * This is a *different* wire format from the legacy `0x04` feature-report
 * protocol in `protocol.ts`:
 *
 *  - Transport: HID **output** reports (report ID 0), not feature reports.
 *  - Frame magic: byte 0 = 0xAA (responses start with 0x55).
 *  - Report length comes from the HID descriptor (64 bytes on the AK820 Pro).
 *
 * Interfaces: the wired keyboard exposes usage page 0xFF68 (and a legacy
 * 0xFF13 collection). The 2.4 GHz dongle (0x0c45:0xfdfd) is **not** handled
 * here — its control channel is a 32-byte 0xFF60 collection using a different
 * dialect; see `wireless-protocol.ts`.
 *
 * Decoded from the official online driver bundle (ajazz.driveall.cn) — see
 * wsclx/ak820pro-modder `docs/PROTOCOL.md` for the documented layout.
 */

export const VENDOR_ID = 0x0c45
/** Wired AK820 Pro (legacy 0xFF13 + vendor 0xFF68 interfaces). */
export const PRODUCT_ID_WIRED = 0x8009
/** Alternative wired PID seen on some AK820 Pro units (issue #5 upstream). */
export const PRODUCT_ID_WIRED_ALT = 0x800a
/** Dedicated 2.4 GHz dongle PID ("Microdia 2.4G Dongle"). */
export const PRODUCT_ID_DONGLE = 0xfdfd

export const PRODUCT_IDS = [
  PRODUCT_ID_WIRED,
  PRODUCT_ID_WIRED_ALT,
  PRODUCT_ID_DONGLE,
] as const

/** Legacy control collection (feature reports, `0x04` protocol). */
export const LEGACY_USAGE_PAGE = 0xff13
/** Vendor collections that speak the `0xAA` protocol (wired USB). */
export const VENDOR_USAGE_PAGES = [0xff68, 0xff60] as const

export const DEFAULT_REPORT_LENGTH = 64
/** Outgoing frames start with 0xAA; responses with 0x55. */
export const MAGIC_OUT = 0xaa
export const MAGIC_IN = 0x55

/** Command bytes (subset used by this app). */
export const VendorCmd = {
  SET_LED_EFFECT: 0x23,
  SET_GAME_MODE: 0x21,
} as const

/**
 * Build one outgoing `0xAA` frame.
 *
 * Layout:
 * ```
 * offset | field
 * -------+-----------------------------------------
 *   0    | 0xAA magic
 *   1    | cmd
 *   2    | payload length
 *   3    | addr & 0xFF
 *   4    | (addr >> 8) & 0xFF
 *   5    | optional[0]
 *   6    | last-packet flag (1/0)
 *   7    | optional[2]
 *   8…   | payload
 * ```
 */
export function buildVendorFrame(
  cmd: number,
  payload: Uint8Array,
  opts: {
    addr?: number
    lastPacket?: boolean
    reportLength?: number
  } = {},
): Uint8Array<ArrayBuffer> {
  const reportLength = opts.reportLength ?? DEFAULT_REPORT_LENGTH
  const addr = opts.addr ?? 0
  const frame = new Uint8Array(reportLength)
  frame[0] = MAGIC_OUT
  frame[1] = cmd & 0xff
  frame[2] = payload.length & 0xff
  frame[3] = addr & 0xff
  frame[4] = (addr >> 8) & 0xff
  frame[6] = opts.lastPacket === false ? 0 : 1
  frame.set(payload.subarray(0, reportLength - 8), 8)
  return frame
}

/** Effect parameters in the shape the UI already uses. */
export interface VendorLightingOptions {
  mode: number
  r: number
  g: number
  b: number
  rainbow: boolean
  /** UI scale 0–5. */
  brightness: number
  /** UI scale 0–5. */
  speed: number
  direction: number
}

/**
 * 16-byte `SET_LED_EFFECT` payload.
 *
 * The official driver's slider range is 1–6, while this app's UI uses 0–5,
 * so brightness/speed are shifted by +1.
 */
export function lightingEffectPayload({
  mode,
  r,
  g,
  b,
  rainbow,
  brightness,
  speed,
  direction,
}: VendorLightingOptions): Uint8Array<ArrayBuffer> {
  const p = new Uint8Array(16)
  p[0] = mode & 0xff
  p[1] = r & 0xff
  p[2] = g & 0xff
  p[3] = b & 0xff
  p[4] = 0xff // driverSetting, hardcoded by the official driver
  p[5] = 0 // secondary red
  p[6] = 0 // secondary green
  p[7] = 0 // secondary blue
  p[8] = rainbow ? 1 : 0 // colorMode (0 = mono, >0 = variants)
  p[9] = Math.min(6, Math.max(1, Math.round(brightness) + 1))
  p[10] = Math.min(6, Math.max(1, Math.round(speed) + 1))
  p[11] = direction & 0xff
  p[12] = 0 // effectModeType
  p[13] = 0
  p[14] = 0xaa // checkCodeL
  p[15] = 0x55 // checkCodeH
  return p
}
