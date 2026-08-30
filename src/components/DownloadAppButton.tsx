import { useEffect, useState } from 'react'

/**
 * The install prompt.
 *
 * Only Chromium fires `beforeinstallprompt`, and only it can show a real install
 * dialog. Everywhere else the browser hides installation behind a menu the user
 * has to find, so the honest thing is a sheet that says exactly where it is in
 * *their* browser — a generic "install this app" button that does nothing when
 * tapped is worse than no button.
 *
 * The whole thing hides once the app is running standalone, since by then it is
 * already installed.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type Platform = 'chromium' | 'ios' | 'safari-mac' | 'firefox' | 'other'

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent
  const iOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  if (iOS) return 'ios'
  if (/Firefox\//.test(ua)) return 'firefox'
  if (/Chrome\/|Chromium\/|Edg\//.test(ua)) return 'chromium'
  if (/Safari\//.test(ua)) return 'safari-mac'
  return 'other'
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari predates the standard and still reports it here.
    (navigator as { standalone?: boolean }).standalone === true
  )
}

const INSTRUCTIONS: Record<Platform, { title: string; steps: string[] }> = {
  chromium: {
    title: 'Install OpenHabits',
    steps: [
      'Open the browser menu (⋮).',
      'Choose "Install OpenHabits" — or tap the install icon in the address bar.',
    ],
  },
  ios: {
    title: 'Add to your Home Screen',
    steps: [
      'Tap the Share button at the bottom of Safari.',
      'Scroll down and tap "Add to Home Screen".',
      'Tap Add. OpenHabits then opens full-screen and works offline.',
    ],
  },
  'safari-mac': {
    title: 'Add to your Dock',
    steps: ['Open the File menu in Safari.', 'Choose "Add to Dock".'],
  },
  firefox: {
    title: 'Install OpenHabits',
    steps: [
      'Firefox does not install web apps on the desktop.',
      'On Android: open the menu (⋮) and tap "Install".',
      'Otherwise, bookmark this page — it still works offline.',
    ],
  },
  other: {
    title: 'Install OpenHabits',
    steps: [
      'Look for "Install app" or "Add to Home Screen" in your browser menu.',
      'OpenHabits works offline either way.',
    ],
  },
}

export function DownloadAppButton() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  // Both are read from the browser once, on the first client render. Lazy
  // initialisers rather than an effect: this is state derived from the
  // environment, not state synchronised with it, and both helpers already
  // return a safe answer when there is no `window` to ask.
  const [platform] = useState<Platform>(detectPlatform)
  const [installed, setInstalled] = useState<boolean>(isStandalone)
  const [sheetOpen, setSheetOpen] = useState(false)

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      // Suppress the mini-infobar so the button below is the only prompt.
      event.preventDefault()
      setPrompt(event as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setSheetOpen(false)
      setPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (installed) return null

  async function handleClick() {
    if (prompt) {
      await prompt.prompt()
      const { outcome } = await prompt.userChoice
      // The event is single-use; a dismissal means we fall back to the sheet.
      setPrompt(null)
      if (outcome === 'accepted') setInstalled(true)
      return
    }
    setSheetOpen(true)
  }

  const guide = INSTRUCTIONS[platform]

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-medium transition-colors hover:bg-raised"
      >
        <span aria-hidden="true">⬇</span>
        Install as an app
      </button>

      {sheetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={guide.title}
          onClick={() => setSheetOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl border border-border bg-surface p-5 sm:rounded-2xl"
            style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-base font-semibold">{guide.title}</h2>
            <ol className="mt-3 space-y-2 text-sm text-muted">
              {guide.steps.map((step, i) => (
                <li key={step} className="flex gap-2.5">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-raised text-[11px] font-semibold text-ink">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-faint">
              Your habits are stored on this device either way — installing just gives it its own
              icon and a full-screen window.
            </p>
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="mt-4 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  )
}
