/** Small line icons for the base screen (no emoji, one consistent style) */
type IconName =
  | 'pause'
  | 'play'
  | 'fast'
  | 'skip'
  | 'coins'
  | 'people'
  | 'log'
  | 'list'
  | 'close'
  | 'moon'
  | 'check'
  | 'lock'
  | 'dot'
  | 'alert'

const paths: Record<IconName, React.ReactNode> = {
  pause: (
    <>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </>
  ),
  play: <path d="M8 5.5v13l10-6.5z" />,
  fast: (
    <>
      <path d="M4 6v12l8-6z" />
      <path d="M12 6v12l8-6z" />
    </>
  ),
  skip: (
    <>
      <path d="M5 6v12l8-6z" />
      <rect x="15" y="6" width="3" height="12" rx="1" />
    </>
  ),
  coins: (
    <>
      <ellipse cx="12" cy="7" rx="7" ry="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" fill="none" stroke="currentColor" strokeWidth="2" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 19c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5z" />
      <circle cx="17" cy="9" r="2.5" opacity=".7" />
      <path d="M16.5 13.6c2.6.2 4.5 1.9 5 5.4h-4.3c-.2-2.1-.4-3.7-.7-5.4z" opacity=".7" />
    </>
  ),
  log: (
    <path d="M5 6h14M5 12h14M5 18h9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  ),
  list: (
    <>
      <rect x="4" y="4" width="16" height="5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="4" y="12" width="16" height="5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />,
  moon: <path d="M15.5 3.5a8.5 8.5 0 1 0 5 13.7 7 7 0 1 1-5-13.7z" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />,
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
    </>
  ),
  dot: <circle cx="12" cy="12" r="5" />,
  alert: (
    <>
      <path d="M12 3l10 18H2z" />
      <rect x="11" y="9" width="2" height="6" rx="1" fill="white" />
      <rect x="11" y="16.5" width="2" height="2" rx="1" fill="white" />
    </>
  ),
}

export function Icon({ name, className = 'h-4 w-4' }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      {paths[name]}
    </svg>
  )
}
