import { Loader2 } from 'lucide-react'

function Spinner({ text }: { text?: string }): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 text-slate-500">
      <Loader2 size={18} className="animate-spin" />
      {text && <span className="text-sm">{text}</span>}
    </div>
  )
}

export default Spinner
