"use client";

import { dismissNews, useCreatureNews } from "@/lib/party";

/**
 * What the last claim earned (§5.5): exp, levels, moves and finds. At the top
 * of the screen, so it never sits on the undo bar, and `role="status"` because
 * it reports the outcome of ticking a habit.
 */
export function CreatureNews() {
  const news = useCreatureNews();
  if (!news) return null;

  return (
    <div
      role="status"
      key={news.id}
      className="pointer-events-none fixed inset-x-0 top-0 z-30 flex justify-center px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)]"
    >
      <button
        type="button"
        onClick={dismissNews}
        aria-label={`${news.lines.join(". ")}. Dismiss`}
        className="pointer-events-auto w-full max-w-md rounded-card border border-border bg-surface px-4 py-3 text-left shadow-card"
      >
        {news.lines.map((line, i) => (
          <p
            key={line}
            className={
              i === 0 ? "text-[13px] font-medium" : "text-[12px] text-muted"
            }
          >
            {line}
          </p>
        ))}
      </button>
    </div>
  );
}
