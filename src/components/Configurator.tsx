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
import { EFFECT_DESCRIPTIONS } from '../lib/effects'
import {
  useLighting,
  useSleepTimer,
  type LightingState,
} from '../lib/use-lighting'
import { KeyboardPreview } from './KeyboardPreview'

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
  const [now, setNow] = useState(() => new Date())

  const { lighting, setLighting } = useLighting()
  const [sleep, setSleep] = useSleepTimer()

  // WebHID is browser-only; check after mount to stay SSR-safe.
  useEffect(() => {
    setSupported(isWebHIDSupported())
  }, [])

  // Shared clock tick for the preview's TFT and the Clock tab.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
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
      <header className="mb-6 flex items-center gap-3">
        <Keyboard className="h-8 w-8 text-indigo-400" />
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Ajazz AK820 Pro</h1>
          <p className="text-sm text-slate-400">
            Unofficial WebHID configurator
          </p>
        </div>
      </header>

      {!supported && <UnsupportedNotice />}

      <KeyboardPreview lighting={lighting} now={now} />
      <EffectSummary lighting={lighting} />

      <div className="mt-6">
        <ConnectionBar
          supported={supported}
          connected={connected}
          deviceName={deviceName}
          busy={busy}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
        />
      </div>

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
        {tab === 'clock' && (
          <ClockPanel disabled={!connected || busy} run={run} now={now} />
        )}
        {tab === 'lighting' && (
          <LightingPanel
            disabled={!connected || busy}
            run={run}
            lighting={lighting}
            setLighting={setLighting}
          />
        )}
        {tab === 'sleep' && (
          <SleepPanel
            disabled={!connected || busy}
            run={run}
            value={sleep}
            onChange={setSleep}
          />
        )}
      </section>

      <StatusLine status={status} />

      <p className="mt-6 text-center text-xs text-slate-500">
        Connect the keyboard via USB-C (not the 2.4GHz dongle). Requires a
        Chromium-based browser. The preview shows what will be sent — the
        keyboard can&apos;t report its own state back.
      </p>
    </div>
  )
}

function EffectSummary({ lighting }: { lighting: LightingState }) {
  return (
    <div className="mt-3 text-center">
      <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-slate-300">
        <span className="font-semibold text-slate-100">{lighting.mode}</span>
        <span className="text-slate-600">·</span>
        {lighting.rainbow ? (
          <span>rainbow</span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            colour
            <span
              className="inline-block h-3 w-3 rounded-full border border-slate-600"
              style={{ background: lighting.color }}
            />
          </span>
        )}
        <span className="text-slate-600">·</span>
        <span>brightness {lighting.brightness}/5</span>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {EFFECT_DESCRIPTIONS[lighting.mode]}
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

type RunFn = (message: string, fn: () => Promise<void>) => Promise<void>

function ClockPanel({
  disabled,
  run,
  now,
}: {
  disabled: boolean
  run: RunFn
  now: Date
}) {
  const [auto, setAuto] = useState(false)
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
        <div
          className="font-mono text-2xl text-slate-100"
          suppressHydrationWarning
        >
          {now.toLocaleTimeString()}
        </div>
        <div className="text-sm text-slate-400" suppressHydrationWarning>
          {now.toLocaleDateString()}
        </div>
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

function LightingPanel({
  disabled,
  run,
  lighting,
  setLighting,
}: {
  disabled: boolean
  run: RunFn
  lighting: LightingState
  setLighting: (next: Partial<LightingState>) => void
}) {
  function apply() {
    const [r, g, b] = hexToRgb(lighting.color)
    return run('Applying lighting', () =>
      setLightingMode({
        mode: LightingModes[lighting.mode],
        r,
        g,
        b,
        rainbow: lighting.rainbow,
        brightness: lighting.brightness,
        speed: lighting.speed,
        direction: Directions[lighting.direction],
      }),
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">RGB lighting</h2>
        <p className="mt-1 text-sm text-slate-400">
          Choose an effect and tune its colour and motion. The preview above
          updates instantly; click Apply to send it to the keyboard.
        </p>
      </div>

      <Field label="Effect">
        <select
          value={lighting.mode}
          onChange={(e) =>
            setLighting({ mode: e.target.value as LightingModeName })
          }
          className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100"
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
            value={lighting.color}
            disabled={lighting.rainbow}
            onChange={(e) => setLighting({ color: e.target.value })}
            className="h-10 w-20 cursor-pointer rounded border border-slate-600 bg-slate-900 disabled:opacity-40"
          />
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={lighting.rainbow}
            onChange={(e) => setLighting({ rainbow: e.target.checked })}
            className="h-4 w-4 rounded border-slate-600 bg-slate-800 accent-indigo-500"
          />
          Rainbow
        </label>
      </div>

      <Slider
        label="Brightness"
        value={lighting.brightness}
        max={5}
        onChange={(brightness) => setLighting({ brightness })}
      />
      <Slider
        label="Speed"
        value={lighting.speed}
        max={5}
        onChange={(speed) => setLighting({ speed })}
      />

      <Field label="Direction">
        <select
          value={lighting.direction}
          onChange={(e) =>
            setLighting({ direction: e.target.value as DirectionName })
          }
          className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100"
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

function SleepPanel({
  disabled,
  run,
  value,
  onChange,
}: {
  disabled: boolean
  run: RunFn
  value: SleepTimerName
  onChange: (next: SleepTimerName) => void
}) {
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
              checked={value === name}
              onChange={() => onChange(name)}
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
          run('Setting sleep timer', () => setSleepTimer(SleepTimers[value]))
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
  onChange,
}: {
  label: string
  value: number
  max: number
  onChange: (n: number) => void
}) {
  return (
    <Field label={`${label}: ${value}`}>
      <input
        type="range"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-indigo-500"
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
