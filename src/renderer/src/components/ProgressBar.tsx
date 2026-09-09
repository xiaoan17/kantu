interface ProgressBarProps {
  value: number
  max: number
}

function ProgressBar({ value, max }: ProgressBarProps): React.JSX.Element {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
      <div
        className="h-full rounded-full bg-blue-500 transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export default ProgressBar
