import { useViewStore } from '../../state/viewStore'

/** Story view / Engineer view. The E key does the same. */
export function EngineerSwitch({ className = '' }: { className?: string }) {
  const on = useViewStore((s) => s.engineerView)
  const toggle = useViewStore((s) => s.toggleEngineerView)
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={toggle}
      title="Show every number and margin (key E)"
      className={`group inline-flex items-center gap-2 border border-rule px-2 py-1 hover:border-rule-strong ${className}`}
    >
      <span className={`relative h-3.5 w-6 border ${on ? 'border-kapton bg-kapton/20' : 'border-rule-strong'}`} aria-hidden="true">
        <span className={`absolute top-0.5 h-2 w-2 transition-[left] ${on ? 'left-3 bg-kapton' : 'left-0.5 bg-paper-faint'}`} />
      </span>
      <span className="fp-label text-[0.68rem]">Engineer view</span>
      <kbd className="fp-data text-[10px] text-paper-faint">E</kbd>
    </button>
  )
}
