import { NavLink, Outlet } from 'react-router'
import clsx from 'clsx'
import { useTheme } from '../lib/ui'

const TABS = [
  { to: '/', label: 'Today', icon: '◎' },
  { to: '/week', label: 'Week', icon: '▦' },
  { to: '/stats', label: 'Stats', icon: '▤' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
] as const

function tabClass({ isActive }: { isActive: boolean }) {
  return clsx(
    'flex flex-1 flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors',
    'sm:flex-none sm:flex-row sm:gap-2 sm:px-3 sm:py-2 sm:text-sm',
    isActive ? 'text-secondary bg-secondary-soft' : 'text-muted hover:text-ink',
  )
}

/**
 * Bottom tab bar on phones, a top bar on wider screens — the two places a thumb
 * and a cursor respectively expect to find navigation.
 */
export function AppShell() {
  useTheme()

  return (
    <div className="min-h-dvh bg-bg text-ink">
      <header className="sticky top-0 z-20 hidden border-b border-border bg-surface/85 backdrop-blur sm:block">
        <div className="mx-auto flex max-w-3xl items-center gap-1 px-4 py-2">
          <span className="mr-3 text-base font-semibold tracking-tight">OpenHabits</span>
          <nav className="flex flex-1 items-center gap-1">
            {TABS.map((tab) => (
              <NavLink key={tab.to} to={tab.to} end={tab.to === '/'} className={tabClass}>
                <span aria-hidden="true">{tab.icon}</span>
                {tab.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pt-4 pb-24 sm:pb-10">
        <Outlet />
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur sm:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Main"
      >
        <div className="flex items-stretch gap-0.5 px-1 py-1.5">
          {TABS.map((tab) => (
            <NavLink key={tab.to} to={tab.to} end={tab.to === '/'} className={tabClass}>
              <span aria-hidden="true" className="text-base leading-none">
                {tab.icon}
              </span>
              {tab.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
