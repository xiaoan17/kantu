import { LayoutDashboard, Library, FileText, Sparkles, Settings } from 'lucide-react'
import type { PageKey } from '../App'

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
    <aside className="flex w-56 shrink-0 flex-col bg-slate-900 text-slate-300">
      <div className="px-5 py-6">
        <h1 className="text-lg font-bold text-white">交通期刊选刊</h1>
        <p className="mt-1 text-xs text-slate-400">Transport Journal Match</p>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => onNavigate(key)}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              page === key
                ? 'bg-slate-700/60 text-white'
                : 'hover:bg-slate-800 hover:text-white'
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
