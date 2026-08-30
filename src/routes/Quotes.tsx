import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { QuoteCard } from '../components/QuoteCard'
import { diffDays, relativeDayLabel } from '../lib/date'
import { QUOTE_TAGS, QUOTES, matchesSearch, nextAppearance } from '../lib/quotes'
import { savedQuoteIds, useAppState } from '../lib/store'
import { useToday } from '../lib/ui'

type Tab = 'all' | 'saved'

export function Quotes() {
  const state = useAppState()
  const today = useToday()
  const [tab, setTab] = useState<Tab>('all')
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState<string | null>(null)

  // A fresh Set every render would defeat the memo below, which is the one thing
  // on this screen worth memoising: it filters all 168 quotes on every keystroke.
  const saved = useMemo(() => new Set(savedQuoteIds(state)), [state])

  const visible = useMemo(() => {
    return QUOTES.filter((quote) => {
      if (tab === 'saved' && !saved.has(quote.id)) return false
      if (tag && !quote.tags.includes(tag)) return false
      return matchesSearch(quote, query)
    })
  }, [tab, tag, query, saved])

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Quotes</h1>
        <p className="text-xs text-muted">
          {QUOTES.length} quotes, dealt one a day. {saved.size} saved.
        </p>
      </header>

      <div className="sticky top-0 z-10 -mx-4 space-y-2 bg-bg/95 px-4 pt-1 pb-2 backdrop-blur sm:top-13">
        <div className="flex gap-2">
          <div className="flex rounded-xl border border-border p-0.5">
            {(['all', 'saved'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                aria-pressed={tab === value}
                className={clsx(
                  'rounded-[10px] px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                  tab === value ? 'bg-accent text-white' : 'text-muted hover:text-ink',
                )}
              >
                {value}
              </button>
            ))}
          </div>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search text, author or source"
            aria-label="Search quotes"
            className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-faint"
          />
        </div>

        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5">
          <button
            type="button"
            onClick={() => setTag(null)}
            aria-pressed={tag === null}
            className={clsx(
              'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
              tag === null ? 'bg-ink text-bg' : 'border border-border text-muted hover:text-ink',
            )}
          >
            All tags
          </button>
          {QUOTE_TAGS.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setTag((current) => (current === name ? null : name))}
              aria-pressed={tag === name}
              className={clsx(
                'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                tag === name ? 'bg-ink text-bg' : 'border border-border text-muted hover:text-ink',
              )}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="card p-5 text-center text-sm text-muted">
          {tab === 'saved' && !query && !tag
            ? 'Nothing saved yet. Tap the ☆ on any quote.'
            : 'No quotes match that.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((quote) => {
            const when = nextAppearance(quote.id, today)
            const days = diffDays(today, when)
            return (
              <li key={quote.id}>
                <QuoteCard
                  quote={quote}
                  compact
                  footer={
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-border pt-2.5">
                      {quote.tags.map((name) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => setTag(name)}
                          className="rounded-full bg-raised px-2 py-0.5 text-[10px] text-muted transition-colors hover:text-ink"
                        >
                          {name}
                        </button>
                      ))}
                      <span className="ml-auto text-[11px] text-faint">
                        {days === 0
                          ? 'Showing today'
                          : `Next: ${relativeDayLabel(when, today)}${days > 1 ? ` · in ${days} days` : ''}`}
                      </span>
                    </div>
                  }
                />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
