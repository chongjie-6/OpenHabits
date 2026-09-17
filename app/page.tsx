import Link from "next/link";
import { BrowseDayProvider } from "@/components/BrowseDay";
import { InstallCard } from "@/components/DownloadAppButton";
import { DailyCard } from "@/components/DailyCard";
import { TodayList } from "@/components/TodayList";
import { WeekStrip } from "@/components/WeekStrip";

/**
 * Today — DESIGN.md §5.
 *
 * The slots are a flex column so a skin can reorder them in CSS rather than in
 * React. The week strip carries no `order`, so it stays on top in every skin.
 * `grid` puts the habits first and the daily card at the foot of the page,
 * and doing that with `order` means it is already true at first paint: the
 * ordering hangs off `data-skin`, which the pre-paint script sets, so nothing
 * has to wait for hydration and nothing jumps. Reordering these in JS would put
 * the hero of the page behind the store's hydration gate for no reason.
 */
export default function TodayPage() {
  return (
    <BrowseDayProvider>
      <div className="flex flex-col">
        <div data-slot="week" className="mb-6">
          <WeekStrip />
        </div>

        <div data-slot="daily">
          <DailyCard />
          <div className="mt-2 text-right">
            <Link
              href="/quotes"
              className="text-[12px] text-muted transition-colors hover:text-foreground"
            >
              Collection →
            </Link>
          </div>
        </div>

        <div data-slot="habits">
          <TodayList />
        </div>

        {/* Renders nothing once the app is installed, so the tab's main job
          — ticking habits — keeps the top of the screen. */}
        <div data-slot="install" className="mt-6 pb-4">
          <InstallCard />
        </div>
      </div>
    </BrowseDayProvider>
  );
}
