import { useState } from 'react'
import clsx from 'clsx'
import { Link } from 'react-router'
import {
  addDays,
  formatShort,
  formatWeekRange,
  startOfWeek,
  weekDates,
  WEEKDAY_INITIALS,
} from '../lib/date'
import { dayCompletion } from '../lib/history'
import { cycleCount } from '../lib/repo'
import { activeHabits, countFor, useAppState } from '../lib/store'
import { dayStatus, isScheduled } from '../lib/streaks'
import { habitStyle, useToday } from '../lib/ui'
import { dayOfWeek } from '../lib/date'
import type { Habit, ISODate } from '../lib/types'

interface CellProps {
  habit: Habit
  date: ISODate
  today: ISODate
}

function Cell({ habit, date, today }: CellProps) {
  const state = useAppState()
  const count = countFor(state, habit.id, date)
  const status = dayStatus(state, habit, date, today)
  const future = date > today
  const scheduled = isScheduled(habit, date)
  const done = status === 'done'
  const partial = status === 'partial'

  return (
    <button
      type="button"
      onClick={() => cycleCount(habit, date, count)}
      disabled={future}
      aria-label={`${habit.name}, ${formatShort(date)}: ${done ? 'done' : `${count} of ${habit.target}`}. Tap to change.`}
      className={clsx(
        'grid aspect-square w-full place-items-center rounded-lg text-[11px] font-semibold tabular-nums transition-all',
        future && 'cursor-not-allowed opacity-25',
        !future && 'active:scale-90',
        done && 'text-white',
        !done && !partial && 'text-faint',
        // A cell outside the habit's cadence is still tappable — correcting a
        // day you happened to do it anyway is the point of this screen — but it
        // reads as optional rather than owed.
        !scheduled && !done && 'opacity-45',
      )}
      style={
        done
          ? { background: 'var(--habit)' }
          : partial
            ? { background: 'color-mix(in oklab, var(--habit) 30%, transparent)' }
            : { background: 'var(--raised)' }
      }
    >
      {done ? '✓' : count > 0 ? count : ''}
    </button>
  )
}

export function Week() {
  const state = useAppState()
  const today = useToday()
  const weekStart = state.settings.weekStart
  const [anchor, setAnchor] = useState<ISODate | null>(null)

  const currentWeekStart = startOfWeek(today, weekStart)
  const shownStart = anchor ?? currentWeekStart
  const days = weekDates(shownStart, weekStart)
  const habits = activeHabits(state)
  const isThisWeek = shownStart === currentWeekStart

  const shift = (weeks: number) => setAnchor(addDays(shownStart, weeks * 7))

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">Week</h1>
          <p className="truncate text-xs text-muted">
            {formatWeekRange(days)}
            {isThisWeek && ' · this week'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => shift(-1)}
            aria-label="Previous week"
            className="size-9 rounded-lg border border-border text-muted transition-colors hover:text-ink"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => setAnchor(null)}
            disabled={isThisWeek}
            className="rounded-lg border border-border px-2.5 py-2 text-xs font-medium text-muted transition-colors hover:text-ink disabled:opacity-35"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => shift(1)}
            // Nothing to correct in a week that hasn't happened.
            disabled={isThisWeek}
            aria-label="Next week"
            className="size-9 rounded-lg border border-border text-muted transition-colors hover:text-ink disabled:opacity-35"
          >
            →
          </button>
        </div>
      </header>

      {habits.length === 0 ? (
        <p className="card p-5 text-center text-sm text-muted">
          No habits yet.{' '}
          <Link to="/" className="text-accent hover:underline">
            Add one on Today
          </Link>
          .
        </p>
      ) : (
        <div className="card overflow-x-auto p-3">
          <table className="w-full min-w-[22rem] border-separate border-spacing-x-1 border-spacing-y-1.5">
            <thead>
              <tr>
                <th className="w-[38%] min-w-28 text-left text-xs font-medium text-muted">
                  <span className="sr-only">Habit</span>
                </th>
                {days.map((date) => (
                  <th key={date} scope="col" className="text-center">
                    <span
                      className={clsx(
                        'block text-[10px] leading-tight font-medium',
                        date === today ? 'text-accent' : 'text-faint',
                      )}
                    >
                      {WEEKDAY_INITIALS[dayOfWeek(date)]}
                    </span>
                    <span
                      className={clsx(
                        'block text-[11px] tabular-nums',
                        date === today ? 'font-bold text-accent' : 'text-muted',
                      )}
                    >
                      {Number(date.slice(8))}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {habits.map((habit) => (
                <tr key={habit.id} style={habitStyle(habit.color)}>
                  <th scope="row" className="text-left font-normal">
                    <Link
                      to={`/habit?id=${encodeURIComponent(habit.id)}`}
                      className="flex items-center gap-1.5 truncate text-xs hover:underline"
                    >
                      <span aria-hidden="true">{habit.emoji}</span>
                      <span className="truncate">{habit.name}</span>
                    </Link>
                  </th>
                  {days.map((date) => (
                    <td key={date} className="p-0">
                      <Cell habit={habit} date={date} today={today} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>

            <tfoot>
              <tr>
                <td className="pt-1 text-xs font-medium text-muted">Done</td>
                {days.map((date) => {
                  const { done, scheduled } = dayCompletion(state, date, habits)
                  const complete = scheduled > 0 && done === scheduled
                  return (
                    <td key={date} className="pt-1 text-center">
                      <span
                        className={clsx(
                          'text-[11px] font-semibold tabular-nums',
                          date > today ? 'text-faint opacity-40' : complete ? 'text-accent' : 'text-muted',
                        )}
                      >
                        {date > today ? '–' : scheduled ? `${done}/${scheduled}` : '–'}
                      </span>
                    </td>
                  )
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="px-1 text-xs text-muted">
        Tap any cell to correct a past day. Counted habits step up one at a time and wrap back to
        zero.
      </p>
    </div>
  )
}
