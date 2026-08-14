"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Heatmap, HeatmapLegend } from "@/components/heatmap";
import { describeCadence, HabitForm } from "@/components/habit-form";
import { habitColor } from "@/lib/colors";
import { addDays, formatDayFull, startOfWeek } from "@/lib/dates";
import { buildHabitHistory } from "@/lib/history";
import { deleteHabit, toggleEntry, updateHabit, useHapi } from "@/lib/store";
import { computeStreaks } from "@/lib/streaks";
import { useMediaQuery, WIDE } from "@/lib/use-media-query";
import { useToday } from "@/lib/use-today";
import type { DayKey } from "@/lib/types";

const FULL_YEAR_WEEKS = 53;
const COMPACT_WEEKS = 20;

export function HabitDetail() {
  const id = useSearchParams().get("id");
  const router = useRouter();
  const { hydrated, habits, entries, settings } = useHapi();
  const today = useToday(settings.dayStartHour);
  const wide = useMediaQuery(WIDE);

  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<DayKey | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const habit = habits.find((h) => h.id === id);
  const weeks = wide || expanded ? FULL_YEAR_WEEKS : COMPACT_WEEKS;

  const view = useMemo(() => {
    if (!habit || !today) return null;

    const lastWeekStart = startOfWeek(today, settings.weekStartsOn);
    const from = addDays(lastWeekStart, -(weeks - 1) * 7);
    const stats = buildHabitHistory(
      habit,
      entries,
      from,
      addDays(lastWeekStart, 6),
      settings.weekStartsOn,
    );

    const past = stats.filter((s) => s.date <= today);
    const scheduled = past.filter((s) => s.scheduled > 0);

    return {
      stats,
      streaks: computeStreaks(past),
      scheduledDays: scheduled.length,
      completedDays: scheduled.filter((s) => s.completed > 0).length,
    };
  }, [habit, entries, settings, today, weeks]);

  if (!hydrated || !today) return <Skeleton />;

  if (!habit) {
    return (
      <section className="space-y-4">
        <p className="rounded-card border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted">
          That habit no longer exists.
        </p>
        <Link href="/settings" className="block text-center text-[13px] text-accent">
          Back to settings
        </Link>
      </section>
    );
  }

  const accent = habitColor(habit.color);
  const archived = habit.archivedAt !== null;
  const rate =
    view && view.scheduledDays > 0 ? view.completedDays / view.scheduledDays : 0;

  return (
    <section className="space-y-6">
      <div>
        <Link
          href="/settings"
          className="text-[12px] text-muted transition-colors hover:text-foreground"
        >
          ← Habits
        </Link>

        <div className="mt-2 flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-card text-xl"
            style={{ background: `color-mix(in oklab, ${accent} 18%, transparent)` }}
          >
            {habit.emoji}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-[17px] font-semibold tracking-tight">
              {habit.name}
            </h1>
            <p className="text-[12px] text-muted">
              {describeCadence(habit.cadence, habit.target, settings.weekStartsOn)}
              {archived && " · archived"}
            </p>
          </div>
        </div>
      </div>

      {archived && (
        <p className="rounded-card border border-border bg-surface-2 px-4 py-3 text-[12px] leading-relaxed text-muted">
          This habit is archived. Its history is kept and still shows here, but it
          no longer appears on Today or in your streaks.
        </p>
      )}

      {view && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Current" value={view.streaks.current} unit="day streak" />
            <Stat label="Longest" value={view.streaks.longest} unit="days" />
            <Stat label="Done" value={view.completedDays} unit={`of ${view.scheduledDays}`} />
          </div>

          <p className="text-[13px] leading-relaxed text-muted">
            You completed this{" "}
            <strong className="font-medium text-foreground">
              {Math.round(rate * 100)}%
            </strong>{" "}
            of the {view.scheduledDays} {view.scheduledDays === 1 ? "day" : "days"} it
            was scheduled in this window.
          </p>

          <div className="rounded-card border border-border bg-surface p-4">
            <Heatmap
              stats={view.stats}
              weekStartsOn={settings.weekStartsOn}
              today={today}
              selected={selected}
              onSelect={setSelected}
              ramp={habit.color}
              label={`${habit.name} by day`}
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              {!wide ? (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="text-[12px] font-medium text-accent"
                >
                  {expanded ? "Show less" : "Show full year"}
                </button>
              ) : (
                <span />
              )}
              <HeatmapLegend ramp={habit.color} />
            </div>

            {selected && (
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
                <p className="min-w-0 text-[13px]">
                  <span className="block truncate font-medium">
                    {formatDayFull(selected)}
                  </span>
                  <span className="text-[12px] text-muted">
                    {countLabel(entries.get(`${habit.id}:${selected}`)?.count ?? 0, habit.target)}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => toggleEntry(habit.id, selected)}
                  disabled={selected > today}
                  className="h-10 shrink-0 rounded-control border border-border px-3 text-[13px] font-medium disabled:opacity-30"
                >
                  {habit.target > 1 ? "Add one" : "Toggle"}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {editing ? (
        <HabitForm
          initial={habit}
          submitLabel="Save changes"
          onCancel={() => setEditing(false)}
          onSubmit={(values) => {
            updateHabit(habit.id, values);
            setEditing(false);
          }}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          <Action onClick={() => setEditing(true)}>Edit habit</Action>
          <Action
            onClick={() =>
              updateHabit(habit.id, { archivedAt: archived ? null : today })
            }
          >
            {archived ? "Unarchive" : "Archive"}
          </Action>
          {confirmDelete ? (
            <>
              <Action
                danger
                onClick={() => {
                  deleteHabit(habit.id);
                  router.push("/settings");
                }}
              >
                Delete forever
              </Action>
              <Action onClick={() => setConfirmDelete(false)}>Cancel</Action>
            </>
          ) : (
            <Action danger onClick={() => setConfirmDelete(true)}>
              Delete
            </Action>
          )}
        </div>
      )}

      {!editing && (
        <p className="pb-2 text-[11px] leading-relaxed text-muted">
          Archiving keeps the history and stops the habit appearing on Today.
          Deleting removes the habit and every entry it ever had, and cannot be
          undone.
        </p>
      )}
    </section>
  );
}

function countLabel(count: number, target: number): string {
  if (target > 1) return `${count} of ${target} done`;
  return count > 0 ? "Done" : "Not done";
}

function Stat({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="rounded-card border border-border bg-surface px-3 py-3 text-center">
      <p className="font-mono text-[22px] font-semibold tabular-nums leading-none">
        {value}
      </p>
      <p className="mt-1 text-[10px] uppercase tracking-[0.06em] text-muted">{label}</p>
      <p className="text-[10px] text-muted/70">{unit}</p>
    </div>
  );
}

function Action({
  onClick,
  danger,
  children,
}: {
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-10 rounded-control border px-3 text-[13px] font-medium transition-colors ${
        danger
          ? "border-danger text-danger hover:bg-danger hover:text-surface"
          : "border-border text-foreground hover:bg-surface-2"
      }`}
    >
      {children}
    </button>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="h-4 w-20 rounded bg-surface-2" />
      <div className="h-11 w-2/3 rounded bg-surface-2" />
      <div className="h-20 rounded-card bg-surface-2" />
      <div className="h-48 rounded-card bg-surface-2" />
    </div>
  );
}
