import clsx from 'clsx'
import { formatShort, weekdayHeaders } from '../lib/date'
import { heatmapWeeks } from '../lib/history'
import type { HeatWeek } from '../lib/history'
import { useAppState } from '../lib/store'
import type { Habit, ISODate } from '../lib/types'

interface Props {
  endDate: ISODate
  weeks: number
  habit?: Habit
  selected?: ISODate | null
  onSelect?: (date: ISODate) => void
}

/**
 * A contribution-style grid: one column per week, one cell per day.
 *
 * The grid scrolls inside its own container rather than widening the page, so
 * the 53-week year view stays usable on a phone in landscape without the whole
 * layout picking up a horizontal scrollbar.
 *
 * Everything decorative — the month axis, the weekday gutter, the Less/More key
 * — is hidden from assistive technology, because each cell already carries its
 * own full date. Read the grid with a screen reader and you get a list of days,
 * not a list of days interrupted by stray month names.
 */
export function Heatmap({ endDate, weeks, habit, selected, onSelect }: Props) {
  const state = useAppState()
  const columns: HeatWeek[] = heatmapWeeks(state, endDate, weeks, state.settings.weekStart, habit)
  const headers = weekdayHeaders(state.settings.weekStart)

  /** What one cell says when read aloud. "0 of 0 done" is not an answer. */
  const describe = (cell: { date: ISODate; done: number; scheduled: number }) => {
    const who = habit ? `${habit.name}, ` : ''
    if (cell.scheduled === 0) return `${who}${formatShort(cell.date)}: nothing scheduled`
    return `${who}${formatShort(cell.date)}: ${cell.done} of ${cell.scheduled} done`
  }

  return (
    <div
      className="overflow-x-auto pb-1"
      role="group"
      aria-label={
        habit ? `${habit.name}: daily history` : `Daily history, past ${weeks} weeks`
      }
    >
      <div className="inline-flex min-w-full flex-col gap-1">
        <div className="flex gap-[3px] pl-6" aria-hidden="true">
          {columns.map((week) => (
            <span
              key={week.start}
              className="w-[13px] shrink-0 text-[10px] leading-none text-faint"
            >
              {week.label ?? ''}
            </span>
          ))}
        </div>

        <div className="flex gap-[3px]">
          <div className="flex w-6 shrink-0 flex-col gap-[3px] pr-1">
            {headers.map((day, i) => (
              <span
                key={day.key}
                className="h-[13px] text-[9px] leading-[13px] text-faint"
                aria-hidden="true"
              >
                {/* Every other row, or the labels crowd the cells. */}
                {i % 2 === 1 ? day.label : ''}
              </span>
            ))}
          </div>

          {columns.map((week) => (
            <div key={week.start} className="flex shrink-0 flex-col gap-[3px]">
              {week.cells.map((cell) =>
                cell.future ? (
                  <span key={cell.date} className="size-[13px] rounded-[3px] opacity-0" />
                ) : (
                  <button
                    key={cell.date}
                    type="button"
                    onClick={() => onSelect?.(cell.date)}
                    aria-label={describe(cell)}
                    aria-current={selected === cell.date ? 'date' : undefined}
                    title={`${formatShort(cell.date)} — ${cell.done}/${cell.scheduled}`}
                    className={clsx(
                      `heat-${cell.level}`,
                      'size-[13px] rounded-[3px] transition-transform',
                      onSelect && 'hover:scale-125',
                      selected === cell.date && 'ring-2 ring-ink ring-offset-1 ring-offset-surface',
                    )}
                  />
                ),
              )}
            </div>
          ))}
        </div>

        <div
          className="mt-1 flex items-center gap-1.5 pl-6 text-[10px] text-faint"
          aria-hidden="true"
        >
          <span>Less</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <span key={level} className={`heat-${level} size-[11px] rounded-[3px]`} />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  )
}
