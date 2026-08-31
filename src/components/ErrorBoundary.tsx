import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { downloadBackup } from '../lib/backup'

interface Props {
  children: ReactNode
  /** Shown instead of the default copy when a specific screen fails. */
  where?: string
}

interface State {
  error: Error | null
}

/**
 * The last line of defence between a render error and someone's data.
 *
 * The failure this exists for is specific: React unmounts the whole tree when a
 * render throws, so without a boundary one bad component is a blank white page.
 * On a device-only app that is the worst possible screen — the habits are still
 * sitting safely in IndexedDB, and the person looking at the blank page has no
 * way to reach them, no way to export, and every reason to assume they are gone.
 *
 * So the fallback's job is not to apologise. It is to keep the two doors open:
 * export what is on the device, and get back to a working screen.
 *
 * Class syntax because this is the one thing hooks still cannot do.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Nothing is sent anywhere — there is no server and no telemetry in this
    // app. The console is for whoever is standing in front of the device.
    console.error('OpenHabits hit a render error', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <section className="card mx-auto my-6 max-w-md p-5 text-center" role="alert">
        <h1 className="text-lg font-semibold text-danger">
          {this.props.where ?? 'This screen'} stopped working
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
          Your habits are safe — they are stored on this device and nothing here touched them.
          Export a copy if you want one to hand, then reload.
        </p>

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={downloadBackup}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-dark"
          >
            Export my data
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-ink"
          >
            Reload
          </button>
        </div>

        <p className="mt-3 text-[11px] text-faint">{error.message}</p>
      </section>
    )
  }
}
