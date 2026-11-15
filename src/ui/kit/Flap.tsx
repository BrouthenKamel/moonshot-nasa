/** A value that rolls like a split-flap board when it changes. One text node, so the string stays searchable. */
export function Flap({ value, className = '' }: { value: string | number; className?: string }) {
  const v = String(value)
  return (
    <span key={v} className={`fp-flap fp-data ${className}`}>
      {v}
    </span>
  )
}
