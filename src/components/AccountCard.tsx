import { syncStatus } from '../lib/sync'

/**
 * Account and sync.
 *
 * With no server configured this is not an error and not a dead button — it is a
 * feature that is simply off, and it says so. The rule for every server-backed
 * feature in OpenHabits is that its absence degrades to "off", because the app is
 * complete without it: your habits are already saved, on this device, right now.
 */
export function AccountCard() {
  const status = syncStatus()

  return (
    <section className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Account &amp; sync</h2>
          <p className="mt-0.5 text-xs text-muted">
            {status.available
              ? 'Sign in to keep this device in step with your others.'
              : 'Sync is off. Everything is saved on this device.'}
          </p>
        </div>
        <span
          className={
            status.available
              ? 'shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent'
              : 'shrink-0 rounded-full bg-raised px-2 py-0.5 text-[10px] font-semibold text-muted'
          }
        >
          {status.available ? 'Available' : 'Off'}
        </span>
      </div>

      <button
        type="button"
        disabled={!status.available}
        className="mt-3 w-full rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        Sign in
      </button>

      <p className="mt-2 text-[11px] text-faint">
        {status.reason} Use Export below to move your habits to another device in the meantime.
      </p>
    </section>
  )
}
