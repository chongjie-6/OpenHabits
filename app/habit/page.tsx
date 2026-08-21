import type { Metadata } from "next";
import { Suspense } from "react";
import { HabitDetail } from "@/components/HabitDetail";

export const metadata: Metadata = {
  title: "Habit",
  description:
    "One habit's own year — its heatmap, current and longest streak, cadence, and archive controls.",
  robots: { index: false, follow: false },
};

/**
 * Deliberately `/habit?id=…` rather than `/habit/[id]`.
 *
 * Habit ids are client-generated UUIDs that the server has never heard of, so a
 * dynamic segment could not be prerendered — every new habit would become a
 * server round-trip, and opening one offline would fail until the service
 * worker happened to have cached that exact URL. A search parameter keeps this
 * a single static page that is available offline the moment the shell is.
 */
export default function HabitPage() {
  return (
    <Suspense fallback={null}>
      <HabitDetail />
    </Suspense>
  );
}
