import { useRef, useState } from 'react'
import clsx from 'clsx'
import { Link } from 'react-router'
import { AccountCard } from '../components/AccountCard'
import { downloadBackup, importBackup } from '../lib/backup'
import type { ImportMode, ImportReport } from '../lib/backup'
import { archiveHabit, moveHabit, resetEverything, updateSettings } from '../lib/repo'
import { activeHabits, archivedHabits, useAppState } from '../lib/store'
import { describeCadence } from '../lib/streaks'
import { applyTheme, habitStyle } from '../lib/ui'
import type { Settings as SettingsType } from '../lib/types'

function Row({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  label: string
}) {
  return (
    <div className="flex rounded-xl border border-border p-0.5" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={clsx(
            'rounded-[10px] px-2.5 py-1.5 text-xs font-medium transition-colors',
            value === option.value ? 'bg-accent text-white' : 'text-muted hover:text-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Settings() {
  const state = useAppState()
  const { settings } = state
  const fileInput = useRef<HTMLInputElement>(null)
  const [importMode, setImportMode] = useState<ImportMode>('merge')
  const [report, setReport] = useState<ImportReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState('')

  const active = activeHabits(state)
  const archived = archivedHabits(state)

  function setTheme(theme: SettingsType['theme']) {
    // Apply immediately as well as persisting: the pre-paint script reads the
    // mirrored localStorage value on the next load.
    applyTheme(theme)
    updateSettings({ theme })
  }

  async function handleFile(file: File) {
    setError(null)
    setReport(null)
    try {
      const parsed: unknown = JSON.parse(await file.text())
      setReport(await importBackup(parsed, importMode))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That file could not be read.')
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="text-xs text-muted">Everything is stored on this device.</p>
      </header>

      {/* Appearance and timing */}
      <section className="card divide-y divide-border px-4">
        <Row label="Theme">
          <Segmented
            label="Theme"
            value={settings.theme}
            onChange={setTheme}
            options={[
              { value: 'system', label: 'Auto' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </Row>

        <Row label="Week starts on">
          <Segmented
            label="Week starts on"
            value={settings.weekStart}
            onChange={(weekStart) => updateSettings({ weekStart })}
            options={[
              { value: 1, label: 'Mon' },
              { value: 0, label: 'Sun' },
            ]}
          />
        </Row>

        <Row
          label="Day rolls over at"
          hint={
            settings.rolloverHour === 0
              ? 'Midnight.'
              : `Before ${String(settings.rolloverHour).padStart(2, '0')}:00 still counts as the day before.`
          }
        >
          <select
            value={settings.rolloverHour}
            onChange={(e) => updateSettings({ rolloverHour: Number(e.target.value) })}
            aria-label="Day rollover hour"
            className="rounded-xl border border-border bg-bg px-3 py-2 text-sm"
          >
            {Array.from({ length: 24 }, (_, hour) => (
              <option key={hour} value={hour}>
                {String(hour).padStart(2, '0')}:00
              </option>
            ))}
          </select>
        </Row>
      </section>

      {/* Habits */}
      <section className="card p-4">
        <h2 className="text-sm font-semibold">Habits</h2>
        {active.length === 0 ? (
          <p className="mt-2 text-xs text-muted">
            None yet.{' '}
            <Link to="/" className="text-accent hover:underline">
              Add one
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {active.map((habit, i) => (
              <li key={habit.id} style={habitStyle(habit.color)} className="flex items-center gap-2 py-2">
                <span aria-hidden="true" className="text-lg">
                  {habit.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/habit?id=${encodeURIComponent(habit.id)}`}
                    className="block truncate text-sm hover:underline"
                  >
                    {habit.name}
                  </Link>
                  <p className="truncate text-[11px] text-muted">{describeCadence(habit)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => moveHabit(habit.id, -1)}
                  disabled={i === 0}
                  aria-label={`Move ${habit.name} up`}
                  className="size-8 rounded-lg border border-border text-muted disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveHabit(habit.id, 1)}
                  disabled={i === active.length - 1}
                  aria-label={`Move ${habit.name} down`}
                  className="size-8 rounded-lg border border-border text-muted disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => archiveHabit(habit.id, true)}
                  aria-label={`Archive ${habit.name}`}
                  className="rounded-lg border border-border px-2 py-1.5 text-[11px] text-muted hover:text-ink"
                >
                  Archive
                </button>
              </li>
            ))}
          </ul>
        )}

        {archived.length > 0 && (
          <>
            <h3 className="mt-4 text-xs font-semibold text-muted">
              Archived · {archived.length}
            </h3>
            <ul className="mt-1 divide-y divide-border">
              {archived.map((habit) => (
                <li key={habit.id} className="flex items-center gap-2 py-2 opacity-70">
                  <span aria-hidden="true">{habit.emoji}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{habit.name}</span>
                  <button
                    type="button"
                    onClick={() => archiveHabit(habit.id, false)}
                    className="rounded-lg border border-border px-2 py-1.5 text-[11px] text-muted hover:text-ink"
                  >
                    Restore
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-faint">
              Archived habits keep their history and still appear in your stats — they just stop
              asking for attention on Today.
            </p>
          </>
        )}
      </section>

      <AccountCard />

      {/* Reminders */}
      <section className="card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Reminders</h2>
            <p className="mt-0.5 text-xs text-muted">
              A morning plan and an evening nudge for anything still outstanding.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-raised px-2 py-0.5 text-[10px] font-semibold text-muted">
            Off
          </span>
        </div>
        <div className="mt-3 flex gap-2">
          <label className="flex-1 text-xs text-muted">
            Morning
            <input
              type="time"
              value={settings.reminders.morning}
              onChange={(e) =>
                updateSettings({ reminders: { ...settings.reminders, morning: e.target.value } })
              }
              className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-ink"
            />
          </label>
          <label className="flex-1 text-xs text-muted">
            Evening
            <input
              type="time"
              value={settings.reminders.evening}
              onChange={(e) =>
                updateSettings({ reminders: { ...settings.reminders, evening: e.target.value } })
              }
              className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-ink"
            />
          </label>
        </div>
        <p className="mt-2 text-[11px] text-faint">
          Saved for when push reminders arrive. They need an account, so they are off for now.
        </p>
      </section>

      {/* Backup */}
      <section className="card p-4">
        <h2 className="text-sm font-semibold">Backup</h2>
        <p className="mt-0.5 text-xs text-muted">
          One JSON file with every habit, tick and saved quote.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={downloadBackup}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white"
          >
            Export
          </button>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted hover:text-ink"
          >
            Import
          </button>
          <Segmented
            label="Import mode"
            value={importMode}
            onChange={setImportMode}
            options={[
              { value: 'merge', label: 'Merge' },
              { value: 'replace', label: 'Replace' },
            ]}
          />
        </div>

        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void handleFile(file)
            event.target.value = ''
          }}
        />

        <p className="mt-2 text-[11px] text-faint">
          {importMode === 'merge'
            ? 'Merge keeps whichever copy of each record is newer, so importing the same file twice changes nothing.'
            : 'Replace deletes everything on this device first. There is no undo.'}
        </p>

        {report && (
          <p className="mt-2 rounded-xl bg-accent-soft px-3 py-2 text-xs text-accent">
            Imported a format-{report.sourceVersion} backup in {report.mode} mode:{' '}
            {report.habits} habits, {report.entries} entries, {report.savedQuotes} saved quotes
            applied
            {report.skipped > 0 && `, ${report.skipped} already up to date`}.
          </p>
        )}
        {error && (
          <p className="mt-2 rounded-xl px-3 py-2 text-xs text-danger" style={{ background: 'color-mix(in oklab, var(--danger) 12%, transparent)' }}>
            {error}
          </p>
        )}
      </section>

      {/* Reset */}
      <section
        className="card p-4"
        style={{ borderColor: 'color-mix(in oklab, var(--danger) 30%, var(--border))' }}
      >
        <h2 className="text-sm font-semibold text-danger">Reset everything</h2>
        <p className="mt-0.5 text-xs text-muted">
          Deletes every habit, tick and saved quote on this device. Export first if you want them
          back.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={confirmReset}
            onChange={(e) => setConfirmReset(e.target.value)}
            placeholder="Type DELETE"
            aria-label="Type DELETE to confirm"
            className="w-36 rounded-xl border border-border bg-bg px-3 py-2 text-sm outline-none placeholder:text-faint"
          />
          <button
            type="button"
            disabled={confirmReset !== 'DELETE'}
            onClick={() => {
              void resetEverything()
              setConfirmReset('')
              setReport(null)
            }}
            className="rounded-xl px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-35"
            style={{ background: 'var(--danger)' }}
          >
            Delete everything
          </button>
        </div>
      </section>

      <p className="px-1 pb-2 text-center text-[11px] text-faint">
        OpenHabits · offline-first · device {state.meta.deviceId.slice(0, 8)}
      </p>
    </div>
  )
}
