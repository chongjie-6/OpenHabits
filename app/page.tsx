import Link from "next/link";
import { InstallCard } from "@/components/DownloadAppButton";
import { QuoteCard } from "@/components/QuoteCard";
import { TodayList } from "@/components/TodayList";

export default function TodayPage() {
  return (
    <>
      <QuoteCard />
      <div className="mt-2 text-right">
        <Link
          href="/quotes"
          className="text-[12px] text-muted transition-colors hover:text-foreground"
        >
          Collection →
        </Link>
      </div>
      <TodayList />
      {/* Renders nothing once the app is installed, so the tab's main job
          — ticking habits — keeps the top of the screen. */}
      <div className="mt-6 pb-4">
        <InstallCard />
      </div>
    </>
  );
}
