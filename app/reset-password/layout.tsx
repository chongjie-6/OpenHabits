import type { Metadata } from "next";

const DESCRIPTION = "Set a new password for your OpenHabits account.";

export const metadata: Metadata = {
  title: "Choose a new password",
  description: DESCRIPTION,
  // Noindex for the reason `/habit` is: the page is meaningless without the
  // `?token=` a crawler will never have, and the URL a crawler *would* index is
  // one that only ever renders the dead-link state.
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    siteName: "OpenHabits",
    title: "Choose a new password · OpenHabits",
    description: DESCRIPTION,
  },
};

/** See the note in `app/week/layout.tsx` — `page.tsx` is a client component. */
export default function ResetPasswordLayout({ children }: LayoutProps<"/reset-password">) {
  return children;
}
