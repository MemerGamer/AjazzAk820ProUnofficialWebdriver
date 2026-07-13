import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Crosshair, Download, RotateCcw } from 'lucide-react'
import {
  KEY_RECTS,
  LED_RECTS,
  PANEL_IDS,
  PANEL_RECTS,
  getKeys,
  type LayoutKey,
  type PanelId,
  type Rect,
} from '../lib/keyboard-layout'
import {
  MODE_EFFECT,
  colorForKey,
  type ActivePress,
  type EffectParams,
} from '../lib/effects'
import { Directions, hexToRgb } from '../lib/protocol'
import type { LightingState } from '../lib/use-lighting'

const KEYS: LayoutKey[] = getKeys()
const KEY_POS = KEYS.map((k) => ({ x: k.x, y: k.y, id: k.id }))

const LED_IDS = ['ledC', 'ledW', 'ledB'] as const
type LedId = (typeof LED_IDS)[number]

const round = (n: number) => Math.round(n * 100) / 100
const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n))

interface KeyboardPreviewProps {
  lighting: LightingState
  now: Date
}

export function KeyboardPreview({ lighting, now }: KeyboardPreviewProps) {
  const keyEls = useRef<Array<HTMLButtonElement | null>>([])
  const containerRef = useRef<HTMLDivElement | null>(null)
  const lightingRef = useRef(lighting)
  const active = useRef<ActivePress[]>([])
  const startRef = useRef<number>(0)

  const [calibrating, setCalibrating] = useState(false)
  const [refOpacity, setRefOpacity] = useState(0.7)
  const [overrides, setOverrides] = useState<Record<string, Rect>>({})
  const dragState = useRef<{
    id: string
    kind: 'move' | 'resize'
    startX: number
    startY: number
    startRect: Rect
  } | null>(null)

  useEffect(() => {
    lightingRef.current = lighting
  }, [lighting])

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    let raf = 0
    startRef.current = performance.now()

    const paint = (t: number) => {
      const l = lightingRef.current
      const params: EffectParams = {
        baseColor: hexToRgb(l.color),
        rainbow: l.rainbow,
        brightness: l.brightness,
        speed: l.speed,
        direction: Directions[l.direction],
        t,
        active: active.current,
      }
      const archetype = MODE_EFFECT[l.mode]
      for (let i = 0; i < KEY_POS.length; i++) {
        const el = keyEls.current[i]
        if (!el) continue
        const [r, g, b] = colorForKey(archetype, KEY_POS[i], params)
        el.style.background = `rgba(${r},${g},${b},0.55)`
        const glow = (r + g + b) / 765
        el.style.boxShadow =
          glow > 0.05
            ? `0 0 calc(var(--u) * ${(glow * 0.5).toFixed(2)}) rgba(${r},${g},${b},0.7)`
            : 'none'
      }
    }

    if (reduce) {
      paint(0)
      return
    }

    const loop = () => {
      const tNow = (performance.now() - startRef.current) / 1000
      if (active.current.length) {
        active.current = active.current.filter((a) => tNow - a.t < 1.5)
      }
      paint(tNow)
      raf = requestAnimationFrame(loop)
    }

    const onVisibility = () => {
      cancelAnimationFrame(raf)
      if (!document.hidden) {
        startRef.current = performance.now()
        raf = requestAnimationFrame(loop)
      }
    }

    raf = requestAnimationFrame(loop)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  const press = (key: LayoutKey) => {
    const t = (performance.now() - startRef.current) / 1000
    active.current.push({ x: key.x, y: key.y, t })
  }

  const rectFor = (id: string): Rect | undefined => {
    if (overrides[id]) return overrides[id]
    if (id.startsWith('k')) return KEY_RECTS[Number(id.slice(1))]
    if (id.startsWith('p:')) return PANEL_RECTS[id.slice(2) as PanelId]
    if (id.startsWith('l:')) return LED_RECTS[id.slice(2) as LedId]
    return undefined
  }

  const toggleCalibrating = () => setCalibrating((v) => !v)

  const onDragMove = (e: PointerEvent) => {
    const drag = dragState.current
    const container = containerRef.current
    if (!drag || !container) return
    const c = container.getBoundingClientRect()
    const dxPct = ((e.clientX - drag.startX) / c.width) * 100
    const dyPct = ((e.clientY - drag.startY) / c.height) * 100
    const base = drag.startRect
    const rect: Rect =
      drag.kind === 'move'
        ? {
            ...base,
            x: clamp(base.x + dxPct, -10, 100),
            y: clamp(base.y + dyPct, -10, 100),
          }
        : {
            ...base,
            w: clamp(base.w + dxPct, 1, 100),
            h: clamp(base.h + dyPct, 1, 100),
          }
    setOverrides((prev) => ({ ...prev, [drag.id]: rect }))
  }

  const endDrag = () => {
    dragState.current = null
    window.removeEventListener('pointermove', onDragMove)
    window.removeEventListener('pointerup', endDrag)
  }

  const beginDrag =
    (id: string, kind: 'move' | 'resize') => (e: ReactPointerEvent) => {
      if (!calibrating) return
      e.stopPropagation()
      e.preventDefault()
      const rect = rectFor(id)
      if (!rect) return
      dragState.current = {
        id,
        kind,
        startX: e.clientX,
        startY: e.clientY,
        startRect: rect,
      }
      window.addEventListener('pointermove', onDragMove)
      window.addEventListener('pointerup', endDrag)
    }

  const nudge = (id: string) => (e: ReactKeyboardEvent) => {
    if (!calibrating) return
    const rect = rectFor(id)
    if (!rect) return
    const step = e.shiftKey ? 1 : 0.15
    let { x, y } = rect
    if (e.key === 'ArrowLeft') x -= step
    else if (e.key === 'ArrowRight') x += step
    else if (e.key === 'ArrowUp') y -= step
    else if (e.key === 'ArrowDown') y += step
    else return
    e.preventDefault()
    setOverrides((prev) => ({ ...prev, [id]: { ...rect, x, y } }))
  }

  const resetCalibration = () => setOverrides({})

  const exportRects = () => {
    const keyRects: Record<number, Rect> = {}
    KEYS.forEach((k) => {
      const r = rectFor(`k${k.id}`)
      if (r) keyRects[k.id] = { x: round(r.x), y: round(r.y), w: round(r.w), h: round(r.h) }
    })
    const panelRects: Partial<Record<PanelId, Rect>> = {}
    PANEL_IDS.forEach((pid) => {
      const r = rectFor(`p:${pid}`)
      if (r) panelRects[pid] = { x: round(r.x), y: round(r.y), w: round(r.w), h: round(r.h) }
    })
    const ledRects: Partial<Record<LedId, Rect>> = {}
    LED_IDS.forEach((lid) => {
      const r = rectFor(`l:${lid}`)
      if (r) ledRects[lid] = { x: round(r.x), y: round(r.y), w: round(r.w), h: round(r.h) }
    })
    const code = `// Percent-of-container rects captured from the calibration overlay.\nexport const KEY_RECTS: Record<number, Rect> = ${JSON.stringify(keyRects, null, 2)}\n\nexport const PANEL_RECTS: Partial<Record<PanelId, Rect>> = ${JSON.stringify(panelRects, null, 2)}\n\nexport const LED_RECTS = ${JSON.stringify(ledRects, null, 2)}\n`
    navigator.clipboard?.writeText(code).catch(() => {})
    console.log(code)
    window.prompt('Layout rects (also copied to clipboard):', code)
  }

  const rectStyle = (r: Rect | undefined): CSSProperties => {
    if (!r) return { display: 'none' }
    return {
      position: 'absolute',
      left: `${r.x}%`,
      top: `${r.y}%`,
      width: `${r.w}%`,
      height: `${r.h}%`,
    }
  }

  const outline = calibrating
    ? '1px dashed rgba(99,102,241,0.6)'
    : undefined

  const ResizeHandle = ({ id }: { id: string }) => (
    <div
      onPointerDown={beginDrag(id, 'resize')}
      className="absolute -bottom-1 -right-1 h-2.5 w-2.5 cursor-nwse-resize rounded-sm bg-indigo-400"
    />
  )

  return (
    <div className="w-full">
      {/* Toolbar lives outside the photo so it never occludes the board
          (the knob especially sits right in the top-right corner). */}
      <div className="mb-2 flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900 p-2 text-slate-300">
        <button
          type="button"
          onClick={toggleCalibrating}
          title="Toggle calibration overlay"
          className={`flex items-center gap-1 rounded p-1 text-xs ${calibrating ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <Crosshair size={14} /> Calibrate
        </button>
        {calibrating && (
          <>
            <span className="ml-2 text-xs">Ref photo opacity</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={refOpacity}
              onChange={(e) => setRefOpacity(Number(e.target.value))}
              className="h-1 w-24 accent-indigo-400"
            />
            <button
              type="button"
              onClick={exportRects}
              title="Export rects (copies JSON to clipboard)"
              className="ml-auto flex items-center gap-1 rounded p-1 text-xs text-slate-400 hover:text-slate-200"
            >
              <Download size={14} /> Export
            </button>
            <button
              type="button"
              onClick={resetCalibration}
              title="Reset calibration"
              className="flex items-center gap-1 rounded p-1 text-xs text-slate-400 hover:text-slate-200"
            >
              <RotateCcw size={14} /> Reset
            </button>
          </>
        )}
      </div>

      {/* The reference photo anchors the container to its 894:375 aspect ratio
          so percent-based rects line up with the calibrated pixel positions. */}
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-2xl border border-slate-700"
        style={{
          aspectRatio: `${IMG_W} / ${IMG_H}`,
          containerType: 'inline-size',
          ['--u' as string]: '5.1cqw',
        }}
      >
        <img
          src="/keyboard-ref.jpg"
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
          style={{ opacity: calibrating ? refOpacity : 0 }}
        />

        <div
          className="absolute inset-0"
          style={{ background: calibrating ? 'transparent' : 'rgba(15,23,42,0.8)' }}
        >
          {KEYS.map((k) => {
            const id = `k${k.id}`
            const r = rectFor(id)
            return (
              <button
                key={id}
                type="button"
                ref={(el) => { keyEls.current[k.id] = el }}
                onPointerDown={(e) => {
                  if (calibrating) {
                    beginDrag(id, 'move')(e)
                    return
                  }
                  press(k)
                }}
                onPointerEnter={(e) => {
                  if (!calibrating && e.buttons > 0) press(k)
                }}
                onKeyDown={nudge(id)}
                tabIndex={calibrating ? 0 : -1}
                className="flex items-end justify-center overflow-hidden rounded-[3px] bg-slate-800 text-slate-900/70 select-none"
                style={{
                  ...rectStyle(r),
                  fontSize: 'calc(var(--u) * 0.32)',
                  lineHeight: 1,
                  outline,
                }}
                title={k.label}
              >
                <span className="pointer-events-none truncate px-[1px] pb-[1px] font-medium mix-blend-overlay">
                  {k.label}
                </span>
                {calibrating && <ResizeHandle id={id} />}
              </button>
            )
          })}

          <div
            style={{ ...rectStyle(rectFor('p:knob')), overflow: 'visible', outline }}
            onPointerDown={beginDrag('p:knob', 'move')}
            onKeyDown={nudge('p:knob')}
            tabIndex={calibrating ? 0 : -1}
          >
            <Knob />
            {calibrating && <ResizeHandle id="p:knob" />}
          </div>

          {(
            [
              { led: 'ledC', nav: 'home', label: 'Home' },
              { led: 'ledW', nav: 'pgup', label: 'PgUp' },
              { led: 'ledB', nav: 'pgdn', label: 'PgDn' },
            ] as const
          ).map(({ led, nav, label }) => (
            <div key={nav}>
              <div
                style={{ ...rectStyle(rectFor(`p:${nav}`)), outline }}
                onPointerDown={beginDrag(`p:${nav}`, 'move')}
                onKeyDown={nudge(`p:${nav}`)}
                tabIndex={calibrating ? 0 : -1}
              >
                <NavKey label={label} />
                {calibrating && <ResizeHandle id={`p:${nav}`} />}
              </div>
              <div
                style={{
                  ...rectStyle(rectFor(`l:${led}`)),
                  outline: calibrating
                    ? '1px dashed rgba(56,189,248,0.8)'
                    : undefined,
                }}
                onPointerDown={beginDrag(`l:${led}`, 'move')}
                onKeyDown={nudge(`l:${led}`)}
                tabIndex={calibrating ? 0 : -1}
              >
                <ConnectionLed />
                {calibrating && <ResizeHandle id={`l:${led}`} />}
              </div>
            </div>
          ))}

          <div
            style={{ ...rectStyle(rectFor('p:tft')), outline }}
            onPointerDown={beginDrag('p:tft', 'move')}
            onKeyDown={nudge('p:tft')}
            tabIndex={calibrating ? 0 : -1}
          >
            <TftScreen now={now} />
            {calibrating && <ResizeHandle id="p:tft" />}
          </div>
        </div>
      </div>
    </div>
  )
}

// Photo dimensions — used to set the container aspect ratio so rects
// (percent of container) line up with the calibrated photo positions.
const IMG_W = 894
const IMG_H = 375

// ─── right-panel sub-components ─────────────────────────────────────────────

function NavKey({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full items-end justify-center overflow-hidden rounded-[3px] bg-slate-800 text-slate-500 select-none">
      <span
        className="pb-[1px] font-medium"
        style={{ fontSize: 'calc(var(--u) * 0.3)', lineHeight: 1 }}
      >
        {label}
      </span>
    </div>
  )
}

function ConnectionLed() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <span className="inline-block h-[4px] w-[4px] rounded-full bg-slate-500" />
    </div>
  )
}

function TftScreen({ now }: { now: Date }) {
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  const weekday = now.toLocaleDateString(undefined, { weekday: 'short' })
  const date = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(
    now.getDate(),
  ).padStart(2, '0')}`

  return (
    <div className="flex h-full w-full flex-col items-center justify-center rounded-md border border-slate-600 bg-gradient-to-b from-slate-950 to-black font-mono text-sky-300 shadow-[0_0_10px_rgba(56,189,248,0.25)]">
      <div
        className="font-semibold tabular-nums"
        style={{ fontSize: 'calc(var(--u) * 0.44)' }}
        suppressHydrationWarning
      >
        {hh}:{mm}
      </div>
      <div
        className="tabular-nums text-sky-400/80"
        style={{ fontSize: 'calc(var(--u) * 0.3)' }}
        suppressHydrationWarning
      >
        :{ss}
      </div>
      <div
        className="mt-[1px] text-slate-400"
        style={{ fontSize: 'calc(var(--u) * 0.27)' }}
        suppressHydrationWarning
      >
        {weekday} {date}
      </div>
    </div>
  )
}

function Knob() {
  return (
    <div className="h-full w-full rounded-full border border-slate-500 bg-gradient-to-br from-slate-600 to-slate-900 shadow-lg">
      <div className="mx-auto mt-[10%] h-[30%] w-[2px] rounded bg-slate-300" />
    </div>
  )
}
