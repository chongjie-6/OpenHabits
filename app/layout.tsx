import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BottomNav, Hydrator } from "@/components/AppChrome";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const DESCRIPTION =
  "A daily quote, and a habit tracker that shows you the year you had. Local-first, offline, no account.";

export const metadata: Metadata = {
  title: { default: "OpenHabits — daily quotes & habits", template: "%s · OpenHabits" },
  description: DESCRIPTION,
  applicationName: "OpenHabits",
  appleWebApp: { capable: true, title: "OpenHabits", statusBarStyle: "default" },
  formatDetection: { telephone: false, date: false, address: false },
  openGraph: {
    type: "website",
    siteName: "OpenHabits",
    title: "OpenHabits — daily quotes & habits",
    description: DESCRIPTION,
  },
  twitter: { card: "summary", title: "OpenHabits", description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbf9" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1117" },
  ],
  // The app is a fixed-chrome standalone surface; letting it zoom breaks the
  // bottom nav against the safe area.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Blocking, pre-paint. See lib/theme.ts. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <Hydrator />
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-6 mb-safe">
          {children}
        </main>
        <BottomNav />
      </body>
    </html>
  );
}
