"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { InstallHint } from "@/components/install-hint";
import { habitColor } from "@/lib/colors";
import { QUOTE_COUNT } from "@/lib/quotes";
import {
  exportBundle,
  importBundle,
  moveHabit,
  resetEverything,
  updateSettings,
  useHapi,
} from "@/lib/store";
import type { ExportBundle, Habit, Settings } from "@/lib/types";

export default function SettingsPage() {
  const { hydrated, habits, settings } = useHapi();
  const fileInput = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  function download() {
    const bundle = exportBundle();
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `hapi-backup-${bundle.exportedAt.slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice("Backup downloaded.");
  }

  async function upload(file: File) {
    try {
      const bundle = JSON.parse(await file.text()) as ExportBundle;
      importBundle(bundle, "merge");
      setNotice(
        `Merged ${bundle.habits.length} habits and ${bundle.entries.length} entries.`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? `Import failed: ${error.message}` : "Import failed.");
    }
  }

  if (!hydrated) return <Skeleton />;

  const active = habits.filter((h) => h.archivedAt === null);
  const archived = habits.filter((h) => h.archivedAt !== null);

  return (
    <section className="space-y-6">
      <h1 className="text-[15px] font-semibold tracking-tight">Settings</h1>

      <InstallHint />

      <Group title="Appearance">
        <Choice<Settings["theme"]>
          label="Theme"
          value={settings.theme}
          options={[
            { value: "system", label: "System" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
          onChange={(theme) => updateSettings({ theme })}
        />
      </Group>

      <Group title="Your week">
        <Choice<Settings["weekStartsOn"]>
          label="Week starts on"
          value={settings.weekStartsOn}
          options={[
            { value: 1, label: "Monday" },
            { value: 0, label: "Sunday" },
          ]}
          onChange={(weekStartsOn) => updateSettings({ weekStartsOn })}
        />
        <Choice<number>
          label="Day rolls over at"
          hint="For night owls — anything before this hour still counts as yesterday."
          value={settings.dayStartHour}
          options={[
            { value: 0, label: "Midnight" },
            { value: 3, label: "3am" },
            { value: 4, label: "4am" },
            { value: 5, label: "5am" },
          ]}
          onChange={(dayStartHour) => updateSettings({ dayStartHour })}
        />
      </Group>

      {active.length > 0 && (
        <Group title="Habits">
          <ul className="divide-y divide-border">
            {active.map((habit, index) => (
              <li key={habit.id} className="flex items-center gap-1 py-1">
                <HabitLink habit={habit} />
                <IconButton
                  label={`Move ${habit.name} up`}
                  disabled={index === 0}
                  onClick={() => moveHabit(habit.id, -1)}
                >
                  ↑
                </IconButton>
                <IconButton
                  label={`Move ${habit.name} down`}
                  disabled={index === active.length - 1}
                  onClick={() => moveHabit(habit.id, 1)}
                >
                  ↓
                </IconButton>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            Open a habit to rename it, change how often it runs, archive it, or
            delete it.
          </p>
        </Group>
      )}

      {archived.length > 0 && (
        <Group title="Archived">
          <ul className="divide-y divide-border">
            {archived.map((habit) => (
              <li key={habit.id} className="py-1 opacity-60">
                <HabitLink habit={habit} />
              </li>
            ))}
          </ul>
        </Group>
      )}

      <Group title="Your data">
        <p className="text-[13px] leading-relaxed text-muted">
          Everything lives on this device. Nothing is uploaded, and there is no
          account. That also means a browser clearing its storage takes your
          history with it — export a backup now and then.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={download}>Export backup</Button>
          <Button onClick={() => fileInput.current?.click()}>Import backup</Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.target.value = "";
            }}
          />
        </div>
        {notice && (
          <p role="status" className="mt-3 text-[12px] text-accent">
            {notice}
          </p>
        )}
      </Group>

      <Group title="Reminders">
        <p className="text-[13px] leading-relaxed text-muted">
          There are none yet, and that is deliberate. The web cannot reliably
          schedule a local notification — a service worker has no way to wake
          itself on a timer — so a &ldquo;remind me at 8:00&rdquo; toggle here
          would silently do nothing. Real push reminders need a server. Until
          then, the Today tab shows what is still outstanding the moment you
          open it.
        </p>
      </Group>

      <Group title="Danger zone">
        {confirmReset ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[13px] text-danger">Delete every habit and all history?</p>
            <Button
              danger
              onClick={() => {
                resetEverything();
                setConfirmReset(false);
                setNotice("Everything deleted.");
              }}
            >
              Yes, delete it all
            </Button>
            <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
          </div>
        ) : (
          <Button danger onClick={() => setConfirmReset(true)}>
            Delete all data
          </Button>
        )}
      </Group>

      <p className="pb-4 text-center text-[11px] text-muted">
        hapi · {QUOTE_COUNT} quotes in the deck · {settings.favourites.length} saved
      </p>
    </section>
  );
}

function HabitLink({ habit }: { habit: Habit }) {
  return (
    <Link
      href={`/habit?id=${habit.id}`}
      className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-control px-1 transition-colors hover:bg-surface-2"
    >
      <span
        aria-hidden="true"
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: habitColor(habit.color) }}
      />
      <span aria-hidden="true">{habit.emoji}</span>
      <span className="min-w-0 flex-1 truncate text-[14px]">{habit.name}</span>
      <span aria-hidden="true" className="shrink-0 text-muted">
        ›
      </span>
    </Link>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Choice<T extends string | number>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="mb-4 last:mb-0">
      <legend className="text-[13px] font-medium">{label}</legend>
      {hint && <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{hint}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
            className={`h-9 rounded-control border px-3 text-[13px] transition-colors ${
              option.value === value
                ? "border-accent bg-accent text-accent-fg"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Button({
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

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-border text-[13px] disabled:opacity-25 ${
        danger ? "text-danger" : "text-muted"
      }`}
    >
      {children}
    </button>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="h-4 w-24 rounded bg-surface-2" />
      <div className="h-32 rounded-card bg-surface-2" />
      <div className="h-32 rounded-card bg-surface-2" />
    </div>
  );
}
