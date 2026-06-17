import { useEffect, useRef, useState } from 'react'
import type { DirectionName, LightingModeName, SleepTimerName } from './protocol'

export interface LightingState {
  mode: LightingModeName
  /** Base colour as "#rrggbb" (used when rainbow is off). */
  color: string
  rainbow: boolean
  brightness: number
  speed: number
  direction: DirectionName
}

const DEFAULT_LIGHTING: LightingState = {
  mode: 'Spectrum',
  color: '#6366f1',
  rainbow: true,
  brightness: 5,
  speed: 3,
  direction: 'Right',
}

const DEFAULT_SLEEP: SleepTimerName = '5 minutes'

const LIGHTING_KEY = 'ak820:lighting'
const SLEEP_KEY = 'ak820:sleep'

function load<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    // Merge so new fields fall back to defaults if older data is stored.
    return typeof parsed === 'object' && parsed !== null
      ? { ...fallback, ...parsed }
      : (parsed as T)
  } catch {
    return fallback
  }
}

/**
 * State persisted to localStorage. To stay SSR-safe, the first render always
 * uses `initial` (matching the server); persisted values are loaded in an
 * effect after mount, and only then do we start writing back.
 */
function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial)
  const hydrated = useRef(false)

  useEffect(() => {
    setValue(load(key, initial))
    hydrated.current = true
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!hydrated.current || typeof window === 'undefined') return
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Ignore quota / privacy-mode errors.
    }
  }, [key, value])

  return [value, setValue] as const
}

export function useLighting() {
  const [state, setState] = usePersistentState(LIGHTING_KEY, DEFAULT_LIGHTING)
  const patch = (next: Partial<LightingState>) =>
    setState((prev) => ({ ...prev, ...next }))
  return { lighting: state, setLighting: patch }
}

export function useSleepTimer() {
  return usePersistentState<SleepTimerName>(SLEEP_KEY, DEFAULT_SLEEP)
}
