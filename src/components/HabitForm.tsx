import { useState } from 'react'
import clsx from 'clsx'
import { WEEKDAY_NAMES, weekdayHeaders } from '../lib/date'
import { useAppState } from '../lib/store'
import { HABIT_EMOJI, habitStyle } from '../lib/ui'
import { HABIT_COLORS } from '../lib/types'
import type { Cadence, Habit, HabitColor, Weekday } from '../lib/types'
import type { HabitDraft } from '../lib/repo'

interface Props {
  /** Omit to create; pass a habit to edit it. */
  habit?: Habit
  onSubmit: (draft: HabitDraft) => void
  onCancel?: () => void
  submitLabel?: string
}

type CadenceKind = Cadence['kind']

/** Shared by the add form on Today and the edit form on the habit screen. */
export function HabitForm({ habit, onSubmit, onCancel, submitLabel = 'Add habit' }: Props) {
  const { settings } = useAppState()
  const [name, setName] = useState(habit?.name ?? '')
  const [emoji, setEmoji] = useState(habit?.emoji ?? HABIT_EMOJI[0])
  const [color, setColor] = useState<HabitColor>(habit?.color ?? 'sky')
  const [kind, setKind] = useState<CadenceKind>(habit?.cadence.kind ?? 'daily')
  const [days, setDays] = useState<Weekday[]>(
    habit?.cadence.kind === 'weekdays' ? habit.cadence.days : [1, 2, 3, 4, 5],
  )
  const [times, setTimes] = useState(
    habit?.cadence.kind === 'timesPerWeek' ? habit.cadence.times : 3,
  )
  const [target, setTarget] = useState(habit?.target ?? 1)
  const [unit, setUnit] = useState(habit?.unit ?? '')

  const trimmed = name.trim()
  const invalid = !trimmed || (kind === 'weekdays' && days.length === 0)

  function buildCadence(): Cadence {
    if (kind === 'weekdays') return { kind: 'weekdays', days: [...days].sort((a, b) => a - b) }
    if (kind === 'timesPerWeek') return { kind: 'timesPerWeek', times }
    return { kind: 'daily' }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (invalid) return
    onSubmit({
      name: trimmed,
      emoji,
      color,
      cadence: buildCadence(),
      target,
      unit: target > 1 ? unit : undefined,
    })
    if (!habit) {
      setName('')
      setTarget(1)
      setUnit('')
    }
  }

  function toggleDay(day: Weekday) {
    setDays((current) =>
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day],
    )
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4 p-4" style={habitStyle(color)}>
      <div>
        <label htmlFor="habit-name" className="mb-1 block text-xs font-medium text-muted">
          Name
        </label>
        <input
          id="habit-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Drink water"
          maxLength={60}
          autoComplete="off"
          className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm outline-none placeholder:text-faint"
        />
      </div>

      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-muted">Icon</legend>
        <div className="flex flex-wrap gap-1">
          {HABIT_EMOJI.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setEmoji(option)}
              aria-pressed={emoji === option}
              aria-label={`Icon ${option}`}
              className={clsx(
                'grid size-9 place-items-center rounded-lg text-lg transition-colors',
                emoji === option ? 'ring-2' : 'hover:bg-raised',
              )}
              style={
                emoji === option
                  ? {
                      background: 'color-mix(in oklab, var(--habit) 14%, transparent)',
                      // @ts-expect-error CSS custom property for the ring colour
                      '--tw-ring-color': 'var(--habit)',
                    }
                  : undefined
              }
            >
              {option}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-muted">Colour</legend>
        <div className="flex gap-2">
          {HABIT_COLORS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setColor(option)}
              aria-pressed={color === option}
              aria-label={option}
              className={clsx(
                'size-8 rounded-full transition-transform',
                color === option ? 'scale-110 ring-2 ring-ink ring-offset-2 ring-offset-surface' : '',
              )}
              style={{ background: `var(--habit-${option})` }}
            />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-muted">How often</legend>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['daily', 'Every day'],
              ['weekdays', 'Certain days'],
              ['timesPerWeek', 'n× a week'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setKind(value)}
              aria-pressed={kind === value}
              className={clsx(
                'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                kind === value
                  ? 'bg-secondary text-white'
                  : 'border border-border text-muted hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {kind === 'weekdays' && (
          <div className="mt-2.5 flex gap-1">
            {weekdayHeaders(settings.weekStart).map(({ key }) => {
              const day = key as Weekday
              const on = days.includes(day)
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  aria-pressed={on}
                  aria-label={WEEKDAY_NAMES[day]}
                  className={clsx(
                    'size-9 rounded-lg text-xs font-medium transition-colors',
                    on ? 'text-white' : 'border border-border text-muted hover:text-ink',
                  )}
                  style={on ? { background: 'var(--habit)' } : undefined}
                >
                  {WEEKDAY_NAMES[day].slice(0, 1)}
                </button>
              )
            })}
          </div>
        )}

        {kind === 'timesPerWeek' && (
          <div className="mt-2.5 flex items-center gap-2">
            <input
              type="range"
              min={1}
              max={7}
              value={times}
              onChange={(e) => setTimes(Number(e.target.value))}
              className="flex-1 accent-[var(--habit)]"
              aria-label="Times per week"
            />
            <span className="w-20 text-sm tabular-nums">{times}× a week</span>
          </div>
        )}
        {kind === 'timesPerWeek' && (
          <p className="mt-1.5 text-xs text-muted">
            Any days you like. Streaks count whole weeks, and no single day counts as a miss.
          </p>
        )}
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-muted">Daily target</legend>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={99}
            value={target}
            onChange={(e) => setTarget(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
            aria-label="Times per day"
            className="w-20 rounded-xl border border-border bg-bg px-3 py-2 text-sm outline-none"
          />
          {target > 1 && (
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="glasses"
              maxLength={20}
              aria-label="Unit"
              className="w-32 rounded-xl border border-border bg-bg px-3 py-2 text-sm outline-none placeholder:text-faint"
            />
          )}
          <span className="text-xs text-muted">
            {target > 1 ? `${emoji} ${trimmed || 'Habit'} × ${target}` : 'A simple tick'}
          </span>
        </div>
      </fieldset>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={invalid}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-dark disabled:opacity-40 disabled:hover:bg-accent"
        >
          {submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-border px-4 py-2 text-sm text-muted hover:text-ink"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
