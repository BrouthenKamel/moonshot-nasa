import type { ReactNode } from 'react'

export type StampVerdict = 'go' | 'caution' | 'nogo' | 'selected' | 'ice'

/** A rubber stamp. With animate it thunks down once when it mounts (or when its key changes). */
export function Stamp({
  verdict = 'go',
  size = 'md',
  animate = false,
  className = '',
  children,
}: {
  verdict?: StampVerdict
  size?: 'sm' | 'md' | 'lg'
  animate?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <span className={`fp-stamp ${className}`} data-verdict={verdict} data-size={size} data-animate={animate ? 'true' : undefined}>
      {children}
    </span>
  )
}
