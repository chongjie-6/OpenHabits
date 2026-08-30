import { Route, Routes } from 'react-router'
import { AppShell } from './components/AppShell'
import { HabitDetail } from './routes/HabitDetail'
import { Quotes } from './routes/Quotes'
import { Settings } from './routes/Settings'
import { Stats } from './routes/Stats'
import { Today } from './routes/Today'
import { Week } from './routes/Week'

/**
 * The router. The list of routes that get prerendered lives in `route-list.ts`,
 * which the build script reads too — see the note there.
 */
export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Today />} />
        <Route path="week" element={<Week />} />
        <Route path="stats" element={<Stats />} />
        <Route path="quotes" element={<Quotes />} />
        <Route path="settings" element={<Settings />} />
        <Route path="habit" element={<HabitDetail />} />
        <Route path="*" element={<Today />} />
      </Route>
    </Routes>
  )
}
