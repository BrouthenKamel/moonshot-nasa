import type { ElementType, ReactNode } from 'react'

/** A matte flight-plan sheet with corner registration marks. Replaces the old glowing HUD panel. */
export function Sheet({
  tone = 'raised',
  as: Tag = 'div',
  className = '',
  children,
  ...rest
}: {
  tone?: 'flat' | 'raised' | 'inset'
  as?: ElementType
  className?: string
  children?: ReactNode
} & Record<string, unknown>) {
  return (
    <Tag className={`fp-sheet ${className}`} data-tone={tone} {...rest}>
      {children}
    </Tag>
  )
}
