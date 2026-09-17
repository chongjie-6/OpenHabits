"use client";

import { createContext, useContext, useState } from "react";

/**
 * The day Today is browsing, as an offset from today (§6.8).
 *
 * An offset rather than a DayKey so the page still rolls over at midnight: a
 * stored date would keep showing yesterday once `useToday` moves on. Held above
 * the page's slots because the week strip and the habit list sit in different
 * ones, and a skin may reorder those in CSS.
 */
type BrowseDay = {
  offset: number;
  setOffset: React.Dispatch<React.SetStateAction<number>>;
};

const Context = createContext<BrowseDay | null>(null);

export function BrowseDayProvider({ children }: { children: React.ReactNode }) {
  const [offset, setOffset] = useState(0);
  return (
    <Context.Provider value={{ offset, setOffset }}>
      {children}
    </Context.Provider>
  );
}

export function useBrowseDay(): BrowseDay {
  const value = useContext(Context);
  if (!value) throw new Error("useBrowseDay needs a BrowseDayProvider");
  return value;
}
