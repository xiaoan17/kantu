import type { JournalMeta } from '../../../shared/contract'

const STATUS_STYLE: Record<JournalMeta['fetchStatus'], { label: string; className: string }> = {
  pending: { label: '待抓取', className: 'bg-slate-100 text-slate-600' },
  fetching: { label: '抓取中', className: 'bg-blue-100 text-blue-700' },
  done: { label: '已完成', className: 'bg-green-100 text-green-700' },
  error: { label: '失败', className: 'bg-red-100 text-red-700' }
}

function StatusBadge({ status }: { status: JournalMeta['fetchStatus'] }): React.JSX.Element {
  const s = STATUS_STYLE[status]
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${s.className}`}>
      {s.label}
    </span>
  )
}

export default StatusBadge
