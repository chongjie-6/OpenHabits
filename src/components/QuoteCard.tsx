import clsx from 'clsx'
import { setQuoteSaved } from '../lib/repo'
import { isQuoteSaved, useAppState } from '../lib/store'
import type { Quote } from '../lib/types'

interface Props {
  quote: Quote
  /** The heading above the quote; omitted on the collection screen. */
  eyebrow?: string
  compact?: boolean
  footer?: React.ReactNode
}

export function QuoteCard({ quote, eyebrow, compact, footer }: Props) {
  const state = useAppState()
  const saved = isQuoteSaved(state, quote.id)

  return (
    <article className={clsx('card relative', compact ? 'p-4' : 'p-5 sm:p-6')}>
      {eyebrow && (
        <p className="mb-2 text-[11px] font-semibold tracking-widest text-faint uppercase">
          {eyebrow}
        </p>
      )}

      <blockquote
        className={clsx(
          'pr-9 text-balance',
          compact ? 'text-[15px] leading-relaxed' : 'text-lg leading-relaxed sm:text-xl',
        )}
      >
        {quote.text}
      </blockquote>

      <figcaption className="mt-3 text-sm text-muted">
        <span className="font-medium text-ink">{quote.author}</span>
        {quote.source && <span className="text-muted"> · {quote.source}</span>}
      </figcaption>

      {footer}

      <button
        type="button"
        onClick={() => setQuoteSaved(quote.id, !saved)}
        aria-pressed={saved}
        aria-label={saved ? 'Remove from saved quotes' : 'Save this quote'}
        title={saved ? 'Saved' : 'Save'}
        className={clsx(
          'absolute top-3 right-3 rounded-full p-2 text-lg leading-none transition-colors',
          saved ? 'text-secondary' : 'text-faint hover:text-muted',
        )}
      >
        {saved ? '★' : '☆'}
      </button>
    </article>
  )
}
