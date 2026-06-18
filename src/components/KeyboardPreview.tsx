import { useEffect, useRef } from 'react'
import { KEY_ROWS, getKeys, type LayoutKey } from '../lib/keyboard-layout'
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

interface KeyboardPreviewProps {
  lighting: LightingState
  now: Date
}

export function KeyboardPreview({ lighting, now }: KeyboardPreviewProps) {
  const keyEls = useRef<Array<HTMLButtonElement | null>>([])
  const lightingRef = useRef(lighting)
  const active = useRef<ActivePress[]>([])
  const startRef = useRef<number>(0)

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
        el.style.background = `rgb(${r},${g},${b})`
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

  const ROW_GAP = 'calc(var(--u) * 0.10)'
  const KEY_GAP = 'calc(var(--u) * 0.10)'

  return (
    /* The invisible img anchors the container to the calibrated 894:375 aspect
       ratio so --u (via cqw) always matches the pixel measurements from the photo. */
    <div
      className="relative w-full overflow-hidden rounded-2xl border border-slate-700"
      style={{ aspectRatio: `${IMG_W} / ${IMG_H}`, containerType: 'inline-size' }}
    >
      <img
        src="/keyboard-ref.jpg"
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover"
        style={{ opacity: 0 }}
      />

      <div
        className="absolute inset-0 flex items-center justify-center bg-slate-900/80 p-3"
        style={{
          ['--u' as string]: `calc((100cqw - 24px) / ${IMG_W / 50})`,
          gap: 'calc(var(--u) * 0.06)',
        }}
      >
        {/* ── Main key grid ── */}
        <div className="flex flex-col" style={{ gap: ROW_GAP }}>
          {KEY_ROWS.map((row, r) => {
            const offset = KEY_ROWS.slice(0, r).reduce(
              (sum, rr) => sum + rr.length,
              0,
            )
            return (
              <div key={r} className="flex" style={{ gap: KEY_GAP }}>
                {row.map((k, c) => {
                  const id = offset + c
                  const w = k.w ?? 1
                  return (
                    <button
                      key={c}
                      type="button"
                      ref={(el) => { keyEls.current[id] = el }}
                      onPointerDown={() => press(KEYS[id])}
                      onPointerEnter={(e) => { if (e.buttons > 0) press(KEYS[id]) }}
                      className="flex items-end justify-center overflow-hidden rounded-[3px] bg-slate-800 text-slate-900/70 select-none"
                      style={{
                        width: `calc(var(--u) * ${w})`,
                        height: 'var(--u)',
                        fontSize: 'calc(var(--u) * 0.32)',
                        lineHeight: 1,
                        marginLeft: k.gapBefore
                          ? `calc(var(--u) * ${k.gapBefore})`
                          : undefined,
                      }}
                      title={k.label}
                    >
                      <span className="pointer-events-none truncate px-[1px] pb-[1px] font-medium mix-blend-overlay">
                        {k.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* ── Right panel ── */}
        <div
          className="flex flex-col shrink-0"
          style={{
            gap: ROW_GAP,
            width: 'calc(var(--u) * 1.62)',
          }}
        >
          <div
            className="flex items-center justify-center"
            style={{ height: 'var(--u)', overflow: 'visible' }}
          >
            <Knob />
          </div>

          {(
            [
              { cwb: 'C', nav: 'Home' },
              { cwb: 'W', nav: 'PgUp' },
              { cwb: 'B', nav: 'PgDn' },
            ] as const
          ).map(({ cwb, nav }) => (
            <div
              key={cwb}
              className="flex items-center justify-between"
              style={{ height: 'var(--u)' }}
            >
              <ConnectionMode label={cwb} />
              <NavKey label={nav} />
            </div>
          ))}

          <TftScreen now={now} />
        </div>
      </div>
    </div>
  )
}

// Photo dimensions — used to set the container aspect ratio so --u (via cqw)
// matches the 1u=50px measurements taken from the product photo.
const IMG_W = 894
const IMG_H = 375

// ─── right-panel sub-components ─────────────────────────────────────────────

function NavKey({ label }: { label: string }) {
  return (
    <div
      className="flex items-end justify-center overflow-hidden rounded-[3px] bg-slate-800 text-slate-500 select-none"
      style={{
        width: 'var(--u)',
        height: 'var(--u)',
        fontSize: 'calc(var(--u) * 0.3)',
        lineHeight: 1,
      }}
    >
      <span className="pb-[1px] font-medium">{label}</span>
    </div>
  )
}

function ConnectionMode({ label }: { label: string }) {
  return (
    <div
      className="flex items-center gap-[2px] text-slate-600"
      style={{ fontSize: 'calc(var(--u) * 0.3)', lineHeight: 1 }}
    >
      <span className="inline-block h-[4px] w-[4px] rounded-full bg-slate-700" />
      {label}
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
    <div
      className="flex flex-col items-center justify-center rounded-md border border-slate-600 bg-gradient-to-b from-slate-950 to-black font-mono text-sky-300 shadow-[0_0_10px_rgba(56,189,248,0.25)]"
      style={{
        /* shift row (1u) + gap (ROW_GAP = 0.10u) + bottom row (1u) = 2.10u */
        height: 'calc(var(--u) * 2.1)',
      }}
    >
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
    <div
      className="rounded-full border border-slate-500 bg-gradient-to-br from-slate-600 to-slate-900 shadow-lg"
      style={{ width: 'calc(var(--u) * 1.5)', height: 'calc(var(--u) * 1.5)' }}
    >
      <div className="mx-auto mt-[10%] h-[30%] w-[2px] rounded bg-slate-300" />
    </div>
  )
}
