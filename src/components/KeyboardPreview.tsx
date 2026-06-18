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
  /** Show the keyboard photo with our buttons overlaid — for layout calibration. */
  debug?: boolean
}

export function KeyboardPreview({ lighting, now, debug }: KeyboardPreviewProps) {
  if (debug) return <KeyboardOverlay />

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

  /*
   * Measured from product photo (894×375px, 1u = 50px):
   *   key-to-key gap within rows  = 0.08u
   *   fn-row group gap            = 0.34u
   *   gap main-grid → right panel = 0.06u
   *   nav key width               = 1.0u
   *   C/W/B strip width           = 0.42u
   *   knob diameter               = 1.62u  (spans same x-range as strip+nav)
   *
   * Layout: two flex columns (main key grid | right panel).
   * The right panel is a flex-col with the same row gap as the key grid so
   * every row auto-aligns: fn→knob, rows 1-3→C/W/B+nav, rows 4-5→TFT.
   */
  const ROW_GAP = 'calc(var(--u) * 0.10)'
  const KEY_GAP = 'calc(var(--u) * 0.10)'

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-3 shadow-inner">
      <div
        className="flex items-start"
        style={{
          ['--u' as string]: 'clamp(10px, 2.8vw, 28px)',
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

        {/*
         * ── Right panel ──
         * A flex-col with the same row gap as the key grid.
         * Row 0 (fn level)   : encoder knob
         * Rows 1-3           : [C/W/B dot] [nav key]  (aligned to rows 1-3)
         * Rows 4-5 (combined): TFT screen
         *
         * Width = knob diameter ≈ 1.62u (wider than strip+nav so knob centring works).
         */}
        <div
          className="flex flex-col shrink-0"
          style={{
            gap: ROW_GAP,
            width: 'calc(var(--u) * 1.62)',
          }}
        >
          {/* fn row: knob centred, allowed to visually overflow */}
          <div
            className="flex items-center justify-center"
            style={{ height: 'var(--u)', overflow: 'visible' }}
          >
            <Knob />
          </div>

          {/* rows 1-3: C/W/B indicator on the left, nav key on the right */}
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

          {/* rows 4-5: TFT screen (shift row + gap + bottom row) */}
          <TftScreen now={now} />
        </div>
      </div>
    </div>
  )
}

// ─── debug overlay ───────────────────────────────────────────────────────────
/*
 * Pixel measurements taken from the 894×375 product photo.
 * cx/cy = key-centre in image pixels; w/h = key width/height in image pixels.
 * The overlay div has the same 894:375 aspect ratio and scales with CSS.
 */
const IMG_W = 894
const IMG_H = 375

interface OKey { label: string; cx: number; cy: number; w: number; h: number; nav?: boolean }

// prettier-ignore
const OVERLAY_KEYS: OKey[] = [
  // ── fn row cy=46 h=48 ─────────────────────────────────────────────────────
  { label:'Esc',  cx:44,  cy:46, w:49, h:48 },
  { label:'F1',   cx:109, cy:46, w:49, h:48 },
  { label:'F2',   cx:161, cy:46, w:49, h:48 },
  { label:'F3',   cx:213, cy:46, w:49, h:48 },
  { label:'F4',   cx:265, cy:46, w:49, h:48 },
  { label:'F5',   cx:328, cy:46, w:49, h:48 },
  { label:'F6',   cx:381, cy:46, w:49, h:48 },
  { label:'F7',   cx:433, cy:46, w:49, h:48 },
  { label:'F8',   cx:487, cy:46, w:49, h:48 },
  { label:'F9',   cx:550, cy:46, w:49, h:48 },
  { label:'F10',  cx:602, cy:46, w:49, h:48 },
  { label:'F11',  cx:654, cy:46, w:49, h:48 },
  { label:'F12',  cx:707, cy:46, w:49, h:48 },
  { label:'Del',  cx:772, cy:46, w:49, h:48 },
  // ── number row cy=110 h=49 ────────────────────────────────────────────────
  { label:'`',    cx:44,  cy:110, w:49, h:49 },
  { label:'1',    cx:96,  cy:110, w:49, h:49 },
  { label:'2',    cx:148, cy:110, w:49, h:49 },
  { label:'3',    cx:200, cy:110, w:49, h:49 },
  { label:'4',    cx:252, cy:110, w:49, h:49 },
  { label:'5',    cx:304, cy:110, w:49, h:49 },
  { label:'6',    cx:356, cy:110, w:49, h:49 },
  { label:'7',    cx:408, cy:110, w:49, h:49 },
  { label:'8',    cx:460, cy:110, w:49, h:49 },
  { label:'9',    cx:512, cy:110, w:49, h:49 },
  { label:'0',    cx:564, cy:110, w:49, h:49 },
  { label:'-',    cx:616, cy:110, w:49, h:49 },
  { label:'=',    cx:666, cy:110, w:49, h:49 },
  { label:'Bksp', cx:747, cy:110, w:97, h:49 },
  { label:'Home', cx:848, cy:110, w:49, h:49, nav:true },
  // ── QWERTY row cy=162 h=49 ───────────────────────────────────────────────
  { label:'Tab',  cx:56,  cy:162, w:74, h:49 },
  { label:'Q',    cx:122, cy:162, w:49, h:49 },
  { label:'W',    cx:174, cy:162, w:49, h:49 },
  { label:'E',    cx:226, cy:162, w:49, h:49 },
  { label:'R',    cx:278, cy:162, w:49, h:49 },
  { label:'T',    cx:330, cy:162, w:49, h:49 },
  { label:'Y',    cx:382, cy:162, w:49, h:49 },
  { label:'U',    cx:434, cy:162, w:49, h:49 },
  { label:'I',    cx:486, cy:162, w:49, h:49 },
  { label:'O',    cx:537, cy:162, w:49, h:49 },
  { label:'P',    cx:589, cy:162, w:49, h:49 },
  { label:'[',    cx:641, cy:162, w:49, h:49 },
  { label:']',    cx:693, cy:162, w:49, h:49 },
  { label:'\\',   cx:758, cy:162, w:74, h:49 },
  { label:'PgUp', cx:848, cy:162, w:49, h:49, nav:true },
  // ── home row cy=214 h=49 ─────────────────────────────────────────────────
  { label:'Caps', cx:63,  cy:214, w:87, h:49 },
  { label:'A',    cx:135, cy:214, w:49, h:49 },
  { label:'S',    cx:187, cy:214, w:49, h:49 },
  { label:'D',    cx:239, cy:214, w:49, h:49 },
  { label:'F',    cx:291, cy:214, w:49, h:49 },
  { label:'G',    cx:343, cy:214, w:49, h:49 },
  { label:'H',    cx:395, cy:214, w:49, h:49 },
  { label:'J',    cx:447, cy:214, w:49, h:49 },
  { label:'K',    cx:498, cy:214, w:49, h:49 },
  { label:'L',    cx:550, cy:214, w:49, h:49 },
  { label:';',    cx:602, cy:214, w:49, h:49 },
  { label:"'",    cx:654, cy:214, w:49, h:49 },
  { label:'Entr', cx:740, cy:214, w:114,h:49 },
  { label:'PgDn', cx:848, cy:214, w:49, h:49, nav:true },
  // ── shift row cy=266 h=49 ────────────────────────────────────────────────
  { label:'Shift',cx:76,  cy:266, w:112,h:49 },
  { label:'Z',    cx:161, cy:266, w:49, h:49 },
  { label:'X',    cx:213, cy:266, w:49, h:49 },
  { label:'C',    cx:265, cy:266, w:49, h:49 },
  { label:'V',    cx:317, cy:266, w:49, h:49 },
  { label:'B',    cx:369, cy:266, w:49, h:49 },
  { label:'N',    cx:421, cy:266, w:49, h:49 },
  { label:'M',    cx:472, cy:266, w:49, h:49 },
  { label:',',    cx:524, cy:266, w:49, h:49 },
  { label:'.',    cx:576, cy:266, w:49, h:49 },
  { label:'/',    cx:628, cy:266, w:49, h:49 },
  { label:'Shft', cx:702, cy:266, w:86, h:49 },
  { label:'↑',    cx:784, cy:281, w:49, h:49, nav:true },
  // ── TFT screen: shift+bottom rows, under PgDn ────────────────────────────
  { label:'LCD',  cx:848, cy:272, w:56, h:56,  nav:true },
  // ── knob: fn row level, above Home ───────────────────────────────────────
  { label:'knob', cx:848, cy:45,  w:62, h:62, nav:true },
  // ── bottom row cy=319 h=48 ───────────────────────────────────────────────
  { label:'Ctrl', cx:49,  cy:319, w:59, h:48 },
  { label:'Win',  cx:115, cy:319, w:59, h:48 },
  { label:'Alt',  cx:180, cy:319, w:59, h:48 },
  { label:'Space',cx:375, cy:319, w:321,h:48 },
  { label:'Alt',  cx:564, cy:319, w:46, h:48 },
  { label:'Fn',   cx:616, cy:319, w:46, h:48 },
  { label:'Ctrl', cx:668, cy:319, w:46, h:48 },
  { label:'←',    cx:733, cy:333, w:48, h:48, nav:true },
  { label:'↓',    cx:784, cy:333, w:48, h:48, nav:true },
  { label:'→',    cx:835, cy:333, w:48, h:48, nav:true },
]

function KeyboardOverlay() {
  const pct = (px: number, dim: number) => `${(px / dim) * 100}%`
  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl border border-slate-600"
      style={{ aspectRatio: `${IMG_W} / ${IMG_H}` }}
    >
      <img
        src="/keyboard-ref.jpg"
        alt="keyboard reference"
        className="absolute inset-0 h-full w-full object-cover"
      />
      {OVERLAY_KEYS.map((k, i) => (
        <div
          key={i}
          className={`absolute flex items-center justify-center rounded-sm border text-[0px] font-mono font-bold transition-colors
            ${k.nav
              ? 'border-amber-400 bg-amber-400/30 text-amber-200'
              : 'border-blue-400 bg-blue-500/30 text-blue-100'
            }`}
          style={{
            left:   pct(k.cx - k.w / 2, IMG_W),
            top:    pct(k.cy - k.h / 2, IMG_H),
            width:  pct(k.w, IMG_W),
            height: pct(k.h, IMG_H),
            fontSize: `${Math.min((k.w / IMG_W) * 100 * 0.25, (49 / IMG_W) * 100 * 0.3)}cqw`,
          }}
          title={k.label}
        >
          {k.label}
        </div>
      ))}
    </div>
  )
}

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
