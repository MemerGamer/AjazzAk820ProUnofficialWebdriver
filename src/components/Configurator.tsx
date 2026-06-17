import { useEffect, useRef, useState } from 'react'
import {
  Clock,
  Keyboard,
  Lightbulb,
  Moon,
  Plug,
  PlugZap,
  RefreshCw,
} from 'lucide-react'
import {
  connect,
  disconnect,
  isWebHIDSupported,
  setLightingMode,
  setSleepTimer,
  syncTime,
} from '../lib/device'
import {
  Directions,
  LightingModes,
  SleepTimers,
  hexToRgb,
  type DirectionName,
  type LightingModeName,
  type SleepTimerName,
} from '../lib/protocol'

type TabId = 'clock' | 'lighting' | 'sleep'
type Status = { kind: 'idle' | 'busy' | 'ok' | 'error'; message: string }

const TABS: { id: TabId; label: string; icon: typeof Clock }[] = [
  { id: 'clock', label: 'Clock', icon: Clock },
  { id: 'lighting', label: 'Lighting', icon: Lightbulb },
  { id: 'sleep', label: 'Sleep', icon: Moon },
]

export function Configurator() {
  const [supported, setSupported] = useState(true)
  const [connected, setConnected] = useState(false)
  const [deviceName, setDeviceName] = useState('')
  const [tab, setTab] = useState<TabId>('clock')
  const [status, setStatus] = useState<Status>({ kind: 'idle', message: '' })

  // WebHID is browser-only; check after mount to stay SSR-safe.
  useEffect(() => {
    setSupported(isWebHIDSupported())
  }, [])

  const busy = status.kind === 'busy'

  async function run(message: string, fn: () => Promise<void>) {
    setStatus({ kind: 'busy', message })
    try {
      await fn()
      setStatus({ kind: 'ok', message: `${message} — done.` })
    } catch (err) {
      setStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  async function handleConnect() {
    await run('Connecting', async () => {
      const dev = await connect()
      setConnected(true)
      setDeviceName(dev.productName || 'Ajazz AK820 Pro')
    })
  }

  async function handleDisconnect() {
    await disconnect()
    setConnected(false)
    setDeviceName('')
    setStatus({ kind: 'idle', message: '' })
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <header className="mb-8 flex items-center gap-3">
        <Keyboard className="h-8 w-8 text-indigo-400" />
        <div>
          <h1 className="text-2xl font-bold text-slate-100">
            Ajazz AK820 Pro
          </h1>
          <p className="text-sm text-slate-400">
            Unofficial WebHID configurator
          </p>
        </div>
      </header>

      {!supported && <UnsupportedNotice />}

      <ConnectionBar
        supported={supported}
        connected={connected}
        deviceName={deviceName}
        busy={busy}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
      />

      <nav className="mt-6 flex gap-1 rounded-lg bg-slate-800/60 p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition ${
              tab === id
                ? 'bg-indigo-500 text-white'
                : 'text-slate-300 hover:bg-slate-700/60'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>

      <section className="mt-4 rounded-xl border border-slate-700 bg-slate-800/40 p-6">
        {tab === 'clock' && <ClockPanel disabled={!connected || busy} run={run} />}
        {tab === 'lighting' && (
          <LightingPanel disabled={!connected || busy} run={run} />
        )}
        {tab === 'sleep' && <SleepPanel disabled={!connected || busy} run={run} />}
      </section>

      <StatusLine status={status} />

      <p className="mt-6 text-center text-xs text-slate-500">
        Connect the keyboard via USB-C (not the 2.4GHz dongle). Requires a
        Chromium-based browser.
      </p>
    </div>
  )
}

function UnsupportedNotice() {
  return (
    <div className="mb-6 rounded-lg border border-amber-600/50 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">
      Your browser doesn&apos;t support WebHID. Use Chrome, Edge, or another
      Chromium-based browser over HTTPS or localhost.
    </div>
  )
}

function ConnectionBar({
  supported,
  connected,
  deviceName,
  busy,
  onConnect,
  onDisconnect,
}: {
  supported: boolean
  connected: boolean
  deviceName: string
  busy: boolean
  onConnect: () => void
  onDisconnect: () => void
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/40 px-4 py-3">
      <div className="flex items-center gap-2 text-sm">
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            connected ? 'bg-emerald-400' : 'bg-slate-500'
          }`}
        />
        <span className="text-slate-300">
          {connected ? deviceName : 'Not connected'}
        </span>
      </div>
      {connected ? (
        <button
          type="button"
          onClick={onDisconnect}
          disabled={busy}
          className="flex items-center gap-2 rounded-md bg-slate-700 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-slate-600 disabled:opacity-50"
        >
          <Plug className="h-4 w-4" />
          Disconnect
        </button>
      ) : (
        <button
          type="button"
          onClick={onConnect}
          disabled={!supported || busy}
          className="flex items-center gap-2 rounded-md bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:opacity-50"
        >
          <PlugZap className="h-4 w-4" />
          Connect
        </button>
      )}
    </div>
  )
}

type PanelProps = {
  disabled: boolean
  run: (message: string, fn: () => Promise<void>) => Promise<void>
}

function ClockPanel({ disabled, run }: PanelProps) {
  const [now, setNow] = useState(() => new Date())
  const [auto, setAuto] = useState(false)
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Re-sync hourly while "auto" is on (the LCD clock drifts over time).
  useEffect(() => {
    if (!auto || disabled) return
    autoRef.current = setInterval(
      () => run('Auto-syncing clock', () => syncTime()),
      60 * 60 * 1000,
    )
    return () => {
      if (autoRef.current) clearInterval(autoRef.current)
    }
  }, [auto, disabled, run])

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">Clock sync</h2>
        <p className="mt-1 text-sm text-slate-400">
          Push your computer&apos;s current date and time to the keyboard&apos;s
          LCD.
        </p>
      </div>

      <div className="rounded-lg bg-slate-900/60 px-4 py-3 text-center">
        <div className="font-mono text-2xl text-slate-100">
          {now.toLocaleTimeString()}
        </div>
        <div className="text-sm text-slate-400">{now.toLocaleDateString()}</div>
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={() => run('Syncing clock', () => syncTime())}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-indigo-500 px-4 py-3 font-medium text-white transition hover:bg-indigo-400 disabled:opacity-50"
      >
        <RefreshCw className="h-4 w-4" />
        Sync to system time
      </button>

      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={auto}
          disabled={disabled}
          onChange={(e) => setAuto(e.target.checked)}
          className="h-4 w-4 rounded border-slate-600 bg-slate-800 accent-indigo-500"
        />
        Re-sync automatically every hour
      </label>
    </div>
  )
}

function LightingPanel({ disabled, run }: PanelProps) {
  const [mode, setMode] = useState<LightingModeName>('Spectrum')
  const [color, setColor] = useState('#6366f1')
  const [rainbow, setRainbow] = useState(true)
  const [brightness, setBrightness] = useState(5)
  const [speed, setSpeed] = useState(3)
  const [direction, setDirection] = useState<DirectionName>('Right')

  function apply() {
    const [r, g, b] = hexToRgb(color)
    return run('Applying lighting', () =>
      setLightingMode({
        mode: LightingModes[mode],
        r,
        g,
        b,
        rainbow,
        brightness,
        speed,
        direction: Directions[direction],
      }),
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">RGB lighting</h2>
        <p className="mt-1 text-sm text-slate-400">
          Choose an effect and tune its colour and motion.
        </p>
      </div>

      <Field label="Effect">
        <select
          value={mode}
          disabled={disabled}
          onChange={(e) => setMode(e.target.value as LightingModeName)}
          className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 disabled:opacity-50"
        >
          {Object.keys(LightingModes).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </Field>

      <div className="flex items-center justify-between gap-4">
        <Field label="Colour">
          <input
            type="color"
            value={color}
            disabled={disabled || rainbow}
            onChange={(e) => setColor(e.target.value)}
            className="h-10 w-20 cursor-pointer rounded border border-slate-600 bg-slate-900 disabled:opacity-40"
          />
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={rainbow}
            disabled={disabled}
            onChange={(e) => setRainbow(e.target.checked)}
            className="h-4 w-4 rounded border-slate-600 bg-slate-800 accent-indigo-500"
          />
          Rainbow
        </label>
      </div>

      <Slider
        label="Brightness"
        value={brightness}
        max={5}
        disabled={disabled}
        onChange={setBrightness}
      />
      <Slider
        label="Speed"
        value={speed}
        max={5}
        disabled={disabled}
        onChange={setSpeed}
      />

      <Field label="Direction">
        <select
          value={direction}
          disabled={disabled}
          onChange={(e) => setDirection(e.target.value as DirectionName)}
          className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 disabled:opacity-50"
        >
          {Object.keys(Directions).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </Field>

      <button
        type="button"
        disabled={disabled}
        onClick={apply}
        className="w-full rounded-md bg-indigo-500 px-4 py-3 font-medium text-white transition hover:bg-indigo-400 disabled:opacity-50"
      >
        Apply lighting
      </button>
    </div>
  )
}

function SleepPanel({ disabled, run }: PanelProps) {
  const [timer, setTimer] = useState<SleepTimerName>('5 minutes')

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">Auto-sleep</h2>
        <p className="mt-1 text-sm text-slate-400">
          How long the keyboard waits before turning off the display/lighting.
        </p>
      </div>

      <div className="space-y-2">
        {(Object.keys(SleepTimers) as SleepTimerName[]).map((name) => (
          <label
            key={name}
            className="flex items-center gap-3 rounded-md border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-200"
          >
            <input
              type="radio"
              name="sleep-timer"
              checked={timer === name}
              disabled={disabled}
              onChange={() => setTimer(name)}
              className="h-4 w-4 accent-indigo-500"
            />
            {name}
          </label>
        ))}
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          run('Setting sleep timer', () => setSleepTimer(SleepTimers[timer]))
        }
        className="w-full rounded-md bg-indigo-500 px-4 py-3 font-medium text-white transition hover:bg-indigo-400 disabled:opacity-50"
      >
        Apply sleep timer
      </button>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-300">
        {label}
      </span>
      {children}
    </label>
  )
}

function Slider({
  label,
  value,
  max,
  disabled,
  onChange,
}: {
  label: string
  value: number
  max: number
  disabled: boolean
  onChange: (n: number) => void
}) {
  return (
    <Field label={`${label}: ${value}`}>
      <input
        type="range"
        min={0}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-indigo-500 disabled:opacity-50"
      />
    </Field>
  )
}

function StatusLine({ status }: { status: Status }) {
  if (status.kind === 'idle') return null
  const colour = {
    busy: 'text-slate-300',
    ok: 'text-emerald-400',
    error: 'text-red-400',
    idle: '',
  }[status.kind]
  return (
    <p className={`mt-4 flex items-center justify-center gap-2 text-sm ${colour}`}>
      {status.kind === 'busy' && <RefreshCw className="h-4 w-4 animate-spin" />}
      {status.message}
    </p>
  )
}
