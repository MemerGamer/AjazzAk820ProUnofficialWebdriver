/**
 * WebHID connection layer for the Ajazz AK820 Pro.
 *
 * Everything here touches `navigator.hid`, so it must only run in the browser
 * (inside event handlers / effects) — never during SSR. Use `isWebHIDSupported`
 * to guard. WebHID requires a Chromium-based browser and a secure context
 * (HTTPS or http://localhost).
 */

import {
  CONTROL_USAGE,
  CONTROL_USAGE_PAGE,
  PRODUCT_ID,
  VENDOR_ID,
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

/** Unnumbered HID feature reports — report ID is always 0. */
const REPORT_ID = 0x00
/** The reference tools pace control traffic by ~40ms between reports. */
const USB_PROCESSING_MS = 40

let device: HIDDevice | null = null

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const isWebHIDSupported = () =>
  typeof navigator !== 'undefined' && 'hid' in navigator

export const getDevice = () => device
export const isConnected = () => !!device?.opened

/**
 * Prompt the user to pick the keyboard, then open the vendor control
 * interface. `requestDevice` can return one `HIDDevice` per HID interface, so
 * we select the one exposing the vendor control collection (interface 3).
 */
export async function connect(): Promise<HIDDevice> {
  if (!isWebHIDSupported()) {
    throw new Error(
      'WebHID is not available. Use a Chromium-based browser (Chrome/Edge) over HTTPS or localhost.',
    )
  }

  const devices = await navigator.hid.requestDevice({
    filters: [{ vendorId: VENDOR_ID, productId: PRODUCT_ID }],
  })

  const chosen =
    devices.find((d) =>
      d.collections.some(
        (c) => c.usagePage === CONTROL_USAGE_PAGE && c.usage === CONTROL_USAGE,
      ),
    ) ?? devices[0]

  if (!chosen) {
    throw new Error(
      'No Ajazz AK820 Pro selected. Connect it via USB-C (not the 2.4GHz dongle) and try again.',
    )
  }

  if (!chosen.opened) await chosen.open()
  device = chosen
  return device
}

export async function disconnect(): Promise<void> {
  if (device?.opened) await device.close()
  device = null
}

function requireDevice(): HIDDevice {
  if (!device?.opened) {
    throw new Error('Keyboard not connected. Click "Connect" first.')
  }
  return device
}

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

/** Sync the keyboard's LCD clock to a given time (defaults to "now"). */
export async function syncTime(date: Date = new Date()): Promise<void> {
  const d = requireDevice()
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
  await send(d, resetStatePacket())
  await send(d, configureSleepPacket())
  await handshake(d)
  await send(d, sleepDataPacket(timer))
  await send(d, savePacket())
  await handshake(d)
}
