/** Small shared pieces of UI logic — theming, the current day, media queries. */

import { useEffect, useState } from 'react'
import { todayISO } from './date'
import { useAppState } from './store'
import type { HabitColor, ISODate, Settings } from './types'

export const THEME_STORAGE_KEY = 'oh.theme'

/**
 * Apply a theme choice to the document and mirror it to localStorage, which is
 * what the pre-paint script in index.html reads on the next load.
 */
export function applyTheme(theme: Settings['theme']): void {
  if (typeof document === 'undefined') return
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Private browsing can refuse storage. The class above still took effect.
  }
}

/** Keep the document in sync with the stored theme, system changes included. */
export function useTheme(): void {
  const { settings, ready } = useAppState()
  const theme = settings.theme

  useEffect(() => {
    if (!ready) return
    applyTheme(theme)
    if (theme !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [theme, ready])
}

/**
 * Today's date, honouring the rollover hour, kept fresh while the app is open.
 *
 * An app left open overnight — or resumed from the background the next morning —
 * must not keep ticking yesterday's boxes, so this re-checks on a timer and
 * whenever the tab becomes visible again.
 */
export function useToday(): ISODate {
  const { settings } = useAppState()
  const rollover = settings.rolloverHour
  const [today, setToday] = useState(() => todayISO(rollover))

  useEffect(() => {
    const check = () => setToday(todayISO(rollover))
    check()
    const timer = setInterval(check, 60_000)
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
    }
  }, [rollover])

  return today
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const media = window.matchMedia(query)
    const onChange = () => setMatches(media.matches)
    onChange()
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/**
 * The CSS variable a habit's colour resolves to.
 *
 * Returned as an inline `--habit` rather than a Tailwind class because class
 * names built at runtime (`bg-${color}-500`) are invisible to Tailwind's scanner
 * and would need a safelist to survive a production build.
 */
export function habitStyle(color: HabitColor): React.CSSProperties {
  return { '--habit': `var(--habit-${color})` } as React.CSSProperties
}

export const HABIT_EMOJI = [
  '✅', '💧', '🏃', '📖', '🧘', '💪', '🥗', '😴', '🎸', '✍️',
  '🧹', '🌱', '☀️', '🚶', '🍎', '💊', '🦷', '📵', '🎨', '🧠',
  '💰', '📞', '🐕', '🚲', '🧺', '🎯',
]

/** Percentage as a rounded, human-facing string. */
export const percent = (ratio: number): string => `${Math.round(ratio * 100)}%`
