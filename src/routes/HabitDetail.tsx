import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Heatmap } from '../components/Heatmap'
import { HabitForm } from '../components/HabitForm'
import { HabitRow } from '../components/HabitRow'
import { addDays, formatLong, startOfWeek } from '../lib/date'
import { perHabitTotals } from '../lib/history'
import { archiveHabit, deleteHabit, updateHabit } from '../lib/repo'
import { findHabit, useAppState } from '../lib/store'
import { currentStreak, describeCadence, longestStreak, streakUnit } from '../lib/streaks'
import { habitStyle, percent, useMediaQuery, useToday } from '../lib/ui'

export function HabitDetail() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const state = useAppState()
  const today = useToday()
  const wide = useMediaQuery('(min-width: 900px)')
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const id = params.get('id')
  const habit = findHabit(state, id)

  if (!habit) {
    return (
      <div className="card p-6 text-center">
        <p className="text-sm text-muted">
          {state.ready ? 'That habit no longer exists.' : 'Loading…'}
        </p>
        <Link to="/" className="mt-3 inline-block text-sm text-accent hover:underline">
          Back to Today
        </Link>
      </div>
    )
  }

  const weeks = wide ? 53 : 20
  const weekStart = state.settings.weekStart
  const from = addDays(startOfWeek(today, weekStart), -7 * (weeks - 1))
  const totals = perHabitTotals(state, from, today).find((t) => t.habit.id === habit.id)
  const current = currentStreak(state, habit, today, weekStart)
  const longest = longestStreak(state, habit, today, weekStart)
  const unit = streakUnit(habit) === 'weeks' ? 'week' : 'day'

  return (
    <div className="space-y-4" style={habitStyle(habit.color)}>
      <header className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="mt-0.5 size-9 shrink-0 rounded-lg border border-border text-muted hover:text-ink"
        >
          ←
        </button>
        <span
          aria-hidden="true"
          className="grid size-11 shrink-0 place-items-center rounded-xl text-2xl"
          style={{ background: 'color-mix(in oklab, var(--habit) 14%, transparent)' }}
        >
          {habit.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight">{habit.name}</h1>
          <p className="text-xs text-muted">
            {describeCadence(habit)}
            {habit.archivedAt && ' · archived'}
          </p>
        </div>
      </header>

      {/* Today's row, so the detail screen is also somewhere you can tick it. */}
      <ul>
        <HabitRow habit={habit} date={today} subtitle={formatLong(today)} />
      </ul>

      <div className="grid grid-cols-3 gap-2">
        <div className="card p-3">
          <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Streak</p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums">{current}</p>
          <p className="text-[11px] text-faint">
            {unit}
            {current === 1 ? '' : 's'}
          </p>
        </div>
        <div className="card p-3">
          <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Longest</p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums">{longest}</p>
          <p className="text-[11px] text-faint">
            {unit}
            {longest === 1 ? '' : 's'}
          </p>
        </div>
        <div className="card p-3">
          <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Done</p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums">{totals?.completions ?? 0}</p>
          <p className="text-[11px] text-faint">
            {totals?.rate != null ? percent(totals.rate) : 'days'}
          </p>
        </div>
      </div>

      <section className="card p-4" aria-label={`${habit.name} history`}>
        <Heatmap endDate={today} weeks={weeks} habit={habit} />
      </section>

      {editing ? (
        <HabitForm
          habit={habit}
          submitLabel="Save changes"
          onCancel={() => setEditing(false)}
          onSubmit={(draft) => {
            updateHabit(habit.id, draft)
            setEditing(false)
          }}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => archiveHabit(habit.id, !habit.archivedAt)}
            className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted hover:text-ink"
          >
            {habit.archivedAt ? 'Restore' : 'Archive'}
          </button>
          {confirmDelete ? (
            <>
              <button
                type="button"
                onClick={() => {
                  deleteHabit(habit.id)
                  void navigate('/')
                }}
                className="rounded-xl px-4 py-2 text-sm font-medium text-white"
                style={{ background: 'var(--danger)' }}
              >
                Delete for good
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-xl border border-border px-4 py-2 text-sm text-muted"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="rounded-xl border px-4 py-2 text-sm font-medium text-danger"
              style={{ borderColor: 'color-mix(in oklab, var(--danger) 35%, var(--border))' }}
            >
              Delete
            </button>
          )}
        </div>
      )}

      {!editing && (
        <p className="px-1 text-xs text-muted">
          Archiving keeps the history and hides the habit from Today. Deleting removes it from every
          screen.
        </p>
      )}
    </div>
  )
}
