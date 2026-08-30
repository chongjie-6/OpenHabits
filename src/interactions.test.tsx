// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { App } from './App'
import { todayISO, weekDates } from './lib/date'
import { flush } from './lib/db'
import { addHabit, setCount } from './lib/repo'
import { countFor, getState, isQuoteSaved, resetState } from './lib/store'

/**
 * The interaction layer.
 *
 * `screens.test.tsx` proves the screens render; this proves the buttons on them
 * are wired to the store. It drives the real components in a real DOM and then
 * asserts against the store, so a handler that renders perfectly but updates
 * nothing fails here rather than in someone's hands.
 *
 * Elements are found by their accessible name — the same string a screen reader
 * announces — so a change that breaks the label breaks the test.
 */

const today = todayISO(0)

let container: HTMLDivElement
let root: Root

function mount(path = '/') {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>,
    )
  })
}

/** Find a control by its aria-label, exactly or by prefix. */
function button(match: string | RegExp): HTMLButtonElement {
  const all = [...container.querySelectorAll('button')]
  const found = all.find((el) => {
    const label = el.getAttribute('aria-label') ?? el.textContent ?? ''
    return typeof match === 'string' ? label.includes(match) : match.test(label)
  })
  if (!found) {
    const labels = all.map((el) => el.getAttribute('aria-label') ?? el.textContent).slice(0, 40)
    throw new Error(`No button matching ${String(match)}. Saw: ${JSON.stringify(labels)}`)
  }
  return found as HTMLButtonElement
}

const click = (el: HTMLElement) => act(() => el.click())

const text = () => container.textContent ?? ''

beforeEach(() => {
  resetState()
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('ticking a habit on Today', () => {
  it('records the tick, and untick puts it back', async () => {
    const habit = addHabit({
      name: 'Meditate',
      emoji: '🧘',
      color: 'violet',
      cadence: { kind: 'daily' },
      target: 1,
    })
    mount('/')

    expect(countFor(getState(), habit.id, today)).toBe(0)

    click(button('Mark done: Meditate'))
    expect(countFor(getState(), habit.id, today)).toBe(1)
    expect(text()).toContain('1 of 1 done')

    // Tapping a completed habit takes it back to zero rather than doing nothing.
    click(button('Mark not done: Meditate'))
    expect(countFor(getState(), habit.id, today)).toBe(0)

    await flush()
  })

  it('steps a counted habit up and down against its target', async () => {
    const habit = addHabit({
      name: 'Water',
      emoji: '💧',
      color: 'sky',
      cadence: { kind: 'daily' },
      target: 3,
      unit: 'glasses',
    })
    mount('/')

    click(button('One more: Water'))
    click(button('One more: Water'))
    expect(countFor(getState(), habit.id, today)).toBe(2)
    expect(text()).toContain('2')

    click(button('One fewer: Water'))
    expect(countFor(getState(), habit.id, today)).toBe(1)

    // It is not done until the whole target is met.
    expect(text()).toContain('0 of 1 done')
    click(button('One more: Water'))
    click(button('One more: Water'))
    expect(countFor(getState(), habit.id, today)).toBe(3)
    expect(text()).toContain('1 of 1 done')

    await flush()
  })
})

describe('adding a habit', () => {
  it('creates it from the empty state and shows it on Today', async () => {
    mount('/')
    expect(text()).toContain('Start with one habit')

    click(button('Add your first habit'))

    const name = container.querySelector<HTMLInputElement>('#habit-name')!
    act(() => {
      // React tracks the last value it wrote, so set through the native setter.
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!
      setter.call(name, 'Stretch')
      name.dispatchEvent(new Event('input', { bubbles: true }))
    })

    click(button('Add habit'))

    expect(getState().habits).toHaveLength(1)
    expect(getState().habits[0].name).toBe('Stretch')
    expect(text()).toContain('Stretch')
    expect(text()).not.toContain('Start with one habit')

    await flush()
  })
})

describe('backfilling on the week grid', () => {
  it('corrects a past day from a grid cell', async () => {
    const habit = addHabit({
      name: 'Read',
      emoji: '📖',
      color: 'emerald',
      cadence: { kind: 'daily' },
      target: 1,
    })
    mount('/week')

    // Any past cell for this habit; the label carries the habit and the date.
    const cell = button(/^Read, .*Tap to change/)
    click(cell)

    const ticked = getState().entries.filter((e) => !e.deletedAt)
    expect(ticked).toHaveLength(1)
    expect(ticked[0].habitId).toBe(habit.id)

    await flush()
  })

  it('enables exactly the days that have happened, and no more', () => {
    addHabit({
      name: 'Read',
      emoji: '📖',
      color: 'emerald',
      cadence: { kind: 'daily' },
      target: 1,
    })
    mount('/week')

    // Derived from the calendar rather than hardcoded: run this on a Monday and
    // six cells are in the future, run it on a Sunday and none are. Counting
    // both sides keeps the test meaningful whichever day it runs.
    const week = weekDates(today, getState().settings.weekStart)
    const past = week.filter((d) => d <= today).length
    const future = week.length - past

    const cells = [...container.querySelectorAll('button')].filter((el) =>
      (el.getAttribute('aria-label') ?? '').startsWith('Read,'),
    )
    expect(cells).toHaveLength(7)
    expect(cells.filter((el) => el.hasAttribute('disabled'))).toHaveLength(future)
    expect(cells.filter((el) => !el.hasAttribute('disabled'))).toHaveLength(past)

    // Clicking a future cell must record nothing.
    for (const el of cells.filter((c) => c.hasAttribute('disabled'))) click(el as HTMLElement)
    expect(getState().entries.filter((e) => !e.deletedAt)).toHaveLength(0)
  })
})

describe('saving a quote', () => {
  it('toggles the favourite from the Today card', async () => {
    mount('/')
    expect(getState().savedQuotes.filter((q) => !q.deletedAt)).toHaveLength(0)

    click(button('Save this quote'))
    const saved = getState().savedQuotes.filter((q) => !q.deletedAt)
    expect(saved).toHaveLength(1)
    expect(isQuoteSaved(getState(), saved[0].id)).toBe(true)

    click(button('Remove from saved quotes'))
    expect(getState().savedQuotes.filter((q) => !q.deletedAt)).toHaveLength(0)

    await flush()
  })
})

describe('settings', () => {
  it('reorders habits', async () => {
    const first = addHabit({
      name: 'Alpha',
      emoji: '🅰️',
      color: 'rose',
      cadence: { kind: 'daily' },
      target: 1,
    })
    const second = addHabit({
      name: 'Beta',
      emoji: '🅱️',
      color: 'sky',
      cadence: { kind: 'daily' },
      target: 1,
    })
    mount('/settings')

    click(button('Move Beta up'))

    const order = getState()
      .habits.slice()
      .sort((a, b) => a.order - b.order)
      .map((h) => h.id)
    expect(order).toEqual([second.id, first.id])

    await flush()
  })

  it('archives a habit, which hides it from Today but keeps its history', async () => {
    const habit = addHabit({
      name: 'Journal',
      emoji: '✍️',
      color: 'amber',
      cadence: { kind: 'daily' },
      target: 1,
    })
    setCount(habit.id, today, 1)
    mount('/settings')

    click(button('Archive Journal'))
    expect(getState().habits[0].archivedAt).not.toBeNull()
    // The tick survives archiving.
    expect(countFor(getState(), habit.id, today)).toBe(1)

    act(() => root.unmount())
    container.remove()
    mount('/')
    expect(text()).not.toContain('Journal')

    await flush()
  })
})

describe('the day rollover setting', () => {
  it('changes which day Today is writing to', async () => {
    const habit = addHabit({
      name: 'Late',
      emoji: '🌙',
      color: 'slate',
      cadence: { kind: 'daily' },
      target: 1,
    })
    mount('/')
    click(button('Mark done: Late'))

    const written = getState().entries.find((e) => !e.deletedAt)!
    expect(written.date).toBe(todayISO(getState().settings.rolloverHour))

    await flush()
    expect(habit.id).toBe(written.habitId)
  })
})
