/**
 * The routes that get their own prerendered HTML file.
 *
 * Kept in its own module with a single job: `App.tsx` mounts them, the prerender
 * script writes them, and `screens.test.tsx` walks them. One list, so a screen
 * cannot be added to the router and quietly left out of the build.
 *
 * `/habit` is here without an id because the id lives in the query string — the
 * static file is the same for every habit, and the client fills in which one.
 */
export const ROUTES = ['/', '/week', '/stats', '/settings', '/habit'] as const

export type AppRoute = (typeof ROUTES)[number]
