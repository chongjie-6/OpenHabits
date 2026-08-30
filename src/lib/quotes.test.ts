import { describe, expect, it } from 'vitest'
import { addDays } from './date'
import { MIN_GAP, QUOTES, deckFor, nextAppearance, quoteForDate } from './quotes'
import { QUOTE_TAGS } from './quotes-data'

const N = QUOTES.length

describe('corpus', () => {
  it('has 168 quotes with unique, stable ids', () => {
    expect(N).toBe(168)
    expect(new Set(QUOTES.map((q) => q.id)).size).toBe(N)
  })

  it('gives every quote an author and at least one tag', () => {
    for (const q of QUOTES) {
      expect(q.text.length).toBeGreaterThan(0)
      expect(q.author.length).toBeGreaterThan(0)
      expect(q.tags.length).toBeGreaterThan(0)
    }
    expect(QUOTE_TAGS.length).toBeGreaterThan(5)
  })
})

describe('deck', () => {
  it('is a permutation of the corpus in every cycle', () => {
    for (let cycle = -3; cycle < 12; cycle++) {
      const deck = deckFor(cycle)
      expect(deck).toHaveLength(N)
      expect(new Set(deck).size).toBe(N)
    }
  })

  it('deals the whole corpus within each cycle', () => {
    // An aligned cycle is a permutation, so it deals all 168 and no more.
    let date = '2024-01-01'
    const seen = new Set<number>()
    for (let i = 0; i < N; i++) {
      seen.add(quoteForDate(date).id)
      date = addDays(date, 1)
    }
    expect(seen.size).toBe(N)
  })

  it('never repeats a quote within MIN_GAP days, seams included', () => {
    // Walk several full cycles a day at a time; the seams are the hard part.
    const lastSeen = new Map<number, number>()
    let date = '2024-01-01'
    let worstGap = Infinity
    for (let day = 0; day < N * 6; day++) {
      const id = quoteForDate(date).id
      const previous = lastSeen.get(id)
      if (previous !== undefined) worstGap = Math.min(worstGap, day - previous)
      lastSeen.set(id, day)
      date = addDays(date, 1)
    }
    expect(MIN_GAP).toBe(30)
    expect(worstGap).toBeGreaterThanOrEqual(MIN_GAP)
  })

  it('is stable across repeated calls and cache eviction', () => {
    const first = quoteForDate('2026-08-30').id
    // Touch enough distinct cycles to blow past the deck cache limit.
    for (let cycle = 0; cycle < 40; cycle++) deckFor(cycle)
    expect(quoteForDate('2026-08-30').id).toBe(first)
  })

  it('handles dates before the epoch', () => {
    const q = quoteForDate('2019-06-15')
    expect(QUOTES.some((x) => x.id === q.id)).toBe(true)
    expect(quoteForDate('2019-06-15').id).toBe(q.id)
  })
})

describe('nextAppearance', () => {
  it('returns today when today is the quote-s day', () => {
    const today = '2026-08-30'
    const id = quoteForDate(today).id
    expect(nextAppearance(id, today)).toBe(today)
  })

  it('lands on a day that actually shows that quote', () => {
    const from = '2026-08-30'
    for (const q of QUOTES) {
      const when = nextAppearance(q.id, from)
      expect(quoteForDate(when).id).toBe(q.id)
      expect(when >= from).toBe(true)
    }
  })

  it('returns the earliest matching day, not just any of them', () => {
    // Brute force: walk forward a day at a time and compare. A quote just missed
    // in the current deck can sit at the far end of the next, so the search may
    // legitimately run to nearly two cycles.
    const from = '2026-02-01'
    for (const q of QUOTES) {
      let brute = from
      while (quoteForDate(brute).id !== q.id) brute = addDays(brute, 1)
      expect(nextAppearance(q.id, from)).toBe(brute)
      expect(brute <= addDays(from, 2 * N)).toBe(true)
    }
  })
})
