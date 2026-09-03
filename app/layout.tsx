import type { Metadata, Viewport } from "next";
import {
  Archivo_Black,
  Geist,
  Geist_Mono,
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  Space_Grotesk,
} from "next/font/google";
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

/**
 * The skin faces — DESIGN.md §6.5.
 *
 * `preload: false` on all four, and it is not an oversight. Which skin is
 * active is a client fact (`lib/skin.ts`), so the prerendered HTML cannot know
 * which of these three sets to preload; preloading all of them would push four
 * families down the wire on every first paint to use at most two. Without the
 * preload hint they are fetched when the skin's CSS actually references them,
 * which is the moment they are needed. `display: "swap"` — inherited from
 * next/font's default — means a skinned first paint lands on the fallback stack
 * and swaps, and each skin's fallbacks were chosen with that in mind.
 *
 * Classic pays nothing for any of this: `classic` references only Geist.
 */
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  preload: false,
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  preload: false,
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  preload: false,
});

const archivoBlack = Archivo_Black({
  variable: "--font-archivo-black",
  subsets: ["latin"],
  weight: "400",
  preload: false,
});

const FONT_VARIABLES = [
  geistSans.variable,
  geistMono.variable,
  plexSans.variable,
  plexMono.variable,
  spaceGrotesk.variable,
  archivoBlack.variable,
].join(" ");

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
      className={`${FONT_VARIABLES} h-full antialiased`}
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
