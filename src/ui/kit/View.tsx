import type { ElementType, ReactNode } from 'react'

/**
 * Engineer-only content. Always rendered (tests and screen readers keep it);
 * CSS hides it in Story view. Toggle with E or the header switch.
 */
export function Eng({ as: Tag = 'span', className = '', children }: { as?: ElementType; className?: string; children?: ReactNode }) {
  return <Tag className={`eng-only ${className}`}>{children}</Tag>
}

/** Story-only content: the plain-word version, hidden in Engineer view */
export function Story({ as: Tag = 'span', className = '', children }: { as?: ElementType; className?: string; children?: ReactNode }) {
  return <Tag className={`story-only ${className}`}>{children}</Tag>
}
