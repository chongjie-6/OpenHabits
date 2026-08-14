import Link from "next/link";
import { QuoteCard } from "@/components/quote-card";
import { TodayList } from "@/components/today-list";

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
    </>
  );
}
