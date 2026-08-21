import type { Metadata } from "next";

const DESCRIPTION =
  "Seven days across every habit. Tick today, and backfill or correct the days you missed.";

export const metadata: Metadata = {
  title: "Week",
  description: DESCRIPTION,
  openGraph: { type: "website", siteName: "hapi", title: "Week · hapi", description: DESCRIPTION },
};

/**
 * Metadata is only readable from a Server Component and `page.tsx` here is a
 * client component (it owns the grid's local state), so the route's metadata
 * lives in this layout instead. It adds no markup.
 */
export default function WeekLayout({ children }: LayoutProps<"/week">) {
  return children;
}
