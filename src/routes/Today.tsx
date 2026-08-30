import { useState } from 'react'
import clsx from 'clsx'
import { Link } from 'react-router'
import { DownloadAppButton } from '../components/DownloadAppButton'
import { HabitForm } from '../components/HabitForm'
import { HabitRow } from '../components/HabitRow'
import { QuoteCard } from '../components/QuoteCard'
import { formatLong, relativeDayLabel } from '../lib/date'
import { dayCompletion, last7Days, scheduledFor } from '../lib/history'
import { quoteForDate } from '../lib/quotes'
import { addHabit } from '../lib/repo'
import { activeHabits, useAppState } from '../lib/store'
import { currentStreak, streakUnit } from '../lib/streaks'
import { useToday } from '../lib/ui'

function ProgressRing({ done, total }: { done: number; total: number }) {
  const ratio = total ? done / total : 0
  const size = 56
  const stroke = 5
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--raised)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          className="transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-sm font-semibold tabular-nums">
        {total ? `${done}/${total}` : '–'}
      </span>
    </div>
  )
}

export function Today() {
  const state = useAppState()
  const today = useToday()
  const [adding, setAdding] = useState(false)

  const habits = activeHabits(state)
  const dueToday = scheduledFor(today, habits)
  const { done, scheduled } = dayCompletion(state, today, habits)
  const strip = last7Days(state, today)
  const quote = quoteForDate(today)

  // The longest run going right now, so the summary says something specific
  // rather than averaging every habit into a meaningless number.
  const best = habits.reduce(
    (leader, habit) => {
      const streak = currentStreak(state, habit, today, state.settings.weekStart)
      return streak > leader.streak ? { habit, streak } : leader
    },
    { habit: habits[0], streak: 0 },
  )

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Today</h1>
          <p className="text-xs text-muted">{formatLong(today)}</p>
        </div>
        <ProgressRing done={done} total={scheduled} />
      </header>

      <QuoteCard quote={quote} eyebrow="Quote of the day" />

      {/* Last seven days */}
      <section className="card p-4" aria-label="The last seven days">
        <div className="flex items-end justify-between gap-1">
          {strip.map((day) => (
            <div key={day.date} className="flex flex-1 flex-col items-center gap-1.5">
              <span className="text-[10px] text-faint">
                {relativeDayLabel(day.date, today) === 'Today'
                  ? 'Today'
                  : day.date.slice(8).replace(/^0/, '')}
              </span>
              <div
                className={clsx(
                  'grid h-9 w-full place-items-center rounded-lg text-[11px] font-semibold tabular-nums transition-colors',
                  day.complete
                    ? 'bg-accent text-white'
                    : day.done > 0
                      ? 'bg-accent-soft text-accent'
                      : 'bg-raised text-faint',
                  day.isToday && 'ring-2 ring-accent ring-offset-2 ring-offset-surface',
                )}
              >
                {day.scheduled ? `${day.done}/${day.scheduled}` : '–'}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Streak summary */}
      {habits.length > 0 && (
        <section className="card flex items-center gap-3 p-4">
          <span aria-hidden="true" className="text-2xl">
            {best.streak > 0 ? '🔥' : '🌱'}
          </span>
          <div className="min-w-0 flex-1">
            {best.streak > 0 && best.habit ? (
              <>
                <p className="text-sm font-medium">
                  {best.streak} {streakUnit(best.habit) === 'weeks' ? 'week' : 'day'}
                  {best.streak === 1 ? '' : 's'} on {best.habit.name}
                </p>
                <p className="text-xs text-muted">Your longest run right now.</p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium">No streak yet</p>
                <p className="text-xs text-muted">Tick something today and it starts.</p>
              </>
            )}
          </div>
          <Link to="/stats" className="shrink-0 text-xs font-medium text-accent hover:underline">
            Stats →
          </Link>
        </section>
      )}

      {/* Today's habits */}
      <section aria-label="Habits for today">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">
            {scheduled > 0 ? `${done} of ${scheduled} done` : 'Nothing scheduled'}
          </h2>
          {habits.length > 0 && !adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="text-xs font-medium text-accent hover:underline"
            >
              + Add habit
            </button>
          )}
        </div>

        {dueToday.length > 0 ? (
          <ul className="space-y-2">
            {dueToday.map((habit) => (
              <HabitRow key={habit.id} habit={habit} date={today} />
            ))}
          </ul>
        ) : (
          habits.length > 0 && (
            <p className="card p-4 text-sm text-muted">
              Nothing is due today. Enjoy the rest day.
            </p>
          )
        )}
      </section>

      {/* Empty state / add form */}
      {habits.length === 0 && !adding && (
        <section className="card p-5 text-center">
          <p className="text-2xl" aria-hidden="true">
            🌱
          </p>
          <h2 className="mt-2 font-semibold">Start with one habit</h2>
          <p className="mx-auto mt-1 max-w-xs text-sm text-muted">
            Everything stays on this device. No account, no network — it works on a plane.
          </p>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-4 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white"
          >
            Add your first habit
          </button>
        </section>
      )}

      {adding && (
        <HabitForm
          onSubmit={(draft) => {
            addHabit(draft)
            setAdding(false)
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      <DownloadAppButton />
    </div>
  )
}
