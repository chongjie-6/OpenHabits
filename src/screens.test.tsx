import 'fake-indexeddb/auto'
import { StrictMode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from './App'
import { ROUTES } from './route-list'
import { todayISO } from './lib/date'
import { addHabit, setCount, setQuoteSaved } from './lib/repo'
import { getState, resetState } from './lib/store'

/**
 * A smoke test for the screens themselves.
 *
 * The pure-logic suites prove the maths; this proves the six screens actually
 * render that maths without throwing — with real habits, real ticks and real
 * streaks, not just an empty state. Rendering to a string needs no DOM, so it
 * stays fast and has nothing to flake on.
 */

const today = todayISO(0)
const daysAgo = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function render(url: string): string {
  return renderToStaticMarkup(
    <StrictMode>
      <StaticRouter location={url}>
        <App />
      </StaticRouter>
    </StrictMode>,
  )
}

function seed() {
  const water = addHabit({
    name: 'Drink water',
    emoji: '💧',
    color: 'sky',
    cadence: { kind: 'daily' },
    target: 8,
    unit: 'glasses',
  })
  const run = addHabit({
    name: 'Run',
    emoji: '🏃',
    color: 'emerald',
    cadence: { kind: 'weekdays', days: [1, 3, 5] },
    target: 1,
  })
  const read = addHabit({
    name: 'Read',
    emoji: '📖',
    color: 'violet',
    cadence: { kind: 'timesPerWeek', times: 3 },
    target: 1,
  })

  for (let i = 0; i < 10; i++) {
    setCount(water.id, daysAgo(i), i % 3 === 0 ? 8 : 4)
    setCount(run.id, daysAgo(i), i % 2 === 0 ? 1 : 0)
    setCount(read.id, daysAgo(i), 1)
  }
  setQuoteSaved(7, true)
  return { water, run, read }
}

beforeEach(() => {
  resetState()
})

describe('every route renders', () => {
  it('renders each screen empty, before any habit exists', () => {
    for (const route of ROUTES) {
      const html = render(route)
      expect(html, route).toContain('OpenHabits')
    }
  })

  it('renders each screen with real data', () => {
    seed()
    for (const route of ROUTES) {
      const html = render(route)
      expect(html, route).toContain('OpenHabits')
      expect(html, route).not.toContain('NaN')
      expect(html, route).not.toContain('undefined')
    }
  })
})

describe('today', () => {
  it('shows the day-s quote, the habits due and the progress count', () => {
    seed()
    const html = render('/')
    expect(html).toContain('Quote of the day')
    expect(html).toContain('Drink water')
    expect(html).toContain('Read') // n×/week habits appear every day
    expect(html).toMatch(/\d+ of \d+ done|Nothing scheduled/)
  })

  it('offers the empty state when there are no habits', () => {
    expect(render('/')).toContain('Start with one habit')
  })
})

describe('week', () => {
  it('renders a row per habit and a column per day', () => {
    seed()
    const html = render('/week')
    expect(html).toContain('Drink water')
    expect(html).toContain('Run')
    // Seven day headers plus the totals row.
    expect(html).toContain('Done')
  })
})

describe('stats', () => {
  it('renders the heatmap, the summary stats and the per-habit list', () => {
    seed()
    const html = render('/stats')
    expect(html).toContain('Perfect days')
    expect(html).toContain('Completion')
    expect(html).toContain('By habit')
    expect(html).toContain('heat-')
  })
})

describe('quotes', () => {
  it('lists the whole corpus with next-appearance dates', () => {
    seed()
    const html = render('/quotes')
    expect(html).toContain('168 quotes')
    expect(html).toContain('1 saved')
    expect(html).toMatch(/Next:|Showing today/)
  })
})

describe('settings', () => {
  it('shows the habit list, sync state and the backup controls', () => {
    seed()
    const html = render('/settings')
    expect(html).toContain('Drink water')
    expect(html).toContain('Account')
    expect(html).toContain('Sync is off')
    expect(html).toContain('Export')
    expect(html).toContain('Reset everything')
  })
})

describe('habit detail', () => {
  it('renders the habit-s own history and cadence', () => {
    const { run } = seed()
    const html = render(`/habit?id=${run.id}`)
    expect(html).toContain('Run')
    expect(html).toContain('Mon, Wed, Fri')
    expect(html).toContain('Longest')
  })

  it('says so plainly when the id does not resolve', () => {
    seed()
    expect(render('/habit?id=nope')).toContain('no longer exists')
  })

  it('does not resurrect a deleted habit', () => {
    const { water } = seed()
    const state = getState()
    // Simulate the tombstone a delete leaves behind.
    resetState({
      ...state,
      habits: state.habits.map((h) => (h.id === water.id ? { ...h, deletedAt: Date.now() } : h)),
    })
    expect(render(`/habit?id=${water.id}`)).toContain('no longer exists')
    expect(render('/')).not.toContain('Drink water')
  })
})

describe('rest days', () => {
  it('shows a rest day rather than a miss on an unscheduled weekday', () => {
    const run = addHabit({
      name: 'Gym',
      emoji: '💪',
      color: 'rose',
      // Scheduled on no day that can be today, so today is always a rest day.
      cadence: { kind: 'weekdays', days: [] },
      target: 1,
    })
    expect(run.cadence).toEqual({ kind: 'weekdays', days: [] })
    const html = render('/')
    expect(html).toContain('Nothing is due today')
    expect(html).not.toContain('Missed')
  })
})

describe('counted habits', () => {
  it('renders progress against the target, not a bare tick', () => {
    const water = addHabit({
      name: 'Water',
      emoji: '💧',
      color: 'sky',
      cadence: { kind: 'daily' },
      target: 8,
      unit: 'glasses',
    })
    setCount(water.id, today, 3)
    const html = render('/')
    expect(html).toContain('/8')
    expect(html).toContain('3')
  })
})
