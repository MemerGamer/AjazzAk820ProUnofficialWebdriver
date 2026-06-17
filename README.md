# Ajazz AK820 Pro — Unofficial WebHID Configurator

A browser-based configurator for the **Ajazz AK820 Pro** mechanical keyboard,
built because the official software is Windows-only. It talks to the keyboard
directly from the browser via the [WebHID API](https://developer.mozilla.org/docs/Web/API/WebHID_API)
— no native driver or install required.

> ⚠️ **Unofficial.** Not affiliated with Ajazz or Epomaker. Use at your own risk.

## Features

- **Clock sync** — push your computer's date/time to the keyboard's LCD (with
  optional hourly auto-resync).
- **RGB lighting** — pick from the 20 onboard effects and tune colour,
  brightness, speed, direction, and rainbow mode.
- **Auto-sleep** — set the display/lighting sleep timeout (Never / 1 / 5 / 30 min).

## Requirements

- A **Chromium-based browser** (Chrome, Edge, Brave, …). WebHID is **not**
  available in Firefox or Safari.
- A **secure context**: the deployed HTTPS site, or `http://localhost` in dev.
- The keyboard connected via **USB-C (wired)**. Configuration over the 2.4GHz
  dongle / Bluetooth is **not supported** — switch the keyboard to wired mode to
  change settings (you can still type wirelessly the rest of the time).

### Linux permissions (udev)

If the connect dialog shows the keyboard but it fails to open, your user
probably lacks permission for the raw HID node. Create a udev rule:

```
# /etc/udev/rules.d/99-ajazz-ak820pro.rules
KERNEL=="hidraw*", ATTRS{idVendor}=="0c45", ATTRS{idProduct}=="8009", MODE="0660", GROUP="input", TAG+="uaccess"
```

Then reload and replug:

```sh
sudo udevadm control --reload-rules && sudo udevadm trigger
```

## Development

Uses **Node 26** (pinned via [`fnm`](https://github.com/Schniz/fnm) /
`.node-version`) and **TanStack Start** + **Tailwind CSS**.

```sh
fnm use            # picks up .node-version (Node 26)
npm install
npm run dev        # http://localhost:3000
```

Open the dev URL in Chrome/Chromium, plug the keyboard in via USB-C, click
**Connect**, and approve the device prompt.

## Build & deploy (Netlify)

```sh
npm run build      # outputs dist/client + a Netlify SSR function
```

`netlify.toml` is preconfigured (`vite build` → publish `dist/client`). Push to
GitHub and connect the repo on Netlify; it reads `.node-version` for Node 26.

## How it works

All control traffic is sent as 64-byte **unnumbered HID feature reports**
(report ID `0x00`) to the keyboard's vendor control collection
(`usagePage 0xFF13`, interface 3). Each setting is applied as a short sequence:
`reset → configure → (read-back) → data → save → (read-back)`.

- `src/lib/protocol.ts` — pure packet builders (no DOM).
- `src/lib/device.ts` — WebHID connect + high-level `syncTime` / `setLightingMode`
  / `setSleepTimer`.
- `src/components/Configurator.tsx` — the UI.

### Not implemented

- **Custom LCD images** — the image-upload byte format isn't publicly decoded,
  and reverse-engineering it would require capturing the Windows software's USB
  traffic. The LCD clock still works via clock sync.
- **Key remapping / macros** — not yet decoded for this model.
- **Dongle/Bluetooth configuration** — wired USB-C only.

## Credits

Protocol reverse-engineering builds on prior community work:

- [gohv/EPOMAKER-Ajazz-AK820-Pro](https://github.com/gohv/EPOMAKER-Ajazz-AK820-Pro)
  (Rust) — lighting / time / sleep byte layouts.
- [KyleBoyer/TFTTimeSync-node](https://github.com/KyleBoyer/TFTTimeSync-node)
  (Node.js) — verified command sequences.
- [TaxMachine/ajazz-keyboard-software-linux](https://github.com/TaxMachine/ajazz-keyboard-software-linux)
  and [fpb/ajazz-ak820-pro](https://github.com/fpb/ajazz-ak820-pro) — hardware
  and protocol notes.
