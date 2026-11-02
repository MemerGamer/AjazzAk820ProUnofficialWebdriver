/**
 * 2.4 GHz dongle protocol for the Ajazz AK820 Pro (0x0c45:0xfdfd).
 *
 * The dongle's control channel is interface 3 (`MI_03`), a HID collection on
 * usage page 0xFF60 with **32-byte** input and output reports. It is a
 * different dialect from both the legacy `0x04` feature-report protocol and
 * the `0xAA` vendor protocol used by wired units:
 *
 * ```
 * offset | field
 * -------+------------------------------------------
 *   0    | command
 *   1    | payload length
 *   2    | address/offset (0 for the commands used here)
 *   3..  | payload
 *   31   | checksum = sum(bytes 0..30) & 0xFF
 * ```
 *
 * There is no magic byte. The device acknowledges a command by echoing the
 * first three request bytes with the payload zeroed (and a fresh checksum) —
 * which is why the 64-byte `MI_04` node looks like it "echoes" 0xAA frames:
 * it is not the control channel at all.
 *
 * Decoded by capturing the official Windows driver (DeviceDriver.exe,
 * "AJAZZ_AK820Pro_Tripemode ... V1.0.0.5") under Wine with `WINEDEBUG=+hid`.
 * `config.xml` maps the dongle to `VID_0C45&PID_FDFD&MI_03`.
 */

/** Output/input report size of the dongle's control interface. */
export const WIRELESS_REPORT_LENGTH = 32
/** Commands are 3 header bytes + payload + 1 trailing checksum. */
export const WIRELESS_HEADER_LENGTH = 3
export const WIRELESS_CHECKSUM_INDEX = WIRELESS_REPORT_LENGTH - 1

/** Command bytes used by this app (observed in official-driver traffic). */
export const WirelessCmd = {
  /** Returns a device-info block; also proves we picked the right interface. */
  GET_DEVICE_INFO: 0x02,
  /** Set the RGB effect (16-byte payload). */
  SET_LED_EFFECT: 0x05,
  /** Set the auto-sleep timeout (16-byte payload). */
  SET_SLEEP: 0x07,
  /** Push date/time to the keyboard's screen (16-byte payload). */
  SYNC_TIME: 0x0c,
  /** ~1 Hz keep-alive; the dongle echoes it. */
  PING: 0x20,
} as const

/** Sum of the first 31 bytes, truncated to one byte. */
export function wirelessChecksum(frame: Uint8Array): number {
  let sum = 0
  for (let i = 0; i < frame.length - 1; i++) sum += frame[i]
  return sum & 0xff
}

/**
 * Build one outgoing dongle frame.
 *
 * @param cmd     command byte (`WirelessCmd`)
 * @param payload bytes placed at offset 3 (truncated to fit the frame)
 * @param opts.addr        value for byte 2 (default 0)
 * @param opts.reportLength report size; defaults to 32
 */
export function buildWirelessFrame(
  cmd: number,
  payload: Uint8Array = new Uint8Array(0),
  opts: { addr?: number; reportLength?: number } = {},
): Uint8Array<ArrayBuffer> {
  const reportLength = opts.reportLength ?? WIRELESS_REPORT_LENGTH
  const frame = new Uint8Array(reportLength)
  const maxPayload = Math.max(0, reportLength - WIRELESS_HEADER_LENGTH - 1)
  frame[0] = cmd & 0xff
  frame[1] = Math.min(payload.length, maxPayload) & 0xff
  frame[2] = (opts.addr ?? 0) & 0xff
  frame.set(payload.subarray(0, maxPayload), WIRELESS_HEADER_LENGTH)
  frame[reportLength - 1] = wirelessChecksum(frame)
  return frame
}

/** Effect parameters in the shape the UI already uses. */
export interface WirelessLightingOptions {
  mode: number
  r: number
  g: number
  b: number
  rainbow: boolean
  /** UI scale 0–5; sent verbatim (the dongle uses the same scale). */
  brightness: number
  /** UI scale 0–5; sent verbatim. */
  speed: number
  direction: number
}

/**
 * 16-byte `SET_LED_EFFECT` payload.
 *
 * Captured example (static red, colourful on, brightness 5, speed 3):
 * `01 ff 00 00 00 00 00 00 01 05 03 00 00 00 aa 55`.
 * Note byte 4 is 0x00 here, unlike the wired `0xAA` protocol's 0xFF.
 */
export function wirelessLightingPayload({
  mode,
  r,
  g,
  b,
  rainbow,
  brightness,
  speed,
  direction,
}: WirelessLightingOptions): Uint8Array<ArrayBuffer> {
  const p = new Uint8Array(16)
  p[0] = mode & 0xff
  p[1] = r & 0xff
  p[2] = g & 0xff
  p[3] = b & 0xff
  p[4] = 0
  p[5] = 0
  p[6] = 0
  p[7] = 0
  p[8] = rainbow ? 1 : 0 // colourful / per-LED colour mode
  p[9] = Math.max(0, Math.min(5, Math.round(brightness)))
  p[10] = Math.max(0, Math.min(5, Math.round(speed)))
  p[11] = direction & 0xff
  p[12] = 0
  p[13] = 0
  p[14] = 0xaa
  p[15] = 0x55
  return p
}

/**
 * 16-byte `SYNC_TIME` payload.
 *
 * Captured from the official driver, which streams this once per second
 * while connected over the dongle:
 * `00 01 5a 1a 0b 02 15 2d 17 00 01 00 00 00 aa 55`
 * (`[3]=year-2000, [4]=month, [5]=day, [6]=hour, [7]=minute, [8]=second,
 * [10]=ISO weekday, Mon=1`).
 */
export function wirelessTimePayload(
  date: Date = new Date(),
): Uint8Array<ArrayBuffer> {
  const p = new Uint8Array(16)
  p[0] = 0
  p[1] = 0x01
  p[2] = 0x5a // magic marker, same as the wired protocol
  p[3] = (date.getFullYear() - 2000) & 0xff
  p[4] = (date.getMonth() + 1) & 0xff
  p[5] = date.getDate() & 0xff
  p[6] = date.getHours() & 0xff
  p[7] = date.getMinutes() & 0xff
  p[8] = date.getSeconds() & 0xff
  p[9] = 0
  p[10] = (((date.getDay() + 6) % 7) + 1) & 0xff
  p[14] = 0xaa
  p[15] = 0x55
  return p
}

/**
 * 16-byte `SET_SLEEP` payload. `timer` uses the same 0–3 scale as
 * `SleepTimers` (0 = never, 1 = 1 min, 2 = 5 min, 3 = 30 min); the value sits
 * at payload byte 6 and byte 8 is a constant 0x02.
 *
 * Captured: No Sleep `{… 00 00 00 02 …}`, 1 min `{… 01 00 00 02 …}`,
 * 30 min `{… 03 00 00 02 …}`.
 */
export function wirelessSleepPayload(timer: number): Uint8Array<ArrayBuffer> {
  const p = new Uint8Array(16)
  p[0] = 0
  p[1] = 0x01
  p[6] = Math.max(0, Math.min(3, Math.round(timer))) & 0xff
  p[8] = 0x02
  p[14] = 0xaa
  p[15] = 0x55
  return p
}

/** True when `data` is a checksum-valid reply to `cmd`. */
export function isWirelessReply(data: Uint8Array, cmd: number): boolean {
  return (
    data.length >= 4 &&
    data[0] === cmd &&
    data[data.length - 1] === wirelessChecksum(data)
  )
}
