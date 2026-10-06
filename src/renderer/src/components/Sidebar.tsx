import { LayoutDashboard, Library, FileText, Sparkles, Settings } from 'lucide-react'
import type { PageKey } from '../App'
import logo from '../assets/icon.png'

const NAV_ITEMS: { key: PageKey; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'dashboard', label: '仪表盘', icon: LayoutDashboard },
  { key: 'journals', label: '期刊管理', icon: Library },
  { key: 'papers', label: '论文库', icon: FileText },
  { key: 'recommend', label: '选刊推荐', icon: Sparkles },
  { key: 'settings', label: '设置', icon: Settings }
]

interface SidebarProps {
  page: PageKey
  onNavigate: (page: PageKey) => void
}

function Sidebar({ page, onNavigate }: SidebarProps): React.JSX.Element {
  return (
    <aside className="flex w-56 shrink-0 flex-col bg-sidebar text-sidebar-text">
      <div className="flex items-center gap-3 px-5 py-6">
        <img src={logo} alt="应用图标" className="h-10 w-10 rounded-xl" />
        <div>
          <h1 className="text-base font-bold text-white">交通期刊选刊</h1>
          <p className="mt-0.5 text-xs text-sidebar-muted">Transport Journal Match</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => onNavigate(key)}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              page === key
                ? 'bg-sidebar-active text-white'
                : 'hover:bg-sidebar-hover hover:text-white'
            }`}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </nav>
    </aside>
  )
}

export default Sidebar
