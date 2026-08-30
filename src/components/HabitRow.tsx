import clsx from 'clsx'
import { Link } from 'react-router'
import { cycleCount, incrementCount } from '../lib/repo'
import { countFor, useAppState } from '../lib/store'
import { describeCadence, isScheduled } from '../lib/streaks'
import { habitStyle } from '../lib/ui'
import type { Habit, ISODate } from '../lib/types'

interface Props {
  habit: Habit
  date: ISODate
  /** Streak text shown under the name, when there is one worth showing. */
  subtitle?: string
}

/**
 * One habit on one day.
 *
 * A simple habit is a single tap. A counted habit ("Water × 8") gets −/+ controls
 * and a progress bar, because tapping a tick eight times to log eight glasses is
 * the kind of thing that makes people stop using a tracker.
 */
export function HabitRow({ habit, date, subtitle }: Props) {
  const state = useAppState()
  const count = countFor(state, habit.id, date)
  const done = count >= habit.target
  const counted = habit.target > 1
  const rest = !isScheduled(habit, date)

  return (
    <li
      style={habitStyle(habit.color)}
      className={clsx(
        'card flex items-center gap-3 p-3 transition-colors',
        done && 'border-[color-mix(in_oklab,var(--habit)_40%,var(--border))]',
      )}
    >
      {counted ? (
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-xl text-xl"
          style={{ background: 'color-mix(in oklab, var(--habit) 14%, transparent)' }}
        >
          {habit.emoji}
        </span>
      ) : (
        <button
          type="button"
          onClick={() => cycleCount(habit, date, count)}
          aria-pressed={done}
          aria-label={`${done ? 'Mark not done' : 'Mark done'}: ${habit.name}`}
          className={clsx(
            'grid size-10 shrink-0 place-items-center rounded-xl text-xl transition-all active:scale-95',
            done ? 'text-white' : 'border border-border',
          )}
          style={
            done
              ? { background: 'var(--habit)' }
              : { background: 'color-mix(in oklab, var(--habit) 8%, transparent)' }
          }
        >
          {done ? '✓' : habit.emoji}
        </button>
      )}

      <div className="min-w-0 flex-1">
        <Link
          to={`/habit?id=${encodeURIComponent(habit.id)}`}
          className="block truncate font-medium hover:underline"
        >
          {habit.name}
        </Link>
        <p className="truncate text-xs text-muted">
          {subtitle ?? (rest ? `Rest day · ${describeCadence(habit)}` : describeCadence(habit))}
        </p>

        {counted && (
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-raised">
            <div
              className="h-full rounded-full transition-[width]"
              style={{
                width: `${Math.min(100, (count / habit.target) * 100)}%`,
                background: 'var(--habit)',
              }}
            />
          </div>
        )}
      </div>

      {counted ? (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => incrementCount(habit, date, count, -1)}
            disabled={count === 0}
            aria-label={`One fewer: ${habit.name}`}
            className="size-8 rounded-lg border border-border text-lg leading-none text-muted transition-colors hover:text-ink disabled:opacity-35"
          >
            −
          </button>
          <span
            className={clsx(
              'w-14 text-center text-sm font-semibold tabular-nums',
              done && 'habit-tint',
            )}
          >
            {count}
            <span className="text-muted">/{habit.target}</span>
          </span>
          <button
            type="button"
            onClick={() => incrementCount(habit, date, count, 1)}
            disabled={done}
            aria-label={`One more: ${habit.name}`}
            className="size-8 rounded-lg border border-border text-lg leading-none text-muted transition-colors hover:text-ink disabled:opacity-35"
            style={done ? undefined : { borderColor: 'color-mix(in oklab, var(--habit) 35%, var(--border))' }}
          >
            +
          </button>
        </div>
      ) : (
        <span
          className={clsx('shrink-0 text-xs font-medium', done ? 'habit-tint' : 'text-faint')}
        >
          {done ? 'Done' : rest ? 'Rest' : ''}
        </span>
      )}
    </li>
  )
}
