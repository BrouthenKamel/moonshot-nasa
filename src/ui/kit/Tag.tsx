import type { ReactNode } from 'react'

export type TagTone = 'neutral' | 'kapton' | 'go' | 'caution' | 'nogo' | 'ice'

/** An inventory tag: clipped corner, punch hole, one word or two. */
export function Tag({ tone = 'neutral', children, className = '', title }: { tone?: TagTone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span className={`fp-tag ${className}`} data-tone={tone} title={title}>
      {children}
    </span>
  )
}
