import clsx from 'clsx'
import { formatLong, relativeDayLabel } from '../lib/date'
import { dayCompletion } from '../lib/history'
import { cycleCount } from '../lib/repo'
import { countFor, useAppState, visibleHabits } from '../lib/store'
import { dayStatus } from '../lib/streaks'
import { habitStyle } from '../lib/ui'
import type { DayStatus, ISODate } from '../lib/types'

const STATUS_LABEL: Record<DayStatus, string> = {
  done: 'Done',
  partial: 'Partial',
  missed: 'Missed',
  rest: 'Rest day',
  future: '—',
}

interface Props {
  date: ISODate
  today: ISODate
  onClose: () => void
}

/**
 * What happened on one day, and a chance to fix it.
 *
 * Read-only would be the easy version, but the reason you click a red square in
 * a heatmap is usually that you forgot to tick something — so the rows here are
 * tappable, exactly like the week grid.
 */
export function DayDetail({ date, today, onClose }: Props) {
  const state = useAppState()
  const habits = visibleHabits(state)
  const { done, scheduled } = dayCompletion(state, date, habits)

  return (
    <section className="card p-4" aria-label={`Detail for ${formatLong(date)}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{relativeDayLabel(date, today)}</h3>
          <p className="text-xs text-muted">
            {formatLong(date)} · {done} of {scheduled} done
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close day detail"
          className="rounded-lg px-2 py-1 text-muted hover:text-ink"
        >
          ✕
        </button>
      </div>

      {habits.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No habits yet.</p>
      ) : (
        <ul className="mt-3 space-y-1">
          {habits.map((habit) => {
            const count = countFor(state, habit.id, date)
            const status = dayStatus(state, habit, date, today)
            const isDone = status === 'done'
            return (
              <li key={habit.id} style={habitStyle(habit.color)}>
                <button
                  type="button"
                  onClick={() => cycleCount(habit, date, count)}
                  disabled={date > today}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-raised disabled:opacity-50"
                >
                  <span
                    aria-hidden="true"
                    className={clsx(
                      'grid size-7 shrink-0 place-items-center rounded-lg text-sm',
                      isDone && 'text-white',
                    )}
                    style={
                      isDone
                        ? { background: 'var(--habit)' }
                        : { background: 'color-mix(in oklab, var(--habit) 12%, transparent)' }
                    }
                  >
                    {isDone ? '✓' : habit.emoji}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{habit.name}</span>
                  <span
                    className={clsx(
                      'shrink-0 text-xs',
                      status === 'missed' ? 'text-danger' : isDone ? 'habit-tint' : 'text-muted',
                    )}
                  >
                    {habit.target > 1 && status !== 'rest'
                      ? `${count}/${habit.target}`
                      : STATUS_LABEL[status]}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
