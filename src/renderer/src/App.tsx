import { useEffect, useState } from 'react'
import Sidebar from './components/Sidebar'
import DashboardPage from './pages/DashboardPage'
import JournalsPage from './pages/JournalsPage'
import PapersPage from './pages/PapersPage'
import RecommendPage from './pages/RecommendPage'
import SettingsPage from './pages/SettingsPage'
import { applyTheme } from './themes'

export type PageKey = 'dashboard' | 'journals' | 'papers' | 'recommend' | 'settings'

const PAGES: Record<PageKey, () => React.JSX.Element> = {
  dashboard: DashboardPage,
  journals: JournalsPage,
  papers: PapersPage,
  recommend: RecommendPage,
  settings: SettingsPage
}

function App(): React.JSX.Element {
  const [page, setPage] = useState<PageKey>('dashboard')
  const Page = PAGES[page]

  useEffect(() => {
    window.tjm.getSettings().then((s) => applyTheme(s.theme))
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-base text-body">
      <Sidebar page={page} onNavigate={setPage} />
      <main className="flex-1 overflow-y-auto p-8">
        <Page />
      </main>
    </div>
  )
}

export default App
