import { useState } from 'react'
import clsx from 'clsx'
import { Link } from 'react-router'
import { DayDetail } from '../components/DayDetail'
import { Heatmap } from '../components/Heatmap'
import { addDays, startOfWeek } from '../lib/date'
import { perHabitTotals, rangeStats } from '../lib/history'
import { updateSettings } from '../lib/repo'
import { activeHabits, useAppState } from '../lib/store'
import { currentStreak, longestStreak } from '../lib/streaks'
import { habitStyle, percent, useMediaQuery, useToday } from '../lib/ui'
import type { ISODate } from '../lib/types'

/** 53 columns is a full year; 20 is what fits a phone without pinch-zooming. */
const FULL_WEEKS = 53
const COMPACT_WEEKS = 20

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-3">
      <p className="text-[11px] font-medium tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-faint">{hint}</p>}
    </div>
  )
}

export function Stats() {
  const state = useAppState()
  const today = useToday()
  const weekStart = state.settings.weekStart
  const wide = useMediaQuery('(min-width: 900px)')
  const [selected, setSelected] = useState<ISODate | null>(null)

  // Wide screens default to the full year, phones to the compact view; the
  // toggle is stored so the choice survives a reload either way.
  const expanded = state.settings.expandedHeatmap || wide
  const weeks = expanded ? FULL_WEEKS : COMPACT_WEEKS

  const habits = activeHabits(state)
  const from = addDays(startOfWeek(today, weekStart), -7 * (weeks - 1))
  const stats = rangeStats(state, from, today)
  const totals = perHabitTotals(state, from, today).filter((t) => !t.habit.archivedAt)

  const bestCurrent = habits.reduce(
    (max, habit) => Math.max(max, currentStreak(state, habit, today, weekStart)),
    0,
  )
  const bestEver = habits.reduce(
    (max, habit) => Math.max(max, longestStreak(state, habit, today, weekStart)),
    0,
  )

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Stats</h1>
          <p className="text-xs text-muted">
            {expanded ? 'Past year' : 'Past 20 weeks'} · {stats.daysTracked} days
          </p>
        </div>
        {!wide && (
          <button
            type="button"
            onClick={() => updateSettings({ expandedHeatmap: !state.settings.expandedHeatmap })}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-ink"
          >
            {expanded ? 'Compact' : 'Full year'}
          </button>
        )}
      </header>

      {habits.length === 0 ? (
        <p className="card p-5 text-center text-sm text-muted">
          No habits yet.{' '}
          <Link to="/" className="text-secondary hover:underline">
            Add one on Today
          </Link>
          .
        </p>
      ) : (
        <>
          <section className="card p-4" aria-label="Completion heatmap">
            <Heatmap
              endDate={today}
              weeks={weeks}
              selected={selected}
              onSelect={(date) => setSelected((current) => (current === date ? null : date))}
            />
          </section>

          {selected && (
            <DayDetail date={selected} today={today} onClose={() => setSelected(null)} />
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Streak" value={String(bestCurrent)} hint="Best running now" />
            <Stat label="Longest" value={String(bestEver)} hint="Best ever" />
            <Stat
              label="Perfect days"
              value={String(stats.perfectDays)}
              hint="Everything done"
            />
            <Stat
              label="Completion"
              value={percent(stats.completionRate)}
              hint="Of scheduled days"
            />
          </div>

          <section aria-label="Per-habit totals">
            <h2 className="mb-2 text-sm font-semibold">By habit</h2>
            <ul className="space-y-2">
              {totals.map(({ habit, completions, scheduled, rate }) => {
                const current = currentStreak(state, habit, today, weekStart)
                return (
                  <li key={habit.id} style={habitStyle(habit.color)} className="card p-3">
                    <div className="flex items-center gap-2.5">
                      <span aria-hidden="true" className="text-lg">
                        {habit.emoji}
                      </span>
                      <Link
                        to={`/habit?id=${encodeURIComponent(habit.id)}`}
                        className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
                      >
                        {habit.name}
                      </Link>
                      <span className="shrink-0 text-xs text-muted tabular-nums">
                        {completions} {completions === 1 ? 'day' : 'days'}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, (rate ?? 0) * 100)}%`,
                            background: 'var(--habit)',
                          }}
                        />
                      </div>
                      <span
                        className={clsx(
                          'w-20 shrink-0 text-right text-[11px] tabular-nums',
                          rate === null ? 'text-faint' : 'text-muted',
                        )}
                      >
                        {rate === null ? `${scheduled === 0 ? 'n× weekly' : ''}` : percent(rate)}
                      </span>
                      <span className="w-12 shrink-0 text-right text-[11px] text-muted tabular-nums">
                        {current > 0 ? `🔥 ${current}` : ''}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>

          <p className="px-1 text-xs text-muted">
            Click any square to see and fix that day. Rest days never count against your completion
            rate.
          </p>
        </>
      )}
    </div>
  )
}
