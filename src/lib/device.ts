/**
 * WebHID connection layer for the Ajazz AK820 Pro.
 *
 * Supports three transports:
 *
 *  - **legacy** — wired USB via the 0xFF13 vendor collection, using the
 *    `0x04` feature-report protocol (`protocol.ts`). This is the original
 *    path and handles clock + sleep + lighting.
 *  - **wireless** — the 2.4 GHz dongle (0x0c45:0xfdfd) control interface
 *    `MI_03`: usage page 0xFF60 with 32-byte output reports, speaking the
 *    dongle dialect in `wireless-protocol.ts` (lighting, clock and sleep).
 *  - **vendor** — the official AJAZZ `0xAA` output-report protocol
 *    (`vendor-protocol.ts`), for wired units that only expose 0xFF68.
 *
 * Everything here touches `navigator.hid`, so it must only run in the browser
 * (inside event handlers / effects) — never during SSR. WebHID requires a
 * Chromium-based browser and a secure context (HTTPS or http://localhost).
 */

import {
  CONTROL_USAGE,
  CONTROL_USAGE_PAGE,
  configureLightingPacket,
  configureSleepPacket,
  configureTimePacket,
  lightingDataPacket,
  resetStatePacket,
  savePacket,
  sleepDataPacket,
  timeDataPacket,
  type LightingOptions,
} from './protocol'
import {
  DEFAULT_REPORT_LENGTH,
  LEGACY_USAGE_PAGE,
  MAGIC_IN,
  PRODUCT_ID_DONGLE,
  PRODUCT_IDS,
  VENDOR_ID,
  VENDOR_USAGE_PAGES,
  VendorCmd,
  buildVendorFrame,
  lightingEffectPayload,
} from './vendor-protocol'
import {
  WIRELESS_REPORT_LENGTH,
  WirelessCmd,
  buildWirelessFrame,
  isWirelessReply,
  wirelessLightingPayload,
  wirelessSleepPayload,
  wirelessTimePayload,
} from './wireless-protocol'

/** Unnumbered HID reports — report ID is always 0. */
const REPORT_ID = 0x00
/** The reference tools pace legacy control traffic by ~40ms between reports. */
const USB_PROCESSING_MS = 40
/** How long to wait for a vendor-protocol ack before moving on. */
const VENDOR_ACK_TIMEOUT_MS = 500
/** How long the dongle gets to answer the interface probe. */
const WIRELESS_PROBE_TIMEOUT_MS = 600

export type Transport = 'legacy' | 'wireless' | 'vendor'

let device: HIDDevice | null = null
let transport: Transport = 'legacy'
let reportLength = DEFAULT_REPORT_LENGTH

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const isWebHIDSupported = () =>
  typeof navigator !== 'undefined' && 'hid' in navigator

export const getDevice = () => device
export const isConnected = () => !!device?.opened
/** True when connected through the 2.4 GHz dongle. */
export const isWirelessTransport = () => transport === 'wireless'

/** Usage page of a HID node's first collection. */
function usagePageOf(d: HIDDevice): number {
  return d.collections?.[0]?.usagePage ?? 0
}

/**
 * Largest output-report payload size (bytes) advertised by the descriptor.
 * `sendReport` requires exactly this many bytes.
 */
function outputReportLength(d: HIDDevice): number {
  let max = 0
  for (const c of d.collections ?? []) {
    for (const r of c.outputReports ?? []) {
      for (const item of r.items ?? []) {
        const bytes = Math.ceil(
          ((item.reportCount ?? 0) * (item.reportSize ?? 0)) / 8,
        )
        if (bytes > max) max = bytes
      }
    }
  }
  return max || DEFAULT_REPORT_LENGTH
}

/** True for any granted interface of the 2.4 GHz dongle. */
function isDongleNode(d: HIDDevice): boolean {
  return d.productId === PRODUCT_ID_DONGLE
}

/** Probe the dongle's control interface with GET_DEVICE_INFO. */
function probeWireless(d: HIDDevice): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      d.removeEventListener('inputreport', onReport)
      resolve(ok)
    }
    function onReport(ev: HIDInputReportEvent) {
      const data = new Uint8Array(
        ev.data.buffer,
        ev.data.byteOffset,
        ev.data.byteLength,
      )
      if (isWirelessReply(data, WirelessCmd.GET_DEVICE_INFO)) finish(true)
    }
    const timer = setTimeout(() => finish(false), WIRELESS_PROBE_TIMEOUT_MS)
    d.addEventListener('inputreport', onReport)
    d.sendReport(
      REPORT_ID,
      buildWirelessFrame(WirelessCmd.GET_DEVICE_INFO),
    ).catch(() => finish(false))
  })
}

/**
 * Pick and verify the dongle's control interface. The browser may expose both
 * 0xFF60 nodes (32- and 64-byte) or grant only the 64-byte one, so try every
 * granted interface of the dongle and keep the one that answers
 * GET_DEVICE_INFO. `includeGranted` adds previously granted dongle interfaces
 * (only when the user actually picked the dongle, so a wired selection never
 * silently connects to a plugged-in dongle instead).
 */
async function pickWireless(
  devices: HIDDevice[],
  includeGranted: boolean,
): Promise<HIDDevice | null> {
  let pool = devices.filter(isDongleNode)
  if (includeGranted) {
    try {
      const granted = await navigator.hid.getDevices()
      pool = [...new Set([...pool, ...granted.filter(isDongleNode)])]
    } catch {
      // getDevices() can fail without an active permission grant; `devices` will do.
    }
  }

  const rank = (d: HIDDevice) =>
    outputReportLength(d) === WIRELESS_REPORT_LENGTH ? 0 : 1

  for (const node of [...pool].sort((a, b) => rank(a) - rank(b))) {
    try {
      if (!node.opened) await node.open()
      if (await probeWireless(node)) return node
      await node.close()
    } catch {
      // Try the next interface.
    }
  }
  return null
}

/**
 * Prompt the user to pick the keyboard (wired or dongle), then open the
 * best control interface:
 *
 *  1. 0xFF13 — legacy wired interface (`0x04` feature reports)
 *  2. dongle   — 0xFF60 32-byte interface (2.4 GHz `wireless-protocol.ts`)
 *  3. 0xFF68 / 0xFF60 — vendor `0xAA` interface with a usable output report
 */
export async function connect(): Promise<HIDDevice> {
  if (!isWebHIDSupported()) {
    throw new Error(
      'WebHID is not available. Use a Chromium-based browser (Chrome/Edge) over HTTPS or localhost.',
    )
  }

  const devices = await navigator.hid.requestDevice({
    filters: PRODUCT_IDS.map((productId) => ({
      vendorId: VENDOR_ID,
      productId,
    })),
  })

  if (devices.length === 0) {
    throw new Error(
      'No Ajazz AK820 Pro selected. Pick the keyboard (USB) or its 2.4 GHz dongle in the browser dialog.',
    )
  }

  const legacy =
    devices.find((d) => usagePageOf(d) === LEGACY_USAGE_PAGE) ??
    devices.find(
      (d) =>
        d.collections.some(
          (c) => c.usagePage === CONTROL_USAGE_PAGE && c.usage === CONTROL_USAGE,
        ),
    )

  const donglePicked = devices.some(isDongleNode)
  const wireless = legacy ? null : await pickWireless(devices, donglePicked)

  if (!legacy && donglePicked && !wireless) {
    throw new Error(
      "The 2.4 GHz dongle didn't answer on its control interface. Unplug and replug the dongle, then click Connect and choose the other \u201c2.4G Dongle\u201d entry in the browser dialog (the one with 32-byte reports).",
    )
  }

  // Prefer the official 0xFF68 collection, then 0xFF60, and among equal
  // usage pages the largest output report.
  const score = (d: HIDDevice) => {
    const page = usagePageOf(d)
    const pref =
      page === 0xff68
        ? 3
        : (VENDOR_USAGE_PAGES as readonly number[]).includes(page)
          ? 2
          : 1
    return pref * 1000 + outputReportLength(d)
  }

  const vendor = devices
    .filter((d) => outputReportLength(d) >= 8)
    .sort((a, b) => score(b) - score(a))[0]

  const chosen = legacy ?? wireless ?? vendor
  if (!chosen) {
    throw new Error(
      'This device has no usable control interface. Connect the keyboard via USB-C, or plug in the 2.4 GHz dongle.',
    )
  }

  if (!chosen.opened) await chosen.open()
  device = chosen
  transport = legacy ? 'legacy' : wireless ? 'wireless' : 'vendor'
  reportLength = outputReportLength(chosen)
  return device
}

export async function disconnect(): Promise<void> {
  if (device?.opened) await device.close()
  device = null
  transport = 'legacy'
  reportLength = DEFAULT_REPORT_LENGTH
}

function requireDevice(): HIDDevice {
  if (!device?.opened) {
    throw new Error('Keyboard not connected. Click "Connect" first.')
  }
  return device
}

// --- Legacy transport (`0x04` feature reports, wired USB) ---

async function send(d: HIDDevice, payload: Uint8Array<ArrayBuffer>): Promise<void> {
  await d.sendFeatureReport(REPORT_ID, payload)
  await wait(USB_PROCESSING_MS)
}

/** Read-back handshake mirrors the reference tools; failure is non-fatal. */
async function handshake(d: HIDDevice): Promise<void> {
  try {
    await d.receiveFeatureReport(REPORT_ID)
  } catch {
    // Some firmware revisions don't answer the read; ignore as the native tools do.
  }
  await wait(USB_PROCESSING_MS)
}

// --- Vendor transport (`0xAA` output reports, 0xFF68 wired USB) ---

/**
 * Send one vendor frame and wait (briefly) for the matching input report.
 * The firmware acks commands with magic 0x55 + the same command byte;
 * missing acks are tolerated because some paths are fire-and-forget.
 */
async function sendVendor(
  d: HIDDevice,
  frame: Uint8Array<ArrayBuffer>,
  expectedCmd: number,
  timeoutMs = VENDOR_ACK_TIMEOUT_MS,
): Promise<void> {
  const ack = new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      d.removeEventListener('inputreport', onReport)
      resolve()
    }, timeoutMs)
    function onReport(ev: HIDInputReportEvent) {
      const data = new Uint8Array(
        ev.data.buffer,
        ev.data.byteOffset,
        ev.data.byteLength,
      )
      if (data[0] !== MAGIC_IN || data[1] !== expectedCmd) return
      clearTimeout(timer)
      d.removeEventListener('inputreport', onReport)
      resolve()
    }
    d.addEventListener('inputreport', onReport)
  })

  await d.sendReport(REPORT_ID, frame)
  await ack
  await wait(10)
}

/** True when the active interface supports clock + sleep commands. */
export function supportsClockAndSleep(): boolean {
  return transport !== 'vendor'
}

// --- Wireless transport (2.4 GHz dongle, 32-byte output reports) ---

/**
 * Send one dongle frame. The device acknowledges commands, but lighting is
 * fire-and-forget here: the UI stays responsive and a missing ack does not
 * mean the effect failed.
 */
async function sendWireless(
  d: HIDDevice,
  frame: Uint8Array<ArrayBuffer>,
): Promise<void> {
  await d.sendReport(REPORT_ID, frame)
  await wait(10)
}

// --- Public operations ---

/** Sync the keyboard's LCD clock to a given time (defaults to "now"). */
export async function syncTime(date: Date = new Date()): Promise<void> {
  const d = requireDevice()
  if (transport === 'wireless') {
    await sendWireless(
      d,
      buildWirelessFrame(
        WirelessCmd.SYNC_TIME,
        wirelessTimePayload(date),
        { reportLength },
      ),
    )
    return
  }
  if (transport !== 'legacy') {
    throw new Error(
      'Clock sync is not available on this wired interface yet.',
    )
  }
  await send(d, resetStatePacket())
  await send(d, configureTimePacket())
  await handshake(d)
  await send(d, timeDataPacket(date))
  await send(d, savePacket())
  await handshake(d)
}

/** Set the RGB lighting effect and its parameters. */
export async function setLightingMode(opts: LightingOptions): Promise<void> {
  const d = requireDevice()
  if (transport === 'wireless') {
    await sendWireless(
      d,
      buildWirelessFrame(
        WirelessCmd.SET_LED_EFFECT,
        wirelessLightingPayload(opts),
        { reportLength },
      ),
    )
    return
  }

  if (transport === 'vendor') {
    const frame = buildVendorFrame(
      VendorCmd.SET_LED_EFFECT,
      lightingEffectPayload(opts),
      { reportLength },
    )
    await sendVendor(d, frame, VendorCmd.SET_LED_EFFECT)
    return
  }

  await send(d, resetStatePacket())
  await send(d, configureLightingPacket())
  await handshake(d)
  await send(d, lightingDataPacket(opts))
  await send(d, savePacket())
  await handshake(d)
}

/** Set the auto-sleep timeout (see `SleepTimers`). */
export async function setSleepTimer(timer: number): Promise<void> {
  const d = requireDevice()
  if (transport === 'wireless') {
    await sendWireless(
      d,
      buildWirelessFrame(
        WirelessCmd.SET_SLEEP,
        wirelessSleepPayload(timer),
        { reportLength },
      ),
    )
    return
  }
  if (transport !== 'legacy') {
    throw new Error(
      'The sleep timer is not available on this wired interface yet.',
    )
  }
  await send(d, resetStatePacket())
  await send(d, configureSleepPacket())
  await handshake(d)
  await send(d, sleepDataPacket(timer))
  await send(d, savePacket())
  await handshake(d)
}
