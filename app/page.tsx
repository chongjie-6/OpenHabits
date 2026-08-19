import Link from "next/link";
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
    </>
  );
}
