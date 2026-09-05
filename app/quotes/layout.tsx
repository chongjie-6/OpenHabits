import type { Metadata } from "next";

const DESCRIPTION =
  "Every quote and fun fact in OpenHabits, and the ones you have saved — searchable by author, source and tag.";

export const metadata: Metadata = {
  title: "Collection",
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "OpenHabits",
    title: "Collection · OpenHabits",
    description: DESCRIPTION,
  },
};

/**
 * See the note in `app/week/layout.tsx` — `page.tsx` is a client component.
 *
 * The route stays `/quotes` now that the page shows facts too: it is a URL
 * people have bookmarked and the service worker has cached, and neither is
 * worth churning over a name.
 */
export default function QuotesLayout({ children }: LayoutProps<"/quotes">) {
  return children;
}
