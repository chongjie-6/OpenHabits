import { useState } from 'react'
import { Link } from 'react-router'
import { DownloadAppButton } from '../components/DownloadAppButton'
import { HabitForm } from '../components/HabitForm'
import { HabitRow } from '../components/HabitRow'
import { QuoteCard } from '../components/QuoteCard'
import { formatShort } from '../lib/date'
import { dayCompletion, scheduledFor } from '../lib/history'
import { quoteForDate } from '../lib/quotes'
import { addHabit } from '../lib/repo'
import { activeHabits, useAppState } from '../lib/store'
import { currentStreak, streakUnit } from '../lib/streaks'
import { useToday } from '../lib/ui'

function ProgressRing({ done, total }: { done: number; total: number }) {
  const ratio = total ? done / total : 0
  const size = 104
  const stroke = 7
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
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
      <span className="absolute inset-0 grid place-items-center text-2xl font-semibold tabular-nums">
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
  const quote = quoteForDate(today)

  // The longest run going right now, so the streak badge says something
  // specific rather than averaging every habit into a meaningless number.
  const best = habits.reduce(
    (leader, habit) => {
      const streak = currentStreak(state, habit, today, state.settings.weekStart)
      return streak > leader.streak ? { habit, streak } : leader
    },
    { habit: habits[0], streak: 0 },
  )

  return (
    <div className="space-y-5">
      {/* Check-in: the one thing this screen is for */}
      <section className="pt-1 text-center">
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">
          {formatShort(today)}
        </p>
        <div className="mt-2">
          <ProgressRing done={done} total={scheduled} />
        </div>
        <p className="mt-2 text-sm text-muted">
          {scheduled > 0 ? `${done} of ${scheduled} done` : 'Nothing scheduled'}
        </p>
        {best.streak > 0 && best.habit && (
          <Link
            to="/stats"
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-dark transition-opacity hover:opacity-80"
          >
            🔥 {best.streak} {streakUnit(best.habit) === 'weeks' ? 'week' : 'day'}
            {best.streak === 1 ? '' : 's'} on {best.habit.name}
          </Link>
        )}
      </section>

      {/* Today's habits */}
      <section aria-label="Habits for today">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Today</h2>
          {habits.length > 0 && !adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="text-xs font-medium text-secondary hover:underline"
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
            className="mt-4 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-dark"
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

      {/* Tucked below the habits — a quiet close rather than the day's opener */}
      <QuoteCard quote={quote} eyebrow="Quote of the day" compact />

      <DownloadAppButton />
    </div>
  )
}
