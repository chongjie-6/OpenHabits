"use client";

/**
 * The client's view of its creatures (§5.5, §13.18). The server owns every
 * number; this keeps the last answer for offline display, asks for claims, and
 * notices evolutions. Beside the store rather than in it, like `lib/undo.ts`:
 * nothing here is the user's data, and none of it syncs.
 */

import { useOffline } from "next/offline";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  claimNews,
  noticeEvolutions,
  payout,
  type ClaimResult,
  type CreatureState,
  type Evolution,
} from "./creatures";
import { firstDayOf, statFor } from "./history";
import { useSignedIn } from "./session";
import * as store from "./store";
import { syncNow } from "./sync/client";
import { useToday } from "./use-today";
import type { DayKey } from "./types";

/** Long enough to read three lines, short enough to be out of the way. */
const NEWS_TTL_MS = 6000;

/** Ticks come in bursts; claim once they pause, as the list does (§6.9). */
const CLAIM_DELAY_MS = 2000;

type Cached = { state: CreatureState; seen: Record<string, number> };

export type News = { id: number; lines: string[] };

let state: CreatureState | null = null;
let seen: Record<string, number> = {};
let evolutions: Evolution[] = [];
let news: News | null = null;
/** Held while an evolution plays, which would otherwise cover it. */
let heldNews: string[] = [];
let newsTimer: ReturnType<typeof setTimeout> | null = null;
let nextNewsId = 1;

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Per account, so a borrowed phone never shows the previous person's party.
 * Null before the device's first sync, when there is no account to key by.
 */
const CACHE_PREFIX = "openhabits:creatures:";

function cacheKey(): string | null {
  const account = store.syncMeta().accountId;
  return account ? CACHE_PREFIX + account : null;
}

/** Signing out takes the account's data off the device, and this is some of it. */
function forget(): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(CACHE_PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // Unavailable storage holds nothing to forget.
  }
  state = null;
  seen = {};
  evolutions = [];
  heldNews = [];
  dismissNews();
  emit();
}

function readCache(): void {
  const key = cacheKey();
  if (!key || state) return;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const cached = JSON.parse(raw) as Cached;
    state = cached.state;
    seen = cached.seen;
  } catch {
    // Unreadable or unavailable: the next answer from the server replaces it.
  }
}

function adopt(next: CreatureState): void {
  const noticed = noticeEvolutions(seen, next.creatures);
  state = next;
  seen = noticed.seen;
  evolutions = [...evolutions, ...noticed.evolutions];

  const key = cacheKey();
  try {
    if (key) localStorage.setItem(key, JSON.stringify({ state, seen }));
  } catch {
    // Storage full or disabled: offline display falls back to nothing.
  }
  emit();
}

function tell(lines: string[]): void {
  if (lines.length === 0) return;
  if (evolutions.length > 0) {
    heldNews = [...heldNews, ...lines];
    return;
  }
  if (newsTimer !== null) clearTimeout(newsTimer);
  const id = nextNewsId++;
  news = { id, lines };
  newsTimer = setTimeout(() => {
    if (news?.id === id) dismissNews();
  }, NEWS_TTL_MS);
  emit();
}

export function dismissNews(): void {
  if (newsTimer !== null) clearTimeout(newsTimer);
  newsTimer = null;
  if (news === null) return;
  news = null;
  emit();
}

/** The head of the queue has played; show the next, if there is one. */
export function evolutionShown(): void {
  evolutions = evolutions.slice(1);
  emit();
  if (evolutions.length === 0 && heldNews.length > 0) {
    const lines = heldNews;
    heldNews = [];
    tell(lines);
  }
}

/** The request's answer, or the message to show when it was refused. */
async function post<T>(body: unknown): Promise<T | string> {
  try {
    const response = await fetch("/api/creatures", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      credentials: "same-origin",
    });
    const json = await response.json();
    return response.ok ? (json as T) : (json.error ?? "Something went wrong.");
  } catch {
    return "You're offline. Try again when you're connected.";
  }
}

export async function refreshCreatures(): Promise<void> {
  try {
    const response = await fetch("/api/creatures", {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (response.ok) adopt(await response.json());
  } catch {
    // Offline: the cached answer stands.
  }
}

let claiming = false;

async function claim(day: DayKey): Promise<void> {
  // A second would only be paid nothing, and would read a stale `before`.
  if (claiming) return;
  claiming = true;
  try {
    // Sync polls every five minutes, and the server pays from what it holds.
    await syncNow();
    const before = state;
    const result = await post<ClaimResult>({ action: "claim", day });
    if (typeof result === "string") return;
    adopt(result);
    tell(claimNews(before, result));
  } finally {
    claiming = false;
  }
}

/** Null on success; otherwise the reason, for the screen that asked. */
export async function chooseStarter(line: string): Promise<string | null> {
  const result = await post<CreatureState>({ action: "choose", line });
  if (typeof result === "string") return result;
  adopt(result);
  return null;
}

/** The first line is the buddy. Null on success; otherwise the reason. */
export async function setParty(lines: string[]): Promise<string | null> {
  const result = await post<CreatureState>({ action: "party", lines });
  if (typeof result === "string") return result;
  adopt(result);
  return null;
}

function snapshot(): CreatureState | null {
  readCache();
  return state;
}

/** Null signed out, on the server, and until an answer or a cache exists. */
export function useCreatures(): CreatureState | null {
  const signedIn = useSignedIn();
  const current = useSyncExternalStore(subscribe, snapshot, () => null);
  return signedIn ? current : null;
}

export function useCreatureNews(): News | null {
  return useSyncExternalStore(
    subscribe,
    () => news,
    () => null,
  );
}

export function useEvolution(): Evolution | null {
  return useSyncExternalStore(
    subscribe,
    () => evolutions[0] ?? null,
    () => null,
  );
}

/**
 * Mount once, beside `useSync`. Fetches on sign-in and claims today whenever
 * the device's own reading of it reaches a tier the server has not yet paid —
 * so most ticks cost no request, and nothing below the lowest tier ever does.
 */
export function useCreatureClaims(): void {
  const { hydrated, habits, entries, settings } = store.useOpenHabits();
  const signedIn = useSignedIn();
  const today = useToday(settings.dayStartHour);
  const current = useSyncExternalStore(subscribe, snapshot, () => null);
  const wasSignedIn = useRef(false);

  useEffect(() => {
    // Only a real sign-out: hydration reports signed out first, every load.
    if (wasSignedIn.current && !signedIn) forget();
    wasSignedIn.current = signedIn;
    if (signedIn && hydrated) void refreshCreatures();
  }, [signedIn, hydrated]);

  const stat =
    hydrated && today
      ? statFor(
          habits,
          entries,
          today,
          settings.weekStartsOn,
          firstDayOf(habits),
        )
      : null;
  const tier = stat ? payout(stat.completed, stat.scheduled) : 0;
  const paid = current?.lastDay?.day === today ? current.lastDay.expPaid : 0;
  const owed = signedIn && today !== null && tier > paid;
  const isOffline = useOffline();
  const [returns, setReturns] = useState(0);

  // A claim that failed, or that the server paid short because a sync had not
  // landed, leaves the tier owed and the effect's inputs unchanged. Coming
  // back online or to the tab is the retry.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") setReturns((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    if (!owed || !today || isOffline) return;
    const timer = setTimeout(() => void claim(today), CLAIM_DELAY_MS);
    return () => clearTimeout(timer);
  }, [owed, today, tier, isOffline, returns]);
}
