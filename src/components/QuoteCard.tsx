import clsx from 'clsx'
import type { Quote } from '../lib/types'

interface Props {
  quote: Quote
  /** The heading above the quote. */
  eyebrow?: string
  compact?: boolean
  footer?: React.ReactNode
}

/**
 * The day's quote — read, not collected.
 *
 * There used to be a save button here and a library screen to see what it saved.
 * The library went; the button stayed, writing into a place nothing could show.
 * One quote a day is a grace note on a habit tracker, so it is now exactly that:
 * something to read on the way past, with nothing to manage.
 *
 * Saved quotes still exist in the schema and in `backup.ts`, so a backup written
 * by an older version imports without losing anything.
 */
export function QuoteCard({ quote, eyebrow, compact, footer }: Props) {
  return (
    <article className={clsx('card relative', compact ? 'p-4' : 'p-5 sm:p-6')}>
      {eyebrow && (
        <p className="mb-2 text-[11px] font-semibold tracking-widest text-faint uppercase">
          {eyebrow}
        </p>
      )}

      <blockquote
        className={clsx(
          'text-balance',
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
    </article>
  )
}
