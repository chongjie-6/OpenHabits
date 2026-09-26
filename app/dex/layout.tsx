import type { Metadata } from "next";

const DESCRIPTION =
  "Raise a party of creatures on the days you finish your habits. See how they are growing, and who is left to find.";

export const metadata: Metadata = {
  title: "Creatures",
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "OpenHabits",
    title: "Creatures · OpenHabits",
    description: DESCRIPTION,
  },
};

/** See the note in `app/week/layout.tsx` — `page.tsx` is a client component. */
export default function DexLayout({ children }: LayoutProps<"/dex">) {
  return children;
}
