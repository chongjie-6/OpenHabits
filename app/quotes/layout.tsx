import type { Metadata } from "next";

const DESCRIPTION =
  "Every quote in hapi, and the ones you have saved — searchable by author, source and tag.";

export const metadata: Metadata = {
  title: "Collection",
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "hapi",
    title: "Collection · hapi",
    description: DESCRIPTION,
  },
};

/** See the note in `app/week/layout.tsx` — `page.tsx` is a client component. */
export default function QuotesLayout({ children }: LayoutProps<"/quotes">) {
  return children;
}
